import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

async function waitForAbort(signal: AbortSignal) {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ abortController, context, location }) => {
    if (context.auth.isLoading) {
      await waitForAbort(abortController.signal);
      return;
    }

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
  component: Outlet,
});
