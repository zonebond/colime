# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on port 3000
npm run build        # Production build
npm run lint         # ESLint — max-warnings 0, JS/JSX only
npm test             # Vitest — tests/unit/**/*.test.{js,jsx} (jsdom)
npm run test:integration  # Node.js native test runner — tests/integration/*.test.js
```

Backend: start ravens in HTTP serve mode (required for board to connect):
```bash
# From project root
bun run --conditions=browser ./packages/ravens/src/index.ts serve --port 5090
```

## Vite Proxy

During local dev, Vite proxies:
- `/ravens/*` → `http://127.0.0.1:5090` (prefix NOT stripped — ravens routes include the full path)

In production (Docker), nginx proxies `/ravens/` → `runtime:4096/` with SSE support (86400s read timeout, no buffering).

## Build Version Stamp

Every build embeds the git SHA: check the browser console (`[board] build <sha>`), `window.__BOARD_BUILD__`, or fetch `/version.json` to confirm which commit a deployment was built from. Override with `VITE_GIT_SHA` env var when building outside a git checkout.

## Architecture

Single-backend model — Board connects to one ravens HTTP server:

```
Board (React SPA) —→ Ravens (Hono/Effect HTTP API, :5090)
                      ├── REST endpoints (session CRUD, message, provider, etc.)
                      └── SSE endpoint (/event?directory=...) — real-time streaming
```

No separate core/runtime services. Ravens handles everything: session management, LLM routing, tool execution, SSE events.

### Data Layer Pattern (features/)

Each domain under `src/features/{domain}/` follows this structure:
- `.hooks.js` — React hooks with state management (useChatModel, useChatsModel, etc.)
- `.service.js` — API calls to ravens REST endpoints via `apiClient`
- `.actions.js` — Reusable mutation functions (create, update, delete, etc.)

No mock system — board always talks to the real ravens backend.

### Data Normalization (normalize.js)

Ravens's data model is mapped to board's internal format:
- `Session.Info` → board chat object (via `normalizeChat`)
- `{ info, parts }` → board message (via `normalizeMessage`)
- `Part[]` → content blocks + steps (via `buildContentBlocks`, `buildSteps`)
- SSE `message.part.updated` / `message.part.delta` events → in-place message updates (via `applyPartDelta`, `applyPartTextDelta`)

### SSE Streaming (ravens event model)

Board connects to ravens's `/event?directory=` SSE endpoint. Events arrive as `{ type, properties }`:

- `message.part.updated` — full part replacement (new step, tool result, thinking)
- `message.part.delta` — incremental text delta for streaming
- `message.updated` — message metadata update (role, status, tokens)
- `session.status` — session lifecycle (busy → idle/error/retry)
- `session.updated` — session metadata (title, path, timestamps)

SSE events are filtered by `properties.sessionID` and applied via `applyOpenCodeEvent()` in `chats.hooks.js`. The SSE transport lives in `src/lib/sseClient.js` (spec-compliant parser + auto-reconnect with backoff).

### State Management

- **Global**: Zustand (`useAppStore`) — theme, locale, sidebar state, toolbox state. Persisted to IndexedDB via `idb-keyval`.
- **Chat cache**: In-memory cache in `chats.hooks.js` with pub/sub listeners, optimistic mutations, and a serial mutation queue. Chat list is a shared observable; individual chat views subscribe to the same cache.
- **Local**: `useState`/`useRef` for component-local state.

### apiClient (`src/lib/apiClient.js`)

Centralized HTTP client with circuit breaker, retry with exponential backoff (3 retries, base 1s), auto-JSON serialization, and `AbortController` support. All requests go through `/ravens/` proxy.

## Key Files

| File | Role |
|---|---|
| `src/App.jsx` | Root layout: Sidebar + all 10 routes (ChatPage is lazy-loaded) |
| `src/components/chats/ChatPage.jsx` | Main chat UI — ~1000 LOC, most complex page |
| `src/features/chats/chats.hooks.js` | Chat state: cache, SSE events, optimistic mutations |
| `src/features/chats/chats.service.js` | Ravens REST API adapter + SSE stream connection |
| `src/features/chats/normalize.js` | Data mapping: ravens → board models |
| `src/features/chats/chats.actions.js` | Thin action wrappers calling service layer |
| `src/features/chats/useChatAgent.js` | Agent/provider selection hook |
| `src/features/chats/useProviderModels.js` | Provider & model listing hook |
| `src/config/runtime.js` | Single config: `VITE_RAVENS_URL` (default: `/ravens`) |
| `src/store/useAppStore.js` | Zustand: theme, sidebar, locale, hydration |
| `src/lib/apiClient.js` | HTTP client with circuit breaker + retry |
| `src/i18n/en.js` + `zh.js` | All user-facing strings |
| `src/styles/global.css` | Design tokens (CSS custom properties) |

## Conventions

- **JSX only** — no TypeScript
- **CSS Modules** — `ComponentName.module.css` co-located with component; never inline styles
- **Path alias**: `@/` → `src/`
- **i18n mandatory**: use `useTranslation()` hook, keys in `i18n/{en,zh}.js`, never hardcode strings
- **Feature pattern**: API logic lives in `features/`, never in components
- **Icons**: `@phosphor-icons/react`, centralized in `components/icons/index.jsx`; LLM provider logos via deep import from `@lobehub/icons`
- **Markdown**: `react-markdown` + `rehype-highlight` + `remark-gfm`
- **Router**: all routes defined in `App.jsx`; `ChatPage` lazy-loaded via `React.lazy`
- **Dialog overlay**: `background: color-mix(in srgb, black 38%, transparent); backdrop-filter: blur(10px);` — not `rgba(0,0,0,0.5)`
- **No inline CSS** — always use CSS Modules
- **No hardcoded strings** — always use i18n keys

## Error Handling

Error states propagate through:
1. SSE `session.status` event with `type: 'error'` → `finalizeMessage()` marks message as error
2. REST API errors → caught in hooks, surfaced via `error` state
3. Circuit breaker in `apiClient.js` → blocks requests after 5 consecutive failures

## Design Docs

Architecture specs live in `.design/*.md` — read relevant ones before implementing new features:
- `streaming-state-machine.md` — SSE event lifecycle
- `multi-agent-v1-implementation.md` — multi-agent orchestration
- `agent-observability.md` — agent observability and lifecycle display
- `circuit-breaker-pattern.md` — resilience patterns
- `project-memory-architecture.md` — memory system
- `project and workspace design.md` — project/workspace design
- `agent core and chat interaction model.md` — agent-chat interaction model