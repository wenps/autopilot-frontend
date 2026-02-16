/**
 * AutoPilot DevOps AI 助手 — 浏览器版 Agent Core + DevOps Tools
 *
 * 整体流程（和 src/agent/agent-core.ts 一样的 ReAct 循环，只是跑在浏览器里）：
 *
 *   用户消息（文字/语音）
 *     → Agent 发给 AI（带 system prompt + DevOps tools 定义）
 *     → AI 决定是否调用工具（tab_switch / form_fill / form_submit / page_query）
 *     → 执行工具（直接操作 DOM）
 *     → 结果反馈给 AI → 继续思考或返回最终回复
 */

// ─────────────────────────────────────────────
// 1. DevOps Tools 定义（AI 可调用的工具）
// ─────────────────────────────────────────────

const DEVOPS_TOOLS = [
  {
    name: "tab_switch",
    description:
      "切换 DevOps 管理页面到指定的功能 Tab。可选值: deployment（部署管理）、service（服务管理）、ingress（路由管理）、configmap（配置管理）、monitor（集群监控）",
    parameters: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          enum: ["deployment", "service", "ingress", "configmap", "monitor"],
          description: "目标 Tab 名称",
        },
      },
      required: ["tab"],
    },
  },
  {
    name: "form_fill",
    description:
      "在当前 Tab 中的创建表单里填写某个字段。先用 page_query 查看当前有哪些表单字段，再使用此工具填写。",
    parameters: {
      type: "object",
      properties: {
        field: {
          type: "string",
          description: "表单字段的 name 属性（如 name、image、replicas、namespace、port、type、host、path、data 等）",
        },
        value: {
          type: "string",
          description: "要填入的值",
        },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "form_submit",
    description: "提交当前 Tab 中的创建表单。在填写完所有必要字段后调用此工具。",
    parameters: {
      type: "object",
      properties: {
        confirm: {
          type: "boolean",
          description: "是否确认提交，必须为 true",
        },
      },
      required: ["confirm"],
    },
  },
  {
    name: "page_query",
    description:
      "查询当前页面状态：当前在哪个 Tab、页面上有哪些资源列表、创建表单有哪些字段和当前值。用于了解页面上下文再决定下一步操作。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// ─────────────────────────────────────────────
// 2. Tool 执行器（操作 DOM）
// ─────────────────────────────────────────────

/**
 * 执行 tab_switch：切换到指定 Tab
 */
function executeTabSwitch(params) {
  const { tab } = params;
  const tabBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (!tabBtn) {
    return { success: false, message: `未找到 Tab: ${tab}` };
  }

  // 切换 Tab 按钮高亮
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  tabBtn.classList.add("active");

  // 切换 Tab 内容
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  const pane = document.getElementById(`tab-${tab}`);
  if (pane) pane.classList.add("active");

  // 高亮闪烁动画
  tabBtn.classList.add("highlight-flash");
  setTimeout(() => tabBtn.classList.remove("highlight-flash"), 1500);

  const tabNames = {
    deployment: "Deployment 部署管理",
    service: "Service 服务管理",
    ingress: "Ingress 路由管理",
    configmap: "ConfigMap 配置管理",
    monitor: "Monitor 集群监控",
  };
  return { success: true, message: `已切换到 ${tabNames[tab] || tab} 页面` };
}

/**
 * 执行 form_fill：填写表单字段
 */
function executeFormFill(params) {
  const { field, value } = params;
  const activePane = document.querySelector(".tab-pane.active");
  if (!activePane) {
    return { success: false, message: "当前没有活跃的 Tab" };
  }

  const input = activePane.querySelector(`[name="${field}"]`);
  if (!input) {
    // 列出当前可用字段帮助 AI
    const fields = Array.from(activePane.querySelectorAll("[name]")).map(
      (el) => el.getAttribute("name")
    );
    return {
      success: false,
      message: `未找到字段 "${field}"。当前可用字段: ${fields.join(", ")}`,
    };
  }

  // 填入值
  if (input.tagName === "SELECT") {
    const option = Array.from(input.options).find(
      (o) => o.value === value || o.textContent === value
    );
    if (option) {
      input.value = option.value;
    } else {
      return {
        success: false,
        message: `下拉框 "${field}" 没有选项 "${value}"。可选: ${Array.from(input.options).map((o) => o.value).join(", ")}`,
      };
    }
  } else {
    input.value = value;
  }

  // 高亮闪烁动画
  input.classList.add("highlight-flash");
  setTimeout(() => input.classList.remove("highlight-flash"), 1500);

  return { success: true, message: `已将 "${field}" 设置为 "${value}"` };
}

/**
 * 执行 form_submit：提交表单
 */
function executeFormSubmit(params) {
  if (!params.confirm) {
    return { success: false, message: "请设置 confirm 为 true 以确认提交" };
  }

  const activePane = document.querySelector(".tab-pane.active");
  if (!activePane) {
    return { success: false, message: "当前没有活跃的 Tab" };
  }

  const form = activePane.querySelector("form");
  if (!form) {
    return { success: false, message: "当前 Tab 没有创建表单" };
  }

  // 收集表单数据
  const formData = new FormData(form);
  const data = Object.fromEntries(formData.entries());
  const name = data.name || "unnamed";

  // 模拟创建成功：添加一行到表格
  const table = activePane.querySelector(".resource-table tbody");
  if (table) {
    const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab;
    const row = createTableRow(activeTab, data);
    if (row) {
      table.insertAdjacentHTML("beforeend", row);
      // 高亮新行
      const newRow = table.lastElementChild;
      newRow.classList.add("highlight-flash");
      setTimeout(() => newRow.classList.remove("highlight-flash"), 1500);
    }
  }

  // 重置表单
  form.reset();

  return {
    success: true,
    message: `✅ 资源 "${name}" 创建成功！（Demo 模拟）`,
    data,
  };
}

/**
 * 根据 Tab 类型生成表格行 HTML
 */
function createTableRow(tab, data) {
  switch (tab) {
    case "deployment":
      return `<tr>
        <td>${data.name || "—"}</td>
        <td>${data.image || "—"}</td>
        <td>0/${data.replicas || 1}</td>
        <td><span class="status-badge status-pending">Pending</span></td>
      </tr>`;
    case "service":
      return `<tr>
        <td>${data.name || "—"}</td>
        <td>${data.type || "ClusterIP"}</td>
        <td>${data.port || 80}:${data.targetPort || 80}</td>
        <td>10.96.0.${Math.floor(Math.random() * 200) + 30}</td>
      </tr>`;
    case "ingress":
      return `<tr>
        <td>${data.name || "—"}</td>
        <td>${data.host || "—"}</td>
        <td>${data.path || "/"}</td>
        <td>${data.backendService || "—"}</td>
      </tr>`;
    case "configmap":
      const keyCount = (data.data || "").split("\n").filter((l) => l.trim()).length;
      return `<tr>
        <td>${data.name || "—"}</td>
        <td>${keyCount}</td>
        <td>default</td>
      </tr>`;
    default:
      return null;
  }
}

/**
 * 执行 page_query：查询当前页面状态
 */
function executePageQuery() {
  const activeTabBtn = document.querySelector(".tab-btn.active");
  const activeTab = activeTabBtn?.dataset.tab || "unknown";
  const activePane = document.querySelector(".tab-pane.active");

  // 获取资源列表
  const resources = [];
  if (activePane) {
    const rows = activePane.querySelectorAll(".resource-table tbody tr");
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td")).map((td) => td.textContent.trim());
      resources.push(cells);
    });
  }

  // 获取表单字段及当前值
  const formFields = [];
  if (activePane) {
    const form = activePane.querySelector("form");
    if (form) {
      form.querySelectorAll("[name]").forEach((el) => {
        const field = {
          name: el.getAttribute("name"),
          type: el.tagName === "SELECT" ? "select" : el.type || "text",
          currentValue: el.value,
        };
        if (el.tagName === "SELECT") {
          field.options = Array.from(el.options).map((o) => o.value);
        }
        formFields.push(field);
      });
    }
  }

  const tabNames = {
    deployment: "Deployment 部署管理",
    service: "Service 服务管理",
    ingress: "Ingress 路由管理",
    configmap: "ConfigMap 配置管理",
    monitor: "Monitor 集群监控",
  };

  return {
    currentTab: activeTab,
    currentTabName: tabNames[activeTab] || activeTab,
    availableTabs: ["deployment", "service", "ingress", "configmap", "monitor"],
    resourceCount: resources.length,
    resources,
    formFields,
  };
}

/**
 * 工具分发器 — 根据工具名执行对应函数
 */
function dispatchTool(name, params) {
  switch (name) {
    case "tab_switch":
      return executeTabSwitch(params);
    case "form_fill":
      return executeFormFill(params);
    case "form_submit":
      return executeFormSubmit(params);
    case "page_query":
      return executePageQuery();
    default:
      return { success: false, message: `未知工具: ${name}` };
  }
}

// ─────────────────────────────────────────────
// 3. System Prompt（告诉 AI 它是谁、会什么）
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `你是 AutoPilot DevOps AI 助手，嵌入在一个 Kubernetes DevOps 管理平台中。

## 你的能力
你可以通过工具操作当前页面，帮用户完成 DevOps 任务：
- 切换到不同的功能页面（Deployment、Service、Ingress、ConfigMap、Monitor）
- 在创建表单中填写字段
- 提交表单创建资源
- 查询当前页面状态

## 工作流程
1. 用户说出需求后，先用 page_query 了解当前页面状态
2. 如果需要切换 Tab，用 tab_switch
3. 逐个字段用 form_fill 填写表单
4. 所有字段填完后，用 form_submit 提交
5. 每一步都给用户简短的中文反馈

## 注意事项
- 用中文和用户交流
- 操作前先查询页面状态，不要盲目操作
- 每次只做用户要求的事，不要自作主张
- 如果用户的要求不明确，主动询问缺失的信息
- 提交表单前告诉用户你将要提交什么内容`;

// ─────────────────────────────────────────────
// 4. AI Client（浏览器版，直接 fetch 调用）
// ─────────────────────────────────────────────

/**
 * 调用 Anthropic Claude API
 */
async function callAnthropic(apiKey, model, systemPrompt, messages, tools) {
  // 转换工具格式为 Anthropic 格式
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));

  // 转换消息格式
  const anthropicMessages = [];
  for (const m of messages) {
    if (m.role === "user") {
      anthropicMessages.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (m.tool_calls?.length) {
        const content = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.tool_calls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }
        anthropicMessages.push({ role: "assistant", content });
      } else {
        anthropicMessages.push({ role: "assistant", content: m.content });
      }
    } else if (m.role === "tool") {
      anthropicMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: m.tool_call_id,
            content: m.content,
          },
        ],
      });
    }
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      tools: anthropicTools,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API 错误 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();

  // 解析响应
  const text = data.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const toolCalls = data.content
    ?.filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, input: b.input }));

  return { text, toolCalls: toolCalls?.length ? toolCalls : null };
}

