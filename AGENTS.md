# AutoPilot — 项目指南

> 个人 AI 自动化代理 — 浏览器自动化 + Shell 执行 + Web 搜索 + 文件操作 + 多渠道消息聚合。
> 可独立运行，也可作为 OpenClaw 子项目。

## 项目结构与模块组织

- 源代码：`src/`
  - CLI 入口/选项绑定：`src/cli/`（program、agent-cli、browser-cli、config-cli、interactive、progress）
  - 子命令：`src/commands/`（doctor）
  - Agent 核心：`src/agent/`（agent-core、ai-client、system-prompt、tool-registry、skills）
  - Agent 工具：`src/agent/tools/`（exec、browser、web-search、web-fetch、file）
  - 浏览器控制：`src/browser/`（controller）
  - 配置管理：`src/config/`（config）
  - 基础设施：`src/infra/`（errors、retry、backoff、json-file、home-dir、os-summary、dedupe、fs-safe、clipboard、env、unhandled-rejections）
  - 日志：`src/logging/`（logger、redact）
  - 进程管理：`src/process/`（exec、shell）
- 测试：与源文件同目录，命名为 `*.test.ts`。
- 技能文件：`~/.autopilot/skills/`（用户自定义）或 `./skills/`（项目内置）。
- 配置文件：`~/.autopilot/autopilot.json`（JSON5 格式）。
- 日志文件：`~/.autopilot/logs/autopilot-YYYY-MM-DD.log`（7 天轮转）。
- 构建产物：`dist/`。

## 构建、测试与开发命令

- 运行时要求：Node **22+**（同时兼容 Bun）
- 安装依赖：`pnpm install`
- 安装浏览器：`npx playwright install chromium`
- 开发模式运行 CLI：`pnpm autopilot ...` 或 `pnpm dev`
- 交互式聊天：`pnpm autopilot`（不带参数 → 进入 REPL 模式）
- 类型检查/构建：`pnpm build`
- 仅类型检查：`pnpm tsc --noEmit`
- 代码检查/格式化：`pnpm check`
- 自动修复格式：`pnpm format`
- 运行测试：`pnpm test`（vitest）
- 健康检查：`pnpm autopilot doctor`

## 代码风格与命名规范

- 语言：TypeScript（ESM 模块）。优先使用严格类型，避免 `any`。
- 使用 Oxlint 和 Oxfmt 做代码检查/格式化；提交前运行 `pnpm check`。
- 对复杂或不直观的逻辑添加简短注释。
- 保持文件精简，提取辅助函数。
- 单文件建议不超过 ~500 行；超出时拆分/重构以提高可读性。
- 命名规范：产品/应用/文档标题用 **AutoPilot**；CLI 命令、包名、路径、配置键用 `autopilot`。

## 防冗余规则

- 避免创建只做"转发导出"的文件，直接从原始源文件导入。
- 如果某个函数已经存在，直接导入使用——不要在另一个文件中创建副本。
- 创建任何格式化工具、工具函数或辅助函数之前，先搜索是否已有现成实现。
- 使用 `src/infra/` 中的工具函数处理错误、重试、JSON 文件读写、主目录等，不要重复实现。
- 使用 `src/logging/redact.ts` 进行敏感信息脱敏，不要自行实现遮蔽逻辑。

## 各模块权威位置（源码定位表）

### Agent 核心（`src/agent/`）
- Agent 决策循环：`src/agent/agent-core.ts`
- 工具注册与分发：`src/agent/tool-registry.ts`
- 内置工具注册入口：`src/agent/tools/index.ts`（自动注册）
- 系统提示词构建：`src/agent/system-prompt.ts`
- 技能加载器：`src/agent/skills.ts`
- AI 客户端（Anthropic/OpenAI）：`src/agent/ai-client.ts`

### Agent 工具（`src/agent/tools/`）
- Shell 命令执行：`src/agent/tools/exec-tool.ts`
- 浏览器自动化：`src/agent/tools/browser-tool.ts`
- 网页搜索（Brave）：`src/agent/tools/web-search-tool.ts`
- 网页内容抓取：`src/agent/tools/web-fetch-tool.ts`
- 文件读/写/目录浏览：`src/agent/tools/file-tools.ts`

