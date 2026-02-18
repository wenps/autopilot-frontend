/**
 * 工具注册入口 — 将所有内置工具注册到 tool-registry。
 *
 * 新增工具只需：
 *   1. 创建 xxx-tool.ts 实现 ToolDefinition
 *   2. 在这里 import 并 registerTool()
 *
 * 【后续可拓展】
 * - 添加自定义工具加载器（从插件目录动态加载）
 */
import { registerTool } from "../../core/tool-registry.js";
import { createExecTool } from "./exec-tool.js";
import { createBrowserTool } from "./browser-tool.js";
import { createWebFetchTool } from "./web-fetch-tool.js";
import { createWebSearchTool } from "./web-search-tool.js";
import { createFileReadTool, createFileWriteTool, createListDirTool } from "./file-tools.js";

let registered = false;

export function registerBuiltinTools(): void {
  if (registered) return;
  registered = true;

  registerTool(createExecTool());       // Shell 命令执行
  registerTool(createBrowserTool());    // 浏览器自动化（Playwright）
  registerTool(createWebFetchTool());   // 网页内容抓取
  registerTool(createWebSearchTool());  // 网页搜索
  registerTool(createFileReadTool());   // 文件读取
  registerTool(createFileWriteTool());  // 文件写入
  registerTool(createListDirTool());    // 目录浏览
}
