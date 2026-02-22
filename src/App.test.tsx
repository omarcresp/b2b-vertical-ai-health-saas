import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SetupWorkspaceApp from "@/features/setup/screens";
import { api } from "../convex/_generated/api";
import type { SupportedLocale } from "../shared/locales";
import i18n from "./i18n";

const App = SetupWorkspaceApp;

type PaginatedStatus =
  | "LoadingFirstPage"
  | "CanLoadMore"
  | "LoadingMore"
  | "Exhausted";

type PaginatedFixture = {
  isLoading?: boolean;
  loadMore?: ReturnType<typeof vi.fn>;
  results: unknown;
  status: PaginatedStatus;
};

const {
  mockUseMutation,
  mockUsePaginatedQuery,
  mockUseQuery,
  mockUseConvexMutation,
  mockSignIn,
  mockSignOut,
} = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockUsePaginatedQuery: vi.fn(),
  mockUseQuery: vi.fn(),
  mockUseConvexMutation: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
}));

vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
  Unauthenticated: () => null,
  useConvexAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
  }),
  usePaginatedQuery: mockUsePaginatedQuery,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
  QueryClient: vi.fn(() => ({
    prefetchQuery: vi.fn().mockResolvedValue(undefined),
  })),
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (ref: Parameters<typeof getFunctionName>[0], args: unknown) => ({
    queryKey: [getFunctionName(ref), args],
    queryFn: vi.fn(),
  }),
  useConvexMutation: mockUseConvexMutation,
  ConvexQueryClient: vi.fn(() => ({
    hashFn: () => vi.fn(),
    queryFn: () => vi.fn(),
    connect: vi.fn(),
  })),
}));

vi.mock("@workos-inc/authkit-react", () => ({
  useAuth: () => ({
    user: { id: "user_1" },
    signIn: mockSignIn,
    signOut: mockSignOut,
  }),
  AuthKitProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/mode-toggle", () => ({
  ModeToggle: () => <div data-testid="mode-toggle" />,
}));

const DEFAULT_SNAPSHOT = {
  clinic: {
    name: "Clinica Centro",
    slug: "clinica-centro",
    city: "bogota",
    timezone: "America/Bogota",
    appointmentDurationMin: 30,
    slotStepMin: 15,
    leadTimeMin: 60,
    bookingHorizonDays: 30,
  },
  provider: {
    name: "Dr. Rivera",
    isActive: true,
  },
  weeklyWindows: [
    {
      _id: "window_1",
      dayOfWeek: 1,
      startMinute: 540,
      endMinute: 600,
    },
  ],
  appointmentSummary: {
    total: 0,
    scheduled: 0,
  },
};

function toBogotaUtcMs(dateLocal: string, minuteOfDay: number) {
  const [year, month, day] = dateLocal.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Date.UTC(year, month - 1, day, hour + 5, minute, 0, 0);
}

const QUERY_KEY_GET_MY_PREFERENCES = getFunctionName(
  api.userPreferences.getMyPreferences,
);
const QUERY_KEY_GET_SETUP_SNAPSHOT = getFunctionName(
  api.setup.getSetupSnapshot,
);
const QUERY_KEY_GET_MY_LATEST_SETUP = getFunctionName(
  api.setup.getMyLatestSetupKey,
);
const QUERY_KEY_LIST_AVAILABLE_SLOTS = getFunctionName(
  api.scheduling.listAvailableSlotsForOwner,
);
const QUERY_KEY_LIST_APPOINTMENTS_PAGE = getFunctionName(
  api.scheduling.listAppointmentsPageForOwner,
);
const MUTATION_KEY_UPSERT_SETUP = getFunctionName(
  api.setup.upsertClinicProviderSetup,
);
const MUTATION_KEY_SET_MY_LOCALE = getFunctionName(
  api.userPreferences.setMyLocale,
);
const MUTATION_KEY_CREATE_APPOINTMENT = getFunctionName(
  api.scheduling.createAppointmentForOwner,
);
const MUTATION_KEY_CONFIRM_APPOINTMENT = getFunctionName(
  api.scheduling.confirmAppointmentForOwner,
);
const MUTATION_KEY_CANCEL_APPOINTMENT = getFunctionName(
  api.scheduling.cancelAppointmentForOwner,
);

