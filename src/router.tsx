import { createRouter, RouterProvider } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { useMemo } from "react";
import { routeTree } from "./routeTree.gen";

export type RouterContext = {
  auth: {
    isLoading: boolean;
    isAuthenticated: boolean;
  };
  navigation: {
    appPath: "/app";
    callbackPath: "/callback";
  };
};

const defaultRouterContext: RouterContext = {
  auth: {
    isLoading: true,
    isAuthenticated: false,
  },
  navigation: {
    appPath: "/app",
    callbackPath: "/callback",
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
  const { isLoading, user } = useAuth();
  const context = useMemo<RouterContext>(
    () => ({
      auth: {
        isLoading,
        isAuthenticated: Boolean(user),
      },
      navigation: {
        appPath: "/app",
        callbackPath: "/callback",
      },
    }),
    [isLoading, user],
  );

  return <RouterProvider context={context} router={router} />;
}
