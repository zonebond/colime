## 3. Ravens Agent 系统架构

### 3.1 三服务直连架构

Ravens 采用三服务直连架构（Direct-Connect Architecture），每个服务有明确的职责边界，不交叉，不代理。这是经过实际迭代验证的设计决策，不是理论推演。

```
Board (10001) — React SPA 用户界面层
  │
  ├── SSE 直连 ──────→ Runtime (10011) — Agent 执行引擎
  │                     │ Agent 执行循环、工具系统、MCP、记忆系统
  │                     │ 上下文组装、历史压缩、SSE 事件直推
  │
  └── REST API ─────→ Core (10010) — 数据持久层
                       │ Session/Project/Message CRUD、SQLite 持久化
                       │ 文件元数据 + MinIO 对象存储
                       │ Provider/Agent/Model 配置管理
                       │ 纯 CRUD，不代理 Runtime
```

**关键设计决策：Board 直连 Runtime，绕过 Core。**

传统三服务架构中，前端请求经过 Core 转发到 Runtime，每一跳带来延迟叠加和故障点增生。Ravens 的 Direct-Connect 模式让 Board 通过 Vite 代理直连 Runtime SSE 端点，Core 只负责 CRUD 持久化，不参与任何实时数据转发。这意味着每个流式请求少一跳，延迟更低，故障链更短。

Vite 代理配置验证了这一边界：`/core` 路由转发到 Core:10010（strip 前缀），`/runtime` 路由转发到 Runtime:10011（strip 前缀），两条路径零交叉。

### 3.2 服务职责详解

#### Board：用户界面层

Board 是用户直接交互的界面层，承担三件事：SSE 事件消费、状态渲染、错误展示。

**SSE 双轨消费模式（Dual-Track）**

Board 采用 Claude Code 验证过的双轨模式：SSE 事件驱动乐观更新，`conversation_persisted` 事件驱动权威状态替换。SSE 事件让用户在 Agent 思考和工具执行的每个阶段都能看到实时反馈，而 `conversation_persisted` 作为唯一事实来源，在流式结束后用原子替换（Atomic Replace）覆盖乐观状态。注意是替换，不是合并。原子替换消除了错误状态合并带来的整类 Bug。

**100ms 合并缓冲（Coalescing Buffer）**

没有缓冲时，每个 SSE 事件触发一次 React 重渲染。Agent 执行一轮可能产生几十个事件（thinking_step、tool_started、tool_progress、tool_finished、message_delta），不做降频就是渲染风暴。Ravens 在 Board 层实现 100ms 合并缓冲：非终端事件在 100ms 窗口内合并，终端事件（如 RUN_COMPLETED）立即刷出。实际效果是将渲染频率从 N 次/事件 降到 N/batch 次/100ms。

**错误展示链路**

错误从 Runtime 的 `categorizeError()` 出发，经过 `service.js` 的 `RUN_FAILED` 错误码，映射到 `chats.hooks.js` 的 `ERROR_CODE_MAP`，最终由 `ChatPage.jsx` 的 `ERROR_CODE_TO_I18N_KEY` 翻译为用户可读的 i18n 文本。整条链路保证用户看到的不是 `ECONNREFUSED`，而是"连接被拒绝，请检查网络"。

#### Core：数据持久层

Core 只做 CRUD，不做代理。这是被踩过的坑验证出来的设计。

早期架构中，Core 既做 CRUD 又做 Runtime 代理（Conversation Proxy），将请求转发到 Runtime 再把 SSE 事件回传给 Board。这带来了两个问题：（1）每次流式请求多一跳延迟；（2）Core 需要维护代理逻辑，上下文组装代码一旦改动，Core 的代理可能过时。

剥离代理后，Core 的职责变得极简：

| 职责 | 技术 | 说明 |
|------|------|------|
| Session/Project CRUD | SQLite | 业务实体的增删查改 |
| Message 持久化 | SQLite `transcript_events`, `messages` | 聊天消息存储 |
| 文件/附件管理 | SQLite 元数据 + MinIO 对象存储 | 上传、元数据索引、资源归属 |
| Provider 配置 | SQLite | API Key、模型参数、Agent 配置 |
| Runtime Contract 构建 | `runtimeContract.js` ~100 行 | 从 DB 数据拼装 Runtime 执行契约 |

