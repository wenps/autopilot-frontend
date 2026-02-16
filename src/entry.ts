#!/usr/bin/env node
/**
 * AutoPilot CLI entry point.
 * Pattern adapted from OpenClaw's src/entry.ts
 */
import process from "node:process";
import { loadDotEnv } from "./infra/env.js";
import { installGlobalErrorHandlers } from "./infra/unhandled-rejections.js";
import { buildProgram } from "./cli/program.js";

process.title = "autopilot";

// Install global error handlers early
installGlobalErrorHandlers();

// Load .env before anything else
loadDotEnv();

const program = buildProgram();

// 取出用户传入的命令行参数（去掉 node 和脚本路径）
// 例如 `autopilot agent -m "hello"` → ["agent", "-m", "hello"]
// 例如 `autopilot`（无参数）            → []
const userArgs = process.argv.slice(2);

if (userArgs.length === 0) {
  // 无参数 → 进入交互式 REPL 聊天模式
  // 用户可以在终端中循环输入消息并获得 Agent 回复
  const { runInteractiveChat } = await import("./cli/interactive.js");
  runInteractiveChat().catch((err: Error) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
} else {
  // 有参数 → 交给 Commander 解析并路由到对应子命令
  // 例如: agent / browser / config / doctor / --help / --version
  program.parseAsync(process.argv).catch((err: Error) => {
    console.error("Fatal:", err.message);
    process.exit(1);
  });
}
