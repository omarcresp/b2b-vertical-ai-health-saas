import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { SCHEDULING_ERROR_CODES } from "../shared/schedulingErrorCodes";
import type { Doc, Id } from "./_generated/dataModel";
import {
  cancelAppointmentForOwnerHandler,
  confirmAppointmentForOwnerHandler,
  createAppointmentForOwnerHandler,
  getAppointmentByIdForOwnerHandler,
  listAppointmentsForOwnerHandler,
  listAppointmentsPageForOwnerHandler,
  listAvailableSlotsForInternalHandler,
  listAvailableSlotsForOwnerHandler,
} from "./scheduling";

const CLINIC_ID = "clinic_1" as Id<"clinics">;
const SECOND_CLINIC_ID = "clinic_2" as Id<"clinics">;
const PROVIDER_ID = "provider_1" as Id<"providers">;
const APPOINTMENT_ID = "appointment_1" as Id<"appointments">;
const NEW_APPOINTMENT_ID = "appointment_new" as Id<"appointments">;
const DATE_LOCAL = "2026-02-23";

function toBogotaUtcMs(dateLocal: string, minuteOfDay: number) {
  const [year, month, day] = dateLocal.split("-").map(Number);
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  // Bogota is UTC-5.
  return Date.UTC(year, month - 1, day, hour + 5, minute, 0, 0);
}

type MockContextOptions = {
  identitySubject?: string | null;
  clinicOwnerSubject?: string;
  providerClinicId?: Id<"clinics">;
  appointment?: {
    status: "scheduled" | "canceled";
    confirmedAtUtcMs?: number;
    startAtUtcMs?: number;
    endAtUtcMs?: number;
  } | null;
  extraAppointments?: Array<{
    id: Id<"appointments">;
    startAtUtcMs: number;
    endAtUtcMs?: number;
    status?: "scheduled" | "canceled";
    confirmedAtUtcMs?: number;
  }>;
  policy?: {
    appointmentDurationMin: number;
    slotStepMin: number;
    leadTimeMin: number;
    bookingHorizonDays: number;
  } | null;
  weeklyWindows?: Array<{
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }>;
};

