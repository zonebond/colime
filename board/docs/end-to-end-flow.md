# 端到端流程：对话 → 执行 → 错误 → Board 渲染

> Runtime (Agent Engine, :10011) + Board (React SPA, :10001) 的完整数据流

## 全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│  BOARD (React SPA, :10001)                                          │
│  ChatPage.jsx → useChatModel() → sendMessage()                     │
│       │                                                             │
│       ▼                                                             │
│  chats.service.js:376  streamChatConversation()                    │
│    fetch('/conversations/stream', { method: 'POST', body })        │
│    Accept: text/event-stream                                       │
│       │  ──── Vite proxy /runtime → :10011 ────▶                   │
└───────┼─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RUNTIME (Agent Engine, :10011)                                      │
│  conversation/index.js:233  POST /stream                            │
│    ├─ 解析输入, 创建 userMessage                                    │
│    ├─ writeSseEvent('user_message', userMessage) ──▶ Board         │
│    ├─ buildRuntimeContract() → 构建 agent 需要的完整上下文        │
│    └─ for await (event of executeRuntimeStream(...)):              │
│         writeSseEvent(event.type, event) ──▶ Board                 │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  service.js:11  executeRuntimeStream() — 生成器                     │
│    ├─ resolveModelProvider() → 获取 AI provider                     │
│    ├─ buildFullSystemPrompt() → 组装 system prompt                 │
│    ├─ provider.buildInitialMessages() → 初始化 messages            │
│    ├─ yield RUN_STARTED ──▶ Board                                  │
│    │                                                                │
│    └─ for await (event of executeAgentLoop(...)):                  │
│         yield event ──▶ Board  (逐个转发)                          │
│                                                                    │
│    Loop 结束后, 根据 lastResult.agentState:                        │
│      ┌─ 'stopped'  → yield RUN_CANCELLED                          │
│      ├─ 'failed'   → yield RUN_FAILED { error, errorCode }        │
│      └─ otherwise  → yield RUN_COMPLETED                          │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  agentExecutor.js:267  executeAgentLoop() — 核心执行循环            │
│                                                                    │
│  初始化:                                                            │
│    yield AGENT_STARTED → AGENT_THINKING → THINKING_STARTED         │
│                                                                    │
│  ┌─ 主循环 while (iteration < maxSteps) ────────────────────────┐  │
│  │                                                              │  │
│  │  ① provider.executeTurn() → 调用 AI 模型                     │  │
│  │     ├─ 流式输出 → yield message_delta (逐 token)             │  │
│  │     └─ 返回 turnResult = { finalText, toolUses[] }           │  │
│  │                                                              │  │
│  │  ② 无 toolUses → 自然语言回复 → 跳出循环                    │  │
│  │                                                              │  │
│  │  ③ 有 toolUses → StreamingToolExecutor 批量执行             │  │
│  │     ├─ 权限检查: ALLOW / ASK(需确认) / DENY                  │  │
│  │     ├─ 确认需求 → yield tool_confirm_required ──▶ Board     │  │
│  │     │         Board 弹窗 → 用户确认/拒绝                     │  │
│  │     ├─ 熔断器检查: circuit breaker 是否 open                 │  │
│  │     ├─ 预算检查: toolCallBudget <= 0?                        │  │
│  │     │                                                        │  │
│  │     └─ 逐工具执行:                                           │  │
│  │        yield tool_started ──▶ Board                          │  │
│  │        executeTool(name, input)                              │  │
│  │          ├─ 去重检查 (只读工具)                              │  │
│  │          │   └─ 命中 → yield tool_deduped ──▶ Board         │  │
│  │          ├─ 输入校验 (schema)                               │  │
│  │          ├─ 文件新鲜度检查 (破坏性工具)                      │  │
│  │          ├─ tool.execute(input) → 实际执行                   │  │
│  │          │   ├─ 重试逻辑 (可重试错误, maxRetries)           │  │
│  │          │   └─ 流式进度 → yield tool_progress ──▶ Board    │  │
│  │          └─ 返回 { content, isError, durationMs }           │  │
│  │                                                              │  │
│  │        工具结果:                                              │  │
│  │          isError=false → circuitBreaker.recordSuccess()      │  │
│  │          isError=true  → circuitBreaker.recordFailure()      │  │
│  │                     + 设置 isToolError: true                  │  │
│  │                                                              │  │
│  │        yield tool_finished ──▶ Board                         │  │
│  │                                                              │  │
│  │  ④ 工具结果追加到 messages → 下一轮 iteration               │  │
│  │     AI 模型看到工具结果后继续推理...                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  正常完成:                                                         │
│    ┌─ 无 finalText 但有工具结果 → summary turn (让 AI 总结)       │
│    ├─ yield MESSAGE_DONE { content } ──▶ Board                   │
│    └─ yield AGENT_COMPLETED ──▶ Board                             │
│    return { agentState: 'completed' }                             │
│                                                                    │
│  错误处理 (catch block):                                          │
│    ┌─ AbortError → yield AGENT_STOPPED → RUN_CANCELLED            │
│    │                                                              │
│    ├─ TOOL_ERROR (isToolError: true):                             │
│    │   尝试 recovery turn (allowedTools: [], AI 无工具可用)       │
│    │   ├─ AI 生成了自然语言解释 → AGENT_COMPLETED → RUN_COMPLETED│
│    │   └─ AI 也无法回复 → 降级到 FALLBACK 处理                   │
│    │                                                              │
│    └─ PROVIDER/SYSTEM/TIMEOUT 错误:                               │
│        yield MESSAGE_DONE { errorCode, errorCategory }            │
│        yield AGENT_FAILED                                         │
│        return { agentState: 'failed' } → RUN_FAILED              │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  conversation/index.js — 持久化 & 最终 SSE                        │
│                                                                    │
│  成功路径:                                                         │
│    ├─ createMessage() → 写入 DB                                    │
│    ├─ updateChatActivity()                                         │
│    └─ writeSseEvent('conversation_persisted', {                    │
│         chat, assistantMessage                                     │
│       }) ──▶ Board  ← 原子替换, 无缝切换                          │
│                                                                    │
│  失败路径:                                                          │
│    └─ writeSseEvent('run_failed', {                                │
│         error, errorCode, errorCategory, statusCode                │
│       }) ──▶ Board                                                │
│                                                                    │
│  reply.raw.end()                                                   │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BOARD — SSE 消费 & 渲染                                           │
│                                                                    │
│  ① parseSseStream() — 逐块解析 SSE 文本流                          │
│     chunk → buffer → 按 \n\n 分割 → parseSseEvent()               │
│     返回 { event: 'run_failed', data: {...} }                     │
│                                                                    │
│  ② attachRuntimeHandler() — 100ms 合并缓冲                        │
│     ├─ 非终止事件 (message_delta, tool_started...)                │
│     │   → buffer 排队, 100ms 后批量刷新                           │
│     ├─ 终止事件 (run_completed/failed/cancelled, persisted)       │
│     │   → 立即刷新 buffer + 立即应用终止事件                     │
│     └─ 减少重渲染: N events/batch → ~~10Hz 更新频率              │
│                                                                    │
│  ③ applyRuntimeEventToChat() — 事件 → 状态                       │
│     ┌─ thinking_started → thinkingState = 'active'               │
│     ├─ tool_started → 添加 tool step (state: active)              │
│     ├─ tool_finished → 更新 step (state: done, result)            │
│     ├─ message_delta → 追加 text delta                            │
│     ├─ message_done → 定稿 content                               │
│     ├─ conversation_persisted → 原子替换 contentBlocks            │
│     ├─ run_completed → status = done                              │
│     ├─ run_cancelled → stopReason = 'cancelled'                   │
│     └─ run_failed → status = 'error' + errorCode 映射            │
│                                                                    │
│  ④ ERROR_CODE_MAP (chats.hooks.js):                               │
│     provider_error → 'PROVIDER_ERROR'                             │
│     tool_error     → 'TOOL_ERROR'                                 │
│     timeout_error  → 'TIMEOUT'                                    │
│     system_error   → 'SYSTEM_ERROR'                               │
│                                                                    │
│  ⑤ ERROR_CODE_TO_I18N_KEY (ChatPage.jsx):                         │
│     PROVIDER_ERROR → 'providerError'                              │
│     TOOL_ERROR     → 'toolError'                                  │
│     TIMEOUT         → 'timeout'                                   │
│     SYSTEM_ERROR   → 'systemError'                                │
│     (无映射)       → 显示原始 errorMessage                        │
│                                                                    │
│  ⑥ getErrorMessage() → i18n 文本                                   │
│     "toolError" → "A tool encountered an error while processing…" │
│     "providerError" → "No AI provider is available…"              │
│                                                                    │
│  ⑦ AssistantMessageRow 渲染:                                       │
│     ┌─ status === 'loading' → "Thinking…" pill                    │
│     ├─ status === 'error'  → 错误 pill + getErrorMessage()        │
│     │   + ThinkingBlock (如有 tool steps)                         │
│     │     └─ ToolResultBlock 逐一渲染每个工具                    │
│     ├─ status === 'done'   → AssistantBlocks                      │
│     │   └─ contentBlocks.map():                                  │
│     │     ├─ thinking → ThinkingBlock (可折叠)                   │
│     │     ├─ text → AssistantMarkdown (react-markdown)            │
│     │     └─ tool_result → ToolResultBlock (可展开)              │
│     └─ stopReason === 'cancelled' → "Stopped" pill               │
│                                                                    │
│  ⑧ conversation_persisted 达到时:                                  │
│     原子替换 message.contentBlocks → 持久化数据成为唯一权威      │
│     之前的乐观更新状态被完全替换                                   │
└─────────────────────────────────────────────────────────────────────┘
```

## SSE 事件类型参考

| 事件 | 发出位置 | Payload |
|------|----------|---------|
| `run_started` | service.js:92 | `{ runId, chatId, projectId, model, mode }` |
| `agent_started` | agentExecutor.js:302 | `{ runId, agentId, parentRunId }` |
| `agent_thinking` | agentExecutor.js:311 | `{ runId, agentId, parentRunId }` |
| `thinking_started` | agentExecutor.js:317 | `{ runId, agentId? }` |
| `thinking_step` | (from provider) | `{ runId, agentId?, delta }` |
| `message_delta` | agentExecutor.js:489 | `{ runId, agentId?, delta }` |
| `tool_started` | agentExecutor.js:708 | `{ runId, tool: { id, name, label, input } }` |
| `tool_executing_early` | agentExecutor.js:437 | `{ runId, tool: { id, name, label } }` |
| `tool_confirm_required` | agentExecutor.js:665 | `{ runId, tool: { id, name, label, input }, agentId? }` |
| `tool_progress` | agentExecutor.js:616 | `{ runId, tool: { id, progress }, agentId? }` |
| `tool_deduped` | agentExecutor.js:728 | `{ runId, tool: { id, name }, dedupType, agentId? }` |
| `tool_finished` | agentExecutor.js:777 | `{ runId, tool: { id, name, label, status, input, result, output, durationMs }, agentId? }` |
| `message_done` | agentExecutor.js:916,936 | `{ runId, agentId?, message: { role, content, providerContentBlocks?, errorCode?, errorCategory?, statusCode? } }` |
| `agent_completed` | agentExecutor.js:927 | `{ runId, agentId, parentRunId, status, finalText }` |
| `agent_failed` | agentExecutor.js:1149 | `{ runId, agentId, parentRunId, status, error, errorCategory, errorCode, statusCode, terminationReason }` |
| `agent_stopped` | agentExecutor.js:1030 | `{ runId, agentId, parentRunId, status, reason, errorCategory, errorCode, statusCode }` |
| `run_completed` | service.js:136 | `{ runId, status: 'completed' }` |
| `run_failed` | service.js:127 | `{ runId, status: 'failed', error, errorCode, errorCategory, statusCode }` |
| `run_cancelled` | service.js:121 | `{ runId, status: 'cancelled', reason }` |
| `conversation_persisted` | conversation/index.js:341 | `{ chat, assistantMessage }` — 仅成功路径 |

**Agent 子工作流事件** (带 `agent_` 前缀的工具事件):

| 事件 | 发出位置 | Payload |
|------|----------|---------|
| `agent_message_delta` | agentExecutor.js:485 | `{ runId, agentId, delta, ...value }` |
| `agent_tool_started` | agentExecutor.js:706 | `{ runId, agentId, tool: { id, name, label, input } }` |
| `agent_tool_finished` | agentExecutor.js:775 | `{ runId, agentId, tool: { id, name, label, status, input, result, output, durationMs } }` |
| `agent_tool_progress` | agentExecutor.js:614 | `{ runId, agentId, tool: { id, progress } }` |
| `agent_tool_deduped` | agentExecutor.js:726 | `{ runId, agentId, tool: { id, name }, dedupType }` |

## 错误分类链

```
Runtime 抛出错误
    │
    ▼
