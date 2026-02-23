import type { Doc } from "../_generated/dataModel";
import {
  epochDay,
  extractLocalDateMinuteForUtcMs,
  MS_PER_DAY,
  MS_PER_MINUTE,
  parseDateLocal,
} from "./dateUtils";

export function generateCandidateStartsForDate(
  weeklyWindows: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>,
  slotStepMin: number,
  appointmentDurationMin: number,
  dateLocal: string,
) {
  if (
    !Number.isInteger(slotStepMin) ||
    !Number.isInteger(appointmentDurationMin) ||
    slotStepMin <= 0 ||
    appointmentDurationMin <= 0
  ) {
    return [] as number[];
  }

  const parsedDate = parseDateLocal(dateLocal);
  if (!parsedDate) {
    return [] as number[];
  }

  const dayOfWeek = new Date(
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day),
  ).getUTCDay();

  const dayWindows = weeklyWindows
    .filter((window) => window.dayOfWeek === dayOfWeek)
    .sort((left, right) => left.startMinute - right.startMinute);

  const starts: number[] = [];
  for (const window of dayWindows) {
    for (
      let minute = window.startMinute;
      minute + appointmentDurationMin <= window.endMinute;
      minute += slotStepMin
    ) {
      starts.push(minute);
    }
  }

  return starts;
}

export function filterByLeadTimeAndHorizon(args: {
  candidateStartsUtcMs: number[];
  nowUtcMs: number;
  leadTimeMin: number;
  bookingHorizonDays: number;
  clinicTimezone: Doc<"clinics">["timezone"];
  dateLocal: string;
}) {
  if (
    !Number.isInteger(args.leadTimeMin) ||
    !Number.isInteger(args.bookingHorizonDays) ||
    args.leadTimeMin < 0 ||
    args.bookingHorizonDays <= 0
  ) {
    return [] as number[];
  }

  const targetDate = parseDateLocal(args.dateLocal);
  const nowLocal = extractLocalDateMinuteForUtcMs(
    args.nowUtcMs,
    args.clinicTimezone,
  );
  if (!targetDate || !nowLocal) {
    return [] as number[];
  }

  const nowLocalDate = parseDateLocal(nowLocal.dateLocal);
  if (!nowLocalDate) {
    return [] as number[];
  }

  const diffDays = epochDay(targetDate) - epochDay(nowLocalDate);
  if (diffDays < 0 || diffDays > args.bookingHorizonDays) {
    return [] as number[];
  }

  const minStartUtcMs = args.nowUtcMs + args.leadTimeMin * MS_PER_MINUTE;
  const maxStartUtcMs = args.nowUtcMs + args.bookingHorizonDays * MS_PER_DAY;

  return args.candidateStartsUtcMs.filter(
    (startAtUtcMs) =>
      startAtUtcMs >= minStartUtcMs && startAtUtcMs <= maxStartUtcMs,
  );
}

export function isOverlapping(
  startAtUtcMs: number,
  endAtUtcMs: number,
  otherStartAtUtcMs: number,
  otherEndAtUtcMs: number,
) {
  return startAtUtcMs < otherEndAtUtcMs && otherStartAtUtcMs < endAtUtcMs;
}
