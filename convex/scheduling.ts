import { ConvexError, v } from "convex/values";
import { SCHEDULING_ERROR_CODES } from "../shared/schedulingErrorCodes";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { rateLimiter } from "./rateLimiter";

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

  const policy = await ctx.db
    .query("clinicBookingPolicies")
    .withIndex("by_clinicId", (q) => q.eq("clinicId", clinic._id))
    .unique();

  if (!policy) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  const endAtUtcMs =
    args.startAtUtcMs + policy.appointmentDurationMin * 60 * 1_000;

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
  assertNonNegativeInteger(args.rangeStartUtcMs, "rangeStartUtcMs");
  assertNonNegativeInteger(args.rangeEndUtcMs, "rangeEndUtcMs");
  if (args.rangeEndUtcMs <= args.rangeStartUtcMs) {
    schedulingError(SCHEDULING_ERROR_CODES.INVALID_PAYLOAD, {
      field: "rangeEndUtcMs",
    });
  }

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
