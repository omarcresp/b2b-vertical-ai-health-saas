import { type PaginationOptions, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { SCHEDULING_ERROR_CODES } from "../shared/schedulingErrorCodes";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalQuery,
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

const MS_PER_MINUTE = 60 * 1_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;
const DATE_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_PATTERN = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/;

const CITY_LABEL_BY_VALUE = {
  cdmx: "CDMX",
  bogota: "Bogota",
} as const satisfies Record<Doc<"clinics">["city"], string>;

type ParsedLocalDate = {
  year: number;
  month: number;
  day: number;
};

type AvailabilitySlotRow = {
  startAtUtcMs: number;
  endAtUtcMs: number;
  label: string;
};

type SchedulingInputs = {
  policy: Doc<"clinicBookingPolicies">;
  weeklyWindows: Array<Doc<"providerWeeklySchedules">>;
};

function schedulingError(
  code: (typeof SCHEDULING_ERROR_CODES)[keyof typeof SCHEDULING_ERROR_CODES],
  details?: Record<string, string | number | boolean>,
): never {
  throw new ConvexError({ code, ...details });
}

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

function parseDatePart(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function epochDay(parsedDate: ParsedLocalDate) {
  return Math.floor(
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day) /
      MS_PER_DAY,
  );
}

export function parseDateLocal(dateLocal: string): ParsedLocalDate | null {
  if (!DATE_LOCAL_PATTERN.test(dateLocal)) {
    return null;
  }

  const [yearText, monthText, dayText] = dateLocal.split("-");
  const year = parseDatePart(yearText);
  const month = parseDatePart(monthText);
  const day = parseDatePart(dayText);

  if (year === null || month === null || day === null) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatDateLocal(parsedDate: ParsedLocalDate) {
  return `${parsedDate.year.toString().padStart(4, "0")}-${parsedDate.month
    .toString()
    .padStart(2, "0")}-${parsedDate.day.toString().padStart(2, "0")}`;
}

function getOffsetMinutes(timezone: string, utcMs: number): number | null {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const offsetPart = formatter
    .formatToParts(new Date(utcMs))
    .find((part) => part.type === "timeZoneName")?.value;

  if (!offsetPart) {
    return null;
  }

  const match = OFFSET_PATTERN.exec(offsetPart);
  if (!match) {
    return null;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function extractLocalDateMinuteForUtcMs(
  utcMs: number,
  timezone: string,
): { dateLocal: string; minuteOfDay: number } | null {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcMs));
  const year = parseDatePart(
    parts.find((part) => part.type === "year")?.value ?? "",
  );
  const month = parseDatePart(
    parts.find((part) => part.type === "month")?.value ?? "",
  );
  const day = parseDatePart(
    parts.find((part) => part.type === "day")?.value ?? "",
  );
  const hour = parseDatePart(
    parts.find((part) => part.type === "hour")?.value ?? "",
  );
  const minute = parseDatePart(
    parts.find((part) => part.type === "minute")?.value ?? "",
  );

  if (
    year === null ||
    month === null ||
    day === null ||
    hour === null ||
    minute === null
  ) {
    return null;
  }

  const dateLocal = formatDateLocal({ year, month, day });
  return {
    dateLocal,
    minuteOfDay: hour * 60 + minute,
  };
}

export function combineLocalDateMinuteToUtcMs(
  dateLocal: string,
  minuteOfDay: number,
  timezone: Doc<"clinics">["timezone"],
) {
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1_439
  ) {
    return null;
  }

  const parsedDate = parseDateLocal(dateLocal);
  if (!parsedDate) {
    return null;
  }

  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  const wallClockUtcMs = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    hours,
    minutes,
    0,
    0,
  );

  const guessedOffsetMinutes = getOffsetMinutes(timezone, wallClockUtcMs);
  if (guessedOffsetMinutes === null) {
    return null;
  }

  let utcMs = wallClockUtcMs - guessedOffsetMinutes * MS_PER_MINUTE;
  const correctedOffsetMinutes = getOffsetMinutes(timezone, utcMs);
  if (correctedOffsetMinutes === null) {
    return null;
  }

  if (correctedOffsetMinutes !== guessedOffsetMinutes) {
    utcMs = wallClockUtcMs - correctedOffsetMinutes * MS_PER_MINUTE;
  }

  return utcMs;
}

