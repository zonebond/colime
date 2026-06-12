# Reset to This Point — Design Document

> **Status**: Draft
> **Date**: 2026-05-02
> **Authors**: Ravens Team

## 1. Overview

"Reset to This Point" allows users to rewind a conversation to a specific message, reverting both conversation state AND workspace files to that point in time. This is the core differentiator over simple message deletion — the workspace must be restored atomically alongside the conversation.

**User Stories**:
1. AI made wrong file edits → user rewinds to before those edits and tries a different approach
2. AI went down a wrong path → user rewinds and provides new direction
3. AI's tool execution had unintended side effects → user rewinds to clean state

## 2. Reference Implementations

| Tool | Approach | Storage | Rollback Mechanism | Session Isolation |
|------|----------|---------|-------------------|-------------------|
| **OpenCode** | Shadow git bare repo | `~/.local/share/ravens/snapshot/{project_id}/{worktree_hash}/` | `git read-tree` + `checkout-index` | Per-session bare repo |
| **Claude Code** | File copies | `~/.claude/file-history/{sessionId}/` | Copy file from backup | Per session |
| **Cline/Roo-Code** | Shadow git repo (non-bare) | VSCode storage dir | `git reset --hard` in shadow repo | Per worktree |

**Decision**: Use OpenCode's approach — **shadow git bare repo** with `core.worktree`. This gives us:
- Efficient content-addressable storage (trees, not file copies)
- Built-in diff detection via `git diff`
- Per-file targeted restore via `git checkout <hash> -- <file>`
- No dependency on user's own git repo

## 3. Architecture

### 3.1 Data Flow

```
User clicks "Reset to here" on message M
     │
     ▼
Board: resetToMessage(chatId, messageId)
     │
     ▼ POST /conversations/:chatId/revert
Runtime: revertConversation handler
     │
     ├─► 1. Find target message in transcript_events
     ├─► 2. Get snapshot hash for that message
     ├─► 3. Restore files via snapshotManager
     │      git read-tree <snapshot-hash>
     │      git checkout-index -a -f
     ├─► 4. Delete transcript_events after target message
     ├─► 5. Delete messages after target message
     ├─► 6. Emit conversation_persisted SSE event
     │
     ▼
Board: atomic replace via existing conversation_persisted handler
```

### 3.2 Shadow Git Snapshot Manager

**Location**: `ravens.runtime/src/modules/tools/snapshotManager.js`

**Storage**: `~/.ravens/snapshot/{chatId}/` — each chat gets its own isolated bare git repo

**API**:
```js
class SnapshotManager {
  // Initialize bare git repo for a chatId
  async init(chatId, workDir)

  // Capture current workspace state, return tree hash
  // Called BEFORE each LLM stream starts
  async track(chatId, workDir)

  // Full workspace restore to a snapshot
  async restore(chatId, workDir, snapshotHash)

  // Per-file revert (revert only listed patches)
  async revert(chatId, workDir, patches)

  // List files changed between current state and snapshot
  async diff(chatId, workDir, snapshotHash)

  // Clean up snapshot repo for a chatId
  async cleanup(chatId)
}
```

**Implementation Details**:

```js
// track() — capture workspace snapshot
async track(chatId, workDir) {
  const repoPath = path.join(SNAPSHOT_ROOT, chatId)
  await this._ensureRepo(repoPath, workDir)

  // Stage all files (respects .gitignore)
  await exec('git add --all', { cwd: workDir, env: { GIT_DIR: repoPath } })

  // Write tree object (NOT a commit — just a content snapshot)
  const treeHash = await exec('git write-tree', { cwd: workDir, env: { GIT_DIR: repoPath } })
  return treeHash.trim()
}

// restore() — full workspace restore
async restore(chatId, workDir, snapshotHash) {
  const repoPath = path.join(SNAPSHOT_ROOT, chatId)
  const env = { GIT_DIR: repoPath }

  // Load snapshot tree into index
  await exec(`git read-tree ${snapshotHash}`, { cwd: workDir, env })

  // Checkout all files from index to working directory
  await exec('git checkout-index -a -f', { cwd: workDir, env })
}

// revert() — per-file targeted revert
async revert(chatId, workDir, patches) {
  const repoPath = path.join(SNAPSHOT_ROOT, chatId)
  const env = { GIT_DIR: repoPath }

  for (const patch of patches) {
    try {
      // Restore individual file to snapshot state
      await exec(`git checkout ${patch.snapshotHash} -- ${patch.filePath}`, { cwd: workDir, env })
    } catch {
      // File didn't exist in snapshot → delete it
      try { await fs.unlink(path.join(workDir, patch.filePath)) } catch {}
    }
  }
}
```

