import { useAuth } from "@workos-inc/authkit-react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../../convex/_generated/api";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
} from "../../../../shared/locales";

export function useLocalePreferenceModel() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation(["setup", "common"]);

  const [localeError, setLocaleError] = useState<string | null>(null);
  const [isSavingLocale, setIsSavingLocale] = useState(false);
  const [optimisticLocale, setOptimisticLocale] =
    useState<SupportedLocale | null>(null);

  const i18nRef = useRef(i18n);
  useEffect(() => {
    i18nRef.current = i18n;
  }, [i18n]);

  const setMyLocale = useMutation(api.userPreferences.setMyLocale);
  const preferences = useQuery(
    api.userPreferences.getMyPreferences,
    user ? {} : "skip",
  );

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

    if (!user) {
      setOptimisticLocale(null);
      return;
    }

    try {
      setIsSavingLocale(true);
      await setMyLocale({ locale });
    } catch {
      setLocaleError(t("common:locale.saveError"));
      setOptimisticLocale(null);
    } finally {
      setIsSavingLocale(false);
    }
  };

  return {
    currentLocale,
    localeError,
    isSavingLocale,
    onLocaleChange,
  };
}
