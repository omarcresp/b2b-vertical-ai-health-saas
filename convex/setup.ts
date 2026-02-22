import { ConvexError, v } from "convex/values";
import { SETUP_ERROR_CODES } from "../shared/setupErrorCodes";
import type { Doc } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { rateLimiter } from "./rateLimiter";
import {
  normalizeClinicSlug,
  SetupValidationError,
  timezoneForCity,
  validateAndSortWeeklyWindows,
  validateSetupNumbers,
} from "./setupValidation";

function asConvexError(error: unknown) {
  if (error instanceof ConvexError) {
    return error;
  }

  if (error instanceof SetupValidationError) {
    return new ConvexError({ code: error.code });
  }

  return new ConvexError({ code: SETUP_ERROR_CODES.INVALID_PAYLOAD });
}

function requireNonEmptyString(value: string, fieldName: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ConvexError({
      code: SETUP_ERROR_CODES.INVALID_PAYLOAD,
      field: fieldName,
    });
  }
  return trimmed;
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ code: SETUP_ERROR_CODES.AUTH_REQUIRED });
  }

  return identity;
}

function assertClinicOwner(clinic: Doc<"clinics">, subject: string) {
  if (clinic.createdBySubject !== subject) {
    throw new ConvexError({ code: SETUP_ERROR_CODES.FORBIDDEN });
  }
}

type UpsertClinicProviderSetupArgs = {
  clinicName: string;
  clinicSlug?: string;
  city: "cdmx" | "bogota";
  providerName: string;
  appointmentDurationMin: number;
  slotStepMin: number;
  leadTimeMin: number;
  bookingHorizonDays: number;
  weeklyWindows: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>;
};

export async function upsertClinicProviderSetupHandler(
  ctx: MutationCtx,
  args: UpsertClinicProviderSetupArgs,
) {
  const identity = await requireIdentity(ctx);

  await rateLimiter.limit(ctx, "addNumberGlobal", { throws: true });
  await rateLimiter.limit(ctx, "addNumberPerUser", {
    key: identity.subject,
    throws: true,
  });

  const clinicName = requireNonEmptyString(args.clinicName, "clinicName");
  const providerName = requireNonEmptyString(args.providerName, "providerName");

  let normalizedWindows: ReturnType<typeof validateAndSortWeeklyWindows>;

  try {
    validateSetupNumbers({
      appointmentDurationMin: args.appointmentDurationMin,
      slotStepMin: args.slotStepMin,
      bookingHorizonDays: args.bookingHorizonDays,
      leadTimeMin: args.leadTimeMin,
    });
    normalizedWindows = validateAndSortWeeklyWindows(args.weeklyWindows);
  } catch (error) {
    throw asConvexError(error);
  }

  let clinicSlug: string;

  try {
    clinicSlug = normalizeClinicSlug(args.clinicSlug ?? clinicName);
  } catch (error) {
    throw asConvexError(error);
  }

  const timezone = timezoneForCity(args.city);

  const clinic = await ctx.db
    .query("clinics")
    .withIndex("by_slug", (q) => q.eq("slug", clinicSlug))
    .unique();

  const clinicId = clinic
    ? clinic._id
    : await ctx.db.insert("clinics", {
        name: clinicName,
        slug: clinicSlug,
        city: args.city,
        timezone,
        createdBySubject: identity.subject,
      });

  if (clinic) {
    assertClinicOwner(clinic, identity.subject);

    await ctx.db.patch(clinicId, {
      name: clinicName,
      city: args.city,
      timezone,
    });
  }

  const existingPolicy = await ctx.db
    .query("clinicBookingPolicies")
    .withIndex("by_clinicId", (q) => q.eq("clinicId", clinicId))
    .unique();

  if (existingPolicy) {
    await ctx.db.patch(existingPolicy._id, {
      appointmentDurationMin: args.appointmentDurationMin,
      slotStepMin: args.slotStepMin,
      leadTimeMin: args.leadTimeMin,
      bookingHorizonDays: args.bookingHorizonDays,
    });
  } else {
    await ctx.db.insert("clinicBookingPolicies", {
      clinicId,
      appointmentDurationMin: args.appointmentDurationMin,
      slotStepMin: args.slotStepMin,
      leadTimeMin: args.leadTimeMin,
      bookingHorizonDays: args.bookingHorizonDays,
    });
  }

  const provider = await ctx.db
    .query("providers")
    .withIndex("by_clinicId_and_name", (q) =>
      q.eq("clinicId", clinicId).eq("name", providerName),
    )
    .unique();

  const providerId = provider
    ? provider._id
    : await ctx.db.insert("providers", {
        clinicId,
        name: providerName,
        isActive: true,
      });

  if (provider && !provider.isActive) {
    await ctx.db.patch(provider._id, { isActive: true });
  }

  const existingWindows = await ctx.db
    .query("providerWeeklySchedules")
    .withIndex("by_providerId_and_dayOfWeek", (q) =>
      q.eq("providerId", providerId),
    )
    .collect();

  await Promise.all(existingWindows.map((window) => ctx.db.delete(window._id)));

  for (const window of normalizedWindows) {
    await ctx.db.insert("providerWeeklySchedules", {
      clinicId,
      providerId,
      dayOfWeek: window.dayOfWeek,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
    });
  }

  return {
    clinicSlug,
    providerName,
  };
}

