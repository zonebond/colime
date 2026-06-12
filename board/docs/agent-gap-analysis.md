# ravens Agent 能力差距分析

**日期**: 2026-04-23
**对比对象**: Claude Code / OhMyOpenCode / Manus AI
**分析范围**: ravens.runtime + ravens.board

---

## 一、能力缺失（Capability Gaps）— 代码完全没有或已被删除

### 🔴 P0: 精确代码编辑（Line-level Editing）

| 对比 | Claude Code | ravens |
|------|-------------|--------|
| **机制** | `FileEditTool` — `old_string` → `new_string` 行级替换（625 LOC） | 只有 `write` 全文件覆盖（无行级编辑） |
| **防冲突** | 时间戳+内容哈希双重检测文件是否被修改过 | ✅ `requiresStalenessCheck` + `checkFileStaleness()` |
| **引号保护** | `preserveQuoteStyle()` 保留弯引号/直引号 | ✅ `editMatch.js` — `preserveQuoteStyle()` |
| **多匹配处理** | `replace_all` 标记处理多处匹配 | ✅ 已支持 `replace_all` |
| **历史/撤销** | `fileHistory.ts` — 消息ID为key，100版本快照 | ✅ `fileHistory.js` — `trackFile()` + `restoreFile()` |
| **LSP通知** | 每次编辑后通知语言服务器更新 | ✅ 每次 Write/Edit 后自动 LSP diagnostics |

**状态**: ✅ 已实现 (2026-04-26)。`edit` + `patch` 工具支持行级/多文件编辑，含 staleness 检测、引号保护、模糊匹配、原子写入。

---

### 🔴 P0: LSP / 代码智能体（Code Intelligence）

| 对比 | Claude Code | ravens |
|------|-------------|--------|
| **工具** | `LSPTool.ts`（860 LOC）— 完整 LSP 集成 | ✅ `code_intelligence` — 10 种 LSP 操作 |
| **能力** | goToDefinition, findReferences, documentSymbol, workspaceSymbol, implementation, callHierarchy | ✅ 全部 10 种操作已实现 |
| **语言服务器** | `LSPServerManager.ts` — 多服务器协调 | ✅ LSP Server Manager 已实现 |
| **自动推荐** | `lspRecommendation.ts` — 按项目类型推荐 LSP | ✅ 自动检测 + 配置 |

**状态**: ✅ 已实现 (2026-04-26)。Agent 现在有完整的代码智能。

---

### 🔴 P0: Bash 安全验证（Bash Security）

| 对比 | Claude Code | ravens |
|------|-------------|--------|
| **安全文件** | `bashSecurity.ts` — **2592行**，20+检查类别 | ❌ **零** |
| **命令替换** | 阻止 `$()`, 反引号, `${}`, `$[]` | ❌ 无 |
| **重定向剥离** | 安全过滤 `2>&1`, `>/dev/null` | ❌ 无 |
| **Heredoc** | 精确解析 `cat <<'EOF'` 安全性 | ❌ 无 |
| **混淆检测** | ANSI-C 引号、空引号、locale quoting | ❌ 无 |
| **权限模式** | `bypassPermissions` / `acceptEdits` / `auto` | ❌ 纯指令防御（LLM被告知忽略冲突），无运行时强制 |

**影响**: 任何恶意或误写的 bash 命令都会在宿主机上直接执行。安全风险极高。

---

### 🔴 P0: 检查点/回滚（Checkpoint/Rollback）

| 对比 | Claude Code | ravens |
|------|-------------|--------|
| **快照系统** | `fileHistory.ts` — 100版本，内容哈希备份 | ❌ **已删除** |
| **回滚命令** | `/rewind` 命令 → 选择消息 → 恢复文件状态 | ❌ `/sessions/:id/checkpoints` 返回 404 |
| **会话恢复** | `sessionRestore.ts` — 完整状态恢复 | ❌ 无 |
| **差异统计** | 追踪每次快照的 insertions/deletions | ❌ 无 |

