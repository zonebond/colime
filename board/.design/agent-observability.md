# Agent 可观测性：流式事件模型与迭代结构（Agent Observability: Streaming Event Model & Iteration Structure）

**生成时间**: 2026-04-27
**用途**: 架构设计素材 + 开发实现指南
**对标**: Claude Code `stream-json` + OpenCode Part-based 消息模型
**目标文件**: `ravens.runtime/src/modules/runtime/protocol.js`, `agentExecutor.js`, `trace.js`

---

## 1. 问题背景

### 1.1 当前状态

Runtime 服务通过 SSE 向 Board 推送 21 种事件类型，涵盖 Agent 执行的完整过程：

```
RUN_STARTED → THINKING_STARTED → THINKING_STEP → TOOL_STARTED → TOOL_FINISHED
→ MESSAGE_DELTA → MESSAGE_DONE → RUN_COMPLETED
```

**内容已经有**：thinking 文本、工具名称/参数/结果、模型输出文本。

### 1.2 核心差距

**迭代边界不可见**。当 Agent 执行多轮思考-工具循环时，Board 无法区分哪个 thinking 属于哪一轮、哪个工具的产出触发了哪种思考变化。

具体表现：
- `thinking_step.id` 固定为 `${runId}:provider-thinking:1`，跨所有迭代 → `upsertStep` 把所有迭代的 thinking 合并到一起
- 没有任何事件携带 `iteration` 字段
- 没有 `turn_started` 标记事件
- 工具调用没有按迭代分组的能力

---

## 2. 主流方案调研

对两个头部 Agent 编码工具的流式事件模型进行了完整调研。

### 2.1 Claude Code — Content Block 生命周期模型

**启用方式**：
```bash
claude -p "query" --output-format stream-json --verbose --include-partial-messages
```

**事件层级**（每条 NDJSON 行一个事件）：

| 层级 | 事件类型 | 用途 |
|------|---------|------|
| Session | `system/init` | Session 元数据（model, tools, mcp_servers） |
| Message | `stream_event`（外层包装） | 包裹内层 Anthropic API 原始事件 |
| Content Block | `content_block_start/delta/stop` | 文本/工具/思考块的生命周期 |
| API 可见性 | `system/api_retry`, `rate_limit_event` | API 重试和限流信息 |
| 结束 | `result` | `num_turns`, `total_cost_usd`, `usage` |

**一条消息的完整生命周期**：
```
message_start
  content_block_start { type: "text" }
    content_block_delta { text_delta: "Hello" }
    content_block_delta { text_delta: " world" }
  content_block_stop
  content_block_start { type: "tool_use", name: "Read", id: "toolu_123" }
    content_block_delta { input_json_delta: '{"file_path":' }
    content_block_delta { input_json_delta: '"./src/app.js"}' }
  content_block_stop
  message_delta { stop_reason: "tool_use", usage }
message_stop
// 工具执行后，结果作为 user 消息注入
user { content: [{ type: "tool_result", tool_use_id: "toolu_123", ... }] }
```

**六种 Delta 类型**：
| Delta | 内容 | 用途 |
|-------|------|------|
| `text_delta` | 逐 token 文本 | 模型输出流式显示 |
| `thinking_delta` | Extended thinking 文本 | 思考过程流式显示 |
| `signature_delta` | Thinking 完整性签名 | 防中间丢失/篡改 |
| `input_json_delta` | 工具参数 JSON 片段 | 流式显示工具参数 |
| `citations_delta` | 引用信息 | 来源标注 |
| `compaction_delta` | 上下文压缩内容 | 压缩通知 |

**关键设计决策**：
- 无显式 turn/iteration 标记 — 前端靠 `message_start → message_stop` 计数推断轮次
- `system/init` 总在第一个事件发送，保证前端在内容到达前拿到 session 元数据
- `assistant` 和 `user` 消息交替出现，自然形成对话轮次
- `rate_limit_event` 让前端感知 API 限流状态

---

### 2.2 OpenCode — Part-Based 消息模型

**仓库**：`anomalyco/ravens`（150k stars）

**内部架构**：
```
AI SDK raw events → processor.ts（转换）→ Event Bus（发布/订阅）
→ SSE endpoint（推送）→ Frontend coalescing relay（降频）
```

**核心概念：消息 = Parts 数组**

```typescript
interface Message {
  id: string
  role: "user" | "assistant"
  parts: Part[]           // ← 核心结构
}

type Part = TextPart | ReasoningPart | ToolPart | FilePart
```

