import { createFileRoute } from "@tanstack/react-router";
import { SetupWorkspaceSnapshotScreen } from "@/features/setup/screens";

export const Route = createFileRoute("/_authed/app/snapshot")({
  component: SetupWorkspaceSnapshotScreen,
});
