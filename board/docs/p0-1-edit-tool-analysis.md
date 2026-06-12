# P0 #1: 行级编辑 (edit) 工具增强 — 详细分析与实施方案

**日期**: 2026-04-23 | **状态**: ✅ 所有 7 个缺陷已于 2026-04-26 前修复
**结果**: `requiresStalenessCheck` | `editMatch.js` (模糊匹配+引号保护) | `fileHistory.js` (跟踪+恢复) | 原子写入 | LSP 自动 diagnostics | `patch` 多文件编辑

> ⚠️ 此文档作为历史参考保留。实际实施已完成。

---

## 一、现状诊断：6 个关键问题

通过深度代码审查，发现 `edit` 工具存在以下具体问题：

### 问题 1: 文件过时检测 (Staleness) 存在但完全无效

**基础设施已有，但被跳过。**

```
executor.js 已有:
  - fileStateCache (Map, max 256, 5min TTL)
  - getFileState() / setFileState() / checkFileStaleness()
  - 只读工具执行成功后调用 setFileState(output.path, stat.mtimeMs, stat.size)

BUT: staleness 检查条件是:
  if (tool.isDestructive && input.path) { ... }
      ^^^^^^^^^^^^^^^^^^^
      edit 和 write 都没有 isDestructive=true!
```

**问题拆解**:

| 工具 | isReadOnly | isDestructive | staleness 会触发? | 正确行为 |
|------|-----------|---------------|------------------|----------|
| `read` | true | false | N/A (只读不需检查) | ✅ read 后设置缓存 |
| `edit` | **未设置** (undefined→false) | **未设置** (undefined→false) | ❌ 永远不检查 | 应该检查 |
| `write` | **未设置** (undefined→false) | **未设置** (undefined→false) | ❌ 永远不检查 | 应该检查 |
| `bash` | false | false | ❌ 永远不检查 | ⚠️ 应该检查(但bash的path语义不同) |

**根因**: `isDestructive` 被用来同时表示两个含义:
1. 权限引擎: "破坏性操作需要用户确认"
2. staleness 检查: "修改文件的工具需要检测文件是否被修改"

这两个是不同概念。`edit` 不是"破坏性"操作 (它有明确意图)，但它确实需要 staleness 检查。

**同时**: `readWorkspaceFile` 返回 `path: path.relative(workspace, resolvedPath)` (相对路径)，但 `executor.js` 的 staleness 检查使用 `input.path` (可能是相对或绝对路径)。路径不一致导致缓存 key 可能不匹配。

### 问题 2: 无原子写入

```js
// builtins.js line 318 / line 378
await fs.writeFile(resolvedPath, contentInput, 'utf8')
await fs.writeFile(resolvedPath, newContent, 'utf8')
```

**风险**: 
- 写入过程中进程崩溃 → 文件内容截断/损坏
- 写入过程中断电 → 零字节文件
- 并发读写 → 读取到半写状态

**解决方案**: 写入临时文件 + `fs.rename()` (原子操作)

### 问题 3: replace_all 反向引用风险

```js
// builtins.js line 374
const newContent = replaceAll
  ? originalContent.replaceAll(oldString, newString)
  : originalContent.replace(oldString, newString)
```

**风险**: 如果 `oldString` 包含正则特殊字符且 `newString` 包含 `$1`, `$&`, `$'` 等，`replaceAll`/`replace` 会展开这些反向引用。

**示例**:
```
oldString = "foo(bar)"
newString = "result: $1"
→ 结果: "result: bar" 而不是期望的 "result: $1"
```

**注意**: 匹配计数 (line 346) 使用了 `new RegExp(oldString.replace(...))` 构造正则，但实际替换用的是字符串方法 `replaceAll`。如果 `oldString` 包含 `$`，替换结果可能不符合预期。

### 问题 4: 无引号保护

LLM 经常输出直引号 `"hello"` 但文件中实际使用弯引号 `"hello"`。

**当前行为**: 纯精确匹配。如果文件中是 `"hello"` 而 LLM 说 `old_string: "hello"`，**匹配失败**。

**Claude Code 的解决方案**: `preserveQuoteStyle()` + `findActualString()` — 先标准化引号做匹配，找到后在替换中恢复原始引号风格。

