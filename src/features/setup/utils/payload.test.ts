import { describe, expect, it, vi } from "vitest";
import type {
  SetupDraft,
  SetupTFunction,
  WindowRow,
} from "@/features/setup/types";
import {
  applyTemplate,
  buildSetupPayload,
} from "@/features/setup/utils/payload";

// Returns the i18n key so assertions can check which error path was hit
const t = ((key: string) => key) as unknown as SetupTFunction;

const validDraft: SetupDraft = {
  clinicName: "Clinica Centro",
  city: "bogota",
  providerName: "Dr. Rivera",
  appointmentDurationMin: "30",
  slotStepMin: "15",
  leadTimeMin: "60",
  bookingHorizonDays: "30",
};

function makeWindow(
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  start: string,
  end: string,
  id = 1,
): WindowRow {
  return { id, dayOfWeek, start, end };
}

describe("buildSetupPayload", () => {
  it("returns ok payload for valid draft and windows", () => {
    const result = buildSetupPayload(
      validDraft,
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      clinicName: "Clinica Centro",
      city: "bogota",
      providerName: "Dr. Rivera",
      appointmentDurationMin: 30,
      slotStepMin: 15,
      leadTimeMin: 60,
      bookingHorizonDays: 30,
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
    });
  });

  it("trims whitespace from clinic and provider names", () => {
    const result = buildSetupPayload(
      {
        ...validDraft,
        clinicName: "  Clinica  ",
        providerName: "  Dr. Rivera  ",
      },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.clinicName).toBe("Clinica");
    expect(result.payload.providerName).toBe("Dr. Rivera");
  });

  it("rejects blank clinic name", () => {
    const result = buildSetupPayload(
      { ...validDraft, clinicName: "" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.requiredNames");
  });

  it("rejects whitespace-only provider name", () => {
    const result = buildSetupPayload(
      { ...validDraft, providerName: "   " },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.requiredNames");
  });

  it("rejects non-integer appointmentDurationMin", () => {
    const result = buildSetupPayload(
      { ...validDraft, appointmentDurationMin: "30.5" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.integer");
  });

  it("rejects zero appointmentDurationMin", () => {
    const result = buildSetupPayload(
      { ...validDraft, appointmentDurationMin: "0" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.durationAndStepPositive");
  });

  it("rejects zero slotStepMin", () => {
    const result = buildSetupPayload(
      { ...validDraft, slotStepMin: "0" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.durationAndStepPositive");
  });

  it("allows zero leadTimeMin (no restriction)", () => {
    const result = buildSetupPayload(
      { ...validDraft, leadTimeMin: "0" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.leadTimeMin).toBe(0);
  });

  it("rejects negative leadTimeMin", () => {
    const result = buildSetupPayload(
      { ...validDraft, leadTimeMin: "-1" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.leadTimeAndHorizon");
  });

  it("rejects zero bookingHorizonDays", () => {
    const result = buildSetupPayload(
      { ...validDraft, bookingHorizonDays: "0" },
      [makeWindow(1, "09:00", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.leadTimeAndHorizon");
  });

  it("rejects empty windows array", () => {
    const result = buildSetupPayload(validDraft, [], t);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.addWeeklyWindow");
  });

  it("rejects malformed time strings", () => {
    const result = buildSetupPayload(
      validDraft,
      [makeWindow(1, "99:99", "17:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.malformedTime");
  });

  it("rejects window where start equals end", () => {
    const result = buildSetupPayload(
      validDraft,
      [makeWindow(1, "09:00", "09:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.windowOrder");
  });

  it("rejects window where start is after end", () => {
    const result = buildSetupPayload(
      validDraft,
      [makeWindow(1, "17:00", "09:00")],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.windowOrder");
  });

  it("rejects overlapping windows on the same day", () => {
    const result = buildSetupPayload(
      validDraft,
      [makeWindow(1, "09:00", "13:00", 1), makeWindow(1, "12:00", "17:00", 2)],
      t,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("setup:errors.client.windowsOverlap");
  });

  it("allows adjacent (non-overlapping) windows on the same day", () => {
    const result = buildSetupPayload(
      validDraft,
      [makeWindow(1, "09:00", "12:00", 1), makeWindow(1, "12:00", "17:00", 2)],
      t,
    );
    expect(result.ok).toBe(true);
  });

  it("sorts windows by day then by start time", () => {
    const result = buildSetupPayload(
      validDraft,
      [
        makeWindow(3, "09:00", "12:00", 1),
        makeWindow(1, "14:00", "17:00", 2),
        makeWindow(1, "09:00", "12:00", 3),
      ],
      t,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.weeklyWindows).toEqual([
      { dayOfWeek: 1, startMinute: 540, endMinute: 720 },
      { dayOfWeek: 1, startMinute: 840, endMinute: 1020 },
      { dayOfWeek: 3, startMinute: 540, endMinute: 720 },
    ]);
  });

  it("accepts windows across different days without overlap errors", () => {
    const result = buildSetupPayload(
      validDraft,
      [
        makeWindow(1, "09:00", "17:00", 1),
        makeWindow(2, "09:00", "17:00", 2),
        makeWindow(5, "08:00", "14:00", 3),
      ],
      t,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.weeklyWindows).toHaveLength(3);
  });
});

describe("applyTemplate", () => {
  it("calls replaceWindows with weekday preset windows", () => {
    const replaceWindows = vi.fn();
    applyTemplate(replaceWindows, "weekday");
    expect(replaceWindows).toHaveBeenCalledOnce();
    const [windows] = replaceWindows.mock.calls[0];
    expect(windows).toHaveLength(5);
    expect(windows[0]).toMatchObject({
      dayOfWeek: 1,
      start: "09:00",
      end: "17:00",
    });
  });

  it("calls replaceWindows with extended preset windows including Saturday", () => {
    const replaceWindows = vi.fn();
    applyTemplate(replaceWindows, "extended");
    expect(replaceWindows).toHaveBeenCalledOnce();
    const [windows] = replaceWindows.mock.calls[0];
    expect(windows).toHaveLength(6);
    const saturday = windows.find(
      (w: { dayOfWeek: number }) => w.dayOfWeek === 6,
    );
    expect(saturday).toBeDefined();
  });

  it("calls replaceWindows with split preset windows (AM + PM blocks)", () => {
    const replaceWindows = vi.fn();
    applyTemplate(replaceWindows, "split");
    expect(replaceWindows).toHaveBeenCalledOnce();
    const [windows] = replaceWindows.mock.calls[0];
    expect(windows).toHaveLength(10);
  });

  it("does nothing for an unknown template id", () => {
    const replaceWindows = vi.fn();
    // @ts-expect-error testing invalid preset id
    applyTemplate(replaceWindows, "nonexistent");
    expect(replaceWindows).not.toHaveBeenCalled();
  });
});
