import type { WindowRow } from "@/features/setup/types";
import { parseTimeToMinute } from "@/features/setup/utils/time";
import { parseDateInput } from "./date";

export function formatMinute(value: number) {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function computeWeeklyMinutes(windows: WindowRow[]) {
  return windows.reduce((total, window) => {
    const start = parseTimeToMinute(window.start);
    const end = parseTimeToMinute(window.end);

    if (start === null || end === null || start >= end) {
      return total;
    }

    return total + (end - start);
  }, 0);
}

export function generateScheduleBasedTimeslots(args: {
  dateValue: string;
  weeklyWindows: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>;
  slotStepMin: number;
  appointmentDurationMin: number;
}) {
  if (
    !Number.isInteger(args.slotStepMin) ||
    !Number.isInteger(args.appointmentDurationMin) ||
    args.slotStepMin <= 0 ||
    args.appointmentDurationMin <= 0
  ) {
    return [] as number[];
  }

  const parsedDate = parseDateInput(args.dateValue);
  if (!parsedDate) {
    return [] as number[];
  }

  const dayOfWeek = new Date(
    Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day),
  ).getUTCDay();

  const windows = args.weeklyWindows
    .filter((window) => window.dayOfWeek === dayOfWeek)
    .sort((left, right) => left.startMinute - right.startMinute);

  const slots: number[] = [];
  for (const window of windows) {
    for (
      let minute = window.startMinute;
      minute + args.appointmentDurationMin <= window.endMinute;
      minute += args.slotStepMin
    ) {
      slots.push(minute);
    }
  }

  return slots;
}

export function appointmentStatusKey(appointment: {
  status: "scheduled" | "canceled";
  confirmedAtUtcMs?: number;
}) {
  if (appointment.status === "canceled") {
    return "setup:appointments.status.canceled" as const;
  }
  if (appointment.confirmedAtUtcMs !== undefined) {
    return "setup:appointments.status.scheduledConfirmed" as const;
  }
  return "setup:appointments.status.scheduled" as const;
}
