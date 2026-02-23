import type { PaginationOptions } from "convex/server";
import { SCHEDULING_ERROR_CODES } from "../../shared/schedulingErrorCodes";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  combineLocalDateMinuteToUtcMs,
  extractLocalDateMinuteForUtcMs,
  formatClinicLabel24hWithTz,
  MS_PER_MINUTE,
  parseDateLocal,
} from "../lib/dateUtils";
import { schedulingError } from "../lib/schedulingError";
import {
  filterByLeadTimeAndHorizon,
  generateCandidateStartsForDate,
  isOverlapping,
} from "../lib/slotEngine";
import { logger } from "../observability/logging";
import { rateLimiter } from "../rateLimiter";
import {
  assertClinicOwner,
  getClinicByIdOrThrow,
  getClinicBySlugOrThrow,
} from "./clinics";
import { getProviderByIdOrThrow, getProviderByNameOrThrow } from "./providers";

type AvailabilitySlotRow = {
  startAtUtcMs: number;
  endAtUtcMs: number;
  label: string;
};

type SchedulingInputs = {
  policy: Doc<"clinicBookingPolicies">;
  weeklyWindows: Array<Doc<"providerWeeklySchedules">>;
};

function assertInteger(value: number, field: string) {
  if (!Number.isInteger(value)) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, { field });
  }
}

function assertPositiveInteger(value: number, field: string) {
  assertInteger(value, field);
  if (value <= 0) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, { field });
  }
}

function assertNonNegativeInteger(value: number, field: string) {
  assertInteger(value, field);
  if (value < 0) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, { field });
  }
}

function requireNonEmpty(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, { field });
  }
  return trimmed;
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    schedulingError(SCHEDULING_ERROR_CODES.AUTH_REQUIRED);
  }
  return identity;
}

async function getSchedulingInputsOrThrow(
  ctx: QueryCtx | MutationCtx,
  clinicId: Id<"clinics">,
  providerId: Id<"providers">,
): Promise<SchedulingInputs> {
  const policy = await ctx.db
    .query("clinicBookingPolicies")
    .withIndex("by_clinicId", (q) => q.eq("clinicId", clinicId))
    .unique();

  if (!policy) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  const weeklyWindows = await ctx.db
    .query("providerWeeklySchedules")
    .withIndex("by_providerId_and_dayOfWeek", (q) =>
      q.eq("providerId", providerId),
    )
    .collect();

  return {
    policy,
    weeklyWindows,
  };
}

export async function loadScheduledConflicts(
  ctx: QueryCtx | MutationCtx,
  args: {
    providerId: Id<"providers">;
    rangeStartUtcMs: number;
    rangeEndUtcMs: number;
    excludeAppointmentId?: Id<"appointments">;
  },
) {
  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_providerId_and_startAtUtcMs", (q) =>
      q
        .eq("providerId", args.providerId)
        .gte("startAtUtcMs", args.rangeStartUtcMs)
        .lte("startAtUtcMs", args.rangeEndUtcMs),
    )
    .collect();

  return appointments.filter(
    (appointment) =>
      appointment.status === "scheduled" &&
      appointment._id !== args.excludeAppointmentId,
  );
}

function sanitizeAvailabilityLimit(limit: number | undefined) {
  const resolved = limit ?? 10;
  assertPositiveInteger(resolved, "limit");
  return Math.min(resolved, 50);
}

function validateAppointmentRangeOrThrow(args: {
  rangeStartUtcMs: number;
  rangeEndUtcMs: number;
}) {
  assertNonNegativeInteger(args.rangeStartUtcMs, "rangeStartUtcMs");
  assertNonNegativeInteger(args.rangeEndUtcMs, "rangeEndUtcMs");
  if (args.rangeEndUtcMs <= args.rangeStartUtcMs) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, {
      field: "rangeEndUtcMs",
    });
  }
}

function validateDateLocalOrThrow(dateLocal: string) {
  const normalizedDateLocal = requireNonEmpty(dateLocal, "dateLocal");
  if (!parseDateLocal(normalizedDateLocal)) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, {
      field: "dateLocal",
    });
  }
  return normalizedDateLocal;
}