Core 不再拥有 Memory 路由、Context 路由、Checkpoint 路由。这些路由已经被删除，访问返回 404。

#### Runtime：Agent 执行引擎

Runtime 是系统的能力核心。它不仅是 Agent 的执行器，还是记忆、上下文、压缩的唯一管理者。

**"Inside Agent" 设计哲学**

这是 Ravens 架构最重要的设计决策，值得展开说明。

在早期架构中，Context 由 Core 组装后传给 Runtime 执行。问题在于：Core 认为 Runtime 需要的上下文，和 Runtime 实际需要的不一致。Core 的上下文基于 DB 快照，Runtime 的上下文基于实时 Token 计数。三服务架构中的每一层转换都可能引入漂移（Drift）。

"Inside Agent" 模式把上下文组装、记忆管理、历史压缩全部放进 Runtime。这么做的原因有三个：

（1）**行业验证**。Claude Code、CrewAI 等成功的 Agent 框架都把记忆放在 Agent 内部。把它们拿出去了的系统（LangGraph、AutoGen）在多服务架构中会遇到上下文失配问题，因为它们没有三层转换。

（2）**消除转换漂移**。Runtime 自己组装上下文，Core 只需提供原始数据，不做解释。减少一层语义转换，减少一类 Bug。

（3）**压缩必须与 Token 追踪同处**。Core 的压缩是延迟后台进程，操作的是 DB 中的过时数据。Runtime 的 ContextManager 在每次 API 调用时追踪 Token 使用量，基于实时状态决策何时压缩、压缩什么。这是 `AUTOCOMPACT_BUFFER=13000` 能生效的前提：它需要在 Token 预算逼近上限时准确触发。

Runtime 的完整职责清单：

| 能力 | 实现位置 | 行数 |
|------|----------|------|
| Agent 执行循环 | `agentExecutor.js` | 1173 行 |
| 工具系统 | `builtins.js` + `executor.js` + `streamingToolExecutor.js` | 166+行 |
| MCP 集成 | `mcp/client.js` + `mcp/tools.js` | 253+行 |
| 记忆系统 | `memory/` 目录（paths/scanning/CRUD/recall/tools） | 5 文件 |
| 上下文组装 | `context.js` | ~200 行 |
| 历史压缩 | `contextManager.js` | ~700 行 |
| 流式事件生产 | `protocol.js` | 21+ 事件类型 |
| Provider 管理 | 模型调用路由 | — |

### 3.3 十二维度能力矩阵

Ravens 在 Agent 能力的 12 个关键维度上全部实现了功能覆盖。以下逐一展开。

---

#### 维度 1：Memory — 五层记忆体系

Agent 的记忆不是"记住上次聊了什么"这么简单。Ravens 设计了五层记忆体系，每一层解决不同的记忆问题。

**五层结构**

| 层 | 名称 | 生命周期 | 用途 |
|---|------|---------|------|
| Auto | 自动记忆 | 跨会话 | Agent 自动保存的项目知识 |
| Session | 会话记忆 | 单次会话 | 当前对话的短期上下文 |
| Agent | Agent 记忆 | Agent 实例 | 子 Agent 的执行结论 |
| Team | 团队记忆 | 协作周期 | 多 Agent 协作的共享状态 |
| Recall | 召回记忆 | 永久 | 从记忆库中按相关性检索 |

记忆文件存储在 `~/.claude/projects/{sanitizedProjectPath}/memory/` 目录下，跨会话持久化。格式为带 YAML Frontmatter 的 Markdown，支持 4 种类型标记（user/feedback/project/reference）。

**SQLite-first 混合 RAG 检索**

记忆检索采用混合策略，不是纯向量检索，不是纯关键词匹配。五维加权评分公式：

```
final_score = 
  0.45 × normalized_vector_score    // 语义相似度占主导
+ 0.35 × normalized_keyword_score   // 关键词保证精确命中（路径、符号、术语）
+ 0.10 × importance_score           // 重要性加权（架构/决策记忆高于普通笔记）
+ 0.05 × recency_score              // 时效性加权
+ 0.05 × source_type_score          // 来源类型加权
```

关键技术选型：

