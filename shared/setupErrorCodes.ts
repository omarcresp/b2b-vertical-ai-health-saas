export const SETUP_ERROR_CODES = {
  AUTH_REQUIRED: "setup.auth_required",
  FORBIDDEN: "setup.forbidden",
  INVALID_PAYLOAD: "setup.invalid_payload",
  CLINIC_SLUG_EMPTY: "setup.clinic_slug_empty",
  WEEKLY_WINDOW_REQUIRED: "setup.weekly_window_required",
  WEEKLY_WINDOW_OVERLAP: "setup.weekly_window_overlap",
  WEEKLY_WINDOW_INVALID: "setup.weekly_window_invalid",
  NUMBER_INVALID: "setup.number_invalid",
} as const;

export type SetupErrorCode =
  (typeof SETUP_ERROR_CODES)[keyof typeof SETUP_ERROR_CODES];
