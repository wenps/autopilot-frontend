/**
 * Environment and config utilities.
 * Pattern from OpenClaw's src/infra/env.ts
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

export function loadDotEnv(): void {
  const envFile = path.join(process.cwd(), ".env");
  if (existsSync(envFile)) {
    config({ path: envFile });
  }
}

export function isTruthyEnvValue(value?: string): boolean {
  if (!value) return false;
  const lower = value.trim().toLowerCase();
  return lower === "1" || lower === "true" || lower === "yes" || lower === "on";
}

export function getEnvOrThrow(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getEnvOptional(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}
