import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { TextField } from "@/features/setup/components/fields";
import {
  CARD_CLASS,
  FIELD_LABEL_CLASS,
  INPUT_CLASS,
} from "@/features/setup/constants";
import type { SetupModel } from "@/features/setup/hooks/useSetupModel";
import {
  combineDateAndMinuteToUtcMs,
  formatDateInput,
} from "@/features/setup/utils/date";
import { readLocalizedErrorMessage } from "@/lib/i18n-errors";
import { api } from "../../../../convex/_generated/api";
import {
  formatMinute,
  generateScheduleBasedTimeslots,
} from "../utils/schedule";
import { AppointmentTable } from "./AppointmentTable";

export function AppointmentManager({ model }: Readonly<{ model: SetupModel }>) {
  const { t } = useTranslation(["setup", "common"]);

  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [dateValue, setDateValue] = useState(() => formatDateInput(new Date()));
  const [slotValue, setSlotValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [pendingRowAction, setPendingRowAction] = useState<{
    appointmentId: string;
    action: "confirm" | "cancel";
  } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const snapshot =
    model.snapshotKey !== null && model.snapshot ? model.snapshot : null;

  const createAppointmentForOwner = useMutation(
    api.scheduling.createAppointmentForOwner,
  );
  const confirmAppointmentForOwner = useMutation(
    api.scheduling.confirmAppointmentForOwner,
  );
  const cancelAppointmentForOwner = useMutation(
    api.scheduling.cancelAppointmentForOwner,
  );

  const rangeStartUtcMs = useRef(Date.now());
  const rangeEndUtcMs = useMemo(
    () => rangeStartUtcMs.current + 30 * 24 * 60 * 60 * 1_000,
    [],
  );

  const appointments = useQuery(
    api.scheduling.listAppointmentsForOwner,
    snapshot
      ? {
          clinicSlug: snapshot.clinic.slug,
          providerName: snapshot.provider.name,
          rangeStartUtcMs: rangeStartUtcMs.current,
          rangeEndUtcMs,
          limit: 200,
        }
      : "skip",
  );

  const slotMinutes = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return generateScheduleBasedTimeslots({
      dateValue,
      weeklyWindows: snapshot.weeklyWindows,
      slotStepMin: snapshot.clinic.slotStepMin,
      appointmentDurationMin: snapshot.clinic.appointmentDurationMin,
    });
  }, [dateValue, snapshot]);

  useEffect(() => {
    if (slotValue && !slotMinutes.some((slot) => `${slot}` === slotValue)) {
      setSlotValue("");
    }
  }, [slotMinutes, slotValue]);

  const submitCreate = async () => {
    if (!snapshot) {
      return;
    }

    setFormError(null);
    setSubmitMessage(null);
    setRowError(null);

    const patientNameValue = patientName.trim();
    const patientPhoneValue = patientPhone.trim();
    const parsedSlot = Number(slotValue);

    if (
      !patientNameValue ||
      !patientPhoneValue ||
      !dateValue ||
      !Number.isInteger(parsedSlot)
    ) {
      setFormError(t("setup:appointments.messages.missingFields"));
      return;
    }

    const startAtUtcMs = combineDateAndMinuteToUtcMs(
      dateValue,
      parsedSlot,
      snapshot.clinic.timezone,
    );
    if (startAtUtcMs === null) {
      setFormError(t("setup:appointments.messages.missingFields"));
      return;
    }

    try {
      setIsCreating(true);
      await createAppointmentForOwner({
        clinicSlug: snapshot.clinic.slug,
        providerName: snapshot.provider.name,
        patientName: patientNameValue,
        patientPhone: patientPhoneValue,
        startAtUtcMs,
      });
      setSubmitMessage(t("setup:appointments.messages.created"));
      setPatientName("");
      setPatientPhone("");
    } catch (error) {
      setFormError(readLocalizedErrorMessage(error, t));
    } finally {
      setIsCreating(false);
    }
  };

  const runRowAction = async (
    appointmentId: string,
    action: "confirm" | "cancel",
  ) => {
    setRowError(null);
    setPendingRowAction({ appointmentId, action });

    try {
      if (action === "confirm") {
        await confirmAppointmentForOwner({
          appointmentId: appointmentId as Parameters<
            typeof confirmAppointmentForOwner
          >[0]["appointmentId"],
        });
      } else {
        await cancelAppointmentForOwner({
          appointmentId: appointmentId as Parameters<
            typeof cancelAppointmentForOwner
          >[0]["appointmentId"],
        });
      }
    } catch (error) {
      setRowError(readLocalizedErrorMessage(error, t));
    } finally {
      setPendingRowAction(null);
    }
  };

  return (
    <section className={`${CARD_CLASS} p-6`}>
      <h2 className="text-xl font-semibold tracking-tight">
        {t("setup:appointments.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("setup:appointments.subtitle")}
      </p>

      {!snapshot ? (
        <SnapshotUnavailable model={model} />
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <TextField
              label={t("setup:appointments.fields.patientName")}
              onChange={setPatientName}
              placeholder={t("setup:appointments.placeholders.patientName")}
              value={patientName}
            />
            <TextField
              label={t("setup:appointments.fields.patientPhone")}
              onChange={setPatientPhone}
              placeholder={t("setup:appointments.placeholders.patientPhone")}
              value={patientPhone}
            />
            <label className={FIELD_LABEL_CLASS}>
              {t("setup:appointments.fields.date")}
              <input
                className={INPUT_CLASS}
                onChange={(event) => setDateValue(event.target.value)}
                type="date"
                value={dateValue}
              />
            </label>
            <label className={FIELD_LABEL_CLASS}>
              {t("setup:appointments.fields.timeslot")}
              <select
                className={INPUT_CLASS}
                onChange={(event) => setSlotValue(event.target.value)}
                value={slotValue}
              >
                <option value="">--</option>
                {slotMinutes.map((slot) => (
                  <option key={slot} value={`${slot}`}>
                    {formatMinute(slot)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {slotMinutes.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("setup:appointments.messages.noSlotsForDate")}
            </p>
          ) : null}

          <div className="mt-3 space-y-2">
            {formError ? (
              <p className="text-sm font-medium text-destructive">
                {formError}
              </p>
            ) : null}
            {submitMessage ? (
              <p className="text-sm font-medium text-primary">
                {submitMessage}
              </p>
            ) : null}
            {rowError ? (
              <p className="text-sm font-medium text-destructive">{rowError}</p>
            ) : null}
          </div>

          <Button
            className="mt-4 rounded-xl"
            onClick={() => void submitCreate()}
            type="button"
          >
            {isCreating
              ? t("setup:appointments.actions.creating")
              : t("setup:appointments.actions.create")}
          </Button>

          <AppointmentTable
            appointments={appointments}
            pendingRowAction={pendingRowAction}
            runRowAction={runRowAction}
          />
        </>
      )}
    </section>
  );
}

function SnapshotUnavailable({ model }: Readonly<{ model: SetupModel }>) {
  const { t } = useTranslation(["setup", "common"]);
  const message =
    model.snapshot === undefined && model.snapshotKey !== null
      ? t("setup:appointments.messages.loading")
      : t("setup:appointments.blocked");

  return <p className="mt-3 text-sm text-muted-foreground">{message}</p>;
}