### 问题 5: 无模糊匹配

LLM 经常在缩进/空白上产生细微差异：

- 文件中是 4 空格缩进，LLM 输出 2 空格
- 文件中行末有 trailing whitespace，LLM 输出没有
- 文件中用 Tab，LLM 输出空格

**当前行为**: 精确匹配，任何差异都导致 `STRING_NOT_FOUND`。

**Aider 的解决方案**: 多层回退 (exact → strip_blank_lines → relative_indent → diff-match-patch)。

### 问题 6: 编辑后不更新缓存

```js
// editWorkspaceFile 和 writeWorkspaceFile 执行后:
// ← 没有 setFileState() 调用
// ← 没有通知 agentExecutor 新的 mtime
```

**后果**: 下次 read 后再 edit，staleness 检查会误判文件被修改过 (因为缓存中记录的是 read 时的 mtime，但文件已被 edit 改变)。

---

## 二、实施方案

### Phase 1: 基础安全 (2天) — 必须先做

#### 1.1 修复 staleness 检查逻辑

**文件**: `executor.js`

**问题**: staleness 检查条件是 `tool.isDestructive && input.path`，但 edit/write 不是 `isDestructive`。

**方案**: 新增工具标记 `modifiesFiles` 或改用更宽泛的检查条件：

```js
// 方案 A: 新增 modifiesFiles 标记 (推荐)
// contract.js 增加字段:
modifiesFiles: Boolean(tool.modifiesFiles)

// 工具定义:
{ name: 'edit', modifiesFiles: true, ... }
{ name: 'write', modifiesFiles: true, ... }

// executor.js staleness 检查:
if (tool.modifiesFiles && input.path) {
  const resolvedPath = resolveWorkspacePath(options.workspace, input.path)
  const stat = await fs.stat(resolvedPath)
  const staleness = checkFileStaleness(resolvedPath, stat.mtimeMs)
  if (staleness.stale) {
    return { ... error: "File modified since last read" }
  }
}

// 方案 B: 简化 — 所有非 readOnly 工具都检查 staleness
if (!tool.isReadOnly && input.path) { ... }
```

**推荐方案 A**: `modifiesFiles` 语义更清晰。`bash` 也可能修改文件但不应该有 `modifiesFiles: true` (bash 没有明确的 input.path)。

#### 1.2 修复路径规范化

**问题**: `readWorkspaceFile` 返回相对路径，但 staleness 缓存用 `input.path` (可能是相对路径)。

**方案**: 统一使用规范化绝对路径作为缓存 key。

```js
// executor.js 中 staleness 检查:
const resolvedPath = resolveWorkspacePath(
  options.workspace.workspace, 
  input.path
)
const stat = await fs.stat(resolvedPath)
const staleness = checkFileStaleness(resolvedPath, stat.mtimeMs)

// 成功写入后也用绝对路径:
setFileState(resolvedPath, newStat.mtimeMs, newStat.size)
```

#### 1.3 原子写入

**新增**: `src/lib/atomicWrite.js`

```js
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export async function atomicWriteFile(filePath, content, encoding = 'utf8') {
  const dir = path.dirname(filePath)
  const tmpFile = path.join(
    os.tmpdir(), 
    `.ravens-write-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  
  try {
    await fs.writeFile(tmpFile, content, encoding)
    await fs.rename(tmpFile, filePath)
  } catch (error) {
    // 清理临时文件
    try { await fs.unlink(tmpFile) } catch {}
    throw error
  }
}
```

**修改**: `writeWorkspaceFile` 和 `editWorkspaceFile` 使用 `atomicWriteFile` 替代 `fs.writeFile`。

#### 1.4 编辑后更新缓存

**修改**: `editWorkspaceFile` 和 `writeWorkspaceFile` 成功后返回 mtime 信息，由 executor 更新缓存。

```js
// edit 成功后:
return {
  content: `Applied edit to ${relativePath}...`,
  applied: true,
  path: relativePath,
  // 新增:
  _mtimeMs: newStat.mtimeMs,
  _size: newStat.size,
}