export function formatClinicLabel24hWithTz(
  startAtUtcMs: number,
  timezone: Doc<"clinics">["timezone"],
  city: Doc<"clinics">["city"],
) {
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const timeLabel = timeFormatter.format(new Date(startAtUtcMs));
  const timezoneLabel =
    tzFormatter
      .formatToParts(new Date(startAtUtcMs))
      .find((part) => part.type === "timeZoneName")?.value ?? timezone;

  return `${timeLabel} ${timezoneLabel} (${CITY_LABEL_BY_VALUE[city]})`;
}

export function generateCandidateStartsForDate(
  weeklyWindows: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>,
  slotStepMin: number,
  appointmentDurationMin: number,
  dateLocal: string,
) {
  if (
    !Number.isInteger(slotStepMin) ||
    !Number.isInteger(appointmentDurationMin) ||
    slotStepMin <= 0 ||
    appointmentDurationMin <= 0
  ) {
    return [] as number[];
  }

  const parsedDate = parseDateLocal(dateLocal);
  if (!parsedDate) {
    return [] as number[];
  }

  const dayOfWeek = new Date(
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day),
  ).getUTCDay();

  const dayWindows = weeklyWindows
    .filter((window) => window.dayOfWeek === dayOfWeek)
    .sort((left, right) => left.startMinute - right.startMinute);

  const starts: number[] = [];
  for (const window of dayWindows) {
    for (
      let minute = window.startMinute;
      minute + appointmentDurationMin <= window.endMinute;
      minute += slotStepMin
    ) {
      starts.push(minute);
    }
  }

  return starts;
}

export function filterByLeadTimeAndHorizon(args: {
  candidateStartsUtcMs: number[];
  nowUtcMs: number;
  leadTimeMin: number;
  bookingHorizonDays: number;
  clinicTimezone: Doc<"clinics">["timezone"];
  dateLocal: string;
}) {
  if (
    !Number.isInteger(args.leadTimeMin) ||
    !Number.isInteger(args.bookingHorizonDays) ||
    args.leadTimeMin < 0 ||
    args.bookingHorizonDays <= 0
  ) {
    return [] as number[];
  }

  const targetDate = parseDateLocal(args.dateLocal);
  const nowLocal = extractLocalDateMinuteForUtcMs(
    args.nowUtcMs,
    args.clinicTimezone,
  );
  if (!targetDate || !nowLocal) {
    return [] as number[];
  }

  const nowLocalDate = parseDateLocal(nowLocal.dateLocal);
  if (!nowLocalDate) {
    return [] as number[];
  }

  const diffDays = epochDay(targetDate) - epochDay(nowLocalDate);
  if (diffDays < 0 || diffDays > args.bookingHorizonDays) {
    return [] as number[];
  }

  const minStartUtcMs = args.nowUtcMs + args.leadTimeMin * MS_PER_MINUTE;
  const maxStartUtcMs = args.nowUtcMs + args.bookingHorizonDays * MS_PER_DAY;

  return args.candidateStartsUtcMs.filter(
    (startAtUtcMs) =>
      startAtUtcMs >= minStartUtcMs && startAtUtcMs <= maxStartUtcMs,
  );
}

export function isOverlapping(
  startAtUtcMs: number,
  endAtUtcMs: number,
  otherStartAtUtcMs: number,
  otherEndAtUtcMs: number,
) {
  return startAtUtcMs < otherEndAtUtcMs && otherStartAtUtcMs < endAtUtcMs;
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    schedulingError(SCHEDULING_ERROR_CODES.AUTH_REQUIRED);
  }
  return identity;
}

