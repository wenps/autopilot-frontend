/**
 * Process execution utilities.
 * Adapted from OpenClaw's src/process/exec.ts
 */
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Resolve .cmd extension for Windows npm-related commands. */
function resolveCommand(command: string): string {
  if (process.platform !== "win32") return command;
  const basename = path.basename(command).toLowerCase();
  if (path.extname(basename)) return command;
  const cmdCommands = ["npm", "pnpm", "yarn", "npx"];
  if (cmdCommands.includes(basename)) return `${command}.cmd`;
  return command;
}

export async function runExec(
  command: string,
  args: string[],
  opts: number | { timeoutMs?: number; maxBuffer?: number } = 10_000,
): Promise<{ stdout: string; stderr: string }> {
  const options =
    typeof opts === "number"
      ? { timeout: opts, encoding: "utf8" as const }
      : { timeout: opts.timeoutMs, maxBuffer: opts.maxBuffer, encoding: "utf8" as const };
  const { stdout, stderr } = await execFileAsync(resolveCommand(command), args, options);
  return { stdout, stderr };
}

export type SpawnResult = {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  killed: boolean;
};

export type CommandOptions = {
  timeoutMs: number;
  cwd?: string;
  input?: string;
  env?: NodeJS.ProcessEnv;
};

export async function runCommandWithTimeout(
  argv: string[],
  optionsOrTimeout: number | CommandOptions,
): Promise<SpawnResult> {
  const options: CommandOptions =
    typeof optionsOrTimeout === "number" ? { timeoutMs: optionsOrTimeout } : optionsOrTimeout;
  const { timeoutMs, cwd, input, env } = options;
  const hasInput = input !== undefined;

  const resolvedEnv = env ? { ...process.env, ...env } : { ...process.env };

  const stdio: Array<"pipe" | "inherit" | "ignore"> = hasInput
    ? ["pipe", "pipe", "pipe"]
    : ["inherit", "pipe", "pipe"];

  const child = spawn(resolveCommand(argv[0]!), argv.slice(1), {
    stdio,
    cwd,
    env: resolvedEnv,
  });

  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (typeof child.kill === "function") child.kill("SIGKILL");
    }, timeoutMs);

    if (hasInput && child.stdin) {
      child.stdin.write(input ?? "");
      child.stdin.end();
    }

    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal, killed: child.killed });
    });
  });
}
