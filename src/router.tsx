import type { QueryClient } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";
import { routeTree } from "./routeTree.gen";
import { useAppAuth } from "@/hooks/useAppAuth";

export type RouterContext = {
  auth: {
    isLoading: boolean;
    isAuthenticated: boolean;
  };
  queryClient: QueryClient;
};

const defaultRouterContext: RouterContext = {
  auth: {
    isLoading: true,
    isAuthenticated: false,
  },
  queryClient: null as unknown as QueryClient,
};

export const router = createRouter({
  routeTree,
  context: defaultRouterContext,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider({
  queryClient,
}: Readonly<{ queryClient: QueryClient }>) {
  const { isAuthenticated, isLoading } = useAppAuth();

  const context = useMemo<RouterContext>(
    () => ({
      auth: {
        isLoading,
        isAuthenticated,
      },
      queryClient,
    }),
    [isAuthenticated, isLoading, queryClient],
  );

  const authVersion = useMemo(
    () => `${isLoading ? "1" : "0"}:${isAuthenticated ? "1" : "0"}`,
    [isAuthenticated, isLoading],
  );
  const previousAuthVersion = useRef<string | null>(null);

  // Re-run beforeLoad guards whenever auth state settles so protected routes
  // redirect unauthenticated users even after the initial render.
  useEffect(() => {
    if (previousAuthVersion.current === authVersion) {
      return;
    }

    previousAuthVersion.current = authVersion;
    void router.invalidate();
  }, [authVersion]);

  return <RouterProvider context={context} router={router} />;
}