function apiRefKey(ref: unknown) {
  return getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
}

function normalizePaginatedFixture(
  fixture: unknown,
  loadMore: ReturnType<typeof vi.fn>,
): PaginatedFixture {
  if (
    fixture &&
    typeof fixture === "object" &&
    "results" in fixture &&
    "status" in fixture
  ) {
    const typedFixture = fixture as PaginatedFixture;
    return {
      ...typedFixture,
      loadMore: typedFixture.loadMore ?? loadMore,
      isLoading:
        typedFixture.isLoading ??
        (typedFixture.status === "LoadingFirstPage" ||
          typedFixture.status === "LoadingMore"),
    };
  }

  return {
    results: fixture,
    status: "Exhausted",
    loadMore,
    isLoading: false,
  };
}

function mockQueries({
  locale = "en-US",
  snapshot,
  latestSetupKey,
  getAppointments,
  getAvailableSlots,
}: {
  locale?: SupportedLocale | null | (() => SupportedLocale | null);
  snapshot?: unknown;
  latestSetupKey?: { clinicSlug: string; providerName: string } | null;
  getAppointments?: () => unknown;
  getAvailableSlots?: () => unknown;
}) {
  mockUseQuery.mockImplementation(
    ({
      queryKey,
      enabled,
    }: {
      queryKey: [string, unknown];
      enabled?: boolean;
    }) => {
      if (enabled === false) return { data: undefined };

      const [fnName] = queryKey;

      if (fnName === QUERY_KEY_GET_MY_PREFERENCES) {
        const resolvedLocale = typeof locale === "function" ? locale() : locale;
        return {
          data: resolvedLocale ? { locale: resolvedLocale } : undefined,
        };
      }

      if (fnName === QUERY_KEY_LIST_AVAILABLE_SLOTS) {
        return { data: getAvailableSlots ? getAvailableSlots() : [] };
      }

      if (fnName === QUERY_KEY_GET_SETUP_SNAPSHOT) {
        return { data: snapshot };
      }

      if (fnName === QUERY_KEY_GET_MY_LATEST_SETUP) {
        return { data: latestSetupKey ?? null };
      }

      throw new Error(`Unexpected query ref in test: ${fnName}`);
    },
  );

  const defaultLoadMore = vi.fn();
  mockUsePaginatedQuery.mockImplementation((ref) => {
    const key = apiRefKey(ref);
    if (key !== QUERY_KEY_LIST_APPOINTMENTS_PAGE) {
      throw new Error(`Unexpected paginated query ref in test: ${key}`);
    }

    return normalizePaginatedFixture(
      getAppointments ? getAppointments() : [],
      defaultLoadMore,
    );
  });
}

function mockMutations({
  upsertSetup = vi.fn(),
  setLocale = vi.fn(),
  createAppointment = vi.fn(),
  confirmAppointment = vi.fn(),
  cancelAppointment = vi.fn(),
}: {
  upsertSetup?: (...args: unknown[]) => unknown;
  setLocale?: (...args: unknown[]) => unknown;
  createAppointment?: (...args: unknown[]) => unknown;
  confirmAppointment?: (...args: unknown[]) => unknown;
  cancelAppointment?: (...args: unknown[]) => unknown;
}) {
  const mutationHandlers = {
    [MUTATION_KEY_CANCEL_APPOINTMENT]: cancelAppointment,
    [MUTATION_KEY_CONFIRM_APPOINTMENT]: confirmAppointment,
    [MUTATION_KEY_CREATE_APPOINTMENT]: createAppointment,
    [MUTATION_KEY_SET_MY_LOCALE]: setLocale,
    [MUTATION_KEY_UPSERT_SETUP]: upsertSetup,
  } as const;

  mockUseConvexMutation.mockImplementation((ref: unknown) => {
    const key = apiRefKey(ref);
    const handler =
      mutationHandlers[key as keyof typeof mutationHandlers] ?? undefined;

    if (!handler) {
      throw new Error(`Unexpected mutation ref in test: ${key}`);
    }

    return handler;
  });

  mockUseMutation.mockImplementation(
    ({
      mutationFn,
      onSuccess,
      onError,
    }: {
      mutationFn: (...args: unknown[]) => Promise<unknown>;
      onSuccess?: (result: unknown, variables: unknown) => void;
      onError?: (error: unknown, variables: unknown) => void;
    }) => ({
      mutate: vi.fn(async (vars: unknown) => {
        try {
          const result = await mutationFn(vars);
          onSuccess?.(result, vars);
        } catch (e) {
          onError?.(e, vars);
        }
      }),
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
    }),
  );
}

