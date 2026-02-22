import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatLocalDateTime } from "@/features/setup/utils/date";
import { appointmentStatusKey } from "@/features/setup/utils/schedule";
import type { Id } from "../../../../convex/_generated/dataModel";

type AppointmentRow = {
  _id: Id<"appointments">;
  patientName: string;
  patientPhone: string;
  startAtUtcMs: number;
  status: "scheduled" | "canceled";
  confirmedAtUtcMs?: number;
};

export function AppointmentTable({
  appointments,
  pendingRowAction,
  runRowAction,
}: Readonly<{
  appointments: AppointmentRow[] | undefined;
  pendingRowAction: {
    appointmentId: Id<"appointments">;
    action: "confirm" | "cancel";
  } | null;
  runRowAction: (
    appointmentId: Id<"appointments">,
    action: "confirm" | "cancel",
  ) => void;
}>) {
  const { t } = useTranslation(["setup", "common"]);

  if (appointments === undefined) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {t("setup:appointments.messages.loading")}
      </p>
    );
  }

  if (appointments.length === 0) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {t("setup:appointments.list.empty")}
      </p>
    );
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-2 pr-4 font-medium">
              {t("setup:appointments.list.columns.patient")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("setup:appointments.list.columns.start")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("setup:appointments.list.columns.status")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("setup:appointments.list.columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appointment) => {
            const isCanceled = appointment.status === "canceled";
            const isConfirmed = appointment.confirmedAtUtcMs !== undefined;
            const isPending =
              pendingRowAction?.appointmentId === appointment._id;

            return (
              <tr
                className="border-b border-border/60 last:border-b-0"
                key={appointment._id}
              >
                <td className="py-3 pr-4">
                  <p className="font-medium">{appointment.patientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {appointment.patientPhone}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  {formatLocalDateTime(appointment.startAtUtcMs)}
                </td>
                <td className="py-3 pr-4">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                    {t(appointmentStatusKey(appointment))}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex gap-2">
                    <Button
                      disabled={isCanceled || isConfirmed || isPending}
                      onClick={() =>
                        void runRowAction(appointment._id, "confirm")
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("setup:appointments.actions.confirm")}
                    </Button>
                    <Button
                      disabled={isCanceled || isPending}
                      onClick={() =>
                        void runRowAction(appointment._id, "cancel")
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {t("setup:appointments.actions.cancel")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
