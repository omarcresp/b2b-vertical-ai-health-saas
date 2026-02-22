import {
  configure,
  getConfig,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
} from "@logtape/logtape";
import { ConvexError } from "convex/values";
import { createStrictRedactedSink, sanitizeSafeLogContext } from "./redaction";
import {
  CANONICAL_FUNCTION_EVENT_NAME,
  type CanonicalFailureFields,
  type CanonicalFunctionEvent,
  type CanonicalLogMeta,
  type SafeLogContext,
} from "./schema";

const APP_CONVEX_CATEGORY = ["app", "convex"] as const;
const DEFAULT_SINK_NAME = "console";
const CANONICAL_EVENT_MESSAGE = "canonical function completion";
const DOMAIN_EVENT_MESSAGE = "domain event";
const SUBJECT_HASH_PREFIX = "h1_";

let configurePromise: null | Promise<void> = null;

function isProductionEnv() {
  const nodeEnv = (
    globalThis as {
      process?: {
        env?: {
          NODE_ENV?: string;
        };
      };
    }
  ).process?.env?.NODE_ENV;

  return nodeEnv === "production";
}

function getDefaultLogLevel() {
  return isProductionEnv() ? "info" : "debug";
}

function buildConsoleSink() {
  const formatter = getJsonLinesFormatter({
    categorySeparator: ".",
    message: "template",
    properties: "flatten",
  });
  return createStrictRedactedSink(getConsoleSink({ formatter }));
}

async function ensureLoggingConfigured() {
  if (getConfig()) {
    return;
  }

  if (!configurePromise) {
    configurePromise = configure({
      sinks: {
        [DEFAULT_SINK_NAME]: buildConsoleSink(),
      },
      loggers: [
        {
          category: [...APP_CONVEX_CATEGORY],
          sinks: [DEFAULT_SINK_NAME],
          lowestLevel: getDefaultLogLevel(),
        },
        {
          category: ["logtape"],
          sinks: [DEFAULT_SINK_NAME],
          lowestLevel: "error",
        },
      ],
    }).catch((error) => {
      configurePromise = null;
      throw error;
    });
  }

  await Promise.resolve(configurePromise);

  // Tests may reset global LogTape state; re-arm the singleton in that case.
  if (!getConfig()) {
    configurePromise = null;
    await ensureLoggingConfigured();
  }
}

function resolveErrorCode(error: unknown): string | undefined {
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | undefined)?.code;
    if (typeof code === "string") {
      return code;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return undefined;
}

function resolveErrorType(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { constructor?: { name?: unknown } }).constructor?.name ===
      "string"
  ) {
    return (error as { constructor: { name: string } }).constructor.name;
  }

  return typeof error;
}

function computeFailureFields(error: unknown): CanonicalFailureFields {
  const failureFields: CanonicalFailureFields = {
    "error.type": resolveErrorType(error),
  };

  const code = resolveErrorCode(error);
  if (code) {
    failureFields["error.code"] = code;
  }

  return failureFields;
}

function getCanonicalLogger() {
  return getLogger([...APP_CONVEX_CATEGORY]);
}

function emitCanonicalEvent(event: CanonicalFunctionEvent) {
  getCanonicalLogger().info(CANONICAL_EVENT_MESSAGE, event);
}

function nowMs() {
  return Date.now();
}

function safeDurationMs(startedAtMs: number) {
  return Math.max(0, nowMs() - startedAtMs);
}

export function safeSubjectHash(subject: string): string {
  let left = 0xdeadbeef ^ subject.length;
  let right = 0x41c6ce57 ^ subject.length;

  for (let i = 0; i < subject.length; i += 1) {
    const value = subject.charCodeAt(i);
    left = Math.imul(left ^ value, 2_654_435_761);
    right = Math.imul(right ^ value, 1_597_334_677);
  }

  left =
    Math.imul(left ^ (left >>> 16), 2_246_822_507) ^
    Math.imul(right ^ (right >>> 13), 3_266_489_909);
  right =
    Math.imul(right ^ (right >>> 16), 2_246_822_507) ^
    Math.imul(left ^ (left >>> 13), 3_266_489_909);

  const hex =
    (right >>> 0).toString(16).padStart(8, "0") +
    (left >>> 0).toString(16).padStart(8, "0");

  return `${SUBJECT_HASH_PREFIX}${hex.slice(0, 16)}`;
}

export async function runWithCanonicalLog<T>(
  meta: CanonicalLogMeta,
  fn: () => Promise<T>,
): Promise<T> {
  await ensureLoggingConfigured();
  const startedAtMs = nowMs();

  try {
    const value = await fn();

    emitCanonicalEvent({
      "event.name": CANONICAL_FUNCTION_EVENT_NAME,
      "event.outcome": "success",
      "convex.function.name": meta.functionName,
      "convex.function.type": meta.functionType,
      "duration.ms": safeDurationMs(startedAtMs),
      ...sanitizeSafeLogContext(meta.safeContext),
    });

    return value;
  } catch (error) {
    emitCanonicalEvent({
      "event.name": CANONICAL_FUNCTION_EVENT_NAME,
      "event.outcome": "failure",
      "convex.function.name": meta.functionName,
      "convex.function.type": meta.functionType,
      "duration.ms": safeDurationMs(startedAtMs),
      ...computeFailureFields(error),
      ...sanitizeSafeLogContext(meta.safeContext),
    });

    throw error;
  }
}

export async function logDomainEvent(
  eventName: string,
  safeContext: SafeLogContext,
) {
  await ensureLoggingConfigured();

  getCanonicalLogger().info(DOMAIN_EVENT_MESSAGE, {
    "event.name": eventName,
    ...sanitizeSafeLogContext(safeContext),
  });
}
