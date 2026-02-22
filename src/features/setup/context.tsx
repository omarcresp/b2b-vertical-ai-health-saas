import { createContext, type ReactNode, use } from "react";
import {
  type SetupModel,
  useSetupModel,
} from "@/features/setup/hooks/useSetupModel";
import type { SnapshotKey } from "@/features/setup/types";

const SetupModelContext = createContext<SetupModel | null>(null);

export function SetupWorkspaceProvider({
  children,
  initialSnapshotKey,
  onSnapshotKeyChange,
}: Readonly<{
  children: ReactNode;
  initialSnapshotKey?: SnapshotKey | null;
  onSnapshotKeyChange?: (key: SnapshotKey) => void;
}>) {
  const model = useSetupModel({
    initialSnapshotKey,
    onSnapshotKeyChange,
  });

  return (
    <SetupModelContext.Provider value={model}>
      {children}
    </SetupModelContext.Provider>
  );
}

export function useSetupWorkspaceModel() {
  const value = use(SetupModelContext);
  if (!value) {
    throw new Error(
      "useSetupWorkspaceModel must be used inside SetupWorkspaceProvider.",
    );
  }

  return value;
}
