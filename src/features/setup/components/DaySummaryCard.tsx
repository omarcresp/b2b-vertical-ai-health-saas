import { useTranslation } from "react-i18next";
import type { SetupModel } from "@/features/setup/hooks/useSetupModel";
import type { DayValue } from "@/features/setup/types";

export function DaySummaryCard({
  day,
  maxDayMinutes,
  onFocus,
  selected,
}: Readonly<{
  day: {
    value: DayValue;
    label: string;
    count: number;
    openMinutes: number;
    windows: SetupModel["windows"];
  };
  maxDayMinutes: number;
  onFocus: (day: DayValue) => void;
  selected: boolean;
}>) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <button
      className={`group rounded-xl border p-3 text-left transition ${
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-background hover:border-primary/30 hover:bg-muted/20"
      }`}
      onClick={() => onFocus(day.value)}
      type="button"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{day.label}</p>
        <span className="text-[11px] text-muted-foreground">
          {Math.round((day.openMinutes / maxDayMinutes) * 100)}%
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("setup:planner.daySummary", {
          count: day.count,
          minutes: day.openMinutes,
        })}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{
            width: `${Math.max(6, Math.round((day.openMinutes / maxDayMinutes) * 100))}%`,
          }}
        />
      </div>
      <div className="mt-2 space-y-1">
        {day.windows.slice(0, 2).map((window) => (
          <p className="text-xs text-muted-foreground" key={window.id}>
            {window.start} - {window.end}
          </p>
        ))}
        {day.windows.length > 2 ? (
          <p className="text-xs text-muted-foreground">
            {t("setup:planner.moreWindows", {
              count: day.windows.length - 2,
            })}
          </p>
        ) : null}
      </div>
    </button>
  );
}
