import { DEFAULT_REDACT_FIELDS, redactByField } from "@logtape/redaction";
import {
  SAFE_LOG_CONTEXT_KEYS,
  type SafeLogContext,
  type SafeLogContextKey,
  type SafeLogScalar,
} from "./schema";

const SAFE_LOG_CONTEXT_KEY_SET = new Set<string>(SAFE_LOG_CONTEXT_KEYS);

export const STRICT_REDACT_FIELD_PATTERNS = [
  ...DEFAULT_REDACT_FIELDS,
  "patientName",
  "patientPhone",
] as const;

function isSafeScalar(value: unknown): value is SafeLogScalar {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function sanitizeSafeLogContext(
  context: undefined | null | SafeLogContext | Record<string, unknown>,
): SafeLogContext {
  const sanitized: SafeLogContext = {};
  if (!context) {
    return sanitized;
  }

  for (const [key, value] of Object.entries(context)) {
    if (SAFE_LOG_CONTEXT_KEY_SET.has(key) && isSafeScalar(value)) {
      sanitized[key as SafeLogContextKey] = value;
    }
  }

  return sanitized;
}

export function createStrictRedactedSink(
  sink: Parameters<typeof redactByField>[0],
) {
  return redactByField(sink, {
    fieldPatterns: [...STRICT_REDACT_FIELD_PATTERNS],
    action: () => "[REDACTED]",
  });
}