describe("App setup flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    globalThis.history.replaceState({}, "", "/");
    await i18n.changeLanguage("en-US");
  });

  it("submits setup and renders saved snapshot", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn().mockResolvedValue({
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
    });
    const setLocale = vi.fn().mockResolvedValue({ locale: "en-US" });

    mockMutations({ upsertSetup, setLocale });
    mockQueries({
      locale: "en-US",
      snapshot: DEFAULT_SNAPSHOT,
    });

    render(<App />);

    await user.type(screen.getByLabelText("Clinic name"), "Clinica Centro");
    await user.selectOptions(screen.getByLabelText("City"), "bogota");
    await user.type(screen.getByLabelText("Provider name"), "Dr. Rivera");
    await user.click(screen.getByRole("button", { name: "Save setup" }));

    await waitFor(() => {
      expect(upsertSetup).toHaveBeenCalledWith({
        clinicName: "Clinica Centro",
        city: "bogota",
        providerName: "Dr. Rivera",
        appointmentDurationMin: 30,
        slotStepMin: 15,
        leadTimeMin: 60,
        bookingHorizonDays: 30,
        weeklyWindows: [
          {
            dayOfWeek: 1,
            startMinute: 540,
            endMinute: 1020,
          },
        ],
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Setup saved.")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Clinica Centro/)).toBeInTheDocument();
    });

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [
          QUERY_KEY_GET_SETUP_SNAPSHOT,
          expect.objectContaining({
            clinicSlug: "clinica-centro",
            providerName: "Dr. Rivera",
          }),
        ],
      }),
    );
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("shows required field validation", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn();
    const setLocale = vi.fn();

    mockMutations({ upsertSetup, setLocale });
    mockQueries({ locale: null });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "Save setup" }));

    expect(
      screen.getByText("Clinic name and provider name are required."),
    ).toBeInTheDocument();
    expect(upsertSetup).not.toHaveBeenCalled();
  });

  it("shows malformed time validation and blocks submit", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn();
    const setLocale = vi.fn();

    mockMutations({ upsertSetup, setLocale });
    mockQueries({ locale: "en-US" });

    render(<App />);

    await user.type(screen.getByLabelText("Clinic name"), "Clinica Centro");
    await user.type(screen.getByLabelText("Provider name"), "Dr. Rivera");
    await user.clear(screen.getByLabelText("Start (HH:MM)"));
    await user.type(screen.getByLabelText("Start (HH:MM)"), "99:99");
    await user.click(screen.getByRole("button", { name: "Save setup" }));

    expect(
      screen.getByText("Window 1 has malformed time. Use HH:MM (24h)."),
    ).toBeInTheDocument();
    expect(upsertSetup).not.toHaveBeenCalled();
  });

  it("switches language and updates labels/buttons", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn();
    const changeLanguageSpy = vi.spyOn(i18n, "changeLanguage");
    let persistedLocale: SupportedLocale = "en-US";
    const setLocale = vi.fn().mockImplementation(async ({ locale }) => {
      persistedLocale = locale;
      return { locale };
    });

    mockMutations({ upsertSetup, setLocale });
    mockQueries({
      locale: () => persistedLocale,
      snapshot: undefined,
    });

    render(<App />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Language" }),
      "es-MX",
    );

    await waitFor(() => {
      expect(setLocale).toHaveBeenCalledWith({ locale: "es-MX" });
    });

    expect(changeLanguageSpy).toHaveBeenCalledWith("es-MX");

    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: "Guardar configuración" }),
        ).toBeInTheDocument();
      },
      { timeout: 3_000 },
    );

    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: "Cerrar sesión" }),
        ).toBeInTheDocument();
      },
      { timeout: 3_000 },
    );

    changeLanguageSpy.mockRestore();
  });

  it("bootstraps UI locale from persisted preference", async () => {
    const upsertSetup = vi.fn();
    const setLocale = vi.fn();

    mockMutations({ upsertSetup, setLocale });
    mockQueries({ locale: "es-MX" });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Guardar configuración" }),
      ).toBeInTheDocument();
    });
  });

  it("maps backend error code to localized message", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn().mockRejectedValue({
      data: { code: "setup.weekly_window_overlap" },
    });
    const setLocale = vi.fn();

    mockMutations({ upsertSetup, setLocale });
    mockQueries({ locale: "en-US" });

    render(<App />);

    await user.type(screen.getByLabelText("Clinic name"), "Clinica Centro");
    await user.type(screen.getByLabelText("Provider name"), "Dr. Rivera");
    await user.click(screen.getByRole("button", { name: "Save setup" }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Weekly schedule windows overlap on one or more days.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("blocks appointment manager when setup snapshot is missing", () => {
    mockMutations({});
    mockQueries({ locale: "en-US" });

    render(<App />);

    expect(
      screen.getByText("Save setup first to unlock appointment management."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create appointment" }),
    ).not.toBeInTheDocument();
  });

  it("auto-loads saved setup after refresh via bootstrap lookup", async () => {
    mockMutations({});
    mockQueries({
      locale: "en-US",
      latestSetupKey: {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      },
      snapshot: DEFAULT_SNAPSHOT,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Clinica Centro/)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create appointment" }),
      ).toBeInTheDocument();
    });
  });

  it("creates, confirms, and cancels appointments from the manager", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn().mockResolvedValue({
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
    });
    const setLocale = vi.fn().mockResolvedValue({ locale: "en-US" });
    const selectedStartAtUtcMs = toBogotaUtcMs("2026-02-23", 540);

    let appointmentsState: Array<{
      _id: string;
      patientName: string;
      patientPhone: string;
      startAtUtcMs: number;
      endAtUtcMs: number;
      status: "scheduled" | "canceled";
      confirmedAtUtcMs?: number;
    }> = [];

    const createAppointment = vi
      .fn()
      .mockImplementation(
        async (payload: {
          patientName: string;
          patientPhone: string;
          startAtUtcMs: number;
        }) => {
          appointmentsState = [
            ...appointmentsState,
            {
              _id: "appointment_1",
              patientName: payload.patientName,
              patientPhone: payload.patientPhone,
              startAtUtcMs: payload.startAtUtcMs,
              endAtUtcMs: payload.startAtUtcMs + 30 * 60 * 1_000,
              status: "scheduled",
            },
          ];
          return "appointment_1";
        },
      );
    const confirmAppointment = vi.fn().mockImplementation(async () => {
      appointmentsState = appointmentsState.map((appointment) =>
        appointment._id === "appointment_1"
          ? { ...appointment, confirmedAtUtcMs: 1_234_567 }
          : appointment,
      );
      return { changed: true };
    });
    const cancelAppointment = vi.fn().mockImplementation(async () => {
      appointmentsState = appointmentsState.map((appointment) =>
        appointment._id === "appointment_1"
          ? { ...appointment, status: "canceled" }
          : appointment,
      );
      return { changed: true };
    });

    mockMutations({
      upsertSetup,
      setLocale,
      createAppointment,
      confirmAppointment,
      cancelAppointment,
    });
    mockQueries({
      locale: "en-US",
      snapshot: DEFAULT_SNAPSHOT,
      getAppointments: () => appointmentsState,
      getAvailableSlots: () => [
        {
          startAtUtcMs: selectedStartAtUtcMs,
          endAtUtcMs: selectedStartAtUtcMs + 30 * 60 * 1_000,
          label: "09:00 GMT-5 (Bogota)",
        },
      ],
    });

    render(<App />);

    await user.type(screen.getByLabelText("Clinic name"), "Clinica Centro");
    await user.type(screen.getByLabelText("Provider name"), "Dr. Rivera");
    await user.click(screen.getByRole("button", { name: "Save setup" }));

    await waitFor(() => {
      expect(upsertSetup).toHaveBeenCalled();
      expect(screen.getByText("Setup saved.")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Patient name"), "Maria Gomez");
    await user.type(screen.getByLabelText("Patient phone"), "+573001112233");

    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-02-23" },
    });
    const timeslotSelect = screen.getByLabelText("Timeslot");
    await waitFor(() => {
      expect(
        (timeslotSelect as HTMLSelectElement).querySelector(
          `option[value="${selectedStartAtUtcMs}"]`,
        ),
      ).not.toBeNull();
    });
    await user.selectOptions(timeslotSelect, `${selectedStartAtUtcMs}`);
    expect(screen.getByLabelText<HTMLInputElement>("Date").value).toBe(
      "2026-02-23",
    );
    expect((timeslotSelect as HTMLSelectElement).value).toBe(
      `${selectedStartAtUtcMs}`,
    );
    await user.click(
      screen.getByRole("button", { name: "Create appointment" }),
    );

    await waitFor(() => {
      expect(createAppointment).toHaveBeenCalledWith({
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        patientName: "Maria Gomez",
        patientPhone: "+573001112233",
        startAtUtcMs: selectedStartAtUtcMs,
      });
    });

    await waitFor(() => {
      expect(screen.getByText("Maria Gomez")).toBeInTheDocument();
      expect(screen.getByText("Scheduled")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => {
      expect(confirmAppointment).toHaveBeenCalledWith({
        appointmentId: "appointment_1",
      });
      expect(screen.getByText("Scheduled + confirmed")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(cancelAppointment).toHaveBeenCalledWith({
        appointmentId: "appointment_1",
      });
      expect(screen.getByText("Canceled")).toBeInTheDocument();
    });
  });

  it("shows no-slot state when availability query returns empty", async () => {
    mockMutations({});
    mockQueries({
      locale: "en-US",
      latestSetupKey: {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      },
      snapshot: DEFAULT_SNAPSHOT,
      getAppointments: () => [],
      getAvailableSlots: () => [],
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("No schedule-based timeslots for the selected date."),
      ).toBeInTheDocument();
    });
  });

  it("does not crash when appointment queries return non-array payloads", async () => {
    mockMutations({});
    mockQueries({
      locale: "en-US",
      latestSetupKey: {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      },
      snapshot: DEFAULT_SNAPSHOT,
      getAppointments: () => ({ malformed: true }),
      getAvailableSlots: () => ({ malformed: true }),
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Create appointment" }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText("No schedule-based timeslots for the selected date."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No appointments in the next 30 days."),
    ).toBeInTheDocument();
  });

  it("maps slot-unavailable backend error when create fails", async () => {
    const user = userEvent.setup();
    const upsertSetup = vi.fn().mockResolvedValue({
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
    });
    const selectedStartAtUtcMs = toBogotaUtcMs("2026-02-23", 540);
    const createAppointment = vi.fn().mockRejectedValue({
      data: { code: "scheduling.slot_unavailable" },
    });

    mockMutations({
      upsertSetup,
      setLocale: vi.fn().mockResolvedValue({ locale: "en-US" }),
      createAppointment,
      confirmAppointment: vi.fn(),
      cancelAppointment: vi.fn(),
    });
    mockQueries({
      locale: "en-US",
      snapshot: DEFAULT_SNAPSHOT,
      getAppointments: () => [],
      getAvailableSlots: () => [
        {
          startAtUtcMs: selectedStartAtUtcMs,
          endAtUtcMs: selectedStartAtUtcMs + 30 * 60 * 1_000,
          label: "09:00 GMT-5 (Bogota)",
        },
      ],
    });

    render(<App />);

    await user.type(screen.getByLabelText("Clinic name"), "Clinica Centro");
    await user.type(screen.getByLabelText("Provider name"), "Dr. Rivera");
    await user.click(screen.getByRole("button", { name: "Save setup" }));

    await waitFor(() => {
      expect(screen.getByText("Setup saved.")).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Patient name"), "Maria Gomez");
    await user.type(screen.getByLabelText("Patient phone"), "+573001112233");
    await user.selectOptions(
      screen.getByLabelText("Timeslot"),
      `${selectedStartAtUtcMs}`,
    );

    await user.click(
      screen.getByRole("button", { name: "Create appointment" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("The selected timeslot is no longer available."),
      ).toBeInTheDocument();
    });
  });
});
