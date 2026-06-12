# 语义去重（Semantic Deduplication）

**生成时间**: 2026-04-22
**用途**: 架构设计素材 + 开发实现指南
**对标**: Claude Code（隐式，模型自身不产生重复）
**目标文件**: `ravens.runtime/src/modules/runtime/agentExecutor.js`

---

## 1. 技术原理

### 1.1 问题背景

在 Agent 执行过程中，模型有时会在一次回复中产生多个意图相同或高度相似的工具调用：

**场景 A — 完全重复**：
```
模型返回 3 个工具调用：
  1. Read("src/config.js")
  2. Read("src/config.js")       ← 完全相同
  3. Read("src/config.ts")       ← 不同文件
```

**场景 B — 语义重复**：
```
模型返回 3 个工具调用：
  1. Grep("error handling", "src/")
  2. Grep("error handling pattern", "src/")  ← 意图相同
  3. Read("src/error.js")                    ← 独立意图
```

**场景 C — 结果已缓存**：
```
模型返回 2 个工具调用：
  1. Read("src/utils.js")     ← 5轮前已读过，内容未变
  2. Read("src/new-file.js")  ← 首次读取
```

### 1.2 去重层级

| 层级 | 名称 | 检测方式 | 难度 | 收益 |
|------|------|----------|------|------|
| **L1** | 完全重复 | 参数完全相同 | 低 | 高（消除模型冗余调用） |
| **L2** | 语义重复 | 意图相似度匹配 | 中 | 中（合并同义调用） |
| **L3** | 缓存命中 | 结果已存在且未变 | 中 | 高（省去重复 I/O） |

### 1.3 L1 — 完全重复去重

最简单，比较参数是否完全相同：

```javascript
function dedupExact(toolUses) {
  const seen = new Map()  // key: "toolName:serializedInput"
  const unique = []
  const deduplicated = []

  for (const toolUse of toolUses) {
    const key = `${toolUse.name}:${JSON.stringify(toolUse.input)}`
    if (seen.has(key)) {
      deduplicated.push({ original: toolUse, duplicateOf: seen.get(key) })
    } else {
      seen.set(key, toolUse)
      unique.push(toolUse)
    }
  }
  return { unique, deduplicated }
}
```

### 1.4 L2 — 语义重复去重

检测意图相似的工具调用。例如两个 Grep 搜索的区别仅在 keyword 细节：

```javascript
function dedupSemantic(toolUses) {
  // 策略：同类型 + 同 scope + 相似参数 → 合并
  // 例：Grep("error", src/) + Grep("error handling", src/)
  //   → 保留更宽泛的那个 ("error")
  //   → 或合并为 Grep("error|error handling", src/)
}
```

**实现挑战**：
- "相似"的定义不精确，误合并可能导致丢失有用结果
- 不同工具类型的语义等价性难以判定
- 收益不稳定——好模型很少产生语义重复

### 1.5 L3 — 缓存命中去重

如果工具调用结果已在当前上下文窗口内，可以直接复用：

```javascript
function dedupCached(toolUses, contextHistory) {
  // 检查上次 Read("src/config.js") 的结果是否还在上下文中
  // 如果文件未被修改，直接复用结果
  // 需要：文件修改时间追踪 + 结果 TTL
}
```

**Claude Code 的做法**：通过 `promptCacheBreakDetection.ts` 追踪缓存命中/断裂，但不是去重——它优化的是 API prompt cache 命中率，不是消除重复工具调用。

---

## 2. Claude Code 参考

### 2.1 为什么 Claude Code 不需要显式去重？

1. **模型训练**：Claude 模型极少产生冗余工具调用（训练数据使然）
2. **StreamingToolExecutor 的 TrackedTool**：每个工具调用有唯一 `id`，自然去掉了同一 id 的重复
3. **上下文足够大**：200k 窗口意味着通常不会因为遗忘而重复调用

### 2.2 何时可能产生重复？

| 场景 | 原因 | 频率 |
|------|------|------|
| 上下文压缩后 | 压缩丢弃了之前工具调用细节，模型重新请求 | 低-中 |
| 复杂多步任务 | 任务太多细节，模型"忘记"已读过某个文件 | 中 |
| 廉价模型 | 小模型更容易产生冗余调用 | 高 |

### 2.3 OpenCode 的做法

OpenCode 不做显式去重。其 `agent.ts` 执行循环与 Claude Code 类似，依赖模型自身质量。

---

## 3. Ravens 实现方案

### 3.1 推荐策略：先 L1，L2/L3 按需

| 阶段 | 实现 | 优先级 | 理由 |
|------|------|--------|------|
| **Phase 1** | L1 完全重复去重 | P2 | 实现简单（~50行），消除确定性浪费 |
| **Phase 2** | L3 缓存命中 | P3 | 需要文件修改时间追踪，复杂度中等 |
| **Phase 3** | L2 语义重复 | P4 | 定义模糊，收益不确定，风险高 |

### 3.2 Phase 1: 完全重复去重

**集成位置**：`agentExecutor.js`，在工具执行前

