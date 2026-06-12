# Agent Core And Chat Interaction Model

## Core Conclusion

In `ravens.board`, `chat` is primarily an interaction form, not the deepest system center.

The real capability center is the `agent`.

This means:

- `agent` is the execution core
- `chat` is the default conversational session container
- `project` is the shared context/workspace container
- `file/resource` is the material and knowledge input the agent can consume

## Architecture Evolution (Updated 2026-04-20)

### What Changed From Original Design

The original design placed `context composition` inside Core. After real-world implementation and iteration, we moved **memory**, **context assembly**, and **history compaction** into Runtime. The decision was driven by:

1. **Industry pattern**: Claude Code, CrewAI, and most successful agent frameworks keep memory INSIDE the agent ("Inside Agent" pattern). LangGraph/AutoGen keep it OUTSIDE — but they don't have a three-service architecture with payload transforms at each layer.

2. **Three-service transform problem**: Board → Core → Runtime means 2 payload transforms. If Core assembles context and then Runtime executes, the context assembled by Core may not match what Runtime actually needs. Having Runtime build its own context eliminates this mismatch.

3. **Compaction belongs with execution**: Runtime's `ContextManager` tracks token usage per API call, knows when to compact, and can compact based on real-time conversation state. Core's compaction was a delayed background process that operated on stale data.

### Current Service Boundaries (Post-Refactoring)

#### `ravens.runtime` (10011) — Agent Execution Engine

**Owns:**
- Agent execution loop (think → tool → think → tool → response)
- Tool system (built-in tools, MCP, multi-agent)
- **Memory system** — file-based project memory at `~/.claude/projects/{sanitized}/memory/`
  - `paths.js` — Memory path utilities, `sanitizeProjectPath`, `getAutoMemoryPath`
  - `scan.js` — Memory file scanning, frontmatter parsing
  - `memdir.js` — Memory CRUD operations, `buildMemoryPrompt`
  - `recall.js` — Heuristic relevance search, `findRelevantMemories`
  - `tools.js` — `MEMORY_TOOLS` definitions for LLM tool calling
- **Context assembly** — tool policy, attachment filtering, project resources
  - `context.js` — `buildToolPolicy`, `collectVisibleAttachments`, `collectProjectResources`
- **History compaction** — token-aware compaction with structured summaries
  - `contextManager.js` — `compactMessages`, `collapseMessages`, `summarizeWithLLM` (9-section Claude Code format)
  - Session summary persistence at `~/.claude/projects/{sanitized}/sessions/{chatId}/summary.json`
- Streaming event production
- Provider management (model calls)

**Does NOT own:**
- Data persistence (no SQLite)
- User/session management
- Business logic (chat, project CRUD)

#### `ravens.core` (10010) — Thin API Gateway + Business Truth

**Owns:**
- Chat/session CRUD
- Message persistence (SQLite `transcript_events`, `messages`)
- Project CRUD
- File/attachment metadata + MinIO integration
- Provider configuration storage
- **Conversation proxy** — `/conversations/stream`, `/stop`, `/confirm`
  - Builds `runtimeContract` from DB data → sends to Runtime
  - Forwards Runtime SSE events to Board
  - Persists `conversation_persisted` after stream completes

