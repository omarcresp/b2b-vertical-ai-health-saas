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

const { mockProviderRender, mockSignIn } = vi.hoisted(() => ({
  mockProviderRender: vi.fn(),
  mockSignIn: vi.fn(),
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
    isLoading: false,
    user: null,
    signIn: mockSignIn,
  }),
}));

function renderAtPath(pathname: string, auth?: Partial<RouterContext["auth"]>) {
  const context: RouterContext = {
    auth: {
      isLoading: auth?.isLoading ?? false,
      isAuthenticated: auth?.isAuthenticated ?? true,
    },
    navigation: {
      appPath: "/app",
      callbackPath: "/callback",
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
  });

  it("redirects / to /app/setup", async () => {
    const router = renderAtPath("/");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/app/setup");
    });
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
