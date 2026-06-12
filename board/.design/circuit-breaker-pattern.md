# 电路断路器模式（Circuit Breaker Pattern）

**生成时间**: 2026-04-22
**用途**: 架构设计素材 + 开发实现指南
**对标**: Claude Code `withRetry.ts` + `errors.ts` + `autoCompact.ts`
**目标文件**: `ravens.runtime/src/lib/withRetry.js` + `ravens.runtime/src/modules/runtime/agentExecutor.js`

---

## 1. 技术原理

### 1.1 问题背景

在微服务/API 调用场景中，当下游服务（如 AI Provider API）出现故障时：

```
请求 1 → 超时 30s → 失败
请求 2 → 超时 30s → 失败  ← 用户又等了 30s
请求 3 → 超时 30s → 失败  ← 还是失败
...
```

问题在于：
1. **用户体验差**：每次都等完整超时才知道失败
2. **资源浪费**：已故障的下游还在接收请求，线程/内存/连接池被占用
3. **连锁故障**：A 服务超时 → B 服务等 A → C 服务等 B → 级联崩溃

### 1.2 核心思想

像电路保险丝一样：当电流过载时断开电路，保护整个系统。

**关键行为**：
- 正常时：请求自由通过（CLOSED 状态）
- 故障时：快速拒绝，不等待超时（OPEN 状态）
- 恢复时：试探性放行一个请求（HALF_OPEN 状态）

### 1.3 三态模型

```
                    成功率恢复
            ┌──────────────────────┐
            │                      │
            ▼                      │
     ┌──────────┐            ┌───────────┐
     │  CLOSED  │            │ HALF_OPEN │
     │ (正常通行) │ ←──探测──── │ (试探恢复) │
     └──────────┘            └───────────┘
          │                       │ 探测失败
          │ 失败率 ≥ 阈值          │
          ▼                       ▼
     ┌──────────┐            ┌───────────┐
     │   OPEN   │ ──超时──→  │ HALF_OPEN │
     │ (拒绝请求) │            │  (放1个试) │
     └──────────┘            └───────────┘
```

| 状态 | 行为 | 转换条件 |
|------|------|----------|
| **CLOSED** | 所有请求正常通过 | 失败次数 ≥ 阈值 → OPEN |
| **OPEN** | 所有请求直接返回错误（快速失败） | 超时后 → HALF_OPEN |
| **HALF_OPEN** | 放行 1 个请求试探 | 成功 → CLOSED；失败 → OPEN |

### 1.4 断路器 vs 重试：互补而非替代

| 机制 | 作用 | 适用场景 |
|------|------|----------|
| **重试** | 瞬态故障自动恢复 | 网络抖动、临时 429/529、超时 |
| **断路器** | 持续故障快速失败 | 下游宕机、配置错误、级联故障 |

**两者配合**：
1. 先重试（指数退避），处理瞬态故障
2. 重试全部失败 → 断路器跳闸
3. 断路器打开 → 后续请求不再重试，直接返回
4. 超时后试探 → 如果下游恢复，断路器自动闭合

### 1.5 指数退避（Exponential Backoff）

```
重试 1: 等待  1s
重试 2: 等待  2s
重试 3: 等待  4s
重试 4: 等待  8s
重试 5: 等待  16s (cap at MAX_DELAY)
```

加抖动（jitter）防止惊群效应：

```javascript
function getRetryDelay(attempt) {
  const base = Math.min(BASE_DELAY * Math.pow(2, attempt - 1), MAX_DELAY)
  const jitter = Math.random() * 0.25 * base
  return base + jitter
}
```

---

## 2. Claude Code 参考实现

### 2.1 Claude Code 的多层防护体系

Claude Code **没有**使用传统的三态断路器。它用多层防护替代：

