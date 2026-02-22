import { configure, getLogger, type LogRecord, reset } from "@logtape/logtape";
import { ConvexError } from "convex/values";
import { afterEach, describe, expect, it } from "vitest";
import { runWithCanonicalLog } from "./logging";
import { createStrictRedactedSink } from "./redaction";
import { CANONICAL_FUNCTION_EVENT_NAME } from "./schema";

async function configureBufferSink() {
  const records: LogRecord[] = [];
  await configure({
    sinks: {
      buffer: createStrictRedactedSink((record) => {
        records.push(record);
      }),
    },
    loggers: [
      {
        category: ["app", "convex"],
        sinks: ["buffer"],
        lowestLevel: "debug",
      },
    ],
  });
  return records;
}

afterEach(async () => {
  await reset();
});

describe("canonical logging", () => {
  it("redacts sensitive fields from emitted payloads", async () => {
    const records = await configureBufferSink();
    const logger = getLogger(["app", "convex"]);

    logger.info("sensitive payload", {
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

  it("emits one canonical success completion event", async () => {
    const records = await configureBufferSink();

    const result = await runWithCanonicalLog(
      {
        functionName: "scheduling.createAppointmentForOwnerHandler",
        functionType: "mutation",
        safeContext: {
          "tenant.clinic_slug": "clinica-centro",
        },
      },
      async () => "ok",
    );

    expect(result).toBe("ok");

    const completionEvents = records.filter(
      (record) =>
        record.properties["event.name"] === CANONICAL_FUNCTION_EVENT_NAME,
    );
    expect(completionEvents).toHaveLength(1);
    expect(completionEvents[0]?.properties).toMatchObject({
      "event.outcome": "success",
      "convex.function.name": "scheduling.createAppointmentForOwnerHandler",
      "convex.function.type": "mutation",
      "tenant.clinic_slug": "clinica-centro",
    });
    expect(typeof completionEvents[0]?.properties["duration.ms"]).toBe(
      "number",
    );
  });

  it("emits one canonical failure completion event and rethrows the same error", async () => {
    const records = await configureBufferSink();
    const expectedError = new ConvexError({ code: "SLOT_UNAVAILABLE" });

    await expect(
      runWithCanonicalLog(
        {
          functionName: "scheduling.createAppointmentForOwnerHandler",
          functionType: "mutation",
        },
        async () => {
          throw expectedError;
        },
      ),
    ).rejects.toBe(expectedError);

    const completionEvents = records.filter(
      (record) =>
        record.properties["event.name"] === CANONICAL_FUNCTION_EVENT_NAME,
    );
    expect(completionEvents).toHaveLength(1);
    expect(completionEvents[0]?.properties).toMatchObject({
      "event.outcome": "failure",
      "convex.function.name": "scheduling.createAppointmentForOwnerHandler",
      "convex.function.type": "mutation",
      "error.code": "SLOT_UNAVAILABLE",
      "error.type": "ConvexError",
    });
    expect(typeof completionEvents[0]?.properties["duration.ms"]).toBe(
      "number",
    );
  });
});
