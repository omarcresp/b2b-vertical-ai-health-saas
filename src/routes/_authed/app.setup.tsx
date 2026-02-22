import { createFileRoute } from "@tanstack/react-router";
import { SetupWorkspaceSetupScreen } from "@/features/setup/screens";

export const Route = createFileRoute("/_authed/app/setup")({
  component: SetupWorkspaceSetupScreen,
});