// executor.js 中:
if (tool.modifiesFiles && output?._mtimeMs) {
  const resolvedPath = resolveWorkspacePath(options.workspace, input.path)
  setFileState(resolvedPath, output._mtimeMs, output._size)
}
```

### Phase 2: 精确匹配增强 (2天)

#### 2.1 引号风格保护

**新增**: `src/modules/tools/quotePreservation.js`

```js
const CURLY_OPEN = '\u201C'  // "
const CURLY_CLOSE = '\u201D' // "
const CURLY_APOSTROPHE = '\u2019' // '

const STRAIGHT_QUOTE = '"'
const STRAIGHT_APOSTROPHE = "'"

// 标准化: 弯引号 → 直引号 (用于匹配)
export function normalizeQuotes(str) {
  return str
    .replace(/[\u201C\u201D]/g, STRAIGHT_QUOTE)
    .replace(/\u2019/g, STRAIGHT_APOSTROPHE)
}

// 检测文件中的引号风格
export function detectQuoteStyle(fileContent) {
  const curlyCount = (fileContent.match(/[\u201C\u201D]/g) || []).length
  const straightCount = (fileContent.match(/"/g) || []).length
  return curlyCount > straightCount ? 'curly' : 'straight'
}

// 在替换中保持文件的引号风格
export function preserveQuoteStyle(newString, fileContent, oldString, matchIndex) {
  const style = detectQuoteStyle(fileContent)
  if (style === 'straight') return newString // 无需转换
  
  // 将 newString 中的直引号转为弯引号
  let result = newString
  // ... 具体替换逻辑 (参考 Claude Code preserveQuoteStyle)
  return result
}

// 在文件中查找实际字符串 (带标准化回退)
export function findActualString(fileContent, searchString) {
  // 1. 精确匹配
  const exactIndex = fileContent.indexOf(searchString)
  if (exactIndex !== -1) {
    return { index: exactIndex, match: searchString, normalized: false }
  }
  
  // 2. 标准化匹配
  const normalizedFile = normalizeQuotes(fileContent)
  const normalizedSearch = normalizeQuotes(searchString)
  const normalizedIndex = normalizedFile.indexOf(normalizedSearch)
  if (normalizedIndex !== -1) {
    // 返回文件中实际内容的子串 (保留原始引号)
    const actualMatch = fileContent.substring(
      normalizedIndex, 
      normalizedIndex + searchString.length
    )
    return { index: normalizedIndex, match: actualMatch, normalized: true }
  }
  
  return null // 未找到
}
```

#### 2.2 replace_all 安全化

```js
// 当前 (有 bug):
const newContent = replaceAll
  ? originalContent.replaceAll(oldString, newString)
  : originalContent.replace(oldString, newString)

// 修复: 使用函数形式防止反向引用展开
const newContent = replaceAll
  ? originalContent.replaceAll(oldString, () => newString)
  : originalContent.indexOf(oldString) !== -1
    ? originalContent.replace(oldString, () => newString)
    : originalContent
// 注意: replaceAll 和 replace 使用 () => newString 闭包形式
// 这样 $1, $&, $' 等不会被展开
```

#### 2.3 完善错误码

```js
const EDIT_ERRORS = {
  NO_CHANGE:        { code: 1, message: 'old_string and new_string are identical' },
  PERMISSION_DENIED:{ code: 2, message: 'Permission denied' },
  EMPTY_OLD_STRING: { code: 3, message: 'old_string cannot be empty for an existing file' },
  FILE_NOT_FOUND:   { code: 4, message: 'File not found. Use write to create new files.' },
  FILE_NOT_READ:    { code: 6, message: 'File must be read before editing. Use read first.' },
  FILE_MODIFIED:    { code: 7, message: 'File was modified since last read. Re-read before editing.' },
  STRING_NOT_FOUND: { code: 8, message: 'old_string not found in file' },
  MULTIPLE_MATCHES: { code: 9, message: 'old_string found multiple times. Use replace_all or provide unique string.' },
}
```

### Phase 3: 模糊匹配 (2天) — LLM 缩进容错

#### 3.1 相对缩进匹配 (Relative Indentation)

参考 Aider 的 `EditBlockCoder`:

```js
// src/modules/tools/fuzzyMatch.js

// 判断字符串每行的缩进级别
function getIndentLevel(line) {
  const match = line.match(/^(\s*)/)
  return match ? match[1].length : 0
}

// 转为相对缩进形式 (每行减去最小缩进)
function toRelativeIndent(str) {
  const lines = str.split('\n')
  const minIndent = Math.min(
    ...lines.filter(l => l.trim().length > 0).map(getIndentLevel)
  )
  return lines.map(line => line.slice(minIndent)).join('\n')
}

// 尝试相对缩进匹配
export function tryRelativeIndentMatch(fileContent, oldString, newString) {
  const relativeOld = toRelativeIndent(oldString)
  const relativeFile = toRelativeIndent(fileContent)
  
  const index = relativeFile.indexOf(relativeOld)
  if (index === -1) return null
  
  // 在原始文件中找到对应区域的实际缩进
  // 恢复 newString 的缩进以匹配文件中的缩进
  const lines = fileContent.substring(0, index).split('\n')
  const contextIndent = getIndentLevel(lines[lines.length - 1] || '')
  
  const newLines = toRelativeIndent(newString).split('\n')
  const adjustedNew = newLines
    .map((line, i) => i === 0 ? line : ' '.repeat(contextIndent) + line)
    .join('\n')
  
  return { newContent: fileContent.replace(oldString, adjustedNew) }
}
```

#### 3.2 匹配回退策略

```js
// 匹配策略 (按优先级):
// 1. 精确匹配 + 引号标准化
// 2. 相对缩进匹配
// 3. (远期) diff-match-patch 模糊匹配
```

---

## 三、修改文件清单

| 文件 | 修改内容 | 复杂度 |
|------|----------|--------|
| `src/modules/tools/contract.js` | 新增 `modifiesFiles` 字段 | 低 |
| `src/modules/tools/executor.js` | 改 staleness 检查条件为 `modifiesFiles` | 低 |
| `src/modules/tools/builtins.js` | edit/write 标记 `modifiesFiles: true`; edit 内部使用 `findActualString` + 原子写入 | 中 |
| `src/lib/fs.js` | 新增 `atomicWriteFile()` | 低 |
| `src/modules/tools/quotePreservation.js` | 新文件 — 引号标准化与保护 | 中 |
| `src/modules/tools/fuzzyMatch.js` | 新文件 — 相对缩进匹配 (Phase 3) | 中 |

**不修改的文件**:
- `permissionEngine.js` — 不涉及
- `registry.js` — 不涉及
- `agentExecutor.js` — 不涉及

---

## 四、与 Checkpoint 系统的接口

edit/write 工具增强是 Checkpoint 系统的前置依赖:

```js
// 未来在 editWorkspaceFile 中:
const snapshot = await checkpointManager.trackEdit(resolvedPath) // 备份当前文件
// ... 执行编辑 ...
// 不需要显式 finalize — Agent 每轮结束后 makeSnapshot()
```

当前不需要实现 checkpoint，但设计时预留接口:
- `atomicWriteFile` 已提供"写入前不破坏原文件"的保证
- `findActualString` 返回 `{ index, match, normalized }` — 未来可直接用于 diff 生成

---

## 五、实施检查点

### Phase 1 完成标准
- [ ] `contract.js` 新增 `modifiesFiles` 字段
- [ ] edit/write 工具标记 `modifiesFiles: true`
- [ ] executor staleness 检查改用 `modifiesFiles` 条件
- [ ] edit/write 后更新 `fileStateCache`
- [ ] `atomicWriteFile` 实现并通过测试
- [ ] edit/write 使用 `atomicWriteFile`
- [ ] 路径规范化一致性 (缓存 key 统一用绝对路径)

### Phase 2 完成标准
- [ ] `quotePreservation.js` 实现: `normalizeQuotes`, `detectQuoteStyle`, `findActualString`
- [ ] `editWorkspaceFile` 使用 `findActualString` (精确+引号标准化)
- [ ] `replaceAll` 使用闭包形式 `() => newString`
- [ ] 完整错误码体系 (9个错误码)
- [ ] 引号保护单元测试

### Phase 3 完成标准
- [ ] `fuzzyMatch.js` 实现: 相对缩进匹配
- [ ] `editWorkspaceFile` 回退策略: 精确 → 引号标准化 → 相对缩进
- [ ] 模糊匹配单元测试

---

*下一步: 确认方案后开始实施 Phase 1，或继续分析 P0 #2 (Checkpoint/回滚系统)。*