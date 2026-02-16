/**
 * CLI progress indicator — spinner + optional OSC progress protocol.
 * Simplified from OpenClaw's src/cli/progress.ts
 */
import { spinner } from "@clack/prompts";
import { theme } from "../terminal/theme.js";

type ProgressOptions = {
  label: string;
  indeterminate?: boolean;
  total?: number;
  enabled?: boolean;
};

export type ProgressReporter = {
  setLabel: (label: string) => void;
  setPercent: (percent: number) => void;
  tick: (delta?: number) => void;
  done: (message?: string) => void;
};

const noopReporter: ProgressReporter = {
  setLabel: () => {},
  setPercent: () => {},
  tick: () => {},
  done: () => {},
};

export function createCliProgress(options: ProgressOptions): ProgressReporter {
  if (options.enabled === false) return noopReporter;

  const stream = process.stderr;
  const isTty = stream.isTTY;
  if (!isTty) return noopReporter;

  let label = options.label;
  const total = options.total ?? null;
  let completed = 0;
  let percent = 0;
  let indeterminate = options.indeterminate ?? (total === undefined || total === null);

  const spin = spinner();
  spin.start(theme.accent(label));

  const setLabel = (next: string) => {
    label = next;
    const suffix = indeterminate ? "" : ` ${percent}%`;
    spin.message(theme.accent(`${label}${suffix}`));
  };

  const setPercent = (nextPercent: number) => {
    percent = Math.max(0, Math.min(100, Math.round(nextPercent)));
    indeterminate = false;
    spin.message(theme.accent(`${label} ${percent}%`));
  };

  const tick = (delta = 1) => {
    if (!total) return;
    completed = Math.min(total, completed + delta);
    const nextPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
    setPercent(nextPercent);
  };

  const done = (message?: string) => {
    spin.stop(message ?? theme.success(label));
  };

  return { setLabel, setPercent, tick, done };
}

/** Run an async function with a progress spinner. */
export async function withProgress<T>(
  label: string,
  work: (progress: ProgressReporter) => Promise<T>,
): Promise<T> {
  const progress = createCliProgress({ label });
  try {
    return await work(progress);
  } finally {
    progress.done();
  }
}
