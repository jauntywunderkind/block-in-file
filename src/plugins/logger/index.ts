import { plugin } from "gunshi/plugin";
import { pluginId, type LoggerExtension } from "./types.js";

export interface LoggerOptions {
  debug?: boolean;
}

export default function logger() {
  return plugin<{}, typeof pluginId, [], LoggerExtension>({
    id: pluginId,
    name: "Logger Plugin",
    setup: (ctx) => {
      ctx.addGlobalOption("debug", {
        type: "boolean",
        short: "d",
        description: "Enable debug output",
      });
    },
    extension: (ctx): LoggerExtension => ({
      log: (message: string) => console.log(message),
      error: (message: string) => console.error(message),
      warn: (message: string) => console.warn(message),
      debug: (message: string) => {
        if (ctx.values.debug) {
          console.debug(`[DEBUG] ${message}`);
        }
      },
      enabled: ctx.values.debug ?? false,
    }),
  });
}
