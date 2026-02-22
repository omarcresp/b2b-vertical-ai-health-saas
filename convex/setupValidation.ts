import {
  SETUP_ERROR_CODES,
  type SetupErrorCode,
} from "../shared/setupErrorCodes";

export const TIMEZONE_BY_CITY = {
  cdmx: "America/Mexico_City",
  bogota: "America/Bogota",
} as const;

export type ClinicCity = keyof typeof TIMEZONE_BY_CITY;
export type ClinicTimezone = (typeof TIMEZONE_BY_CITY)[ClinicCity];

export type WeeklyWindowInput = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export class SetupValidationError extends Error {
  constructor(
    public readonly code: SetupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SetupValidationError";
  }
}

const MAX_CLINIC_SLUG_INPUT_LENGTH = 120;

function assertInteger(value: number, fieldName: string, code: SetupErrorCode) {
  if (!Number.isInteger(value)) {
    throw new SetupValidationError(code, `${fieldName} must be an integer.`);
  }
}

function assertRange(
  value: number,
  fieldName: string,
  minInclusive: number,
  maxInclusive: number,
  code: SetupErrorCode,
) {
  if (value < minInclusive || value > maxInclusive) {
    throw new SetupValidationError(
      code,
      `${fieldName} must be between ${minInclusive} and ${maxInclusive}.`,
    );
  }
}

function assertPositive(
  value: number,
  fieldName: string,
  code: SetupErrorCode,
) {
  assertInteger(value, fieldName, code);
  if (value <= 0) {
    throw new SetupValidationError(
      code,
      `${fieldName} must be greater than 0.`,
    );
  }
}

function assertNonNegative(
  value: number,
  fieldName: string,
  code: SetupErrorCode,
) {
  assertInteger(value, fieldName, code);
  if (value < 0) {
    throw new SetupValidationError(
      code,
      `${fieldName} must be greater than or equal to 0.`,
    );
  }
}

export function normalizeClinicSlug(value: string) {
  if (value.length > MAX_CLINIC_SLUG_INPUT_LENGTH) {
    throw new SetupValidationError(
      SETUP_ERROR_CODES.INVALID_PAYLOAD,
      `Clinic slug source is too long (max ${MAX_CLINIC_SLUG_INPUT_LENGTH} characters).`,
    );
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/(^-+)|(-+$)/g, "");

  if (!normalized) {
    throw new SetupValidationError(
      SETUP_ERROR_CODES.CLINIC_SLUG_EMPTY,
      "Clinic slug cannot be empty after normalization.",
    );
  }

  return normalized;
}

export function validateSetupNumbers(args: {
  appointmentDurationMin: number;
  slotStepMin: number;
  bookingHorizonDays: number;
  leadTimeMin: number;
}) {
  assertPositive(
    args.appointmentDurationMin,
    "appointmentDurationMin",
    SETUP_ERROR_CODES.NUMBER_INVALID,
  );
  assertPositive(
    args.slotStepMin,
    "slotStepMin",
    SETUP_ERROR_CODES.NUMBER_INVALID,
  );
  assertPositive(
    args.bookingHorizonDays,
    "bookingHorizonDays",
    SETUP_ERROR_CODES.NUMBER_INVALID,
  );
  assertNonNegative(
    args.leadTimeMin,
    "leadTimeMin",
    SETUP_ERROR_CODES.NUMBER_INVALID,
  );
}

export function validateAndSortWeeklyWindows(windows: WeeklyWindowInput[]) {
  if (windows.length === 0) {
    throw new SetupValidationError(
      SETUP_ERROR_CODES.WEEKLY_WINDOW_REQUIRED,
      "At least one weekly schedule window is required.",
    );
  }

  const normalized = windows.map((window, index) => {
    assertInteger(
      window.dayOfWeek,
      `weeklyWindows[${index}].dayOfWeek`,
      SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
    );
    assertRange(
      window.dayOfWeek,
      `weeklyWindows[${index}].dayOfWeek`,
      0,
      6,
      SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
    );

    assertInteger(
      window.startMinute,
      `weeklyWindows[${index}].startMinute`,
      SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
    );
    assertInteger(
      window.endMinute,
      `weeklyWindows[${index}].endMinute`,
      SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
    );
    assertRange(
      window.startMinute,
      `weeklyWindows[${index}].startMinute`,
      0,
      1440,
      SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
    );
    assertRange(
      window.endMinute,
      `weeklyWindows[${index}].endMinute`,
      0,
      1440,
      SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
    );

    if (window.startMinute >= window.endMinute) {
      throw new SetupValidationError(
        SETUP_ERROR_CODES.WEEKLY_WINDOW_INVALID,
        `weeklyWindows[${index}] must satisfy startMinute < endMinute.`,
      );
    }

    return {
      dayOfWeek: window.dayOfWeek,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
    };
  });

  const byDay = new Map<number, WeeklyWindowInput[]>();
  for (const window of normalized) {
    const current = byDay.get(window.dayOfWeek);
    if (current) {
      current.push(window);
      continue;
    }
    byDay.set(window.dayOfWeek, [window]);
  }

  for (const [dayOfWeek, dayWindows] of byDay.entries()) {
    const sortedDay = [...dayWindows].sort(
      (left, right) => left.startMinute - right.startMinute,
    );

    for (let index = 1; index < sortedDay.length; index += 1) {
      if (sortedDay[index - 1].endMinute > sortedDay[index].startMinute) {
        throw new SetupValidationError(
          SETUP_ERROR_CODES.WEEKLY_WINDOW_OVERLAP,
          `weeklyWindows has overlapping ranges for day ${dayOfWeek}.`,
        );
      }
    }
  }

  return [...normalized].sort((left, right) => {
    if (left.dayOfWeek !== right.dayOfWeek) {
      return left.dayOfWeek - right.dayOfWeek;
    }
    return left.startMinute - right.startMinute;
  });
}

export function timezoneForCity(city: ClinicCity): ClinicTimezone {
  return TIMEZONE_BY_CITY[city];
}
