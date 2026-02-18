/**
 * Web Tools 注册入口 — 将所有基于 Web API 的工具注册到 tool-registry。
 *
 * 这些工具运行在浏览器环境（Content Script），使用 Web API 替代 Node/Playwright：
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │  Web Tools（浏览器端）          对应的 Node Tools        │
 *   ├────────────────────────────────────────────────────────┤
 *   │  dom       (click/fill/type)  ← browser-tool (Playwright) │
 *   │  navigate  (goto/back/scroll) ← browser-tool (Playwright) │
 *   │  page_info (snapshot/title)   ← browser-tool (Playwright) │
 *   │  wait      (MutationObserver) ← browser-tool (Playwright) │
 *   │  evaluate  (JS 执行)          ← browser-tool (Playwright) │
 *   └────────────────────────────────────────────────────────┘
 *
 * 使用方法：
 *   import { registerWebTools } from "./web/index.js";
 *   registerWebTools();  // 在 Chrome Extension 的 content script 中调用
 */
import { registerTool } from "../../core/tool-registry.js";
import { createDomTool } from "./dom-tool.js";
import { createNavigateTool } from "./navigate-tool.js";
import { createPageInfoTool } from "./page-info-tool.js";
import { createWaitTool } from "./wait-tool.js";
import { createEvaluateTool } from "./evaluate-tool.js";

let registered = false;

/**
 * 注册所有 Web 工具（幂等，只执行一次）。
 *
 * 在 Chrome Extension 的 content script 或 service worker 中调用。
 * 注意：这些工具依赖浏览器 DOM API，不能在 Node.js 中运行。
 */
export function registerWebTools(): void {
  if (registered) return;
  registered = true;

  registerTool(createDomTool());        // DOM 操作：click, fill, type, getText, getAttr...
  registerTool(createNavigateTool());   // 页面导航：goto, back, forward, reload, scroll
  registerTool(createPageInfoTool());   // 页面信息：url, title, snapshot, selection, query_all
  registerTool(createWaitTool());       // 等待元素：waitForSelector, waitForHidden, waitForText
  registerTool(createEvaluateTool());   // JS 执行：在页面上下文中执行任意 JavaScript
}