```javascript
function dedupToolUses(toolUses) {
  const seen = new Map()
  return toolUses.filter(toolUse => {
    const key = `${toolUse.name}:${JSON.stringify(toolUse.input)}`
    if (seen.has(key)) {
      // 复制第一个调用的结果给重复的
      return false
    }
    seen.set(key, toolUse)
    return true
  })
}

// 在执行循环中使用
const uniqueToolUses = dedupToolUses(toolUses)
// 对被去重的工具，直接用已执行结果填充 tool_result
```

**SSE 事件**：去重的工具产出 `tool_deduplicated` 事件，前端可展示为灰色标记。

### 3.3 Phase 2: 缓存命中（可选）

```javascript
const toolResultCache = new Map()  // key: "toolName:input" → { result, timestamp, fileMtime }

async function getCachedOrExecute(toolUse) {
  const cacheKey = `${toolUse.name}:${JSON.stringify(toolUse.input)}`
  const cached = toolResultCache.get(cacheKey)

  if (cached && isCacheValid(cached)) {
    return { ...cached.result, fromCache: true }
  }

  const result = await executeTool(toolUse)
  toolResultCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
    fileMtime: await getFileMtime(toolUse),  // 仅 Read 工具需要
  })
  return result
}
```

**缓存失效策略**：
- Read 工具：检查文件修改时间 (`mtime`)
- Grep 工具：TTL 60秒
- Bash 工具：不缓存（副作用）
- Write 工具：写入后清除相关 Read 缓存

### 3.4 去重与流式状态机的交互

```
StreamingToolExecutor.addTool()
  │
  ├── L1 去重检查
  │     ├── 重复 → 标记 deduplicated，不入队
  │     └── 唯一 → 入队 queued
  │
  ├── L3 缓存检查（如果有）
  │     ├── 命中 → 直接 completed，results = cached
  │     └── 未命中 → 入队 queued
  │
  └── 正常流程 → executing → completed → yielded
```

---

## 4. 实现检查清单

### Phase 1: L1 完全重复去重 — ✅ 已完成 (2026-04-22)

- [x] `DeduplicationManager` 类已存在（`ravens.runtime/src/modules/runtime/deduplication.js`, 98行）
  - `inFlightRequests` + `cache` + TTL（5000ms 默认）
  - `createCacheKey({ toolName, input })` 生成去重 key
  - `dedupRequest(key, fn, { ttl })` 防止并发相同请求
- [x] `executor.js:105-119` 已集成 dedup（`isReadOnly` 工具自动去重）+ `onDedup` 回调
- [x] `builtins.js` 已标记 `isReadOnly`
- [x] `deduplication.js` `dedupRequest()` 返回 `{ result, deduped, dedupType }` 元数据
- [x] SSE `TOOL_DEDUPED` / `AGENT_TOOL_DEDUPED` 事件（`protocol.js`）
- [x] `agentExecutor.js:726-735` 通过 `onDedup` 回调触发 emitBuffer
- [x] Board 前端 `chats.hooks.js` tool_deduped 事件处理
- [x] Board 前端 `ChatPage.jsx` deduped badge 显示

### Phase 2: L3 缓存命中（可选）

- [ ] 实现 `toolResultCache` Map
- [ ] Read 工具缓存 + mtime 失效检查
- [ ] Grep 工具缓存 + TTL 失效
- [ ] Write 工具后清除相关缓存
- [ ] SSE 产出 `tool_cache_hit` 事件
- [ ] 验证：同一文件连续 Read 2次 → 第二次命中缓存

### Phase 3: L2 语义去重（可选）

- [ ] 定义同类型工具的语义等价规则
- [ ] Grep 参数相似度匹配（keyword 子集关系）
- [ ] 合并策略：保留更宽泛的搜索
- [ ] 验证：确保不误合并有差异的调用

---

## 5. 性能预期

| 场景 | 无去重 | L1 去重 | L1+L3 缓存 |
|------|--------|---------|------------|
| 2个相同 Read | 2次 I/O | 1次 I/O | 1次 I/O |
| 5轮后重读同一文件 | 1次 I/O | 1次 I/O | 0次 I/O（缓存命中） |
| 2个相似 Grep | 2次执行 | 2次执行 | 1次执行（需 L2） |
| 无重复调用的正常场景 | N次执行 | N次执行 | N次执行 |

**结论**：L1 开销几乎为零，L3 有条件高收益。L2 性价比低。

---

## 6. 优先级评估

| 因素 | 评估 |
|------|------|
| **实现难度** | L1 极低（~50行），L3 中等（~200行），L2 高（无明确算法） |
| **收益确定性** | L1 确定（消除已知浪费），L3 有条件收益，L2 不确定 |
| **风险** | L1 几乎无风险，L3 可能有缓存一致性风险，L2 可能误合并 |
| **模型质量依赖** | 好模型几乎不需要去重；差模型收益大 |
| **推荐** | **L1 先做**（简单确定），L3 后做（条件收益），L2 暂缓（风险大） |

**优先级**：P2（L1），P3（L3），P4 不做（L2）

---

## 参考

- Claude Code `src/services/tools/StreamingToolExecutor.ts` — TrackedTool 唯一 ID
- Claude Code `src/services/api/promptCacheBreakDetection.ts` — 缓存命中检测
- ravens.runtime `src/modules/runtime/agentExecutor.js` — 执行循环
- ravens.runtime `src/modules/runtime/contextManager.js` — 上下文窗口管理