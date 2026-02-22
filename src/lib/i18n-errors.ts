import type { Namespace, TFunction } from "i18next";
import {
  SCHEDULING_ERROR_CODES,
  type SchedulingErrorCode,
} from "../../shared/schedulingErrorCodes";
import {
  SETUP_ERROR_CODES,
  type SetupErrorCode,
} from "../../shared/setupErrorCodes";

const SETUP_ERROR_TRANSLATION_KEYS: Record<SetupErrorCode, string> = {
  [SETUP_ERROR_CODES.AUTH_REQUIRED]: "setup:errors.server.setupAuthRequired",
  [SETUP_ERROR_CODES.INVALID_PAYLOAD]:
    "setup:errors.server.setupInvalidPayload",
  [SETUP_ERROR_CODES.CLINIC_SLUG_EMPTY]:
    "setup:errors.server.setupClinicSlugEmpty",
  [SETUP_ERROR_CODES.WEEKLY_WINDOW_REQUIRED]:
    "setup:errors.server.setupWeeklyWindowRequired",
  [SETUP_ERROR_CODES.WEEKLY_WINDOW_OVERLAP]:
    "setup:errors.server.setupWeeklyWindowOverlap",
  [SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID]:
    "setup:errors.server.setupWeeklyWindowInvalid",
  [SETUP_ERROR_CODES.NUMBER_INVALID]: "setup:errors.server.setupNumberInvalid",
};

const SCHEDULING_ERROR_TRANSLATION_KEYS: Record<SchedulingErrorCode, string> = {
  [SCHEDULING_ERROR_CODES.AUTH_REQUIRED]:
    "setup:errors.server.schedulingAuthRequired",
  [SCHEDULING_ERROR_CODES.FORBIDDEN]: "setup:errors.server.schedulingForbidden",
  [SCHEDULING_ERROR_CODES.NOT_FOUND]: "setup:errors.server.schedulingNotFound",
  [SCHEDULING_ERROR_CODES.INVALID_PAYLOAD]:
    "setup:errors.server.schedulingInvalidPayload",
  [SCHEDULING_ERROR_CODES.INVALID_TRANSITION]:
    "setup:errors.server.schedulingInvalidTransition",
};

function extractErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("data" in error)) {
    return null;
  }

  const data = Reflect.get(error, "data");
  if (typeof data !== "object" || data === null || !("code" in data)) {
    return null;
  }

  const code = Reflect.get(data, "code");
  if (typeof code !== "string") {
    return null;
  }

  return code;
}

export function readLocalizedErrorMessage(
  error: unknown,
  t: TFunction<Namespace>,
): string {
  const translate = (key: string) => t(key as never) as unknown as string;

  const code = extractErrorCode(error);
  if (code && code in SETUP_ERROR_TRANSLATION_KEYS) {
    return translate(SETUP_ERROR_TRANSLATION_KEYS[code as SetupErrorCode]);
  }

  if (code && code in SCHEDULING_ERROR_TRANSLATION_KEYS) {
    return translate(
      SCHEDULING_ERROR_TRANSLATION_KEYS[code as SchedulingErrorCode],
    );
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "data" in error) {
    const data = Reflect.get(error, "data");
    if (typeof data === "string" && data.trim()) {
      return data;
    }
  }

  return translate("setup:errors.unknown");
}
