import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const AUTH_WAIT_TIMEOUT_MS =
  import.meta.env.MODE === "test" ? 150 : 10_000;
type AuthWaitResult = "aborted" | "timed_out";

async function waitForAbortOrTimeout(
  signal: AbortSignal,
  timeoutMs: number,
): Promise<AuthWaitResult> {
  if (signal.aborted) {
    return "aborted";
  }

  return await new Promise<AuthWaitResult>((resolve) => {
    let settled = false;

    const finalize = (result: AuthWaitResult) => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener("abort", onAbort);
      clearTimeout(timeoutId);
      resolve(result);
    };

    const onAbort = () => finalize("aborted");
    const timeoutId = setTimeout(() => finalize("timed_out"), timeoutMs);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ abortController, context, location }) => {
    if (context.auth.isLoading) {
      const waitResult = await waitForAbortOrTimeout(
        abortController.signal,
        AUTH_WAIT_TIMEOUT_MS,
      );

      if (waitResult === "timed_out") {
        throw redirect({
          to: "/callback",
          search: {
            redirect: `${location.pathname}${location.searchStr}`,
          },
        });
      }

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
