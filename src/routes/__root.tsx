import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import type { RouterContext } from "@/router";

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: RootNotFoundComponent,
});

function RootComponent() {
  return <Outlet />;
}

function RootNotFoundComponent() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <section className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you requested does not exist.
        </p>
        <Link
          className="mt-4 inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium"
          to="/app"
        >
          Go to app
        </Link>
      </section>
    </main>
  );
}
