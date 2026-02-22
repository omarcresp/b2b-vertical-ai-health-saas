export const CANONICAL_FUNCTION_EVENT_NAME =
  "convex.function.completed" as const;

export type ConvexFunctionType =
  | "query"
  | "mutation"
  | "action"
  | "internalQuery"
  | "internalMutation"
  | "internalAction";

export type CanonicalEventOutcome = "success" | "failure";
export type RateLimitOutcome = "allowed" | "rejected";
export type SafeLogScalar = string | number | boolean;

export const SAFE_LOG_CONTEXT_KEYS = [
  "user.subject_hash",
  "tenant.clinic_slug",
  "rate_limit.bucket",
  "rate_limit.outcome",
  "provider.id",
  "appointment.start_at_utc_ms",
  "appointment.duration.ms",
] as const;

export type SafeLogContextKey = (typeof SAFE_LOG_CONTEXT_KEYS)[number];
export type SafeLogContext = Partial<Record<SafeLogContextKey, SafeLogScalar>>;

export type CanonicalFailureFields = {
  "error.code"?: string;
  "error.type"?: string;
};

export type CanonicalFunctionEvent = {
  "event.name": typeof CANONICAL_FUNCTION_EVENT_NAME;
  "event.outcome": CanonicalEventOutcome;
  "convex.function.name": string;
  "convex.function.type": ConvexFunctionType;
  "duration.ms": number;
} & CanonicalFailureFields &
  SafeLogContext;

export type CanonicalLogMeta = {
  functionName: string;
  functionType: ConvexFunctionType;
  safeContext?: SafeLogContext;
};
