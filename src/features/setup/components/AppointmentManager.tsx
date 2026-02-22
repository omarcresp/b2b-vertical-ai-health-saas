import { usePostHog } from "@posthog/react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
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
import { formatDateInput } from "@/features/setup/utils/date";
import { readLocalizedErrorMessage } from "@/lib/i18n-errors";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AppointmentTable } from "./AppointmentTable";

const APPOINTMENT_PAGE_SIZE = 25;

type Snapshot = NonNullable<SetupModel["snapshot"]>;

export function AppointmentManager({ model }: Readonly<{ model: SetupModel }>) {
  const { t } = useTranslation(["setup", "common"]);

  const snapshot =
    model.snapshotKey !== null && model.snapshot ? model.snapshot : null;

  return (
    <section className={`${CARD_CLASS} p-6`}>
      <h2 className="text-xl font-semibold tracking-tight">
        {t("setup:appointments.title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("setup:appointments.subtitle")}
      </p>

      {snapshot ? (
        <AppointmentManagerContent snapshot={snapshot} />
      ) : (
        <SnapshotUnavailable model={model} />
      )}
    </section>
  );
}

function AppointmentManagerContent({
  snapshot,
}: Readonly<{ snapshot: Snapshot }>) {
  const { t } = useTranslation(["setup", "common"]);
  const posthog = usePostHog();

  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [dateValue, setDateValue] = useState(() => formatDateInput(new Date()));
  const [slotValue, setSlotValue] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [pendingRowAction, setPendingRowAction] = useState<{
    appointmentId: Id<"appointments">;
    action: "confirm" | "cancel";
  } | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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
  const availabilityNowUtcMs = useRef(Math.floor(Date.now() / 60_000) * 60_000);
  const rangeEndUtcMs = useMemo(
    () => rangeStartUtcMs.current + 30 * 24 * 60 * 60 * 1_000,
    [],
  );

  const {
    results: appointmentResults,
    status: appointmentsStatus,
    loadMore,
  } = usePaginatedQuery(
    api.scheduling.listAppointmentsPageForOwner,
    {
      clinicSlug: snapshot.clinic.slug,
      providerName: snapshot.provider.name,
      rangeStartUtcMs: rangeStartUtcMs.current,
      rangeEndUtcMs,
    },
    {
      initialNumItems: APPOINTMENT_PAGE_SIZE,
    },
  );

  const availableSlots = useQuery(api.scheduling.listAvailableSlotsForOwner, {
    clinicSlug: snapshot.clinic.slug,
    providerName: snapshot.provider.name,
    dateLocal: dateValue,
    nowUtcMs: availabilityNowUtcMs.current,
    limit: 10,
  });

  const normalizedAppointments = Array.isArray(appointmentResults)
    ? appointmentResults
    : [];
  const appointments =
    appointmentsStatus === "LoadingFirstPage" &&
    normalizedAppointments.length === 0
      ? undefined
      : normalizedAppointments;

  const hasAvailableSlotsResponse = availableSlots !== undefined;
  const normalizedAvailableSlots = Array.isArray(availableSlots)
    ? availableSlots
    : [];

  useEffect(() => {
    if (
      slotValue &&
      !normalizedAvailableSlots.some(
        (slot) => `${slot.startAtUtcMs}` === slotValue,
      )
    ) {
      setSlotValue("");
    }
  }, [normalizedAvailableSlots, slotValue]);

  const submitCreate = async () => {
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

    try {
      setIsCreating(true);
      await createAppointmentForOwner({
        clinicSlug: snapshot.clinic.slug,
        providerName: snapshot.provider.name,
        patientName: patientNameValue,
        patientPhone: patientPhoneValue,
        startAtUtcMs: parsedSlot,
      });
      setSubmitMessage(t("setup:appointments.messages.created"));
      setPatientName("");
      setPatientPhone("");
      posthog.capture("appointment_created", {
        clinic_slug: snapshot.clinic.slug,
        provider_name: snapshot.provider.name,
        date: dateValue,
        start_at_utc_ms: parsedSlot,
      });
    } catch (error) {
      const errorMessage = readLocalizedErrorMessage(error, t);
      setFormError(errorMessage);
      posthog.capture("appointment_create_failed", {
        clinic_slug: snapshot.clinic.slug,
        provider_name: snapshot.provider.name,
        error_message: errorMessage,
      });
      posthog.captureException(
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      setIsCreating(false);
    }
  };

  const runRowAction = async (
    appointmentId: Id<"appointments">,
    action: "confirm" | "cancel",
  ) => {
    setRowError(null);
    setPendingRowAction({ appointmentId, action });

    try {
      if (action === "confirm") {
        await confirmAppointmentForOwner({ appointmentId });
        posthog.capture("appointment_confirmed", {
          appointment_id: appointmentId,
        });
      } else {
        await cancelAppointmentForOwner({ appointmentId });
        posthog.capture("appointment_cancelled", {
          appointment_id: appointmentId,
        });
      }
    } catch (error) {
      setRowError(readLocalizedErrorMessage(error, t));
    } finally {
      setPendingRowAction(null);
    }
  };

  const canLoadMoreAppointments = appointmentsStatus === "CanLoadMore";
  const isLoadingMoreAppointments = appointmentsStatus === "LoadingMore";

  return (
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
            {normalizedAvailableSlots.map((slot) => (
              <option key={slot.startAtUtcMs} value={`${slot.startAtUtcMs}`}>
                {slot.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasAvailableSlotsResponse && normalizedAvailableSlots.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("setup:appointments.messages.noSlotsForDate")}
        </p>
      ) : null}

      <div className="mt-3 space-y-2">
        {formError ? (
          <p className="text-sm font-medium text-destructive">{formError}</p>
        ) : null}
        {submitMessage ? (
          <p className="text-sm font-medium text-primary">{submitMessage}</p>
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

      {canLoadMoreAppointments || isLoadingMoreAppointments ? (
        <Button
          className="mt-3"
          disabled={isLoadingMoreAppointments}
          onClick={() => loadMore(APPOINTMENT_PAGE_SIZE)}
          type="button"
          variant="outline"
        >
          {isLoadingMoreAppointments
            ? t("setup:appointments.actions.loadingMore")
            : t("setup:appointments.actions.loadMore")}
        </Button>
      ) : null}
    </>
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
