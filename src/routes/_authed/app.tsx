import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SetupWorkspaceShell } from "@/features/setup/components/SetupWorkspaceShell";
import { SetupWorkspaceProvider } from "@/features/setup/context";
import type { SnapshotKey } from "@/features/setup/types";

export type AppRouteSearch = {
  clinicSlug?: string;
  providerName?: string;
};

const CLINIC_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateAppRouteSearch(
  search: Record<string, unknown>,
): AppRouteSearch {
  const rawClinicSlug =
    typeof search.clinicSlug === "string" ? search.clinicSlug.trim() : "";
  const rawProviderName =
    typeof search.providerName === "string" ? search.providerName.trim() : "";

  const clinicSlug = CLINIC_SLUG_PATTERN.test(rawClinicSlug)
    ? rawClinicSlug
    : undefined;
  const providerName = rawProviderName.length > 0 ? rawProviderName : undefined;

  return {
    clinicSlug,
    providerName,
  };
}

export const Route = createFileRoute("/_authed/app")({
  validateSearch: validateAppRouteSearch,
  pendingMs: 0,
  pendingComponent: () => (
    <section className="rounded-2xl border border-border/80 bg-card/95 p-4 text-sm text-muted-foreground">
      Loading app...
    </section>
  ),
  component: AppLayoutRouteComponent,
});

function AppLayoutRouteComponent() {
  const { t } = useTranslation(["setup", "common"]);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const initialSnapshotKey = useMemo<SnapshotKey | null>(() => {
    if (!search.clinicSlug || !search.providerName) {
      return null;
    }

    return {
      clinicSlug: search.clinicSlug,
      providerName: search.providerName,
    };
  }, [search.clinicSlug, search.providerName]);

  const onSnapshotKeyChange = useCallback(
    (key: SnapshotKey) => {
      void navigate({
        replace: true,
        search: (previous) => ({
          ...previous,
          clinicSlug: key.clinicSlug,
          providerName: key.providerName,
        }),
      });
    },
    [navigate],
  );

  return (
    <SetupWorkspaceShell>
      <SetupWorkspaceProvider
        initialSnapshotKey={initialSnapshotKey}
        onSnapshotKeyChange={onSnapshotKeyChange}
      >
        <section className="rounded-2xl border border-border/80 bg-card/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap gap-2">
            <RouteTab to="/app/setup">{t("common:nav.setup")}</RouteTab>
            <RouteTab to="/app/snapshot">{t("common:nav.snapshot")}</RouteTab>
            <RouteTab to="/app/appointments">
              {t("common:nav.appointments")}
            </RouteTab>
          </div>
        </section>
        <Outlet />
      </SetupWorkspaceProvider>
    </SetupWorkspaceShell>
  );
}

function RouteTab({
  to,
  children,
}: Readonly<{
  to: "/app/setup" | "/app/snapshot" | "/app/appointments";
  children: string;
}>) {
  return (
    <Link
      activeProps={{
        className: "bg-primary/15 border-primary/40 text-primary",
      }}
      className="select-none rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
      search={(previous) => previous}
      to={to}
    >
      {children}
    </Link>
  );
}