**Why bare repo** (not non-bare):
- No working directory conflicts — bare repo is purely a content store
- `GIT_DIR` env var overrides per-command, no `.git` pollution in workspace
- Each chat gets its own isolated repo (like `node_modules` — independent trees)
- Matches OpenCode's proven approach

**Bug avoidance note**: OpenCode had a bug where `checkout-index -a -f` restored ALL files including from other projects. We avoid this by using **per-chatId isolated bare repos**, so each repo only knows about one chat's files.

### 3.3 Snapshot Registration (in transcript_events)

When a snapshot is taken, we register it in the transcript event stream so we can find the snapshot hash for any given message.

**New event type**: `snapshot_registered`

```js
// In agentExecutor.js, BEFORE each LLM stream:
const snapshotHash = await snapshotManager.track(chatId, workDir)
// Register snapshot event in transcript
appendTranscriptEvent(database, {
  chatId,
  eventType: 'snapshot_registered',
  payload: { snapshotHash },
  createdAt: Date.now(),
})
```

**Retrieval** — to find the snapshot for a revert point:
```sql
SELECT payload_json FROM transcript_events
WHERE chat_id = ? AND event_type = 'snapshot_registered' AND sequence_num <= ?
ORDER BY sequence_num DESC LIMIT 1
```

### 3.4 Revert API Endpoint

**Route**: `POST /conversations/:chatId/revert`

**Request body**:
```json
{
  "messageId": "msg_xxx",
  "mode": "conversation_and_code"  // or "conversation_only"
}
```

**Response** (on success):
```json
{
  "success": true,
  "chatId": "chat_xxx",
  "revertedToMessageId": "msg_xxx",
  "messagesDeleted": 5,
  "filesRestored": 3
}
```

**Handler logic** (`conversation/index.js`):

```js
app.post('/:chatId/revert', async (request) => {
  const { chatId } = request.params
  const { messageId, mode = 'conversation_and_code' } = request.body

  // 1. Validate
  const chat = getChatById(app.db, chatId)
  if (!chat) throw notFound('Session not found')

  // 2. Cancel any active run
  const activeRun = getActiveRunForChat(chatId)
  if (activeRun) cancelRun(activeRun.id)

  // 3. Find target message
  const messages = listMessageEventsByChatId(app.db, chatId)
  const targetIndex = messages.findIndex(m => m.id === messageId)
  if (targetIndex === -1) throw notFound('Message not found')

  // 4. Collect messages to delete (everything after target)
  const messagesToDelete = messages.slice(targetIndex + 1)

  // 5. Find snapshot hash for the target message
  const snapshotHash = findSnapshotBeforeMessage(app.db, chatId, messages[targetIndex])

  // 6. Restore files (if mode is conversation_and_code)
  let filesRestored = 0
  if (mode === 'conversation_and_code' && snapshotHash) {
    const workDir = getProjectWorkDir(chat.projectId)
    const result = await snapshotManager.restore(chatId, workDir, snapshotHash)
    filesRestored = result.filesRestored
  }

  // 7. Delete transcript events after target message
  const targetSequenceNum = messages[targetIndex].sequenceNum
  deleteTranscriptEventsAfterSequence(app.db, chatId, targetSequenceNum)

  // 8. Update chat metadata
  updateChatActivity(app.db, chatId)

  // 9. Emit conversation_persisted SSE event
  const updatedMessages = listMessagesByChatId(app.db, chatId)
  broadcastSseEvent(chatId, 'conversation_persisted', {
    chat: { id: chatId },
    messages: updatedMessages,
  })

  return {
    success: true,
    chatId,
    revertedToMessageId: messageId,
    messagesDeleted: messagesToDelete.length,
    filesRestored,
  }
})
```

### 3.5 New DB Operations

**In `message/repository.js`**:

```js
// Find the most recent snapshot_registered event at or before a given sequence number
export function findSnapshotBeforeSequence(database, chatId, sequenceNum) {
  const statement = database.prepare(`
    SELECT payload_json FROM transcript_events
    WHERE chat_id = ?
      AND event_type = 'snapshot_registered'
      AND sequence_num <= ?
    ORDER BY sequence_num DESC
    LIMIT 1
  `)
  const row = statement.get(chatId, sequenceNum)
  if (!row) return null
  const payload = JSON.parse(row.payload_json)
  return payload.snapshotHash || null
}

// Delete all transcript events after a given sequence number
export function deleteTranscriptEventsAfterSequence(database, chatId, sequenceNum) {
  const statement = database.prepare(`
    DELETE FROM transcript_events
    WHERE chat_id = ? AND sequence_num > ?
  `)
  return statement.run(chatId, sequenceNum)
}
```