categorizeError(error)  —  agentExecutor.js:128
    │
    ├─ ETIMEDOUT / ESOCKETTIMEDOUT / TIMEOUT      → TIMEOUT_ERROR
    ├─ ECONNREFUSED / ECONNRESET / NETWORK_ERROR  → PROVIDER_ERROR
    ├─ SERVICE_UNAVAILABLE / SERVICE_OVERLOADED    → PROVIDER_ERROR
    ├─ AUTH_FAILED                                 → PROVIDER_ERROR
    ├─ error.isToolError === true                  → TOOL_ERROR  ← (streamingToolExecutor 设置)
    ├─ INVALID_REQUEST / ValidationError           → VALIDATION_ERROR
    ├─ RATE_LIMITED                                → PROVIDER_ERROR
    ├─ permission / denied / not allowed           → PERMISSION_ERROR
    └─ 其他                                        → SYSTEM_ERROR
    │
    ▼
agentExecutor 处理:
    ├─ TOOL_ERROR → 尝试 recovery turn → 自然语言解释 或 降级
    └─ 其他 → AGENT_FAILED → return { agentState: 'failed' }
    │
    ▼
service.js 终止事件:
    agentState === 'failed' → yield RUN_FAILED { error, errorCode, errorCategory, statusCode }
    │
    ▼
