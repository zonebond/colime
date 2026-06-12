# P0 能力差距逐项分析 — 确认问题与实施方案

**日期**: 2026-04-23 | **最后更新**: 2026-04-26
**状态**: P0 #4 (LSP) ✅ 已实现 | P0 #1 (edit) ✅ 大部分已修复 | P0 #2 (checkpoint) ⚠️ fileHistory 已有，缺少 agent 工具 | P0 #3 (bash安全) ❌ 未开始 | P0 #5 (索引) ❌ 未开始

---

## P0 #1: 行级编辑 (edit) 工具增强 ✅ 大部分已实现 (2026-04-26)

### 已修复项目

| # | 原缺陷 | 修复状态 |
|---|--------|----------|
| 1 | Staleness 检测不生效 | ✅ `requiresStalenessCheck` 标记 (contract.js) + executor.js staleness 检查 |
| 2 | 无原子写入 | ✅ 已实现原子写入 |
| 3 | replace_all 反向引用扩展 | ✅ 已修复 (闭包模式) |
| 4 | 无引号风格保护 | ✅ `editMatch.js` — `preserveQuoteStyle()` |
| 5 | 无模糊匹配 | ✅ `editMatch.js` — `findActualString()` |
| 6 | fileStateCache 路径不一致 | ✅ 已统一为绝对路径 |
| 7 | edit 后不更新 fileStateCache | ✅ edit 成功后自动更新缓存 |

### 仍待确认

- 错误码体系完善 (NO_CHANGE, FILE_NOT_READ 等)

### 已有基础设施 (可复用)

| 组件 | 文件 | 状态 |
|------|------|------|
| `fileStateCache` (Map, 256 entries, 5min TTL) | executor.js | ✅ 存在但未用于 edit/write |
| `checkFileStaleness()` | executor.js | ✅ 存在但条件不对 |
| `setFileState()` / `getFileState()` | executor.js | ✅ 存在 |
| `resolveWorkspacePath()` (path traversal 防护) | fs.js | ✅ 正常工作 |
| 正则转义 (match counting) | builtins.js:346 | ✅ 正确 |
| `replaceAll` 标记 | builtins.js | ✅ 存在 |

### 实施方案

#### Phase 1: 生存必需 (2-3天)

**1.1 修复 staleness 检测触发条件**

```
变更: executor.js executeToolInternal()
  旧: if (tool.isDestructive && input.path) { checkFileStaleness() }
  新: if (input.path && (tool.isDestructive || tool.name === 'edit' || tool.name === 'write')) {
        checkFileStaleness()
      }
  或: 在 tool schema 增加 requiresStalenessCheck: true 标记
      工具定义中 edit/write 设置 requiresStalenessCheck: true
      executor 检查该标记
```

推荐: 加 `requiresStalenessCheck` 标记 — 更通用，不依赖工具名硬编码。

**1.2 修复 fileStateCache 路径一致性**

```
变更: edit/write 工具在 setFileState() 时使用 resolveWorkspacePath() 的绝对路径
      read 工具在 setFileState() 时也使用绝对路径
      确保所有路径通过同一个 normalize 函数
```

**1.3 edit 成功后更新 fileStateCache**

```
变更: editWorkspaceFile() 成功后
      stat 新文件 → setFileState(absolutePath, mtimeMs, size)
```

**1.4 原子写入**

```
变更: editWorkspaceFile() 和 writeWorkspaceFile()
  旧: fs.writeFile(resolvedPath, content)
  新: 
    const tmpPath = resolvedPath + '.tmp.' + Date.now()
    await fs.writeFile(tmpPath, content)
    await fs.rename(tmpPath, resolvedPath)
    // rename 是 POSIX 原子操作
    // 崩溃最多丢失 .tmp 文件，不影响原文件
```

**1.5 修复 replace_all 反向引用**

```
变更: editWorkspaceFile()
  旧: originalContent.replaceAll(oldString, newString)
  新: originalContent.replaceAll(oldString, () => newString)
      // 闭包阻止 $1/$&/$` 等特殊模式扩展
  或: originalContent.replaceAll(
        // 需要转义 oldString 中的正则特殊字符
        escapeRegExp(oldString), 
        () => newString
      )
```

推荐: 使用闭包 `() => newString`，最简单且安全。

#### Phase 2: 精度提升 (2-3天, P0 后跟进)

**2.1 引号风格保护** (参考 Claude Code preserveQuoteStyle)

```
1. 匹配前: findActualString()
   - 精确匹配 first
   - 失败 → 标准化弯引号→直引号，找到位置
   - 返回文件中实际子串 (保留原始引号)
2. 替换时: preserveQuoteStyle()
   - 检测 old_string 实际匹配中的引号风格
   - 将 new_string 中的引号替换为相同风格