### 3.6 SSE Event

The revert handler emits a `conversation_persisted` event with the full updated chat state. The Board already handles this event via the existing dual-track pattern:

```js
// chats.hooks.js — existing handler for conversation_persisted
case 'conversation_persisted': {
  // Atomic replace of messages, chat metadata
  // This is the same handler that already works for normal streaming
}
```

No new SSE event type needed — `conversation_persisted` is specifically designed for atomic state replacement.

## 4. Board (Frontend) Changes

### 4.1 Service Layer (`chats.service.js`)

Add `revertConversation` API call:

```js
async revertConversation(chatId, messageId, mode = 'conversation_and_code') {
  const response = await apiClient.post(
    `/conversations/${chatId}/revert`,
    { messageId, mode },
    { baseUrl: runtimeConfig.runtimeBaseUrl }
  )
  return response
},
```

### 4.2 Hook Layer (`chats.hooks.js`)

Add `resetToMessage` to `useChatModel`:

```js
function resetToMessage(messageId, mode = 'conversation_and_code') {
  if (!chatId) return

  setChat(prev => ({
    ...prev,
    isReverting: true,  // new UI state
  }))

  chatsService.revertConversation(chatId, messageId, mode)
    .then((result) => {
      // SSE conversation_persisted will handle the actual state update
      // This just clears the reverting state
    })
    .catch((error) => {
      setChat(prev => ({
        ...prev,
        isReverting: false,
        revertError: parseError(error),
      }))
    })
}
```

### 4.3 UI Changes (`ChatPage.jsx`)

**UserMessageRow** — Add "Reset to here" menu item:

```jsx
// Inside moreMenu dropdown:
<button type="button" className={styles.moreMenuItem} onClick={() => { setShowMoreMenu(false); onResetToHere(message.id) }}>
  <ArrowCounterClockwise size={14} /> Reset to here
</button>
```

**AssistantMessageRow** — Same addition:

```jsx
<button type="button" className={styles.moreMenuItem} onClick={() => { setShowMoreMenu(false); onResetToHere(message.id) }}>
  <ArrowCounterClockwise size={14} /> Reset to here
</button>
```

**Confirmation dialog** — Before executing revert, show a confirmation:

```
⚠️ Reset to this point?

This will:
• Remove all messages after this point
• Revert all file changes made after this point
• This action cannot be undone

[Cancel] [Reset]
```

**Loading state** — While reverting, show a spinner/overlay on the chat area with text "Resetting conversation..."

### 4.4 i18n

Add to `src/i18n/en.js` and `src/i18n/zh.js`:

```js
// en.js
resetToHere: 'Reset to here',
resetToHereConfirm: 'Reset to this point?',
resetToHereWarning: 'This will remove all messages and revert all file changes after this point. This action cannot be undone.',
resetting: 'Resetting conversation...',
revertError: 'Failed to reset conversation',

// zh.js
resetToHere: '重置到此处',
resetToHereConfirm: '重置到此处？',
resetToHereWarning: '将删除此消息之后的所有对话，并撤销在此之后的所有文件修改。此操作不可撤销。',
resetting: '正在重置对话...',
revertError: '重置对话失败',
```

## 5. Snapshot Lifecycle

### 5.1 When Snapshots are Taken

1. **Before each LLM stream** — `agentExecutor.js` calls `snapshotManager.track()` before `provider.executeTurn()`
2. **At conversation start** — First user message gets a snapshot of the initial workspace state
3. **Before tool execution** — If a tool modifies files, snapshot is captured before the modification

### 5.2 Snapshot Storage

```
~/.ravens/snapshot/{chatId}/     ← bare git repo (per chat)
  ├── HEAD                        ← ref to latest tree
  ├── objects/                    ← git object store (content-addressable)
  └── ...
```

Each `track()` call:
1. `git add --all` (respects .gitignore)
2. `git write-tree` → returns hash (e.g., `a1b2c3d4...`)
3. Hash is stored in `transcript_events` as `snapshot_registered` event

### 5.3 Cleanup

- When a chat is deleted: `snapshotManager.cleanup(chatId)` removes the entire bare repo
- Snapshots older than 30 days can be pruned (future optimization)
- No automatic pruning in v1

## 6. Edge Cases

### 6.1 Active Run During Revert

If the agent is currently running when revert is requested:
1. Cancel the active run via `cancelRun(runId)`
2. Wait for `run_cancelled` event to propagate
3. Proceed with revert

### 6.2 No Snapshot Available