function createMockContext(options: MockContextOptions = {}) {
  const identitySubject =
    options.identitySubject === undefined ? "owner_1" : options.identitySubject;
  const clinicOwnerSubject = options.clinicOwnerSubject ?? "owner_1";

  const policy =
    options.policy === undefined
      ? {
          appointmentDurationMin: 30,
          slotStepMin: 15,
          leadTimeMin: 60,
          bookingHorizonDays: 30,
        }
      : options.policy;

  const weeklyWindows = options.weeklyWindows ?? [
    {
      dayOfWeek: 1,
      startMinute: 540,
      endMinute: 660,
    },
  ];

  const clinic: Doc<"clinics"> = {
    _id: CLINIC_ID,
    _creationTime: 1,
    name: "Clinica Centro",
    slug: "clinica-centro",
    city: "bogota",
    timezone: "America/Bogota",
    createdBySubject: clinicOwnerSubject,
  };

  const provider: Doc<"providers"> = {
    _id: PROVIDER_ID,
    _creationTime: 2,
    clinicId: options.providerClinicId ?? CLINIC_ID,
    name: "Dr. Rivera",
    isActive: true,
  };

  const appointmentSeed = options.appointment
    ? {
        _id: APPOINTMENT_ID,
        _creationTime: 3,
        clinicId: CLINIC_ID,
        providerId: PROVIDER_ID,
        patientName: "Maria",
        patientPhone: "+573001112233",
        startAtUtcMs:
          options.appointment.startAtUtcMs ?? toBogotaUtcMs(DATE_LOCAL, 540),
        endAtUtcMs:
          options.appointment.endAtUtcMs ?? toBogotaUtcMs(DATE_LOCAL, 570),
        status: options.appointment.status,
        ...(options.appointment.confirmedAtUtcMs === undefined
          ? {}
          : { confirmedAtUtcMs: options.appointment.confirmedAtUtcMs }),
      }
    : null;

  const appointments = new Map<Id<"appointments">, Doc<"appointments">>();
  if (appointmentSeed) {
    appointments.set(APPOINTMENT_ID, appointmentSeed);
  }

  for (const extra of options.extraAppointments ?? []) {
    appointments.set(extra.id, {
      _id: extra.id,
      _creationTime: 4,
      clinicId: CLINIC_ID,
      providerId: PROVIDER_ID,
      patientName: "Extra",
      patientPhone: "+570000000000",
      startAtUtcMs: extra.startAtUtcMs,
      endAtUtcMs: extra.endAtUtcMs ?? extra.startAtUtcMs + 30 * 60 * 1_000,
      status: extra.status ?? "scheduled",
      ...(extra.confirmedAtUtcMs === undefined
        ? {}
        : { confirmedAtUtcMs: extra.confirmedAtUtcMs }),
    });
  }

  const getUserIdentity = vi
    .fn()
    .mockResolvedValue(identitySubject ? { subject: identitySubject } : null);

  const query = vi.fn().mockImplementation((table: string) => ({
    withIndex: vi
      .fn()
      .mockImplementation(
        (index: string, applyIndex?: (queryBuilder: unknown) => unknown) => {
          if (table === "clinics" && index === "by_slug") {
            return { unique: vi.fn().mockResolvedValue(clinic) };
          }

          if (table === "providers" && index === "by_clinicId_and_name") {
            return { unique: vi.fn().mockResolvedValue(provider) };
          }

          if (table === "clinicBookingPolicies" && index === "by_clinicId") {
            return {
              unique: vi.fn().mockResolvedValue(
                policy === null
                  ? null
                  : {
                      _id: "policy_1" as Id<"clinicBookingPolicies">,
                      _creationTime: 5,
                      clinicId: CLINIC_ID,
                      appointmentDurationMin: policy.appointmentDurationMin,
                      slotStepMin: policy.slotStepMin,
                      leadTimeMin: policy.leadTimeMin,
                      bookingHorizonDays: policy.bookingHorizonDays,
                    },
              ),
            };
          }

          if (
            table === "providerWeeklySchedules" &&
            index === "by_providerId_and_dayOfWeek"
          ) {
            return {
              collect: vi.fn().mockResolvedValue(
                weeklyWindows.map((window, windowIndex) => ({
                  _id: `window_${windowIndex}` as Id<"providerWeeklySchedules">,
                  _creationTime: 6 + windowIndex,
                  clinicId: CLINIC_ID,
                  providerId: PROVIDER_ID,
                  dayOfWeek: window.dayOfWeek,
                  startMinute: window.startMinute,
                  endMinute: window.endMinute,
                })),
              ),
            };
          }

          if (
            table === "appointments" &&
            index === "by_providerId_and_startAtUtcMs"
          ) {
            let providerId: Id<"providers"> | null = null;
            let rangeStart: number | null = null;
            let rangeEnd: number | null = null;

            const queryBuilder = {
              eq(field: string, value: unknown) {
                if (field === "providerId") {
                  providerId = value as Id<"providers">;
                }
                return queryBuilder;
              },
              gte(field: string, value: number) {
                if (field === "startAtUtcMs") {
                  rangeStart = value;
                }
                return queryBuilder;
              },
              lte(field: string, value: number) {
                if (field === "startAtUtcMs") {
                  rangeEnd = value;
                }
                return queryBuilder;
              },
            };

            applyIndex?.(queryBuilder);

            const readResults = () => {
              const sorted = Array.from(appointments.values()).sort(
                (left, right) => left.startAtUtcMs - right.startAtUtcMs,
              );

              return sorted.filter((appointment) => {
                if (providerId && appointment.providerId !== providerId) {
                  return false;
                }
                if (
                  rangeStart !== null &&
                  appointment.startAtUtcMs < rangeStart
                ) {
                  return false;
                }
                if (rangeEnd !== null && appointment.startAtUtcMs > rangeEnd) {
                  return false;
                }
                return true;
              });
            };

            return {
              take: vi
                .fn()
                .mockImplementation(async (limit: number) =>
                  readResults().slice(0, limit),
                ),
              collect: vi.fn().mockImplementation(async () => readResults()),
              paginate: vi
                .fn()
                .mockImplementation(
                  async ({
                    cursor,
                    numItems,
                  }: {
                    cursor: null | string;
                    numItems: number;
                  }) => {
                    const results = readResults();
                    const parsedCursor =
                      cursor === null || cursor === ""
                        ? 0
                        : Number.parseInt(cursor, 10);
                    const startIndex = Number.isNaN(parsedCursor)
                      ? 0
                      : parsedCursor;
                    const page = results.slice(
                      startIndex,
                      startIndex + numItems,
                    );
                    const nextIndex = startIndex + page.length;
                    const isDone = nextIndex >= results.length;

                    return {
                      page,
                      isDone,
                      continueCursor: isDone ? "" : `${nextIndex}`,
                      splitCursor: null,
                    };
                  },
                ),
            };
          }

          return {
            unique: vi.fn().mockResolvedValue(null),
            collect: vi.fn().mockResolvedValue([]),
          };
        },
      ),
  }));

  const get = vi.fn().mockImplementation(async (id: string) => {
    if (id === CLINIC_ID) {
      return clinic;
    }

    if (id === SECOND_CLINIC_ID) {
      return {
        ...clinic,
        _id: SECOND_CLINIC_ID,
      };
    }

    if (id === PROVIDER_ID) {
      return provider;
    }

    return appointments.get(id as Id<"appointments">) ?? null;
  });

  const patch = vi
    .fn()
    .mockImplementation(
      async (id: Id<"appointments">, value: Partial<Doc<"appointments">>) => {
        const current = appointments.get(id);
        if (!current) {
          return;
        }
        appointments.set(id, { ...current, ...value });
      },
    );

  const insert = vi
    .fn()
    .mockImplementation(async (table: string, value: object) => {
      if (table === "appointments") {
        appointments.set(NEW_APPOINTMENT_ID, {
          _id: NEW_APPOINTMENT_ID,
          _creationTime: Date.now(),
          ...(value as Omit<Doc<"appointments">, "_id" | "_creationTime">),
        });
        return NEW_APPOINTMENT_ID;
      }
      return "created";
    });

  const runMutation = vi.fn().mockResolvedValue({ ok: true });

  return {
    ctx: {
      auth: { getUserIdentity },
      runMutation,
      db: { query, get, patch, insert },
    },
    spies: {
      getUserIdentity,
      runMutation,
      query,
      get,
      patch,
      insert,
    },
    state: {
      appointments,
      clinic,
      provider,
    },
  };
}