async function listAvailableStartsForDate(
  ctx: QueryCtx | MutationCtx,
  args: {
    clinic: Doc<"clinics">;
    provider: Doc<"providers">;
    dateLocal: string;
    nowUtcMs: number;
    policy: Doc<"clinicBookingPolicies">;
    weeklyWindows: Array<Doc<"providerWeeklySchedules">>;
    excludeAppointmentId?: Id<"appointments">;
  },
) {
  const candidateLocalStarts = generateCandidateStartsForDate(
    args.weeklyWindows,
    args.policy.slotStepMin,
    args.policy.appointmentDurationMin,
    args.dateLocal,
  );

  const candidateStartsUtcMs = candidateLocalStarts
    .map((startMinute) =>
      combineLocalDateMinuteToUtcMs(
        args.dateLocal,
        startMinute,
        args.clinic.timezone,
      ),
    )
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  const uniqueCandidateStartsUtcMs = Array.from(new Set(candidateStartsUtcMs));

  const startsWithinPolicy = filterByLeadTimeAndHorizon({
    candidateStartsUtcMs: uniqueCandidateStartsUtcMs,
    nowUtcMs: args.nowUtcMs,
    leadTimeMin: args.policy.leadTimeMin,
    bookingHorizonDays: args.policy.bookingHorizonDays,
    clinicTimezone: args.clinic.timezone,
    dateLocal: args.dateLocal,
  });

  if (startsWithinPolicy.length === 0) {
    return [] as number[];
  }

  const durationMs = args.policy.appointmentDurationMin * MS_PER_MINUTE;
  const rangeStartUtcMs = Math.max(0, startsWithinPolicy[0] - durationMs + 1);
  const rangeEndUtcMs =
    startsWithinPolicy[startsWithinPolicy.length - 1] + durationMs - 1;

  const conflicts = await loadScheduledConflicts(ctx, {
    providerId: args.provider._id,
    rangeStartUtcMs,
    rangeEndUtcMs,
    excludeAppointmentId: args.excludeAppointmentId,
  });

  return startsWithinPolicy.filter((startAtUtcMs) => {
    const endAtUtcMs = startAtUtcMs + durationMs;
    return !conflicts.some((conflict) =>
      isOverlapping(
        startAtUtcMs,
        endAtUtcMs,
        conflict.startAtUtcMs,
        conflict.endAtUtcMs,
      ),
    );
  });
}

async function listAvailableSlotRowsForDate(
  ctx: QueryCtx | MutationCtx,
  args: {
    clinic: Doc<"clinics">;
    provider: Doc<"providers">;
    dateLocal: string;
    nowUtcMs: number;
    limit: number;
    policy: Doc<"clinicBookingPolicies">;
    weeklyWindows: Array<Doc<"providerWeeklySchedules">>;
    excludeAppointmentId?: Id<"appointments">;
  },
) {
  const availableStarts = await listAvailableStartsForDate(ctx, args);
  const durationMs = args.policy.appointmentDurationMin * MS_PER_MINUTE;

  return availableStarts.slice(0, args.limit).map((startAtUtcMs) => ({
    startAtUtcMs,
    endAtUtcMs: startAtUtcMs + durationMs,
    label: formatClinicLabel24hWithTz(
      startAtUtcMs,
      args.clinic.timezone,
      args.clinic.city,
    ),
  })) satisfies AvailabilitySlotRow[];
}

async function resolveClinicProviderForOwner(
  ctx: QueryCtx | MutationCtx,
  args: { clinicSlug: string; providerName: string },
) {
  const identity = await requireIdentity(ctx);
  const clinicSlug = requireNonEmpty(args.clinicSlug, "clinicSlug");
  const providerName = requireNonEmpty(args.providerName, "providerName");
  const clinic = await getClinicBySlugOrThrow(ctx, clinicSlug);
  assertClinicOwner(clinic, identity.subject);
  const provider = await getProviderByNameOrThrow(
    ctx,
    clinic._id,
    providerName,
  );

  return { clinic, provider };
}

async function resolveClinicProviderForInternal(
  ctx: QueryCtx,
  args: {
    clinicId: Id<"clinics">;
    providerId: Id<"providers">;
  },
) {
  const clinic = await getClinicByIdOrThrow(ctx, args.clinicId);
  const provider = await getProviderByIdOrThrow(ctx, args.providerId);

  if (provider.clinicId !== clinic._id) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  return { clinic, provider };
}

async function resolveAppointmentForOwner(
  ctx: QueryCtx | MutationCtx,
  appointmentId: Id<"appointments">,
) {
  const identity = await requireIdentity(ctx);
  const appointment = await ctx.db.get(appointmentId);

  if (!appointment) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  const clinic = await ctx.db.get(appointment.clinicId);
  if (!clinic) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  assertClinicOwner(clinic, identity.subject);
  return appointment;
}

