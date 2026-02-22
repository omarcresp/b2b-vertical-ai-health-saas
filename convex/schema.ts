import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { SUPPORTED_LOCALES } from "../shared/locales";

const [EN_US_LOCALE, ES_MX_LOCALE, ES_CO_LOCALE] = SUPPORTED_LOCALES;
const localeValidator = v.union(
  v.literal(EN_US_LOCALE),
  v.literal(ES_MX_LOCALE),
  v.literal(ES_CO_LOCALE),
);

export default defineSchema({
  clinics: defineTable({
    name: v.string(),
    slug: v.string(),
    city: v.union(v.literal("cdmx"), v.literal("bogota")),
    timezone: v.union(
      v.literal("America/Mexico_City"),
      v.literal("America/Bogota"),
    ),
    createdBySubject: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_createdBySubject", ["createdBySubject"]),

  clinicBookingPolicies: defineTable({
    clinicId: v.id("clinics"),
    appointmentDurationMin: v.number(),
    slotStepMin: v.number(),
    leadTimeMin: v.number(),
    bookingHorizonDays: v.number(),
  }).index("by_clinicId", ["clinicId"]),

  providers: defineTable({
    clinicId: v.id("clinics"),
    name: v.string(),
    isActive: v.boolean(),
  })
    .index("by_clinicId", ["clinicId"])
    .index("by_clinicId_and_isActive", ["clinicId", "isActive"])
    .index("by_clinicId_and_name", ["clinicId", "name"]),

  providerWeeklySchedules: defineTable({
    clinicId: v.id("clinics"),
    providerId: v.id("providers"),
    dayOfWeek: v.number(),
    startMinute: v.number(),
    endMinute: v.number(),
  }).index("by_providerId_and_dayOfWeek", ["providerId", "dayOfWeek"]),

  appointments: defineTable({
    clinicId: v.id("clinics"),
    providerId: v.id("providers"),
    patientName: v.string(),
    patientPhone: v.string(),
    startAtUtcMs: v.number(),
    endAtUtcMs: v.number(),
    status: v.union(v.literal("scheduled"), v.literal("canceled")),
    confirmedAtUtcMs: v.optional(v.number()),
  })
    .index("by_providerId_and_startAtUtcMs", ["providerId", "startAtUtcMs"])
    .index("by_clinicId_and_startAtUtcMs", ["clinicId", "startAtUtcMs"]),

  userPreferences: defineTable({
    subject: v.string(),
    locale: localeValidator,
    updatedAtUtcMs: v.number(),
  }).index("by_subject", ["subject"]),
});
