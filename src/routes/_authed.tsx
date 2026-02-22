import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isLoading && !context.auth.isAuthenticated) {
      throw redirect({
        to: "/callback",
        search: {
          redirect: `${location.pathname}${location.searchStr}`,
        },
      });
    }
  },
  pendingMs: 0,
  pendingComponent: () => (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading workspace...</p>
    </main>
  ),
  component: () => {
    const { isLoading: isWorkOSLoading, user } = useAuth();
    const { isLoading: isConvexLoading } = useConvexAuth();
    const isLoading = isWorkOSLoading || (Boolean(user) && isConvexLoading);
    if (isLoading) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </main>
      );
    }

    return <Outlet />;
  },
});
