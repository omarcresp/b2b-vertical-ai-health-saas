import { describe, expect, it, vi } from "vitest";
import type { SupportedLocale } from "../shared/locales";
import { getMyPreferencesHandler, setMyLocaleHandler } from "./userPreferences";

function createMockContext({
  identitySubject = "user_123",
  existingLocale = null,
}: {
  identitySubject?: string | null;
  existingLocale?: SupportedLocale | null;
}) {
  const unique = vi.fn().mockResolvedValue(
    existingLocale
      ? {
          _id: "pref_1",
          locale: existingLocale,
        }
      : null,
  );

  const withIndex = vi.fn().mockImplementation(() => ({ unique }));
  const query = vi.fn().mockImplementation(() => ({ withIndex }));
  const patch = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockResolvedValue("pref_1");
  const getUserIdentity = vi
    .fn()
    .mockResolvedValue(identitySubject ? { subject: identitySubject } : null);

  const ctx = {
    auth: { getUserIdentity },
    db: { query, patch, insert },
  };

  return {
    ctx,
    spies: { getUserIdentity, query, withIndex, unique, patch, insert },
  };
}

describe("userPreferences handlers", () => {
  it("rejects unauthenticated access", async () => {
    const { ctx } = createMockContext({ identitySubject: null });

    await expect(
      getMyPreferencesHandler(
        ctx as unknown as Parameters<typeof getMyPreferencesHandler>[0],
      ),
    ).rejects.toThrow("Authentication is required.");

    await expect(
      setMyLocaleHandler(
        ctx as unknown as Parameters<typeof setMyLocaleHandler>[0],
        { locale: "en-US" },
      ),
    ).rejects.toThrow("Authentication is required.");
  });

  it("stores and returns locale preference for authenticated users", async () => {
    const write = createMockContext({ existingLocale: null });
    const writeResult = await setMyLocaleHandler(
      write.ctx as unknown as Parameters<typeof setMyLocaleHandler>[0],
      {
        locale: "es-MX",
      },
    );

    expect(writeResult).toEqual({ locale: "es-MX" });
    expect(write.spies.insert).toHaveBeenCalledWith("userPreferences", {
      subject: "user_123",
      locale: "es-MX",
      updatedAtUtcMs: expect.any(Number),
    });

    const read = createMockContext({ existingLocale: "es-MX" });
    const readResult = await getMyPreferencesHandler(
      read.ctx as unknown as Parameters<typeof getMyPreferencesHandler>[0],
    );
    expect(readResult).toEqual({ locale: "es-MX" });
  });

  it("rejects unsupported locales", async () => {
    const { ctx } = createMockContext({ existingLocale: null });

    await expect(
      setMyLocaleHandler(
        ctx as unknown as Parameters<typeof setMyLocaleHandler>[0],
        { locale: "pt-BR" as SupportedLocale },
      ),
    ).rejects.toThrow("Invalid locale.");
  });
});