**影响**: Agent 出错后无法"回到上一版"，用户只能手动修复。

---

### 🔴 P0: 代码库索引/搜索（Codebase Indexing）

| 对比 | Claude Code / Manus | ravens |
|------|---------------------|--------|
| **索引方式** | Claude Code: LSP symbols; Manus: AST parsing + dependency graph | ❌ 只有 O(n) grep 扫描 |
| **语义搜索** | Manus: "找到处理 user auth 的代码" | ❌ 无 |
| **文件树理解** | AST 分析代码结构 | ❌ 无 |

**影响**: 大代码库中 Agent 搜索效率低，无法理解"这个函数做了什么"。

---

### 🟡 P1: 浏览器自动化（Browser Automation）

| 对比 | Manus | ravens |
|------|-------|--------|
| **能力** | Browser Operator（本地/云端双模式），点击、输入、提取、多步工作流 | ❌ 无 |
| **场景** | 抓取需要登录的页面、自动填表、截图对比 | ❌ 无 |

---

### 🟡 P1: 规划模式（Plan Mode）

| 对比 | Claude Code | ravens |
|------|-------------|--------|
| **Plan Agent** | `planAgent.ts` — 只读模式，禁止编辑文件 | ❌ 无 |
| **V2 多Agent** | `planModeV2.ts` — 最多3个规划Agent并行 | ❌ 无 |
| **访谈阶段** | 规划前问需求澄清问题 | ❌ 无 |

---

### 🟡 P2: 沙箱隔离（Sandboxing）

| 对比 | Manus | ravens |
|------|-------|--------|
| **隔离级别** | 每个任务独立云端 VM，零信任模型 | ❌ 无 — Agent 直接运行在 Runtime 宿主机上 |
| **生命周期** | sleep/wake 持久化 | ❌ 无 |

---

## 二、实现不足（Implementation Gaps）— 代码有但不够生产级

### 🟡 P1: 文件编辑（实现级别 1/5）

- 已有 `write` 工具，但只支持**全文件覆盖**
- 无 diff/patch 应用能力
- 文件 staleness detection 只警告不阻止
- **需实现**: `edit` 工具（old_string → new_string）

### 🟡 P1: 工具执行（实现级别 3/5）

**已有:**
- `StreamingToolExecutor` — 状态机（QUEUED→EXECUTING→COMPLETED）
- 并发安全工具并行执行（`isConcurrencySafe` 标记）
- 指数退避重试（1s~8s, 3次）
- Bash 流式输出 progress 回调

**不足:**
- 工具超时一刀切（bash 固定 120s，无 per-tool 配置）
- 重试不区分幂等/非幂等工具
- 非并发安全工具**永远串行**，无法优化

### 🟡 P1: Agent 自主性（实现级别 2/5）

**已有:**
- `maxSteps=8` 硬编码循环
- diminishing returns 检测（3轮 <500 tokens 自动终止）
- circuit breaker（5次失败熔断）
- idle timeout（90s 无活动终止）

**不足:**
- `maxSteps=8` **硬编码**，无法根据任务复杂度动态调整
- **无规划模式** — Agent 不会先规划再执行，是"边做边想"
- **无自我修改能力** — 不能 spawn 新 Agent 或改变行为
- **无 handoff** — 不能把工作转给其他 Agent

### 🟡 P1: 子Agent编排（实现级别 2/5）

**已有:**
- `coordinator.js` — 4阶段工作流（Research→Synthesis→Implementation→Verification）
- `spawn_agent`, `list_agents`, `stop_agent` 工具
- `mailbox.js` — 30s 超时阻塞消息

**不足:**
- **Agent 间无直接对话** — 只有 Coordinator→Worker，无 Peer 通信
- **Mailbox 纯内存** — Runtime 重启后全部丢失
- **Worker 只执行一次** — 不能迭代循环

### 🟢 P1: 上下文压缩（实现级别 4/5）

