import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportedLocale } from "../shared/locales";
import App from "./App";
import i18n from "./i18n";

const { mockUseMutation, mockUseQuery, mockSignIn, mockSignOut } = vi.hoisted(
  () => ({
    mockUseMutation: vi.fn(),
    mockUseQuery: vi.fn(),
    mockSignIn: vi.fn(),
    mockSignOut: vi.fn(),
  }),
);

vi.mock("convex/react", () => ({
  Authenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
  Unauthenticated: () => null,
  useMutation: mockUseMutation,
  useQuery: mockUseQuery,
}));

vi.mock("@workos-inc/authkit-react", () => ({
  useAuth: () => ({
    user: { id: "user_1" },
    signIn: mockSignIn,
    signOut: mockSignOut,
  }),
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

describe("App setup flow", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    await i18n.changeLanguage("en-US");
  });

  function mockQueries({
    locale = "en-US",
    snapshot,
    latestSetupKey,
    getAppointments,
  }: {
    locale?: SupportedLocale | null;
    snapshot?: unknown;
    latestSetupKey?: { clinicSlug: string; providerName: string } | null;
    getAppointments?: () => unknown[];
  }) {
    mockUseQuery.mockImplementation((_ref, args) => {
      if (args === "skip") {
        return undefined;
      }

      if (!args || typeof args !== "object") {
        if (!locale) {
          return undefined;
        }
        return { locale };
      }

      if ("rangeStartUtcMs" in args && "rangeEndUtcMs" in args) {
        return getAppointments ? getAppointments() : [];
      }

      if ("intent" in args) {
        return latestSetupKey ?? null;
      }

      if ("clinicSlug" in args && "providerName" in args) {
        return snapshot;
      }

      if (!locale) {
        return undefined;
      }

      return { locale };
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
    let appointmentActionCount = 0;
    const mutationDispatcher = vi
      .fn()
      .mockImplementation(async (payload: unknown) => {
        if (
          payload &&
          typeof payload === "object" &&
          "clinicName" in payload &&
          "providerName" in payload &&
          "weeklyWindows" in payload
        ) {
          return await upsertSetup(payload);
        }

        if (payload && typeof payload === "object" && "locale" in payload) {
          return await setLocale(payload);
        }

        if (
          payload &&
          typeof payload === "object" &&
          "patientName" in payload &&
          "patientPhone" in payload &&
          "startAtUtcMs" in payload
        ) {
          return await createAppointment(payload);
        }

        appointmentActionCount += 1;
        if (appointmentActionCount === 1) {
          return await confirmAppointment(payload);
        }
        return await cancelAppointment(payload);
      });
    mockUseMutation.mockImplementation(() => mutationDispatcher);
  }

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

    expect(mockUseQuery).toHaveBeenCalledWith(expect.anything(), {
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
    });
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
    mockUseQuery.mockImplementation((_ref, args) => {
      if (args === "skip") {
        return undefined;
      }

      if (
        args &&
        typeof args === "object" &&
        "rangeStartUtcMs" in args &&
        "rangeEndUtcMs" in args
      ) {
        return [];
      }

      if (args && typeof args === "object" && "clinicSlug" in args) {
        return undefined;
      }

      if (args && typeof args === "object" && "intent" in args) {
        return null;
      }

      return { locale: persistedLocale };
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
          'option[value="540"]',
        ),
      ).not.toBeNull();
    });
    await user.selectOptions(timeslotSelect, "540");
    expect((screen.getByLabelText("Date") as HTMLInputElement).value).toBe(
      "2026-02-23",
    );
    expect((timeslotSelect as HTMLSelectElement).value).toBe("540");
    await user.click(
      screen.getByRole("button", { name: "Create appointment" }),
    );

    await waitFor(() => {
      expect(createAppointment).toHaveBeenCalledWith({
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        patientName: "Maria Gomez",
        patientPhone: "+573001112233",
        startAtUtcMs: expect.any(Number),
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
});