- **FTS5**：SQLite 内置全文搜索引擎，Porter 词干提取 + Unicode61 分词。保证精确路径和符号名永远不丢失。
- **sqlite-vec**：SQLite 的向量扩展，支持高维向量近邻搜索。优先使用，不可用时退化为文件型向量索引。
- **文件退路**：向量数据存为 `vectors.jsonl`，Node.js 侧计算余弦相似度。不依赖外部向量数据库。

这种设计的核心收益：零外部依赖。不需要 Chroma、Pinecone 或 Milvus，部署复杂度保持在 SQLite 单文件级别。

---

#### 维度 2：Multi-Agent — Coordinator 四阶段工作流

Ravens 的多 Agent 协作不是简单的"生成一个子 Agent 跑任务"。它采用 Coordinator 模式，由协调器 Agent 统一调度，经过四个阶段。

**Coordinator 四阶段**

```
Research（研究）→ Synthesis（综合）→ Implementation（实施）→ Verification（验证）
```

每个阶段由不同角色的 Agent 承担：

| 角色 | 权限 | 工具集 | 职责 |
|------|------|--------|------|
| researcher | 只读 | Read/Grep/Glob/ListFiles 等 | 搜索代码、理解结构、收集信息 |
| implementer | 可编辑 | Read + Write/Edit/Patch/Bash | 执行代码修改、文件写入 |
| verifier | 可测试 | Read + Bash（测试命令） | 验证修改结果、运行测试 |

协调器本身不直接执行任务，只能使用 Agent 管理工具（spawn_agent、list_agents、stop_agent）。这避免了"协调器亲自动手"导致的状态混乱。

**子 Agent 生命周期**

`spawnAgent()` 启动 Agent 后立即返回 `{ agentId, role, status: 'running' }`，不阻塞。Agent 在后台异步执行，通过 `agentTraces` 追踪生命周期状态（PENDING → RUNNING → WAITING → COMPLETED → FAILED → STOPPED）。

---

#### 维度 3：Agent Communication — 邮箱系统

多 Agent 协作需要通信机制。Ravens 实现了双轨通信模型。

**邮箱系统**

每个 Agent 拥有独立邮箱，消息格式：

```json
{
  "id": "msg_runId_1",
  "from": { "agentId": "researcher-1", "role": "researcher" },
  "to": { "type": "agent", "target": "implementer-1" },
  "summary": "found config entrypoint",
  "content": "The runtime config is loaded in ...",
  "kind": "text",
  "createdAt": 1713333333333
}
```

**双轨通信**

| 通道 | 用途 | 机制 |
|------|------|------|
| 直接恢复 | Coordinator 向 Worker 传达结论 | 下次 Agent 执行时注入 `<agent_message>` XML 块 |
| 邮箱异步 | Agent 间 P2P 消息 | `drainAgentMailbox` 拉取 + `waitForAgentMessage` 阻塞等待 |

邮箱支持广播（broadcastAgentMessage）、超时等待、未读计数、快照查看。当前为内存型实现，v1 阶段足以支撑单次协作周期内的通信需求。

文件型邮箱路径规划：`~/.claude/teams/{team}/inboxes/{agent}.json`，配合 lockfile 实现并发安全。这一路径与 Claude Code 的设计对齐，为 v2 跨会话持久化预留了空间。

---

#### 维度 4：MCP — 四传输协议 + 动态工具注册

MCP（Model Context Protocol）是 Agent 接入外部工具的标准协议。Ravens 的 MCP 实现支持四种传输协议，允许 Agent 连接任意合规的 MCP Server。

**四传输协议**

| 协议 | 场景 | 延迟特征 |
|------|------|---------|
| stdio | 本地进程通信，最常见 | 进程级，零网络开销 |
| SSE | 远程 HTTP Server-Sent Events | 网络级，适合远程服务 |
| WebSocket | 远程双向持久连接 | 低延迟双向 |
| HTTP | 传统请求/响应 | 简单可靠 |

**并发限制**

本地 MCP Server 最多 3 个并发，远程最多 20 个。这不是随意设定的数字：本地 Server 共享宿主机资源，3 个并发避免资源争抢；远程 Server 独立部署，20 个并发允许大规模工具集成。

**Auth Cache**

MCP 认证结果缓存 15 分钟（TTL=900s），避免每次工具调用都重新认证。

**动态工具注册**

