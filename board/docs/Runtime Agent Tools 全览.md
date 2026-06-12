# Runtime Agent Tools 全览

**Generated:** 2026-04-25
**Source:** `ravens.runtime/src/modules/tools/`

## Architecture

```
ToolRegistry (Map)
  │
  ├─ Builtin Tools (21)     ← builtins.js，启动时 registerTool()
  ├─ Multi-Agent Tools (3)   ← multiAgent.js，启动时 registerTool()
  ├─ MCP Meta Tools (3)      ← mcp/tools.js，启动时 registerTool()
  └─ MCP Dynamic Tools (N)   ← 运行时 connect_mcp_server 后动态注册
                                格式: {serverName}__{toolName}
                                通过 getMcpToolExecutor() 按需创建
```

**Core files:**

| File | Purpose |
|------|---------|
| `builtins.js` | Builtin tool definitions + implementations |
| `multiAgent.js` | Multi-agent orchestration tools |
| `mcp/tools.js` | MCP meta tools (connect/disconnect/list) + dynamic tool executor |
| `registry.js` | Tool registry (Map): register, get, list, setMcpModule |
| `contract.js` | Tool definition normalization + serialization |
| `validator.js` | Input schema validation |
| `executor.js` | Tool execution dispatch |
| `streamingToolExecutor.js` | Streaming tool execution with progress |
| `editMatch.js` | Fuzzy string matching for edit tool |
| `fileHistory.js` | File version tracking for undo/checkpoint |

---

## Built-in Tools (`builtins.js`)

### Memory Tools

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 1 | `save_memory` | ❌ | ❌ | 新建持久化记忆文件（type: user/feedback/project/reference） |
| 2 | `update_memory` | ❌ | ❌ | 更新已有记忆文件内容 |
| 3 | `delete_memory` | ❌ | ✅ | 删除记忆文件 |
| 4 | `list_memories` | ✅ | ❌ | 列出所有记忆文件 metadata |

**Input Schemas:**

- `save_memory`: `{ filename: string, type: enum[user|feedback|project|reference], name: string, description: string, content: string }`
- `update_memory`: `{ filename: string, content: string }`
- `delete_memory`: `{ filename: string }`
- `list_memories`: `{}`

**Memory location:** `~/.claude/projects/{sanitizedProjectPath}/memory/`
**File format:** Markdown with YAML frontmatter

### Shell Tool

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 5 | `bash` | ❌ | ✅ | 在 workspace 中执行 shell 命令 |

**Input:** `{ command: string, timeoutMs?: number }`
**Features:**
- 支持 progress 流式输出（onProgress callback）
- 支持 AbortController 信号（SIGTERM → 3s → SIGKILL）
- 默认超时 120s
- stdout/stderr 各截断 30KB

### File Tools

| # | Name | ReadOnly | Destructive | ConcurrencySafe | Description |
|---|------|----------|-------------|-----------------|-------------|
| 6 | `list` | — | ❌ | ✅ | 列出 workspace 目录内容 |
| 7 | `glob` | — | ❌ | ✅ | 用 glob 模式匹配 workspace 文件 |
| 8 | `grep` | — | ❌ | ✅ | 用正则搜索 workspace 文件内容（底层 ripgrep） |
| 9 | `read` | ✅ | ❌ | ✅ | 读取 UTF-8 文本文件（截断 20KB） |
| 10 | `write` | ❌ | ✅ | ❌ | 写入文件（需 staleness check） |
| 11 | `edit` | ❌ | ✅ | ❌ | 精确字符串替换编辑（需 staleness check） |
| 12 | `patch` | ❌ | ✅ | ❌ | 多文件原子补丁（Update/Add/Delete，OpenCode format） |

**Input Schemas:**

- `list`: `{ path?: string }`
- `glob`: `{ pattern?: string }` (default: `**/*`)
- `grep`: `{ pattern: string }` (required, uses ripgrep)
- `read`: `{ path: string }` (required)
- `write`: `{ path: string, content: string }` (required)
- `edit`: `{ path: string, old_string: string, new_string: string, replace_all?: boolean }` (required)

