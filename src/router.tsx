import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";
import { useEffect, useMemo } from "react";
import { routeTree } from "./routeTree.gen";

export type RouterContext = {
  auth: {
    isLoading: boolean;
    isAuthenticated: boolean;
  };
};

const defaultRouterContext: RouterContext = {
  auth: {
    isLoading: true,
    isAuthenticated: false,
  },
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

export function AppRouterProvider() {
  const { isLoading: isWorkOSLoading, user } = useAuth();
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();
  const hasWorkOSUser = Boolean(user);

  const isLoading = isWorkOSLoading || (hasWorkOSUser && isConvexLoading);
  const isAuthenticated = hasWorkOSUser && isConvexAuthenticated;

  const context = useMemo<RouterContext>(
    () => ({
      auth: {
        isLoading,
        isAuthenticated,
      },
    }),
    [isAuthenticated, isLoading],
  );

  // Re-run beforeLoad guards whenever auth state settles so protected routes
  // redirect unauthenticated users even after the initial render.
  useEffect(() => {
    router.invalidate();
  }, [isLoading, isAuthenticated]);

  return <RouterProvider context={context} router={router} />;
}
