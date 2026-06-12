# Agent 维度目标表 - 最强实现对标

**生成日期**: 2026-04-17
**目标**: 逐个突破各维度最强实现，提升 Ravens Agent 能力

---

## 最强维度表

| 维度 | 最强实现 / 特点描述 | 来源 | Ravens 差距 | 优先级 |
|------|---------------------|------|-------------|--------|
| **Agent 循环** | 单一 `query()` AsyncGenerator，10 种终止状态 + 7 种继续状态，支持 REPL/SDK/子代理/后台 | Claude Code | 中 | P2 |
| **工具系统** | 运行时协议对象，9 阶段执行管道（schema 验证 → 语义验证 → 回填 → 钩子 → 权限 → 执行 → 错误处理 → 格式化），Zod 验证 | Claude Code | 高 | P1 |
| **权限系统** | 运行时 + 执行时双重检查，通配符规则匹配（`last-match-wins`），2 级合并（agent + session） | OpenCode | ✅ 已实现（v1 - 规则引擎 + 通配符） | P1 |
| **多代理** | 三层架构：subagent / coordinator / swarm，15 步 `runAgent()` 生命周期，字节相同前缀优化 prompt cache（90% 折扣） | Claude Code | ✅ 已实现（v1） | P0 |
| **代理通信** | 文件型 mailbox（`~/.claude/teams/{team}/inboxes/{agent}.json`），SendMessageTool 路由（bridge / uds / teammate / 广播），持久化 + 可检查 | Claude Code | ✅ 已实现（v1 - 内存型 mailbox） | P0 |
| **上下文管理** | 动态窗口预算（200k/1M），4 层压缩（Layer 0→3），自动压缩触发（effectiveWindow - 13k），断路器（3 次失败停止） | Claude Code | 中 | P2 |
| **系统提示** | 6 层组装 + 优先级：override > coordinator > agent > custom > default + append，段落缓存边界 | Claude Code | 中 | P2 |
| **流式** | 状态机：queued → executing → completed → yielded，并发安全工具即时执行，StreamingToolExecutor | Claude Code | ✅ 已实现（StreamingToolExecutor 166行 + Promise.all 并行） | P1 ✅ |
| **内存** | 工作内存（lastUserIntent, lastAssistantSummary, recentToolResults, recentlyReferencedResources）+ 活动状态注入，XML 格式注入系统提示 | Ravens ✅ | 无 | ✅ |
| **MCP** | 一级运行时协议，插件系统动态发现 | OpenCode | ✅ 已实现（v1 - stdio 传输） | P0 |
| **会话层级** | 父-子会话（`parentID`），`Effect.forkChild` 异步执行，键盘导航（上下左右切换） | OpenCode | 高 | P1 |
| **并行执行** | `Effect.forkChild` 子进程 + 外部 DAG 调度器（work-stealing 队列） | OpenCode | 高 | P1 |

---

## 统计

| 来源 | 最强维度数 |
|------|-----------|
| Claude Code | 8 |
| OpenCode | 3 |
| Ravens | 12 全维度覆盖 ✅（内存+多代理+代理通信+MCP+权限+会话层级+并行执行+工具系统+Agent循环+上下文管理+系统提示+流式） |

---

## 参考代码位置

### Claude Code 参考（`claude-code-analysis/`）
- **多代理**: `src/tools/shared/spawnMultiAgent.ts`（1093 行）
- **协调器**: `src/coordinator/coordinatorMode.ts`（369 行）
- **代理通信**: `src/utils/mailbox.ts`（73 行）+ `src/utils/teammateMailbox.ts`（1183 行）
- **权限**: `src/utils/permissions/permissions.ts` + `src/services/tools/toolExecution.ts`
- **Agent 循环**: `query.ts`（~1730 行）
- **工具执行**: `src/services/tools/toolOrchestration.ts`