**Edit tool features:**
- Fuzzy string matching (`editMatch.js` — `findActualString`)
- Auto quote-style preservation (`preserveQuoteStyle`)
- Multi-occurrence detection → must use `replace_all=true`
- Empty old_string guard when file has content
- Identical old/new string detection
- File history tracking (`fileHistory.js` — `trackFile`)
- .ipynb write/edit blocked
- 1GB file size limit

- `patch`: `{ patch_text: string }` (OpenCode unified diff format: `*** Begin Patch` / `*** Update File:` / `*** Add File:` / `*** Delete File:` / `*** End Patch`)

**Patch tool features:**
- 单次原子操作支持多文件修改（Update/Add/Delete）
- Context lines 精确匹配定位
- `-` 行删除，`+` 行添加
- 修改文件自动更新 fileStateCache
- 支持 staleness 检测

### Web Tools

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 13 | `fetch_url` | ✅ | ❌ | 抓取 URL 内容（HTML→Markdown，5MB 限制，15s 超时） |
| 14 | `web_search` | — | ❌ | DuckDuckGo 搜索（3 次重试，最大 10 结果） |

**Input Schemas:**

- `fetch_url`: `{ url: string }` (required)
  - Supports: HTTP/HTTPS only
  - HTML → Markdown conversion (TurndownService, strips script/style/nav/footer/header)
  - Extract `<title>` from HTML
  - Content truncated at 12KB (HTML) / 12KB (raw text)
- `web_search`: `{ query: string, maxResults?: number }` (default 5, max 10)
  - Uses `duckduckgo-search` npm package
  - 3 retries with exponential backoff (2s, 4s)
  - Returns: title, URL, snippet per result

### Attachment Tools

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 15 | `list_project_resources` | — | ❌ | 列出项目资源列表 |
| 16 | `list_visible_attachments` | — | ❌ | 列出当前上下文可见的附件 |
| 17 | `search_visible_attachments` | — | ❌ | 按关键字搜索附件（name/type/preview） |
| 18 | `inspect_attachments` | — | ❌ | 检查附件详情（含文本预览，800 chars） |
| 19 | `read_attachment` | ✅ | ❌ | 按 ID 读取附件完整文本内容 |

**Input Schemas:**

- `list_project_resources`: `{ projectResources?: array }`
- `list_visible_attachments`: `{ attachments?: array }`
- `search_visible_attachments`: `{ query: string, attachments?: array }`
- `inspect_attachments`: `{ attachments?: array }`
- `read_attachment`: `{ attachmentId: string, attachments?: array }`

**Supported text preview types:** text/plain, text/markdown, text/csv, application/json
**Preview source:** `process.env.RUNTIME_ATTACHMENT_BASE_URL || process.env.CORE_BASE_URL || http://127.0.0.1:4000`

### Meta Tool

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 20 | `shape_response` | — | ❌ | 声明回复策略（plan 结构、key points、format） |

**Input:** `{ strategy: string, key_points?: string[], format?: enum[prose|bullet_points|numbered_list|code_block|mixed] }`

### Code Intelligence Tool

| # | Name | ReadOnly | Destructive | ConcurrencySafe | Description |
|---|------|----------|-------------|-----------------|-------------|
| 21 | `code_intelligence` | ✅ | ❌ | ✅ | LSP 代码智能操作（10 种操作） |

**Input Schema:**

- `code_intelligence`: `{ operation: enum, filePath?: string, line?: number, character?: number, query?: string }`

**10 种 LSP 操作:**

| 操作 | LSP Method | 描述 |
|------|-----------|------|
| `definitions` | textDocument/definition | 跳转到定义 |
| `references` | textDocument/references | 查找所有引用 |
| `hover` | textDocument/hover | 悬停类型信息 |
| `document_symbols` | textDocument/documentSymbol | 文件符号大纲 |
| `workspace_symbols` | workspace/symbol | 工作区符号搜索 |
| `implementations` | textDocument/implementation | 跳转到实现 |
| `call_hierarchy_incoming` | callHierarchy/incomingCalls | 调用者层次 |
| `call_hierarchy_outgoing` | callHierarchy/outgoingCalls | 被调用者层次 |
| `diagnostics` | textDocument/diagnostic | 类型错误和警告 |
| `type_definition` | textDocument/typeDefinition | 跳转到类型定义 |

