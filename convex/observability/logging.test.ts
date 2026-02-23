import { configure, type LogRecord, reset } from "@logtape/logtape";
import { afterEach, beforeEach, expect, it } from "vitest";
import { logger } from "./logging";
import { createStrictRedactedSink } from "./redaction";

let records: LogRecord[];

beforeEach(async () => {
  records = [];
  await configure({
    reset: true,
    sinks: {
      buffer: createStrictRedactedSink((record) => {
        records.push(record);
      }),
    },
    loggers: [
      { category: ["app", "convex"], sinks: ["buffer"], lowestLevel: "debug" },
    ],
  });
});

afterEach(async () => {
  await reset();
});

it("redacts sensitive fields", () => {
  logger.info("payload", {
    patientName: "Maria",
    patientPhone: "+573001112233",
    apiKey: "top-secret",
    accessToken: "token-123",
  });

  expect(records).toHaveLength(1);
  const payload = JSON.stringify(records[0]);
  expect(payload).not.toContain("Maria");
  expect(payload).not.toContain("+573001112233");
  expect(payload).not.toContain("top-secret");
  expect(payload).not.toContain("token-123");
});