```

**2.2 模糊匹配 — Relative Indentation** (参考 Aider)

```
1. 精确匹配失败后 → 尝试 relative_indent 匹配
2. 将 old_string 和文件内容转换为相对缩进 (每行减最小缩进)
3. 在相对缩进形式中匹配
4. 匹配成功 → 恢复到文件中的实际缩进级别
5. 失败 → 返回 STRING_NOT_FOUND (让 Agent re-read + retry)
```

**2.3 错误码体系完善** (参考 Claude Code 10 个错误码)

当前 ravens 只有: STRING_NOT_FOUND, MULTIPLE_MATCHES, FILE_NOT_FOUND
应增加:
- NO_CHANGE (old === new)
- FILE_NOT_READ (不在 fileStateCache 中)
- FILE_MODIFIED_SINCE_READ (staleness 检测触发)
- FILE_TOO_LARGE (>1GiB)
- EMPTY_OLD_STRING (文件存在时 old_string 为空)

### 影响范围

| 文件 | 变更类型 |
|------|----------|
| `executor.js` | staleness check 条件修改 (~5 LOC) |
| `builtins.js` editWorkspaceFile() | 原子写入 + replace_all 修复 + setFileState (~15 LOC) |
| `builtins.js` writeWorkspaceFile() | 原子写入 + setFileState (~10 LOC) |
| `contract.js` | 增加 `requiresStalenessCheck` 标记 (~3 LOC) |
| `builtins.js` edit/write 定义 | 设置标记 + isDestructive (~4 LOC) |
| Phase 2 新模块 `editMatch.js` | 引号保护 + 模糊匹配 (~200 LOC) |

### Phase 1 完成标准

- [ ] edit 工具: 文件被外部修改后编辑 → 返回 FILE_MODIFIED_SINCE_READ 错误
- [ ] write 工具: 同上
- [ ] 原子写入: 写入中途 kill 进程 → 原文件无损 (最多有 .tmp 残留)
- [ ] replace_all: old_string 含 `$1` → 替换结果中出现字面 `$1`，不是扩展值
- [ ] edit 成功后 fileStateCache 更新 → 连续编辑不误报 staleness
- [ ] 现有测试/功能无回归

---

## P0 #2: 检查点/回滚系统

### 现状诊断

| 状态 | 详情 |
|------|------|
| **SQLite Schema** | `memory_checkpoints` 和 `session_memory_snapshots` 表存在，但只用于 memory 压缩快照，不是文件历史快照 |
| **CRUD 函数** | ❌ 无 createCheckpoint / rollback / restore |
| **API 路由** | ❌ `/checkpoints/:id/rollback` → 404 |
| **Agent Loop** | ❌ agentExecutor.js 无任何 snapshot 调用 |
| **文件编辑** | edit/write 直接 fs.writeFile，无备份 |
| **已有相关** | `getLatestSafeBoundary()` (memory/service.js) — 找 tool 调用间的安全恢复点，可复用 |

### 残留代码分析

**SQLite 表结构**:

```sql
-- memory_checkpoints (适合改为文件检查点)
CREATE TABLE memory_checkpoints (
  id INTEGER PRIMARY KEY,
  chat_id TEXT NOT NULL,
  transcript_seq INTEGER,       -- ★ 对应 Agent 消息/转的序号
  kind TEXT,                    -- ★ 可用于区分 'file_checkpoint' vs 'memory_checkpoint'
  state_json TEXT,              -- ★ 可存储文件版本元数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- session_memory_snapshots (memory 专用，不建议混用)
CREATE TABLE session_memory_snapshots (
  id INTEGER PRIMARY KEY,
  chat_id TEXT NOT NULL,
  start_seq INTEGER,
  end_seq INTEGER,
  summary_text TEXT,
  active_state_json TEXT,
  token_estimate INTEGER,
  source_run_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**workspace 结构** (每 session):
```
{RUNTIME_WORKSPACE_ROOT}/{chatId}/
├── workspace/       # Agent 编辑的文件
├── artifacts/       # 生成物
└── memory/          # workingMemory.json
```

### 设计决策: 文件系统 vs SQLite vs Git

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **文件系统快照** (Claude Code) | 大文件安全 (copyFile)、直观、无依赖 | 占用更多磁盘 | ✅ 推荐 |
| **SQLite 存储** | 查询方便、与现有 schema 统一 | 大文件 BLOB 问题、DB 膨胀 | ❌ 不推荐存文件内容 |
| **Git 自动提交** (Aider) | 完整 diff/merge 能力 | 依赖 git、污染 git log、非 git 项目无法用 | ❌ 不推荐 |

**决策: 文件系统快照 (Claude Code 模式) + SQLite 元数据索引**

- 文件备份: `~/.ravens/file-history/{chatId}/{pathHash}@v{version}`
- 元数据查询: `memory_checkpoints` 表 (复用现有 schema，kind='file_checkpoint')
- 原因: 大文件 copyFile 而非 readFile → 不 OOM；SQLite 查快照列表快

### 实施方案

#### Phase 1: 核心快照与回滚 (4-5天)

**1.1 fileHistory.js — 文件版本管理** (~200 LOC)

```
功能:
  - trackFile(chatId, filePath) — 编辑前备份当前版本
    → copyFile(currentFile, backupPath)
    → pathHash = SHA256(absolutePath).slice(0, 16)
    → backupPath = `~/.ravens/file-history/${chatId}/${pathHash}@v${version}`
    → max 100 versions per session, FIFO 淘汰
  - restoreFile(chatId, filePath, version) — 恢复指定版本
    → copyFile(backupPath, currentFile)
  - getFileVersions(chatId, filePath) — 列出所有版本
  - detectChange(currentFile, backupFile) — mtime 比较快速路径
  - cleanupSession(chatId) — session 结束后清理快照 (可选保留)

关键:
  - 使用 fs.copyFile() 而非 fs.readFile() → 避免 OOM
  - mtime 先比，内容后比 → 99% 情况 mtime 足够
  - 新 session 恢复时可用硬链接 fs.link() → O(1) 空间
```

**1.2 snapshotManager.js — 快照创建与回滚** (~150 LOC)

```
功能:
  - makeSnapshot(chatId, messageId, trackedFiles[]) 
    → 创建 FileHistorySnapshot: {messageId, trackedFileBackups, timestamp}
    → 对每个 tracked file: trackFile(chatId, filePath)
    → 写入 memory_checkpoints 表 (kind='file_checkpoint', state_json={messageId, snapshot})
  - rewindToSnapshot(chatId, messageId)
    → 从 memory_checkpoints 读取 snapshot
    → 对每个 tracked file:
      backup=null → unlink (文件在该点不存在)
      backup exists → copyFile(backup, current)
  - listSnapshots(chatId) — 列出所有可用快照
  - getSnapshotDiff(chatId, messageId) — 当前状态 vs 快照的差异

数据结构:
  FileHistorySnapshot {
    messageId: string,     // 关联到 Agent 消息
    trackedFileBackups: {
      [filePath]: { backupPath, version, mtimeMs } | null
    },
    timestamp: number
  }
```

**1.3 agentExecutor.js 集成** (~30 LOC)

```
集成点:
  1. 每轮开始前 (line ~332): 
     trackedFiles = 收集本轮将涉及的文件列表
     makeSnapshot(chatId, currentMessageId, trackedFiles)
  
  2. edit/write 工具内部: 
     trackFile(chatId, filePath) — 单文件备份
  
  3. 不在每轮后强制全量 snapshot — 精简开销
     仅在 tool 执行成功后追加 trackFile
```

**1.4 API 路由** (~50 LOC)

```
POST /conversations/:id/checkpoints          → makeSnapshot()
GET  /conversations/:id/checkpoints          → listSnapshots()
POST /conversations/:id/checkpoints/:msgId/rollback → rewindToSnapshot()
GET  /conversations/:id/checkpoints/:msgId/diff      → getSnapshotDiff()
```

**1.5 Agent 工具: revert** (~20 LOC)

```
工具名: revert
功能: 回滚到指定消息对应的文件状态
输入: { messageId: string }
输出: { revertedFiles: string[], message: string }
```

#### Phase 2: UI 与增强 (2-3天, P0 #1 完成后跟进)

- Board 前端: 回滚选择器 + diff 对比视图
- SSE event: `checkpoint_created`, `checkpoint_rollback`
- 自动清理策略: session 结束 7 天后删除快照

### Phase 1 完成标准

- [ ] Agent 每轮开始前自动创建快照 (仅涉及文件)
- [ ] edit/write 执行前备份当前文件版本
- [ ] API: GET /conversations/:id/checkpoints 返回快照列表
- [ ] API: POST /conversations/:id/checkpoints/:msgId/rollback 恢复文件
- [ ] 回滚后文件内容与快照完全一致
- [ ] 大文件 (100MB+) 快照不 OOM (copyFile 而非 readFile)
- [ ] 快照元数据存储在 SQLite memory_checkpoints 表

### 与 P0 #1 的依赖关系

```
P0 #1 (edit 增强) → P0 #2 (checkpoint)
  依赖点:
  - edit 成功后必须更新 fileStateCache → checkpoint 也需要知道最新文件状态
  - 原子写入 → checkpoint 备份的文件是完整可用的
  前置:
  - edit 工具需在执行前调用 trackFile() — 这是 checkpoint 集成点
  - 可并行: checkpoint 的 fileHistory.js 和 snapshotManager.js 不依赖 edit 增强
  - 但集成到 agentExecutor 需要在 edit 增强完成后
```

---

## P0 #3: Bash 安全验证

### 现状诊断

| 状态 | 详情 |
|------|------|
| **安全验证** | ❌ **零** — bashCommand() 直接 `spawn('bash', ['-c', command])`，无任何验证 |
| **权限引擎** | 只检查**工具名** (bash 工具能否运行)，不检查**命令内容** |
| **安全策略** | securityPolicy.js (38 LOC) — **纯文本** system prompt 指令，无运行时强制执行 |
| **输入验证** | validator.js (102 LOC) — 验证 JSON Schema (类型/必填/长度)，不验证命令语法 |
| **Session 配置** | protocol.js:160 有 `projectPermissions: { bash: 'ask', write: 'ask' }` 默认 — **但仅做工具名级别控制** |

### 执行流 (从 Agent 到 bash)

```
Agent 发出 tool_use (name: "bash", input: { command: "rm -rf /" })
  ↓
executor.js:86 resolvePermission(tool) → "bash" 工具是否被允许? → ALLOW
  ↓  ⚠️ 不检查 command 内容
executor.js → builtins.js:531 bashCommand(command)
  ↓  ⚠️ 无验证, 直接执行
builtins.js:558 spawn('bash', ['-c', command])
  ↓  宿主机上直接执行
```

**核心问题**: 权限检查只到 "bash 工具能不能用"，不检查 "具体命令是否安全"。

### 已有安全基础设施

| 组件 | 文件 | 能力 | 可复用性 |
|------|------|------|----------|
| `permissionEngine.js` | 工具名通配符匹配 | ALLOW/DENY/ASK | ⚠️ 可扩展为命令内容检查 |
| `resolveWorkspacePath()` | fs.js | path traversal 防护 | ✅ 已正常工作 |
| `projectPermissions` | protocol.js:160 | `{ bash: 'ask', write: 'ask' }` | ⚠️ 仅工具名级别 |
| `TOOL_CONFIRM_REQUIRED` 事件 | agentExecutor.js:636-758 | 用户确认工具执行 | ✅ 可复用于 Ask 行为 |
| `securityPolicy.js` | system prompt 文本约束 | LLM 层面指导 | ❌ 零运行时强制力 |

### Claude Code bashSecurity.ts 核心架构 (2592 LOC)

**验证流程**: `bashCommandIsSafe(command) → PermissionResult`

```
输入: bash 命令字符串
  ↓
pre-process(command)
  ├─ extractQuotes()           — 逐字符提取引号内容
  ├─ stripSafeRedirections()   — 移除安全重定向 (2>&1, >/dev/null)
  │   ⚠️ 边界条件 (?=\s|$) 是生死线，防止 >/dev/nullo 前缀匹配
  └─ 提取未引号包裹的内容用于后续检查
  ↓
early-allow paths
  → 已知安全模式 (如纯 echo、ls 等) → allow
  ↓
validator chain (23 检查类别)
  → 逐一通过: 每个检查器返回 allow/deny/ask/passthrough
  → 第一个 non-passthrough 结果即返回
  ↓
所有检查通过 → allow
未知语法 → ask (fail-closed)
```

**PermissionResult 结构**:
```js
{ behavior: 'allow'|'deny'|'ask'|'passthrough',
  message: string,                              // 人类可读原因
  isBashSecurityCheckForMisparsing?: boolean }  // 解析器差异标记
```

### 23 检查类别优先级排序 (按实现顺序)

| 阶段 | # | 类别 | 威胁 | 实现难度 | 阻断攻击占比 |
|------|---|------|------|----------|-------------|
| **Phase 1** | 7 | NEWLINES | `\n\r` 分隔隐藏命令 | 低 | ~30% |
| **Phase 1** | 8 | COMMAND_SUBSTITUTION | `$()`, 反引号, `${}`, `<()`, `>()` | 中 | ~40% |
| **Phase 1** | 9 | INPUT_REDIRECTION | `<` 文件读取 | 低 | ~5% |
| **Phase 1** | 10 | OUTPUT_REDIRECTION | `>` 文件覆写 | 低 | ~5% |
| | | | | | **Phase 1 合计 ~80%** |
| **Phase 2** | 5 | SHELL_METACHARACTERS | `; \| &` 在参数中 | 中 | ~5% |
| **Phase 2** | 6 | DANGEROUS_VARIABLES | 变量在重定向/管道上下文 | 中 | ~3% |
| **Phase 2** | 11 | IFS_INJECTION | 修改 Input Field Separator | 中 | ~2% |
| | | | | | **Phase 2 合计 ~90%** |
| **Phase 3** | 4 | OBFUSCATED_FLAGS | flag 名称中的引号字符 | 中 | ~2% |
| **Phase 3** | 15 | BACKSLASH_ESCAPED_WS | 反斜杠+空白混淆 | 中 | ~1% |
| **Phase 3** | 17 | CONTROL_CHARACTERS | `\x00-\x1F` | 低 | ~1% |
| **Phase 3** | 18 | UNICODE_WHITESPACE | NBSP 等 | 低 | ~1% |
| **Phase 3** | 1 | INCOMPLETE_COMMANDS | 片段命令 | 低 | ~1% |
| | | | | | **Phase 3 合计 ~95%** |
| **Phase 4** | 2 | JQ_SYSTEM_FUNCTION | `jq 'system("cmd")'` | 高 | ~1% |
| **Phase 4** | 3 | JQ_FILE_ARGUMENTS | jq `-f` 文件注入 | 高 | <1% |
| **Phase 4** | 12 | GIT_COMMIT_SUBSTITUTION | `git commit -m "$()"` | 中 | ~1% |
| **Phase 4** | 13 | PROC_ENVIRON_ACCESS | `/proc/self/environ` | 低 | <1% |
| **Phase 4** | 14 | MALFORMED_TOKEN_INJECTION | 解析器差异 | 高 | ~1% |
| | | | | | **Phase 4 合计 ~98%** |
| **Phase 5** | 16 | BRACE_EXPANSION | `{a,b,c}` | 低 | <1% |
| **Phase 5** | 19 | MID_WORD_HASH | `#` 注释注入 | 中 | <1% |
| **Phase 5** | 20 | ZSH_DANGEROUS_COMMANDS | zmodload 等 | 中 | ~1% |
| **Phase 5** | 21 | BACKSLASH_ESCAPED_OPS | 反斜杠运算符 | 中 | <1% |
| **Phase 5** | 22 | COMMENT_QUOTE_DESYNC | 引号/注释不同步 | 高 | ~1% |
| **Phase 5** | 23 | QUOTED_NEWLINE | 引号内换行 | 中 | <1% |

### 关键实现模式

**1. 安全重定向剥离 — 边界条件是生死线**

```js
// ❌ 危险: 能匹配 /dev/nullo
command.replace(/>\s*\/dev\/null/g, '')

// ✅ 安全: (?=\s|$) 确保后面是空白或行尾
command.replace(/>\s*\/dev\/null(?=\s|$)/g, '')
```

**2. 命令替换检测 (最高优先级)**

```js
// 检测所有命令替换形式:
// $()       — $(whoami)
// 反引号    — `whoami`
// ${}       — ${IFS} 在重定向上下文
// $[]       — $[1+1] (旧算术)
// <()       — 进程替换 (输入)
// >()       — 进程替换 (输出)
// =(cmd)    — Zsh 进程替换
// 在参数中检测 = 前缀  — Zsh 等号扩展
```

**3. 引号内容提取 (quote-aware parsing)**

```js
// 逐字符解析命令，跟踪引号状态 (单引号/双引号/无引号)
// 仅提取非引号内容用于安全检查
// 引号内的 $() 仍然需要检查 (双引号中 $() 会展开)
// 单引号内的 $() 不会展开 → 安全 (除 heredoc 外)
```

**4. Fail-Closed 默认策略**

```
未识别的语法 → 'ask' (请求用户确认)
绝不能 → 'allow' (未知 = 不安全)
```

### ravens 实施方案

#### 架构决策

**插入点选择**: `builtins.js:558` (spawn 之前) — 最佳位置

理由:
- 最接近执行点 — 不可能被绕过
- 不影响其他工具的执行路径
- 与权限引擎解耦 — bashSecurity 是纯验证逻辑，不涉及权限授权

**独立模块**: `src/modules/tools/bashSecurity.js` — 不内嵌在 builtins.js

```js
// 导出:
export function bashCommandIsSafe(command, options) → PermissionResult
// PermissionResult: { behavior, message, isBashSecurityCheckForMisparsing? }
```

**与权限引擎集成**:

```
executor.js flow (改造后):
  1. resolvePermission(tool) → 工具名级别检查
  2. if (tool.name === 'bash') → bashCommandIsSafe(command)
  3. 综合两个检查结果:
     - 任一 deny → deny
     - 任一 ask → ask (emit TOOL_CONFIRM_REQUIRED)
     - 都 allow → allow
```

#### Phase 1: 阻止 80% 注入攻击 (3天)

**目标**: NEWLINES + COMMAND_SUBSTITUTION + REDIRECTIONS

```js
// bashSecurity.js Phase 1 (~200 LOC)
export function bashCommandIsSafe(command, options = {}) {
  const result = preProcess(command);
  
  // 检查 1: 换行注入
  if (hasNewlineInjection(result.unquotedContent)) {
    return { behavior: 'deny', message: 'Newline detection: possible command injection' };
  }
  
  // 检查 2: 命令替换
  const cmdSubResult = checkCommandSubstitution(result);
  if (cmdSubResult) return cmdSubResult;
  
  // 检查 3: 输入/输出重定向
  const redirResult = checkRedirections(result);
  if (redirResult) return redirResult;
  
  // 未知 → ask (fail-closed)
  return { behavior: 'allow' };
}
```

**新增依赖**: 无 (纯 Node.js 实现)

#### Phase 2: 阻止 90% 攻击 (2天)

增加: SHELL_METACHARACTERS + DANGEROUS_VARIABLES + IFS_INJECTION

#### Phase 3-5: 渐进增强 (各 2-3天)

按上方优先级排序推进。每个 Phase 不影响已有功能，可增量发布。

### 与 executor.js 的集成方案

```
builtins.js bashCommand() 改造:
  旧: spawn('bash', ['-c', command])
  新:
    const securityResult = bashCommandIsSafe(command, { sessionId, workspace });
    if (securityResult.behavior === 'deny') {
      return { error: true, output: `Security: ${securityResult.message}` };
    }
    if (securityResult.behavior === 'ask') {
      // 通过 TOOL_CONFIRM_REQUIRED 事件请求用户确认
      // 用户确认后继续执行
    }
    spawn('bash', ['-c', command])  // allow → 执行
```

**Session 配置扩展**:

```
sessions/store.js session schema 增加:
  bashPolicy: {
    enforcementLevel: 'strict' | 'permissive' | 'disabled',
    customRules: [{ pattern: 'rm -rf*', behavior: 'deny' }, ...]
  }
```

### Phase 1 完成标准

- [ ] `rm -rf /` → deny
- [ ] `echo hello; rm -rf /` (换行/分号注入) → deny
- [ ] `echo $(whoami)` (命令替换) → ask
- [ ] `echo hello` → allow
- [ ] `cat file.txt > /etc/passwd` (危险重定向) → deny
- [ ] `npm test 2>&1` (安全重定向) → allow (正确剥离)
- [ ] `>/dev/nullo echo x` (前缀匹配攻击) → deny (不会被误剥离)
- [ ] 未知命令格式 → ask (fail-closed)
- [ ] bashSecurity.js 独立模块，不修改 builtins.js 核心逻辑 (仅调用)
- [ ] 所有现有 bash 工具功能无回归

---

## P0 #4: LSP/代码智能集成 ✅ 已实现 (2026-04-26)

### 实现状态

`code_intelligence` 工具已完整实现，提供 10 种 LSP 操作（goToDefinition, findReferences, hover, documentSymbol, workspaceSymbol, goToImplementation, callHierarchy, prepareRename, rename, diagnostics）。每次 Write/Edit 后自动触发 LSP diagnostics（executor.js:197-204）。

以下为原始分析文档，保留作为历史参考。
| **项目检测** | 仅检测 `AGENTS.md`/`CLAUDE.md` (projectContext.js)，不检测 `package.json` 等 |
| **代码理解** | Agent 只能靠 grep 猜测函数定义和引用关系 |
| **符号查找** | 无 — 不知道函数在哪定义、谁调用了谁 |
| **MCP 基础设施** | ✅ 有 stdio 传输 + 自动重连 (client.js, 253 LOC) — 可参考实现 LSP 客户端 |

### Claude Code LSP 架构参考 (~2000+ LOC)

| 模块 | LOC | 职责 | ravens 对应 |
|------|-----|------|------------|
| LSPTool.ts | 860 | 9个操作暴露给 Agent | 新: `src/modules/lsp/tools.js` |
| LSPServerManager.ts | 420 | 多服务器生命周期 | 新: `src/modules/lsp/manager.js` |
| LSPClient.ts | 447 | JSON-RPC via stdio | 新: `src/modules/lsp/client.js` |
| LSPServerInstance.ts | 511 | 状态机 + 崩溃恢复 | 新: `src/modules/lsp/instance.js` |
| formatters.ts | 592 | LLM 友好输出格式 | 新: `src/modules/lsp/formatters.js` |
| lspRecommendation.ts | 374 | 自动检测项目 LSP | 新: `src/modules/lsp/detector.js` |

### ravens 集成点分析

**1. 工具注册** (runtime.js:148-153)

```
当前:
  builtInTools.forEach(registerTool)
  // → 16 个内置工具

改造:
  builtInTools.forEach(registerTool)
  lspTools.forEach(registerTool)     // LSP 工具 (条件注册)
  // LSP 工具仅在对应语言服务器可用时注册
```

**2. Context Assembly** (promptAssembler.js)

```
当前 section 优先级 (0-100):
  project_context: 60
  git_status: 55
  memory: 50
  attachments: 40

新增:
  code_intelligence: 58  // 在 git_status 之前
  // 内容: LSP 可用符号摘要 (可选, 增强上下文)
```

**3. 配置系统** (config/index.js)

```
当前:
  mcpServers: JSON.parse(process.env.MCP_SERVERS || '{}')

新增:
  lspServers: JSON.parse(process.env.LSP_SERVERS || '{}')
  // 格式: { "typescript": { command: "typescript-language-server", args: ["--stdio"] } }
```

**4. 传输层** (参考 MCP client.js)

```
MCP: @modelcontextprotocol/sdk + StdioClientTransport
LSP: vscode-jsonrpc + child_process (stdio)

相似模式:
  - 启动子进程
  - 通过 stdin/stdout 通信
  - JSON-RPC 消息格式
  - 自动重连

差异:
  - LSP 是长连接 (整个 session 期间持续)
  - LSP 需要 didOpen/didChange 同步
  - LSP 有初始化握手 (initialize → initialized)
```

### 9 个 LSP 操作 (按实现优先级)

| 阶段 | 操作 | LSP Method | 用途 | 实现量 |
|------|------|-----------|------|--------|
| **Phase 1** | goToDefinition | textDocument/definition | 跳转到定义 | ~80 LOC |
| **Phase 1** | findReferences | textDocument/references | 查找所有引用 | ~60 LOC |
| **Phase 2** | hover | textDocument/hover | 悬停类型信息 | ~50 LOC |
| **Phase 2** | documentSymbol | textDocument/documentSymbol | 文件符号列表 | ~50 LOC |
| **Phase 3** | workspaceSymbol | workspace/symbol | 工作区符号搜索 | ~50 LOC |
| **Phase 3** | goToImplementation | textDocument/implementation | 跳转到实现 | ~50 LOC |
| **Phase 3** | callHierarchy | textDocument/prepareCallHierarchy + incomingCalls/outgoingCalls | 调用图 | ~100 LOC |

### 关键设计模式

**1. 必须先 Open 文件**

```
任何 LSP 请求前:
  textDocument/didOpen({ uri, languageId, version, text })
不 Open → 大多数服务器返回空结果

集成点: edit 工具成功后发送 textDocument/didChange
        read 工具读取时发送 textDocument/didOpen (如果尚未 open)
```

**2. Factory Functions (不用 class)**

```js
// ravens 代码风格: 函数式
function createLSPClient(serverConfig) {
  let state = 'stopped';
  let connection = null;
  
  return {
    start() { /* ... */ },
    dispose() { /* ... */ },
    request(method, params) { /* ... */ },
    notify(method, params) { /* ... */ },
  };
}
```

**3. 崩溃恢复**

```
LSP Server Instance 状态机:
  stopped → starting → running
  running → crashed → recovering → running (max 3 次)
  3 次崩溃 → permanent_failure → 标记不可用，不重试
```

**4. Content-Modified 重试**

```
错误码 -32801 = 文件在请求期间被修改 (Agent 编辑后立即查询)
→ 自动重试 (max 3 次, 100ms 间隔)
```

**5. LLM 友好的输出格式**

```
// 不返回原始 LSP JSON，而是格式化:
// "src/auth/jwt.js:42:8 → function sign(payload, secret, options)"
// 相对路径 + 行号:字符位置 — Agent 直接理解和使用
```

### ravens 实施方案

#### Phase 1: 核心连接 + 定义/引用 (4天)

**1.1 lsp/client.js** (~150 LOC)

```
功能:
  - createLSPClient(serverConfig) → { start, dispose, request, notify }
  - 使用 vscode-jsonrpc 创建连接 (懒加载 require)
  - stdio 传输: child_process.spawn(serverConfig.command, serverConfig.args)
  - 初始化握手: initialize → initialized
  - 自动 open/close 文件跟踪

依赖: vscode-jsonrpc (~129KB, 懒加载)
```

**1.2 lsp/instance.js** (~200 LOC)

```
功能:
  - createLSPServerInstance(config) → { start, stop, getStatus, getClient }
  - 状态机: stopped → starting → running → crashed → recovering
  - 崩溃恢复: max 3 次, 指数退避
  - Content-Modified 重试: -32801 错误自动重试

关键: LSP 服务器是长生命周期进程 — 从 session 开始到结束
```

**1.3 lsp/manager.js** (~200 LOC)

```
功能:
  - createLSPServerManager() → { getServerForFile, startServer, stopAll }
  - 根据文件扩展名路由到对应语言服务器
  - 多服务器协调 (TypeScript, Python, Go 同时运行)
  - 会话结束时 dispose 所有服务器
```

**1.4 lsp/tools.js** (~150 LOC)

```
功能:
  - 注册 'lsp' 工具到工具注册表
  - 输入: { operation: 'definition'|'references', file_path, line, character }
  - 输出: 格式化的位置列表 (相对路径 + 行号)
  - 自动 didOpen (如果文件尚未 open)
```

**1.5 lsp/detector.js** (~100 LOC)

```
功能:
  - detectLSHServers(projectRoot) → [{ language, command, args }]
  - 检测逻辑:
    .ts/.tsx + package.json → typescript-language-server --stdio
    .py + requirements.txt → pylsp
    .go + go.mod → gopls
    .rs + Cargo.toml → rust-analyzer
  - 检查命令是否在 PATH 中可用 (which/where)
```

**1.6 lsp/formatters.js** (~80 LOC)

```
功能:
  - formatDefinitionResult() → "src/auth/jwt.js:42:8"
  - formatReferencesResult() → 可读的引用列表
  - relative paths + line:char 位置
```

#### Phase 2: 多服务器 + 自动检测 (3天)

- lsp/manager.js 完善: 多服务器生命周期
- lsp/detector.js 完善: 自动检测已安装 LSP
- config/index.js: `LSP_SERVERS` env 配置
- hover + documentSymbol 操作

#### Phase 3: 高级操作 (2天)

- workspaceSymbol
- goToImplementation
- callHierarchy (incomingCalls + outgoingCalls)
- edit 工具集成: didChange 通知

### 新增依赖

```
vscode-jsonrpc          ~129KB  — JSON-RPC 传输
vscode-languageserver-protocol  — LSP 协议类型定义

⚠️ 懒加载: require() 仅在首次 lsp 工具使用时
  → 不影响不使用 LSP 的 session 的启动性能
```

### 与 edit 工具的集成

```
edit 工具成功后:
  → lspManager.getServerForFile(filePath)
  → if server exists: server.getClient().notify('textDocument/didChange', {...})
  → 无 LSP 服务器 → 不通知 (静默降级)
```

### Phase 1 完成标准

- [ ] 在 TypeScript 项目中: `lsp` 工具 → goToDefinition 返回正确位置
- [ ] 在 TypeScript 项目中: `lsp` 工具 → findReferences 返回所有引用
- [ ] LSP 服务器崩溃后自动恢复 (max 3 次)
- [ ] 3 次崩溃后标记为不可用，不重试
- [ ] LSP 不可用时 (无对应服务器) → 工具返回友好错误提示
- [ ] 首次使用时懒加载 vscode-jsonrpc
- [ ] 所有现有工具功能无回归

---

## P0 #5: 代码库索引/语义搜索

### 现状诊断

| 工具 | 位置 | 机制 | 限制 |
|------|------|------|------|
| `grep` | builtins.js:220-280 | `rg --line-number --color never -e '{pattern}' .` | 无 regex 标志、无上下文行、无类型过滤、100 匹配限制、10s 超时 |
| `glob` | builtins.js:197-216 | 递归 `walkWorkspace` + `path.matchesGlob` | 无缓存、每次全量遍历 |
| `list` | builtins.js:137-169 | `fs.readdir` + 文件类型 | 无缓存、不递归 |
| `read` | builtins.js:282-305 | `fs.readFile` | 20,000 字符限制 |

**核心问题**: 所有搜索都是 O(n) 全扫描，无索引、无缓存、无语义理解。

### 已有可复用基础设施

| 组件 | 位置 | 能力 |
|------|------|------|
| `better-sqlite3` | package.json 已安装 | FTS5 全文搜索 + BM25 排序 |
| `sqlite-vec` | package.json 已安装 | 向量搜索 (Phase 3 用) |
| `plugins/db.js` | SQLite 管理器 | 已有数据库连接管理 |
| `resolveWorkspacePath()` | fs.js | 路径安全验证 |
| `fileStateCache` | executor.js | 文件变更检测 (mtime + size) |
| `walkWorkspace()` | builtins.js | 递归文件遍历 |

### Claude Code 核心洞察

> **"Anthropic found grep simpler than RAG for code search."**
> 
> Claude Code 早期使用 Voyage embeddings 做 RAG，后来**放弃了**，回到 ripgrep + glob + Read。
> 
> 原因: grep 简单可预测，LSP 提供精确符号智能，两者组合 > 纯 RAG。
> 
> **但 ravens 的 grep 比 Claude Code 弱很多** — 没有类型过滤、没有上下文行、匹配限制严格。所以第一步是增强 grep，而不是直接建向量索引。

### 渐进式索引方案

#### Phase 1: SQLite FTS5 全文索引 (3-4天)

**目标**: 10-100x 加速重复搜索，替代 O(n) grep

```
实现:
  src/modules/search/indexer.js (~200 LOC)
    - indexWorkspace(workspaceRoot) → 遍历文件 → 写入 FTS5
    - updateFileIndex(filePath, content) → 单文件增量更新
    - searchIndex(query, options) → BM25 排序搜索
    - getFileHashes() → 文件内容哈希 → 跳过未变更文件

  src/modules/search/watcher.js (~150 LOC)
    - chokidar 文件监听 → 增量索引更新
    - 只监听 workspace 内文件
    - .gitignore 感知

  数据库: 使用现有 better-sqlite3 连接
    CREATE VIRTUAL TABLE code_index USING fts5(
      file_path, content, language,
      tokenize='porter unicode61'
    );
    CREATE TABLE file_hashes (
      file_path TEXT PRIMARY KEY,
      content_hash TEXT,
      last_indexed DATETIME
    );

  工具: 升级 grep 工具
    新增 input 参数: { useIndex: true }
    当 useIndex=true → searchIndex() 而非 rg
    当 useIndex=false (默认) → 仍用 rg (兼容)
```

**新增依赖**: `chokidar` (文件监听)

**存储**: 复用现有 SQLite 连接，新增 FTS5 表

#### Phase 2: tree-sitter AST 符号索引 (5-7天)

**目标**: 40-70% token 节省，O(1) 符号查找

```
实现:
  src/modules/search/astIndexer.js (~300 LOC)
    - parseFile(filePath) → tree-sitter 解析 → 提取符号
    - 符号类型: function, class, method, variable, import, export
    - 存储: { name, kind, file, startLine, endLine, span }

  src/modules/search/symbolIndex.js (~200 LOC)
    - addSymbol(symbol) → SQLite 插入
    - searchSymbols(query, kind?, file?) → 符号搜索
    - getSymbolGraph() → 调用/依赖图 (Phase 4)

  新工具: `symbol`
    输入: { query: "sign", kind: "function" }
    输出: [{ name, kind, file, line, preview }]
    替代大量 grep + read 序列

  符号摘要 (Aider RepoMap 模式):
    - 将整个项目的符号列表喂给 Agent 作为上下文
    - Token 预算裁剪: 按 PageRank 排序，优先高影响力符号
```

**新增依赖**: `tree-sitter` + 语法 WASM (或原生绑定)

**⚠️ tree-sitter WASM 注意事项**:
- 内存泄漏 (Sourcegraph 文档记录)
- 优先用原生绑定 `node-tree-sitter`
- WASM 模式: 每 ~10k 文档回收 parser 实例

#### Phase 3: 本地向量搜索 (7-10天, 按需)

**目标**: 91% recall 混合检索 (BM25 + 向量 RRF 融合)

```
实现:
  src/modules/search/vectorIndexer.js (~200 LOC)
    - embedChunk(text) → 本地 fastembed 嵌入
    - 嵌入模型: BAAI/bge-small-en-v1.5 (384-dim, ~130MB)
    - 存储: sqlite-vec HNSW 索引

  src/modules/search/hybridSearch.js (~150 LOC)
    - search(query) → 并行 BM25 + 向量
    - RRF 融合 (k=60, 无需调优)
    - 返回融合排序结果

  新工具: `search` (语义搜索)
    输入: { query: "处理用户认证的代码", mode: "hybrid"|"keyword"|"semantic" }
    输出: [{ file, line, snippet, score }]
```

**新增依赖**: `fastembed` (本地嵌入, ~130MB 模型)

**仓库规模决策**:
- <1K 文件: Phase 1 足够
- 1K-10K 文件: Phase 1 + Phase 2
- 10K+ 文件: Phase 1 + Phase 2 + Phase 3

#### Phase 4: 调用图 + 依赖图 (5-7天, 锦上添花)

```
实现:
  src/modules/search/dependencyGraph.js (~300 LOC)
    - 从 symbolIndex 提取 import/require 关系
    - 构建 call graph
    - PageRank 排序 → 影响力分析

  ROI: 5-10% 额外 token 节省
  适用: 100K+ 文件大型代码库
```

### Phase 1 完成标准

- [ ] grep 工具: `useIndex=true` 返回 BM25 排序结果
- [ ] 索引构建: 遍历 workspace → FTS5 表填充完成
- [ ] 增量更新: 修改文件 → 索引自动更新 (chokidar)
- [ ] 性能: 重复搜索比 rg 快 10x+ (命中缓存场景)
- [ ] .gitignore 感知: 忽略 node_modules/ 等
- [ ] 与 LSP 互补: LSP 提供精确符号，FTS5 提供全文搜索
- [ ] 现有 grep (useIndex=false) 功能无回归

---

## 全局依赖关系与实施路径

**2026-04-26 更新**: P0 #1 (edit) 和 P0 #4 (LSP) 已实现。剩余 P0 #2 (checkpoint 工具化), P0 #3 (bash 安全), P0 #5 (索引) 仍待实施。

### 时间线 (已更新)

| 状态 | 工作项 | 备注 |
|------|--------|------|
| ✅ 已完成 | P0 #1 edit 增强 (staleness + 原子写入 + 模糊匹配 + 引号) | 7 个缺陷全部修复 |
| ✅ 已完成 | P0 #4 LSP 代码智能 (10 操作 + 自动 diagnostics) | 完整实现 |
| 🔴 P0 | P0 #3 Bash 安全验证 | 仍未开始，无 bashSecurity.js |
| 🟡 P1 | P0 #2 Checkpoint 工具化 (将 restoreFile 暴露为工具) | fileHistory.js 已有，缺 agent 工具 |
| 🟡 P1 | P0 #5 FTS5 代码索引 | 未开始 |