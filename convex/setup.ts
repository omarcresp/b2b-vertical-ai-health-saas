import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getMyLatestSetupKeyHandler,
  getSetupSnapshotHandler,
  upsertClinicProviderSetupHandler,
} from "./model/setup";

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

export const getSetupSnapshot = query({
  args: {
    clinicSlug: v.string(),
    providerName: v.string(),
  },
  handler: async (ctx, args) => getSetupSnapshotHandler(ctx, args),
});

export const getMyLatestSetupKey = query({
  args: {
    intent: v.literal("bootstrap"),
  },
  handler: async (ctx) => getMyLatestSetupKeyHandler(ctx),
});
