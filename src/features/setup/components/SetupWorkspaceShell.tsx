import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { CARD_CLASS } from "@/features/setup/constants";
import { useLocalePreferenceModel } from "@/features/setup/hooks/useLocalePreferenceModel";
import { AuthButton } from "./AuthButton";

export function SetupWorkspaceShell({
  children,
}: Readonly<{ children: ReactNode }>) {
  const { t } = useTranslation(["setup", "common"]);
  const locale = useLocalePreferenceModel();

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-background via-muted/20 to-background px-4 py-6 text-foreground">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-36 h-80 w-80 rounded-full bg-chart-2/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-chart-3/10 blur-3xl" />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header
          className={`${CARD_CLASS} flex flex-wrap items-center justify-between gap-5 p-5 md:p-6`}
        >
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {t("setup:header.kicker")}
            </p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              {t("setup:header.title")}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              {t("setup:header.subtitle")}
            </p>
            <div className="flex flex-wrap gap-2">
              <BadgePill>{t("setup:badges.weeklyBoard")}</BadgePill>
              <BadgePill>{t("setup:badges.templateStarter")}</BadgePill>
              <BadgePill>{t("setup:badges.capacitySandbox")}</BadgePill>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher
              currentLocale={locale.currentLocale}
              disabled={locale.isSavingLocale}
              onChange={locale.onLocaleChange}
            />
            <ModeToggle />
            <AuthButton />
          </div>
          {locale.localeError ? (
            <p className="w-full text-sm font-medium text-destructive">
              {locale.localeError}
            </p>
          ) : null}
        </header>

        {children}
      </div>
    </main>
  );
}

function BadgePill({ children }: Readonly<{ children: string }>) {
  return (
    <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}
