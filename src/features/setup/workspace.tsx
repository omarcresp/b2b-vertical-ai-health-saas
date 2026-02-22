import { useAuth } from "@workos-inc/authkit-react";
import {
  Authenticated,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import type { Namespace, TFunction } from "i18next";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { parseTimeToMinute } from "@/features/setup/utils/time";
import { readLocalizedErrorMessage } from "@/lib/i18n-errors";
import { api } from "../../../convex/_generated/api";
import { DEFAULT_LOCALE, type SupportedLocale } from "../../../shared/locales";

const CITY_OPTIONS = [
  {
    value: "cdmx",
    timezone: "America/Mexico_City",
  },
  {
    value: "bogota",
    timezone: "America/Bogota",
  },
] as const;

const CITY_LABEL_KEYS = {
  cdmx: "setup:cities.cdmx",
  bogota: "setup:cities.bogota",
} as const;

const DAY_VALUES = [0, 1, 2, 3, 4, 5, 6] as const;

const DAY_LABEL_KEYS = {
  0: "setup:days.0",
  1: "setup:days.1",
  2: "setup:days.2",
  3: "setup:days.3",
  4: "setup:days.4",
  5: "setup:days.5",
  6: "setup:days.6",
} as const;

const FIELD_LABEL_CLASS =
  "text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase";
const INPUT_CLASS =
  "mt-2 h-10 w-full rounded-xl border border-input/80 bg-background/90 px-3 text-sm text-foreground outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/30";
const CARD_CLASS =
  "rounded-2xl border border-border/80 bg-card/95 text-card-foreground shadow-sm backdrop-blur";

type CityValue = (typeof CITY_OPTIONS)[number]["value"];
type DayValue = (typeof DAY_VALUES)[number];
type AnyTFunction = TFunction<Namespace>;

type WindowRow = {
  id: number;
  dayOfWeek: number;
  start: string;
  end: string;
};

type SetupDraft = {
  clinicName: string;
  city: CityValue;
  providerName: string;
  appointmentDurationMin: string;
  slotStepMin: string;
  leadTimeMin: string;
  bookingHorizonDays: string;
};

export type SnapshotKey = {
  clinicSlug: string;
  providerName: string;
};

type SetupPayload = {
  clinicName: string;
  city: CityValue;
  providerName: string;
  appointmentDurationMin: number;
  slotStepMin: number;
  leadTimeMin: number;
  bookingHorizonDays: number;
  weeklyWindows: {
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }[];
};

type TemplatePreset = {
  id: "weekday" | "extended" | "split";
  labelKey: string;
  descriptionKey: string;
  windows: Array<{ dayOfWeek: number; start: string; end: string }>;
};

const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "weekday",
    labelKey: "setup:templates.weekday.label",
    descriptionKey: "setup:templates.weekday.description",
    windows: [
      { dayOfWeek: 1, start: "09:00", end: "17:00" },
      { dayOfWeek: 2, start: "09:00", end: "17:00" },
      { dayOfWeek: 3, start: "09:00", end: "17:00" },
      { dayOfWeek: 4, start: "09:00", end: "17:00" },
      { dayOfWeek: 5, start: "09:00", end: "17:00" },
    ],
  },
  {
    id: "extended",
    labelKey: "setup:templates.extended.label",
    descriptionKey: "setup:templates.extended.description",
    windows: [
      { dayOfWeek: 1, start: "08:00", end: "18:00" },
      { dayOfWeek: 2, start: "08:00", end: "18:00" },
      { dayOfWeek: 3, start: "08:00", end: "18:00" },
      { dayOfWeek: 4, start: "08:00", end: "18:00" },
      { dayOfWeek: 5, start: "08:00", end: "18:00" },
      { dayOfWeek: 6, start: "08:00", end: "14:00" },
    ],
  },
  {
    id: "split",
    labelKey: "setup:templates.split.label",
    descriptionKey: "setup:templates.split.description",
    windows: [
      { dayOfWeek: 1, start: "08:00", end: "12:00" },
      { dayOfWeek: 1, start: "14:00", end: "18:00" },
      { dayOfWeek: 2, start: "08:00", end: "12:00" },
      { dayOfWeek: 2, start: "14:00", end: "18:00" },
      { dayOfWeek: 3, start: "08:00", end: "12:00" },
      { dayOfWeek: 3, start: "14:00", end: "18:00" },
      { dayOfWeek: 4, start: "08:00", end: "12:00" },
      { dayOfWeek: 4, start: "14:00", end: "18:00" },
      { dayOfWeek: 5, start: "08:00", end: "12:00" },
      { dayOfWeek: 5, start: "14:00", end: "18:00" },
    ],
  },
];