function assertClinicOwner(clinic: Doc<"clinics">, subject: string) {
  if (clinic.createdBySubject !== subject) {
    schedulingError(SCHEDULING_ERROR_CODES.FORBIDDEN);
  }
}

async function getClinicBySlugOrThrow(
  ctx: QueryCtx | MutationCtx,
  slug: string,
) {
  const clinic = await ctx.db
    .query("clinics")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!clinic) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  return clinic;
}

async function getClinicByIdOrThrow(
  ctx: QueryCtx | MutationCtx,
  clinicId: Id<"clinics">,
) {
  const clinic = await ctx.db.get(clinicId);
  if (!clinic) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }
  return clinic;
}

async function getProviderByNameOrThrow(
  ctx: QueryCtx | MutationCtx,
  clinicId: Id<"clinics">,
  providerName: string,
) {
  const provider = await ctx.db
    .query("providers")
    .withIndex("by_clinicId_and_name", (q) =>
      q.eq("clinicId", clinicId).eq("name", providerName),
    )
    .unique();

  if (!provider) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  return provider;
}

async function getProviderByIdOrThrow(
  ctx: QueryCtx | MutationCtx,
  providerId: Id<"providers">,
) {
  const provider = await ctx.db.get(providerId);
  if (!provider) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }
  return provider;
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

function sanitizeAvailabilityLimit(limit: number = 10) {
  assertPositiveInteger(limit, "limit");
  return Math.min(limit, 50);
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
  await rateLimiter.limit(ctx, "addNumberGlobal", { throws: true });
  await rateLimiter.limit(ctx, "addNumberPerUser", {
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

  return await ctx.db.insert("appointments", {
    clinicId: clinic._id,
    providerId: provider._id,
    patientName,
    patientPhone,
    startAtUtcMs: args.startAtUtcMs,
    endAtUtcMs,
    status: "scheduled",
  });
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

export const createAppointmentForOwner = mutation({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
    patientName: v.string(),
    patientPhone: v.string(),
    startAtUtcMs: v.number(),
  },
  handler: async (ctx, args) => createAppointmentForOwnerHandler(ctx, args),
});

export const listAvailableSlotsForOwner = query({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
    dateLocal: v.string(),
    nowUtcMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => listAvailableSlotsForOwnerHandler(ctx, args),
});

export const listAvailableSlots = internalQuery({
  args: {
    clinicId: v.id("clinics"),
    providerId: v.id("providers"),
    dateLocal: v.string(),
    nowUtcMs: v.number(),
    limit: v.optional(v.number()),
    excludeAppointmentId: v.optional(v.id("appointments")),
  },
  handler: async (ctx, args) => listAvailableSlotsForInternalHandler(ctx, args),
});

export const listAppointmentsPageForOwner = query({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
    rangeStartUtcMs: v.number(),
    rangeEndUtcMs: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => listAppointmentsPageForOwnerHandler(ctx, args),
});

// Deprecated: use listAppointmentsPageForOwner for pagination-safe reads.
export const listAppointmentsForOwner = query({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
    rangeStartUtcMs: v.number(),
    rangeEndUtcMs: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => listAppointmentsForOwnerHandler(ctx, args),
});

export const getAppointmentByIdForOwner = query({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => getAppointmentByIdForOwnerHandler(ctx, args),
});

export const confirmAppointmentForOwner = mutation({
  args: {
    appointmentId: v.id("appointments"),
    confirmedAtUtcMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => confirmAppointmentForOwnerHandler(ctx, args),
});

export const cancelAppointmentForOwner = mutation({
  args: {
    appointmentId: v.id("appointments"),
  },
  handler: async (ctx, args) => cancelAppointmentForOwnerHandler(ctx, args),
});
