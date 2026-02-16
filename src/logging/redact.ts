/**
 * Sensitive data redaction for logs and tool output.
 * Adapted from OpenClaw's src/logging/redact.ts
 */

const DEFAULT_REDACT_MIN_LENGTH = 18;
const DEFAULT_REDACT_KEEP_START = 6;
const DEFAULT_REDACT_KEEP_END = 4;

const DEFAULT_REDACT_PATTERNS: string[] = [
  // ENV-style assignments
  String.raw`\b[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)\b\s*[=:]\s*(["']?)([^\s"'\\]+)\1`,
  // JSON fields
  String.raw`"(?:apiKey|token|secret|password|passwd|accessToken|refreshToken)"\s*:\s*"([^"]+)"`,
  // CLI flags
  String.raw`--(?:api[-_]?key|token|secret|password|passwd)\s+(["']?)([^\s"']+)\1`,
  // Authorization headers
  String.raw`Authorization\s*[:=]\s*Bearer\s+([A-Za-z0-9._\-+=]+)`,
  String.raw`\bBearer\s+([A-Za-z0-9._\-+=]{18,})\b`,
  // PEM private keys
  String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----`,
  // Common token prefixes
  String.raw`\b(sk-[A-Za-z0-9_-]{8,})\b`,
  String.raw`\b(ghp_[A-Za-z0-9]{20,})\b`,
  String.raw`\b(github_pat_[A-Za-z0-9_]{20,})\b`,
  String.raw`\b(xox[baprs]-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(xapp-[A-Za-z0-9-]{10,})\b`,
  String.raw`\b(gsk_[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(AIza[0-9A-Za-z\-_]{20,})\b`,
  String.raw`\b(pplx-[A-Za-z0-9_-]{10,})\b`,
  String.raw`\b(npm_[A-Za-z0-9]{10,})\b`,
];

function parsePattern(raw: string): RegExp | null {
  if (!raw.trim()) return null;
  const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  try {
    if (match) {
      const flags = match[2]!.includes("g") ? match[2]! : `${match[2]}g`;
      return new RegExp(match[1]!, flags);
    }
    return new RegExp(raw, "gi");
  } catch {
    return null;
  }
}

function maskToken(token: string): string {
  if (token.length < DEFAULT_REDACT_MIN_LENGTH) return "***";
  const start = token.slice(0, DEFAULT_REDACT_KEEP_START);
  const end = token.slice(-DEFAULT_REDACT_KEEP_END);
  return `${start}…${end}`;
}

function redactPemBlock(block: string): string {
  const lines = block.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return "***";
  return `${lines[0]}\n…redacted…\n${lines[lines.length - 1]}`;
}

function redactMatch(match: string, groups: string[]): string {
  if (match.includes("PRIVATE KEY-----")) return redactPemBlock(match);
  const token = groups.filter((v) => typeof v === "string" && v.length > 0).at(-1) ?? match;
  const masked = maskToken(token);
  if (token === match) return masked;
  return match.replace(token, masked);
}

/**
 * Redact sensitive data (API keys, tokens, secrets) from text.
 */
export function redactSensitiveText(text: string, customPatterns?: string[]): string {
  if (!text) return text;
  const source = customPatterns?.length ? customPatterns : DEFAULT_REDACT_PATTERNS;
  const patterns = source.map(parsePattern).filter((re): re is RegExp => Boolean(re));
  if (!patterns.length) return text;

  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, (...args: string[]) =>
      redactMatch(args[0]!, args.slice(1, args.length - 2)),
    );
  }
  return result;
}

/** Get the default redaction patterns. */
export function getDefaultRedactPatterns(): string[] {
  return [...DEFAULT_REDACT_PATTERNS];
}
