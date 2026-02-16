/**
 * Skills system — load and format skills from directory.
 * Adapted from OpenClaw's src/agents/skills/ system.
 *
 * Skills are markdown files with optional YAML frontmatter.
 * They get injected into the system prompt to give the agent domain-specific knowledge.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveConfigDir } from "../config/config.js";

export type SkillEntry = {
  name: string;
  description: string;
  filePath: string;
  content: string;
};

type SkillFrontmatter = {
  name?: string;
  description?: string;
  os?: string[];
  requires?: string[];
};

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n/;

/**
 * Parse simple YAML frontmatter from a markdown string.
 * Only handles `key: value` and `key: [array]` (single-line).
 */
function parseFrontmatter(content: string): { meta: SkillFrontmatter; body: string } {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return { meta: {}, body: content };

  const yamlBlock = match[1]!;
  const body = content.slice(match[0].length);
  const meta: SkillFrontmatter = {};

  for (const line of yamlBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    // Handle arrays: [item1, item2]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const items = rawValue.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      (meta as Record<string, unknown>)[key] = items;
    } else {
      (meta as Record<string, unknown>)[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  return { meta, body };
}

/**
 * Resolve the skills directory.
 * Looks in:
 *   1. `~/.autopilot/skills/` (user skills)
 *   2. `./skills/` (bundled project skills)
 */
function resolveSkillsDirs(): string[] {
  const dirs: string[] = [];

  // User skills
  const userSkillsDir = path.join(resolveConfigDir(), "skills");
  if (fs.existsSync(userSkillsDir)) dirs.push(userSkillsDir);

  // Bundled project skills (relative to CWD)
  const bundledDir = path.resolve("skills");
  if (fs.existsSync(bundledDir)) dirs.push(bundledDir);

  return dirs;
}

/**
 * Load all skill entries from configured skill directories.
 */
export function loadSkillEntries(): SkillEntry[] {
  const dirs = resolveSkillsDirs();
  const entries: SkillEntry[] = [];

  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      const filePath = path.join(dir, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { meta, body } = parseFrontmatter(raw);

      // Skip if OS-gated and doesn't match
      if (meta.os && meta.os.length > 0) {
        const platform = process.platform;
        const platformNames: Record<string, string[]> = {
          darwin: ["macos", "darwin", "mac"],
          win32: ["windows", "win32", "win"],
          linux: ["linux"],
        };
        const currentNames = platformNames[platform] ?? [platform];
        const matches = meta.os.some((os) => currentNames.includes(os.toLowerCase()));
        if (!matches) continue;
      }

      entries.push({
        name: meta.name ?? path.basename(file, ".md"),
        description: meta.description ?? "",
        filePath,
        content: body.trim(),
      });
    }
  }

  return entries;
}

/**
 * Build skills prompt for injection into the system prompt.
 */
export function loadSkillsPrompt(): string | undefined {
  const entries = loadSkillEntries();
  if (entries.length === 0) return undefined;

  const lines = ["<available_skills>"];

  for (const entry of entries) {
    lines.push(`<skill name="${entry.name}">`);
    if (entry.description) {
      lines.push(`  <description>${entry.description}</description>`);
    }
    lines.push(`  <path>${entry.filePath}</path>`);
    lines.push("</skill>");
  }

  lines.push("</available_skills>");
  return lines.join("\n");
}

/**
 * Get a skill's full content by name.
 */
export function getSkillContent(name: string): string | undefined {
  const entries = loadSkillEntries();
  const entry = entries.find((e) => e.name === name);
  return entry?.content;
}