### 浏览器控制（`src/browser/`）
- Playwright 控制器：`src/browser/controller.ts`

### 基础设施（`src/infra/`）
- 错误处理：`src/infra/errors.ts`
- 重试/退避：`src/infra/retry.ts`、`src/infra/backoff.ts`
- JSON 文件读写：`src/infra/json-file.ts`
- 主目录管理：`src/infra/home-dir.ts`
- 操作系统检测：`src/infra/os-summary.ts`
- 去重工具：`src/infra/dedupe.ts`
- 安全文件访问：`src/infra/fs-safe.ts`
- 剪贴板：`src/infra/clipboard.ts`

### 日志（`src/logging/`）
- 结构化日志器：`src/logging/logger.ts`
- 敏感信息脱敏：`src/logging/redact.ts`

### CLI 相关
- CLI 选项绑定：`src/cli/`
- 交互式 REPL：`src/cli/interactive.ts`
- 进度指示器：`src/cli/progress.ts`
- 子命令：`src/commands/`

### 启动流程
- `src/entry.ts` 负责分发：不带参数 → 进入交互式 REPL；带参数 → 走 Commander 子命令。
- `src/cli/interactive.ts` 提供默认的 readline 聊天循环。
- `src/cli/agent-cli.ts` 提供 `agent -m "..."` 一次性调用模式。

## AI 连接与工具调用机制

### AI 连接入口

项目通过 `src/agent/ai-client.ts` 连接 AI 大模型，核心流程：

1. **工厂函数** `createAIClient()` — 根据配置中的 `provider`（`"anthropic"` 或 `"openai"`）创建对应客户端。
2. **Anthropic 连接** — `createAnthropicClient()` 动态加载 `@anthropic-ai/sdk`，通过 `client.messages.create()` 发送请求。
3. **OpenAI 连接** — `createOpenAIClient()` 动态加载 `openai` SDK，通过 `client.chat.completions.create()` 发送请求。
4. **API Key 获取** — 优先读取配置文件 `agent.apiKey`，其次读取环境变量（`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`）。

### AI 如何知道用什么 Tools

AI 通过 **function calling / tool use 协议** 自主选择工具，信息来源有两层：

**① tools 参数（结构化 JSON Schema）**
- `agent-core.ts` 的 `runAgent()` 调用 `getToolDefinitions()` 获取所有已注册工具的完整定义（name + description + schema）。
- 将工具列表作为 `tools` 参数传给 `client.chat()`。
- `ai-client.ts` 将其转换为各 provider 的格式（Anthropic 的 `input_schema` / OpenAI 的 `function.parameters`）。

**② system prompt（自然语言描述）**
- `system-prompt.ts` 的 `buildToolingSection()` 在系统提示词中列出工具名和描述，帮助 AI 更好地理解工具用途。

**完整调用链路：**

```
启动 → registerBuiltinTools() 注册 7 个工具到全局 Map
  → buildSystemPrompt() 构建系统提示词（含工具描述）
  → getToolDefinitions() 获取工具列表
  → client.chat({ systemPrompt, messages, tools })  ← AI 收到工具菜单
  → AI 返回 toolCalls: [{name, input}]               ← AI 自主选择工具
  → dispatchToolCall(name, input)                     ← 按名字查 Map 执行
  → 工具执行结果反馈给 AI → AI 继续思考或返回最终回复
```

### Tool-Use Loop（工具调用循环）

`agent-core.ts` 中的 `runAgent()` 实现了完整的决策循环：

1. 用户消息发给 AI → AI 思考是否需要工具
2. 如果 AI 返回 `toolCalls` → 执行工具 → 结果反馈给 AI → 回到步骤 1
3. 如果 AI 不再调用工具 → 返回最终文本回复
4. 最多循环 `MAX_TOOL_ROUNDS`(10) 轮，防止无限调用

### 关键文件对照表