function formatMinute(value: number) {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = (value.getMonth() + 1).toString().padStart(2, "0");
  const day = value.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function combineDateAndMinuteToUtcMs(dateValue: string, minuteOfDay: number) {
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1_439
  ) {
    return null;
  }

  const baseDate = parseDateInput(dateValue);
  if (!baseDate) {
    return null;
  }

  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const withTime = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hours,
    minutes,
    0,
    0,
  );
  return withTime.getTime();
}

function generateScheduleBasedTimeslots(args: {
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

  const selectedDate = parseDateInput(args.dateValue);
  if (!selectedDate) {
    return [] as number[];
  }

  const dayOfWeek = selectedDate.getDay();
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

function appointmentStatusKey(appointment: {
  status: "scheduled" | "canceled";
  confirmedAtUtcMs?: number;
}) {
  if (appointment.status === "canceled") {
    return "setup:appointments.status.canceled";
  }
  if (appointment.confirmedAtUtcMs !== undefined) {
    return "setup:appointments.status.scheduledConfirmed";
  }
  return "setup:appointments.status.scheduled";
}

function formatLocalDateTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function isSnapshotKey(value: unknown): value is SnapshotKey {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (!("clinicSlug" in value) || !("providerName" in value)) {
    return false;
  }

  const key = value as Record<string, unknown>;
  return (
    typeof key.clinicSlug === "string" && typeof key.providerName === "string"
  );
}

function translate(
  t: AnyTFunction,
  key: string,
  values?: Record<string, string | number>,
) {
  return t(key as never, values as never) as unknown as string;
}

function getDayLabel(dayOfWeek: number, t: AnyTFunction) {
  return translate(t, DAY_LABEL_KEYS[dayOfWeek as DayValue]);
}

function getCityLabel(city: CityValue, t: AnyTFunction) {
  return translate(t, CITY_LABEL_KEYS[city]);
}

function computeWeeklyMinutes(windows: WindowRow[]) {
  return windows.reduce((total, window) => {
    const start = parseTimeToMinute(window.start);
    const end = parseTimeToMinute(window.end);

    if (start === null || end === null || start >= end) {
      return total;
    }

    return total + (end - start);
  }, 0);
}

function applyTemplate(
  replaceWindows: (
    windows: Array<{ dayOfWeek: number; start: string; end: string }>,
  ) => void,
  presetId: TemplatePreset["id"],
) {
  const preset = TEMPLATE_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) {
    return;
  }
  replaceWindows(preset.windows);
}

function parseIntegerField(
  value: string,
  fieldName: string,
  t: AnyTFunction,
): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      error: translate(t, "setup:errors.client.integer", { field: fieldName }),
    };
  }

  return { ok: true, value: parsed };
}

