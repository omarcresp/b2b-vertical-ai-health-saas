import { useTranslation } from "react-i18next";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "../../shared/locales";

const LOCALE_LABEL_KEY = {
  "en-US": "locale.enUS",
  "es-MX": "locale.esMX",
  "es-CO": "locale.esCO",
} as const satisfies Record<SupportedLocale, string>;

export function coerceLocaleForSelector(locale: string): SupportedLocale {
  if (SUPPORTED_LOCALES.includes(locale as SupportedLocale)) {
    return locale as SupportedLocale;
  }

  if (locale.startsWith("es-CO")) {
    return "es-CO";
  }

  if (locale.startsWith("es")) {
    return "es-MX";
  }

  return DEFAULT_LOCALE;
}

export function LanguageSwitcher({
  currentLocale,
  disabled,
  onChange,
}: Readonly<{
  currentLocale: string;
  disabled?: boolean;
  onChange: (locale: SupportedLocale) => void;
}>) {
  const { t } = useTranslation("common");
  const selectedLocale = coerceLocaleForSelector(currentLocale);

  return (
    <div className="flex items-center gap-2">
      <label
        className="text-xs font-medium text-muted-foreground"
        htmlFor="language-switcher"
      >
        {t("locale.label")}
      </label>
      <select
        aria-label={t("locale.label")}
        className="h-10 rounded-xl border border-input/80 bg-background/90 px-3 text-sm text-foreground outline-none ring-offset-background transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        disabled={disabled}
        id="language-switcher"
        onChange={(event) => onChange(event.target.value as SupportedLocale)}
        value={selectedLocale}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {t(LOCALE_LABEL_KEY[locale])}
          </option>
        ))}
      </select>
    </div>
  );
}
