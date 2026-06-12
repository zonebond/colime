# 流式状态机（Streaming State Machine）

**生成时间**: 2026-04-22
**用途**: 架构设计素材 + 开发实现指南
**对标**: Claude Code `StreamingToolExecutor.ts`
**目标文件**: `ravens.runtime/src/modules/runtime/agentExecutor.js`

---

## 1. 技术原理

### 1.1 问题背景

传统 Agent 执行流程是 **"全部收到再执行"**：

```
模型返回 → 等待所有 tool_use 块到齐 → 逐个执行 → 汇总结果 → 下一轮
```

这带来两个问题：
1. **延迟浪费**：模型流式返回 3 个 Read 调用，第一个到达时完全可以立即执行，但传统模式要等最后一个到齐
2. **无法并行**：即使多个工具互不依赖，也只能串行执行

### 1.2 核心思想

**"边收边跑"（Stream-as-you-go）**：当模型流式输出 tool_use 块时，每收到一个可执行的工具调用就立即启动执行。

### 1.3 状态定义

```typescript
type ToolStatus = 'queued' | 'executing' | 'completed' | 'yielded'
```

| 状态 | 含义 | 触发条件 |
|------|------|----------|
| `queued` | 已接收，等待执行条件满足 | `addTool()` 被调用 |
| `executing` | 正在执行中 | `processQueue()` 拾取并启动 |
| `completed` | 执行完成，结果已就绪 | `executeTool()` 返回 |
| `yielded` | 结果已被消费方取走 | `getCompletedResults()` 返回 |

### 1.4 状态流转图

```
                    addTool()
                       │
                       ▼
                 ┌──────────┐
                 │  queued   │ ← 工具入队
                 └──────────┘
                       │
            processQueue() 拾取
            （检查并发安全条件）
                       │
                       ▼
                 ┌──────────┐
                 │ executing │ ← 工具运行中
                 └──────────┘
                    ╱      ╲
              成功 ╱        ╲ 失败
                 ╱          ╲
                ▼            ▼
          ┌──────────┐  ┌──────────┐
          │ completed │  │ completed │ ← 都进入 completed，isError 区分
          │ (success) │  │  (error)  │
          └──────────┘  └──────────┘
                │            │
       getCompletedResults() │
                │            │
                ▼            ▼
          ┌──────────┐
          │  yielded   │ ← 结果被消费
          └──────────┘
```

### 1.5 并发安全分类（Concurrency Safety）

工具分为两类：

| 类型 | 定义 | 执行策略 | 典型工具 |
|------|------|----------|----------|
| **concurrency-safe** | 只读、无副作用 | 可与其他 safe 工具并行 | Read, Grep, Glob, ListFiles |
| **non-concurrent** | 有写操作/副作用 | 必须独占执行 | Write, Edit, Bash, MCP(写操作) |

### 1.6 分批执行示例

模型一次返回 `[Read(A), Read(B), Write(C), Read(D)]`：

```
批次 1: [Read(A), Read(B)]  ← concurrency-safe → 并行执行
批次 2: [Write(C)]          ← non-concurrent → 独占执行
批次 3: [Read(D)]           ← 独占恢复后执行
```

### 1.7 兄弟错误级联（Sibling Error Cascade）

当 Bash 工具执行失败时：
1. 设置 `hasErrored = true`
2. 调用 `siblingAbortController.abort('sibling_error')`
3. 其他正在执行的兄弟工具收到中断信号
4. 生成合成错误消息，避免未完成工具的空结果

### 1.8 进度消息即时产出

工具执行期间产生的 **进度消息**（如 Bash 的实时输出）不等待 completed 状态，立即 yield 给消费方：

```javascript
// 进度消息 → 立即推送
if (update.message.type === 'progress') {
  tool.pendingProgress.push(update.message)
  if (this.progressAvailableResolve) {
    this.progressAvailableResolve()  // 唤醒等待方
  }
}
```

---

## 2. Claude Code 参考实现

### 2.1 核心文件

| 文件 | 作用 |
|------|------|
| `src/services/tools/StreamingToolExecutor.ts` (530行) | 状态机核心 |
| `src/services/tools/toolOrchestration.ts` | 分批调度（concurrent/serial） |
| `src/services/tools/toolExecution.ts` (1460+行) | 单工具执行管道 |
| `src/query.ts` (~1730行) | 主循环，消费 StreamingToolExecutor |

### 2.2 StreamingToolExecutor 关键结构

