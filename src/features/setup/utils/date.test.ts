import { describe, expect, it } from "vitest";
import { combineDateAndMinuteToUtcMs, parseDateInput } from "./date";

describe("combineDateAndMinuteToUtcMs", () => {
  it("converts clinic-local slot time in America/Mexico_City to UTC", () => {
    const utcMs = combineDateAndMinuteToUtcMs(
      "2026-02-23",
      9 * 60,
      "America/Mexico_City",
    );

    expect(utcMs).toBe(Date.UTC(2026, 1, 23, 15, 0, 0, 0));
  });

  it("converts clinic-local slot time in America/Bogota to UTC", () => {
    const utcMs = combineDateAndMinuteToUtcMs(
      "2026-02-23",
      9 * 60,
      "America/Bogota",
    );

    expect(utcMs).toBe(Date.UTC(2026, 1, 23, 14, 0, 0, 0));
  });

  it("returns null for invalid inputs", () => {
    expect(
      combineDateAndMinuteToUtcMs("not-a-date", 60, "America/Bogota"),
    ).toBeNull();
    expect(
      combineDateAndMinuteToUtcMs("2026-02-23", 1_440, "America/Bogota"),
    ).toBeNull();
  });
});

describe("parseDateInput", () => {
  it("rejects invalid calendar dates", () => {
    expect(parseDateInput("2026-02-30")).toBeNull();
  });
});
