import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "#convex/_generated/api";
import { useAppAuth } from "@/hooks/useAppAuth";
import { myPreferencesQuery } from "@/lib/queries";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "../../../../shared/locales";

export function useLocalePreferenceModel() {
  const { isAuthenticated } = useAppAuth();
  const { t, i18n } = useTranslation(["setup", "common"]);

  const [localeError, setLocaleError] = useState<string | null>(null);
  const [optimisticLocale, setOptimisticLocale] =
    useState<SupportedLocale | null>(null);

  const i18nRef = useRef(i18n);
  useEffect(() => {
    i18nRef.current = i18n;
  }, [i18n]);

  const convexSetMyLocale = useConvexMutation(api.userPreferences.setMyLocale);
  const setMyLocaleMutation = useMutation({
    mutationFn: convexSetMyLocale,
    onError: () => {
      setLocaleError(t("common:locale.saveError"));
      setOptimisticLocale(null);
    },
  });

  const { data: preferences } = useQuery({
    ...myPreferencesQuery(),
    enabled: isAuthenticated,
  });

  const currentLocale =
    i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LOCALE;
  const serverLocale = preferences?.locale;

  useEffect(() => {
    if (!serverLocale) {
      return;
    }

    if (optimisticLocale && serverLocale !== optimisticLocale) {
      return;
    }

    if (serverLocale !== currentLocale) {
      void i18nRef.current.changeLanguage(serverLocale);
    }
  }, [currentLocale, optimisticLocale, serverLocale]);

  useEffect(() => {
    if (optimisticLocale && serverLocale === optimisticLocale) {
      setOptimisticLocale(null);
    }
  }, [optimisticLocale, serverLocale]);

  const onLocaleChange = async (locale: SupportedLocale) => {
    setLocaleError(null);
    setOptimisticLocale(locale);

    await i18nRef.current.changeLanguage(locale);

    if (!isAuthenticated) {
      setOptimisticLocale(null);
      return;
    }

    setMyLocaleMutation.mutate({ locale });
  };

  return {
    currentLocale,
    localeError,
    isSavingLocale: setMyLocaleMutation.isPending,
    onLocaleChange,
  };
}
