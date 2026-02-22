import { createFileRoute } from "@tanstack/react-router";
import { SetupWorkspaceAppointmentsScreen } from "@/features/setup/workspace";

export const Route = createFileRoute("/_authed/app/appointments")({
  component: SetupWorkspaceAppointmentsScreen,
});
