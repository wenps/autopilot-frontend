/**
 * 工具自动注册入口 — 将所有内置工具注册到 tool-registry。
 *
 * 这个文件是工具系统的"连接线"：
 *   各工具文件（exec、browser、web-search 等）定义工具
 *   → 这里导入并调用 registerTool() 注册到全局注册表
 *   → agent-core.ts 调用 registerBuiltinTools() 确保工具就位
 *
 * 新增工具时只需：
 *   1. 创建 xxx-tool.ts 实现 ToolDefinition
 *   2. 在这里 import 并 registerTool()
 */
import { registerTool } from "../tool-registry.js";
import { createExecTool } from "./exec-tool.js";
import { createWebFetchTool } from "./web-fetch-tool.js";
import { createWebSearchTool } from "./web-search-tool.js";
import { createBrowserTool } from "./browser-tool.js";
import { createFileReadTool, createFileWriteTool, createListDirTool } from "./file-tools.js";

/** 幂等标志：确保工具只注册一次，避免重复注册 */
let registered = false;

/**
 * 注册所有内置 Agent 工具。
 * 幂等调用：多次调用只会执行一次注册。
 * 调用方：agent-core.ts 的 runAgent() 在每次运行前调用。
 */
export function registerBuiltinTools(): void {
  if (registered) return;
  registered = true;

  // 🔧 Shell 命令执行
  registerTool(createExecTool());
  // 🌐 网页内容抓取
  registerTool(createWebFetchTool());
  // 🔍 网页搜索（Brave Search）
  registerTool(createWebSearchTool());
  // 🖥️ 浏览器自动化（Playwright）
  registerTool(createBrowserTool());
  // 📄 文件读取
  registerTool(createFileReadTool());
  // ✏️ 文件写入
  registerTool(createFileWriteTool());
  // 📁 目录浏览
  registerTool(createListDirTool());
}
