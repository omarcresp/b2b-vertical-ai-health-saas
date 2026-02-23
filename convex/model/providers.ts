import { SCHEDULING_ERROR_CODES } from "../../shared/schedulingErrorCodes";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { schedulingError } from "../lib/schedulingError";

export async function getProviderByNameOrThrow(
  ctx: QueryCtx | MutationCtx,
  clinicId: Id<"clinics">,
  providerName: string,
): Promise<Doc<"providers">> {
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

export async function getProviderByIdOrThrow(
  ctx: QueryCtx | MutationCtx,
  providerId: Id<"providers">,
): Promise<Doc<"providers">> {
  const provider = await ctx.db.get(providerId);
  if (!provider) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }
  return provider;
}