function buildSetupPayload(
  draft: SetupDraft,
  windows: WindowRow[],
  t: AnyTFunction,
): { ok: true; payload: SetupPayload } | { ok: false; error: string } {
  const clinicName = draft.clinicName.trim();
  const providerName = draft.providerName.trim();

  if (!clinicName || !providerName) {
    return {
      ok: false,
      error: translate(t, "setup:errors.client.requiredNames"),
    };
  }

  const appointmentDuration = parseIntegerField(
    draft.appointmentDurationMin,
    translate(t, "setup:errors.fields.appointmentDuration"),
    t,
  );
  if (!appointmentDuration.ok) {
    return appointmentDuration;
  }

  const slotStep = parseIntegerField(
    draft.slotStepMin,
    translate(t, "setup:errors.fields.slotStep"),
    t,
  );
  if (!slotStep.ok) {
    return slotStep;
  }

  const leadTime = parseIntegerField(
    draft.leadTimeMin,
    translate(t, "setup:errors.fields.leadTime"),
    t,
  );
  if (!leadTime.ok) {
    return leadTime;
  }

  const bookingHorizon = parseIntegerField(
    draft.bookingHorizonDays,
    translate(t, "setup:errors.fields.bookingHorizon"),
    t,
  );
  if (!bookingHorizon.ok) {
    return bookingHorizon;
  }

  if (appointmentDuration.value <= 0 || slotStep.value <= 0) {
    return {
      ok: false,
      error: translate(t, "setup:errors.client.durationAndStepPositive"),
    };
  }

  if (leadTime.value < 0 || bookingHorizon.value <= 0) {
    return {
      ok: false,
      error: translate(t, "setup:errors.client.leadTimeAndHorizon"),
    };
  }

  if (windows.length === 0) {
    return {
      ok: false,
      error: translate(t, "setup:errors.client.addWeeklyWindow"),
    };
  }

  const parsedWindows = windows.map((window, index) => {
    const startMinute = parseTimeToMinute(window.start);
    const endMinute = parseTimeToMinute(window.end);

    if (startMinute === null || endMinute === null) {
      return {
        ok: false as const,
        error: translate(t, "setup:errors.client.malformedTime", {
          index: index + 1,
        }),
      };
    }

    if (startMinute >= endMinute) {
      return {
        ok: false as const,
        error: translate(t, "setup:errors.client.windowOrder", {
          index: index + 1,
        }),
      };
    }

    if (window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      return {
        ok: false as const,
        error: translate(t, "setup:errors.client.windowInvalidDay", {
          index: index + 1,
        }),
      };
    }

    return {
      ok: true as const,
      dayOfWeek: window.dayOfWeek,
      startMinute,
      endMinute,
    };
  });

  const firstError = parsedWindows.find((window) => !window.ok);
  if (firstError && !firstError.ok) {
    return firstError;
  }

  const weeklyWindows = parsedWindows
    .filter(
      (window): window is (typeof parsedWindows)[number] & { ok: true } => {
        return window.ok;
      },
    )
    .map((window) => ({
      dayOfWeek: window.dayOfWeek,
      startMinute: window.startMinute,
      endMinute: window.endMinute,
    }))
    .sort((left, right) => {
      if (left.dayOfWeek !== right.dayOfWeek) {
        return left.dayOfWeek - right.dayOfWeek;
      }

      return left.startMinute - right.startMinute;
    });

  for (let index = 1; index < weeklyWindows.length; index += 1) {
    const previous = weeklyWindows[index - 1];
    const current = weeklyWindows[index];

    if (
      previous.dayOfWeek === current.dayOfWeek &&
      previous.endMinute > current.startMinute
    ) {
      return {
        ok: false,
        error: translate(t, "setup:errors.client.windowsOverlap"),
      };
    }
  }

  return {
    ok: true,
    payload: {
      clinicName,
      city: draft.city,
      providerName,
      appointmentDurationMin: appointmentDuration.value,
      slotStepMin: slotStep.value,
      leadTimeMin: leadTime.value,
      bookingHorizonDays: bookingHorizon.value,
      weeklyWindows,
    },
  };
}

type SetupModelOptions = {
  initialSnapshotKey?: SnapshotKey | null;
  onSnapshotKeyChange?: (key: SnapshotKey) => void;
};

