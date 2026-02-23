import { SCHEDULING_ERROR_CODES } from "../../shared/schedulingErrorCodes";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { schedulingError } from "../lib/schedulingError";

export function assertClinicOwner(
  clinic: Doc<"clinics">,
  subject: string,
): void {
  if (clinic.createdBySubject !== subject) {
    schedulingError(SCHEDULING_ERROR_CODES.FORBIDDEN);
  }
}

export async function getClinicBySlugOrThrow(
  ctx: QueryCtx | MutationCtx,
  slug: string,
): Promise<Doc<"clinics">> {
  const clinic = await ctx.db
    .query("clinics")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!clinic) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }

  return clinic;
}

export async function getClinicByIdOrThrow(
  ctx: QueryCtx | MutationCtx,
  clinicId: Id<"clinics">,
): Promise<Doc<"clinics">> {
  const clinic = await ctx.db.get(clinicId);
  if (!clinic) {
    schedulingError(SCHEDULING_ERROR_CODES.NOT_FOUND);
  }
  return clinic;
}