**已有:**
- `ContextManager` — token-aware compaction，200k 窗口
- 三级压缩策略：LLM compression → microCompaction → auto-trigger
- Round-preserving truncation
- Session summary 持久化（结构化 9-section summaries）

**待改善:**
- **跨会话记忆** — 只有 session 级 summary，无 vector/semantic 检索
- **Agent 自主触发** — 仅自动触发，Agent 无法显式请求压缩

### 🟡 P1: MCP 集成（实现级别 2/5）

**已有:**
- MCP client（253 LOC）— stdio 传输、重连退避、工具名 mangling
- `mcp__server__tool` 命名空间隔离

**不足:**
- **无内置 MCP 服务器** — 只能连外部服务器
- **仅支持 STDIO** — 不支持 HTTP/SSE 远程 MCP
- **无动态发现** — 不会自动检测项目类型推荐 MCP 服务器
- **工具数量不管理** — 可能给 Agent 塞入过多工具

### 🟡 P2: 前端可观测性（实现级别 4/5）

**已有（做的很好）:**
- ThinkingBlock — 可折叠思考内容、步骤卡片、状态徽章
- ToolResultBlock — 7种工具状态、进度条、耗时计时
- PhaseProgressBar — 4阶段可视化
- AgentSelector — 模态框搜索、键盘导航

**不足:**
- **无 Token 预算实时显示**
- **无执行时间线** — 没有 Gantt 式并行视图
- **无单 Agent 进度** — Swarm 中的各 Agent 没有独立 UI

---

## 三、 ravens 已有的世界级基础设施

| 能力 | 状态 | 对标 |
|------|------|------|
| **Agent 执行循环** | 生产级 — 1173行 `agentExecutor.js` | ✅ 同级 |
| **SSE 流式反馈** | dual-track 模式 | ✅ 同级 Claude Code |
| **Memory 系统** | 跨会话持久化 | ✅ 同级 |
| **Context Assembly** | promptAssembler + systemPrompt | ✅ 同级 |
| **工具注册框架** | 动态 MCP + 内置工具 | ✅ 同级 |
| **权限引擎** | 规则匹配 + 确认/否认/询问 | ⚠️ 有但弱 |
| **前端渲染** | Thinking blocks、Tool cards、Timeline | ✅ 同级 |

---

## 四、差距雷达图

```
                    LSP/代码理解 🟢
                         │
    浏览器自动化 🟡 ─────┼───── 文件编辑 🟢
                         │
    规划模式 🟡 ─────────┼──────── Bash 安全 🔴
                         │
    沙箱隔离 🟡 ─────────┼──────── 检查点/回滚 🟡
                         │
    代码库索引 🔴 ───────┴────── 安全权限运行时强制 🟡
```

---

## 五、优先行动建议

| 优先级 | 行动 | 为什么最优先 |
|--------|------|-------------|
| **🔴 P0** | **Bash 安全验证（命令替换+重定向）** | 安全风险极高 — 直接 spawn 无验证 |
| **🟡 P1** | **AST 语义搜索（tree-sitter）** | 结构化代码理解 > 纯 grep |
| **🟡 P1** | **会话管理工具（session_list/read/search）** | 跨会话记忆检索 |
| **🟡 P1** | **Task CRUD（创建/跟踪任务）** | 多步骤任务编排 |
| **🟡 P1** | **后台 Agent 结果收集（background_output）** | 并行子 Agent 支持 |
| **🟡 P2** | **Vector memory / 语义搜索** | 跨会话长期记忆 |

✅ 已实现: edit 行级编辑 | LSP 代码智能 | Context 压缩 | Web 搜索 | 文件历史 | Patch 多文件编辑

---

**关键洞察**: ravens 的**基础设施（Runtime 架构、流式 UI、工具框架、LSP 集成）已经世界级**。2026-04-26 更新：edit 行级编辑、LSP 代码智能、Context 压缩、文件历史/patch 均已完成。当前真正的差距集中在**Bash 安全验证**（P0）和**AST 语义搜索**（P1）。
