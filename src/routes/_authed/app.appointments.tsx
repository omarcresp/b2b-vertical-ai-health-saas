import { createFileRoute } from "@tanstack/react-router";
import { SetupWorkspaceAppointmentsScreen } from "@/features/setup/workspace";
import { latestSetupKeyQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authed/app/appointments")({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(latestSetupKeyQuery());
  },
  component: SetupWorkspaceAppointmentsScreen,
});
