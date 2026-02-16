# AutoPilot

> 个人 AI 自动化代理 — 浏览器自动化 + Shell 执行 + Web 搜索 + 文件操作 + 多渠道消息聚合。

---

## 目录

- [项目简介](#项目简介)
- [快速开始](#快速开始)
- [系统架构](#系统架构)
- [核心模块详解](#核心模块详解)
  - [入口层 (Entry)](#1-入口层-entry)
  - [CLI 命令层](#2-cli-命令层)
  - [Agent 核心 (大脑)](#3-agent-核心-大脑)
  - [Agent Tools (手脚)](#4-agent-tools-手脚)
  - [浏览器控制](#5-浏览器控制)
  - [基础设施层](#6-基础设施层)
  - [日志系统](#7-日志系统)
  - [终端 UI](#8-终端-ui)
- [数据流：一条消息的旅程](#数据流一条消息的旅程)
- [配置系统](#配置系统)
- [Skills 技能系统](#skills-技能系统)
- [开发指南](#开发指南)
- [常见问题](#常见问题)

---

## 项目简介

AutoPilot 是一个 **AI Agent 工程**，核心思路是：

1. 用户给 AI 发一条自然语言消息
2. AI 理解意图后，自主**调用工具**（执行命令、操作浏览器、搜索网页、读写文件）完成任务
3. 循环多轮 tool-calling 直到得出最终结果

它就像一个拥有 "眼睛"（浏览器）、"双手"（Shell + 文件系统）和 "搜索引擎"（Web 搜索）的 AI 助手。

### 技术栈

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript (ESM, strict mode) |
| 运行时 | Node.js 22+ |
| AI 后端 | Anthropic Claude / OpenAI GPT（双 provider） |
| 浏览器 | Playwright (Chromium) |
| CLI 框架 | Commander.js |
| 测试 | Vitest |
| 包管理 | pnpm |

---

## 快速开始

### 1. 环境准备

```bash
# 确保 Node.js 22+
nvm use 22    # 项目根目录有 .nvmrc

# 安装依赖
pnpm install

# （可选）安装浏览器，用于浏览器自动化功能
npx playwright install chromium
```

### 2. 配置 API Key

至少配置一个 AI provider 的 API Key：

```bash
# 方式一：环境变量（推荐）
export ANTHROPIC_API_KEY="sk-ant-xxx..."

# 方式二：.env 文件
echo 'ANTHROPIC_API_KEY=sk-ant-xxx...' > .env

# 方式三：配置文件
pnpm autopilot config set agent.apiKey sk-ant-xxx...
pnpm autopilot config set agent.provider anthropic
```

### 3. 运行

```bash
# 交互式聊天模式（默认，不带任何参数）
pnpm autopilot

# 单条消息模式
pnpm autopilot agent -m "帮我查看当前目录下有什么文件"

# 健康检查
pnpm autopilot doctor

# 浏览器控制
pnpm autopilot browser open https://example.com

# 查看帮助
pnpm autopilot help
```

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                       用户输入                            │
│          CLI / 交互式 REPL / 命令行参数                     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    src/entry.ts                          │
│              入口：解析参数、分发到子命令或交互模式            │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         ┌─────────┐ ┌────────┐ ┌────────┐
         │ agent   │ │browser │ │ doctor │  ... 子命令
         │  CLI    │ │  CLI   │ │  CMD   │
         └────┬────┘ └────────┘ └────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│                  Agent Core (大脑)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  AI Client   │  │ System Prompt│  │ Tool Registry│   │
│  │ (Anthropic/  │  │   Builder    │  │  (注册/分发)  │   │
│  │   OpenAI)    │  │              │  │              │   │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘   │
│         │          agent-core.ts            │           │
│         │     ┌─── AI 决策循环 ◄────────────┘           │
│         │     │   (最多 10 轮)                           │
│         ▼     ▼                                         │
│    用户消息 → AI 思考 → 调用工具? ──是──→ 执行工具          │
│                  ↑       │                    │          │
│                  │       否                   │          │
│                  │       ▼                    │          │
│                  │    返回结果 ◄───────────────┘          │
└─────────────────────────────────────────────────────────┘
                         │
              ┌──────────┼──────────┬───────────┐
              ▼          ▼          ▼           ▼
         ┌─────────┐ ┌────────┐ ┌────────┐ ┌────────┐
         │  exec   │ │browser │ │  web   │ │  file  │  Tools
         │  tool   │ │  tool  │ │ search │ │ tools  │  (手脚)
         └─────────┘ └────────┘ └────────┘ └────────┘
```

---

## 核心模块详解

### 1. 入口层 (Entry)

**文件：`src/entry.ts`**

程序的起点。它做三件事：
1. 安装全局错误处理器（防止进程静默崩溃）
2. 加载 `.env` 环境变量
3. 判断用户意图：无参数 → 交互式聊天；有参数 → 交给 Commander 子命令系统

```
用户 ──→ entry.ts ──→ 无参数? ──→ 交互式 REPL (interactive.ts)
                  └──→ 有参数? ──→ Commander 路由到子命令
```

### 2. CLI 命令层

**目录：`src/cli/`**

| 文件 | 职责 |
|------|------|
| `program.ts` | 构建 Commander 程序，注册所有子命令 |
| `agent-cli.ts` | `autopilot agent -m "..."` — 单条消息模式 |
| `browser-cli.ts` | `autopilot browser open/click/fill/screenshot/...` — 浏览器控制 |
| `config-cli.ts` | `autopilot config show/set/path` — 配置管理 |
| `interactive.ts` | 交互式 REPL，循环读取用户输入并调用 Agent |
| `progress.ts` | CLI 进度指示器（spinner + 百分比） |

**阅读顺序建议**：`entry.ts` → `program.ts` → `agent-cli.ts` → `interactive.ts`

### 3. Agent 核心 (大脑)

**目录：`src/agent/`**

这是整个项目最核心的部分——AI 决策循环。

| 文件 | 职责 | 要点 |
|------|------|------|
| `agent-core.ts` | **Agent 主循环** | 发消息给 AI → 检查是否需要调用工具 → 执行工具 → 把结果反馈给 AI → 循环（最多 10 轮） |
| `ai-client.ts` | **AI 模型客户端** | 统一封装 Anthropic 和 OpenAI 两个 provider 的 API 差异，对外暴露一致的 `chat()` 接口 |
| `tool-registry.ts` | **工具注册表** | 工具的注册、查询、分发中心。每个工具注册 name/description/schema/execute |
| `system-prompt.ts` | **系统提示词构建器** | 拼装 AI 的"人设"——身份声明 + 可用工具列表 + 技能 + 运行时信息 |
| `skills.ts` | **技能加载器** | 从 `~/.autopilot/skills/` 和 `./skills/` 加载 Markdown 技能文件，注入系统提示 |

**Agent 核心循环的伪代码**：
```
function runAgent(message):
  注册所有内置工具
  构建系统提示词（含工具描述、技能）
  messages = [用户消息]

  for round in 1..10:
    response = AI.chat(systemPrompt, messages, tools)

    if 没有 tool_call:
      return response.text   // AI 直接回答了

    for each tool_call in response:
      result = 执行工具(tool_call.name, tool_call.input)
      记录结果

    messages.push(AI 的回复 + 工具执行结果)
    // 继续下一轮，让 AI 根据工具结果继续思考
```

**阅读顺序建议**：`tool-registry.ts`（理解工具接口）→ `agent-core.ts`（理解主循环）→ `ai-client.ts`（了解 AI 通信）→ `system-prompt.ts`

### 4. Agent Tools (手脚)

**目录：`src/agent/tools/`**

AI 自主调用的工具集合，每个工具都遵循统一接口 `ToolDefinition`：

```typescript
type ToolDefinition = {
  name: string;           // 工具名（AI 通过这个名字调用）
  description: string;    // 工具描述（AI 据此判断何时使用）
  schema: TObject;        // 参数的 JSON Schema（告诉 AI 需要传什么参数）
  execute: (params) => Promise<ToolCallResult>;  // 实际执行逻辑
};
```

| 工具文件 | 名称 | 能力 |
|---------|------|------|
| `exec-tool.ts` | `exec` | 执行 Shell 命令 |
| `browser-tool.ts` | `browser` | 浏览器自动化 |
| `web-search-tool.ts` | `web_search` | 网页搜索 |
| `web-fetch-tool.ts` | `web_fetch` | 网页内容抓取 |
| `file-tools.ts` | `file_read/write/list_dir` | 文件操作 |
| `index.ts` | — | 自动注册所有内置工具（只执行一次） |

#### exec — Shell 命令执行

AI 可以运行任意 Shell 命令（git、npm、ls、curl 等）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `command` | string (必填) | 要执行的 shell 命令 |
| `cwd` | string | 工作目录 |
| `timeoutMs` | number | 超时毫秒数（默认 30000） |

能力细节：
- 自动检测系统 shell（macOS/Linux 用 bash/zsh，Windows 用 PowerShell）
- 输出超过 30,000 字符时自动截断（保留首尾各半，中间标注省略数）
- 自动清理二进制/控制字符
- 返回 stdout、stderr、退出码、信号量

#### browser — 浏览器自动化

AI 可以控制一个 Chromium 浏览器，像人一样浏览网页、填表、点击。

| 参数 | 类型 | 说明 |
|------|------|------|
| `action` | string (必填) | 要执行的浏览器动作（见下表） |
| `url` | string | 导航目标 URL |
| `selector` | string | CSS 选择器 |
| `value` | string | 填充/选择的值 |
| `key` | string | 按键名称 |
| `expression` | string | JavaScript 表达式 |
| `outputPath` | string | 截图保存路径 |

支持 **17 种动作**：

| 动作 | 说明 | 示例 |
|------|------|------|
| `navigate` | 导航到 URL | `{ action: "navigate", url: "https://github.com" }` |
| `click` | 点击元素 | `{ action: "click", selector: "#submit" }` |
| `fill` | 填写表单（清空后填入） | `{ action: "fill", selector: "input[name=q]", value: "hello" }` |
| `type` | 逐字符输入 | `{ action: "type", selector: "#editor", value: "code" }` |
| `screenshot` | 截图保存为文件 | `{ action: "screenshot", outputPath: "page.png" }` |
| `snapshot` | 获取页面无障碍性树 | `{ action: "snapshot" }` — AI 靠这个"看懂"页面 |
| `evaluate` | 执行 JavaScript | `{ action: "evaluate", expression: "document.title" }` |
| `get_url` | 获取当前页面 URL | `{ action: "get_url" }` |
| `get_title` | 获取当前页面标题 | `{ action: "get_title" }` |
| `wait_for` | 等待元素出现 | `{ action: "wait_for", selector: ".loaded" }` |
| `select_option` | 选择下拉选项 | `{ action: "select_option", selector: "select", value: "opt1" }` |
| `press_key` | 模拟键盘按键 | `{ action: "press_key", key: "Enter" }` |
| `go_back` | 浏览器后退 | `{ action: "go_back" }` |
| `go_forward` | 浏览器前进 | `{ action: "go_forward" }` |
| `reload` | 刷新页面 | `{ action: "reload" }` |
| `get_cookies` | 获取所有 Cookie | `{ action: "get_cookies" }` |
| `close` | 关闭浏览器 | `{ action: "close" }` |

特性：单例模式复用浏览器实例，非 close 动作时自动 launch。

#### web_search — 网页搜索

通过 Brave Search API 搜索互联网，返回标题 + URL + 摘要列表。

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string (必填) | 搜索关键词 |
| `count` | number | 结果数量（默认 5，最多 20） |

前提：需要设置 `BRAVE_API_KEY` 环境变量。

#### web_fetch — 网页内容抓取

抓取指定 URL 的网页内容，自动清理 HTML 后返回纯文本。

| 参数 | 类型 | 说明 |
|------|------|------|
| `url` | string (必填) | 要抓取的网页 URL |
| `maxChars` | number | 最大返回字符数（默认 40,000） |

能力细节：
- 超时 15 秒（AbortController）
- 自动移除 `<script>`/`<style>`/`<nav>`/`<footer>`/`<header>` 标签
- 解码常见 HTML 实体（`&amp;` → `&` 等）
- 非 HTML 内容（JSON、纯文本）直接返回原文

#### file_read — 文件读取

| 参数 | 类型 | 说明 |
|------|------|------|
| `filePath` | string (必填) | 文件路径（绝对或相对） |
| `startLine` | number | 起始行号（1-based） |
| `endLine` | number | 结束行号（1-based，包含） |

能力细节：内容上限 50,000 字符，路径安全检查（禁止穿越工作目录）。

#### file_write — 文件写入

| 参数 | 类型 | 说明 |
|------|------|------|
| `filePath` | string (必填) | 文件路径 |
| `content` | string (必填) | 写入内容 |
| `append` | boolean | true 为追加，false 为覆写（默认） |

能力细节：自动创建父目录，路径安全检查。

#### list_dir — 目录浏览

| 参数 | 类型 | 说明 |
|------|------|------|
| `dirPath` | string (必填) | 目录路径 |
| `recursive` | boolean | 是否递归（默认 false，最深 3 层） |

能力细节：自动过滤 `.` 开头的隐藏文件和 `node_modules`。

**阅读顺序建议**：`index.ts`（了解注册机制）→ `exec-tool.ts`（最简单的工具）→ `file-tools.ts` → `browser-tool.ts`

### 5. 浏览器控制

**文件：`src/browser/controller.ts`**

Playwright 的封装层。`BrowserController` 类管理一个浏览器实例：

- **单例模式**：全局只有一个浏览器实例
- **动态导入**：`playwright-core` 按需加载，未安装也不影响其他功能
- **完整操作**：导航、截图、表单填充、点击、JS 评估、Cookie、键盘、无障碍快照

```
BrowserController
├── launch()          启动 Chromium
├── navigate(url)     导航到 URL
├── click(selector)   点击元素
├── fill(selector, value) 填写表单
├── screenshot(path)  截图保存
├── snapshot(format)  获取无障碍性树（用于 AI 理解页面）
├── evaluate(script)  执行任意 JS
├── close()           关闭浏览器
└── ... (20+ 方法)
```

### 6. 基础设施层

**目录：`src/infra/`**

通用工具集，被上层模块引用。按功能分类：

#### 进程与执行
| 文件 | 职责 |
|------|------|
| `src/process/exec.ts` | 带超时的子进程执行（`spawn`/`execFile` 封装） |
| `src/process/shell.ts` | Shell 检测（bash/zsh/powershell）、输出清理、进程树 kill |

#### 文件与路径
| 文件 | 职责 |
|------|------|
| `infra/fs-safe.ts` | 安全文件访问，多层防御路径穿越攻击 |
| `infra/json-file.ts` | JSON 文件读写（安全权限 0o600） |
| `infra/home-dir.ts` | 跨平台 home 目录解析 |

#### 网络与重试
| 文件 | 职责 |
|------|------|
| `infra/retry.ts` | 通用异步重试 + 指数退避 |
| `infra/backoff.ts` | 退避策略计算 + 可中断 sleep |

#### 其他
| 文件 | 职责 |
|------|------|
| `infra/errors.ts` | 错误格式化、errno 类型守卫 |
| `infra/env.ts` | dotenv 加载、环境变量读取 |
| `infra/os-summary.ts` | OS 平台信息摘要 |
| `infra/dedupe.ts` | TTL 去重缓存 |
| `infra/clipboard.ts` | 跨平台剪贴板复制（pbcopy/xclip/wl-copy/clip.exe） |
| `infra/unhandled-rejections.ts` | 全局未捕获异常处理 |

### 7. 日志系统

**目录：`src/logging/`**

| 文件 | 职责 |
|------|------|
| `logger.ts` | 6 级日志（silent → trace），双输出（控制台 + 文件），7 天自动轮转 |
| `redact.ts` | 敏感数据脱敏，15 种内置模式覆盖 API Key、Token、PEM 等 |

日志自动保存到 `~/.autopilot/logs/autopilot-YYYY-MM-DD.log`。

### 8. 终端 UI

**目录：`src/terminal/`**

| 文件 | 职责 |
|------|------|
| `palette.ts` | 统一的颜色 Token（蓝色系 accent、绿色 success、红色 error 等） |
| `theme.ts` | 基于 chalk 的颜色函数（`theme.success("✓")`、`theme.error("✗")`） |
| `ansi.ts` | ANSI 转义码处理（去色、计算可见宽度） |

---

## 数据流：一条消息的旅程

以用户输入 `"帮我查看 package.json 的内容"` 为例：

```
1. 用户输入 → entry.ts
2. entry.ts → interactive.ts (交互模式) 或 agent-cli.ts (命令模式)
3. → agent-core.ts/runAgent()
4.   → 注册工具 (tool-registry)
5.   → 构建系统提示 (system-prompt.ts + skills.ts)
6.   → 第 1 轮：发消息给 AI (ai-client.ts → Anthropic API)
7.   ← AI 回复：需要调用工具 file_read { path: "package.json" }
8.   → 执行 file_read 工具 (file-tools.ts → fs.readFile)
9.   → 得到文件内容
10.  → 第 2 轮：把工具结果发回给 AI
11.  ← AI 回复：最终文本答案（无更多工具调用）
12. → 输出给用户
```

---

## 配置系统

配置文件位于 `~/.autopilot/autopilot.json`（JSON5 格式）：

```jsonc
{
  "agent": {
    "provider": "anthropic",       // 或 "openai"
    "model": "claude-opus-4-6",    // 模型 ID
    "apiKey": "sk-ant-xxx..."      // API Key（建议用环境变量代替）
  },
  "browser": {
    "enabled": true,               // 是否启用浏览器功能
    "headless": false,             // 无头模式
    "executablePath": null         // 自定义 Chromium 路径
  },
  "tools": {
    "webSearch": {
      "provider": "brave",         // 搜索引擎
      "apiKey": "BSA-xxx..."       // Brave Search API Key
    }
  }
}
```

CLI 管理：
```bash
autopilot config show      # 查看当前配置
autopilot config set agent.model claude-sonnet-4-20250514  # 修改配置
autopilot config path      # 显示配置文件路径
```

---

## Skills 技能系统

技能是 Markdown 文件，包含领域知识和操作步骤，注入到 AI 的系统提示中。

**存放位置**：
- `~/.autopilot/skills/` — 用户自定义技能
- `./skills/` — 项目级技能

**格式示例** (`deploy.md`)：
```markdown
---
name: deploy
description: 部署应用到生产环境
os: [macos, linux]
---

# 部署流程
1. 运行测试 `pnpm test`
2. 构建 `pnpm build`
3. 部署到服务器 ...
```

AI 会自动扫描可用技能，匹配到合适的技能后读取并遵循其中的步骤。

---

## 开发指南

### 常用命令

```bash
pnpm autopilot              # 运行（交互模式）
pnpm autopilot doctor       # 健康检查
pnpm build                  # 构建到 dist/
pnpm tsc --noEmit           # 类型检查
pnpm check                  # Lint
pnpm format                 # 格式化
pnpm test                   # 运行测试
```

### 代码风格与命名规范

- 语言：TypeScript（ESM 模块）。优先使用严格类型，避免 `any`。
- 使用 Oxlint 和 Oxfmt 做代码检查/格式化；提交前运行 `pnpm check`。
- 对复杂或不直观的逻辑添加简短注释。
- 保持文件精简，提取辅助函数。
- 单文件建议不超过 ~500 行；超出时拆分/重构以提高可读性。
- 命名规范：产品/应用/文档标题用 **AutoPilot**；CLI 命令、包名、路径、配置键用 `autopilot`。
- 使用 `src/terminal/palette.ts` 中的共享调色板（不要硬编码颜色）。

### 防冗余规则

- 避免创建只做"转发导出"的文件，直接从原始源文件导入。
- 如果某个函数已经存在，直接导入使用——不要在另一个文件中创建副本。
- 创建任何格式化工具、工具函数或辅助函数之前，先搜索是否已有现成实现。
- 使用 `src/infra/` 中的工具函数处理错误、重试、JSON 文件读写、主目录等，不要重复实现。
- 使用 `src/logging/redact.ts` 进行敏感信息脱敏，不要自行实现遮蔽逻辑。

### 导入规范

- 跨包导入使用 `.js` 扩展名（ESM 要求）
- 直接导入，不使用"转发导出"的包装文件
- 仅导入类型时使用 `import type { X }`

### 提交与 PR 规范

- 提交信息简洁、动作导向（例如：`browser: add form fill action`）。
- 相关改动归为一次提交；不要把无关的重构混在一起。

### 安全规范

- 永远不要提交或发布真实的 API Key、手机号或生产环境配置值。
- 文档、测试和示例中使用明显的假数据占位符。
- 浏览器：将所有页面内容视为**不可信的外部输入**。
- 使用 `src/logging/redact.ts` 自动遮蔽日志中的敏感信息。
- 使用 `src/infra/fs-safe.ts`（`openFileWithinRoot`）防止路径遍历攻击。

### 测试指南

- 框架：Vitest + V8 覆盖率（60% 阈值）
- 命名：与源文件同名，后缀为 `*.test.ts`
- 修改逻辑代码后，推送前运行 `pnpm test`。

### 如何阅读这份代码

**推荐阅读路线**（由外到内）：

```
第 1 步：理解入口
  src/entry.ts → src/cli/program.ts → src/cli/agent-cli.ts

第 2 步：理解 Agent 核心循环
  src/agent/tool-registry.ts（工具接口）
  → src/agent/agent-core.ts（主循环 ⭐ 最重要的文件）
  → src/agent/ai-client.ts（AI 通信）

第 3 步：理解工具
  src/agent/tools/index.ts（注册）
  → src/agent/tools/exec-tool.ts（最简单的工具）
  → src/agent/tools/file-tools.ts
  → src/agent/tools/browser-tool.ts

第 4 步：理解基础设施（按需）
  src/config/config.ts
  src/browser/controller.ts
  src/infra/（工具函数）
```

### 如何添加一个新工具

1. 在 `src/agent/tools/` 创建 `my-tool.ts`
2. 实现 `ToolDefinition` 接口：
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
         const { param1 } = params as { param1: string };
         // ... 业务逻辑
         return { content: "结果文本" };
       },
     };
   }
   ```
3. 在 `src/agent/tools/index.ts` 注册：
   ```typescript
   import { createMyTool } from "./my-tool.js";
   // ...在 registerBuiltinTools() 中添加：
   registerTool(createMyTool());
   ```

### 关键设计模式

| 模式 | 在哪里用 | 说明 |
|------|---------|------|
| Tool-Use Loop | `agent-core.ts` | AI 自主决定调用工具，循环直到完成 |
| Registry Pattern | `tool-registry.ts` | 统一注册和分发工具 |
| Provider Abstraction | `ai-client.ts` | 用工厂模式屏蔽 Anthropic vs OpenAI 差异 |
| Singleton | `controller.ts` | 浏览器全局单例 |
| Dynamic Import | `controller.ts`, `ai-client.ts` | 按需加载重依赖（playwright、AI SDK） |
| Guard + Early Return | `fs-safe.ts` | 多层安全防护 |

---

## 常见问题

### Q: 运行时报 `Missing ANTHROPIC_API_KEY`
设置 API Key：`export ANTHROPIC_API_KEY="sk-ant-..."` 或在 `.env` 文件中配置。

### Q: Node 版本不对
项目需要 Node 22+。使用 `nvm use 22`（根目录有 `.nvmrc`）。

### Q: pnpm 找不到
安装 pnpm：`npm install -g pnpm` 或 `corepack enable`。

### Q: Playwright 浏览器未安装
运行 `npx playwright install chromium`。浏览器功能是可选的，不安装不影响其他功能。

### Q: 想用 OpenAI 而不是 Anthropic
```bash
export OPENAI_API_KEY="sk-xxx..."
pnpm autopilot config set agent.provider openai
pnpm autopilot config set agent.model gpt-4o
```

---

## License

MIT