| 职责 | 文件 | 核心函数 |
|------|------|---------|
| AI 连接入口 | `src/agent/ai-client.ts` | `createAIClient()` |
| Agent 决策循环 | `src/agent/agent-core.ts` | `runAgent()` |
| 工具注册/分发 | `src/agent/tool-registry.ts` | `registerTool()` / `dispatchToolCall()` |
| 工具批量注册 | `src/agent/tools/index.ts` | `registerBuiltinTools()` |
| 系统提示词 | `src/agent/system-prompt.ts` | `buildSystemPrompt()` |

### 什么是 Agent？

Agent（智能体）不只是 tools + 描述的集合，而是由四部分组成的完整系统：

| 组成部分 | 类比 | 对应文件 | 作用 |
|---------|------|---------|------|
| AI 模型 | 大脑 | `src/agent/ai-client.ts` | 理解语言、推理、做决策 |
| System Prompt | 身份和行为指令 | `src/agent/system-prompt.ts` | 告诉大脑"你是谁、你能做什么、你该怎么做" |
| Tools | 手和脚 | `src/agent/tool-registry.ts` + `src/agent/tools/` | 实际执行操作（搜索、读文件、跑命令…） |
| 决策循环 | 神经系统 | `src/agent/agent-core.ts` `runAgent()` | 把大脑和手脚连起来，自主决定下一步 |

Tools + 描述只是其中一部分（手和脚）。真正让 Agent 区别于普通 Chatbot 的是**决策循环**。

**普通 Chatbot vs Agent 的区别：**

```
普通 Chatbot:
  用户提问 → AI 回答 → 结束

Agent（本项目）:
  用户提问 → AI 思考 → "我需要先搜索一下" → 调用 web_search 工具
           → 拿到搜索结果 → AI 继续思考 → "我还需要读一下这个文件"
           → 调用 file_read 工具 → 拿到文件内容
           → AI 最终整合所有信息 → 给用户回复
```

Agent 的核心能力是**自主决策**：AI 自己判断要不要用工具、用哪个工具、用完之后要不要继续用别的工具。

这个"思考→行动→观察→再思考"的循环就在 `agent-core.ts` 的 `runAgent()` 中：

```typescript
// 简化版决策循环
for (let round = 0; round < 10; round++) {
  // 1. 问 AI：给你这些工具，你想做什么？
  const response = await client.chat({ systemPrompt, messages, tools });

  // 2. AI 说不需要工具了 → 拿到最终回复，结束
  if (!response.toolCalls) { finalReply = response.text; break; }

  // 3. AI 说要用工具 → 执行 → 把结果告诉 AI → 回到第 1 步
  for (const tc of response.toolCalls) {
    const result = await dispatchToolCall(tc.name, tc.input);
    // 结果反馈给 AI...
  }
}
```

**总结：Agent = AI 模型 + 提示词 + 工具集 + 自主决策循环。**
这就是业界标准的 ReAct（Reasoning + Acting）模式，理解了这套 tool-use loop，
对学习其他 AI Agent 框架（如 LangChain、AutoGen）也很有帮助。

## 导入规范

- 跨包导入使用 `.js` 扩展名（ESM 要求）
- 直接导入，不使用"转发导出"的包装文件
- 仅导入类型时使用 `import type { X }`

## 测试指南

- 框架：Vitest + V8 覆盖率（60% 阈值）
- 命名：与源文件同名，后缀为 `*.test.ts`
- 修改逻辑代码后，推送前运行 `pnpm test`。

## 提交与 PR 规范

- 提交信息简洁、动作导向（例如：`browser: add form fill action`）。
- 相关改动归为一次提交；不要把无关的重构混在一起。

## 安全规范

- 永远不要提交或发布真实的 API Key、手机号或生产环境配置值。
- 文档、测试和示例中使用明显的假数据占位符。
- 浏览器：将所有页面内容视为**不可信的外部输入**。
- 使用 `src/logging/redact.ts` 自动遮蔽日志中的敏感信息。
- 使用 `src/infra/fs-safe.ts`（`openFileWithinRoot`）防止路径遍历攻击。
