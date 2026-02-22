import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";
import {
  BASE_FALLBACK_LOCALE,
  DEFAULT_LOCALE,
  type FallbackLocale,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from "../../shared/locales";
import commonEnUS from "./locales/en-US/common.json";
import setupEnUS from "./locales/en-US/setup.json";
import { defaultNS } from "./resources";

const SUPPORTED_WITH_FALLBACK = [
  ...SUPPORTED_LOCALES,
  BASE_FALLBACK_LOCALE,
] as const satisfies readonly FallbackLocale[];

const RESOURCE_LOADERS = {
  "en-US": {
    common: () => import("./locales/en-US/common.json"),
    setup: () => import("./locales/en-US/setup.json"),
  },
  es: {
    common: () => import("./locales/es/common.json"),
    setup: () => import("./locales/es/setup.json"),
  },
  "es-MX": {
    common: () => import("./locales/es-MX/common.json"),
    setup: () => import("./locales/es-MX/setup.json"),
  },
  "es-CO": {
    common: () => import("./locales/es-CO/common.json"),
    setup: () => import("./locales/es-CO/setup.json"),
  },
} as const;

function fallbackForLanguage(code?: string): readonly FallbackLocale[] {
  if (!code) {
    return [DEFAULT_LOCALE];
  }

  if (code.startsWith("es-MX")) {
    return ["es-MX", BASE_FALLBACK_LOCALE, DEFAULT_LOCALE];
  }

  if (code.startsWith("es-CO")) {
    return ["es-CO", BASE_FALLBACK_LOCALE, DEFAULT_LOCALE];
  }

  if (code.startsWith("es")) {
    return [BASE_FALLBACK_LOCALE, DEFAULT_LOCALE];
  }

  if (code.startsWith("en")) {
    return [DEFAULT_LOCALE];
  }

  return [DEFAULT_LOCALE];
}

void i18n
  .use(
    resourcesToBackend((language: string, namespace: string) => {
      const languageLoaders =
        RESOURCE_LOADERS[language as keyof typeof RESOURCE_LOADERS];
      const namespaceLoader =
        languageLoaders?.[
          namespace as keyof (typeof RESOURCE_LOADERS)["en-US"]
        ];

      if (!namespaceLoader) {
        return Promise.reject(
          new Error(`No resource loader for ${language}/${namespace}`),
        );
      }

      return namespaceLoader();
    }),
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    lng: DEFAULT_LOCALE,
    fallbackLng: fallbackForLanguage,
    supportedLngs: [...SUPPORTED_WITH_FALLBACK],
    ns: ["common", "setup"],
    defaultNS,
    fallbackNS: "common",
    resources: {
      "en-US": {
        common: commonEnUS,
        setup: setupEnUS,
      },
    },
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator", "htmlTag"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    load: "all",
    react: {
      useSuspense: false,
    },
    debug: false,
  });

export { fallbackForLanguage };
export default i18n;
