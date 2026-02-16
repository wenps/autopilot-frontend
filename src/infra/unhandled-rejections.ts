/**
 * Global unhandled rejection/exception handler.
 * Adapted from OpenClaw's src/infra/unhandled-rejections.ts
 */
import { formatUncaughtError } from "./errors.js";

export function installGlobalErrorHandlers(): void {
  process.on("uncaughtException", (err) => {
    console.error(`\nFatal (uncaught exception): ${formatUncaughtError(err)}`);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`\nFatal (unhandled rejection): ${formatUncaughtError(reason)}`);
    process.exit(1);
  });
}
