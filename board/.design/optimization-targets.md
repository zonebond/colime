# Ravens Runtime 优化目标

**生成时间**: 2026-04-17
**更新时间**: 2026-04-22
**来源**: 代码质量分析 + 性能瓶颈检测 + Claude Code 对标验证

---

## 📊 总览

| 优先级 | 数量 | 已完成 | 预计工作量（剩余） |
|--------|------|-------|-------------------|
| 🔴 P0 (高) | 5 | 5 ✅ | ✅ 全部完成 |
| 🟡 P1 (中) | 4 | 4 ✅ | ✅ 全部完成 |
| 🟢 P2 (低) | 3 | 2 ✅ 1 🟡 | 剩余：L3缓存 |

---

## 🔴 P0 - 高优先级

### 1. Token 估算精度 — ✅ 已完成 (2026-04-22)
- **文件**:
  - tokenCounter: `ravens.runtime/src/lib/tokenCounter.js` (44行) — **新增**
  - contextManager: `ravens.runtime/src/modules/runtime/contextManager.js` — **已集成**
- **实现**: `js-tiktoken/lite` + `cl100k_base` 编码（Claude 模型标准）
- **estimateTokens 行为**:
  - 无 fileType → `countTokens(text)` 精确计数（tiktoken）
  - 有 fileType → 启发式回退（`text.length / BYTES_PER_TOKEN[fileType]`）
  - tiktoken 不可用 → 自动回退到 `text.length / 4`
- **精度对比**:
  - 'hello world': heuristic=3, tiktoken=2 ✅
  - '你好世界': heuristic=1, tiktoken=5 ✅ (5x提升)
  - 'const x = 1 + 2': heuristic=4, tiktoken=8 ✅
- **测试**: 25/25 通过 (`contextManager.test.js`)
- **Claude Code 参考**: `claude-code-analysis/src/utils/tokenCounter.ts`

### 2. 电路断路器模式 — ✅ 已完成 (2026-04-22)
- **文件**:
  - API 重试层: `ravens.runtime/src/lib/withRetry.js` (86行) — **新增**
  - 断路器三态: `ravens.runtime/src/modules/runtime/agentExecutor.js:20-24, 53-120` — **增强**
- **已实现**:
  - [x] `withRetry(fn, options)` — 指数退避 + 25% 抖动，DEFAULT_MAX_RETRIES=10
  - [x] 10 种错误分类 → RETRY_POLICIES（429 无限重试 + respectRetryAfter, 529 最多 3 次连续, 5xx 重试, 401 2 次, 403/400 不重试）
  - [x] 529 过载保护：MAX_529_CONSECUTIVE=3 → OVERLOAD_PERSISTENT
  - [x] `CircuitState` 三态常量（CLOSED/OPEN/HALF_OPEN）
  - [x] `createCircuitBreaker()` 升级：`getState()`, `getOpenCircuits()`, HALF_OPEN 试探
  - [x] `CIRCUIT_BREAKER_STATE_CHANGE` SSE 事件（protocol.js）
  - [x] circuit_broken 错误含 `circuitState` 字段
- **待完成**:
  - [ ] 前台/后台请求源区分（Phase 3）
  - [ ] Board 前端断路器状态 UI 显示（Phase 4）
  - [ ] 模型回退机制（Phase 5 可选）
- **详细设计**: → `.design/circuit-breaker-pattern.md`

### 3. 失败工具重试逻辑 — ✅ 已完成
- **文件**: `ravens.runtime/src/modules/tools/executor.js:43-47, 126-191`
- **实现**: 指数退避 `BASE_DELAY * 2^(attempt-1)` + 抖动 + `isRetryableError()` 判定
- **验证**: ✅ 已确认工作中

### 4. 乐观更新竞争条件 — ✅ 已完成
- **文件**: `ravens.board/src/features/chats/chats.hooks.js:823-856`
- **实现**: `mutationQueue` 顺序处理 + SSE 100ms 合并缓冲
- **验证**: ✅ 已确认工作中

---

## 🟡 P1 - 中优先级

### 5. 上下文压缩 — ✅ 已完成
- **文件**: `ravens.runtime/src/modules/runtime/contextManager.js`
- **实现**:
  - `collapseMessages()` — LLM 摘要压缩 (lines 255-361)
  - `compactMessages()` — 结构化压缩 (lines 233-253)
  - `microCompact()` — 微压缩 (lines 487-520)
  - `truncateForPTL()` — PTL 截断 (lines 544-567)
  - `persistSummary()` — 摘要持久化 (lines 579-599)
- **验证**: ✅ 多级压缩管道工作中

