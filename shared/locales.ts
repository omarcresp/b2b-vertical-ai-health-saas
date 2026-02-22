export const SUPPORTED_LOCALES = ["en-US", "es-MX", "es-CO"] as const;
export const BASE_FALLBACK_LOCALE = "es" as const;
export const DEFAULT_LOCALE = "en-US" as const;
export const LOCALE_STORAGE_KEY = "b2b-vertical-saas.locale";

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export type FallbackLocale = SupportedLocale | typeof BASE_FALLBACK_LOCALE;

export function isSupportedLocale(value: string): value is SupportedLocale {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}