| 层级 | 机制 | 文件 |
|------|------|------|
| 1. API 重试 | `withRetry.ts` (822行) - 最多10次重试 | `src/services/api/withRetry.ts` |
| 2. 错误分类 | `errors.ts` (1207行) - 8+种错误类型 | `src/services/api/errors.ts` |
| 3. 前台/后台区分 | 前台请求重试更多次 | `withRetry.ts` |
| 4. 模型回退 | Opus 不可用 → Sonnet | `errors.ts` FallbackTriggeredError |
| 5. Auto-compact 断路 | 连续3次压缩失败 → 跳过 | `src/services/compact/autoCompact.ts` |
| 6. 速率限制处理 | 429 分层级处理 | `withRetry.ts` |

### 2.2 API 重试策略详情

```typescript
const DEFAULT_MAX_RETRIES = 10
const BASE_DELAY_MS = 500
const MAX_529_RETRIES = 3          // Overloaded 连续3次 → 回退
const PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000   // 5分钟
const HEARTBEAT_INTERVAL_MS = 30_000              // 30秒心跳
```

**错误分类处理**：

| HTTP 状态码 | 处理策略 |
|-------------|----------|
| **429 Rate Limit** | 非订阅者重试；订阅者看 retry-after；fast mode 降速 |
| **529 Overloaded** | 前台源最多重试3次；后台源立即放弃 |
| **401/403 Auth** | 清缓存重试；处理 OAuth token 刷新 |
| **5xx Server** | 始终重试 |
| **400 Context Overflow** | 调小 max_tokens 重试 |
| **ECONNRESET/EPIPE** | 关闭 keep-alive 重试 |

**前台 vs 后台请求源**：

```typescript
const FOREGROUND_529_RETRY_SOURCES = new Set([
  'repl_main_thread', 'sdk', 'agent:custom', 'agent:default',
  'compact', 'hook_agent', 'verification_agent', 'side_question', 'auto_mode'
])
// 前台源：用户正在等待，值得多等几次
// 后台源：无人等待，快速失败避免级联放大
```

### 2.3 Auto-compact 断路器

```typescript
// 自动压缩的断路器（概念性）
const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
// 连续3次压缩失败后，本会话内跳过后续压缩尝试
// 避免压缩 → 失败 → 重试 → 失败的死循环
```

### 2.4 Fast Mode 降速处理

当 429 含有 long retry-after (>20s)：
1. 进入冷却期（30分钟 hold）
2. 从 fast mode → standard speed 切换
3. Overage 特定拒绝：永久禁用 fast mode

---

## 3. Ravens 当前实现

### 3.1 Per-Tool 断路器（agentExecutor.js:20-24, 53-120） — ✅ 已升级为三态

```javascript
const CircuitState = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' }

function createCircuitBreaker(threshold = 5, resetMs = 60000) {
  const failures = new Map()
  const lastFailureTime = new Map()
  const circuitStates = new Map()  // ← 新增：per-tool 三态
  const halfOpenProbe = new Map()   // ← 新增：试探追踪
  return {
    recordFailure(toolName) { /* 失败+1, >=threshold → OPEN */ },
    recordSuccess(toolName) { /* 清零 → CLOSED */ },
    isOpen(toolName) { /* CLOSED→false, OPEN→检查超时→HALF_OPEN→放行1个 */ },
    getState(toolName) { /* 返回 CLOSED/OPEN/HALF_OPEN */ },  // 新增
    getOpenCircuits() { /* 返回所有 OPEN 电路 */ },  // 新增
  }
}
```

**已升级**:
- ✅ 三态模型（CLOSED → OPEN → HALF_OPEN）
- ✅ HALF_OPEN 试探放行
- ✅ `getState()` + `getOpenCircuits()` 方法
- ✅ `isOpen()` 保留向后兼容
- ✅ `CIRCUIT_BREAKER_STATE_CHANGE` SSE 事件
- ✅ circuit_broken 错误含 `circuitState` 字段

### 3.2 工具重试（executor.js）

```javascript
// 已实现指数退避 + 抖动
function getRetryDelay(attempt) {
  const baseDelay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
  const jitter = Math.random() * 0.25 * baseDelay
  return baseDelay + jitter
}
// 有 isRetryableError() 判定
```

