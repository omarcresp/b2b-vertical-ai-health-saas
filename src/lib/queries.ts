import { convexQuery } from "@convex-dev/react-query";
import { api } from "#convex/_generated/api";

export const setupSnapshotQuery = (args: {
  clinicSlug: string;
  providerName: string;
}) => convexQuery(api.setup.getSetupSnapshot, args);

export const latestSetupKeyQuery = () =>
  convexQuery(api.setup.getMyLatestSetupKey, { intent: "bootstrap" });

export const availableSlotsQuery = (args: {
  clinicSlug: string;
  providerName: string;
  dateLocal: string;
  nowUtcMs: number;
  limit?: number;
}) => convexQuery(api.scheduling.listAvailableSlotsForOwner, args);

export const myPreferencesQuery = () =>
  convexQuery(api.userPreferences.getMyPreferences, {});