**Part 类型定义**：

```typescript
// 文本 Part
{ type: "text", text: string }

// 推理/思考 Part（独立的 Part 类型）
{ type: "reasoning", text: string, status: "pending" | "running" | "completed" }

// 工具 Part（有显式状态机）
{
  type: "tool",
  name: string,
  callId: string,
  input: object,
  output?: string,
  state: {
    status: "pending" | "running" | "completed" | "error",
    title: string        // 可读标题
  }
}
```

**工具 Part 状态转换**：
```
pending → running → completed
                 ↘ error
```

**SSE 事件类型**：

| 事件 | 粒度 | 数据 |
|------|------|------|
| `message.updated` | 消息级 | 完整 Message 对象 |
| `message.part.updated` | Part 级 | 单个 Part 对象（创建/更新） |
| `message.part.delta` | 增量级 | `{ partID, field, delta }` — 逐 token |
| `message.part.removed` | Part 级 | Part 删除 |
| `session.status` | Session 级 | `"idle" \| "running" \| "thinking" \| "error"` |

**`message.part.delta` 精确 Schema**：
```typescript
PartDelta: BusEvent.define(
  "message.part.delta",
  z.object({
    sessionID: z.string(),
    messageID: z.string(),    // ← 隐式的 turn 边界
    partID: z.string(),
    field: z.string(),        // "text" 或 "reasoning"
    delta: z.string(),        // 增量内容
  }),
)
```

**Processor 事件转换表**：
| AI SDK 原始事件 | OpenCode 动作 |
|---|---|
| `reasoning-start` | 创建 `reasoning` Part |
| `reasoning-delta` | pub `message.part.delta` { field: "text" } |
| `text-delta` | pub `message.part.delta` { field: "text" } |
| `tool-use` | 创建 `tool` Part |
| `tool-input-delta` | pub `message.part.delta`（流式工具参数） |
| `tool-result` | 更新 tool Part 的 output |

**Turn 概念（设计中，`message-shape.md` Option 3）**：
```typescript
interface Turn {
  id: string
  request: { agent: string, model: string, tools: string[] }
}
interface Message {
  turnId: string    // 关联到所属 turn
}
```

**关键设计决策**：
- `messageID` 隐式提供 turn 边界（同一助手消息的所有 parts 共享一个 messageID）
- `message.part.updated` 精细粒度 — 不是替换整条消息，而是只更新一个 part
- 服务端 `coalescing relay` 防止 delta 风暴（合并重复 delta、丢弃陈旧队列）
- 50+ 种事件类型覆盖 session、message、permission、MCP、LSP、VCS 等所有维度

---

### 2.3 三系统对比

| 维度 | Claude Code | OpenCode | ravens.runtime（当前） |
|------|-------------|----------|----------------------|
| **消息模型** | 消息 = content_blocks[] | 消息 = parts[] | ❌ 无消息概念 |
| **迭代标志** | message_start 计数（隐式） | messageID（隐式） | ❌ 完全缺失 |
| **Thinking** | content_block delta | 独立 ReasoningPart | thinking_step（id 固定，全合并） |
| **工具状态** | block start→stop（隐式） | pending→running→completed（显式） | started/finished（无中间态） |
| **更新粒度** | 逐 delta（token 级） | 逐 PartDelta（part 级） | 逐事件 |
| **内部架构** | 直接 SSE | SDK→Processor→Bus→SSE→Relay | executeTurn→emit |
| **降频策略** | ❌ 无 | 服务端 coalescing relay | 前端 100ms buffer |
| **Session 状态** | ❌ 无 | session.status/idle/error | ❌ 无 |
| **权限请求** | ❌ 无专用事件 | permission.asked/replied | TOOL_CONFIRM_REQUIRED |
| **API 可见性** | rate_limit_event, api_retry | ❌ 无 | ❌ 无 |

---

## 3. 改造方案：Turn-based 最小改动

### 3.1 方案选择

不做推倒重来。Claude Code 和 OpenCode 的复杂模型（content_block、Part）是为它们的多模态需求服务的（流式工具输入、签名验证、大量独立渲染组件）。你的 Runtime 场景不需要这些。

**采用 OpenCode Turn 实体的思路 + 最小改动的落地方式**：在所有事件上加 `iteration` 字段 + 新增 `turn_started` 标记事件。

### 3.2 目标事件流

