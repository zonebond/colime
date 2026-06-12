# PROJECT KNOWLEDGE BASE

**Updated:** 2026-05-09
**Commit:** 324be40
**Branch:** main

## OVERVIEW

AI Agent Workspace — React 18 SPA with CSS Modules. Frontend for ravens ecosystem (board + core + runtime). Three-service architecture with Board connecting directly to both Core and Runtime.

## ARCHITECTURE

```
Board (10001) — React SPA
  ├─ Vite proxy /core    → Core:10010     (rewrite: strip /core, CRUD only)
  └─ Vite proxy /runtime → Runtime:10011  (rewrite: strip /runtime, Agent execution)

Core (10010) — Pure CRUD Layer
  │ Session/project/message CRUD (SQLite)
  │ File metadata + attachment storage
  │ Provider/agent/model config
  │ Does NOT proxy to Runtime

Runtime (10011) — Agent Execution Engine
  │ Agent execution loop (think → tool → response)
  │ Memory system (~/.claude/projects/{sanitized}/memory/)
  │ Context assembly (tool policy, attachments, project resources)
  │ History compaction (token-aware, structured 9-section summaries)
  │ SSE events → Board (direct, not via Core)
  │ /conversations/stream, /conversations/send, /conversations/{id}/stop
  │ /conversations/{id}/tools/{toolId}/confirm
  │ /providers/*, /runs/*, /sessions/*, /tools/*
  │ /stream, /prompt/dump
```

### Service Responsibilities

| Service | Port | Responsibilities | Does NOT own |
|---|---|---|---|
| **Runtime** | 10011 | Agent execution, tools/MCP, memory, context assembly, compaction, conversation streaming, SSE events direct to Board | Data persistence, CRUD |
| **Core** | 10010 | Session/project/message CRUD, file metadata, provider/agent/model config | Conversation proxy, memory, context, compaction |
| **Board** | 10001 | React UI, SSE event consumption (direct from Runtime), atomic replace, error display, coalescing buffer | Backend logic |

### Key Architecture Decisions

| Decision | Rationale |
|---|---|
| Board → Runtime direct (bypass Core) | Efficiency. Removes one hop for every streaming request. Core is CRUD-only, no proxy overhead. |
| Memory inside Runtime | Industry pattern (Claude Code/CrewAI). Eliminates Core→Runtime context mismatch. |
| Context assembly inside Runtime | Runtime knows what context it needs. Reduces contract complexity. |
| Compaction inside Runtime | Token tracking at API call level. Compaction based on real-time state. |
| Core as pure CRUD (no proxy) | Simplicity. Core only persists; never proxies. No stale proxy code to maintain. |
| `conversation_persisted` atomic replace | Claude Code dual-track pattern: SSE for optimistic UI, persisted data as single authority. |
| 100ms coalescing buffer | Reduces React re-render frequency. Non-terminal buffered, terminal flushed immediately. |

### Lessons Learned

1. **Direct-connect > proxy-chain for streaming.** Board→Core→Runtime added latency and a failure point. Board→Runtime direct via Vite proxy is simpler and faster.
2. **"Inside Agent" pattern is correct for multi-service architectures.** When Core assembles context and passes it to Runtime, any transform at each layer introduces drift. Runtime should control its own context.
3. **Compaction must happen where token tracking happens.** Core's delayed compaction operated on stale DB data. Runtime's ContextManager tracks tokens per API call and compacts based on live state.
4. **Don't build routes for code you've moved.** After moving memory modules to Runtime, Core's `/memory/*` routes called deleted exports. Always verify route registrations after module moves.
5. **Claude Code's dual-track pattern is right for three-service architectures.** SSE events for optimistic state, `conversation_persisted` for authoritative state. Atomic replace eliminates error state preservation bugs.
6. **Coalescing buffers are essential for SSE UIs.** Without a buffer, every SSE event triggers a React re-render. With 100ms coalescing, frequency drops from N events to N/100ms batches.

## STRUCTURE