```typescript
class StreamingToolExecutor {
  private tools: TrackedTool[] = []
  private hasErrored = false                  // 兄弟错误标记
  private siblingAbortController: AbortController  // 级联取消

  // 核心方法
  addTool(block, assistantMessage): void      // 工具入队 → queued
  getCompletedResults(): MessageUpdate[]      // 取出 completed → yielded
  discard(): void                             // 放弃所有未完成工具

  // 内部方法
  processQueue(): void                        // 调度 queued → executing
  executeTool(tool): Promise<void>            // 执行 → completed
}
```

### 2.3 TrackedTool 跟踪结构

```typescript
type TrackedTool = {
  id: string                  // tool_use_id
  block: ToolUseBlock          // 原始 tool_use 块
  assistantMessage: AssistantMessage
  status: ToolStatus          // 状态机当前状态
  isConcurrencySafe: boolean  // 并发安全标记
  promise?: Promise<void>     // 执行中的 Promise
  results?: Message[]         // 执行结果
  pendingProgress: Message[]  // 待推送的进度消息
  contextModifiers?: Array    // 上下文修改器（延迟应用）
}
```

### 2.4 query.ts 集成方式

```typescript
// 1. 每轮 API 调用前创建 StreamingToolExecutor
streamingToolExecutor = new StreamingToolExecutor(tools, canUseTool, context)

// 2. 流式接收时，每收到一个 tool_use 块就入队
for (const toolBlock of msgToolUseBlocks) {
  streamingToolExecutor.addTool(toolBlock, message)
}

// 3. 取已完成的结果，立即 yield 给消费方
for (const result of streamingToolExecutor.getCompletedResults()) {
  if (result.message) {
    yield result.message
    toolResults.push(...normalizeMessagesForAPI([result.message]))
  }
}
```

---

## 3. Ravens 实现方案

### 3.1 当前状态 — ✅ 已实现 (2026-04-22)

`ravens.runtime/src/modules/tools/streamingToolExecutor.js` (166行) + `agentExecutor.js` L616-782 集成：
- `StreamingToolExecutor` 类实现完整 4 态模型
- `addTool()`, `getNextBatch()`, `executeBatch()`, `getCompletedResults()`, `hasPendingTools()`, `discard()`
- 并发安全分类 → Promise.all 并行执行
- 兄弟错误级联（AbortController）
- 进度即时推送（onProgress 回调）
- `agentExecutor.js` 完整集成：创建 executor → 添加工具 → 批次循环 → 事件产出
- `builtins.js` 18 个工具全部标记 `isConcurrencySafe`
- `protocol.js` 新增 TOOL_PROGRESS, AGENT_TOOL_PROGRESS 事件类型

### 3.2 目标架构

```
agentExecutor.js
  │
  ├── StreamingToolExecutor（新增）
  │     ├── addTool()          → queued
  │     ├── processQueue()     → executing（并发安全 → Promise.all）
  │     ├── executeTool()      → completed
  │     ├── getCompletedResults() → yielded
  │     ├── discard()          → 取消所有
  │     └── siblingAbort       → 级联取消
  │
  ├── toolOrchestration（新增）
  │     ├── partitionToolCalls()    → 分批
  │     ├── runToolsConcurrently()  → Promise.all
  │     └── runToolsSerially()      → 串行
  │
  └── 现有执行循环（改造）
        ├── 创建 StreamingToolExecutor
        ├── 流式接收 → addTool()
        ├── 定时/事件驱动 → getCompletedResults()
        └── SSE 产出进度消息
```

### 3.3 并发安全判定

为每个内置工具增加 `isConcurrencySafe` 属性：

```javascript
const BUILTIN_TOOLS = {
  listWorkspaceFiles:  { isConcurrencySafe: true },  // 只读
  grepWorkspace:      { isConcurrencySafe: true },  // 只读
  readWorkspaceFile:  { isConcurrencySafe: true },  // 只读
  writeWorkspaceFile: { isConcurrencySafe: false }, // 写操作
  bashCommand:        { isConcurrencySafe: false }, // 副作用
  fetchUrlContent:    { isConcurrencySafe: true },  // 只读
  // MCP 工具：默认 non-concurrent，除非声明 safe
}
```

### 3.4 SSE 事件集成

Board 前端需要新增 SSE 事件类型：