连接 MCP Server 后，该 Server 暴露的工具以 `{serverName}__{toolName}` 格式注册到 ToolRegistry。例如连接 `filesystem` Server 后，`filesystem__read_file` 和 `filesystem__write_file` 立即可用。工具解析优先查内置 Map，再查 MCP 命名空间。

---

#### 维度 5：Permissions — 细粒度权限控制

敏感操作需要人类确认。这不是可选项，是安全保障的底线。

**权限执行流程**

Agent 请求执行敏感工具 → Runtime 暂停执行，发送 `TOOL_CONFIRM_REQUIRED` SSE 事件 → Board 展示确认对话框 → 用户点击确认/否认 → Runtime 恢复执行或取消。

**工具安全元数据**

每个工具定义包含安全字段：`isReadOnly`（只读）、`isDestructive`（有破坏性）、`isConcurrencySafe`（可并发）、`requiresStalenessCheck`（需新鲜度检查）。这些元数据决定了工具的执行策略和权限等级。

---

#### 维度 6：Tool System — 27+ 工具的 Map 注册表

Ravens 的工具系统基于 Map 注册表，支持三类工具来源和动态扩展。

**工具清单**

| 类别 | 数量 | 来源 | 注册时机 |
|------|------|------|---------|
| 内置工具 | 21 | `builtins.js` | 启动时 `registerTool()` |
| Multi-Agent 工具 | 3 | `multiAgent.js` | 启动时 |
| MCP 元工具 | 3 | `mcp/tools.js` | 启动时 |
| MCP 动态工具 | N（不限） | 运行时 MCP Server | `connect_mcp_server` 后动态注册 |

21 个内置工具覆盖记忆管理（4）、Shell 执行（1）、文件操作（7）、网络访问（2）、附件处理（5）、元指令（1）、代码智能（1）。

每个工具经过 `normalizeToolDefinition()` 规范化，包含输入 Schema、安全元数据、并发标记。执行前通过 `validator.js` 做 Schema 校验，执行中通过 `streamingToolExecutor.js` 驱动状态机。

---

#### 维度 7：Session Hierarchy — 嵌套会话

会话可以嵌套。主会话启动一个子 Agent 执行子任务，子 Agent 内部还可以再启动孙 Agent。这形成一棵会话树。

主会话 → 子任务（researcher-1）→ 孙任务（researcher-1 的 subtask）

嵌套会话共享项目上下文（工作空间、文件、记忆），但各自有独立的执行状态和工具调用历史。子会话的生命周期由父会话管理：父会话停止时，子会话级联终止。

---

#### 维度 8：Parallel Execution — 并发安全分区 + Promise.all

并发执行不是"所有工具一起跑"，而是先分区再并行。

**并发安全判定**

每个工具标记 `isConcurrencySafe`。只读工具（Read、Grep、Glob、ListFiles、code_intelligence）标记为 safe，写操作工具（Write、Edit、Patch、Bash）标记为 unsafe。

**分批策略**

```
模型返回 [Read(A), Read(B), Write(C), Read(D)]

批次 1: [Read(A), Read(B)]  ← concurrency-safe → Promise.all 并行
批次 2: [Write(C)]          ← non-concurrent → 独占执行
批次 3: [Read(D)]           ← 恢复并发 → 并行执行
```

**性能实测**

3 个 Read 调用各耗时 200ms：串行执行需 ~600ms，并行执行 ~200ms。3 倍加速。实测通过 `parallel-execution.test.js`（7/7 pass）验证。

**兄弟错误级联**

当并行执行中某个工具失败（如 Bash exit 1），共享的 `AbortController` 触发 `siblingAbortController.abort('sibling_error')`，其他并行工具立即中断，不再空等。

---

#### 维度 9：Agent Loop — 思考-工具-观察-反思循环

Agent 的执行循环是系统的核心引擎。Ravens 的 `agentExecutor.js`（1173 行）实现了完整的思考→工具→观察→反思循环。

**循环结构**

```
[思考] → Provider API 调用，获取模型输出
  ↓
[工具] → 模型决定调用工具 → StreamingToolExecutor 执行
  ↓
[观察] → 工具结果注入上下文
  ↓
[反思] → 模型基于新上下文继续推理
  ↓
[循环] → 回到 [思考]，直到模型输出最终回复或触及终止条件
```

