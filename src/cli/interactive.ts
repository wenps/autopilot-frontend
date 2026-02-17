/**
 * 交互式聊天循环 — 用户通过终端与 Agent 对话。
 *
 * 流程极简：
 *   you > 用户输入
 *   autopilot > AI 回复
 *
 * 【后续可拓展】
 * - 添加进度指示器（spinner）
 * - 支持多行输入
 * - 支持命令历史
 * - 支持 /help /clear 等内置命令
 */
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgent } from "../agent/agent-core.js";
import { loadConfig } from "../config/config.js";

export async function runInteractiveChat(): Promise<void> {
  const config = loadConfig();

  console.log("\n\ud83e\udd16 AutoPilot Interactive Mode");
  console.log("Type a message to chat. Type 'exit' or Ctrl+C to quit.\n");

  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      const input = await rl.question("you > ");
      const message = input.trim();
      if (!message) continue;
      if (message === "exit" || message === "quit") break;

      try {
        const result = await runAgent({
          message,
          provider: config.agent?.provider ?? "anthropic",
          model: config.agent?.model,
          config,
        });

        console.log(`\nautopilot > ${result.reply}\n`);
        if (result.toolCalls.length > 0) {
          console.log(`  [${result.toolCalls.length} tool call(s)]`);
        }
      } catch (err) {
        console.error(`\nError: ${err instanceof Error ? err.message : String(err)}\n`);
      }
    }
  } finally {
    rl.close();
  }
}
