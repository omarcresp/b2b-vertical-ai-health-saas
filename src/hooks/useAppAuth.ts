import { useAuth } from "@workos-inc/authkit-react";
import { useConvexAuth } from "convex/react";

export type AppAuthState = {
  isLoading: boolean;
  isAuthenticated: boolean;
};

export function useAppAuth(): AppAuthState {
  const { isLoading: isWorkOSLoading, user } = useAuth();
  const { isLoading: isConvexLoading, isAuthenticated: isConvexAuthenticated } =
    useConvexAuth();

  const hasWorkOSUser = Boolean(user);
  const isLoading = isWorkOSLoading || (hasWorkOSUser && isConvexLoading);
  const isAuthenticated = hasWorkOSUser && isConvexAuthenticated;

  return { isAuthenticated, isLoading };
}