**状态**：✅ 已完成

### 3.3 连续失败强制停止（agentExecutor.js）

```javascript
const MAX_CONSECUTIVE_FAILURES = 3
// 连续3次工具调用失败 → 注入 STOP 消息 → 强制模型不再调工具
```

**状态**：✅ 已完成（上次会话添加）

### 3.4 错误分类（agentExecutor.js categorizeError）

```javascript
const ERROR_CATEGORIES = {
  TIMEOUT_ERROR,      // 超时
  PROVIDER_ERROR,    // 网络/服务不可用
  VALIDATION_ERROR,  // 参数校验失败
  PERMISSION_ERROR,  // 权限拒绝
  TOOL_ERROR,        // 工具执行失败
  SYSTEM_ERROR,      // 未知系统错误
}
```

**问题**：太粗粒度。Claude Code 有 8+ 种细分（429/529/401/403/ECONNRESET/context overflow/overloaded/server error）

---

## 4. Ravens 目标架构

### 4.1 三层防护体系

```
Layer 1: API 重试层（新增）
  │ withRetry() — 指数退避，429/529/5xx 分层处理
  │ 最多 10 次重试
  ▼
Layer 2: Per-Tool 断路器（已有，需增强）
  │ createCircuitBreaker() — CLOSED → OPEN → HALF_OPEN
  │ 阈值 5 次，60s 重置
  ▼
Layer 3: Agent Loop 保护（已有）
  │ consecutiveFailures ≥ 3 → STOP
  │ buildFallbackResponse() → 优雅降级
```

### 4.2 API 重试层 — ✅ 已实现 (2026-04-22)

文件：`ravens.runtime/src/lib/withRetry.js` (86行)

```javascript
const DEFAULT_MAX_RETRIES = 10
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 16000
const MAX_529_CONSECUTIVE = 3

// RETRY_POLICIES：10种错误分类 → 不同重试策略
SERVICE_OVERLOADED  → maxConsecutive:3 + respectRetryAfter
RATE_LIMITED        → Infinity 重试 + respectRetryAfter
API_ERROR/SERVICE_UNAVAILABLE/NETWORK_ERROR/TIMEOUT → retry
AUTH_FAILED          → maxRetries:2
PERMISSION_DENIED/NOT_FOUND/INVALID_REQUEST/CANCELLED → no retry

export function withRetry(fn, options) { /* 指数退避 + 25% 抖动 */ }
export function isRetryableError(error) { /* 基于 parseError 分类 */ }
```

### 4.3 断路器状态机 — ✅ 已实现 (2026-04-22)

`agentExecutor.js:20-24, 53-120` 已升级为三态模型，设计草稿中的伪代码与实际实现高度一致。

```javascript
// 实际实现（已验证）
const CircuitState = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' }

function createCircuitBreaker(threshold = 5, resetMs = 60000) {
  // per-tool: failures Map, lastFailureTime Map, circuitStates Map, halfOpenProbe Map
  return {
    recordFailure(toolName) { /* 失败+1, >=threshold → OPEN */ },
    recordSuccess(toolName) { /* 清零 → CLOSED */ },
    isOpen(toolName) { /* CLOSED→false, OPEN→check超时→HALF_OPEN, HALF_OPEN→放行1个 */ },
    getState(toolName) { /* 返回 CLOSED/OPEN/HALF_OPEN */ },
    getOpenCircuits() { /* 返回所有 OPEN 电路 */ },
  }
}
```

---

## 5. 实现检查清单

### Phase 1: API 重试层 — ✅ 已实现 (2026-04-22)

