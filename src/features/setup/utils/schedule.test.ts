import { describe, expect, it } from "vitest";
import {
  appointmentStatusKey,
  computeWeeklyMinutes,
  formatMinute,
  generateScheduleBasedTimeslots,
} from "./schedule";

describe("formatMinute", () => {
  it("formats 0 as 00:00", () => {
    expect(formatMinute(0)).toBe("00:00");
  });

  it("formats 90 as 01:30", () => {
    expect(formatMinute(90)).toBe("01:30");
  });

  it("formats 1439 as 23:59", () => {
    expect(formatMinute(1439)).toBe("23:59");
  });
});

describe("computeWeeklyMinutes", () => {
  it("returns 0 for empty windows", () => {
    expect(computeWeeklyMinutes([])).toBe(0);
  });

  it("skips windows with invalid time strings", () => {
    expect(
      computeWeeklyMinutes([
        { id: 1, dayOfWeek: 1, start: "bad", end: "17:00" },
      ]),
    ).toBe(0);
  });

  it("skips windows where start >= end", () => {
    expect(
      computeWeeklyMinutes([
        { id: 1, dayOfWeek: 1, start: "17:00", end: "09:00" },
      ]),
    ).toBe(0);
  });

  it("sums durations correctly across valid windows", () => {
    const result = computeWeeklyMinutes([
      { id: 1, dayOfWeek: 1, start: "09:00", end: "12:00" }, // 180 min
      { id: 2, dayOfWeek: 2, start: "14:00", end: "17:00" }, // 180 min
    ]);
    expect(result).toBe(360);
  });
});

describe("generateScheduleBasedTimeslots", () => {
  // 2026-02-23 is a Monday → getUTCDay() === 1
  const DATE_MONDAY = "2026-02-23";

  it("returns [] for non-integer slotStepMin", () => {
    expect(
      generateScheduleBasedTimeslots({
        dateValue: DATE_MONDAY,
        weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
        slotStepMin: 0.5,
        appointmentDurationMin: 30,
      }),
    ).toEqual([]);
  });

  it("returns [] for zero slotStepMin", () => {
    expect(
      generateScheduleBasedTimeslots({
        dateValue: DATE_MONDAY,
        weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
        slotStepMin: 0,
        appointmentDurationMin: 30,
      }),
    ).toEqual([]);
  });

  it("returns [] for invalid date string", () => {
    expect(
      generateScheduleBasedTimeslots({
        dateValue: "not-a-date",
        weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
        slotStepMin: 30,
        appointmentDurationMin: 30,
      }),
    ).toEqual([]);
  });

  it("returns [] when no windows match the day of week", () => {
    // dayOfWeek: 2 (Tuesday) but date is Monday (1)
    expect(
      generateScheduleBasedTimeslots({
        dateValue: DATE_MONDAY,
        weeklyWindows: [{ dayOfWeek: 2, startMinute: 540, endMinute: 600 }],
        slotStepMin: 30,
        appointmentDurationMin: 30,
      }),
    ).toEqual([]);
  });

  it("returns correct minute values for a valid matching window", () => {
    // 9:00–10:00 (60 min), 30-min duration, 30-min step → [540, 570]
    const result = generateScheduleBasedTimeslots({
      dateValue: DATE_MONDAY,
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
      slotStepMin: 30,
      appointmentDurationMin: 30,
    });
    expect(result).toEqual([540, 570]);
  });

  it("excludes slots where start + duration exceeds window end", () => {
    // 9:00–9:30 (30 min), 30-min duration → only [540]; 570+30=600 > 570
    const result = generateScheduleBasedTimeslots({
      dateValue: DATE_MONDAY,
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 570 }],
      slotStepMin: 30,
      appointmentDurationMin: 30,
    });
    expect(result).toEqual([540]);
  });
});

describe("appointmentStatusKey", () => {
  it("returns canceled key for canceled status", () => {
    expect(appointmentStatusKey({ status: "canceled" })).toBe(
      "setup:appointments.status.canceled",
    );
  });

  it("returns scheduled key when no confirmedAtUtcMs is set", () => {
    expect(appointmentStatusKey({ status: "scheduled" })).toBe(
      "setup:appointments.status.scheduled",
    );
  });

  it("returns scheduledConfirmed key when confirmedAtUtcMs is set", () => {
    expect(
      appointmentStatusKey({
        status: "scheduled",
        confirmedAtUtcMs: 1_234_567,
      }),
    ).toBe("setup:appointments.status.scheduledConfirmed");
  });
});
