import { useAuth } from "@workos-inc/authkit-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function AuthButton() {
  const { t } = useTranslation("common");
  const { user, signOut } = useAuth();

  if (!user) {
    return null;
  }

  return (
    <Button onClick={() => signOut()} variant="outline">
      {t("auth.signOut")}
    </Button>
  );
}
