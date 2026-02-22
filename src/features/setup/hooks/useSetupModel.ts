import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CITY_OPTIONS } from "@/features/setup/constants";
import type {
  SetupDraft,
  SnapshotKey,
  WindowRow,
} from "@/features/setup/types";
import { buildSetupPayload } from "@/features/setup/utils/payload";
import { readLocalizedErrorMessage } from "@/lib/i18n-errors";
import { api } from "../../../../convex/_generated/api";

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextWindowId = useRef(2);
  const onSnapshotKeyChangeRef = useRef(onSnapshotKeyChange);

  useEffect(() => {
    onSnapshotKeyChangeRef.current = onSnapshotKeyChange;
  }, [onSnapshotKeyChange]);

  const upsertSetup = useMutation(api.setup.upsertClinicProviderSetup);
  const snapshot = useQuery(
    api.setup.getSetupSnapshot,
    isAuthenticated && snapshotKey ? snapshotKey : "skip",
  );
  const latestSetupKey = useQuery(
    api.setup.getMyLatestSetupKey,
    isAuthenticated ? { intent: "bootstrap" } : "skip",
  );
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

  const submitSetup = async () => {
    setFormError(null);
    setSubmitMessage(null);

    const built = buildSetupPayload(draft, windows, t);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await upsertSetup(built.payload);
      setSnapshotKey(result);
      onSnapshotKeyChangeRef.current?.(result);
      setSubmitMessage(t("setup:submit.saved"));
    } catch (error) {
      setFormError(readLocalizedErrorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    draft,
    windows,
    formError,
    submitMessage,
    snapshotKey,
    setSnapshotKey,
    snapshot,
    isSubmitting,
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
