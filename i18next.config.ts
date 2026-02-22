import { defineConfig } from "i18next-cli";

export default defineConfig({
  locales: ["en-US", "es", "es-MX", "es-CO"],
  extract: {
    input: ["src/**/*.{ts,tsx}"],
    output: "src/i18n/locales/{{language}}/{{namespace}}.json",
    defaultNS: "setup",
    sort: true,
    indentation: 2,
  },
  types: {
    input: ["src/i18n/locales/en-US/*.json"],
    output: "types/i18next.generated.d.ts",
    resourcesFile: "types/resources.generated.d.ts",
  },
});