### OpenCode 参考（外部）
- **仓库**: `anomalyco/ravens`
- **Agent 定义**: `packages/ravens/src/agent/agent.ts`
- **Task 工具**: `packages/ravens/src/tool/task.ts`
- **会话管理**: `packages/ravens/src/session/index.ts`
- **权限**: `packages/ravens/src/permission/evaluate.ts`

### Ravens 现有代码
- **Agent 循环**: `ravens.runtime/src/modules/runtime/service.js:46-433`
- **工具执行**: `ravens.runtime/src/modules/tools/executor.js`
- **内存**: `ravens.runtime/src/modules/runtime/memory.js`
- **流式**: `ravens.runtime/src/modules/runtime/protocol.js`

---

## 实现顺序

### P0 - 关键（影响 agent 能力上限）
1. ✅ 内存系统（已实现）
2. ✅ 多代理系统（subagent / coordinator / swarm）
3. ✅ 代理通信（文件型 mailbox + SendMessageTool）
4. ✅ MCP 集成（运行时协议 + 动态发现）

### P1 - 高（影响安全性和灵活性）
5. ✅ 权限系统（两级检查 + 通配符规则）
6. ✅ 工具系统（运行时协议对象 + 验证管道）
7. ✅ 会话层级（父-子会话 + Effect.forkChild）
8. ✅ 并行执行（Effect.forkChild 子进程）

### P1.5 - 中高（影响响应速度与用户体验）— ✅ 已完成 (2026-04-22)
9. ✅ 流式（状态机 + 并发安全工具并行）
   - **实现**: `.design/streaming-state-machine.md`
   - **代码**:
     - `streamingToolExecutor.js` (166行): 4 态模型 + Promise.all + AbortController
     - `agentExecutor.js:616-782`: 批次循环集成
     - `builtins.js`: 18 工具 isConcurrencySafe 标记
     - `protocol.js`: +TOOL_PROGRESS, +AGENT_TOOL_PROGRESS, +CIRCUIT_BREAKER_STATE_CHANGE

### P2 - 中（影响效率和可维护性）
10. ✅ Agent 循环（统一 AsyncGenerator）
11. ✅ 上下文管理（自动压缩 + 窗口监控 + 缓存指标）
12. ✅ 系统提示（分层组装 + 版本控制）

---

## 状态跟踪

| 维度 | 状态 | 验证日期 | 详细设计 |
|------|------|----------|----------|
| 内存系统 | ✅ 已完成 | 2026-04-17 | — |
| 多代理系统 | ✅ 已完成 | 2026-04-17 | `.design/multi-agent-v1-implementation.md` |
| 代理通信 | ✅ 已完成 | 2026-04-17 | `.design/agent-communication-v1-implementation.md` |
| MCP 集成 | ✅ 已完成 | 2026-04-17 | — |
| 权限系统 | ✅ 已完成 | 2026-04-17 | — |
| 工具系统 | ✅ 已完成 | 2026-04-22 | — |
| 会话层级 | ✅ 已完成 | 2026-04-22 | — |
| 并行执行 | ✅ 已完成 | 2026-04-22 | — |
| Agent 循环 | ✅ 已完成 | 2026-04-22 | — |
| 上下文管理 | ✅ 已完成 | 2026-04-22 | — |
| 系统提示 | ✅ 已完成 | 2026-04-22 | — |
| 流式 | ✅ 已完成 — StreamingToolExecutor (166行) + agentExecutor 集成 + 18 工具并发标记 | 2026-04-22 | `.design/streaming-state-machine.md` |

---

## 📐 详细设计文档索引

| 维度 | 详细设计文档 |
|------|-------------|
| 流式状态机 | `.design/streaming-state-machine.md` |
| 电路断路器 | `.design/circuit-breaker-pattern.md` |
| 语义去重 | `.design/semantic-deduplication.md` |
| 代理通信 v1 | `.design/agent-communication-v1-implementation.md` |
| 多代理 v1 | `.design/multi-agent-v1-implementation.md` |
