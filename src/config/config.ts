/**
 * Config system.
 * Pattern from OpenClaw's src/config/config.ts — JSON5 config file in ~/.autopilot/
 */
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import JSON5 from "json5";

export interface AutoPilotConfig {
  agent?: {
    /** AI provider: "anthropic" | "openai" */
    provider?: string;
    /** Model ID, e.g. "claude-opus-4-6" */
    model?: string;
    /** API key override (prefer env var) */
    apiKey?: string;
  };
  browser?: {
    /** Enable browser control */
    enabled?: boolean;
    /** Use headless mode */
    headless?: boolean;
    /** Custom Chrome/Chromium path */
    executablePath?: string;
  };
  vscode?: {
    /** Enable VSCode integration */
    enabled?: boolean;
    /** Path to `code` CLI */
    codePath?: string;
  };
  channels?: {
    telegram?: { botToken?: string };
    discord?: { token?: string };
  };
  tools?: {
    webSearch?: {
      provider?: "brave" | "perplexity";
      apiKey?: string;
    };
    webFetch?: {
      maxChars?: number;
      timeoutSeconds?: number;
    };
  };
}

const CONFIG_DIR = path.join(homedir(), ".autopilot");
const CONFIG_FILE = path.join(CONFIG_DIR, "autopilot.json");

let cachedConfig: AutoPilotConfig | undefined;

export function resolveConfigDir(): string {
  return CONFIG_DIR;
}

export function resolveConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): AutoPilotConfig {
  if (cachedConfig) return cachedConfig;

  if (!fs.existsSync(CONFIG_FILE)) {
    cachedConfig = {};
    return cachedConfig;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    cachedConfig = JSON5.parse(raw) as AutoPilotConfig;
  } catch {
    console.warn(`Warning: could not parse config at ${CONFIG_FILE}, using defaults.`);
    cachedConfig = {};
  }

  return cachedConfig;
}

export function writeConfig(config: AutoPilotConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON5.stringify(config, null, 2) + "\n", "utf-8");
  cachedConfig = config;
}

export function resetConfigCache(): void {
  cachedConfig = undefined;
}
