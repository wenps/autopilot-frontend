/**
 * ANSI escape code utilities.
 * Adapted from OpenClaw's src/terminal/ansi.ts
 */
const ANSI_SGR_PATTERN = "\\x1b\\[[0-9;]*m";
const OSC8_PATTERN = "\\x1b\\]8;;.*?\\x1b\\\\|\\x1b\\]8;;\\x1b\\\\";

const ANSI_REGEX = new RegExp(ANSI_SGR_PATTERN, "g");
const OSC8_REGEX = new RegExp(OSC8_PATTERN, "g");

/** Strip ANSI SGR codes and OSC-8 hyperlinks from a string. */
export function stripAnsi(input: string): string {
  return input.replace(OSC8_REGEX, "").replace(ANSI_REGEX, "");
}

/** Get the visible width of a string (ignoring ANSI codes). */
export function visibleWidth(input: string): number {
  return Array.from(stripAnsi(input)).length;
}
