import { TEMPLATE_PRESETS } from "@/features/setup/constants";
import type {
  SetupDraft,
  SetupPayload,
  SetupTFunction,
  TemplatePreset,
  WindowRow,
} from "@/features/setup/types";
import { parseTimeToMinute } from "@/features/setup/utils/time";

export function applyTemplate(
  replaceWindows: (
    windows: Array<{ dayOfWeek: number; start: string; end: string }>,
  ) => void,
  presetId: TemplatePreset["id"],
) {
  const preset = TEMPLATE_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) {
    return;
  }

  replaceWindows(preset.windows);
}

function parseIntegerField(
  value: string,
  fieldName: string,
  t: SetupTFunction,
): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      error: t("setup:errors.client.integer", { field: fieldName }),
    };
  }

  return { ok: true, value: parsed };
}

export function buildSetupPayload(
  draft: SetupDraft,
  windows: WindowRow[],
  t: SetupTFunction,
): { ok: true; payload: SetupPayload } | { ok: false; error: string } {
  const clinicName = draft.clinicName.trim();
  const providerName = draft.providerName.trim();

  if (!clinicName || !providerName) {
    return {
      ok: false,
      error: t("setup:errors.client.requiredNames"),
    };
  }

  const appointmentDuration = parseIntegerField(
    draft.appointmentDurationMin,
    t("setup:errors.fields.appointmentDuration"),
    t,
  );
  if (!appointmentDuration.ok) {
    return appointmentDuration;
  }

  const slotStep = parseIntegerField(
    draft.slotStepMin,
    t("setup:errors.fields.slotStep"),
    t,
  );
  if (!slotStep.ok) {
    return slotStep;
  }

  const leadTime = parseIntegerField(
    draft.leadTimeMin,
    t("setup:errors.fields.leadTime"),
    t,
  );
  if (!leadTime.ok) {
    return leadTime;
  }

  const bookingHorizon = parseIntegerField(
    draft.bookingHorizonDays,
    t("setup:errors.fields.bookingHorizon"),
    t,
  );
  if (!bookingHorizon.ok) {
    return bookingHorizon;
  }

  if (appointmentDuration.value <= 0 || slotStep.value <= 0) {
    return {
      ok: false,
      error: t("setup:errors.client.durationAndStepPositive"),
    };
  }

  if (leadTime.value < 0 || bookingHorizon.value <= 0) {
    return {
      ok: false,
      error: t("setup:errors.client.leadTimeAndHorizon"),
    };
  }

  if (windows.length === 0) {
    return {
      ok: false,
      error: t("setup:errors.client.addWeeklyWindow"),
    };
  }

  const parsedWindows = windows.map((window, index) => {
    const startMinute = parseTimeToMinute(window.start);
    const endMinute = parseTimeToMinute(window.end);

    if (startMinute === null || endMinute === null) {
      return {
        ok: false as const,
        error: t("setup:errors.client.malformedTime", {
          index: index + 1,
        }),
      };
    }

    if (startMinute >= endMinute) {
      return {
        ok: false as const,
        error: t("setup:errors.client.windowOrder", {
          index: index + 1,
        }),
      };
    }

    if (window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      return {
        ok: false as const,
        error: t("setup:errors.client.windowInvalidDay", {
          index: index + 1,
        }),
      };
    }

    return {
      ok: true as const,
      dayOfWeek: window.dayOfWeek,
      startMinute,
      endMinute,
    };
  });

  const firstError = parsedWindows.find((window) => !window.ok);
  if (firstError && !firstError.ok) {
    return firstError;
  }

  const weeklyWindows = parsedWindows
    .filter(
      (window): window is (typeof parsedWindows)[number] & { ok: true } => {
        return window.ok;
      },
    )
    .map((window) => ({
      dayOfWeek: window.dayOfWeek,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
    }));

  weeklyWindows.sort((left, right) => {
    if (left.dayOfWeek !== right.dayOfWeek) {
      return left.dayOfWeek - right.dayOfWeek;
    }

    return left.startMinute - right.startMinute;
  });

  for (let index = 1; index < weeklyWindows.length; index += 1) {
    const previous = weeklyWindows[index - 1];
    const current = weeklyWindows[index];

    if (
      previous.dayOfWeek === current.dayOfWeek &&
      previous.endMinute > current.startMinute
    ) {
      return {
        ok: false,
        error: t("setup:errors.client.windowsOverlap"),
      };
    }
  }

  return {
    ok: true,
    payload: {
      clinicName,
      city: draft.city,
      providerName,
      appointmentDurationMin: appointmentDuration.value,
      slotStepMin: slotStep.value,
      leadTimeMin: leadTime.value,
      bookingHorizonDays: bookingHorizon.value,
      weeklyWindows,
    },
  };
}
