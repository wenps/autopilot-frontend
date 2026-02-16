/**
 * Logger — structured logging with file rotation and secret redaction.
 * Adapted from OpenClaw's src/logging/ system.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveConfigDir } from "../config/config.js";
import { theme } from "../terminal/theme.js";
import { redactSensitiveText } from "./redact.js";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug" | "trace";

const LOG_LEVELS: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

let currentLevel: LogLevel = "info";
let logFileStream: fs.WriteStream | undefined;

/** Set the global log level. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/** Get the current log level. */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

function ensureLogFile(): fs.WriteStream | undefined {
  if (logFileStream) return logFileStream;
  try {
    const logDir = path.join(resolveConfigDir(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    }
    const date = new Date().toISOString().split("T")[0];
    const logFile = path.join(logDir, `autopilot-${date}.log`);
    logFileStream = fs.createWriteStream(logFile, { flags: "a" });

    // Clean up old logs (>7 days)
    cleanOldLogs(logDir);

    return logFileStream;
  } catch {
    return undefined;
  }
}

function cleanOldLogs(logDir: string): void {
  try {
    const files = fs.readdirSync(logDir);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (!file.startsWith("autopilot-") || !file.endsWith(".log")) continue;
      const filePath = path.join(logDir, file);
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

function writeLog(level: LogLevel, subsystem: string, message: string, ...args: unknown[]): void {
  if (!shouldLog(level)) return;

  const ts = timestamp();
  const formatted = args.length > 0
    ? `${message} ${args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}`
    : message;

  // Redact sensitive data before writing
  const safeFormatted = redactSensitiveText(formatted);

  // Write to file
  const stream = ensureLogFile();
  if (stream) {
    stream.write(`${ts} [${level.toUpperCase()}] [${subsystem}] ${safeFormatted}\n`);
  }

  // Write to console
  const prefix = formatPrefix(level, subsystem);
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`${prefix} ${safeFormatted}`);
}

function formatPrefix(level: LogLevel, subsystem: string): string {
  const tag = `[${subsystem}]`;
  switch (level) {
    case "error": return theme.error(`✗ ${tag}`);
    case "warn": return theme.warn(`⚠ ${tag}`);
    case "info": return theme.info(`ℹ ${tag}`);
    case "debug": return theme.muted(`● ${tag}`);
    case "trace": return theme.muted(`… ${tag}`);
    default: return tag;
  }
}

/** Create a sub-system logger with a fixed prefix. */
export function createLogger(subsystem: string) {
  return {
    error: (msg: string, ...args: unknown[]) => writeLog("error", subsystem, msg, ...args),
    warn: (msg: string, ...args: unknown[]) => writeLog("warn", subsystem, msg, ...args),
    info: (msg: string, ...args: unknown[]) => writeLog("info", subsystem, msg, ...args),
    debug: (msg: string, ...args: unknown[]) => writeLog("debug", subsystem, msg, ...args),
    trace: (msg: string, ...args: unknown[]) => writeLog("trace", subsystem, msg, ...args),
  };
}

// Convenience top-level log functions
export const logError = (msg: string, ...args: unknown[]) => writeLog("error", "core", msg, ...args);
export const logWarn = (msg: string, ...args: unknown[]) => writeLog("warn", "core", msg, ...args);
export const logInfo = (msg: string, ...args: unknown[]) => writeLog("info", "core", msg, ...args);
export const logDebug = (msg: string, ...args: unknown[]) => writeLog("debug", "core", msg, ...args);

/** Close the log file stream. */
export function closeLogger(): void {
  logFileStream?.end();
  logFileStream = undefined;
}