/**
 * 调用 OpenAI GPT API
 */
async function callOpenAI(apiKey, model, systemPrompt, messages, tools) {
  const openaiTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const openaiMessages = [{ role: "system", content: systemPrompt }];
  for (const m of messages) {
    if (m.role === "tool") {
      openaiMessages.push({
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content,
      });
    } else if (m.role === "assistant" && m.tool_calls?.length) {
      openaiMessages.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        })),
      });
    } else {
      openaiMessages.push({ role: m.role, content: m.content });
    }
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o",
      messages: openaiMessages,
      tools: openaiTools,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API 错误 (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];

  const toolCalls = choice?.message?.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments),
  }));

  return {
    text: choice?.message?.content || "",
    toolCalls: toolCalls?.length ? toolCalls : null,
  };
}

// ─────────────────────────────────────────────
// 5. Agent 决策循环（浏览器版 runAgent）
// ─────────────────────────────────────────────

const MAX_ROUNDS = 10;

/**
 * 运行 Agent — 和 src/agent/agent-core.ts 的 runAgent 同样的逻辑
 *
 *   发消息给 AI → 检查是否有 tool_call → 执行工具 → 反馈结果 → 循环
 */
async function runAgent(userMessage, { apiKey, provider, onToolCall, onThinking }) {
  const messages = [{ role: "user", content: userMessage }];

  const callAI = provider === "openai" ? callOpenAI : callAnthropic;
  const model =
    provider === "openai" ? "gpt-4o" : "claude-sonnet-4-20250514";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    onThinking?.(`思考中${round > 0 ? `（第 ${round + 1} 轮）` : ""}...`);

    // 调用 AI
    const response = await callAI(apiKey, model, SYSTEM_PROMPT, messages, DEVOPS_TOOLS);

    // 没有工具调用 → 返回最终回复
    if (!response.toolCalls) {
      return response.text || "（无回复）";
    }

    // 有工具调用 → 执行每个工具
    // 先把 AI 的回复（含 tool_call）加到消息历史
    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls,
    });

    for (const tc of response.toolCalls) {
      onToolCall?.(tc.name, tc.input);

      // 执行工具（操作 DOM）
      const result = dispatchTool(tc.name, tc.input);

      // 把工具结果加到消息历史
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
    // 继续下一轮，让 AI 根据工具结果继续思考...
  }

  return "（超过最大轮次限制）";
}