async function assertCreateSlotIsBookable(
  ctx: MutationCtx,
  args: {
    clinic: Doc<"clinics">;
    provider: Doc<"providers">;
    startAtUtcMs: number;
    policy: Doc<"clinicBookingPolicies">;
    weeklyWindows: Array<Doc<"providerWeeklySchedules">>;
  },
) {
  const localDateMinute = extractLocalDateMinuteForUtcMs(
    args.startAtUtcMs,
    args.clinic.timezone,
  );

  if (!localDateMinute) {
    schedulingError(SCHEDULING_ERROR_CODES.SLOT_UNAVAILABLE, {
      reason: "INVALID_LOCAL_SLOT",
    });
  }

  const candidateLocalStarts = generateCandidateStartsForDate(
    args.weeklyWindows,
    args.policy.slotStepMin,
    args.policy.appointmentDurationMin,
    localDateMinute.dateLocal,
  );

  if (!candidateLocalStarts.includes(localDateMinute.minuteOfDay)) {
    schedulingError(SCHEDULING_ERROR_CODES.SLOT_UNAVAILABLE, {
      reason: "OUTSIDE_WEEKLY_WINDOWS",
    });
  }

  const normalizedUtcMs = combineLocalDateMinuteToUtcMs(
    localDateMinute.dateLocal,
    localDateMinute.minuteOfDay,
    args.clinic.timezone,
  );
  if (normalizedUtcMs === null || normalizedUtcMs !== args.startAtUtcMs) {
    schedulingError(SCHEDULING_ERROR_CODES.SLOT_UNAVAILABLE, {
      reason: "INVALID_LOCAL_CONVERSION",
    });
  }

  const nowUtcMs = Date.now();
  const availableStarts = await listAvailableStartsForDate(ctx, {
    clinic: args.clinic,
    provider: args.provider,
    dateLocal: localDateMinute.dateLocal,
    nowUtcMs,
    policy: args.policy,
    weeklyWindows: args.weeklyWindows,
  });

  if (!availableStarts.includes(args.startAtUtcMs)) {
    schedulingError(SCHEDULING_ERROR_CODES.SLOT_UNAVAILABLE, {
      reason: "CONFLICT_OR_POLICY",
    });
  }
}

export async function createAppointmentForOwnerHandler(
  ctx: MutationCtx,
  args: {
    clinicSlug: string;
    providerName: string;
    patientName: string;
    patientPhone: string;
    startAtUtcMs: number;
  },
) {
  const identity = await requireIdentity(ctx);

  await rateLimiter.limit(ctx, "mutationGlobal", { throws: true });
  await rateLimiter.limit(ctx, "mutationPerUser", {
    key: identity.subject,
    throws: true,
  });

  const { clinic, provider } = await resolveClinicProviderForOwner(ctx, args);

  const patientName = requireNonEmpty(args.patientName, "patientName");
  const patientPhone = requireNonEmpty(args.patientPhone, "patientPhone");
  assertNonNegativeInteger(args.startAtUtcMs, "startAtUtcMs");

  const { policy, weeklyWindows } = await getSchedulingInputsOrThrow(
    ctx,
    clinic._id,
    provider._id,
  );

  await assertCreateSlotIsBookable(ctx, {
    clinic,
    provider,
    startAtUtcMs: args.startAtUtcMs,
    policy,
    weeklyWindows,
  });

  const endAtUtcMs =
    args.startAtUtcMs + policy.appointmentDurationMin * MS_PER_MINUTE;

  const appointmentId = await ctx.db.insert("appointments", {
    clinicId: clinic._id,
    providerId: provider._id,
    patientName,
    patientPhone,
    startAtUtcMs: args.startAtUtcMs,
    endAtUtcMs,
    status: "scheduled",
  });

  logger.info("appointment.created", {
    "user.subject": identity.subject,
    "tenant.clinic_slug": clinic.slug,
    "provider.id": provider._id,
    "appointment.start_at_utc_ms": args.startAtUtcMs,
    "appointment.duration.ms": policy.appointmentDurationMin * MS_PER_MINUTE,
  });

  return appointmentId;
}

export async function listAvailableSlotsForOwnerHandler(
  ctx: QueryCtx,
  args: {
    clinicSlug: string;
    providerName: string;
    dateLocal: string;
    nowUtcMs: number;
    limit?: number;
  },
) {
  assertNonNegativeInteger(args.nowUtcMs, "nowUtcMs");
  const dateLocal = validateDateLocalOrThrow(args.dateLocal);
  const limit = sanitizeAvailabilityLimit(args.limit);

  const { clinic, provider } = await resolveClinicProviderForOwner(ctx, args);
  const { policy, weeklyWindows } = await getSchedulingInputsOrThrow(
    ctx,
    clinic._id,
    provider._id,
  );

  return await listAvailableSlotRowsForDate(ctx, {
    clinic,
    provider,
    dateLocal,
    nowUtcMs: args.nowUtcMs,
    limit,
    policy,
    weeklyWindows,
  });
}

