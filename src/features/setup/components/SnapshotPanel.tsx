import { useTranslation } from "react-i18next";
import { CARD_CLASS } from "@/features/setup/constants";
import type { SetupModel } from "@/features/setup/hooks/useSetupModel";
import type { SetupTFunction } from "@/features/setup/types";
import { getCityLabel, getDayLabel } from "@/features/setup/utils/i18n";
import { formatMinute } from "@/features/setup/utils/schedule";

export function SnapshotPanel({ model }: Readonly<{ model: SetupModel }>) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <section className={`${CARD_CLASS} p-6`}>
      <h2 className="text-xl font-semibold tracking-tight">
        {t("setup:snapshot.title")}
      </h2>
      {renderSnapshotContent(model, t)}
    </section>
  );
}

function renderSnapshotContent(model: SetupModel, t: SetupTFunction) {
  if (model.snapshotKey === null) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {t("setup:snapshot.empty")}
      </p>
    );
  }

  if (model.snapshot === undefined) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {t("setup:snapshot.loading")}
      </p>
    );
  }

  if (model.snapshot === null) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        {t("setup:snapshot.missing")}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <p>
        <span className="font-semibold">
          {t("setup:snapshot.labels.clinic")}:
        </span>{" "}
        {model.snapshot.clinic.name} ({model.snapshot.clinic.slug})
      </p>
      <p>
        <span className="font-semibold">
          {t("setup:snapshot.labels.city")}:
        </span>{" "}
        {getCityLabel(model.snapshot.clinic.city, t)} |{" "}
        <span className="font-semibold">
          {t("setup:snapshot.labels.timezone")}:
        </span>{" "}
        {model.snapshot.clinic.timezone}
      </p>
      <p>
        <span className="font-semibold">
          {t("setup:snapshot.labels.provider")}:
        </span>{" "}
        {model.snapshot.provider.name}
      </p>
      <p>
        <span className="font-semibold">
          {t("setup:snapshot.labels.config")}:
        </span>{" "}
        {t("setup:snapshot.config", {
          duration: model.snapshot.clinic.appointmentDurationMin,
          step: model.snapshot.clinic.slotStepMin,
        })}
      </p>
      <div>
        <p className="font-semibold">{t("setup:snapshot.labels.windows")}</p>
        <ul className="mt-1 list-inside list-disc text-muted-foreground">
          {model.snapshot.weeklyWindows.map(
            (window: (typeof model.snapshot.weeklyWindows)[number]) => {
              const day = getDayLabel(window.dayOfWeek, t);
              return (
                <li key={window._id}>
                  {day}: {formatMinute(window.startMinute)} -{" "}
                  {formatMinute(window.endMinute)}
                </li>
              );
            },
          )}
        </ul>
      </div>
    </div>
  );
}