// ─────────────────────────────────────────────
// 6. UI 交互逻辑
// ─────────────────────────────────────────────

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const voiceBtn = document.getElementById("voiceBtn");
const apiKeyInput = document.getElementById("apiKeyInput");
const providerSelect = document.getElementById("providerSelect");

/** 添加聊天消息到面板 */
function addMessage(type, text) {
  const div = document.createElement("div");
  div.className = `msg msg-${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

/** 移除消息 */
function removeMessage(el) {
  el?.remove();
}

/** Tab 切换（手动点击） */
document.getElementById("tabBar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${tab}`)?.classList.add("active");
});

/** 表单提交拦截（手动点击创建按钮时） */
document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const pane = form.closest(".tab-pane");
    const tab = document.querySelector(".tab-btn.active")?.dataset.tab;
    const table = pane?.querySelector(".resource-table tbody");
    if (table) {
      const row = createTableRow(tab, data);
      if (row) {
        table.insertAdjacentHTML("beforeend", row);
        const newRow = table.lastElementChild;
        newRow.classList.add("highlight-flash");
        setTimeout(() => newRow.classList.remove("highlight-flash"), 1500);
      }
    }
    form.reset();
    addMessage("assistant", `✅ 资源 "${data.name || "unnamed"}" 创建成功！`);
  });
});

