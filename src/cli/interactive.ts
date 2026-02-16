/**
 * Interactive chat REPL — minimal default entry for AutoPilot.
 * Lets users type messages and get agent responses in a loop.
 *
 * 当用户不带任何参数运行 `autopilot` 时进入此模式。
 * 使用 Node.js 内置的 readline/promises 实现交互式问答循环：
 *   you > 用户输入消息
 *   autopilot > AI 回复
 */
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { runAgent } from "../agent/agent-core.js";
import { loadConfig } from "../config/config.js";
import { theme } from "../terminal/theme.js";

/**
 * 启动交互式聊天循环。
 * 流程：读取配置 → 显示欢迎信息 → 循环（等待输入 → 调用 Agent → 输出回复）
 */
export async function runInteractiveChat(): Promise<void> {
  // 加载 ~/.autopilot/autopilot.json 配置（provider、model、apiKey 等）
  const config = loadConfig();

  // 显示欢迎信息
  console.log(theme.heading("\n🤖 AutoPilot Interactive Mode"));
  console.log(theme.muted("Type a message to chat with the agent. Type 'exit' or Ctrl+C to quit.\n"));

  // 创建 readline 接口用于逐行读取用户输入
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    // 主循环：持续等待用户输入
    while (true) {
      // 显示提示符 "you > " 并等待用户输入一行文字
      const input = await rl.question(theme.accent("you > "));
      const message = input.trim();

      // 空输入跳过
      if (!message) continue;
      // 用户输入 exit/quit 退出循环
      if (message === "exit" || message === "quit") {
        console.log(theme.muted("Goodbye!"));
        break;
      }

      try {
        // 调用 Agent 核心循环：发送消息 → AI 思考 → 可能调用工具 → 返回最终回复
        const result = await runAgent({
          message,
          provider: config.agent?.provider ?? "anthropic",
          model: config.agent?.model,
          config,
        });

        // 输出 AI 的回复
        console.log(`\n${theme.success("autopilot")} > ${result.reply}\n`);

        // 如果 Agent 过程中调用了工具，显示工具调用次数
        if (result.toolCalls.length > 0) {
          console.log(theme.muted(`  [${result.toolCalls.length} tool call(s) executed]`));
        }
      } catch (err) {
        // 单轮对话出错不退出，打印错误后继续下一轮
        const msg = err instanceof Error ? err.message : String(err);
        console.error(theme.error(`\nError: ${msg}\n`));
      }
    }
  } finally {
    // 确保退出时关闭 readline（释放 stdin）
    rl.close();
  }
}