**终止条件**

| 条件 | 阈值 | 说明 |
|------|------|------|
| maxSteps | 8 | 最多 8 轮循环 |
| diminishing returns | 3 轮 <500 tokens | 连续 3 轮产出低于 500 tokens，自动终止 |
| circuit breaker OPEN | 5 次连续失败 | 单工具熔断，不再调用 |
| consecutive failures | 3 次工具失败 | 注入 STOP 消息，强制模型停止调工具 |
| idle timeout | 90 秒无活动 | 防止挂起 |

---

#### 维度 10：Context Management — 200K 上下文 + 三级压缩

大上下文窗口（200K tokens）是能力，但用不好是负担。Ravens 的 ContextManager 实现了三级压缩策略，核心目标是：超长任务不"忘事"。

**三级压缩**

| 级别 | 名称 | 触发条件 | 机制 |
|------|------|---------|------|
| Micro | 微压缩（microCompact） | 上下文略超预算 | 删除最旧的 assistant/user 轮次，保留最近几轮完整 |
| Session Memory | 会话记忆压缩 | 上下文逼近上限 | LLM 生成结构化 9 段式摘要（Claude Code 格式），持久化到 `summary.json` |
| Full Compact | 全压缩 | 上下文严重超限 | 完全重建上下文，保留 System Prompt + 摘要 + 最近 2 轮 |

**PTL 防御（Progressive Token Limit）**

当压缩后上下文仍然超过预算，进入 PTL 防御：迭代剥离最旧 20% 内容，直到适配 Token 预算。`truncateForPTL()` 函数实现渐进截断，确保不会一次截断过多导致上下文断裂。

**自动触发**

`AUTOCOMPACT_BUFFER=13000`：当有效上下文窗口（effectiveWindow）剩余空间低于 13000 tokens 时，自动触发压缩。这个数字经过调优，保证压缩在 Token 耗尽前启动，又不至于过早压缩浪费上下文。

**Token 计数精度**

使用 `js-tiktoken` + `cl100k_base` 编码（Claude 模型标准），不是简单的 `text.length / 4` 估算。对中文文本，精确计数比启发式估算提升 5 倍精度（"你好世界"：启发式=1，tiktoken=5）。

---

#### 维度 11：System Prompt — 可配置角色与规则

System Prompt 不是写死的一段文本。Ravens 的 PromptAssembler 实现分层组装 + 版本控制。

**组装层级**

```
override > coordinator > agent > custom > default + append
```

高优先级层级可以覆盖低优先级层级的规则。这让同一套系统能适配不同客户场景：安全要求高的客户可以在 override 层注入"禁止执行危险命令"，研究型客户可以在 custom 层注入"优先使用学术搜索工具"。

**段落缓存边界**

每个段落标记缓存边界（Cache Breakpoint），让 Provider 的 Prompt Caching 机制能识别未变部分，避免重复计费。Claude API 的 Prompt Caching 可以对未变前缀给予 90% 折扣。

**版本追踪**

`sectionVersion` Map 记录每个段落的修改历史，支持 `rollbackToVersion()` 回滚到任意版本。这让 System Prompt 的迭代有据可查，出问题可以快速回退。

---

#### 维度 12：Streaming — 17+ SSE 事件类型 + Dual-Track 模式

SSE 是 Agent 执行过程对用户可见的唯一通道。Ravens 定义了 17+ 种事件类型，覆盖 Agent 执行的完整生命周期。

**事件流示意**

```
RUN_STARTED
  │
  ├── TURN_STARTED { iteration: 1 }
  │   ├── THINKING_STEP { iteration: 1, detail: "..." }
  │   ├── TOOL_STARTED { iteration: 1, name: "Read", ... }
  │   ├── TOOL_PROGRESS { iteration: 1, message: "..." }     ← Bash 实时输出
  │   ├── TOOL_FINISHED { iteration: 1, output: "..." }
  │   ├── TOOL_DEDUPED { iteration: 1, ... }                  ← 去重标记
  │   ├── MESSAGE_DELTA { iteration: 1, delta: "..." }
  │   └── MESSAGE_DONE { iteration: 1, ... }
  │
  ├── TURN_STARTED { iteration: 2 }
  │   ├── CIRCUIT_BREAKER_STATE_CHANGE { toolName, oldState, newState }  ← 熔断状态变化
  │   └── ...
  │
  └── RUN_COMPLETED { totalTurns: 2 }
```

