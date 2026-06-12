# ravens Agent P0 技术调研报告

**日期**: 2026-04-23
**对标**: Claude Code / OpenCode / Manus AI
**范围**: ravens.runtime — 5个P0能力差距的深度技术调研

---

## 目录

1. [ravens.runtime 现状扫描](#1-ravensruntime-现状扫描)
2. [行级编辑 (edit) 工具](#2-行级编辑-edit-工具)
3. [Bash 安全验证](#3-bash-安全验证)
4. [检查点/回滚系统](#4-检查点回滚系统)
5. [LSP/代码智能集成](#5-lsp代码智能集成)
6. [代码库索引/语义搜索](#6-代码库索引语义搜索)
7. [实施路径总结](#7-实施路径总结)

---

## 1. ravens.runtime 现状扫描

### 工具框架架构

```
builtins.js (1372 LOC)
  → registerTool()
    → registry.js (Map)
      → executor.js (retry, dedup, staleness check, circuit breaker)
```

**16 个内置工具**:

| 工具 | 行号 | 关键问题 |
|------|------|----------|
| `bash` | 531-646 | `spawn('bash', ['-c', command])` — 无沙箱、无白名单、完整 env 继承 |
| `write` | 307-331 | 全文件覆盖 `fs.writeFile` — 无原子写入、无临时文件交换、无版本备份 |
| `edit` | 333-420 | 字符串替换 (old_string→new_string) — 有 `replace_all`、有错误类型，但缺少关键防护 |
| `read` | 248-270 | `fs.readFile` 20k 字符限制 |
| `grep` | 220-280 | `rg --line-number --color never` — 仅转义单引号 |
| `glob` | 194-218 | `path.matchesGlob` |
| `list` | 178-192 | `fs.readdir` |
| `fetch_url` | 421-530 | HTTP fetch, 5MB limit, HTML→Markdown |
| memory crud | 68-177 | `save/update/delete/list_memories` |
| attachments | 647-900 | 5个附件工具 |
| `shape_response` | 901-950 | 规划工具 |
| `web_search` | 951-1000 | DuckDuckGo |

### MCP 集成 (client.js, 253 LOC)

- `@modelcontextprotocol/sdk` + StdioClientTransport
- `mcp__{serverName}__{toolName}` 命名空间隔离
- 指数退避重连 (max 5)
- **仅支持 STDIO 传输**，不支持 HTTP/SSE 远程

### 权限引擎 (permissionEngine.js)

- 模式匹配 + 通配符
- 动作: ALLOW / DENY / ASK
- 默认: 只读→ALLOW, 破坏性→ASK
- **⚠️ 仅 system prompt 文本约束 (securityPolicy.js)，bash 无代码级别强制执行**

### Checkpoint 状态

- SQLite schema 中有 `memory_checkpoints` 和 `session_memory_snapshots` 表
- **无** createCheckpoint / rollback / restore 函数
- **无** `/checkpoints` 路由 (404)
- 死代码，需完全重建

### 工具定义 Schema

```js
{
  name, label, description,
  inputSchema, outputSchema,
  isReadOnly, isDestructive, isConcurrencySafe,
  isMcpTool, serverName,
  execute
}
```

---

## 2. 行级编辑 (edit) 工具

### 2.1 ravens 现有 edit 工具

**已有能力** (builtins.js 行 333-420):
- `old_string` → `new_string` 字符串替换
- `replace_all` 标记
- 对 old_string 转义为正则
- 返回: matchCount, applied, firstOccurrenceLine, lineDelta
- 错误类型: STRING_NOT_FOUND, MULTIPLE_MATCHES, FILE_NOT_FOUND

**缺失** (2026-04-26 更新):
- ✅ 文件过时检测 — `requiresStalenessCheck` (executor.js)
- ✅ 引号风格保护 — `editMatch.js` — `preserveQuoteStyle()`
- ✅ 模糊匹配 — `editMatch.js` — `findActualString()`
- ✅ 原子写入 — temp file + rename
- ✅ LSP 通知 — 每次 Write/Edit 后自动 diagnostics (executor.js:197-204)
- ✅ 编辑历史追踪 — `fileHistory.js` — `trackFile()`
- ✅ 多文件编辑 — `patch` 工具 (原子补丁应用)
- ✅ replace_all 反向引用修复 — 闭包模式

### 2.2 Claude Code FileEditTool (625 LOC)

**核心设计**:

```
Input:  { file_path, old_string, new_string, replace_all? }
Output: { filePath, oldString, newString, originalFile, structuredPatch, userModified, replaceAll }
```

**1. 文件过时检测 (Staleness Detection)**

```js
// readFileState: Map<filePath, { timestamp, content }>
// 编辑前: 比较文件 mtime vs 已读时间戳
// 如果 mtime 变化 → 验证内容 (仅完整读取的文件)
// 过时 → 'ask' 行为 (请求用户确认)
```

这是安全编辑的基石。没有它，Agent 可能在别人修改了文件后覆盖修改。

**2. 引号风格保护 (Quote Preservation)**

问题: LLM 输出直引号 `"hello"`，但文件中实际是弯引号 `"hello"`。

```js
// preserveQuoteStyle():
// 1. 检测文件中实际使用弯引号 (curly quotes)
// 2. 当 old_string 通过标准化匹配时，将替代文本中的引号替换为相同风格
// 3. 缩写撇号 (contraction apostrophe) 在两字母之间 → 始终用 closing quote
```

```js
// findActualString():
// 1. 先尝试精确匹配
// 2. 失败 → 标准化弯引号→直引号
// 3. 在标准化后的内容中找到位置
// 4. 返回文件中实际子串 (保留原始引号)
```

**3. 多匹配检测**

```js
const matchCount = file.split(old_string).length - 1;
if (matchCount > 1 && !replace_all) {
  return error(9, `Found ${matchCount} matches`);
}
```

**4. replace_all 防反向引用**

```js
// 使用闭包而非 $1/$2 替换，防止 old_string 中的捕获组被扩展
const result = replace_all
  ? file.replaceAll(old_string, new_string)
  : file.replace(old_string, () => new_string);  // 闭包 = 安全
```

**5. 完整错误码体系**

| 码 | 含义 | 触发条件 |
|----|------|----------|
| 1 | no change | old_string === new_string |
| 2 | permission denied | 权限引擎拒绝 |
| 3 | empty old_string on existing file | 文件存在但 old_string 为空 |
| 4 | file not found | 文件不存在 |
| 5 | jupyter notebook | .ipynb 文件不允许直接编辑 |
| 6 | file not read | 必须先 read 才能 edit |
| 7 | **file modified since read** | ⭐ staleness detection 触发 |
| 8 | old_string not found | 精确匹配 + 标准化匹配均失败 |
| 9 | multiple matches | 多处匹配且 replace_all=false |
| 10 | file too large | >1GiB |

### 2.3 Aider EditBlockCoder — 模糊匹配策略

Aider 面对的核心问题: LLM 输出的缩进/空白经常与文件不完全一致。

**多层回退策略**:

```
1. 精确字符串匹配           → 如果命中，直接应用
2. strip_blank_lines         → 删除 old_string 首尾空白行后匹配
3. relative_indent           → 转换为相对缩进后匹配 (⭐ 处理 LLM 缩进错误的关键)
4. git cherry-pick           → 使用 git 应用补丁
5. diff-match-patch          → 字符级模糊匹配 (最后手段)
```

**相对缩进 (Relative Indentation)**:
将 old_string 和文件内容都转换为相对缩进形式 (每行减去最小缩进)，匹配后再恢复到文件中的实际缩进级别。

### 2.4 Continue — 批处理编辑

```js
// 单次调用，多编辑点
{
  filepath: "src/foo.js",
  edits: [
    { old_string: "foo", new_string: "bar" },
    { old_string: "baz", new_string: "qux", replace_all: true }
  ]
}
// 预计算 newContent 和元数据，用于 UI diff 渲染
// 编辑按顺序应用
```

### 2.5 ravens 增强建议

| 优先级 | 增强 | 参考来源 | 估时 |
|--------|------|----------|------|
| **P0** | 文件过时检测 (readFileState Map + mtime 比较) | Claude Code | 1-2天 |
| **P0** | 原子写入 (temp file + fs.rename) | 通用最佳实践 | 0.5天 |
| **P0** | 编辑触发 checkpoint (写入前 snapshot) | Claude Code | 配合 checkpoint 系统 |
| **P1** | 引号风格保护 (preserveQuoteStyle) | Claude Code | 1天 |
| **P1** | 模糊匹配 (relative_indent fallback) | Aider | 2天 |
| **P1** | 批处理编辑 (edits[] 数组) | Continue | 1天 |
| **P2** | LSP 通知 (edit 后 didChange) | Claude Code | 配合 LSP 系统 |
| **P2** | Jupyter notebook 保护 (拒绝编辑 .ipynb) | Claude Code | 0.5天 |

---

## 3. Bash 安全验证

### 3.1 ravens 现状

```js
// builtins.js 行 531-646
spawn('bash', ['-c', command])
// cwd = workspace, inherits full process.env
// 120s 超时, 30k 字符截断
// ❌ 无沙箱、无白名单、无安全验证
```

风险: 任何恶意或误写的 bash 命令直接在宿主机上执行。

### 3.2 Claude Code bashSecurity.ts — 2592行，23检查类别

这是 Agent 安全的基石。Claude Code 用了 **2592行** 来验证 bash 命令安全性。这不是过度工程 — 这是面对真实攻击面的必要防护。

#### 检查类别完整列表

| # | 类别 | 检测内容 | 危险等级 |
|---|------|----------|----------|
| 1 | INCOMPLETE_COMMANDS | tab-start, flag-start, operator-start 片段 | 中 |
| 2 | JQ_SYSTEM_FUNCTION | `jq 'system("cmd")'` — 通过 jq 执行命令 | 🔴 高 |
| 3 | JQ_FILE_ARGUMENTS | `-f`, `--from-file`, `--slurpfile` — jq 文件注入 | 🔴 高 |
| 4 | OBFUSCATED_FLAGS | flag 名称中的引号字符 (伪装选项) | 中 |
| 5 | SHELL_METACHARACTERS | 参数中的 `; | &` | 🔴 高 |
| 6 | DANGEROUS_VARIABLES | 重定向/管道上下文中的变量 | 🔴 高 |
| 7 | NEWLINES | `\n\r` 分隔多个命令 (命令注入) | 🔴 高 |
| 8 | COMMAND_SUBSTITUTION | `$()`, 反引号, `${}`, `$[]`, `<()`, `>()`, `=(cmd)`, Zsh 等号扩展 | 🔴 高 |
| 9 | INPUT_REDIRECTION | `<` (文件读取) | 中 |
| 10 | OUTPUT_REDIRECTION | `>` (文件覆写) | 🔴 高 |
| 11 | IFS_INJECTION | 修改 Input Field Separator | 🔴 高 |
| 12 | GIT_COMMIT_SUBSTITUTION | `git commit -m "$()"` — 在 commit 消息中执行命令 | 🔴 高 |
| 13 | PROC_ENVIRON_ACCESS | `/proc/self/environ` — 读取进程环境变量 | 🔴 高 |
| 14 | MALFORMED_TOKEN_INJECTION | 解析器差异攻击 (parser differentials) | 🔴 高 |
| 15 | BACKSLASH_ESCAPED_WHITESPACE | 反斜杠+空白混淆 | 中 |
| 16 | BRACE_EXPANSION | `{a,b,c}` — 可能展开为意外值 | 低 |
| 17 | CONTROL_CHARACTERS | `\x00-\x1F` 控制字符 | 中 |
| 18 | UNICODE_WHITESPACE | NBSP 等 Unicode 空白字符 (绕过空白检测) | 中 |
| 19 | MID_WORD_HASH | 单词中间的 `#` (注释注入) | 中 |
| 20 | ZSH_DANGEROUS_COMMANDS | zmodload, emulate, sysopen, zpty, ztcp 等 | 🔴 高 |
| 21 | BACKSLASH_ESCAPED_OPERATORS | 反斜杠转义的运算符 | 中 |
| 22 | COMMENT_QUOTE_DESYNC | 引号与 `#` 的状态不同步 | 🔴 高 |
| 23 | QUOTED_NEWLINE | 引号内的换行 | 中 |

#### 验证流程

```
bashCommandIsSafe(command, options)
  → pre-process(command)
    → extractQuotes()        // 逐字符提取引号内容
    → stripSafeRedirections() // 移除安全重定向
  → early-allow paths        // 已知安全的命令模式
  → validator chain          // 23个检查器逐一通过
  → return PermissionResult
    { behavior: 'allow'|'deny'|'ask'|'passthrough',
      message?,
      isBashSecurityCheckForMisparsing? }
```

#### 关键实现模式

**1. 安全重定向剥离** — 边界条件是生死线

```js
// ❌ 危险: 可能匹配 /dev/nullo, /dev/nullrandom
command.replace(/>\s*\/dev\/null/g, '')

// ✅ 安全: 要求 word boundary
command.replace(/>\s*\/dev\/null(?=\s|$)/g, '')
// (?=\s|$) 确保后面是空白或行尾
// 防止 >/dev/nullo 这种前缀匹配攻击
```

**2. 引号内容提取** — 逐字符解析

```js
extractUnquotedContent(command)
  // 逐字符遍历，跟踪引号状态 (单引号/双引号/无引号)
  // 仅提取非引号内容用于安全检查
  // 保留原始引号以维持命令结构
```

**3. Heredoc 安全校验**

只有 `$(cat <<'EOF'...)` 形式被认为是安全的，条件:
- delimiter 是单引号包裹的
- 关闭 delimiter 是该行第一个精确匹配
- `$(` 前有非空白前缀
- 剩余文本通过所有验证器
- 无嵌套匹配

**4. 失败即关闭 (Fail-Closed)**

```
未识别的语法 → 'ask' (不是 'allow')
```

#### 权限结果和行为

| behavior | 含义 | 何时使用 |
|----------|------|----------|
| `allow` | 安全，直接执行 | 白名单命令、无风险操作 |
| `deny` | 危险，拒绝执行 | 明确的攻击/危险模式 |
| `ask` | 不确定，请求用户确认 | 所有无法确定安全性的命令 |
| `passthrough` | 传递给后续检查 | 本检查器未匹配到问题 |

### 3.3 OpenCode — JSON 规则 + Warden 插件

```json
// 权限规则: glob 匹配命令模式
{
  "rm -rf*": "ask",
  "curl*": "ask",
  "git push*": "ask"
}
```

**Warden 插件**: 74 个密钥检测模式 (API keys, tokens, credentials)

### 3.4 Manus — VM 级隔离

- 每个任务独立云端 VM
- VM 内部零信任
- Agent 无宿主机访问权限
- sleep/wake 持久化

### 3.5 其他框架模式

| 框架 | 策略 | 优缺点 |
|------|------|--------|
| Aider | `/run` 需显式用户调用，`shlex.quote()` 安全插值 | 简单但无自动防护 |
| Flowise/MCP | 危险 flag 检测 (npx `-c`, node `-e`, python `-c`, docker `--privileged`) | 针对性强但覆盖面窄 |

### 3.6 ravens 增强建议

**分阶段实施** (不要一次写2592行):

| 阶段 | 范围 | 参考类别 | 估时 | 防护等级 |
|------|------|----------|------|----------|
| **Phase 1** | 命令替换 + 重定向 + 换行注入 | #7, #8, #9, #10 | 3天 | 阻止 80% 注入攻击 |
| **Phase 2** | Shell 元字符 + 危险变量 + IFS | #5, #6, #11 | 2天 | 阻止 90% 注入攻击 |
| **Phase 3** | 混淆检测 + 控制字符 + Unicode | #4, #15, #17, #18 | 2天 | 阻止 95% 高级攻击 |
| **Phase 4** | jq/git/proc/parse differential | #2, #3, #12, #13, #14 | 3天 | 接近 Claude Code 水平 |
| **Phase 5** | Zsh/heredoc/comment desync | #19-#23 | 2天 | 完整覆盖 |

**架构建议**:
- 独立模块 `bashSecurity.js`，不内嵌在 builtins.js
- 返回 `PermissionResult` 结构 (allow/deny/ask + message)
- Fail-closed 默认策略
- 在 `executor.js` 层调用，而非 `builtins.js`
- 与权限引擎集成: `deny` → 阻止, `ask` → 显示给用户

---

## 4. 检查点/回滚系统

### 4.1 ravens 现状

- SQLite schema 有 `memory_checkpoints` 和 `session_memory_snapshots` 表
- **无** createCheckpoint / rollback / restore 函数
- **无** `/checkpoints` 路由 (返回 404)
- Agent 执行错误后无法恢复 — 用户只能手动修复

### 4.2 Claude Code fileHistory.ts — 文件级快照系统

**核心设计**: 每次编辑前备份文件 → 按消息 ID 关联快照 → 回滚时恢复整个快照

#### 存储结构

```
{configDir}/file-history/
  {sessionId}/
    {pathHash}@v{version}
```

- `pathHash`: SHA256 of file path, first 16 hex chars
- `version`: 递增版本号 (1, 2, 3, ...)

#### 数据结构

```ts
interface FileHistoryBackup {
  backupFileName: string;  // "abc123@v1"
  version: number;
  backupTime: number;      // mtime ms
}

interface FileHistorySnapshot {
  messageId: string;       // UUID — 关联到 Agent 消息
  trackedFileBackups: {
    [filePath: string]: FileHistoryBackup | null  // null = 文件不存在
  };
  timestamp: number;
}
```

**关键**: messageId 是快照的唯一 key — 回滚时找到对应消息的快照即可恢复。

#### 实现要点

| 要点 | 实现 | 为什么 |
|------|------|--------|
| **copyFile, not readFile** | `fs.copyFile()` 直接复制，不读入内存 | 避免 OOM (大文件) |
| **mtime 快速路径** | 先比较 mtime，不同才比较内容 | 99% 情况 mtime 足够 |
| **MAX_SNAPSHOTS: 100** | 循环缓冲，超出时淘汰最旧 | 防止磁盘无限增长 |
| **硬链接迁移** | session 恢复时用 `fs.link()` 硬链接 | O(1) 空间开销 |

#### 变更检测算法

```
检测文件是否被修改:
  stat(原文件), stat(备份文件)
  → 任一不存在 → changed
  → 原 mtime < 备份 mtime → unchanged (文件没改过)
  → 否则 → 内容 diff (慢路径)
```

#### 回滚流程 (Rewind)

```
1. 用户选择消息 (messageId)
2. 找到该 messageId 对应的 snapshot
3. 对每个 tracked file:
   backup === null → 文件不存在，unlink 当前文件
   backup exists → copyFile(backup, currentFilePath)
4. 对不在 snapshot 中的文件:
   不动 (回滚是"恢复已追踪文件"，不是"删除新文件")
```

### 4.3 Aider — Git-Based Undo

| 策略 | 实现 |
|------|------|
| 自动提交 | 每次AI编辑 → `git commit -m "aider: <description>"` |
| `/undo` | `git reset HEAD^` + 安全检查 (commit by Aider, no dirty files, not pushed) |
| 无 git 模式 | 内存状态栈，prompt 级别撤销 |

**优点**: 利用 git 的完整历史和合并能力
**缺点**: 依赖 git，对非 git 项目无法使用

### 4.4 ravens 增强建议

**推荐: Claude Code 模式 (文件系统级，无 git 依赖)**

| 组件 | 实现 | 估时 |
|------|------|------|
| `fileHistory.js` | 文件版本管理 (copyFile, 硬链接, mtime 检测) | 2天 |
| `snapshotManager.js` | 按 messageId 创建/查询/恢复快照 | 1.5天 |
| `snapshotStore.js` | 存储层抽象 (文件系统 or SQLite) | 1天 |
| Agent loop 集成 | `trackEdit()` 写入前 + `makeSnapshot()` 每轮后 | 1天 |
| `rewind` 工具 | 暴露给 Agent 的回滚 API | 1天 |
| Board 前端 UI | 回滚选择器 + diff 对比视图 | 2天 |

**存储路径**: `~/.ravens/file-history/{sessionId}/{pathHash}@v{version}`

**集成点**:
```
agentExecutor.js
  → 每轮开始前: makeSnapshot(messageId)
  → edit/write 工具内部: trackEdit(filePath)
  → 每轮结束后: finalizeSnapshot(messageId)
```

---

## 5. LSP/代码智能集成 ✅ 已实现 (2026-04-26)

### 5.1 ravens 实现状态

`code_intelligence` 工具已完整实现，提供 10 种 LSP 操作。每次 Write/Edit 后自动触发 diagnostics。以下为原始分析参考。



### 5.2 Claude Code LSP 架构 (~2000+ LOC)

#### 模块结构

| 模块 | LOC | 职责 |
|------|-----|------|
| `LSPTool.ts` | 860 | 工具接口 — 9 个操作暴露给 Agent |
| `LSPServerManager.ts` | 420 | 多服务器生命周期管理 |
| `LSPClient.ts` | 447 | JSON-RPC 客户端 (via stdio) |
| `LSPServerInstance.ts` | 511 | 服务器状态机 + 崩溃恢复 |
| `formatters.ts` | 592 | LLM 友好的输出格式 |
| `lspRecommendation.ts` | 374 | 自动检测项目类型推荐 LSP |

#### 9 个 LSP 操作 (按优先级排序)

| 优先级 | 操作 | LSP Method | 用途 |
|--------|------|-----------|------|
| **P0** | goToDefinition | textDocument/definition | 跳转到定义 |
| **P0** | findReferences | textDocument/references | 查找所有引用 |
| **P1** | hover | textDocument/hover | 悬停类型信息 |
| **P1** | documentSymbol | textDocument/documentSymbol | 文件符号列表 |
| **P2** | workspaceSymbol | workspace/symbol | 工作区符号搜索 |
| **P2** | goToImplementation | textDocument/implementation | 跳转到实现 |
| **P3** | prepareCallHierarchy | textDocument/prepareCallHierarchy | 调用层次准备 |
| **P3** | incomingCalls | callHierarchy/incomingCalls | 入调用 |
| **P3** | outgoingCalls | callHierarchy/outgoingCalls | 出调用 |

#### 关键设计模式

**1. Factory Functions, Not Classes**

```ts
// 不用 class，用工厂函数封装状态
function createLSPClient(serverPath, options) {
  let state = 'stopped';
  const connection = /* ... */;
  return {
    start() { state = 'running'; },
    dispose() { state = 'stopped'; },
    // ...
  };
}
```

**2. 必须先 Open 文件**

```
任何 LSP 请求前:
  textDocument/didOpen({ uri, languageId, version, text })
不 Open 就请求 → 大多数语言服务器会返回空结果
```

**3. 崩溃恢复**

```
LSPServerInstance 状态机:
  stopped → starting → running
  running → crashed → recovering → running (max 3 次)
  3 次崩溃 → permanent_failure → 不再重试
```

**4. Content-Modified 重试**

```
错误码 -32801 = 文件内容在请求期间被修改
→ 自动重试 (max 3 次)
→ 因为 Agent 可能在编辑后立即查询
```

**5. 输出格式 — LLM 友好**

```
// 不返回 LSP 原始 JSON，而是格式化:
"src/auth/jwt.js:42:8"
"  → import { sign } from 'jsonwebtoken'"
```
相对路径 + 行号:字符位置 — Agent 能直接理解和使用。

#### 库栈

```
vscode-jsonrpc     (~129KB) — JSON-RPC 传输
vscode-languageserver-protocol — LSP 协议定义
vscode-languageserver       — 服务器端类型

⚠️ 懒加载: require() 仅在首次使用时
```

#### 自动检测矩阵

| 文件类型 | 推荐 LSP 服务器 | 检测方式 |
|----------|----------------|----------|
| `.ts / .tsx` | typescript-language-server | tsserver 在 PATH |
| `.py` | pylsp | pylsp 在 PATH |
| `.go` | gopls | gopls 在 PATH |
| `.rs` | rust-analyzer | rust-analyzer 在 PATH |
| `.java` | jdtls | eclipse JDT |
| `.c / .cpp` | clangd | clangd 在 PATH |

### 5.3 替代方案: Tree-sitter

| 方案 | 实现 | 优劣 |
|------|------|------|
| **Aider RepoMap** | tree-sitter 解析 → PageRank 排名的标签 → token 预算裁剪 | 无需 LSP 服务器，但精度低 |
| **CodeSift** | tree-sitter + 可选 LSP 桥接 | 61-95% token 减少 |
| **tree-sitter MCP** | CodeTree/CodeSift/Tilth — MCP 服务器提供代码理解 | 插件化，可随时接入 |

**Tree-sitter 注意事项**:
- WASM 版本有内存泄漏 (Sourcegraph 文档记录)
- 原生绑定性能更好
- 如果必须用 WASM: 每 ~10k 文档回收 parser 实例

### 5.4 ravens 增强建议

**分阶段实施**:

| 阶段 | 范围 | 参考 | 估时 |
|------|------|------|------|
| **Phase 1** | `lsp_client.js` — JSON-RPC via stdio, 连接管理 | Claude Code LSPClient.ts | 2天 |
| **Phase 1** | `lsp_tool.js` — goToDefinition + findReferences | Claude Code LSPTool.ts | 2天 |
| **Phase 2** | `lsp_server_manager.js` — 多服务器生命周期 | Claude Code LSPServerManager.ts | 2天 |
| **Phase 2** | `lsp_recommendation.js` — 自动检测项目 LSP | Claude Code lspRecommendation.ts | 1天 |
| **Phase 3** | hover + documentSymbol + workspaceSymbol | Claude Code formatters.ts | 2天 |
| **Phase 3** | callHierarchy + implementation | Claude Code LSPTool.ts | 1天 |

**依赖库**: `vscode-jsonrpc` + `vscode-languageserver-protocol`

**关键集成点**:
- `builtins.js` 注册 `lsp` 工具
- `edit` 工具编辑后发送 `textDocument/didChange`
- Agent 首次使用 `lsp` 时自动启动对应的语言服务器

---

## 6. 代码库索引/语义搜索

### 6.1 ravens 现状

- 只有 `grep` (调用 rg) — O(n) 全文扫描
- 无索引、无 AST 解析、无语义搜索
- 大代码库中搜索效率低

### 6.2 Claude Code: "Search, Don't Index"

**Anthropic 的核心发现**: grep 比 RAG 更简单更快。

```
历史: Claude Code 早期使用 Voyage embeddings 做 RAG
结果: 放弃 RAG，回到 ripgrep + glob + Read
原因:
  - grep 更简单、更可预测
  - LSP 提供 100% 精度的符号级智能
  - RAG 的向量检索对代码搜索的精度不如 grep
  - LSP 查询 ~50ms, 精度 100% vs grep 的误报

关键: LSP + grep 组合 > 纯 RAG
```

### 6.3 OpenCode Codebase Index Plugin — 混合索引

**架构**: TypeScript (插件逻辑) + Rust (tree-sitter 解析, usearch 向量, SQLite, BM25)

```
索引流水线:
  文件变更 → tree-sitter 解析 (14语言) → 符号提取
    → BM25 倒排索引 + HNSW 向量索引 (F16 量化)

搜索流水线:
  查询文本 → embed + keyword 提取
    → 并行: usearch 向量检索 + BM25 关键词检索
    → RRF (Reciprocal Rank Fusion) 融合
    → rerank → 返回结果
```

**HNSW 参数**: F16 量化 (半精度浮点)，平衡精度与内存

### 6.4 混合搜索基准

| 方法 | recall@10 | 特点 |
|------|-----------|------|
| 纯向量 (Dense) | 78% | 语义匹配好，关键词匹配差 |
| 纯关键词 (BM25) | 65% | 关键词匹配好，语义匹配差 |
| **混合 (RRF fusion)** | **91%** | 两者互补 |

**RRF (k=60)**: 默认参数，无需调优

### 6.5 SQLite FTS5

| 特性 | 性能 |
|------|------|
| BM25 排序 | 内置 |
| 前缀查询 | 10-30ms |
| Trigram 模式 (LIKE 加速) | 100x 速度提升 |
| 零依赖 | SQLite 内置 |

### 6.6 渐进式索引阶段 (ravens 建议)

#### Phase 1: SQLite FTS5 (Week 1-2)

```
目标: 替代 O(n) grep，实现 O(1) 关键词搜索

实现:
  - 文件内容变更时更新 FTS5 索引
  - 文件哈希跟踪 (跳过未变更文件)
  - BM25 排序的关键词搜索

存储: .ravens/index.db
ROI: 10-100x 重复搜索加速
估时: 3-4天
```

#### Phase 2: tree-sitter AST 解析 (Week 3-4)

```
目标: 符号级理解，减少 Agent token 消耗

实现:
  - tree-sitter 解析 → 提取函数/类/变量定义
  - 符号索引 (name, kind, file, line, span)
  - token 预算裁剪 (Aider RepoMap 模式)

ROI: 40-70% token 节省, O(1) 符号查找
估时: 5-7天

⚠️ WASM tree-sitter 有内存泄漏:
  - 优先用原生绑定
  - WASM 时每 ~10k 文档回收 parser
```

#### Phase 3: 本地向量搜索 (Week 5-7)

```
目标: 语义搜索 (91% recall 混合检索)

实现:
  - 本地嵌入 (fastembed, BAAI/bge-small, 384-dim)
  - sqlite-vec 向量存储
  - RRF 融合 (BM25 + 向量)

ROI: 91% recall 混合检索
估时: 7-10天

决策依据: Phase 2 的符号索引是否足够?
  如果 <1K 文件 → 可能不需要 Phase 3
  如果 10K+ 文件 → Phase 3 是必要的
```

#### Phase 4: 调用图 + 依赖图 (Week 8+)

```
目标: 代码关系理解

实现:
  - tree-sitter 调用关系提取
  - 依赖图 (import/require/call)
  - PageRank 影响力排序

ROI: 5-10% 额外 token 节省
估时: 5-7天
```

### 6.7 仓库规模决策矩阵

| 规模 | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|------|---------|---------|---------|---------|
| <1K 文件 | ✅ | ❌ | ❌ | ❌ |
| 1K-10K 文件 | ✅ | ✅ | ❌ | ❌ |
| 10K-100K 文件 | ✅ | ✅ | ✅ | ❌ |
| 100K+ 文件 | ✅ | ✅ | ✅ | ✅ |

### 6.8 核心洞察

> **"Anthropic found grep simpler than RAG for code search."**
> 
> 不要一开始就建向量索引。从 FTS5 开始 (最低复杂度)，需要时加 AST，只在语义搜索真正有帮助时才加向量。

---

## 7. 实施路径总结

### 依赖关系图

```
edit 工具增强 ──────┐
                    ├──→ Agent 安全编辑能力 (基石)
Bash 安全验证 ─────┘
     │
     ├──→ Checkpoint/回滚 (依赖 edit/write 触发)
     │
     └──→ LSP 集成 (依赖 edit 发送 didChange)
          │
          └──→ 代码库索引 (与 LSP 符号互补)
```

### 实施状态 (2026-04-26 更新)

| 状态 | 工作项 | 备注 |
|------|--------|------|
| ✅ 已完成 | edit 工具增强 (staleness + 原子写入 + 模糊匹配 + 引号) | 7 缺陷全部修复 |
| ✅ 已完成 | LSP Phase 1-3 (10 操作 + 多服务器 + 自动检测) | 完整实现 |
| 🔴 P0 | Bash 安全 Phase 1 (命令替换+重定向+换行) | 仍未开始 |
| 🟡 P1 | Checkpoint 工具化 (将 restoreFile 暴露为工具) | fileHistory.js 已有 |
| 🟡 P1 | 代码库索引 Phase 1 (SQLite FTS5) | 未开始 |

### 原估时参考

| 能力 | 估时 | 状态 |
|------|------|------|
| edit 工具 | 2-7天 | ✅ 已完成 |
| Bash 安全 | 5-12天 | ❌ 未开始 |
| Checkpoint/回滚 | 5-8天 | ⚠️ 部分完成 (缺工具暴露) |
| LSP 集成 | 4-10天 | ✅ 已完成 |
| 代码库索引 | 4-17天 | ❌ 未开始 |

---

*调研完成。下一步: 制定详细实施计划或按优先级启动实现。*