**Does NOT own (anymore):**
- ~~Memory system~~ → moved to Runtime
- ~~Context assembly~~ → moved to Runtime
- ~~History compaction~~ → moved to Runtime
- ~~Memory HTTP routes~~ → deleted (Runtime has its own)
- ~~Checkpoint system~~ → deleted (Runtime's ContextManager handles)

**Remaining memory-related code:**
- `memory/service.js` (205 lines) — only `listRuntimeHistoryByChatId()` and snapshot chain helpers, used by `runtimeContract.js` to fetch sanitized history from DB

#### `ravens.board` (10001) — Frontend UI

**Owns:**
- React SPA for user interaction
- SSE event consumption and rendering
- `conversation_persisted` atomic replace (dual-track pattern)
- 100ms coalescing buffer for SSE events
- Error state display with i18n

**Data flow:**
```
Board (SSE events + conversation_persisted atomic replace)
  → Core (proxy + persist)
    → Runtime (execute + memory + context + compaction)
```

### Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Memory inside Runtime | Industry pattern (Claude Code/CrewAI). Eliminates Core→Runtime context mismatch. |
| Context assembly inside Runtime | Runtime knows what context it needs better than Core. Reduces contract complexity. |
| Compaction inside Runtime | Token tracking happens at API call level. Compaction based on real-time state, not stale DB data. |
| Core as thin API gateway | Core only persists data and proxies to Runtime. No business logic beyond CRUD. |
| `conversation_persisted` atomic replace | Adopted Claude Code's dual-track pattern: SSE events for optimistic UI, persisted data as single authority. |
| 100ms coalescing buffer | Reduces React re-render frequency. Non-terminal events buffered, terminal events flushed immediately. |

## Final Understanding (Updated Post-Refactoring)

### Agent (Runtime)

The `agent` (Runtime) is responsible for:

- reasoning
- tool calling
- MCP integration
- subagent orchestration
- **runtime memory** (file-based project memory)
- **context assembly** (tool policy, attachments, project resources)
- **history compaction** (token-aware, structured 9-section summaries)
- execution loop
- event streaming

It is the true capability engine of the system — and now also owns context and memory.

### Chat (Core)

The `chat` (Core) is responsible for:

- carrying an ongoing interaction between user and agent
- storing message history (SQLite persistence)
- presenting the interaction in a user-understandable session/thread form
- acting as the primary session container for the agent in the product UI
- **conversation proxy** — forwarding requests to Runtime, persisting responses

So `chat` is the persistence and business truth layer. It does NOT assemble context or manage memory — that's Runtime's job.

### Project (Core)

The `project` is responsible for:

- shared context boundary
- shared files/resources (attachment metadata + MinIO)
- shared instructions
- long-lived workspace organization
- **provider configuration** (API keys, model settings)

It is a workspace-level context container that Core manages on behalf of users.

### File / Resource (Core)

Files and resources are:

- inputs the agent can consume
- scoped by chat or project ownership
- referenced by messages and sessions
- stored in MinIO, metadata in SQLite
- managed entirely by Core

## Architectural Meaning

This leads to an important architectural principle:

### The agent is the capability core — AND the context/memory owner

`ravens.runtime` should own:

- model orchestration
- tool system
- MCP
- subagents
- **memory system** (file-based, cross-session)
- **context assembly** (tool policy, attachments, project resources)
- **history compaction** (token-aware, structured summaries)
- reasoning and execution events

### The product needs only a thin persistence layer

`ravens.core` should own ONLY:

- chat/session CRUD
- message persistence (SQLite)
- project CRUD
- file/attachment metadata + MinIO
- provider configuration
- conversation proxy (forward to Runtime, persist results)

Core should NOT own:
- ~~context assembly~~ → Runtime
- ~~memory system~~ → Runtime
- ~~history compaction~~ → Runtime
- ~~checkpoint system~~ → deleted (Runtime handles)

### File resources remain an independent concern

`ravens.core` should own:

- upload
- attachment metadata
- resource ownership
- MinIO integration
- resource lookup

## Lessons Learned

### 1. "Inside Agent" Pattern Is Correct For Multi-Service Architectures

When Core assembles context and passes it to Runtime, any transformation at each layer introduces drift. By moving memory and context into Runtime, the agent controls its own context — no mismatch between what Core thinks the agent needs and what the agent actually needs.

### 2. Compaction Must Happen Where Token Tracking Happens

Core's compaction was a delayed background process (`scheduleHistoryCompaction`) that operated on DB events after streaming completed. It couldn't know the real-time token count or which messages were most important to keep. Runtime's `ContextManager` tracks tokens per API call and compacts based on live state.

### 3. Don't Build Routes For Code You've Moved

After moving memory modules to Runtime, Core still had `/memory/*` HTTP routes that called the old code. These should have been deleted immediately. The `session/index.js` checkpoint routes also broke because they imported deleted exports. Always verify route registrations after moving modules.

### 4. Claude Code's Dual-Track Pattern Is Right For Three-Service Architectures

SSE events build optimistic state, `conversation_persisted` provides authoritative state. The atomic replace (not patch/merge) eliminates an entire class of bugs related to error state preservation across streaming and persisted paths.

### 5. Coalescing Buffers Are Essential For SSE UIs

Without a buffer, every SSE event triggers a React re-render. With a 100ms coalescing buffer, non-terminal events batch and terminal events flush immediately. This reduces re-render frequency from N events to N/100ms batches.

## Product-Level Interpretation

The product should continue to use `chat` as the user-facing term, because it is natural and understandable.

But internally, the system should be designed with the following mindset:

- `agent` (Runtime) is the engine + context + memory
- `chat` (Core) is the persistence + business truth layer
- `project` (Core) is the workspace/resource boundary
- `resource` (Core) is the input material layer
- `board` (Frontend) is the interaction surface

## One-Sentence Summary

`chat` is a user-facing interaction mode, while `agent` (Runtime) is the true execution core — owning not just tools and reasoning, but also memory, context, and compaction.

## Data Flow (Current Architecture)

```
User → Board (10001)
  │ SSE + REST API
  ▼
Core (10010)
  │ CRUD persistence (SQLite)
  │ Builds runtimeContract from DB
  │ Conversation proxy → Runtime
  ▼
Runtime (10011)
  │ Agent execution loop
  │ Memory system (~/.claude/projects/)
  │ Context assembly (tool policy, attachments)
  │ History compaction (token-aware)
  │ SSE events → Core → Board
```

## File Locations (Post-Refactoring)

| Module | Location | Lines |
|---|---|---|
| Memory system | `ravens.runtime/src/modules/memory/` | 5 files |
| Context assembly | `ravens.runtime/src/modules/runtime/context.js` | ~200 |
| History compaction | `ravens.runtime/src/modules/runtime/contextManager.js` | ~700 |
| Core history fetch | `ravens.core/src/modules/memory/service.js` | 205 (only `listRuntimeHistoryByChatId`) |
| Core contract builder | `ravens.core/src/modules/conversation/runtimeContract.js` | ~100 |
| Board SSE handling | `ravens.board/src/features/chats/chats.hooks.js` | ~800 |
| Board error display | `ravens.board/src/components/chats/ChatPage.jsx` | ~2900 |