```
src/
├── main.jsx              # Entry: React root + BrowserRouter
├── App.jsx               # Layout: Sidebar + Routes (10 routes)
├── config/
│   └── runtime.js        # Feature-level mock/real API toggles + base URLs
├── components/           # UI layer — one subdir per domain
│   ├── chats/            # ChatPage.jsx (~3035 LOC) — main chat UI
│   ├── sidebar/          # App shell sidebar
│   ├── projects/         # Project list + detail
│   ├── toolbox/          # Skills/Agents/MCP/Tools pages
│   ├── tasks/            # Task management
│   ├── library/          # Document library
│   └── ...               # attachments, composer, help, icons, search, newchat
├── features/             # Data layer — {name}.hooks.js + {name}.service.js + {name}.mock.js + {name}.actions.js
│   ├── chats/            # Core chat logic, SSE streaming, mock engine, adapters/
│   ├── projects/
│   ├── tasks/
│   ├── library/
│   └── toolbox/
├── hooks/                # Shared hooks (useSidebar, usePopover, useImeSafeInput)
├── store/                # Zustand store (useAppStore.js — theme, hydration)
├── i18n/                 # en.js / zh.js + LanguageProvider
├── lib/                  # apiClient (circuit breaker + retry), mockLatency, mockPersistence
├── styles/               # global.css (design tokens + .uiSkeleton global class)
└── workers/              # mockChat.worker.js (Web Worker for mock responses)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Chat UI rendering | `components/chats/ChatPage.jsx` | ~3035 LOC — thinking blocks, tool cards, markdown, scroll |
| Chat data flow | `features/chats/chats.hooks.js` | useChatModel, SSE event handling, cache |
| Chat API calls | `features/chats/chats.service.js` | streamChatConversation, SSE parsing |
| Mock chat engine | `features/chats/mockChatEngine.js` | ~1427 LOC — simulated AI responses |
| Feature config | `config/runtime.js` | VITE_USE_MOCK_* per-feature toggles |
| Theme/styling | `styles/global.css` | CSS custom properties (design tokens) + `.uiSkeleton` global class |
| i18n strings | `i18n/en.js`, `i18n/zh.js` | Parallel translation files, dot-notation keys |
| State management | `store/useAppStore.js` | Zustand — theme, sidebar, locale, toolbox. Persisted to IndexedDB via idb-keyval |
| Design docs | `.design/*.md` | Architecture specs for chat, projects, attachments, streaming |
| Agent tool inventory | `docs/Runtime Agent Tools 全览.md` | 21 内置工具 + 3 多Agent + 3 MCP 元工具 |
| Agent gap analysis | `docs/agent-gap-analysis.md` | 能力差距 + 优先级建议 |
| Proxy config | `vite.config.js` | /core → core:10010 (rewrite strip), /runtime → runtime:10011 (rewrite strip) |
| Error handling | `features/chats/chats.hooks.js` + `ChatPage.jsx` | i18n error messages, status codes |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `App` | Component | `src/App.jsx` | Root layout: Sidebar + Routes (10 routes) |
| `ChatPage` | Component | `src/components/chats/ChatPage.jsx` | Main chat UI (~3035 LOC), lazy-loaded |
| `useAppStore` | Store | `src/store/useAppStore.js` | Zustand: theme, sidebar, locale, toolbox. Persisted to IndexedDB |
| `LanguageProvider` | Context | `src/i18n/provider.jsx` | i18n context wrapper, exposes `{locale, setLocale, t}` |
| `runtimeConfig` | Config | `src/config/runtime.js` | Feature-level mock/real toggles + API base URLs |
| `useChatModel` | Hook | `src/features/chats/chats.hooks.js` | Primary chat state hook (~1294 LOC) |
| `streamChatConversation` | API | `src/features/chats/chats.service.js` | SSE stream + parsing |
| `parseSseStream` | Utility | `src/features/chats/chats.service.js` | SSE `{ event, data }` parser |
| `mockChatEngine` | Mock | `src/features/chats/mockChatEngine.js` | Simulated AI responses (~1427 LOC) |
| `apiClient` | HTTP | `src/lib/apiClient.js` | Circuit breaker + retry (3x, exponential backoff) + auto-JSON |

## CONVENTIONS

- **JSX only** — no TypeScript
- **CSS Modules** — `ComponentName.module.css` co-located with component. Exception: `.uiSkeleton` global class in `global.css` used by 11 components for loading skeletons
- **Path alias** — `@/` maps to `src/`. Sibling components use relative imports (`./StripeLoader`), other modules use `@/` alias
- **Feature pattern** — `features/{domain}/` has `.hooks.js`, `.service.js`, `.mock.js`, `.actions.js`
- **Component pattern** — `components/{domain}/` has page + sub-components, each with `.module.css`
- **State** — Zustand for global (persisted to IndexedDB via idb-keyval), useState/useRef for local, custom hooks for domain logic
- **Icons** — `@phosphor-icons/react`, centralized in `components/icons/index.jsx`
- **Custom icons** — `@lobehub/icons` for LLM provider brand logos (deep import: `@lobehub/icons/es/{Brand}/components/{Mono|Color}`)
- **Markdown** — `react-markdown` + `rehype-highlight` + `remark-gfm`
- **Router** — all routes in App.jsx, ChatPage lazy-loaded via `React.lazy`
- **i18n** — `useLanguage()` hook returns `{locale, setLocale, t}`, keys in `i18n/{en,zh}.js` with dot-notation, never inline strings
- **Dialog overlay** — default: `background: color-mix(in srgb, black 38%, transparent); backdrop-filter: blur(10px);` — lighter mask + frosted glass blur, NOT `rgba(0,0,0,0.5)`

## MOCK SYSTEM

Each feature has a `runtimeConfig.useMock*` toggle backed by `VITE_USE_MOCK_*` env vars with fallback to `VITE_USE_MOCK_API`:

| Feature | Mock Source | Real API | Toggle |
|---------|------------|----------|--------|
| Chats | `mockChatEngine.js` + IndexedDB | SSE streaming to Runtime | `useMockChats` |
| Projects | IndexedDB | Core API (`/core`) | `useMockProjects` |
| Tasks | IndexedDB (idb-keyval with custom stores) | Core API (`/tasks`) | `useMockTasks` |
| Library | IndexedDB (idb-keyval with custom stores) | Core API (`/documents`) | `useMockLibrary` |
| Toolbox | `getToolboxPageData()` returns mock page metadata; list functions (listAgents, listProviders, etc.) call real APIs | Agents→Runtime, Skills/Tools/MCP→Core | No dedicated toggle — uses `useMockApi` |

**Note**: Toolbox is a hybrid — page layout metadata is mock, but data-fetching functions are wired to real APIs. Don't assume it's fully mocked or fully real.

## ENV VARIABLES

**Configured via runtime.js:**
- `VITE_USE_MOCK_API` — global mock toggle (fallback)
- `VITE_USE_MOCK_CHATS`, `VITE_USE_MOCK_PROJECTS`, `VITE_USE_MOCK_TASKS`, `VITE_USE_MOCK_LIBRARY` — per-feature toggles
- `VITE_USE_MOCK_WORKER` — Web Worker mock toggle
- `VITE_API_BASE_URL` — Core API base (default: `/core`)
- `VITE_RUNTIME_BASE_URL` — Runtime API base (default: `/runtime`)

**Undocumented (in `.env` but NOT wired to runtimeConfig):**
- `VITE_USE_MINIMAX_CHAT`, `VITE_MINIMAX_API_KEY`, `VITE_MINIMAX_API_URL`, `VITE_MINIMAX_MODEL` — MiniMax integration, not wired to the standard mock system

**Vite built-in:**
- `import.meta.env.DEV` — used in `useProviderModels.js` for dev-only behavior

## ANTI-PATTERNS (THIS PROJECT)

- Do NOT use TypeScript (project is JSX-only for now)
- Do NOT add inline CSS — always use CSS Modules (exception: `.uiSkeleton` global class). Known violations exist in 18 files including `MovingIndicator.jsx` (CSS injection via `document.head`), `ChatPage.jsx` (8 inline styles for animations/dynamic positioning), and `ThinkingBlock.jsx` — fix existing violations before adding new ones
- Do NOT put API logic in components — use `features/` service layer
- Do NOT hardcode strings — use i18n keys. Known violations: `ChatPage.jsx` has `<span>Stopped</span>`, `ThinkingBlock.jsx` has fallback English strings. Use `t.keyName` only, no `|| 'English fallback'`
- Do NOT bypass the mock/real toggle — use `runtimeConfig.useMock*`
- Do NOT assume Toolbox is fully mocked — list functions call real APIs
- Do NOT use `as any`, `@ts-ignore`, `@ts-expect-error` — not applicable (JSX project) but never add them if migrating to TS

## COMMANDS

```bash
npm run dev          # Start dev server (port 10001)
npm run build        # Production build
npm run lint         # ESLint (max-warnings 0)
npm test             # Integration tests (node --test tests/integration/*.test.js)
npm run check:mock-chat-engine  # Validate mock chat engine integrity
```

## NOTES

- `claude-code-analysis/` and `cc-haha-可运行项目/` are third-party reference material — do NOT modify
- `.design/` has 15+ architecture specs — read relevant ones before implementing new features
- ChatPage.jsx is the most complex file (~3035 LOC) — changes need careful testing; extract sub-components rather than growing it
- SSE streaming: board → runtime (SSE direct) via Vite proxy — events flow directly, not through Core
- **Data flow on error**: runtime `categorizeError()` → service.js `RUN_FAILED` → chats.hooks.js `ERROR_CODE_MAP` → ChatPage.jsx `ERROR_CODE_TO_I18N_KEY` → `getErrorMessage()` → i18n text
- **SSE dual-track pattern**: SSE events for optimistic UI updates, `conversation_persisted` for authoritative state (atomic replace, not merge)
- **Coalescing buffer**: 100ms window batches non-terminal SSE events; terminal events (done/error/cancelled/failed) flush immediately
- **Testing**: Node.js native test runner (`node --test`), integration tests in `tests/integration/`, no component/UI tests
- **Global CSS**: `.uiSkeleton` in `global.css` is a documented exception to the CSS Modules rule, used by 11 components for loading skeleton animations
- **MovingIndicator.jsx**: Uses CSS template string injected via `document.head.appendChild(style)` — this is a known anti-pattern violation, not a pattern to follow
- **Memory location**: `~/.claude/projects/{sanitizedProjectPath}/memory/` (global, cross-session)
- **Session summary**: `~/.claude/projects/{sanitizedProjectPath}/sessions/{chatId}/summary.json` (compaction state)
- **Core memory routes deleted**: `/memory/*` and `/context/*` routes no longer exist (404)
- **Core checkpoint routes deleted**: `/sessions/:id/checkpoints` and `/checkpoints/:id/rollback` no longer exist (404)