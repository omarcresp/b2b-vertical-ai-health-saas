import { usePostHog } from "@posthog/react";
import { useAuth } from "@workos-inc/authkit-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { t } = useTranslation("common");
  const { user, signOut } = useAuth();
  const posthog = usePostHog();

  if (!user) {
    return null;
  }

  const handleSignOut = () => {
    posthog.capture("user_signed_out", { email: user.email });
    posthog.reset();
    signOut();
  };

  return (
    <Button onClick={handleSignOut} variant="outline">
      {t("auth.signOut")}
    </Button>
  );
}