function useSetupModel(options: SetupModelOptions = {}) {
  const { user } = useAuth();
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
    options.initialSnapshotKey ?? null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextWindowId = useRef(2);

  const upsertSetup = useMutation(api.setup.upsertClinicProviderSetup);
  const snapshot = useQuery(api.setup.getSetupSnapshot, snapshotKey ?? "skip");
  const latestSetupKey = useQuery(
    api.setup.getMyLatestSetupKey,
    user ? { intent: "bootstrap" } : "skip",
  );
  const bootstrappedSetupKey = isSnapshotKey(latestSetupKey)
    ? latestSetupKey
    : null;

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

  const addWindow = (dayOfWeek = 1) => {
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
        dayOfWeek: window.dayOfWeek,
        start: window.start,
        end: window.end,
      })),
    );
    nextWindowId.current = nextWindows.length + 1;
  };

  useEffect(() => {
    if (!options.initialSnapshotKey) {
      return;
    }

    setSnapshotKey((current) => {
      if (
        current?.clinicSlug === options.initialSnapshotKey?.clinicSlug &&
        current?.providerName === options.initialSnapshotKey?.providerName
      ) {
        return current;
      }
      return options.initialSnapshotKey ?? null;
    });
  }, [options.initialSnapshotKey]);

  useEffect(() => {
    if (snapshotKey !== null) {
      return;
    }

    if (!bootstrappedSetupKey) {
      return;
    }

    setSnapshotKey(bootstrappedSetupKey);
    options.onSnapshotKeyChange?.(bootstrappedSetupKey);
  }, [bootstrappedSetupKey, options.onSnapshotKeyChange, snapshotKey]);

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
      options.onSnapshotKeyChange?.(result);
      setSubmitMessage(translate(t, "setup:submit.saved"));
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
const SetupModelContext = createContext<SetupModel | null>(null);

export function SetupWorkspaceProvider({
  children,
  initialSnapshotKey,
  onSnapshotKeyChange,
}: {
  children: ReactNode;
  initialSnapshotKey?: SnapshotKey | null;
  onSnapshotKeyChange?: (key: SnapshotKey) => void;
}) {
  const model = useSetupModel({
    initialSnapshotKey,
    onSnapshotKeyChange,
  });

  return (
    <SetupModelContext.Provider value={model}>
      {children}
    </SetupModelContext.Provider>
  );
}

function useSetupWorkspaceModel() {
  const value = useContext(SetupModelContext);
  if (!value) {
    throw new Error(
      "useSetupWorkspaceModel must be used inside SetupWorkspaceProvider.",
    );
  }
  return value;
}

function useLocalePreferenceModel() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation(["setup", "common"]);
  const [localeError, setLocaleError] = useState<string | null>(null);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [optimisticLocale, setOptimisticLocale] =
    useState<SupportedLocale | null>(null);

  const setMyLocale = useMutation(api.userPreferences.setMyLocale);
  const preferences = useQuery(
    api.userPreferences.getMyPreferences,
    user ? {} : "skip",
  );

  const currentLocale =
    i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE;

  useEffect(() => {
    if (!preferences?.locale) {
      return;
    }

    if (optimisticLocale && preferences.locale !== optimisticLocale) {
      return;
    }

    if (optimisticLocale && preferences.locale === optimisticLocale) {
      setOptimisticLocale(null);
    }

    if (preferences.locale !== currentLocale) {
      void i18n.changeLanguage(preferences.locale);
    }
  }, [currentLocale, i18n, optimisticLocale, preferences?.locale]);

  const onLocaleChange = async (locale: SupportedLocale) => {
    setLocaleError(null);
    setOptimisticLocale(locale);

    await i18n.changeLanguage(locale);

    if (!user) {
      setOptimisticLocale(null);
      return;
    }

    try {
      setIsSavingLocale(true);
      await setMyLocale({ locale });
    } catch {
      setLocaleError(translate(t, "common:locale.saveError"));
      setOptimisticLocale(null);
    } finally {
      setIsSavingLocale(false);
    }
  };

  return {
    currentLocale,
    localeError,
    isSavingLocale,
    onLocaleChange,
  };
}

export function SetupWorkspaceShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation(["setup", "common"]);
  const locale = useLocalePreferenceModel();

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background px-4 py-6 text-foreground">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-36 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-chart-3/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header
          className={`${CARD_CLASS} flex flex-wrap items-center justify-between gap-5 p-5 md:p-6`}
        >
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("setup:header.kicker")}
            </p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              {t("setup:header.title")}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              {t("setup:header.subtitle")}
            </p>
            <div className="flex flex-wrap gap-2">
              <BadgePill>{t("setup:badges.weeklyBoard")}</BadgePill>
              <BadgePill>{t("setup:badges.templateStarter")}</BadgePill>
              <BadgePill>{t("setup:badges.capacitySandbox")}</BadgePill>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher
              currentLocale={locale.currentLocale}
              disabled={locale.isSavingLocale}
              onChange={locale.onLocaleChange}
            />
            <ModeToggle />
            <AuthButton />
          </div>
          {locale.localeError ? (
            <p className="w-full text-sm font-medium text-destructive">
              {locale.localeError}
            </p>
          ) : null}
        </header>

        {children}
      </div>
    </main>
  );
}

