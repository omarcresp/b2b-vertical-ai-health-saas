import { ConvexError } from "convex/values";
import { describe, expect, it, vi } from "vitest";
import { SETUP_ERROR_CODES } from "../shared/setupErrorCodes";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getMyLatestSetupKeyHandler,
  getSetupSnapshotHandler,
  upsertClinicProviderSetupHandler,
} from "./model/setup";

const CLINIC_ID = "clinic_1" as Id<"clinics">;
const PROVIDER_ID = "provider_1" as Id<"providers">;

function createClinic(ownerSubject: string): Doc<"clinics"> {
  return {
    _id: CLINIC_ID,
    _creationTime: 1,
    name: "Clinica Centro",
    slug: "clinica-centro",
    city: "bogota",
    timezone: "America/Bogota",
    createdBySubject: ownerSubject,
  };
}

async function expectSetupCode(
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

describe("setup handlers", () => {
  it("rejects clinic overwrite attempts by non-owners", async () => {
    const query = vi.fn().mockImplementation((table: string) => ({
      withIndex: vi.fn().mockImplementation((index: string) => {
        if (table === "clinics" && index === "by_slug") {
          return { unique: vi.fn().mockResolvedValue(createClinic("owner_1")) };
        }

        return {
          unique: vi.fn().mockResolvedValue(null),
          collect: vi.fn().mockResolvedValue([]),
        };
      }),
    }));

    const patch = vi.fn();
    const ctx = {
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ subject: "intruder" }),
      },
      runMutation: vi.fn().mockResolvedValue({ ok: true }),
      db: {
        query,
        patch,
        insert: vi.fn(),
        delete: vi.fn(),
      },
    };

    await expectSetupCode(
      upsertClinicProviderSetupHandler(
        ctx as unknown as Parameters<
          typeof upsertClinicProviderSetupHandler
        >[0],
        {
          clinicName: "Clinica Centro",
          clinicSlug: "clinica-centro",
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
              endMinute: 600,
            },
          ],
        },
      ),
      SETUP_ERROR_CODES.FORBIDDEN,
    );

    expect(patch).not.toHaveBeenCalled();
  });

  it("returns null snapshot for authenticated non-owners", async () => {
    const foreignClinic = createClinic("owner_1");
    const ctx = {
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ subject: "intruder" }),
      },
      db: {
        query: vi.fn().mockImplementation((table: string) => ({
          withIndex: vi.fn().mockImplementation((index: string) => {
            if (table === "clinics" && index === "by_slug") {
              return { unique: vi.fn().mockResolvedValue(foreignClinic) };
            }
            return {
              unique: vi.fn().mockResolvedValue(null),
              collect: vi.fn().mockResolvedValue([]),
            };
          }),
        })),
      },
    };

    const result = await getSetupSnapshotHandler(
      ctx as unknown as Parameters<typeof getSetupSnapshotHandler>[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      },
    );

    expect(result).toBeNull();
  });

  it("does not query appointments while building setup snapshot", async () => {
    const clinic = createClinic("owner_1");
    const provider: Doc<"providers"> = {
      _id: PROVIDER_ID,
      _creationTime: 2,
      clinicId: CLINIC_ID,
      name: "Dr. Rivera",
      isActive: true,
    };

    const ctx = {
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ subject: "owner_1" }),
      },
      db: {
        query: vi.fn().mockImplementation((table: string) => {
          if (table === "appointments") {
            throw new Error("appointments should not be queried by snapshot");
          }

          return {
            withIndex: vi.fn().mockImplementation((index: string) => {
              if (table === "clinics" && index === "by_slug") {
                return { unique: vi.fn().mockResolvedValue(clinic) };
              }

              if (table === "providers" && index === "by_clinicId_and_name") {
                return { unique: vi.fn().mockResolvedValue(provider) };
              }

              if (
                table === "clinicBookingPolicies" &&
                index === "by_clinicId"
              ) {
                return {
                  unique: vi.fn().mockResolvedValue({
                    _id: "policy_1" as Id<"clinicBookingPolicies">,
                    _creationTime: 3,
                    clinicId: CLINIC_ID,
                    appointmentDurationMin: 30,
                    slotStepMin: 15,
                    leadTimeMin: 60,
                    bookingHorizonDays: 30,
                  }),
                };
              }

              if (
                table === "providerWeeklySchedules" &&
                index === "by_providerId_and_dayOfWeek"
              ) {
                return {
                  collect: vi.fn().mockResolvedValue([
                    {
                      _id: "window_1" as Id<"providerWeeklySchedules">,
                      _creationTime: 4,
                      clinicId: CLINIC_ID,
                      providerId: PROVIDER_ID,
                      dayOfWeek: 1,
                      startMinute: 540,
                      endMinute: 600,
                    },
                  ]),
                };
              }

              return {
                unique: vi.fn().mockResolvedValue(null),
                collect: vi.fn().mockResolvedValue([]),
              };
            }),
          };
        }),
      },
    };

    const result = await getSetupSnapshotHandler(
      ctx as unknown as Parameters<typeof getSetupSnapshotHandler>[0],
      {
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      },
    );

    expect(result).not.toBeNull();
  });

  it("reads latest setup key with bounded index scans", async () => {
    const withIndexSpy = vi.fn();
    const clinicsOrderSpy = vi.fn();
    const clinicsTakeSpy = vi.fn().mockResolvedValue([createClinic("owner_1")]);
    const clinicsCollectSpy = vi.fn();
    const activeProviderOrderSpy = vi.fn();
    const activeProviderTakeSpy = vi.fn().mockResolvedValue([]);
    const activeProviderCollectSpy = vi.fn();
    const fallbackProviderOrderSpy = vi.fn();
    const fallbackProviderTakeSpy = vi.fn().mockResolvedValue([
      {
        _id: PROVIDER_ID,
        _creationTime: 2,
        clinicId: CLINIC_ID,
        name: "Dr. Rivera",
        isActive: false,
      },
    ]);
    const fallbackProviderCollectSpy = vi.fn();

    const query = vi.fn().mockImplementation((table: string) => ({
      withIndex: vi.fn().mockImplementation((index: string) => {
        withIndexSpy(table, index);

        if (table === "clinics" && index === "by_createdBySubject") {
          return {
            order: clinicsOrderSpy.mockImplementation(() => ({
              take: clinicsTakeSpy,
            })),
            collect: clinicsCollectSpy,
          };
        }

        if (table === "providers" && index === "by_clinicId_and_isActive") {
          return {
            order: activeProviderOrderSpy.mockImplementation(() => ({
              take: activeProviderTakeSpy,
            })),
            collect: activeProviderCollectSpy,
          };
        }

        if (table === "providers" && index === "by_clinicId") {
          return {
            order: fallbackProviderOrderSpy.mockImplementation(() => ({
              take: fallbackProviderTakeSpy,
            })),
            collect: fallbackProviderCollectSpy,
          };
        }

        return {
          unique: vi.fn().mockResolvedValue(null),
          collect: vi.fn().mockResolvedValue([]),
        };
      }),
    }));

    const result = await getMyLatestSetupKeyHandler({
      auth: {
        getUserIdentity: vi.fn().mockResolvedValue({ subject: "owner_1" }),
      },
      db: { query },
    } as unknown as Parameters<typeof getMyLatestSetupKeyHandler>[0]);

    expect(result).toEqual({
      clinicSlug: "clinica-centro",
      providerName: "Dr. Rivera",
    });
    expect(withIndexSpy).toHaveBeenCalledWith("clinics", "by_createdBySubject");
    expect(withIndexSpy).toHaveBeenCalledWith(
      "providers",
      "by_clinicId_and_isActive",
    );
    expect(withIndexSpy).toHaveBeenCalledWith("providers", "by_clinicId");
    expect(clinicsOrderSpy).toHaveBeenCalledWith("desc");
    expect(clinicsTakeSpy).toHaveBeenCalledWith(20);
    expect(activeProviderOrderSpy).toHaveBeenCalledWith("asc");
    expect(activeProviderTakeSpy).toHaveBeenCalledWith(1);
    expect(fallbackProviderOrderSpy).toHaveBeenCalledWith("asc");
    expect(fallbackProviderTakeSpy).toHaveBeenCalledWith(1);
    expect(clinicsCollectSpy).not.toHaveBeenCalled();
    expect(activeProviderCollectSpy).not.toHaveBeenCalled();
    expect(fallbackProviderCollectSpy).not.toHaveBeenCalled();
  });
});
