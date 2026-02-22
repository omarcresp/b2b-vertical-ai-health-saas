import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterContext } from "./router";
import { AUTH_WAIT_TIMEOUT_MS } from "./routes/_authed";
import { routeTree } from "./routeTree.gen";

vi.mock("@posthog/react", () => ({
  PostHogProvider: ({ children }: { children: ReactNode }) => children,
}));

const { mockProviderRender, mockSignIn, mockAuthState } = vi.hoisted(() => ({
  mockProviderRender: vi.fn(),
  mockSignIn: vi.fn(),
  mockAuthState: {
    isLoading: false,
    user: null as null | { id: string },
  },
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isLoading: mockAuthState.isLoading,
    isAuthenticated: Boolean(mockAuthState.user),
  }),
}));

vi.mock("@/features/setup/components/SetupWorkspaceShell", () => ({
  SetupWorkspaceShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ),
}));

vi.mock("@/features/setup/context", () => ({
  SetupWorkspaceProvider: ({
    children,
    initialSnapshotKey,
    onSnapshotKeyChange,
  }: {
    children: ReactNode;
    initialSnapshotKey?: { clinicSlug: string; providerName: string } | null;
    onSnapshotKeyChange?: (value: {
      clinicSlug: string;
      providerName: string;
    }) => void;
  }) => {
    mockProviderRender(initialSnapshotKey ?? null);
    return (
      <div>
        <button
          onClick={() =>
            onSnapshotKeyChange?.({
              clinicSlug: "clinica-centro",
              providerName: "Dr. Rivera",
            })
          }
          type="button"
        >
          Emit snapshot key
        </button>
        {children}
      </div>
    );
  },
}));

vi.mock("@/features/setup/screens", () => ({
  default: () => <div>Overview screen</div>,
  SetupWorkspaceFullScreen: () => <div>Overview screen</div>,
  SetupWorkspaceSetupScreen: () => <div>Setup screen</div>,
  SetupWorkspaceSnapshotScreen: () => <div>Snapshot screen</div>,
  SetupWorkspaceAppointmentsScreen: () => <div>Appointments screen</div>,
}));

vi.mock("@workos-inc/authkit-react", () => ({
  useAuth: () => ({
    isLoading: mockAuthState.isLoading,
    user: mockAuthState.user,
    signIn: mockSignIn,
  }),
}));

function renderAtPath(pathname: string, auth?: Partial<RouterContext["auth"]>) {
  const isLoading = auth?.isLoading ?? false;
  const isAuthenticated = auth?.isAuthenticated ?? true;

  mockAuthState.isLoading = isLoading;
  mockAuthState.user = isAuthenticated ? { id: "user_1" } : null;

  const context: RouterContext = {
    auth: {
      isLoading,
      isAuthenticated,
    },
    queryClient: {
      prefetchQuery: vi.fn().mockResolvedValue(undefined),
    } as unknown as RouterContext["queryClient"],
  };

  const router = createRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: [pathname],
    }),
    context,
  });

  render(<RouterProvider context={context} router={router} />);
  return router;
}

describe("router migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.isLoading = false;
    mockAuthState.user = null;
  });

  it("redirects / to /app/setup", async () => {
    const router = renderAtPath("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/setup");
    });
  });

  it("redirects unauthenticated users to /callback with the original path", async () => {
    const router = renderAtPath("/app/setup?clinicSlug=clinica-centro", {
      isAuthenticated: false,
      isLoading: false,
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/callback");
      expect(router.state.location.search).toMatchObject({
        redirect: "/app/setup?clinicSlug=clinica-centro",
      });
    });
  });

  it("renders a loading guard while auth state is unresolved", async () => {
    renderAtPath("/app/setup", {
      isAuthenticated: false,
      isLoading: true,
    });

    expect(await screen.findByText("Loading workspace...")).toBeInTheDocument();
    expect(screen.queryByText("Setup screen")).not.toBeInTheDocument();
  });

  it("redirects to /callback if auth loading exceeds the timeout", async () => {
    const router = renderAtPath("/app/setup", {
      isAuthenticated: false,
      isLoading: true,
    });

    expect(await screen.findByText("Loading workspace...")).toBeInTheDocument();

    await new Promise((resolve) =>
      setTimeout(resolve, AUTH_WAIT_TIMEOUT_MS + 20),
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/callback");
    });
  });

  it("auto-redirects unauthenticated users from /callback to WorkOS sign in", async () => {
    renderAtPath("/callback", { isAuthenticated: false });

    expect(
      await screen.findByText("Redirecting to sign in..."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps safe internal callback redirects", async () => {
    const router = renderAtPath(
      "/callback?redirect=%2Fapp%2Fsetup%3FclinicSlug%3Dclinica-centro",
      { isAuthenticated: true, isLoading: false },
    );

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/setup");
      expect(router.state.location.search).toMatchObject({
        clinicSlug: "clinica-centro",
      });
    });
  });

  it.each([
    "/callback?redirect=%2F%2Fevil.example",
    "/callback?redirect=https%3A%2F%2Fevil.example%2Fapp",
    "/callback?redirect=app%2Fsetup",
    "/callback?redirect=",
  ])("normalizes unsafe callback redirect %s to /app", async (path) => {
    const router = renderAtPath(path, {
      isAuthenticated: true,
      isLoading: false,
    });

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/setup");
    });
  });

  it("updates /app search params after setup and hydrates on refresh", async () => {
    const user = userEvent.setup();
    const router = renderAtPath("/app");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/setup");
    });

    await user.click(
      await screen.findByRole("button", { name: "Emit snapshot key" }),
    );

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      });
    });

    renderAtPath("/app?clinicSlug=clinica-centro&providerName=Dr.%20Rivera");

    await waitFor(() => {
      expect(mockProviderRender).toHaveBeenCalledWith({
        clinicSlug: "clinica-centro",
        providerName: "Dr. Rivera",
      });
    });
  });
});