export default function App() {
  const { t } = useTranslation(["setup", "common"]);
  return (
    <SetupWorkspaceShell>
      <Authenticated>
        <SetupWorkspaceProvider>
          <SetupWorkspaceFullScreen />
        </SetupWorkspaceProvider>
      </Authenticated>
      <Unauthenticated>
        <section className={`${CARD_CLASS} max-w-xl p-8`}>
          <p className="text-sm text-muted-foreground">
            {t("setup:unauthenticated.message")}
          </p>
          <div className="mt-4">
            <AuthButton />
          </div>
        </section>
      </Unauthenticated>
    </SetupWorkspaceShell>
  );
}

export function SetupWorkspaceFullScreen() {
  const model = useSetupWorkspaceModel();
  return <PlannerSimulatorWorkspace model={model} />;
}

export function SetupWorkspaceSetupScreen() {
  const model = useSetupWorkspaceModel();
  return (
    <PlannerSimulatorWorkspace
      model={model}
      showAppointments={false}
      showSnapshot={false}
    />
  );
}

export function SetupWorkspaceSnapshotScreen() {
  const model = useSetupWorkspaceModel();
  return <SnapshotPanel model={model} />;
}

export function SetupWorkspaceAppointmentsScreen() {
  const model = useSetupWorkspaceModel();
  return <AppointmentManager model={model} />;
}

export function AuthButton() {
  const { t } = useTranslation("common");
  const { user, signIn, signOut } = useAuth();

  if (user) {
    return (
      <Button onClick={() => signOut()} variant="outline">
        {t("auth.signOut")}
      </Button>
    );
  }

  return <Button onClick={() => void signIn()}>{t("auth.signIn")}</Button>;
}

function BadgePill({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

function PlannerSimulatorWorkspace({
  model,
  showSnapshot = true,
  showAppointments = true,
}: {
  model: SetupModel;
  showSnapshot?: boolean;
  showAppointments?: boolean;
}) {
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
            <button
              className={`rounded-xl border p-3 text-left transition ${
                activeTemplate === preset.id
                  ? "border-primary bg-primary/10 shadow-sm"
                  : "border-border bg-background hover:border-primary/40 hover:bg-muted/40"
              }`}
              key={preset.id}
              onClick={() => {
                applyTemplate(model.replaceWindows, preset.id);
                setActiveTemplate(preset.id);
              }}
              type="button"
            >
              <p className="text-sm font-semibold">
                {translate(t, preset.labelKey)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {translate(t, preset.descriptionKey)}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {daySummaries.map((day) => (
            <button
              className={`group rounded-xl border p-3 text-left transition ${
                day.value === focusedDay
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:border-primary/30 hover:bg-muted/20"
              }`}
              key={day.value}
              onClick={() => setFocusedDay(day.value)}
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
                    width: `${Math.max(
                      6,
                      Math.round((day.openMinutes / maxDayMinutes) * 100),
                    )}%`,
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
          ))}
        </div>

        <p className="mt-8 text-sm font-semibold">
          {t("setup:planner.focusedDay", {
            day: getDayLabel(focusedDay, t),
          })}
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
                      model.updateWindow(window.id, {
                        end: event.target.value,
                      })
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
              value={model.draft.city}
              onChange={(value) => model.setDraftField("city", value)}
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

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function SnapshotPanel({ model }: { model: SetupModel }) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <section className={`${CARD_CLASS} p-6`}>
      <h2 className="text-xl font-semibold tracking-tight">
        {t("setup:snapshot.title")}
      </h2>
      {model.snapshotKey === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("setup:snapshot.empty")}
        </p>
      ) : model.snapshot === undefined ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("setup:snapshot.loading")}
        </p>
      ) : model.snapshot === null ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("setup:snapshot.missing")}
        </p>
      ) : (
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
            <p className="font-semibold">
              {t("setup:snapshot.labels.windows")}
            </p>
            <ul className="mt-1 list-inside list-disc text-muted-foreground">
              {model.snapshot.weeklyWindows.map((window) => {
                const day = getDayLabel(window.dayOfWeek, t);
                return (
                  <li key={window._id}>
                    {day}: {formatMinute(window.startMinute)} -{" "}
                    {formatMinute(window.endMinute)}
                  </li>
                );
              })}
            </ul>
          </div>
          <p>
            <span className="font-semibold">
              {t("setup:snapshot.labels.appointments")}:
            </span>{" "}
            {t("setup:snapshot.appointments", {
              scheduled: model.snapshot.appointmentSummary.scheduled,
              total: model.snapshot.appointmentSummary.total,
            })}
          </p>
        </div>
      )}
    </section>
  );
}

