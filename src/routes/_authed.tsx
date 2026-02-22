import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) {
      return;
    }

    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: context.navigation.callbackPath,
        search: {
          redirect: `${location.pathname}${location.search}`,
        },
      });
    }
  },
  component: Outlet,
});
