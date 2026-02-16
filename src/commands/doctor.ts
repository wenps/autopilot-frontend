/**
 * Doctor command — health checks for AutoPilot installation.
 * Adapted from OpenClaw's doctor pattern.
 */
import type { Command } from "commander";
import { loadConfig, resolveConfigPath } from "../config/config.js";
import { theme } from "../terminal/theme.js";
import { resolveOsSummary } from "../infra/os-summary.js";
import { runExec } from "../process/exec.js";

type CheckResult = {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
};

async function checkNodeVersion(): Promise<CheckResult> {
  const version = process.versions.node;
  const major = parseInt(version.split(".")[0]!, 10);
  if (major >= 22) {
    return { name: "Node.js version", status: "ok", message: `v${version}` };
  }
  return { name: "Node.js version", status: "error", message: `v${version} (requires 22+)` };
}

async function checkConfig(): Promise<CheckResult> {
  const configPath = resolveConfigPath();
  const config = loadConfig();
  const hasProvider = Boolean(config.agent?.provider);
  const hasApiKey = Boolean(config.agent?.apiKey || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

  if (hasProvider && hasApiKey) {
    return { name: "Configuration", status: "ok", message: `Provider: ${config.agent?.provider}, API key: set` };
  }
  if (!hasApiKey) {
    return { name: "Configuration", status: "warn", message: `No API key found. Set ANTHROPIC_API_KEY or use 'autopilot config set agent.apiKey <key>'` };
  }
  return { name: "Configuration", status: "ok", message: `Config at ${configPath}` };
}

async function checkPlaywright(): Promise<CheckResult> {
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return { name: "Playwright", status: "ok", message: "Browser launch successful" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Executable doesn't exist")) {
      return { name: "Playwright", status: "warn", message: "No browser installed. Run: npx playwright install chromium" };
    }
    return { name: "Playwright", status: "warn", message: `Browser check failed: ${msg.slice(0, 100)}` };
  }
}

async function checkGit(): Promise<CheckResult> {
  try {
    const { stdout } = await runExec("git", ["--version"], 5_000);
    return { name: "Git", status: "ok", message: stdout.trim() };
  } catch {
    return { name: "Git", status: "warn", message: "git not found in PATH" };
  }
}

async function checkBraveSearch(): Promise<CheckResult> {
  const hasKey = Boolean(process.env.BRAVE_API_KEY);
  if (hasKey) {
    return { name: "Brave Search", status: "ok", message: "API key configured" };
  }
  return { name: "Brave Search", status: "warn", message: "BRAVE_API_KEY not set (web search disabled)" };
}

function formatResult(result: CheckResult): string {
  const icon = result.status === "ok" ? theme.success("✓") : result.status === "warn" ? theme.warn("⚠") : theme.error("✗");
  return `${icon} ${result.name}: ${result.message}`;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check AutoPilot installation and configuration health")
    .action(async () => {
      const os = resolveOsSummary();
      console.log(theme.heading("\nAutoPilot Doctor"));
      console.log(theme.muted(`Platform: ${os.label}\n`));

      const checks = [
        await checkNodeVersion(),
        await checkConfig(),
        await checkPlaywright(),
        await checkGit(),
        await checkBraveSearch(),
      ];

      for (const result of checks) {
        console.log(formatResult(result));
      }

      const errors = checks.filter((c) => c.status === "error");
      const warns = checks.filter((c) => c.status === "warn");

      console.log("");
      if (errors.length > 0) {
        console.log(theme.error(`${errors.length} error(s) found. Fix them before using AutoPilot.`));
        process.exitCode = 1;
      } else if (warns.length > 0) {
        console.log(theme.warn(`${warns.length} warning(s). AutoPilot may work with reduced functionality.`));
      } else {
        console.log(theme.success("All checks passed!"));
      }
    });
}