### 6. 缓存命中/未命中跟踪 — ✅ 已完成
- **文件**: `ravens.runtime/src/modules/runtime/cacheMetrics.js`
- **实现**:
  - `CacheMetrics` 类：`recordCall()`, `getHitRate()`, `getMetrics()`, `detectCacheBreak()`
  - 集成在 `contextManager.js:1,42,146,650-656`
- **验证**: ✅ 指标可查询

### 7. 提示版本控制 — ✅ 已完成
- **文件**: `ravens.runtime/src/modules/runtime/promptAssembler.js`
- **实现**:
  - `versionCounter` 每段版本追踪
  - `sectionVersion` Map
  - `getVersion()`, `rollbackToVersion()`, `sectionHistory` 追踪
- **验证**: ✅ 版本可回滚

### 8. 并行工具执行 — ✅ 已完成 (2026-04-22)
- **文件**:
  - StreamingToolExecutor: `ravens.runtime/src/modules/tools/streamingToolExecutor.js` (166行) — **新增**
  - agentExecutor 集成: `agentExecutor.js:616-782` — **改造**
  - 工具并发标记: `builtins.js` 18 个工具 — **新增 isConcurrencySafe**
  - 事件类型: `protocol.js` +TOOL_PROGRESS, +AGENT_TOOL_PROGRESS — **新增**
- **已实现**:
  - [x] StreamingToolExecutor 4 态模型（QUEUED/EXECUTING/COMPLETED/YIELDED）
  - [x] `addTool()`, `getNextBatch()`, `executeBatch()`, `getCompletedResults()`, `discard()`
  - [x] 并发安全分类 → Promise.all 并行执行
  - [x] 非并发工具独占执行
  - [x] 兄弟错误级联（AbortController）
  - [x] 进度即时推送（onProgress 回调）
  - [x] builtins.js 18 个工具全部标记 isConcurrencySafe
- **待完成**:
  - [ ] Board 前端进度条实时展示（SSE tool_progress → 进度条动画）
  - [ ] 端到端验证：3 个 Read 并行执行耗时 ~= 单次
- **Claude Code 参考**: `claude-code-analysis/src/services/tools/StreamingToolExecutor.ts`
- **详细设计**: → `.design/streaming-state-machine.md`

---

## 🟢 P2 - 低优先级

### 9. 语义去重 — ✅ 已完成 (2026-04-22)
- **文件**:
  - DeduplicationManager: `ravens.runtime/src/modules/runtime/deduplication.js` (98行)
  - SSE 事件: `protocol.js` +TOOL_DEDUPED, +AGENT_TOOL_DEDUPED
  - 元数据返回: `deduplication.js` dedupRequest → `{ result, deduped, dedupType }`
  - 事件触发: `executor.js:117-119` onDedup回调 → `agentExecutor.js:726-735` emitBuffer
  - 前端处理: `chats.hooks.js` tool_deduped case
  - UI: ChatPage.jsx deduped badge
- **已实现**:
  - [x] `DeduplicationManager` 类：`inFlightRequests` + `cache` + `TTL(5000ms)`
  - [x] 只读工具去重（Read/Grep/ListFiles）
  - [x] 执行器集成 `isReadOnly` 检查
  - [x] SSE `TOOL_DEDUPED` / `AGENT_TOOL_DEDUPED` 事件
  - [x] `dedupRequest()` 返回去重元数据（`deduped`, `dedupType`）
  - [x] Board 前端 deduped 状态显示
- **待完成**:
  - [ ] 写操作工具缓存失效（L3）
- **详细设计**: → `.design/semantic-deduplication.md`

### 10. 消息分页 — ✅ 已完成
- **文件**: `ravens.board/src/features/chats/chats.hooks.js:1336,1345`
- **实现**: cursor 状态 + `loadChatMessages(chatId, { before: cursor })`
- **验证**: ✅ 游标分页工作中

### 11. TypeScript 迁移 — ❌ 不计划
- **评估**: 当前项目全为 JSX/JS，AGENTS.md 明确标注 "Do NOT use TypeScript"
- **理由**: 前端 UI 缺失（18%）是核心矛盾，非类型安全
- **替代方案**: 关键 API 边界加 JSDoc `@typedef`，获得部分类型提示
- **何时重评估**: 团队 >3 人 或 类型 bug 频发

### 12. 集成测试 — ✅ 已完成 (2026-04-22)
- **文件**: `ravens.board/tests/integration/` — **新增**
  - `streaming-tool-execution.test.js` (6 个测试)
  - `parallel-execution.test.js` (7 个测试)
  - `circuit-breaker.test.js` (8 个测试)
  - `api-retry.test.js` (8 个测试)
  - `helpers/mockTools.js`, `helpers/mockRuntime.js`
