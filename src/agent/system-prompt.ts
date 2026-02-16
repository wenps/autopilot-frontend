/**
 * System prompt builder.
 * Pattern from OpenClaw's src/agents/system-prompt.ts
 *
 * Builds the system prompt with available tools, skills, workspace context,
 * and runtime information.
 */
import type { AutoPilotConfig } from "../config/config.js";
import { getToolDefinitions } from "./tool-registry.js";
import { loadSkillsPrompt } from "./skills.js";

export type SystemPromptParams = {
  config: AutoPilotConfig;
  thinkingLevel?: string;
  extraInstructions?: string;
};

export function buildSystemPrompt(params: SystemPromptParams): string {
  const sections: string[] = [];

  // Identity
  sections.push(buildIdentitySection());

  // Tooling
  sections.push(buildToolingSection());

  // Skills
  const skillsPrompt = loadSkillsPrompt();
  if (skillsPrompt) {
    sections.push(buildSkillsSection(skillsPrompt));
  }

  // Runtime info
  sections.push(buildRuntimeSection(params));

  // Extra instructions
  if (params.extraInstructions?.trim()) {
    sections.push(params.extraInstructions.trim());
  }

  return sections.filter(Boolean).join("\n\n");
}

function buildIdentitySection(): string {
  return [
    "You are AutoPilot, a personal AI automation agent.",
    "You can control a browser (navigate, fill forms, click, screenshot),",
    "open VSCode and fix code, search the web, and execute shell commands.",
    "Always confirm destructive actions with the user before executing.",
  ].join("\n");
}

function buildToolingSection(): string {
  const tools = getToolDefinitions();
  if (tools.length === 0) return "";

  const lines = [
    "## Available Tools",
    "",
    "You have access to the following tools:",
    "",
  ];

  for (const tool of tools) {
    lines.push(`- **${tool.name}**: ${tool.description}`);
  }

  lines.push("");
  lines.push("Use tools when needed to complete the user's request. Prefer combining multiple tool calls efficiently.");

  return lines.join("\n");
}

function buildSkillsSection(skillsPrompt: string): string {
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    "- If exactly one skill clearly applies: read its SKILL.md, then follow it.",
    "- If multiple could apply: choose the most specific one.",
    "- If none clearly apply: do not read any SKILL.md.",
    "",
    skillsPrompt,
  ].join("\n");
}

function buildRuntimeSection(params: SystemPromptParams): string {
  const lines = [
    "## Runtime",
    `- Thinking level: ${params.thinkingLevel ?? "medium"}`,
    `- Provider: ${params.config.agent?.provider ?? "anthropic"}`,
    `- Model: ${params.config.agent?.model ?? "default"}`,
    `- Date: ${new Date().toISOString().split("T")[0]}`,
  ];

  if (params.config.browser?.enabled !== false) {
    lines.push("- Browser: enabled (Playwright)");
  }

  return lines.join("\n");
}