**Features:**
- 每次 Write/Edit 后自动触发 diagnostics（executor.js:197-204）
- LSP Server Manager 多服务器协调
- 崩溃恢复（最多 3 次重试）
- 自动检测语言服务器

---

## Multi-Agent Tools (`multiAgent.js`)

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 1 | `spawn_agent` | ❌ | ❌ | 生成子 Agent 执行任务 |
| 2 | `list_agents` | ✅ | ❌ | 列出所有 spawned agent 及其状态 |
| 3 | `stop_agent` | ❌ | ❌ | 停止正在运行的子 Agent |

**`spawn_agent` Input:**

```json
{
  "role": "enum: researcher | implementer | verifier",  // required
  "prompt": "string",                                     // required
  "model": "string?",                                     // optional, inherits from parent
  "allowedTools": "string[]?",                            // optional, role-based defaults
  "maxSteps": "number?"                                   // default: 4
}
```

**Agent Roles** (from `runtime/protocol.js` AGENT_ROLES):
- `researcher` — read-only access
- `implementer` — can edit files
- `verifier` — can test

**Implementation:** `modules/runtime/subagents/service.js` — `spawnAgent()`

---

## MCP Tools (`mcp/tools.js`)

### Meta Tools (static, registered at startup)

| # | Name | ReadOnly | Destructive | Description |
|---|------|----------|-------------|-------------|
| 1 | `connect_mcp_server` | ❌ | ❌ | 连接 MCP server（command + args + env），返回可用工具列表 |
| 2 | `disconnect_mcp_server` | ❌ | ✅ | 断开 MCP server 连接 |
| 3 | `list_mcp_servers` | ✅ | ❌ | 列出已连接的 MCP server 及其工具 |

**`connect_mcp_server` Input:**

```json
{
  "name": "string",      // required — unique server identifier
  "command": "string",   // required — e.g., "npx", "node"
  "args": "string[]?",   // optional — command arguments
  "env": "object?"       // optional — environment variables
}
```

**Implementation:** `modules/mcp/client.js` — `connectToServer()`

### Dynamic Tools (runtime, per connected server)

当 MCP server 连接成功后，该 server 暴露的所有工具以 `{serverName}__{toolName}` 格式注册到 Registry。

示例：连接了一个名为 `filesystem` 的 MCP server，暴露了 `read_file` 和 `write_file` 工具 → Registry 中新增：
- `filesystem__read_file`
- `filesystem__write_file`

**Resolution:** `registry.js` → `getTool(name)`:
1. 先查 builtin Map
2. 再查 MCP: `parseMcpToolName(name)` → `getMcpToolExecutor(name)`

---

## Tool Safety Metadata (`contract.js`)

所有工具定义经过 `normalizeToolDefinition()` 规范化，包含以下安全字段：

| Field | Type | Meaning |
|-------|------|---------|
| `isReadOnly` | boolean | 只读工具，不修改文件系统 |
| `isDestructive` | boolean | 有破坏性（写入/删除文件、执行命令） |
| `isConcurrencySafe` | boolean | 可安全并发调用 |
| `requiresStalenessCheck` | boolean | 需要文件新鲜度检查（write/edit） |
| `isMcpTool` | boolean | 是否为 MCP 动态工具 |
| `serverName` | string? | MCP server 名称（仅 MCP 工具） |

**Serialization:** `serializeToolDefinition()` 剥离 `execute` 函数，只保留元数据 + schema，供 API 返回给 Board。

---

## Tool Execution Flow

```
Agent (AI SDK) → tool_call { name, args }
      │
      ▼
StreamingToolExecutor
      │
      ├── resolveTool(name) → registry.getTool(name)
      │     ├─ builtin? → return from Map
      │     └─ MCP? → getMcpToolExecutor(name)
      │
      ├── validateInput(args, tool.inputSchema) → validator.js
      │
      ├── tool.execute(args, context)
      │     ├─ onProgress streaming (bash)
      │     ├─ AbortController signal forwarding
      │     └─ Return: { content, ...specificFields }
      │
      └── SSE event → Board
            ├─ tool_call_started
            ├─ tool_call_progress (streaming)
            └─ tool_call_completed / tool_call_failed
```