import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AppointmentManager } from "@/features/setup/components/AppointmentManager";
import {
  CityField,
  NumberField,
  TextField,
} from "@/features/setup/components/fields";
import { MetricTile } from "@/features/setup/components/MetricTile";
import { SnapshotPanel } from "@/features/setup/components/SnapshotPanel";
import { StatusAndSubmit } from "@/features/setup/components/StatusAndSubmit";
import {
  CARD_CLASS,
  DAY_VALUES,
  FIELD_LABEL_CLASS,
  INPUT_CLASS,
  TEMPLATE_PRESETS,
} from "@/features/setup/constants";
import type { SetupModel } from "@/features/setup/hooks/useSetupModel";
import type { DayValue, TemplatePreset } from "@/features/setup/types";
import { getDayLabel } from "@/features/setup/utils/i18n";
import { applyTemplate } from "@/features/setup/utils/payload";
import { computeWeeklyMinutes } from "@/features/setup/utils/schedule";
import { parseTimeToMinute } from "@/features/setup/utils/time";
import { DaySummaryCard } from "./DaySummaryCard";
import { TemplateButton } from "./TemplateButton";

export function PlannerSimulatorWorkspace({
  model,
  showSnapshot = true,
  showAppointments = true,
}: Readonly<{
  model: SetupModel;
  showSnapshot?: boolean;
  showAppointments?: boolean;
}>) {
  const { t } = useTranslation(["setup", "common"]);
  const [focusedDay, setFocusedDay] = useState<DayValue>(1);
  const [activeTemplate, setActiveTemplate] = useState<
    TemplatePreset["id"] | null
  >(null);

  const weeklyMinutes = useMemo(
    () => computeWeeklyMinutes(model.windows),
    [model.windows],
  );
  const slotStep = Number(model.draft.slotStepMin);
  const duration = Number(model.draft.appointmentDurationMin);
  const horizonDays = Number(model.draft.bookingHorizonDays);

  const stepBasedSlots =
    Number.isInteger(slotStep) && slotStep > 0
      ? Math.floor(weeklyMinutes / slotStep)
      : 0;
  const durationBasedSlots =
    Number.isInteger(duration) && duration > 0
      ? Math.floor(weeklyMinutes / duration)
      : 0;
  const horizonEstimate =
    Number.isInteger(horizonDays) && horizonDays > 0
      ? Math.floor((stepBasedSlots * horizonDays) / 7)
      : 0;

  const focusedDayWindows = model.windows.filter(
    (window) => window.dayOfWeek === focusedDay,
  );

  const daySummaries = DAY_VALUES.map((day) => {
    const dayWindows = model.windows.filter(
      (window) => window.dayOfWeek === day,
    );
    const openMinutes = dayWindows.reduce((total, window) => {
      const start = parseTimeToMinute(window.start);
      const end = parseTimeToMinute(window.end);
      if (start === null || end === null || start >= end) {
        return total;
      }

      return total + (end - start);
    }, 0);

    return {
      value: day,
      label: getDayLabel(day, t),
      count: dayWindows.length,
      openMinutes,
      windows: dayWindows,
    };
  });

  const maxDayMinutes = Math.max(
    ...daySummaries.map((summary) => summary.openMinutes),
    1,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <section className={`${CARD_CLASS} p-6 md:p-7`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              {t("setup:planner.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("setup:planner.subtitle")}
            </p>
          </div>
          <Button
            className="rounded-full"
            onClick={() => model.addWindow(focusedDay)}
            type="button"
            variant="outline"
          >
            {t("setup:planner.addWindowToDay", {
              day: getDayLabel(focusedDay, t),
            })}
          </Button>
        </div>

        <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {t("setup:planner.templateLabel")}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {TEMPLATE_PRESETS.map((preset) => (
            <TemplateButton
              activeTemplate={activeTemplate}
              key={preset.id}
              onPick={(presetId) => {
                applyTemplate(model.replaceWindows, presetId);
                setActiveTemplate(presetId);
              }}
              preset={preset}
            />
          ))}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {daySummaries.map((day) => (
            <DaySummaryCard
              day={day}
              key={day.value}
              maxDayMinutes={maxDayMinutes}
              onFocus={setFocusedDay}
              selected={day.value === focusedDay}
            />
          ))}
        </div>

        <p className="mt-8 text-sm font-semibold">
          {t("setup:planner.focusedDay", { day: getDayLabel(focusedDay, t) })}
        </p>

        {focusedDayWindows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("setup:planner.emptyFocusedDay")}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {focusedDayWindows.map((window) => (
              <div
                className="grid gap-2 rounded-xl border border-border bg-background/80 p-3 sm:grid-cols-[1fr_1fr_auto]"
                key={window.id}
              >
                <label className={`${FIELD_LABEL_CLASS} text-xs`}>
                  {t("setup:planner.fields.start")}
                  <input
                    className={INPUT_CLASS}
                    onChange={(event) =>
                      model.updateWindow(window.id, {
                        start: event.target.value,
                      })
                    }
                    value={window.start}
                  />
                </label>
                <label className={`${FIELD_LABEL_CLASS} text-xs`}>
                  {t("setup:planner.fields.end")}
                  <input
                    className={INPUT_CLASS}
                    onChange={(event) =>
                      model.updateWindow(window.id, { end: event.target.value })
                    }
                    value={window.end}
                  />
                </label>
                <div className="flex items-end">
                  <Button
                    onClick={() => model.removeWindow(window.id)}
                    type="button"
                    variant="ghost"
                  >
                    {t("common:actions.remove")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-6 xl:sticky xl:top-6 xl:self-start">
        <article className={`${CARD_CLASS} p-6 md:p-7`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">
              {t("setup:capacity.title")}
            </h2>
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {t("common:status.live")}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("setup:capacity.subtitle")}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <NumberField
              label={t("setup:capacity.fields.appointmentDuration")}
              min={1}
              onChange={(value) =>
                model.setDraftField("appointmentDurationMin", value)
              }
              value={model.draft.appointmentDurationMin}
            />
            <NumberField
              label={t("setup:capacity.fields.slotStep")}
              min={1}
              onChange={(value) => model.setDraftField("slotStepMin", value)}
              value={model.draft.slotStepMin}
            />
            <NumberField
              label={t("setup:capacity.fields.leadTime")}
              min={0}
              onChange={(value) => model.setDraftField("leadTimeMin", value)}
              value={model.draft.leadTimeMin}
            />
            <NumberField
              label={t("setup:capacity.fields.bookingHorizon")}
              min={1}
              onChange={(value) =>
                model.setDraftField("bookingHorizonDays", value)
              }
              value={model.draft.bookingHorizonDays}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricTile
              label={t("setup:metrics.weeklyOpenMinutes")}
              value={`${weeklyMinutes}`}
            />
            <MetricTile
              label={t("setup:metrics.slotsByStep")}
              value={`${stepBasedSlots}`}
            />
            <MetricTile
              label={t("setup:metrics.visitsByDuration")}
              value={`${durationBasedSlots}`}
            />
            <MetricTile
              label={t("setup:metrics.horizonSlotEstimate")}
              value={`${horizonEstimate}`}
            />
          </div>
        </article>

        <article className={`${CARD_CLASS} p-6 md:p-7`}>
          <h2 className="text-xl font-semibold tracking-tight">
            {t("setup:identity.title")}
          </h2>
          <div className="mt-3 space-y-3">
            <TextField
              label={t("setup:identity.fields.clinicName")}
              onChange={(value) => model.setDraftField("clinicName", value)}
              placeholder={t("setup:identity.placeholders.clinicName")}
              value={model.draft.clinicName}
            />
            <TextField
              label={t("setup:identity.fields.providerName")}
              onChange={(value) => model.setDraftField("providerName", value)}
              placeholder={t("setup:identity.placeholders.providerName")}
              value={model.draft.providerName}
            />
            <CityField
              onChange={(value) => model.setDraftField("city", value)}
              value={model.draft.city}
            />
          </div>
        </article>

        <StatusAndSubmit model={model} />
        {showSnapshot ? <SnapshotPanel model={model} /> : null}
        {showAppointments ? <AppointmentManager model={model} /> : null}
      </section>
    </div>
  );
}
