# AutoPilot

> 个人 AI 自动化代理 — AI 对话 + 工具调用（Shell 执行 / Web 搜索 / 文件操作）。

---

## 目录

- [项目简介](#项目简介)
- [目录结构](#目录结构)
- [执行流程](#执行流程)
- [核心模块详解](#核心模块详解)
- [快速开始](#快速开始)
- [如何添加新工具](#如何添加新工具)
- [后续可拓展方向](#后续可拓展方向)

---

## 项目简介

AutoPilot 是一个 **AI Agent 工程**，核心思路极其简单：

1. 用户给 AI 发一条自然语言消息
2. AI 理解意图后，自主**调用工具**（执行命令、搜索网页、读写文件）完成任务
3. 循环多轮 tool-calling 直到得出最终结果，返回给用户

### 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript (ESM) |
| 运行时 | Node.js 22+ |
| AI 后端 | Anthropic Claude / OpenAI GPT（双 provider） |
| 包管理 | pnpm |

---

## 目录结构

精简后只保留核心功能，**总共 14 个文件**：

```
src/
├── entry.ts                    # 🚪 入口：加载 .env → 启动交互式聊天
│
├── cli/
│   └── interactive.ts          # 💬 交互式聊天循环（readline REPL）
│
├── config/
│   └── config.ts               # ⚙️ 配置定义与加载（当前极简，返回空对象）
│
├── agent/                      # 🧠 Agent 核心（最重要的 4 个文件）
│   ├── agent-core.ts           #    ⭐ 决策循环：思考 → 调工具 → 再思考 → 返回
│   ├── ai-client.ts            #    🔌 AI 连接：封装 Anthropic / OpenAI API
│   ├── system-prompt.ts        #    📝 系统提示词：告诉 AI 它是谁、有哪些工具
│   ├── tool-registry.ts        #    📦 工具注册表：注册 / 查找 / 分发工具
│   └── tools/                  #    🔧 具体工具实现
│       ├── index.ts            #       注册入口：将所有工具注册到 registry
│       ├── exec-tool.ts        #       Shell 命令执行
│       ├── file-tools.ts       #       文件读写 + 目录浏览（3 个工具）
│       ├── web-search-tool.ts  #       网页搜索（Brave Search API）
│       └── web-fetch-tool.ts   #       网页内容抓取
│
└── process/                    # ⚡ 进程执行（exec-tool 的底层依赖）
    ├── exec.ts                 #    带超时的子进程执行（spawn 封装）
    └── shell.ts                #    Shell 检测 + 输出清理 + 进程树 kill
```

### 各目录职责一句话总结

| 目录 | 干什么 | 被谁依赖 |
|------|--------|---------|
| `src/` 根 | 程序入口 | — |
| `src/cli/` | 用户交互界面（终端聊天循环） | entry.ts |
| `src/config/` | 配置管理（provider、model、apiKey） | interactive.ts、agent-core.ts |
| `src/agent/` | **核心大脑**：AI 连接 + 决策循环 + 工具系统 | interactive.ts |
| `src/agent/tools/` | 具体工具实现（AI 的"手脚"） | agent-core.ts（通过 tool-registry） |
| `src/process/` | 底层进程执行能力 | exec-tool.ts |

---

## 执行流程

### 完整数据流：从用户输入到 AI 回复

```
用户在终端输入 "帮我查看 package.json 的内容"
    │
    ▼
┌─ entry.ts ──────────────────────────────────────────┐
│  加载 .env → 启动交互式聊天                           │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─ cli/interactive.ts ────────────────────────────────┐
│  readline 循环等待输入 → 拿到消息 → 调用 runAgent()   │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─ agent/agent-core.ts ──── runAgent() ───────────────┐
│                                                      │
│  ① registerBuiltinTools()                            │
│     → tools/index.ts 注册 6 个工具到 Map              │
│                                                      │
│  ② createAIClient({ provider, model })               │
│     → ai-client.ts 创建 Anthropic 或 OpenAI 客户端    │
│                                                      │
│  ③ buildSystemPrompt()                               │
│     → system-prompt.ts 构建提示词（身份 + 工具列表）     │
│                                                      │
│  ④ Tool-Use Loop（最多 10 轮）：                       │
│     ┌──────────────────────────────────────┐         │
│     │ client.chat(prompt, messages, tools)  │         │
│     │         ↓                             │         │
│     │ AI 返回 toolCalls?                    │         │
│     │   没有 → 拿到 finalReply，结束循环      │         │
│     │   有   → dispatchToolCall() 逐个执行   │         │
│     │         ↓                             │         │
│     │ 把工具结果追加到 messages               │         │
│     │ 回到循环顶部，AI 继续思考               │         │
│     └──────────────────────────────────────┘         │
│                                                      │
│  ⑤ return { reply, toolCalls, model }                │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─ cli/interactive.ts ────────────────────────────────┐
│  打印 "autopilot > {reply}"                          │
│  继续等待下一条输入...                                 │
└─────────────────────────────────────────────────────┘
```

### 工具调用的内部流程

以 AI 决定调用 `file_read` 为例：

```
AI 返回：toolCalls: [{ name: "file_read", input: { filePath: "package.json" } }]
    │
    ▼
agent-core.ts → dispatchToolCall("file_read", { filePath: "package.json" })
    │
    ▼
tool-registry.ts → tools Map 中查找 "file_read" → 找到 → 调用 execute()
    │
    ▼
file-tools.ts → safeResolvePath() 安全检查 → fs.readFileSync() 读取文件
    │
    ▼
返回 { content: "文件内容..." } → 追加到 messages → AI 继续思考
```

### tool-registry 的工作方式

```
启动时（注册阶段）：
  tools/index.ts 调用 registerTool() × 6 次
      ↓
  tool-registry 内部 Map：
    "exec"        → { name, description, schema, execute }
    "web_fetch"   → { ... }
    "web_search"  → { ... }
    "file_read"   → { ... }
    "file_write"  → { ... }
    "list_dir"    → { ... }

运行时（查询阶段）：
  getToolDefinitions() → 返回所有工具定义 → 发给 AI 看"菜单"
  dispatchToolCall(name, input) → 从 Map 找到工具 → 执行 → 返回结果
```

---

## 核心模块详解

### 1. entry.ts — 入口

最简单的文件：加载 `.env` → 启动交互式聊天。没有 CLI 框架，没有子命令路由。

### 2. cli/interactive.ts — 聊天循环

readline 死循环：等用户输入 → 调 `runAgent()` → 打印回复。核心就 3 行逻辑。

### 3. agent/agent-core.ts — 决策循环（⭐ 最重要）

`runAgent()` 函数是整个项目的核心，实现了 ReAct（Reasoning + Acting）循环：

```typescript
for (let round = 0; round < 10; round++) {
  const response = await client.chat({ systemPrompt, messages, tools });
  if (!response.toolCalls) { finalReply = response.text; break; }     // AI 直接回答
  for (const tc of response.toolCalls) {
    const result = await dispatchToolCall(tc.name, tc.input);          // 执行工具
  }
  messages.push(assistantMsg, toolResultMsg);                          // 反馈给 AI
}
```

### 4. agent/ai-client.ts — AI 连接

工厂函数 `createAIClient()` 根据 provider 创建客户端：
- `"anthropic"` → 动态 import `@anthropic-ai/sdk`，调 `client.messages.create()`
- `"openai"` → 动态 import `openai`，调 `client.chat.completions.create()`

两个客户端共享同一个接口 `AIClient.chat()`，上层完全不感知差异。

### 5. agent/tool-registry.ts — 工具注册表

一个 `Map<string, ToolDefinition>` + 三个函数：
- `registerTool()` — 注册
- `getToolDefinitions()` — 给 AI 看工具列表
- `dispatchToolCall()` — 按名字查找并执行

### 6. agent/tools/ — 具体工具

| 工具 | 名称 | 能力 |
|------|------|------|
| exec-tool.ts | `exec` | 执行 Shell 命令，30s 超时，输出截断 |
| file-tools.ts | `file_read` / `file_write` / `list_dir` | 读写文件、浏览目录，路径安全检查 |
| web-search-tool.ts | `web_search` | Brave Search API 搜索，需要 BRAVE_API_KEY |
| web-fetch-tool.ts | `web_fetch` | 抓取网页内容，自动清理 HTML，15s 超时 |

### 7. process/ — 进程执行

| 文件 | 职责 |
|------|------|
| exec.ts | `runCommandWithTimeout()` — 带超时的 spawn 封装，支持 stdin/cwd/env |
| shell.ts | `getShellConfig()` — 检测系统 shell（bash/zsh/powershell），`sanitizeBinaryOutput()` — 清理输出 |

---

## 快速开始

### 1. 环境准备

```bash
nvm use 22
pnpm install
```

### 2. 配置 API Key

```bash
# 方式一：环境变量（推荐）
export ANTHROPIC_API_KEY="sk-ant-xxx..."

# 方式二：.env 文件
echo 'ANTHROPIC_API_KEY=sk-ant-xxx...' > .env
```

### 3. 运行

```bash
pnpm autopilot
# 进入交互式聊天，输入消息即可
```

---

## 如何添加新工具

只需 2 步：

**第 1 步**：在 `src/agent/tools/` 创建 `my-tool.ts`

```typescript
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../tool-registry.js";

export function createMyTool(): ToolDefinition {
  return {
    name: "my_tool",
    description: "描述这个工具做什么（AI 会根据这段话决定何时调用）",
    schema: Type.Object({
      param1: Type.String({ description: "参数描述" }),
    }),
    async execute(params) {
      const param1 = params.param1 as string;
      // ... 业务逻辑
      return { content: "结果文本" };
    },
  };
}
```

**第 2 步**：在 `src/agent/tools/index.ts` 注册

```typescript
import { createMyTool } from "./my-tool.js";
// 在 registerBuiltinTools() 中添加：
registerTool(createMyTool());
```

完成。AI 下次对话时就能自动发现并使用这个工具。

---

## 后续可拓展方向

以下功能已从核心代码中移除，后续可按需加回：

| 功能 | 说明 | 涉及文件 |
|------|------|---------|
| **浏览器自动化** | Playwright 控制 Chromium，17 种浏览器动作 | `src/browser/controller.ts` + `src/agent/tools/browser-tool.ts` |
| **CLI 子命令** | Commander.js 多命令支持（agent/browser/config/doctor） | `src/cli/program.ts` + `*-cli.ts` + `src/commands/` |
| **技能系统** | 从 Markdown 文件加载领域知识，注入系统提示词 | `src/agent/skills.ts` + `~/.autopilot/skills/` |
| **配置文件** | JSON5 格式配置读写（~/.autopilot/autopilot.json） | 扩展 `src/config/config.ts`，引入 `json5` |
| **日志系统** | 6 级日志 + 文件轮转 + 敏感信息自动脱敏 | `src/logging/logger.ts` + `src/logging/redact.ts` |
| **基础设施** | 错误处理、重试/退避、安全文件操作、剪贴板等 | `src/infra/` 整个目录 |
| **进度指示器** | CLI spinner + 进度条 | `src/cli/progress.ts` |
| **消息渠道** | Telegram / Discord 多渠道接入 | 配置中的 `channels` 字段 |
| **OpenAI 支持** | 已内置在 ai-client.ts 中，设置 `OPENAI_API_KEY` 即可使用 | — |

### 拓展示例：加回浏览器自动化

1. 恢复 `src/browser/controller.ts`（Playwright 封装）
2. 恢复 `src/agent/tools/browser-tool.ts`（工具定义）
3. 在 `src/agent/tools/index.ts` 中注册 `createBrowserTool()`
4. `npx playwright install chromium`

### 拓展示例：加回配置文件支持

扩展 `src/config/config.ts` 中的 `loadConfig()`，读取 `~/.autopilot/autopilot.json`：

```typescript
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

export function loadConfig(): AutoPilotConfig {
  const configPath = path.join(homedir(), ".autopilot", "autopilot.json");
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}
```

---

## License

MIT