/** 发送消息 */
let isProcessing = false;

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isProcessing) return;

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    addMessage("assistant", "⚠️ 请先在右上角输入 API Key。");
    return;
  }

  isProcessing = true;
  sendBtn.disabled = true;
  chatInput.value = "";

  addMessage("user", text);

  let thinkingMsg = null;

  try {
    const reply = await runAgent(text, {
      apiKey,
      provider: providerSelect.value,
      onThinking(msg) {
        if (thinkingMsg) removeMessage(thinkingMsg);
        thinkingMsg = addMessage("thinking", msg);
      },
      onToolCall(name, input) {
        const toolNames = {
          tab_switch: "🔄 切换 Tab",
          form_fill: "✏️ 填写表单",
          form_submit: "📤 提交表单",
          page_query: "🔍 查询页面",
        };
        const label = toolNames[name] || name;
        const detail =
          name === "tab_switch"
            ? `→ ${input.tab}`
            : name === "form_fill"
              ? `→ ${input.field} = "${input.value}"`
              : name === "form_submit"
                ? "→ 确认提交"
                : "→ 获取页面状态";
        addMessage("tool", `${label} ${detail}`);
      },
    });

    if (thinkingMsg) removeMessage(thinkingMsg);
    addMessage("assistant", reply);
  } catch (err) {
    if (thinkingMsg) removeMessage(thinkingMsg);
    addMessage("assistant", `❌ 出错了: ${err.message}`);
  } finally {
    isProcessing = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

sendBtn.addEventListener("click", sendMessage);
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ─────────────────────────────────────────────
// 7. 语音输入（浏览器原生 Web Speech API）
// ─────────────────────────────────────────────

let recognition = null;
let isRecording = false;

// 检测浏览器是否支持语音识别
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const lastResult = event.results[event.results.length - 1];
    const transcript = lastResult[0].transcript;

    if (lastResult.isFinal) {
      chatInput.value = transcript;
      stopRecording();
      // 自动发送
      sendMessage();
    } else {
      chatInput.value = transcript + "...";
    }
  };

  recognition.onerror = (event) => {
    console.error("语音识别错误:", event.error);
    stopRecording();
    if (event.error === "not-allowed") {
      addMessage("assistant", "⚠️ 请允许麦克风权限后重试。");
    }
  };

  recognition.onend = () => {
    stopRecording();
  };
} else {
  voiceBtn.disabled = true;
  voiceBtn.title = "当前浏览器不支持语音识别";
}

function startRecording() {
  if (!recognition || isRecording) return;
  isRecording = true;
  voiceBtn.classList.add("recording");
  chatInput.placeholder = "正在听你说...";
  recognition.start();
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  voiceBtn.classList.remove("recording");
  chatInput.placeholder = "输入消息，或点击麦克风语音输入...";
  try {
    recognition?.stop();
  } catch {}
}

voiceBtn.addEventListener("click", () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// ─────────────────────────────────────────────
// 8. API Key 本地缓存（方便调试）
// ─────────────────────────────────────────────

const STORAGE_KEY = "autopilot_demo_config";

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const config = JSON.parse(saved);
      if (config.apiKey) apiKeyInput.value = config.apiKey;
      if (config.provider) providerSelect.value = config.provider;
    }
  } catch {}
}

function saveConfig() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiKey: apiKeyInput.value,
        provider: providerSelect.value,
      })
    );
  } catch {}
}

apiKeyInput.addEventListener("change", saveConfig);
providerSelect.addEventListener("change", saveConfig);

// 页面加载时恢复配置
loadConfig();
