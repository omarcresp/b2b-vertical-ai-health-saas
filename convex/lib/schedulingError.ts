import { ConvexError } from "convex/values";
import type { SCHEDULING_ERROR_CODES } from "../../shared/schedulingErrorCodes";

export function schedulingError(
  code: (typeof SCHEDULING_ERROR_CODES)[keyof typeof SCHEDULING_ERROR_CODES],
  details?: Record<string, string | number | boolean>,
): never {
  throw new ConvexError({ code, ...details });
}
