import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  cancelAppointmentForOwnerHandler,
  confirmAppointmentForOwnerHandler,
  createAppointmentForOwnerHandler,
  getAppointmentByIdForOwnerHandler,
  listAppointmentsForOwnerHandler,
  listAppointmentsPageForOwnerHandler,
  listAvailableSlotsForInternalHandler,
  listAvailableSlotsForOwnerHandler,
} from "./model/scheduling";

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