export const upsertClinicProviderSetup = mutation({
  args: {
    clinicName: v.string(),
    clinicSlug: v.optional(v.string()),
    city: v.union(v.literal("cdmx"), v.literal("bogota")),
    providerName: v.string(),
    appointmentDurationMin: v.number(),
    slotStepMin: v.number(),
    leadTimeMin: v.number(),
    bookingHorizonDays: v.number(),
    weeklyWindows: v.array(
      v.object({
        dayOfWeek: v.number(),
        startMinute: v.number(),
        endMinute: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => upsertClinicProviderSetupHandler(ctx, args),
});

type GetSetupSnapshotArgs = {
  clinicSlug: string;
  providerName: string;
};

export async function getSetupSnapshotHandler(
  ctx: QueryCtx,
  args: GetSetupSnapshotArgs,
) {
  const identity = await requireIdentity(ctx);

  const clinic = await ctx.db
    .query("clinics")
    .withIndex("by_slug", (q) => q.eq("slug", args.clinicSlug))
    .unique();

  if (!clinic) {
    return null;
  }

  if (clinic.createdBySubject !== identity.subject) {
    return null;
  }

  const provider = await ctx.db
    .query("providers")
    .withIndex("by_clinicId_and_name", (q) =>
      q.eq("clinicId", clinic._id).eq("name", args.providerName),
    )
    .unique();

  if (!provider) {
    return null;
  }

  const policy = await ctx.db
    .query("clinicBookingPolicies")
    .withIndex("by_clinicId", (q) => q.eq("clinicId", clinic._id))
    .unique();

  if (!policy) {
    return null;
  }

  const weeklyWindows = await ctx.db
    .query("providerWeeklySchedules")
    .withIndex("by_providerId_and_dayOfWeek", (q) =>
      q.eq("providerId", provider._id),
    )
    .collect();

  const sortedWeeklyWindows = [...weeklyWindows].sort((left, right) => {
    if (left.dayOfWeek !== right.dayOfWeek) {
      return left.dayOfWeek - right.dayOfWeek;
    }
    return left.startMinute - right.startMinute;
  });

  return {
    clinic: {
      name: clinic.name,
      slug: clinic.slug,
      city: clinic.city,
      timezone: clinic.timezone,
      appointmentDurationMin: policy.appointmentDurationMin,
      slotStepMin: policy.slotStepMin,
      leadTimeMin: policy.leadTimeMin,
      bookingHorizonDays: policy.bookingHorizonDays,
    },
    provider: {
      name: provider.name,
      isActive: provider.isActive,
    },
    weeklyWindows: sortedWeeklyWindows,
  };
}

export const getSetupSnapshot = query({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
  },
  handler: async (ctx, args) => getSetupSnapshotHandler(ctx, args),
});

const LATEST_SETUP_CLINIC_SCAN_LIMIT = 20;

export async function getMyLatestSetupKeyHandler(ctx: QueryCtx) {
  const identity = await requireIdentity(ctx);

  const ownedClinics = await ctx.db
    .query("clinics")
    .withIndex("by_createdBySubject", (q) =>
      q.eq("createdBySubject", identity.subject),
    )
    .order("desc")
    .take(LATEST_SETUP_CLINIC_SCAN_LIMIT);

  for (const clinic of ownedClinics) {
    const activeProviders = await ctx.db
      .query("providers")
      .withIndex("by_clinicId_and_isActive", (q) =>
        q.eq("clinicId", clinic._id).eq("isActive", true),
      )
      .order("asc")
      .take(1);

    if (activeProviders[0]) {
      return {
        clinicSlug: clinic.slug,
        providerName: activeProviders[0].name,
      };
    }

    const providers = await ctx.db
      .query("providers")
      .withIndex("by_clinicId", (q) => q.eq("clinicId", clinic._id))
      .order("asc")
      .take(1);

    const provider = providers[0];
    if (!provider) {
      continue;
    }

    return {
      clinicSlug: clinic.slug,
      providerName: provider.name,
    };
  }

  return null;
}

export const getMyLatestSetupKey = query({
  args: {
    intent: v.literal("bootstrap"),
  },
  handler: async (ctx) => getMyLatestSetupKeyHandler(ctx),
});