**Dual-Track 模式**

SSE 事件提供乐观更新（用户看到实时进展），`conversation_persisted` 事件提供权威状态（流式结束后的最终数据）。Board 用原子替换处理 `conversation_persisted`，不做增量合并。这消除了乐观状态和持久状态不一致的可能。

**迭代边界**

每个事件携带 `iteration` 字段，`TURN_STARTED` 标记每轮迭代开始。这让 Board 可以按迭代分组渲染，用户能清晰看到"第 1 轮思考了什么、调了什么工具，第 2 轮做了什么"。

---

## 4. 核心差异化优势

Ravens 的 7 大差异化优势来自架构决策和技术实现的深度结合。每个优势下面拆解三个层次：怎么做的（技术实现）、对客户意味着什么（客户价值）、竞品怎么做的（竞品对比）。

### 4.1 Direct-Connect 零延迟架构

**技术实现**

Board 通过 Vite 代理直连 Runtime SSE 端点，不经过 Core 转发。Core 只处理 CRUD 请求（Session/Project/Message 的增删查改），不参与任何实时数据链路。这意味着每个流式请求的路径是 Board → Runtime，不是 Board → Core → Runtime。

**客户价值**

两个直接收益。第一，响应更快。每个流式请求少一跳网络往返，在 Agent 高频交互场景（每轮对话可能产生 20+ 工具调用）下，累计延迟差异明显。第二，系统更简单。少一跳意味着少一个故障点。Core 宕机不影响正在进行的 Agent 对话，因为 SSE 通道不经过 Core。

**竞品对比**

多数竞品采用 Proxy 链式转发架构：前端 → API Gateway → 业务服务 → Agent 服务。每层代理增加延迟和复杂度。部分竞品的网关还负责鉴权、限流、日志，进一步加重链路负担。Ravens 的 Direct-Connect 用架构层面的简化替代了运维层面的优化。

### 4.2 Dual-Track SSE 实时流

**技术实现**

SSE 事件驱动乐观更新，`conversation_persisted` 事件驱动权威状态原子替换。具体来说，Agent 执行过程中，每个 thinking delta、tool result、message fragment 都通过 SSE 实时推送到 Board，用户在毫秒级看到进展。流式结束后，Runtime 发送 `conversation_persisted` 事件，携带完整的持久化数据。Board 收到后直接替换整个对话状态，不走增量合并。

**客户价值**

"即想即做"的体验。用户在 Agent 思考时就能看到推理过程，在工具执行时就能看到实时输出（Bash 命令的 stdout 逐行显示、文件读取的进度），而不是"转圈圈等结果"。原子替换消除了乐观状态和持久状态的裂隙：不会出现"工具结果显示成功但刷新页面又消失"的 Bug。

**竞品对比**

轮询（Polling）模式每 N 秒拉取一次状态，延迟至少 N 秒。单通道 SSE 只有实时推送没有权威状态确认，一旦网络抖动丢失事件，状态永远不一致。Ravens 的双轨保证了两件事：实时性（SSE 通道）和准确性（persisted 通道）。

### 4.3 4-State 工具状态机

**技术实现**

StreamingToolExecutor 实现 4 态模型：QUEUED → EXECUTING → COMPLETED → YIELDED。工具入队后先标记 QUEUED，被拾取后标记 EXECUTING，执行完毕标记 COMPLETED，结果被消费后标记 YIELDED。

并发安全工具（Read、Grep 等）通过 `Promise.all` 并行执行，非并发工具（Write、Bash）独占执行。Batch 调度器 `getNextBatch()` 按 `isConcurrencySafe` 标记分区，把同一批次的安全工具丢进 `Promise.all`。

**客户价值**

并行执行不卡死。3 个 Read 调用串行需要 600ms，并行只要 200ms。在 Agent 的典型工作流中（一个任务可能调用 10+ 只读工具），累计加速效果显著。用户感知到的就是 Agent "手脚更快"。

**竞品对比**

多数竞品的工具执行是串行的：调用 Read(A) → 等结果 → 调用 Read(B) → 等结果 → 调用 Read(C)。即使这些调用之间没有依赖关系，也要排队。部分竞品实现了并发但缺乏安全分区，写操作和读操作混跑导致竞态条件。Ravens 的分区+并行策略在安全性和性能之间找到了平衡点。

