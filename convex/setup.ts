import { ConvexError, v } from "convex/values";
import { SETUP_ERROR_CODES } from "../shared/setupErrorCodes";
import { mutation, query } from "./_generated/server";
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
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: SETUP_ERROR_CODES.AUTH_REQUIRED });
    }

    const clinicName = requireNonEmptyString(args.clinicName, "clinicName");
    const providerName = requireNonEmptyString(
      args.providerName,
      "providerName",
    );

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

    await Promise.all(
      existingWindows.map((window) => ctx.db.delete(window._id)),
    );

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
  },
});

export const getSetupSnapshot = query({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: SETUP_ERROR_CODES.AUTH_REQUIRED });
    }

    const clinic = await ctx.db
      .query("clinics")
      .withIndex("by_slug", (q) => q.eq("slug", args.clinicSlug))
      .unique();

    if (!clinic) {
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

    const appointments = await ctx.db
      .query("appointments")
      .withIndex("by_providerId_and_startAtUtcMs", (q) =>
        q.eq("providerId", provider._id),
      )
      .collect();

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
      weeklyWindows: weeklyWindows.sort((left, right) => {
        if (left.dayOfWeek !== right.dayOfWeek) {
          return left.dayOfWeek - right.dayOfWeek;
        }
        return left.startMinute - right.startMinute;
      }),
      appointmentSummary: {
        total: appointments.length,
        scheduled: appointments.filter(
          (appointment) => appointment.status === "scheduled",
        ).length,
      },
    };
  },
});

export const getMyLatestSetupKey = query({
  args: {
    intent: v.literal("bootstrap"),
  },
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: SETUP_ERROR_CODES.AUTH_REQUIRED });
    }

    const ownedClinics = (await ctx.db.query("clinics").collect())
      .filter((clinic) => clinic.createdBySubject === identity.subject)
      .sort((left, right) => right._creationTime - left._creationTime);

    for (const clinic of ownedClinics) {
      const providers = await ctx.db
        .query("providers")
        .withIndex("by_clinicId", (q) => q.eq("clinicId", clinic._id))
        .collect();

      const activeProvider = providers.find((provider) => provider.isActive);
      const provider = activeProvider ?? providers[0];
      if (!provider) {
        continue;
      }

      return {
        clinicSlug: clinic.slug,
        providerName: provider.name,
      };
    }

    return null;
  },
});