- **已实现**:
  - [x] StreamingToolExecutor 状态机测试（状态流转、并发安全分批、Promise.all并行、discard）
  - [x] 并行执行验证测试（3×200ms Read → ~200ms wall time, 写操作串行, Bash 失败级联）
  - [x] 三态断路器测试（CLOSED→OPEN→HALF_OPEN→CLOSED、per-tool 独立、getOpenCircuits）
  - [x] API 重试层测试（重试策略、错误分类、529过载保护、AUTH限制、最大重试）
  - [x] 29/29 测试通过（~1.5s，node:test）
- **未覆盖**:
  - [ ] Board ↔ Core ↔ Runtime 端到端联调测试（需 3 服务运行）
  - [ ] SSE 流式事件端到端测试
- **验证标准**: node:test 29/29 通过

---

## 🎯 关键路径

**P0/P1/P2 全部完成或部分完成。** 剩余：P3 语义去重 L3（缓存命中）。

11/12 项已完成。TypeScript 不计划。

---

## 📋 实现顺序

### ✅ 已完成
1. [P0] Token 估算精度 (js-tiktoken cl100k_base) — 2026-04-22
2. [P0] API 重试层 (`withRetry.js`) — 2026-04-22
3. [P0] 断路器三态增强 — 2026-04-22
4. [P0] 失败工具重试逻辑 — 已验证
5. [P0] 乐观更新竞争条件 — 已验证
6. [P1] 上下文压缩 — 已验证
7. [P1] 缓存命中/未命中跟踪 — 已验证
8. [P1] 提示版本控制 — 已验证
9. [P1] 并行工具执行 + StreamingToolExecutor — 2026-04-22
10. [P2] 语义去重 L1 — DeduplicationManager + SSE 去重事件 + 前端 UI — 2026-04-22
11. [P2] 集成测试 — 29/29 pass — 2026-04-22

### ✅ 新增完成项
12. [P1] Board 前端工具并行显示 — detectParallelBatches + deduped badge + circuit breaker badge ✅
13. [P1] Bash 实时进度 — spawn + onProgress + progress bar ✅
14. [P1] 并行执行验证 — parallel-execution.test.js 7/7 pass ✅

### 待实现
13. [P3] 语义去重 L3（缓存命中）
14. [—] TypeScript 迁移（不计划）

---

## 📚 Claude Code 参考文件

- API 重试: `claude-code-analysis/src/services/api/withRetry.ts` (822行)
- 错误分类: `claude-code-analysis/src/services/api/errors.ts` (1207行)
- Auto-compact 断路: `claude-code-analysis/src/services/compact/autoCompact.ts` (351行)
- Token 计数: `claude-code-analysis/src/utils/tokenCounter.ts`
- 工具执行器: `claude-code-analysis/src/services/tools/toolExecution.ts` (1460+行)
- 工具编排: `claude-code-analysis/src/services/tools/toolOrchestration.ts`
- 流式执行器: `claude-code-analysis/src/services/tools/StreamingToolExecutor.ts` (530行)
- 主查询循环: `claude-code-analysis/src/query.ts` (~1730行)

---

## 📐 详细设计文档索引

| 优化项 | 详细设计文档 |
|--------|-------------|
| 流式状态机 + 并行工具执行 | `.design/streaming-state-machine.md` |
| 电路断路器 + API 重试 | `.design/circuit-breaker-pattern.md` |
| 语义去重 | `.design/semantic-deduplication.md` |

---

## 状态跟踪

| 优化项 | 状态 | 实现日期 | 详细设计 |
|--------|------|----------|----------|
| Token 估算精度 | ✅ 已完成（js-tiktoken cl100k_base） | 2026-04-22 | — |
| 电路断路器模式 | ✅ 已完成 | 2026-04-22 | `.design/circuit-breaker-pattern.md` |
| 失败工具重试逻辑 | ✅ 已完成 | 2026-04-22 | — |
| 乐观更新竞争条件 | ✅ 已完成 | 2026-04-22 | — |
| 上下文压缩 | ✅ 已完成 | 2026-04-22 | — |
| 缓存命中/未命中跟踪 | ✅ 已完成 | 2026-04-22 | — |
| 提示版本控制 | ✅ 已完成 | 2026-04-22 | — |
| 并行工具执行 | ✅ 已完成 | 2026-04-22 | `.design/streaming-state-machine.md` |
| 语义去重 | ✅ 已完成（L1 核心+SSE事件+前端UI） | 2026-04-22 | `.design/semantic-deduplication.md` |
| 消息分页 | ✅ 已完成 | 2026-04-22 | — |
| TypeScript 迁移 | ❌ 不计划 | - | — |
| 集成测试 | ✅ 已完成（29/29 pass） | 2026-04-22 | — |
