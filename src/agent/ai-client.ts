/**
 * AI client abstraction — supports Anthropic and OpenAI.
 * Pattern from OpenClaw's multi-provider support in src/agents/model-auth.ts
 */
import type { AutoPilotConfig } from "../config/config.js";
import type { ToolDefinition } from "./tool-registry.js";

export type AIToolCall = {
  id: string;
  name: string;
  input: unknown;
};

export type AIMessage = {
  role: "user" | "assistant" | "tool" | "system";
  content: string | Array<{ toolCallId: string; result: string }>;
  toolCalls?: AIToolCall[];
};

export type AIChatResponse = {
  text?: string;
  toolCalls?: AIToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
};

export type AIClient = {
  chat(params: {
    systemPrompt: string;
    messages: AIMessage[];
    tools?: ToolDefinition[];
  }): Promise<AIChatResponse>;
};

export type AIClientConfig = {
  provider: string;
  model: string;
  config: AutoPilotConfig;
};

/**
 * AI 客户端工厂函数 —— 项目连接 AI 的入口。
 * 根据配置中的 provider 字段（"anthropic" 或 "openai"）创建对应的 AI 客户端实例。
 * 调用方通过返回的 AIClient.chat() 方法与大模型交互。
 */
export function createAIClient(params: AIClientConfig): AIClient {
  const { provider } = params;

  switch (provider) {
    case "anthropic":
      return createAnthropicClient(params);
    case "openai":
      return createOpenAIClient(params);
    default:
      throw new Error(`Unknown AI provider: ${provider}. Supported: anthropic, openai`);
  }
}

// ─── Anthropic Client ───

/**
 * 创建 Anthropic（Claude）客户端。
 * 1. 动态 import SDK，避免未安装时启动报错。
 * 2. 优先使用配置文件中的 apiKey，其次读取环境变量 ANTHROPIC_API_KEY。
 * 3. 将内部统一的 messages/tools 格式转换为 Anthropic API 所需的格式。
 * 4. 调用 client.messages.create() 发送请求，解析返回的文本和工具调用。
 */
function createAnthropicClient(params: AIClientConfig): AIClient {
  return {
    async chat({ systemPrompt, messages, tools }) {
      // 动态加载 Anthropic SDK
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      // 获取 API Key：配置文件优先，环境变量兜底
      const apiKey = params.config.agent?.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

      // 使用 API Key 实例化 Anthropic 客户端
      const client = new Anthropic({ apiKey });

      // 将统一的 ToolDefinition 转换为 Anthropic 工具格式
      const anthropicTools = tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.schema as Record<string, unknown>,
      }));

      // 将统一消息格式转换为 Anthropic 消息格式（tool_result / tool_use 等）
      const anthropicMessages = messages
        .filter((m) => m.role !== "system")
        .map((m) => {
          if (m.role === "tool" && Array.isArray(m.content)) {
            return {
              role: "user" as const,
              content: m.content.map((tc) => ({
                type: "tool_result" as const,
                tool_use_id: tc.toolCallId,
                content: tc.result,
              })),
            };
          }
          if (m.role === "assistant" && m.toolCalls?.length) {
            const content: Array<Record<string, unknown>> = [];
            if (m.content && typeof m.content === "string") {
              content.push({ type: "text", text: m.content });
            }
            for (const tc of m.toolCalls) {
              content.push({
                type: "tool_use",
                id: tc.id,
                name: tc.name,
                input: tc.input,
              });
            }
            return { role: "assistant" as const, content };
          }
          return {
            role: m.role as "user" | "assistant",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          };
        });

      // 核心调用：向 Anthropic API 发送聊天请求
      const response = await client.messages.create({
        model: params.model,
        max_tokens: params.model.includes("opus") ? 16384 : 8192,
        system: systemPrompt,
        messages: anthropicMessages as any,
        tools: anthropicTools as any,
      });

      // 从响应中提取纯文本内容
      const text = response.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");

      // 从响应中提取工具调用（function calling）
      const toolCalls = response.content
        .filter((b: any) => b.type === "tool_use")
        .map((b: any) => ({
          id: b.id,
          name: b.name,
          input: b.input,
        }));

      return {
        text: text || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage: response.usage
          ? { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
          : undefined,
      };
    },
  };
}

// ─── OpenAI Client ───

/**
 * 创建 OpenAI（GPT）客户端。
 * 1. 动态 import SDK，避免未安装时启动报错。
 * 2. 优先使用配置文件中的 apiKey，其次读取环境变量 OPENAI_API_KEY。
 * 3. 将内部统一的 messages/tools 格式转换为 OpenAI API 所需的格式。
 * 4. 调用 client.chat.completions.create() 发送请求，解析返回的文本和工具调用。
 */
function createOpenAIClient(params: AIClientConfig): AIClient {
  return {
    async chat({ systemPrompt, messages, tools }) {
      // 动态加载 OpenAI SDK
      const OpenAI = (await import("openai")).default;
      // 获取 API Key：配置文件优先，环境变量兜底
      const apiKey = params.config.agent?.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

      // 使用 API Key 实例化 OpenAI 客户端
      const client = new OpenAI({ apiKey });

      // 将统一的 ToolDefinition 转换为 OpenAI function calling 格式
      const openaiTools = tools?.map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.schema as Record<string, unknown>,
        },
      }));

      // 构建 OpenAI 消息数组，system prompt 作为第一条 system 消息
      const openaiMessages: Array<Record<string, unknown>> = [
        { role: "system", content: systemPrompt },
      ];

      // 将统一消息格式转换为 OpenAI 消息格式（tool / tool_calls 等）
      for (const m of messages) {
        if (m.role === "tool" && Array.isArray(m.content)) {
          for (const tc of m.content) {
            openaiMessages.push({
              role: "tool",
              tool_call_id: tc.toolCallId,
              content: tc.result,
            });
          }
        } else if (m.role === "assistant" && m.toolCalls?.length) {
          openaiMessages.push({
            role: "assistant",
            content: typeof m.content === "string" ? m.content : null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          });
        } else {
          openaiMessages.push({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          });
        }
      }

      // 核心调用：向 OpenAI API 发送聊天补全请求
      const response = await client.chat.completions.create({
        model: params.model,
        messages: openaiMessages as any,
        tools: openaiTools,
      });

      // 解析响应：提取第一个 choice 中的文本和工具调用
      const choice = response.choices[0];
      const toolCalls = choice?.message?.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments),
      }));

      return {
        text: choice?.message?.content ?? undefined,
        toolCalls: toolCalls?.length ? toolCalls : undefined,
        usage: response.usage
          ? {
              inputTokens: response.usage.prompt_tokens ?? 0,
              outputTokens: response.usage.completion_tokens ?? 0,
            }
          : undefined,
      };
    },
  };
}
