import { describe, expect, it } from "vitest";
import { parseTimeToMinute } from "./time";

describe("parseTimeToMinute", () => {
  it("supports 24:00 for end-of-day windows", () => {
    expect(parseTimeToMinute("24:00")).toBe(1_440);
  });

  it("returns minutes for valid 24h times", () => {
    expect(parseTimeToMinute("09:15")).toBe(555);
    expect(parseTimeToMinute("23:59")).toBe(1_439);
  });

  it("returns null for malformed values", () => {
    expect(parseTimeToMinute("9:15")).toBeNull();
    expect(parseTimeToMinute("99:99")).toBeNull();
  });
});
