import {
  ConfigError,
  configureSync,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
} from "@logtape/logtape";
import { createStrictRedactedSink } from "./redaction";

// Configure once when this module is first imported.
// Silently skips if tests have already configured LogTape with their own sink.
try {
  configureSync({
    sinks: {
      console: createStrictRedactedSink(
        getConsoleSink({
          formatter: getJsonLinesFormatter({
            categorySeparator: ".",
            message: "template",
            properties: "flatten",
          }),
        }),
      ),
    },
    loggers: [
      { category: ["app", "convex"], sinks: ["console"], lowestLevel: "debug" },
      { category: ["logtape"], sinks: ["console"], lowestLevel: "error" },
    ],
  });
} catch (e) {
  if (!(e instanceof ConfigError)) throw e;
}

export const logger = getLogger(["app", "convex"]);
