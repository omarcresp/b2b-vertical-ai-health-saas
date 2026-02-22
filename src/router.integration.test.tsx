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
import { routeTree } from "./routeTree.gen";

const { mockProviderRender, mockSignIn, mockAuthState } = vi.hoisted(() => ({
  mockProviderRender: vi.fn(),
  mockSignIn: vi.fn(),
  mockAuthState: {
    isLoading: false,
    user: null as null | { id: string },
  },
}));

vi.mock("@/features/setup/workspace", () => ({
  SetupWorkspaceShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ),
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

  it("renders /callback safely", async () => {
    const user = userEvent.setup();
    renderAtPath("/callback", { isAuthenticated: false });

    const signInButton = await screen.findByRole("button", { name: "Sign in" });
    await user.click(signInButton);

    expect(mockSignIn).toHaveBeenCalledTimes(1);
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
