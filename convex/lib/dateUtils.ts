import type { Doc } from "../_generated/dataModel";

export const MS_PER_MINUTE = 60 * 1_000;
export const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

const DATE_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_PATTERN = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/;

const CITY_LABEL_BY_VALUE = {
  cdmx: "CDMX",
  bogota: "Bogota",
} as const satisfies Record<Doc<"clinics">["city"], string>;

export type ParsedLocalDate = {
  year: number;
  month: number;
  day: number;
};

function parseDatePart(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function epochDay(parsedDate: ParsedLocalDate) {
  return Math.floor(
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day) /
      MS_PER_DAY,
  );
}

export function parseDateLocal(dateLocal: string): ParsedLocalDate | null {
  if (!DATE_LOCAL_PATTERN.test(dateLocal)) {
    return null;
  }

  const [yearText, monthText, dayText] = dateLocal.split("-");
  const year = parseDatePart(yearText);
  const month = parseDatePart(monthText);
  const day = parseDatePart(dayText);

  if (year === null || month === null || day === null) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function formatDateLocal(parsedDate: ParsedLocalDate) {
  return `${parsedDate.year.toString().padStart(4, "0")}-${parsedDate.month
    .toString()
    .padStart(2, "0")}-${parsedDate.day.toString().padStart(2, "0")}`;
}

function getOffsetMinutes(timezone: string, utcMs: number): number | null {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const offsetPart = formatter
    .formatToParts(new Date(utcMs))
    .find((part) => part.type === "timeZoneName")?.value;

  if (!offsetPart) {
    return null;
  }

  const match = OFFSET_PATTERN.exec(offsetPart);
  if (!match) {
    return null;
  }

  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

export function extractLocalDateMinuteForUtcMs(
  utcMs: number,
  timezone: string,
): { dateLocal: string; minuteOfDay: number } | null {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcMs));
  const year = parseDatePart(
    parts.find((part) => part.type === "year")?.value ?? "",
  );
  const month = parseDatePart(
    parts.find((part) => part.type === "month")?.value ?? "",
  );
  const day = parseDatePart(
    parts.find((part) => part.type === "day")?.value ?? "",
  );
  const hour = parseDatePart(
    parts.find((part) => part.type === "hour")?.value ?? "",
  );
  const minute = parseDatePart(
    parts.find((part) => part.type === "minute")?.value ?? "",
  );

  if (
    year === null ||
    month === null ||
    day === null ||
    hour === null ||
    minute === null
  ) {
    return null;
  }

  const dateLocal = formatDateLocal({ year, month, day });
  return {
    dateLocal,
    minuteOfDay: hour * 60 + minute,
  };
}

// Converts a local calendar date + minute-of-day to UTC milliseconds, correctly
// handling DST transitions. A two-pass offset correction is used: the initial
// UTC estimate is computed by treating the wall-clock as if UTC, then the
// timezone offset at that estimate is checked and corrected. This resolves DST
// "gaps" (spring-forward) and "folds" (fall-back) — equivalent to the
// Temporal API's `disambiguation: "compatible"` semantics.
export function combineLocalDateMinuteToUtcMs(
  dateLocal: string,
  minuteOfDay: number,
  timezone: Doc<"clinics">["timezone"],
) {
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1_439
  ) {
    return null;
  }

  const parsedDate = parseDateLocal(dateLocal);
  if (!parsedDate) {
    return null;
  }

  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  const wallClockUtcMs = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    hours,
    minutes,
    0,
    0,
  );

  const guessedOffsetMinutes = getOffsetMinutes(timezone, wallClockUtcMs);
  if (guessedOffsetMinutes === null) {
    return null;
  }

  let utcMs = wallClockUtcMs - guessedOffsetMinutes * MS_PER_MINUTE;
  const correctedOffsetMinutes = getOffsetMinutes(timezone, utcMs);
  if (correctedOffsetMinutes === null) {
    return null;
  }

  if (correctedOffsetMinutes !== guessedOffsetMinutes) {
    utcMs = wallClockUtcMs - correctedOffsetMinutes * MS_PER_MINUTE;
  }

  return utcMs;
}

export function formatClinicLabel24hWithTz(
  startAtUtcMs: number,
  timezone: Doc<"clinics">["timezone"],
  city: Doc<"clinics">["city"],
) {
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const tzFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const timeLabel = timeFormatter.format(new Date(startAtUtcMs));
  const timezoneLabel =
    tzFormatter
      .formatToParts(new Date(startAtUtcMs))
      .find((part) => part.type === "timeZoneName")?.value ?? timezone;

  return `${timeLabel} ${timezoneLabel} (${CITY_LABEL_BY_VALUE[city]})`;
}