Board 事件处理:
    run_failed → applyRuntimeEventToChat()
    │
    ▼
ERROR_CODE_MAP (chats.hooks.js:532):
    tool_error      → 'TOOL_ERROR'
    provider_error  → 'PROVIDER_ERROR'
    system_error    → 'SYSTEM_ERROR'
    timeout_error   → 'TIMEOUT'
    validation_error → 'INVALID_REQUEST'
    permission_error → 'PERMISSION_DENIED'
    │
    ▼
ERROR_CODE_TO_I18N_KEY (ChatPage.jsx:80):
    TOOL_ERROR       → 'toolError'
    PROVIDER_ERROR    → 'providerError'
    SYSTEM_ERROR      → 'systemError'
    TIMEOUT           → 'timeout'
    INVALID_REQUEST   → 'invalidRequest'
    PERMISSION_DENIED → 'permissionDenied'
    (无映射)          → 显示原始 errorMessage
    │
    ▼
getErrorMessage() → i18n 文本 (en.js / zh.js)
```

## 终止原因参考

| 终止原因 | 说明 | 路径 |
|----------|------|------|
| `no_tools_requested` | Agent 返回自然语言 | agentExecutor.js:534 |
| `max_iterations_reached` | 达到迭代上限 | agentExecutor.js |
| `user_cancelled` | 用户主动取消 | agentExecutor.js:1012-1052 |
| `timeout` | 请求超时 | service.js 超时机制 |
| `provider_error` | AI Provider 异常 | agentExecutor.js catch block |
| `tool_error` | 工具执行失败 | agentExecutor.js catch block → recovery turn |
| `empty_response` | Provider 无响应 | agentExecutor.js:497-500 |
| `idle_timeout` | 无活动超时 | agentExecutor.js:335-340 |
| `circuit_breaker_open` | 熔断器开启 | agentExecutor.js 熔断器检查 |

## 关键设计模式

| 模式 | 说明 |
|------|------|
| **双轨模式 (Dual-Track)** | SSE 事件驱动乐观 UI 更新, `conversation_persisted` 作为权威状态原子替换 |
| **100ms 合并缓冲 (Coalescing Buffer)** | 非终止事件排队, 100ms 批量刷新; 终止事件立即穿透 — 减少重渲染频率 |
| **Recovery Turn** | 工具错误时, Agent 获得一次无工具回复机会 (`allowedTools: []`), 自然解释失败原因 |
| **原子替换 (Atomic Replace)** | `conversation_persisted` 仅在成功路径发出, 替换所有乐观状态 — 失败路径无此事件 |
| **熔断器 (Circuit Breaker)** | 连续 N 次失败的工具被熔断, 避免重复无效调用 |
| **Promise.allSettled** | 批量工具执行使用 `allSettled`, 单个工具失败不影响批次中其他工具 |

## 涉及文件索引

### Runtime (ravens.runtime)

| 文件 | 职责 |
|------|------|
| `src/routes/runtime.js` | HTTP 路由: POST /stream, GET /runs/:id/stream |
| `src/modules/conversation/index.js` | 对话流: POST /stream, conversation_persisted 发出 |
| `src/modules/runtime/service.js` | 流编排: executeRuntimeStream 生成器 |
| `src/modules/runtime/agentExecutor.js` | 核心循环: executeAgentLoop, categorizeError, recovery turn |
| `src/modules/runtime/protocol.js` | 常量: RUNTIME_EVENT_TYPES, ERROR_CATEGORIES, TERMINATION_REASONS |
| `src/modules/runtime/events.js` | 事件创建: createRuntimeEvent |
| `src/modules/tools/streamingToolExecutor.js` | 批量工具执行: Promise.allSettled, isToolError 标记 |
| `src/modules/tools/executor.js` | 单工具执行: executeTool, 重试, 去重, 校验 |
| `src/lib/stream.js` | SSE 写入: writeSseEvent |
| `src/lib/errorParser.js` | 错误解析: parseError |

### Board (ravens.board)

| 文件 | 职责 |
|------|------|
| `src/features/chats/chats.service.js` | SSE 连接: fetch + parseSseStream |
| `src/features/chats/chats.hooks.js` | 事件处理: applyRuntimeEventToChat, attachRuntimeHandler, ERROR_CODE_MAP, 合并缓冲 |
| `src/components/chats/ChatPage.jsx` | UI 渲染: ERROR_CODE_TO_I18N_KEY, getErrorMessage, AssistantMessageRow, ToolResultBlock |
| `src/i18n/en.js` / `src/i18n/zh.js` | 错误文本: toolError, providerError, systemError 等 |
| `src/config/runtime.js` | API 配置: apiBaseUrl |
| `vite.config.js` | 代理: /runtime → :10011 (strip), /core → :10010 (strip) |