import { Authenticated, Unauthenticated } from "convex/react";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";
import { AppointmentManager } from "@/features/setup/components/AppointmentManager";
import { AuthButton } from "@/features/setup/components/AuthButton";
import { PlannerSimulatorWorkspace } from "@/features/setup/components/PlannerSimulatorWorkspace";
import { SetupWorkspaceShell } from "@/features/setup/components/SetupWorkspaceShell";
import { SnapshotPanel } from "@/features/setup/components/SnapshotPanel";
import { CARD_CLASS } from "@/features/setup/constants";
import {
  SetupWorkspaceProvider,
  useSetupWorkspaceModel,
} from "@/features/setup/context";

export default function SetupWorkspaceApp() {
  const { t } = useTranslation(["setup", "common"]);

  return (
    <SetupWorkspaceShell>
      <Authenticated>
        <Suspense fallback={<SuspenseFallback />}>
          <SetupWorkspaceProvider>
            <SetupWorkspaceFullScreen />
          </SetupWorkspaceProvider>
        </Suspense>
      </Authenticated>
      <Unauthenticated>
        <section className={`${CARD_CLASS} max-w-xl p-8`}>
          <p className="text-sm text-muted-foreground">
            {t("setup:unauthenticated.message")}
          </p>
          <div className="mt-4">
            <AuthButton />
          </div>
        </section>
      </Unauthenticated>
    </SetupWorkspaceShell>
  );
}

function SuspenseFallback() {
  return (
    <section className={`${CARD_CLASS} p-6 text-sm text-muted-foreground`}>
      Loading setup...
    </section>
  );
}

export function SetupWorkspaceFullScreen() {
  const model = useSetupWorkspaceModel();
  return <PlannerSimulatorWorkspace model={model} />;
}

export function SetupWorkspaceSetupScreen() {
  const model = useSetupWorkspaceModel();
  return (
    <PlannerSimulatorWorkspace
      model={model}
      showAppointments={false}
      showSnapshot={false}
    />
  );
}

export function SetupWorkspaceSnapshotScreen() {
  const model = useSetupWorkspaceModel();
  return <SnapshotPanel model={model} />;
}

export function SetupWorkspaceAppointmentsScreen() {
  const model = useSetupWorkspaceModel();
  return <AppointmentManager model={model} />;
}
