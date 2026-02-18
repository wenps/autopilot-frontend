/**
 * Agent Core — AI 决策循环（Tool-Use Loop）。
 *
 * 这是整个项目最核心的文件，实现了 AI Agent 的"大脑"：
 *
 *   用户消息 → AI 思考 → 需要工具？ ──是──→ 执行工具 → 结果反馈给 AI → 继续思考
 *                          │
 *                          否
 *                          ↓
 *                       返回最终回复
 *
 * 整个循环最多执行 MAX_TOOL_ROUNDS (10) 轮，防止 AI 无限调用工具。
 */
import type { AutoPilotConfig } from "../config/config.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { getToolDefinitions, dispatchToolCall, type ToolCallResult } from "./tool-registry.js";
import { createAIClient, type AIMessage, type AIToolCall } from "./ai-client.js";
import { registerBuiltinTools } from "../tools/node/index.js";

// ─── 默认值 ───

/** 默认 AI 提供商 */
export const DEFAULT_PROVIDER = "copilot";
/** 默认模型（GitHub Models 可用：gpt-4o, gpt-4o-mini, o3-mini） */
export const DEFAULT_MODEL = "gpt-4o";
/** 默认上下文窗口大小（token 数） */
export const DEFAULT_CONTEXT_TOKENS = 200_000;

/**
 * Agent 运行参数 — 调用 runAgent() 时传入。
 */
export type AgentRunParams = {
  /** 用户发送的自然语言消息 */
  message: string;
  /** AI 思考深度: off | low | medium | high */
  thinkingLevel?: string;
  /** 模型 ID 覆盖，如 "claude-sonnet-4-20250514" */
  model?: string;
  /** AI 提供商: "anthropic" | "openai" | "copilot" */
  provider: string;
  /** 完整配置对象 */
  config: AutoPilotConfig;
  /** 干运行模式：AI 请求调用工具时只打印配置，不实际执行 */
  dryRun?: boolean;
};

/**
 * Agent 运行结果 — runAgent() 的返回值。
 */
export type AgentRunResult = {
  /** AI 的最终文本回复 */
  reply: string;
  /** 所有工具调用记录（名称、输入参数、执行结果） */
  toolCalls: Array<{ name: string; input: unknown; result: ToolCallResult }>;
  /** 实际使用的模型 ID */
  model: string;
  /** 总消耗 token 数（如可获取） */
  tokensUsed?: number;
};

/** 最大工具调用轮次，防止 AI 陷入无限循环 */
const MAX_TOOL_ROUNDS = 10;

/**
 * 运行 Agent 核心循环。
 *
 * 完整流程：
 * 1. 注册所有内置工具（exec、browser、web_search、web_fetch、file_read/write/list_dir）
 * 2. 创建 AI 客户端（Anthropic 或 OpenAI）
 * 3. 构建系统提示词（身份 + 工具描述 + 技能 + 运行时信息）
 * 4. 进入循环：发送消息给 AI → 检查是否返回 tool_call → 执行工具 → 反馈结果 → 继续
 * 5. 当 AI 不再需要调用工具时，返回最终文本回复
 */
export async function runAgent(params: AgentRunParams): Promise<AgentRunResult> {
  const { message, thinkingLevel, model, provider, config } = params;

  // 步骤 1：注册所有内置工具（幂等，只执行一次）
  registerBuiltinTools();

  // 步骤 2：创建 AI 客户端
  const resolvedModel = model ?? DEFAULT_MODEL;
  const client = createAIClient({ provider, model: resolvedModel, config });

  // 步骤 3：构建系统提示词（告诉 AI 它是谁、有哪些工具可用）
  const systemPrompt = buildSystemPrompt({ config, thinkingLevel });
  const tools = getToolDefinitions();

  // 对话历史数组 — 每轮会追加 AI 回复和工具执行结果
  const messages: AIMessage[] = [
    { role: "user", content: message },
  ];

  // 记录所有工具调用（最终返回给调用方）
  const allToolCalls: AgentRunResult["toolCalls"] = [];
  let finalReply = "";

  // 步骤 4：Tool-Use Loop — 最多循环 10 轮
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // 4a. 调用 AI 模型（发送系统提示 + 对话历史 + 可用工具列表）
    const response = await client.chat({
      systemPrompt,
      messages,
      tools,
    });

    // 4b. 如果 AI 没有请求调用任何工具 → 循环结束，拿到最终回复
    if (!response.toolCalls || response.toolCalls.length === 0) {
      finalReply = response.text ?? "";
      break;
    }

    // 4b-dry. 干运行模式：只打印工具调用配置，不实际执行
    if (params.dryRun) {
      if (response.text) {
        finalReply = response.text + "\n\n";
      }
      finalReply += "🔧 AI 请求调用以下工具（dry-run 模式，未执行）：\n";
      for (const tc of response.toolCalls) {
        finalReply += `\n┌─ 工具: ${tc.name}\n`;
        finalReply += `│  ID:   ${tc.id}\n`;
        finalReply += `│  参数:\n`;
        const inputStr = JSON.stringify(tc.input, null, 2);
        for (const line of inputStr.split("\n")) {
          finalReply += `│    ${line}\n`;
        }
        finalReply += `└────────────────────\n`;
      }
      break;
    }

    // 4c. AI 请求调用工具 → 逐个执行
    const toolResults: Array<{ toolCallId: string; result: string }> = [];

    for (const tc of response.toolCalls) {
      // 通过 tool-registry 分发：根据工具名找到对应的 execute 函数并执行
      const result = await dispatchToolCall(tc.name, tc.input);
      allToolCalls.push({ name: tc.name, input: tc.input, result });
      toolResults.push({
        toolCallId: tc.id,
        result: typeof result.content === "string" ? result.content : JSON.stringify(result.content),
      });
    }

    // 4d. 将 AI 的回复（含 tool_call）和工具执行结果追加到对话历史
    //     这样下一轮 AI 就能看到工具返回的信息
    messages.push({
      role: "assistant",
      content: response.text ?? "",
      toolCalls: response.toolCalls,
    });

    messages.push({
      role: "tool",
      content: toolResults,
    });
    // 然后回到循环顶部，AI 根据工具结果继续思考...
  }

  // 步骤 5：返回最终结果
  return {
    reply: finalReply,
    toolCalls: allToolCalls,
    model: resolvedModel,
  };
}
