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
} from "./scheduling";

const CLINIC_ID = "clinic_1" as Id<"clinics">;
const PROVIDER_ID = "provider_1" as Id<"providers">;
const APPOINTMENT_ID = "appointment_1" as Id<"appointments">;
const NEW_APPOINTMENT_ID = "appointment_new" as Id<"appointments">;

type MockContextOptions = {
  identitySubject?: string | null;
  clinicOwnerSubject?: string;
  appointment?: {
    status: "scheduled" | "canceled";
    confirmedAtUtcMs?: number;
    startAtUtcMs?: number;
    endAtUtcMs?: number;
  } | null;
  policyDurationMin?: number | null;
};

function createMockContext(options: MockContextOptions = {}) {
  const identitySubject =
    options.identitySubject === undefined ? "owner_1" : options.identitySubject;
  const clinicOwnerSubject = options.clinicOwnerSubject ?? "owner_1";
  const policyDurationMin = options.policyDurationMin ?? 30;

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
    clinicId: CLINIC_ID,
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
        startAtUtcMs: options.appointment.startAtUtcMs ?? 1_000,
        endAtUtcMs: options.appointment.endAtUtcMs ?? 2_800_000,
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

  const getUserIdentity = vi
    .fn()
    .mockResolvedValue(identitySubject ? { subject: identitySubject } : null);

  const query = vi.fn().mockImplementation((table: string) => ({
    withIndex: vi.fn().mockImplementation((index: string) => {
      if (table === "clinics" && index === "by_slug") {
        return { unique: vi.fn().mockResolvedValue(clinic) };
      }

      if (table === "providers" && index === "by_clinicId_and_name") {
        return { unique: vi.fn().mockResolvedValue(provider) };
      }

      if (table === "clinicBookingPolicies" && index === "by_clinicId") {
        return {
          unique: vi.fn().mockResolvedValue(
            policyDurationMin === null
              ? null
              : {
                  _id: "policy_1" as Id<"clinicBookingPolicies">,
                  _creationTime: 4,
                  clinicId: CLINIC_ID,
                  appointmentDurationMin: policyDurationMin,
                  slotStepMin: 15,
                  leadTimeMin: 60,
                  bookingHorizonDays: 30,
                },
          ),
        };
      }

      if (
        table === "appointments" &&
        index === "by_providerId_and_startAtUtcMs"
      ) {
        return {
          collect: vi.fn().mockResolvedValue(Array.from(appointments.values())),
        };
      }

      return {
        unique: vi.fn().mockResolvedValue(null),
        collect: vi.fn().mockResolvedValue([]),
      };
    }),
  }));

  const get = vi.fn().mockImplementation(async (id: string) => {
    if (id === CLINIC_ID) {
      return clinic;
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

  return {
    ctx: {
      auth: { getUserIdentity },
      db: { query, get, patch, insert },
    },
    spies: {
      getUserIdentity,
      query,
      get,
      patch,
      insert,
    },
    state: {
      appointments,
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
  it("rejects unauthenticated callers for all scheduling APIs", async () => {
    const mock = createMockContext({
      identitySubject: null,
      appointment: { status: "scheduled" },
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    const createCall = createAppointmentForOwnerHandler(ctx, {
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
      patientName: "Maria",
      patientPhone: "+573001112233",
      startAtUtcMs: 1_000,
    });
    const listCall = listAppointmentsForOwnerHandler(
      ctx as unknown as Parameters<typeof listAppointmentsForOwnerHandler>[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
        rangeStartUtcMs: 0,
        rangeEndUtcMs: 2_000,
      },
    );
    const getCall = getAppointmentByIdForOwnerHandler(
      ctx as unknown as Parameters<typeof getAppointmentByIdForOwnerHandler>[0],
      { appointmentId: APPOINTMENT_ID },
    );
    const confirmCall = confirmAppointmentForOwnerHandler(ctx, {
      appointmentId: APPOINTMENT_ID,
    });
    const cancelCall = cancelAppointmentForOwnerHandler(ctx, {
      appointmentId: APPOINTMENT_ID,
    });

    await expectSchedulingCode(
      createCall,
      SCHEDULING_ERROR_CODES.AUTH_REQUIRED,
    );
    await expectSchedulingCode(listCall, SCHEDULING_ERROR_CODES.AUTH_REQUIRED);
    await expectSchedulingCode(getCall, SCHEDULING_ERROR_CODES.AUTH_REQUIRED);
    await expectSchedulingCode(
      confirmCall,
      SCHEDULING_ERROR_CODES.AUTH_REQUIRED,
    );
    await expectSchedulingCode(
      cancelCall,
      SCHEDULING_ERROR_CODES.AUTH_REQUIRED,
    );
  });

  it("rejects non-owner calls for list/create/confirm/cancel", async () => {
    const mock = createMockContext({
      identitySubject: "intruder",
      clinicOwnerSubject: "owner_1",
      appointment: { status: "scheduled" },
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
        startAtUtcMs: 1_000,
      }),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );

    await expectSchedulingCode(
      listAppointmentsForOwnerHandler(
        ctx as unknown as Parameters<typeof listAppointmentsForOwnerHandler>[0],
        {
          clinicSlug: "clinica-centro",
          providerName: "Dr. Rivera",
          rangeStartUtcMs: 0,
          rangeEndUtcMs: 2_000,
        },
      ),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );

    await expectSchedulingCode(
      confirmAppointmentForOwnerHandler(ctx, {
        appointmentId: APPOINTMENT_ID,
      }),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );

    await expectSchedulingCode(
      cancelAppointmentForOwnerHandler(ctx, {
        appointmentId: APPOINTMENT_ID,
      }),
      SCHEDULING_ERROR_CODES.FORBIDDEN,
    );
  });

  it("creates scheduled appointment and computes endAtUtcMs from policy duration", async () => {
    const mock = createMockContext({
      appointment: null,
      policyDurationMin: 30,
    });
    const ctx = mock.ctx as unknown as Parameters<
      typeof createAppointmentForOwnerHandler
    >[0];

    const appointmentId = await createAppointmentForOwnerHandler(ctx, {
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
      patientName: "Maria",
      patientPhone: "+573001112233",
      startAtUtcMs: 1_000,
    });

    expect(appointmentId).toBe(NEW_APPOINTMENT_ID);
    expect(mock.spies.insert).toHaveBeenCalledWith("appointments", {
      clinicId: CLINIC_ID,
      providerId: PROVIDER_ID,
      patientName: "Maria",
      patientPhone: "+573001112233",
      startAtUtcMs: 1_000,
      endAtUtcMs: 1_801_000,
      status: "scheduled",
    });
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
});
