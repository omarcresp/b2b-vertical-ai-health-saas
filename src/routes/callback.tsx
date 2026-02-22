import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@workos-inc/authkit-react";
import { useEffect, useRef } from "react";

type CallbackSearch = {
  redirect?: string;
};

function normalizeRedirectPath(value: string | undefined): string {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return "/app";
  }

  if (!normalizedValue.startsWith("/") || normalizedValue.startsWith("//")) {
    return "/app";
  }

  return normalizedValue;
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
  const { redirect } = Route.useSearch();
  const { isLoading, user, signIn } = useAuth();
  const navigate = useNavigate();
  const didTriggerSignIn = useRef(false);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    void navigate({ replace: true, to: redirect ?? "/app" });
  }, [isLoading, navigate, redirect, user]);

  useEffect(() => {
    if (isLoading || user || didTriggerSignIn.current) {
      return;
    }

    didTriggerSignIn.current = true;
    void signIn();
  }, [isLoading, signIn, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-6">
      <p className="text-sm text-muted-foreground">Redirecting to sign in...</p>
    </main>
  );
}