- [x] 创建 `ravens.runtime/src/lib/withRetry.js`（86行）
- [x] 实现指数退避 + 25% 抖动重试（BASE_DELAY_MS=500, MAX_DELAY_MS=16000）
- [x] 错误分类：10 种 → RETRY_POLICIES 映射（SERVICE_OVERLOADED/RATE_LIMITED/API_ERROR/SERVICE_UNAVAILABLE/NETWORK_ERROR/TIMEOUT/AUTH_FAILED/PERMISSION_DENIED/NOT_FOUND/INVALID_REQUEST/CANCELLED/CUSTOM_ERROR）
- [x] 429 读取 `retry-after` header（respectRetryAfter）
- [x] 最大重试次数限制（DEFAULT_MAX_RETRIES=10）
- [x] 529 过载保护：MAX_529_CONSECUTIVE=3 → OVERLOAD_PERSISTENT
- [x] 导出 `withRetry(fn, options)` + `isRetryableError(error)`
- [x] 验证：529 过载保护 → 连续3次 529 抛 OVERLOAD_PERSISTENT（api-retry.test.js 验证）

### Phase 2: 断路器状态机增强 — ✅ 已实现 (2026-04-22)

- [x] `agentExecutor.js` L20-24: `CircuitState` 常量（CLOSED/OPEN/HALF_OPEN）
- [x] L53-120: `createCircuitBreaker()` 升级为三态模型
- [x] HALF_OPEN 只放行一个请求试探
- [x] 试探成功 → CLOSED；失败 → 回 OPEN
- [x] 暴露 `getState(toolName)` + `getOpenCircuits()` 方法
- [x] `isOpen()` 保留向后兼容（返回 boolean）
- [x] circuit_broken 错误输出含 `circuitState` 字段（L~371, L~690）
- [x] `protocol.js` 新增 `CIRCUIT_BREAKER_STATE_CHANGE` 事件类型
- [x] 验证：5次失败 → OPEN → 60s后 HALF_OPEN → 1次成功 → CLOSED（circuit-breaker.test.js 验证）

### Phase 3: 前台/后台请求源区分 — ⬜ 未实现

- [ ] 定义请求源类型（foreground/background）
- [ ] 前台源（用户等待）：529 重试3次
- [ ] 后台源（无人等待）：529 立即放弃
- [ ] 验证：后台 compact 请求 529 → 不重试直接返回

### Phase 4: 断路器状态可观测 — 🟡 部分实现

- [x] 断路器状态变化产出 SSE 事件（CIRCUIT_BREAKER_STATE_CHANGE 已定义）
- [x] Board 前端 `chats.hooks.js` circuit_breaker_state_change 事件处理
- [x] Board 前端 `ChatPage.jsx` circuit broken 工具卡片状态显示
- [x] 验证：断路器 3 态转换 — circuit-breaker.test.js 8/8 pass（CLOSED→OPEN→HALF_OPEN→CLOSED 循环验证）

### Phase 5: 模型回退 — ⬜ 未实现（可选）

- [ ] 定义模型优先级链（opus → sonnet → haiku）
- [ ] 主模型连续失败 → 尝试回退模型
- [ ] 回退成功 → 继续使用回退模型
- [ ] 验证：Opus 529 → 自动降级到 Sonnet

---

## 6. 与其他系统的关系

| 系统 | 断路器交互 |
|------|-----------|
| **流式状态机** | StreamingToolExecutor 检查断路器状态，OPEN 的工具不入队 |
| **工具重试** | 重试失败后 → 断路器 recordFailure() |
| **上下文压缩** | auto-compact 有独立断路器（3次失败 → 停止压缩） |
| **Agent 循环** | consecutiveFailures ≥ 3 → 断路器之外的强制停止 |
| **前端 UI** | 断路器 OPEN 时工具卡片显示 "service unavailable" |

---

## 参考

- Claude Code `src/services/api/withRetry.ts` (822行) — API 重试策略
- Claude Code `src/services/api/errors.ts` (1207行) — 错误分类
- Claude Code `src/services/compact/autoCompact.ts` (351行) — compact 断路器
- Claude Code `src/services/tools/toolExecution.ts` (1460+行) — 工具执行断路器
- ravens.runtime `src/modules/runtime/agentExecutor.js:46-71` — 当前断路器
- ravens.runtime `src/modules/tools/executor.js:43-47` — 工具重试