### 4.4 Circuit Breaker 熔断保护

**技术实现**

三层防护体系：

**Layer 1：API 重试层**（`withRetry.js`，86 行）。指数退避 + 25% 抖动，最多 10 次重试。10 种错误分类到不同重试策略：429（Rate Limit）无限重试 + 遵守 retry-after；529（Overloaded）最多 3 次连续；5xx 重试；401 最多 2 次；403/400 不重试。

**Layer 2：Per-Tool 断路器**（`agentExecutor.js:20-120`）。三态模型 CLOSED → OPEN → HALF_OPEN。每个工具独立追踪，`failureThreshold=5`（5 次失败跳闸），`resetTimeout=60s`（60 秒后试探恢复）。OPEN 状态的工具请求立即返回错误，不等待超时。

**Layer 3：Agent Loop 保护**。`consecutiveFailures≥3` 时注入 STOP 消息，强制模型停止调工具。

**客户价值**

单工具故障隔离。一个 MCP Server 挂了，只有调用那个 Server 的工具失败，其他工具正常运行。熔断器跳闸后，后续调用快速失败（不等待超时），用户看到的是明确的"服务暂时不可用"提示，不是无限转圈。60 秒后自动试探恢复，服务恢复后无需人工干预。

**竞品对比**

没有断路器的系统，一个工具超时（比如 30s），Agent 要等 30 秒才知道失败。连续 5 个工具都超时，Agent 卡 150 秒。更糟的是连锁故障：A 超时 → B 等 A → C 等 B → 全部卡死。Ravens 的熔断器在 5 次失败后直接拒绝后续调用，0 秒返回，打破连锁故障链。

### 4.5 语义去重

**技术实现**

DeduplicationManager（`deduplication.js`，98 行）对只读工具实现请求去重。`inFlightRequests` Map 跟踪正在执行的请求，`cache` Map 缓存最近结果，TTL 默认 5000ms（5 秒）。

当 Agent 在同一批次中产生两个完全相同的 Read 调用（参数一致），第二个请求命中 `inFlightRequests`，直接复用第一个请求的 Promise，不发起重复 I/O。当 5 秒内再次请求相同 Read，命中 `cache`，直接返回缓存结果。

去重仅对标记 `isReadOnly=true` 的工具生效，写操作（Write、Edit、Bash）不参与去重。

**客户价值**

Token 成本更低。重复的工具调用意味着重复的 I/O 和重复的 Token 消耗（工具结果要注入上下文发给模型）。去重消除了这部分浪费。对于模型质量不稳定的场景（小型模型更容易产生冗余调用），收益更明显。

**竞品对比**

多数竞品不做工具调用去重。依赖模型自身质量避免冗余调用，但廉价模型（或上下文压缩后的遗忘）经常产生重复调用。Claude Code 通过模型训练减少冗余（好模型很少重复），但不对所有模型做运行时保证。Ravens 在运行时层面兜底，与模型质量无关。

### 4.6 200K 上下文 + 三级智能压缩

**技术实现**

ContextManager（`contextManager.js`，~700 行）实现三级压缩 + PTL 防御。

**自动触发**：`AUTOCOMPACT_BUFFER=13000` tokens。当上下文剩余空间低于此阈值时，自动启动压缩。

**Micro Compact**：删除最旧的轮次，保留最近 3-4 轮完整。速度快，信息损失小，适合上下文略超预算。

**Session Memory Compact**：调用 LLM 生成结构化 9 段式摘要（对齐 Claude Code 格式），持久化到 `~/.claude/projects/{sanitized}/sessions/{chatId}/summary.json`。关键信息（架构决策、代码位置、工具结果摘要）保留在摘要中，原始对话被替换。

**Full Compact**：完全重建上下文，只保留 System Prompt + 会话摘要 + 最近 2 轮完整对话。这是最后的手段，信息损失最大但保证不超 Token 预算。

**PTL 防御**：压缩后仍超预算时，`truncateForPTL()` 迭代剥离最旧 20% 内容，每轮检查是否适配预算，直到适配或只剩 System Prompt。

**客户价值**

