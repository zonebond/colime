# CLAUDE.md — colime-pack

This is the **colime** monorepo: AI-powered development tool with a React frontend and an Effect/Hono backend.

## Quick Start

```bash
# Install dependencies (from root)
bun install

# Start backend (ravens HTTP server on port 5090)
bun run --conditions=browser ./packages/ravens/src/index.ts serve --port 5090

# Start frontend (in another terminal)
cd board && npm run dev   # Vite on port 3000, proxies /ravens → localhost:5090

# Production build
cd board && npm run build   # Output to board/dist/

# Docker (full stack)
docker compose up --build   # nginx:80 → ravens:4096, external port 5090
```

## Repository Structure

```
colime-pack/
├── packages/ravens/   Main backend — Effect/Hono HTTP API, session engine, LLM pipeline
├── packages/core/        Shared core — filesystem, feature flags, tool registry
├── packages/plugin/      Plugin system — loadable extensions
├── packages/sdk/js/      Auto-generated typed JS SDK from OpenAPI spec
├── packages/ui/           Shared UI — SolidJS + OpenTUI terminal toolkit
├── board/                React + Vite frontend — chat, toolbox, provider management
├── docker/               Dockerfiles & nginx config
└── data/                 Runtime data — config.json, session directories
```

## Architecture

```
Board (React, :3000) ——/ravens/——→ Ravens (Hono/Effect, :5090)
                                      ├── REST: session, message, provider, etc.
                                      └── SSE:  /event?directory=... (real-time streaming)
```

Docker production: nginx (:5090) → board static + proxy `/ravens/` → ravens (:4096)

## Key Conventions

- **Board**: JSX only, CSS Modules, i18n mandatory, `@/` path alias → `src/`
- **Ravens**: TypeScript, Effect/Hono HttpApi, branded IDs (`ses_*`, `msg_*`, `prt_*`)
- **Data flow**: Board → apiClient → `/ravens/` proxy → ravens REST/SSE
- **SSE events**: `{ type, properties }` format — filtered by `properties.sessionID`
- **No mock system**: Board always connects to real ravens backend

## Port Map

| Service | Dev | Docker |
|---------|-----|--------|
| Board (Vite) | :3000 | nginx :80 (container) |
| Ravens | :5090 | :4096 (container) |
| External | — | :5090 |

## Sub-project CLAUDE.md

- `board/CLAUDE.md` — Board frontend conventions, key files, data layer pattern