| 事件类型 | 含义 | 当前是否支持 |
|---------|------|------------|
| `tool_queued` | 工具入队 | ❌ 需新增 |
| `tool_executing` | 工具开始执行 | 🟡 部分（tool_start） |
| `tool_progress` | 工具执行进度 | ❌ 需新增 |
| `tool_completed` | 工具执行完成 | ✅ tool_result |
| `tools_batch_start` | 并行批次开始 | ❌ 需新增 |
| `tools_batch_end` | 并行批次结束 | ❌ 需新增 |

---

## 4. 实现检查清单

### Phase 1: 基础状态机（无并行） — ✅ 已实现 (2026-04-22)

- [x] 创建 `StreamingToolExecutor` 类（`src/modules/tools/streamingToolExecutor.js`, 166行）
- [x] 4 态模型：QUEUED → EXECUTING → COMPLETED → YIELDED
- [x] `addTool()` 入队 + `getCompletedResults()` 取出
- [x] 产出 TOOL_STARTED / TOOL_FINISHED SSE 事件
- [x] 集成到 `agentExecutor.js` L616-782

### Phase 2: 并发安全工具并行 — ✅ 已实现 (2026-04-22)

- [x] `builtins.js` 18 个工具全部标记 `isConcurrencySafe`（Write=false, bash=false, 只读=true）
- [x] `getNextBatch()` 分批逻辑（partition by isConcurrencySafe）
- [x] 并发安全批次使用 `Promise.all`（`executeBatch()`）
- [x] 非并发工具独占执行
- [x] 验证：3 个 Read 调用并行执行（parallel-execution.test.js 7/7 pass, 3×200ms 完成 → ~200ms wall time）

### Phase 3: 进度即时推送 — 🟡 部分完成 (2026-04-22)

- [x] `onProgress` 回调机制
- [x] `protocol.js` 新增 TOOL_PROGRESS, AGENT_TOOL_PROGRESS 事件类型
- [x] Board 前端 SSE 事件处理（`chats.hooks.js` tool_progress case）
- [x] Board 前端进度条 UI 组件（ChatPage.jsx ToolResultBlock progress bar）
- [x] Bash 工具 spawn 实时输出：builtins.js 替换 execAsync→spawn，bashCommand 接受 {onProgress, signal}
- [ ] 验证：Bash 长命令执行时，用户看到实时输出流（需 3 服务联调）

### Phase 4: 兄弟错误级联 — ✅ 已实现 (2026-04-22)

- [x] 共享 `AbortController` 实现 sibling 间取消
- [x] Bash 工具失败时触发兄弟取消
- [x] 被取消工具收到 abort 信号
- [ ] 验证：Bash exit 1 → 其他并行工具立即中断

### Phase 5: discard 机制 — ✅ 已实现 (2026-04-22)

- [x] `discard()` 方法实现
- [x] 排队工具不启动
- [x] 执行中工具收到中止信号
- [ ] 验证：streaming fallback → 未完成工具优雅终止

---

## 5. 性能预期

| 场景 | 当前耗时 | 优化后预期 | 原因 |
|------|---------|-----------|------|
| 3 个 Read 串行 | ~3s | ~1s | 并行执行 |
| Read + Bash 串行 | ~5s | ~5s | Bash non-concurrent，不变 |
| Bash 失败级联 | 等全部超时 | 秒级中断 | 兄弟取消 |
| 模型 fallback | 继续执行无用工具 | 立即停止 | discard 机制 |

---

## 6. 与前端 UI 的关系

流式状态机核心完成后，前端 UI 已部分适配：

1. ✅ **工具卡片并行显示**：`detectParallelBatches()` 函数将连续 active 工具分组为批次，水平 flex 布局
  2. ✅ **进度条**：`ToolResultBlock` progress bar + Bash spawn onProgress 实时流
3. ✅ **Deduped 标记**：工具卡片显示灰色 "deduped" badge
4. 🔧 **Circuit breaker 标记**：后端 SSE 事件 + metadata 存储已实现，前端 badge 渲染 pending

→ 进度条的实时可视化属于 `frontend-update-roadmap.md` 的后续扩展

---

## 参考

- Claude Code `src/services/tools/StreamingToolExecutor.ts`
- Claude Code `src/services/tools/toolOrchestration.ts`
- Claude Code `src/services/tools/toolExecution.ts`
- Claude Code `src/query.ts` (lines 563, 735, 914 - StreamingToolExecutor 使用)
- Claude Code 分析文档 `analysis/04b-tool-call-implementation.md` (Section 5)