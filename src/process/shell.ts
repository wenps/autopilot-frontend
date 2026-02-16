/**
 * Shell configuration and detection.
 * Adapted from OpenClaw's src/agents/shell-utils.ts
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function resolvePowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  if (systemRoot) {
    const candidate = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  return "powershell.exe";
}

/** Get the shell binary and args for running commands on the current platform. */
export function getShellConfig(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    return { shell: resolvePowerShellPath(), args: ["-NoProfile", "-NonInteractive", "-Command"] };
  }

  const envShell = process.env.SHELL?.trim();
  const shellName = envShell ? path.basename(envShell) : "";

  // Fish rejects common bashisms, prefer bash when detected.
  if (shellName === "fish") {
    const bash = resolveShellFromPath("bash");
    if (bash) return { shell: bash, args: ["-c"] };
    const sh = resolveShellFromPath("sh");
    if (sh) return { shell: sh, args: ["-c"] };
  }
  const shell = envShell && envShell.length > 0 ? envShell : "sh";
  return { shell, args: ["-c"] };
}

function resolveShellFromPath(name: string): string | undefined {
  const envPath = process.env.PATH ?? "";
  if (!envPath) return undefined;
  const entries = envPath.split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    const candidate = path.join(entry, name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // ignore missing or non-executable entries
    }
  }
  return undefined;
}

function normalizeShellName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return path.basename(trimmed).replace(/\.(exe|cmd|bat)$/i, "").replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Auto-detect the user's current shell. */
export function detectRuntimeShell(): string | undefined {
  if (process.platform === "win32") {
    if (process.env.POWERSHELL_DISTRIBUTION_CHANNEL) return "pwsh";
    return "powershell";
  }

  const envShell = process.env.SHELL?.trim();
  if (envShell) {
    const name = normalizeShellName(envShell);
    if (name) return name;
  }

  if (process.env.BASH_VERSION) return "bash";
  if (process.env.ZSH_VERSION) return "zsh";
  if (process.env.FISH_VERSION) return "fish";
  return undefined;
}

/** Strip binary/control characters from output text. */
export function sanitizeBinaryOutput(text: string): string {
  const scrubbed = text.replace(/[\p{Format}\p{Surrogate}]/gu, "");
  if (!scrubbed) return scrubbed;
  const chunks: string[] = [];
  for (const char of scrubbed) {
    const code = char.codePointAt(0);
    if (code == null) continue;
    if (code === 0x09 || code === 0x0a || code === 0x0d) { chunks.push(char); continue; }
    if (code < 0x20) continue;
    chunks.push(char);
  }
  return chunks.join("");
}

/** Kill a process and its children. */
export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", detached: true });
    } catch { /* ignore */ }
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try { process.kill(pid, "SIGKILL"); } catch { /* process already dead */ }
  }
}
