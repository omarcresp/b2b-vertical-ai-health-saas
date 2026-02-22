export const SCHEDULING_ERROR_CODES = {
  AUTH_REQUIRED: "scheduling.auth_required",
  FORBIDDEN: "scheduling.forbidden",
  NOT_FOUND: "scheduling.not_found",
  INVALID_PAYLOAD: "scheduling.invalid_payload",
  INVALID_TRANSITION: "scheduling.invalid_transition",
  SLOT_UNAVAILABLE: "scheduling.slot_unavailable",
} as const;

export type SchedulingErrorCode =
  (typeof SCHEDULING_ERROR_CODES)[keyof typeof SCHEDULING_ERROR_CODES];