function AppointmentManager({ model }: { model: SetupModel }) {
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

    const startAtUtcMs = combineDateAndMinuteToUtcMs(dateValue, parsedSlot);
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
        <p className="mt-3 text-sm text-muted-foreground">
          {model.snapshot === undefined && model.snapshotKey !== null
            ? t("setup:appointments.messages.loading")
            : t("setup:appointments.blocked")}
        </p>
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

          {appointments === undefined ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("setup:appointments.messages.loading")}
            </p>
          ) : appointments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("setup:appointments.list.empty")}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("setup:appointments.list.columns.patient")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("setup:appointments.list.columns.start")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("setup:appointments.list.columns.status")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("setup:appointments.list.columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appointment) => {
                    const isCanceled = appointment.status === "canceled";
                    const isConfirmed =
                      appointment.confirmedAtUtcMs !== undefined;
                    const isPending =
                      pendingRowAction?.appointmentId === appointment._id;

                    return (
                      <tr
                        className="border-b border-border/60 last:border-b-0"
                        key={appointment._id}
                      >
                        <td className="py-3 pr-4">
                          <p className="font-medium">
                            {appointment.patientName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {appointment.patientPhone}
                          </p>
                        </td>
                        <td className="py-3 pr-4">
                          {formatLocalDateTime(appointment.startAtUtcMs)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                            {t(appointmentStatusKey(appointment))}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex gap-2">
                            <Button
                              disabled={isCanceled || isConfirmed || isPending}
                              onClick={() =>
                                void runRowAction(appointment._id, "confirm")
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {t("setup:appointments.actions.confirm")}
                            </Button>
                            <Button
                              disabled={isCanceled || isPending}
                              onClick={() =>
                                void runRowAction(appointment._id, "cancel")
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {t("setup:appointments.actions.cancel")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatusAndSubmit({ model }: { model: SetupModel }) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <section className={`${CARD_CLASS} p-5`}>
      <div className="flex flex-wrap items-center gap-3">
        {model.formError ? (
          <p className="text-sm font-medium text-destructive">
            {model.formError}
          </p>
        ) : null}
        {model.submitMessage ? (
          <p className="text-sm font-medium text-primary">
            {model.submitMessage}
          </p>
        ) : null}
      </div>
      <Button
        className="mt-4 w-full rounded-xl sm:w-auto"
        onClick={() => void model.submitSetup()}
        type="button"
      >
        {model.isSubmitting
          ? t("setup:submit.saving")
          : t("setup:submit.saveSetup")}
      </Button>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      <input
        className={INPUT_CLASS}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
}) {
  return (
    <label className={FIELD_LABEL_CLASS}>
      {label}
      <input
        className={INPUT_CLASS}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        type="number"
        value={value}
      />
    </label>
  );
}

function CityField({
  value,
  onChange,
}: {
  value: CityValue;
  onChange: (value: CityValue) => void;
}) {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <label className={FIELD_LABEL_CLASS}>
      {t("setup:identity.fields.city")}
      <select
        className={INPUT_CLASS}
        onChange={(event) => onChange(event.target.value as CityValue)}
        value={value}
      >
        {CITY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {getCityLabel(option.value, t)}
          </option>
        ))}
      </select>
    </label>
  );
}