async function expectSchedulingCode(
  promise: Promise<unknown>,
  expectedCode: string,
) {
  try {
    await promise;
    throw new Error("Expected operation to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const convexError = error as ConvexError<{ code?: string }>;
    expect(convexError.data).toMatchObject({ code: expectedCode });
  }
}

describe("scheduling handlers", () => {
  it("rejects unauthenticated callers for owner APIs including availability", async () => {
    const mock = createMockContext({
      identitySubject: null,
      appointment: { status: "scheduled" },
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    await expectSchedulingCode(
      listAvailableSlotsForOwnerHandler(
        ctx as unknown as Parameters<
          typeof listAvailableSlotsForOwnerHandler
        >[0],
        {
          clinicSlug: "clinica-centro",
          providerName: "Dr. Rivera",
          dateLocal: DATE_LOCAL,
          nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
        },
      ),
      SCHEDULING_ERROR_CODES.AUTH_REQUIRED,
    );

    await expectSchedulingCode(
      listAppointmentsPageForOwnerHandler(
        ctx as unknown as Parameters<
          typeof listAppointmentsPageForOwnerHandler
        >[0],
        {
          clinicSlug: "clinica-centro",
          providerName: "Dr. Rivera",
          rangeStartUtcMs: toBogotaUtcMs(DATE_LOCAL, 0),
          rangeEndUtcMs: toBogotaUtcMs(DATE_LOCAL, 1_439),
          paginationOpts: {
            cursor: null,
            numItems: 2,
          },
        },
      ),
      SCHEDULING_ERROR_CODES.AUTH_REQUIRED,
    );

    await expectSchedulingCode(
      createAppointmentForOwnerHandler(ctx, {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        patientName: "Maria",
        patientPhone: "+573001112233",
        startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
      }),
      SCHEDULING_ERROR_CODES.AUTH_REQUIRED,
    );
  });

  it("rejects non-owner calls for owner availability and mutations", async () => {
    const mock = createMockContext({
      identitySubject: "intruder",
      clinicOwnerSubject: "owner_1",
      appointment: { status: "scheduled" },
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    await expectSchedulingCode(
      listAvailableSlotsForOwnerHandler(
        ctx as unknown as Parameters<
          typeof listAvailableSlotsForOwnerHandler
        >[0],
        {
          clinicSlug: "clinica-centro",
          providerName: "Dr. Rivera",
          dateLocal: DATE_LOCAL,
          nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
        },
      ),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );

    await expectSchedulingCode(
      listAppointmentsPageForOwnerHandler(
        ctx as unknown as Parameters<
          typeof listAppointmentsPageForOwnerHandler
        >[0],
        {
          clinicSlug: "clinica-centro",
          providerName: "Dr. Rivera",
          rangeStartUtcMs: toBogotaUtcMs(DATE_LOCAL, 0),
          rangeEndUtcMs: toBogotaUtcMs(DATE_LOCAL, 1_439),
          paginationOpts: {
            cursor: null,
            numItems: 2,
          },
        },
      ),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );

    await expectSchedulingCode(
      createAppointmentForOwnerHandler(ctx, {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        patientName: "Maria",
        patientPhone: "+573001112233",
        startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
      }),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );
  });

  it("owner availability returns sorted topN", async () => {
    const mock = createMockContext({
      appointment: null,
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 780 }],
    });

    const slots = await listAvailableSlotsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        dateLocal: DATE_LOCAL,
        nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
        limit: 3,
      },
    );

    expect(slots).toHaveLength(3);
    expect(slots.map((slot) => slot.startAtUtcMs)).toEqual([
      toBogotaUtcMs(DATE_LOCAL, 540),
      toBogotaUtcMs(DATE_LOCAL, 555),
      toBogotaUtcMs(DATE_LOCAL, 570),
    ]);
    expect(slots[0]?.label).toContain("GMT");
  });

  it("applies lead-time exclusion in availability", async () => {
    const mock = createMockContext({ appointment: null });

    const slots = await listAvailableSlotsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        dateLocal: DATE_LOCAL,
        nowUtcMs: toBogotaUtcMs(DATE_LOCAL, 530),
      },
    );

    expect(slots.map((slot) => slot.startAtUtcMs)).toEqual([
      toBogotaUtcMs(DATE_LOCAL, 600),
      toBogotaUtcMs(DATE_LOCAL, 615),
      toBogotaUtcMs(DATE_LOCAL, 630),
    ]);
  });

  it("applies horizon exclusion in availability", async () => {
    const mock = createMockContext({
      appointment: null,
      policy: {
        appointmentDurationMin: 30,
        slotStepMin: 15,
        leadTimeMin: 0,
        bookingHorizonDays: 1,
      },
    });

    const slots = await listAvailableSlotsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        dateLocal: "2026-02-24",
        nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
      },
    );

    expect(slots).toEqual([]);
  });

  it("excludes conflicts with scheduled appointments", async () => {
    const mock = createMockContext({
      appointment: null,
      extraAppointments: [
        {
          id: "appointment_2" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
          endAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
          status: "scheduled",
        },
      ],
    });

    const slots = await listAvailableSlotsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        dateLocal: DATE_LOCAL,
        nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
      },
    );

    expect(slots.map((slot) => slot.startAtUtcMs)).not.toContain(
      toBogotaUtcMs(DATE_LOCAL, 540),
    );
    expect(slots.map((slot) => slot.startAtUtcMs)).not.toContain(
      toBogotaUtcMs(DATE_LOCAL, 555),
    );
  });

  it("ignores canceled appointments when listing availability", async () => {
    const mock = createMockContext({
      appointment: null,
      extraAppointments: [
        {
          id: "appointment_2" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
          endAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
          status: "canceled",
        },
      ],
    });

    const slots = await listAvailableSlotsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        dateLocal: DATE_LOCAL,
        nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
      },
    );

    expect(slots.map((slot) => slot.startAtUtcMs)).toContain(
      toBogotaUtcMs(DATE_LOCAL, 540),
    );
  });

  it("create rejects slot outside schedule with SLOT_UNAVAILABLE", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(toBogotaUtcMs("2026-02-22", 540)));

    const mock = createMockContext({ appointment: null });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    await expectSchedulingCode(
      createAppointmentForOwnerHandler(ctx, {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        patientName: "Maria",
        patientPhone: "+573001112233",
        startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 720),
      }),
      SCHEDULING_ERROR_CODES.SLOT_UNAVAILABLE,
    );

    vi.useRealTimers();
  });

  it("create rejects occupied or stale slot with SLOT_UNAVAILABLE", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(toBogotaUtcMs("2026-02-22", 540)));

    const mock = createMockContext({
      appointment: null,
      extraAppointments: [
        {
          id: "appointment_2" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
          endAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
          status: "scheduled",
        },
      ],
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    await expectSchedulingCode(
      createAppointmentForOwnerHandler(ctx, {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        patientName: "Maria",
        patientPhone: "+573001112233",
        startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
      }),
      SCHEDULING_ERROR_CODES.SLOT_UNAVAILABLE,
    );

    vi.useRealTimers();
  });

  it("create succeeds on valid open slot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(toBogotaUtcMs("2026-02-22", 540)));

    const mock = createMockContext({ appointment: null });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    const appointmentId = await createAppointmentForOwnerHandler(ctx, {
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
      patientName: "Maria",
      patientPhone: "+573001112233",
      startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
    });

    expect(appointmentId).toBe(NEW_APPOINTMENT_ID);
    expect(mock.spies.insert).toHaveBeenCalledWith("appointments", {
      clinicId: CLINIC_ID,
      providerId: PROVIDER_ID,
      patientName: "Maria",
      patientPhone: "+573001112233",
      startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
      endAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
      status: "scheduled",
    });

    vi.useRealTimers();
  });

  it("internal availability query has parity with owner query for same inputs", async () => {
    const mock = createMockContext({
      appointment: null,
      extraAppointments: [
        {
          id: "appointment_2" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
          endAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
          status: "scheduled",
        },
      ],
    });

    const ownerSlots = await listAvailableSlotsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        dateLocal: DATE_LOCAL,
        nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
      },
    );

    const internalSlots = await listAvailableSlotsForInternalHandler(
      mock.ctx as unknown as Parameters<
        typeof listAvailableSlotsForInternalHandler
      >[0],
      {
        clinicId: CLINIC_ID,
        providerId: PROVIDER_ID,
        dateLocal: DATE_LOCAL,
        nowUtcMs: toBogotaUtcMs("2026-02-22", 540),
      },
    );

    expect(internalSlots).toEqual(ownerSlots);
  });

  it("lists appointments using indexed range bounds and respects limit", async () => {
    const mock = createMockContext({
      appointment: null,
      extraAppointments: [
        {
          id: "appointment_2" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
        },
        {
          id: "appointment_3" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
        },
        {
          id: "appointment_4" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 600),
        },
      ],
    });

    const appointments = await listAppointmentsForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAppointmentsForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        rangeStartUtcMs: toBogotaUtcMs(DATE_LOCAL, 530),
        rangeEndUtcMs: toBogotaUtcMs(DATE_LOCAL, 620),
        limit: 2,
      },
    );

    expect(appointments.map((appointment) => appointment.startAtUtcMs)).toEqual(
      [toBogotaUtcMs(DATE_LOCAL, 540), toBogotaUtcMs(DATE_LOCAL, 570)],
    );
  });

  it("paginates appointments for owners with range filters and cursor progression", async () => {
    const mock = createMockContext({
      appointment: null,
      extraAppointments: [
        {
          id: "appointment_1" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 510),
        },
        {
          id: "appointment_2" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 540),
        },
        {
          id: "appointment_3" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 570),
        },
        {
          id: "appointment_4" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 600),
        },
        {
          id: "appointment_5" as Id<"appointments">,
          startAtUtcMs: toBogotaUtcMs(DATE_LOCAL, 630),
        },
      ],
    });

    const firstPage = await listAppointmentsPageForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAppointmentsPageForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        rangeStartUtcMs: toBogotaUtcMs(DATE_LOCAL, 530),
        rangeEndUtcMs: toBogotaUtcMs(DATE_LOCAL, 620),
        paginationOpts: {
          cursor: null,
          numItems: 2,
        },
      },
    );

    expect(
      firstPage.page.map((appointment) => appointment.startAtUtcMs),
    ).toEqual([toBogotaUtcMs(DATE_LOCAL, 540), toBogotaUtcMs(DATE_LOCAL, 570)]);
    expect(firstPage.isDone).toBe(false);
    expect(firstPage.continueCursor).toBe("2");

    const secondPage = await listAppointmentsPageForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof listAppointmentsPageForOwnerHandler
      >[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        rangeStartUtcMs: toBogotaUtcMs(DATE_LOCAL, 530),
        rangeEndUtcMs: toBogotaUtcMs(DATE_LOCAL, 620),
        paginationOpts: {
          cursor: firstPage.continueCursor,
          numItems: 2,
        },
      },
    );

    expect(
      secondPage.page.map((appointment) => appointment.startAtUtcMs),
    ).toEqual([toBogotaUtcMs(DATE_LOCAL, 600)]);
    expect(secondPage.isDone).toBe(true);
  });

  it("confirm is idempotent and second retry returns changed false", async () => {
    const mock = createMockContext({
      appointment: { status: "scheduled" },
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof confirmAppointmentForOwnerHandler
    >[0];

    const first = await confirmAppointmentForOwnerHandler(ctx, {
      appointmentId: APPOINTMENT_ID,
      confirmedAtUtcMs: 9_999,
    });
    const second = await confirmAppointmentForOwnerHandler(ctx, {
      appointmentId: APPOINTMENT_ID,
    });

    expect(first).toEqual({ changed: true });
    expect(second).toEqual({ changed: false });
    expect(mock.spies.patch).toHaveBeenCalledTimes(1);
  });

  it("cancel is idempotent and second retry returns changed false", async () => {
    const mock = createMockContext({
      appointment: { status: "scheduled" },
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof cancelAppointmentForOwnerHandler
    >[0];

    const first = await cancelAppointmentForOwnerHandler(ctx, {
      appointmentId: APPOINTMENT_ID,
    });
    const second = await cancelAppointmentForOwnerHandler(ctx, {
      appointmentId: APPOINTMENT_ID,
    });

    expect(first).toEqual({ changed: true });
    expect(second).toEqual({ changed: false });
    expect(mock.spies.patch).toHaveBeenCalledTimes(1);
  });

  it("rejects confirm when appointment is already canceled", async () => {
    const mock = createMockContext({
      appointment: { status: "canceled" },
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof confirmAppointmentForOwnerHandler
    >[0];

    await expectSchedulingCode(
      confirmAppointmentForOwnerHandler(ctx, {
        appointmentId: APPOINTMENT_ID,
      }),
      SCHEDULING_ERROR_CODES.INVALID_TRANSITION,
    );
  });

  it("reads appointment by id for owner", async () => {
    const mock = createMockContext({
      appointment: { status: "scheduled" },
    });

    const appointment = await getAppointmentByIdForOwnerHandler(
      mock.ctx as unknown as Parameters<
        typeof getAppointmentByIdForOwnerHandler
      >[0],
      {
        appointmentId: APPOINTMENT_ID,
      },
    );

    expect(appointment._id).toBe(APPOINTMENT_ID);
  });
});
