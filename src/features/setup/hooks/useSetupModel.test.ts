import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSetupModel } from "./useSetupModel";

const { mockUseQuery, mockUseMutation, mockUseConvexMutation } = vi.hoisted(
  () => ({
    mockUseQuery: vi.fn(),
    mockUseMutation: vi.fn(),
    mockUseConvexMutation: vi.fn(),
  }),
);

vi.mock("#convex/_generated/api", () => ({
  api: {
    setup: {
      upsertClinicProviderSetup: {},
      getSetupSnapshot: {},
      getMyLatestSetupKey: {},
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: mockUseQuery,
  useMutation: mockUseMutation,
}));

vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (_ref: unknown, _args: unknown) => ({
    queryKey: ["stub"],
    queryFn: vi.fn(),
  }),
  useConvexMutation: mockUseConvexMutation,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@posthog/react", () => ({
  usePostHog: () => ({ capture: vi.fn(), captureException: vi.fn() }),
}));

vi.mock("@/hooks/useAppAuth", () => ({
  useAppAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

describe("useSetupModel — window management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: undefined });
    mockUseConvexMutation.mockReturnValue(vi.fn());
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
        isPending: false,
      }),
    );
  });

  it("initializes with one default window", () => {
    const { result } = renderHook(() => useSetupModel());

    expect(result.current.windows).toHaveLength(1);
    expect(result.current.windows[0]).toEqual({
      id: 1,
      dayOfWeek: 1,
      start: "09:00",
      end: "17:00",
    });
  });

  it("addWindow appends a window with an incremented id", () => {
    const { result } = renderHook(() => useSetupModel());

    act(() => {
      result.current.addWindow();
    });

    expect(result.current.windows).toHaveLength(2);
    expect(result.current.windows[1].id).toBe(2);
    expect(result.current.windows[1].dayOfWeek).toBe(1);
  });

  it("addWindow uses the provided dayOfWeek argument", () => {
    const { result } = renderHook(() => useSetupModel());

    act(() => {
      result.current.addWindow(3);
    });

    expect(result.current.windows[1].dayOfWeek).toBe(3);
  });

  it("updateWindow patches only the matching window and leaves others unchanged", () => {
    const { result } = renderHook(() => useSetupModel());

    act(() => {
      result.current.addWindow(2);
    });
    act(() => {
      result.current.updateWindow(1, { start: "08:00" });
    });

    expect(result.current.windows[0].start).toBe("08:00");
    expect(result.current.windows[1].start).toBe("09:00");
  });

  it("removeWindow on the only window leaves length at 1 (invariant)", () => {
    const { result } = renderHook(() => useSetupModel());

    act(() => {
      result.current.removeWindow(1);
    });

    expect(result.current.windows).toHaveLength(1);
  });

  it("removeWindow removes only the specified id when multiple windows exist", () => {
    const { result } = renderHook(() => useSetupModel());

    // Add windows in separate acts so each ref increment settles before the next read
    act(() => {
      result.current.addWindow(2);
    });
    act(() => {
      result.current.addWindow(3);
    });
    expect(result.current.windows).toHaveLength(3);

    // Resolve actual id rather than assuming a specific value
    const idToRemove = result.current.windows[1].id;
    act(() => {
      result.current.removeWindow(idToRemove);
    });

    expect(result.current.windows).toHaveLength(2);
    const remainingIds = result.current.windows.map((w) => w.id);
    expect(remainingIds).not.toContain(idToRemove);
    expect(remainingIds[0]).toBe(1);
  });

  it("replaceWindows resets ids sequentially and addWindow produces a unique id", () => {
    const { result } = renderHook(() => useSetupModel());

    act(() => {
      result.current.replaceWindows([
        { dayOfWeek: 1, start: "08:00", end: "16:00" },
        { dayOfWeek: 2, start: "09:00", end: "17:00" },
      ]);
    });

    expect(result.current.windows).toHaveLength(2);
    expect(result.current.windows[0]).toMatchObject({ id: 1, dayOfWeek: 1 });
    expect(result.current.windows[1]).toMatchObject({ id: 2, dayOfWeek: 2 });

    act(() => {
      result.current.addWindow();
    });

    expect(result.current.windows).toHaveLength(3);
    const allIds = result.current.windows.map((w) => w.id);
    // All ids must be unique — no collision with the reset windows
    expect(new Set(allIds).size).toBe(3);
    expect(allIds[2]).toBeGreaterThan(2);
  });
});
