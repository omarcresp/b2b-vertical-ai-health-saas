const OFFSET_PATTERN = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/;

type ParsedDate = {
  year: number;
  month: number;
  day: number;
};

export function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value: string): ParsedDate | null {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
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

export function combineDateAndMinuteToUtcMs(
  dateValue: string,
  minuteOfDay: number,
  timezone: string,
) {
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1_439
  ) {
    return null;
  }

  const parsedDate = parseDateInput(dateValue);
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

  const guessedOffset = getOffsetMinutes(timezone, wallClockUtcMs);
  if (guessedOffset === null) {
    return null;
  }

  let utcMs = wallClockUtcMs - guessedOffset * 60 * 1_000;
  const correctedOffset = getOffsetMinutes(timezone, utcMs);
  if (correctedOffset === null) {
    return null;
  }

  if (correctedOffset !== guessedOffset) {
    utcMs = wallClockUtcMs - correctedOffset * 60 * 1_000;
  }

  return utcMs;
}

export function formatLocalDateTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
