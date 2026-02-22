import { describe, expect, it } from "vitest";
import {
  normalizeClinicSlug,
  timezoneForCity,
  validateAndSortWeeklyWindows,
  validateSetupNumbers,
} from "./setupValidation";

describe("setupValidation", () => {
  it("normalizes clinic slug and strips accents", () => {
    expect(normalizeClinicSlug("  Clinica Bogota Norte  ")).toBe(
      "clinica-bogota-norte",
    );
    expect(normalizeClinicSlug("Clínica Centro")).toBe("clinica-centro");
  });

  it("rejects overly long slug source values before regex normalization", () => {
    expect(() => normalizeClinicSlug("a".repeat(121))).toThrow(
      "Clinic slug source is too long",
    );
  });

  it("maps city to constrained timezone", () => {
    expect(timezoneForCity("cdmx")).toBe("America/Mexico_City");
    expect(timezoneForCity("bogota")).toBe("America/Bogota");
  });

  it("rejects invalid numeric setup values", () => {
    expect(() =>
      validateSetupNumbers({
        appointmentDurationMin: 0,
        slotStepMin: 15,
        leadTimeMin: 0,
        bookingHorizonDays: 30,
      }),
    ).toThrow("appointmentDurationMin must be greater than 0.");

    expect(() =>
      validateSetupNumbers({
        appointmentDurationMin: 30,
        slotStepMin: 15,
        leadTimeMin: -1,
        bookingHorizonDays: 30,
      }),
    ).toThrow("leadTimeMin must be greater than or equal to 0.");
  });

  it("rejects invalid schedule windows", () => {
    expect(() =>
      validateAndSortWeeklyWindows([
        { dayOfWeek: 1, startMinute: 600, endMinute: 660 },
        { dayOfWeek: 1, startMinute: 650, endMinute: 720 },
      ]),
    ).toThrow("weeklyWindows has overlapping ranges for day 1.");

    expect(() =>
      validateAndSortWeeklyWindows([
        { dayOfWeek: 1, startMinute: 700, endMinute: 700 },
      ]),
    ).toThrow("weeklyWindows[0] must satisfy startMinute < endMinute.");

    expect(() =>
      validateAndSortWeeklyWindows([
        { dayOfWeek: 1, startMinute: -1, endMinute: 700 },
      ]),
    ).toThrow("weeklyWindows[0].startMinute must be between 0 and 1440.");
  });

  it("sorts valid windows deterministically", () => {
    const windows = validateAndSortWeeklyWindows([
      { dayOfWeek: 2, startMinute: 600, endMinute: 660 },
      { dayOfWeek: 1, startMinute: 600, endMinute: 660 },
      { dayOfWeek: 2, startMinute: 700, endMinute: 760 },
    ]);

    expect(windows).toEqual([
      { dayOfWeek: 1, startMinute: 600, endMinute: 660 },
      { dayOfWeek: 2, startMinute: 600, endMinute: 660 },
      { dayOfWeek: 2, startMinute: 700, endMinute: 760 },
    ]);
  });
});