If `findSnapshotBeforeSequence` returns null (first message, or snapshot not yet taken):
- Mode `conversation_and_code`: Revert conversation only, skip file restore, **warn user**
- Mode `conversation_only`: Proceed normally (no files to restore anyway)

### 6.3 Concurrent Reverts

- Lock per chatId — only one revert at a time
- If a revert is already in progress, return 409 Conflict

### 6.4 Files Created After Revert Point

OpenCode's approach handles this correctly:
- `git checkout <hash> -- <file>` restores files that existed at the snapshot
- Files that didn't exist at the snapshot → deleted (via `fs.unlink`)
- This matches user expectation: "reset to this point" means exactly that state

### 6.5 .gitignore Respect

`git add --all` respects `.gitignore` and `.git/info/exclude`. The snapshot bare repo inherits the workspace's `.gitignore` via `core.worktree`.

For ravens.runtime specifically: Agent tools already have a workspace root concept. The snapshot operates on the project workspace directory, which naturally has the project's `.gitignore`.

## 7. Implementation Plan

### Phase 1: Foundation (Runtime)

| Step | File | Description |
|------|------|-------------|
| 1.1 | `modules/tools/snapshotManager.js` | New file — shadow git bare repo manager |
| 1.2 | `modules/message/repository.js` | Add `findSnapshotBeforeSequence` and `deleteTranscriptEventsAfterSequence` |
| 1.3 | `modules/runtime/agentExecutor.js` | Call `snapshotManager.track()` before LLM stream, register `snapshot_registered` event |
| 1.4 | `modules/conversation/index.js` | Add `POST /:chatId/revert` route handler |

### Phase 2: Foundation (Board)

| Step | File | Description |
|------|------|-------------|
| 2.1 | `features/chats/chats.service.js` | Add `revertConversation(chatId, messageId, mode)` |
| 2.2 | `features/chats/chats.hooks.js` | Add `resetToMessage(messageId, mode)` to `useChatModel` |
| 2.3 | `i18n/en.js`, `i18n/zh.js` | Add revert-related i18n strings |

### Phase 3: UI (Board)

| Step | File | Description |
|------|------|-------------|
| 3.1 | `components/chats/ChatPage.jsx` | Add "Reset to here" to `UserMessageRow` moreMenu |
| 3.2 | `components/chats/ChatPage.jsx` | Add "Reset to here" to `AssistantMessageRow` moreMenu |
| 3.3 | `components/chats/ChatPage.jsx` | Add confirmation dialog |
| 3.4 | `components/chats/ChatPage.module.css` | Add revert-related styles |

### Phase 4: Polish

| Step | File | Description |
|------|------|-------------|
| 4.1 | All | Loading state during revert (spinner/overlay) |
| 4.2 | `modules/tools/snapshotManager.js` | Cleanup on chat deletion |
| 4.3 | `modules/conversation/index.js` | Concurrent revert protection (per-chatId lock) |
| 4.4 | Tests | Integration tests for revert flow |

## 8. Open Questions

1. **Should "Reset to here" appear on AI messages?** — OpenCode's issue #8689 requests forking from AI messages too. We'll support both user and assistant messages.

2. **Should we support partial revert (only conversation, keep files)?** — Yes, via `mode` parameter. Default is `conversation_and_code`. UI can offer a toggle.

3. **What about external file changes (not made by agent)?** — Not tracked by snapshot system. Same limitation as OpenCode and Claude Code.

4. **Should we show a diff preview before reverting?** — Not in v1. Future enhancement.

5. **Should reverting be undoable?** — Not in v1. The snapshot from the revert point is preserved, so a future "redo" is possible, but we don't implement it now.

## 9. Comparison with Existing Approaches

| Aspect | fileHistory.js (Current) | snapshotManager.js (New) |
|--------|--------------------------|--------------------------|
| **Mechanism** | `fs.copyFile` per file | `git write-tree` / `git checkout-index` |
| **Storage** | `~/.ravens/file-history/{chatId}/{name}@{hash}@v{N}` | `~/.ravens/snapshot/{chatId}/` (bare git repo) |
| **Scope** | Individual files tracked on edit | Full workspace snapshot per turn |
| **Restore** | `restoreFile(chatId, path, version)` — single file | `restore(chatId, workDir, hash)` — entire workspace |
| **Diff** | No diff capability | `git diff --name-only` gives changed file list |
| **Granularity** | Per-file, per-version | Per-turn, per-snapshot |
| **Future** | Will be deprecated after migration | Will be sole snapshot mechanism |

**Migration path**: `fileHistory.js` continues to work during migration. After snapshotManager is stable and all tools use it, fileHistory can be deprecated. During transition, both systems can coexist.