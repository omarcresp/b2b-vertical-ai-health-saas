const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeToMinute(value: string) {
  const normalized = value.trim();
  if (normalized === "24:00") {
    return 1_440;
  }

  const match = TIME_PATTERN.exec(normalized);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}
