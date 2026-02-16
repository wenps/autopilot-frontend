/**
 * Agent CLI command.
 * Pattern from OpenClaw's src/cli/program/register.agent.ts
 */
import type { Command } from "commander";
import { runAgent } from "../agent/agent-core.js";
import { loadConfig } from "../config/config.js";

export function registerAgentCommand(program: Command): void {
  program
    .command("agent")
    .description("Run the AI agent with a message")
    .requiredOption("-m, --message <text>", "Message to send to the agent")
    .option("--thinking <level>", "Thinking level: off | low | medium | high", "medium")
    .option("--model <model>", "Model override (e.g. claude-opus-4-6)")
    .option("--json", "Output result as JSON", false)
    .action(async (opts) => {
      const config = loadConfig();
      const result = await runAgent({
        message: opts.message,
        thinkingLevel: opts.thinking,
        model: opts.model ?? config.agent?.model,
        provider: config.agent?.provider ?? "anthropic",
        config,
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.reply);
      }
    });
}
