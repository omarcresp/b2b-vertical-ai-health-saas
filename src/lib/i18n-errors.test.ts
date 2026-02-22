import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { readLocalizedErrorMessage } from "./i18n-errors";

// Identity stub: returns the key itself so assertions can check i18n key identity
const t = ((key: string) => key) as unknown as TFunction<["setup", "common"]>;

describe("readLocalizedErrorMessage", () => {
  it("returns unknown key for a non-object error (string)", () => {
    expect(readLocalizedErrorMessage("oops", t)).toBe("setup:errors.unknown");
  });

  it("returns unknown key for an object with no data property", () => {
    expect(readLocalizedErrorMessage({ code: "something" }, t)).toBe(
      "setup:errors.unknown",
    );
  });

  it("returns unknown key when data has no code property", () => {
    expect(
      readLocalizedErrorMessage({ data: { message: "something" } }, t),
    ).toBe("setup:errors.unknown");
  });

  it("returns unknown key when data.code is not a string", () => {
    expect(readLocalizedErrorMessage({ data: { code: 42 } }, t)).toBe(
      "setup:errors.unknown",
    );
  });

  it("returns setup i18n key for known setup error code", () => {
    const error = { data: { code: "setup.weekly_window_overlap" } };
    expect(readLocalizedErrorMessage(error, t)).toBe(
      "setup:errors.server.setupWeeklyWindowOverlap",
    );
  });

  it("returns scheduling i18n key for known scheduling error code", () => {
    const error = { data: { code: "scheduling.slot_unavailable" } };
    expect(readLocalizedErrorMessage(error, t)).toBe(
      "setup:errors.server.schedulingSlotUnavailable",
    );
  });

  it("returns Error.message for Error instances with a message", () => {
    expect(
      readLocalizedErrorMessage(new Error("something went wrong"), t),
    ).toBe("something went wrong");
  });

  it("returns data string when error.data is a non-empty string", () => {
    expect(readLocalizedErrorMessage({ data: "raw server message" }, t)).toBe(
      "raw server message",
    );
  });
});
