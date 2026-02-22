import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type CallbackSearch = {
  redirect?: string;
};

function normalizeRedirectPath(value: string | undefined): string {
  if (!value) {
    return "/app";
  }

  if (!value.startsWith("/")) {
    return "/app";
  }

  return value;
}

export const Route = createFileRoute("/callback")({
  validateSearch: (search): CallbackSearch => {
    const redirectValue =
      typeof search.redirect === "string" ? search.redirect : undefined;

    return { redirect: normalizeRedirectPath(redirectValue) };
  },
  component: CallbackRouteComponent,
});

function CallbackRouteComponent() {
  const { t } = useTranslation("common");
  const { redirect } = Route.useSearch();
  const { isLoading, user, signIn } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    void navigate({ replace: true, to: redirect ?? "/app" });
  }, [isLoading, navigate, redirect, user]);

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-background via-muted/20 to-background px-4 py-6">
      <section className="mx-auto max-w-xl rounded-2xl border border-border/80 bg-card/95 p-8 shadow-sm backdrop-blur">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("auth.signIn")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete authentication to continue to your workspace.
        </p>
        <Button className="mt-4" onClick={() => void signIn()} type="button">
          {t("auth.signIn")}
        </Button>
      </section>
    </main>
  );
}
