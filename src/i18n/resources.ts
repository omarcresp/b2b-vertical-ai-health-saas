import common from "./locales/en-US/common.json";
import setup from "./locales/en-US/setup.json";

export const defaultNS = "common";

export const resources = {
  "en-US": {
    common,
    setup,
  },
} as const;
