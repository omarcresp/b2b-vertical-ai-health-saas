import { useConvexMutation } from "@convex-dev/react-query";
import { usePostHog } from "@posthog/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "#convex/_generated/api";
import { CITY_OPTIONS } from "@/features/setup/constants";
import type {
  SetupDraft,
  SnapshotKey,
  WindowRow,
} from "@/features/setup/types";
import { buildSetupPayload } from "@/features/setup/utils/payload";
import { readLocalizedErrorMessage } from "@/lib/i18n-errors";
import { latestSetupKeyQuery, setupSnapshotQuery } from "@/lib/queries";

type UseSetupModelArgs = {
  initialSnapshotKey?: SnapshotKey | null;
  onSnapshotKeyChange?: (key: SnapshotKey) => void;
};

export function useSetupModel({
  initialSnapshotKey = null,
  onSnapshotKeyChange,
}: Readonly<UseSetupModelArgs> = {}) {
  const { user } = useAuth();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const isAuthenticated = Boolean(user) && isConvexAuthenticated;
  const { t } = useTranslation(["setup", "common"]);
  const posthog = usePostHog();

  const [draft, setDraft] = useState<SetupDraft>({
    clinicName: "",
    city: "cdmx",
    providerName: "",
    appointmentDurationMin: "30",
    slotStepMin: "15",
    leadTimeMin: "60",
    bookingHorizonDays: "30",
  });
  const [windows, setWindows] = useState<WindowRow[]>([
    { id: 1, dayOfWeek: 1, start: "09:00", end: "17:00" },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [snapshotKey, setSnapshotKey] = useState<SnapshotKey | null>(
    initialSnapshotKey,
  );

  const nextWindowId = useRef(2);
  const onSnapshotKeyChangeRef = useRef(onSnapshotKeyChange);

  useEffect(() => {
    onSnapshotKeyChangeRef.current = onSnapshotKeyChange;
  }, [onSnapshotKeyChange]);

  const convexUpsertSetup = useConvexMutation(
    api.setup.upsertClinicProviderSetup,
  );
  const upsertSetup = useMutation({
    mutationFn: convexUpsertSetup,
    onSuccess: (result, variables) => {
      setSnapshotKey(result);
      onSnapshotKeyChangeRef.current?.(result);
      setSubmitMessage(t("setup:submit.saved"));
      posthog.capture("setup_submitted", {
        clinic_name: variables.clinicName,
        city: variables.city,
        appointment_duration_min: variables.appointmentDurationMin,
        slot_step_min: variables.slotStepMin,
        booking_horizon_days: variables.bookingHorizonDays,
        window_count: variables.weeklyWindows.length,
        clinic_slug: result.clinicSlug,
      });
    },
    onError: (error, variables) => {
      const errorMessage = readLocalizedErrorMessage(error, t);
      setFormError(errorMessage);
      posthog.capture("setup_submit_failed", {
        clinic_name: variables.clinicName,
        error_message: errorMessage,
      });
      posthog.captureException(
        error instanceof Error ? error : new Error(String(error)),
      );
    },
  });

  const { data: snapshot } = useQuery({
    ...setupSnapshotQuery(snapshotKey ?? { clinicSlug: "", providerName: "" }),
    enabled: isAuthenticated && snapshotKey !== null,
  });

  const { data: latestSetupKey } = useQuery({
    ...latestSetupKeyQuery(),
    enabled: isAuthenticated,
  });
  const bootstrappedSetupKey = latestSetupKey ?? null;

  const timezone = useMemo(
    () => CITY_OPTIONS.find((option) => option.value === draft.city)?.timezone,
    [draft.city],
  );

  const setDraftField = <Key extends keyof SetupDraft>(
    field: Key,
    value: SetupDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const addWindow = (dayOfWeek: WindowRow["dayOfWeek"] = 1) => {
    setWindows((current) => [
      ...current,
      {
        id: nextWindowId.current,
        dayOfWeek,
        start: "09:00",
        end: "17:00",
      },
    ]);
    nextWindowId.current += 1;
  };

  const updateWindow = (id: number, patch: Partial<Omit<WindowRow, "id">>) => {
    setWindows((current) =>
      current.map((window) =>
        window.id === id ? { ...window, ...patch } : window,
      ),
    );
  };

  const removeWindow = (id: number) => {
    setWindows((current) => {
      if (current.length === 1) {
        return current;
      }
      return current.filter((window) => window.id !== id);
    });
  };

  const replaceWindows = (
    nextWindows: Array<{ dayOfWeek: number; start: string; end: string }>,
  ) => {
    setWindows(
      nextWindows.map((window, index) => ({
        id: index + 1,
        dayOfWeek: window.dayOfWeek as WindowRow["dayOfWeek"],
        start: window.start,
        end: window.end,
      })),
    );
    nextWindowId.current = nextWindows.length + 1;
  };

  useEffect(() => {
    if (!initialSnapshotKey) {
      return;
    }

    setSnapshotKey((current) => {
      if (
        current?.clinicSlug === initialSnapshotKey.clinicSlug &&
        current?.providerName === initialSnapshotKey.providerName
      ) {
        return current;
      }

      return initialSnapshotKey;
    });
  }, [initialSnapshotKey]);

  useEffect(() => {
    if (snapshotKey !== null || !bootstrappedSetupKey) {
      return;
    }

    setSnapshotKey(bootstrappedSetupKey);
    onSnapshotKeyChangeRef.current?.(bootstrappedSetupKey);
  }, [bootstrappedSetupKey, snapshotKey]);

  const submitSetup = () => {
    setFormError(null);
    setSubmitMessage(null);

    const built = buildSetupPayload(draft, windows, t);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    upsertSetup.mutate(built.payload);
  };

  return {
    draft,
    windows,
    formError,
    submitMessage,
    snapshotKey,
    setSnapshotKey,
    snapshot,
    isSubmitting: upsertSetup.isPending,
    timezone,
    setDraftField,
    addWindow,
    updateWindow,
    removeWindow,
    replaceWindows,
    submitSetup,
  };
}

export type SetupModel = ReturnType<typeof useSetupModel>;