export async function listAvailableSlotsForInternalHandler(
  ctx: QueryCtx,
  args: {
    clinicId: Id<"clinics">;
    providerId: Id<"providers">;
    dateLocal: string;
    nowUtcMs: number;
    limit?: number;
    excludeAppointmentId?: Id<"appointments">;
  },
) {
  assertNonNegativeInteger(args.nowUtcMs, "nowUtcMs");
  const dateLocal = validateDateLocalOrThrow(args.dateLocal);
  const limit = sanitizeAvailabilityLimit(args.limit);

  const { clinic, provider } = await resolveClinicProviderForInternal(
    ctx,
    args,
  );
  const { policy, weeklyWindows } = await getSchedulingInputsOrThrow(
    ctx,
    clinic._id,
    provider._id,
  );

  return await listAvailableSlotRowsForDate(ctx, {
    clinic,
    provider,
    dateLocal,
    nowUtcMs: args.nowUtcMs,
    limit,
    policy,
    weeklyWindows,
    excludeAppointmentId: args.excludeAppointmentId,
  });
}

export async function listAppointmentsForOwnerHandler(
  ctx: QueryCtx,
  args: {
    clinicSlug: string;
    providerName: string;
    rangeStartUtcMs: number;
    rangeEndUtcMs: number;
    limit?: number;
  },
) {
  const { provider } = await resolveClinicProviderForOwner(ctx, args);
  validateAppointmentRangeOrThrow(args);

  const requestedLimit = args.limit ?? 200;
  assertPositiveInteger(requestedLimit, "limit");
  const limit = Math.min(requestedLimit, 200);

  const appointments = await ctx.db
    .query("appointments")
    .withIndex("by_providerId_and_startAtUtcMs", (q) =>
      q
        .eq("providerId", provider._id)
        .gte("startAtUtcMs", args.rangeStartUtcMs)
        .lte("startAtUtcMs", args.rangeEndUtcMs),
    )
    .take(limit);

  return appointments;
}

export async function listAppointmentsPageForOwnerHandler(
  ctx: QueryCtx,
  args: {
    clinicSlug: string;
    providerName: string;
    rangeStartUtcMs: number;
    rangeEndUtcMs: number;
    paginationOpts: PaginationOptions;
  },
) {
  const { provider } = await resolveClinicProviderForOwner(ctx, args);
  validateAppointmentRangeOrThrow(args);

  return await ctx.db
    .query("appointments")
    .withIndex("by_providerId_and_startAtUtcMs", (q) =>
      q
        .eq("providerId", provider._id)
        .gte("startAtUtcMs", args.rangeStartUtcMs)
        .lte("startAtUtcMs", args.rangeEndUtcMs),
    )
    .paginate(args.paginationOpts);
}

export async function getAppointmentByIdForOwnerHandler(
  ctx: QueryCtx,
  args: { appointmentId: Id<"appointments"> },
) {
  return await resolveAppointmentForOwner(ctx, args.appointmentId);
}

export async function confirmAppointmentForOwnerHandler(
  ctx: MutationCtx,
  args: {
    appointmentId: Id<"appointments">;
    confirmedAtUtcMs?: number;
  },
) {
  const appointment = await resolveAppointmentForOwner(ctx, args.appointmentId);

  if (appointment.status === "canceled") {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_TRANSITION);
  }

  if (appointment.confirmedAtUtcMs !== undefined) {
    return { changed: false };
  }

  if (args.confirmedAtUtcMs !== undefined) {
    assertNonNegativeInteger(args.confirmedAtUtcMs, "confirmedAtUtcMs");
  }

  await ctx.db.patch(appointment._id, {
    confirmedAtUtcMs: args.confirmedAtUtcMs ?? Date.now(),
  });

  return { changed: true };
}

export async function cancelAppointmentForOwnerHandler(
  ctx: MutationCtx,
  args: { appointmentId: Id<"appointments"> },
) {
  const appointment = await resolveAppointmentForOwner(ctx, args.appointmentId);

  if (appointment.status === "canceled") {
    return { changed: false };
  }

  await ctx.db.patch(appointment._id, { status: "canceled" });
  return { changed: true };
}