```
RUN_STARTED
  │
  ├── TURN_STARTED { iteration: 1 }                           ← 新增
  │   ├── THINKING_STEP { id: "run-1:thinking:1", iteration: 1, detail: "..." }  ← id 改
  │   ├── TOOL_STARTED { iteration: 1, name: "Read", input: {...} }
  │   ├── TOOL_FINISHED { iteration: 1, name: "Read", output: "..." }
  │   ├── MESSAGE_DELTA { iteration: 1, delta: "Hello" }
  │   └── MESSAGE_DONE { iteration: 1, finalText: "Hello world" }
  │
  ├── TURN_STARTED { iteration: 2 }
  │   ├── THINKING_STEP { id: "run-1:thinking:2", iteration: 2, detail: "..." }
  │   ├── TOOL_STARTED { iteration: 2, ... }
  │   ├── TOOL_FINISHED { iteration: 2, ... }
  │   └── MESSAGE_DONE { iteration: 2, ... }
  │
  └── RUN_COMPLETED { totalTurns: 2 }
```

### 3.3 改动清单

#### 步骤 1：`protocol.js` — 新增事件类型

```javascript
// 在 RUNTIME_EVENT_TYPES 中新增
TURN_STARTED: 'turn_started',
```

#### 步骤 2：`agentExecutor.js` — 循环中 emit TURN_STARTED + 所有事件加 iteration

```javascript
export async function* executeAgentLoop(app, input, provider, messages, loopContext, options = {}) {
  let iteration = 0

  while (iteration < maxSteps) {
    iteration++

    // ← 新增：标记迭代开始
    yield createEvent(TURN_STARTED, { iteration })

    const turnResult = yield* provider.executeTurn(input, context, messages)

    // 遍历 provider 事件，加 iteration
    for (const event of turnResult.events) {
      yield { ...event, iteration }         // ← 加字段
    }

    // 工具执行、reconstruct、检查终止条件...
  }
}
```

#### 步骤 3：`trace.js` — thinking 步骤 id 加入迭代号

```javascript
// 改前
function upsertStep(steps, event) {
  const id = `${runId}:provider-thinking:1`   // 固定 id

// 改后
function upsertStep(steps, event) {
  const id = `${runId}:thinking:${event.iteration}`   // 按迭代分组
```

#### 步骤 4：`protocol.js` — `createEvent` 工具函数支持 iteration

```javascript
// 确保 createEvent 保留 iteration 字段
function createEvent(type, payload = {}) {
  return {
    type,
    timestamp: Date.now(),
    ...payload,
  }
}
```

### 3.4 Board 侧使用

Board 侧无需改数据结构，只需在渲染时按 `iteration` 分组：

```jsx
// ChatPage.jsx — 现有事件处理
function groupByIteration(events) {
  const groups = []
  let currentGroup = null

  for (const event of events) {
    if (event.type === 'turn_started') {
      currentGroup = { iteration: event.iteration, events: [] }
      groups.push(currentGroup)
    } else if (currentGroup) {
      currentGroup.events.push(event)
    }
  }
  return groups
}
```

### 3.5 改动量估算

| 文件 | 改动行数 | 说明 |
|------|---------|------|
| `protocol.js` | +1 | 新增 TURN_STARTED |
| `agentExecutor.js` | ~8 | iteration 计数器 + emit + 事件加字段 |
| `trace.js` | ~2 | thinking id 格式调整 |
| **合计** | **~11 行** | |

### 3.6 不做的事情

- ❌ 不引入 content_block 模型（你的场景不需要流式工具输入）
- ❌ 不引入 Part 模型（工具生命周期简单，用 started/finished 足够）
- ❌ 不引入 Event Bus 架构（当前直接 emit 满足需求）
- ❌ 不改变 Board 数据流（只是事件多了 `iteration` 字段）

---

## 4. 后续演进方向

当前方案解决了核心的迭代归属问题。以下方向可在后续迭代中考虑：

| 方向 | 复杂度 | 收益 | 参考 |
|------|-------|------|------|
| `session.status` 事件 | 低 | Board 可据此显示全局 loading/error | OpenCode |
| `rate_limit_event` | 低 | 前端感知 API 限流，给用户提示 | Claude Code |
| `api_retry` 事件 | 中 | 透明化 API 重试过程 | Claude Code |
| 工具 `pending → running` 状态转换 | 中 | 工具执行过程可见（非瞬时完成） | OpenCode |
| 服务端 coalescing relay | 高 | 替代前端 100ms buffer，更精确降频 | OpenCode |
| 原始 LLM request/response dump | 中 | 调试用，写入 trace 文件而非推 SSE | Claude Code OTEL_LOG_RAW_API_BODIES |