超长任务不"忘事"。一个复杂的代码重构任务可能需要 20+ 轮对话，上下文累积到 100K+ tokens。简单截断会丢失关键信息（"上一步改了什么"），没有压缩则 Token 耗尽后 Agent 直接宕机。Ravens 的三级压缩确保 Agent 在任何长度的任务中都能持续工作，核心信息通过摘要保留，不会因为对话太长而忘记之前做过什么。

**竞品对比**

多数竞品采用简单截断策略：超过 Token 上限时直接截断最旧的消息。截断后 Agent 丢失早期上下文，可能重复已做的工作或做出矛盾的决策。部分竞品有压缩但只有一级，要么过早压缩（频繁打断），要么过晚压缩（来不及）。Ravens 的三级策略渐进响应，微压缩处理小幅超出，全压缩处理严重超出，PTL 处理极端情况。

### 4.7 SQLite-first 混合 RAG 记忆

**技术实现**

记忆检索基于 SQLite，不依赖任何外部向量数据库。

**双引擎索引**：FTS5 全文搜索（Porter 词干 + Unicode61 分词）+ sqlite-vec 向量搜索（高维近邻查找）。sqlite-vec 不可用时退化为文件型向量索引（`vectors.jsonl`）。

**五维加权融合**：向量相似度 45%、关键词匹配 35%、重要性 10%、时效性 5%、来源类型 5%。语义检索占主导，关键词检索保证精确命中不会被漏掉。

**数据模型**：`memory_entries`（业务实体）+ `memory_chunks`（检索单元）。一条记忆条目可能分为多个 chunk，每个 chunk 独立索引和检索。Retrieval Budget：每轮注入 3-8 个 chunk，硬上限 2000 tokens。

**客户价值**

跨会话持续学习。Agent 在上午的会话中学到的架构决策，下午的会话中仍然记得。不需要每次对话都从零开始解释项目结构。纯向量检索的问题在于精确匹配弱：搜索 `src/config.js` 这个路径，向量检索可能返回语义相关但文件名不同结果。FTS5 保证路径和符号名永远精确命中。混合检索兼顾了"理解语义"和"精确匹配"两个需求。

**竞品对比**

纯向量检索系统（如使用 Chroma/Pinecone 的方案）在语义匹配上表现好，但精确查询（文件路径、函数名、错误码）容易遗漏。纯关键词检索系统在精确匹配上好，但无法理解"这段代码处理用户认证"这种语义查询。Ravens 的混合检索同时覆盖两种场景。更重要的是，零外部依赖，一个 SQLite 文件搞定，不需要运维向量数据库集群。

---

### 附录：Bash 沙箱三级安全架构

代码执行安全是企业关注的核心问题。Ravens 规划了三级沙箱架构，适应不同安全需求。

| 级别 | 技术 | 启动延迟 | 安全强度 | 适用场景 |
|------|------|---------|---------|---------|
| L1 | bubblewrap（`bwrap`） | ~2ms 本地 | 进程级隔离 | 开发环境，快速迭代 |
| L2 | Firecracker microVM | 125ms 冷启动 / 28ms 快照恢复 | VM 级隔离 | 生产环境，平衡性能与安全 |
| L3 | Kata Containers | 稍高 | 合规级隔离 | 金融/医疗，满足合规要求 |

L1 层用 bubblewrap 实现轻量级命名空间隔离，2ms 启动代价几乎无感，适合开发环境快速迭代。L2 层用 Firecracker microVM 实现硬件级虚拟化隔离，冷启动 125ms，从快照恢复仅需 28ms，适合生产环境的安全执行。L3 层用 Kata Containers 满足金融、医疗等行业的合规隔离要求。

### 附录：Workspace 级持久化

每个用户对应一个独立工作空间。1 用户 = 1 Workspace。沙箱实例跟随工作空间生命周期：用户首次访问时创建，用户主动释放时销毁。这保证了两件事：不同用户之间的执行环境彻底隔离（文件系统、环境变量、运行时状态），用户跨会话的工作空间状态持续保留（已安装的依赖、环境配置不丢失）。

工作空间级别的持久化意味着 Agent 的执行上下文（不只是对话历史，还包括文件系统状态）在会话之间保持连续。这对长时间开发任务至关重要：上午配好的开发环境，下午继续用，不需要重新来过。