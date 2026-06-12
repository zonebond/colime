# colime

AI-powered development tool. A monorepo combining a typed functional backend with a React frontend board for interactive AI-assisted coding.

## Architecture

### System Overview

```
          ┌─────────────────────────────────────────────────────┐
          │                   :5090 (nginx)                      │
          │  ┌──────────────┐       ┌──────────────────────┐    │
          │  │    board/    │       │    packages/          │    │
          │  │  React+Vite  │──/──▶ │  ravens (Hono)     │    │
          │  │  (webapp)    │ SSE   │  :4096 (Bun)         │    │
          │  └──────────────┘       └──────────┬───────────┘    │
          │                                     │                │
          │                          ┌──────────┴───────────┐    │
          │                          │     packages/core     │    │
          │                          │  filesystem · flags   │    │
          │                          │  tools · telemetry    │    │
          │                          └──────────────────────┘    │
          │                                     │                │
          │                          ┌──────────┴───────────┐    │
          │                          │      SQLite (DB)      │    │
          │                          │  sessions · messages  │    │
          │                          │  parts · providers    │    │
          │                          └──────────────────────┘    │
          └─────────────────────────────────────────────────────┘

   LLM Providers:  OpenAI · Anthropic · DeepSeek · Ollama · custom OpenAI-compatible
```

### Repository Structure

```
colime-pack/
├── packages/
│   ├── ravens/  Main server — Effect/Hono HTTP API, providers, session engine, LLM pipeline
│   ├── core/      Shared core — filesystem abstraction, feature flags, tool registry
│   ├── plugin/    Plugin system — loadable extensions
│   ├── sdk/js/    Auto-generated typed JS SDK — SSE client, directory routing
│   └── ui/        Shared UI components — SolidJS + OpenTUI terminal toolkit
├── board/         React + Vite web frontend — chat board, toolbox, provider management
├── docker/        Dockerfiles & nginx config for containerized deployment
└── data/          Runtime persistent data — config.json, session directories
```

### Session → Agent Flow

```
  User Input (text, files, @mentions, /commands)
      │
      ▼
  ┌─────────────────────────────────────────────────┐
  │  prompt()                                        │
  │  · Resolve attachments, references, data URLs    │
  │  · Expand @mentions → agent/subtask/reference    │
  │  · Expand /commands → template → prompt parts    │
  │  · Create MessageV2.User + Parts → persist       │
  │  · Trigger plugin hooks (chat.message, sync)     │
  └───────┬─────────────────────────────────────────┘
          │
          ▼
  ╔══════════════════════════════════════════════════╗
  ║  runLoop(sessionID)                              ║
  ║  while step < maxSteps:                          ║◀──────────────────────┐
  ╚══════════════╤═══════════════════════════════════╝                       │
                 │                                                            │
                 ▼                                                            │
  ┌──────────────────────────────┐                                           │
  │  1. Scan last User/Assistant │  Collect pending subtasks & compactions   │
  └──────────────┬───────────────┘                                           │
                 │                                                            │
                 ▼                                                            │
  ┌──────────────────────────────┐                                           │
  │  2. Check exit condition     │                                           │
  │  · finish="stop" & no        │──▶ break (done)                          │
  │    pending tool-calls?       │                                           │
  └──────────────┬───────────────┘                                           │
                 │ (not done)                                                 │
                 ▼                                                            │
  ┌──────────────────────────────┐                                           │
  │  3. Dispatch pending tasks   │                                           │
  │                              │                                           │
  │  ┌─ subtask?                 │                                           │
  │  │   handleSubtask()         │  Create sub-agent message, execute        │
  │  │   · resolve task agent    │  TaskTool, emit tool result part          │
  │  │   · permission check      │──▶ continue loop ─────────────────────────┘
  │  │   · execute TaskTool      │                                           │
  │  │                           │                                           │
  │  └─ compaction?              │                                           │
  │      compaction.process()    │  Summarize context, collapse messages     │
  │      · auto / overflow       │──▶ continue loop ─────────────────────────┘
  └──────────────┬───────────────┘                                           │
                 │ (no pending tasks)                                         │
                 ▼                                                            │
  ┌──────────────────────────────┐                                           │
  │  4. Resolve agent + model    │                                           │
  │  · insertReminders()         │  Plan mode, build-switch, max-steps       │
  │  · Create MessageV2          │                                           │
  │    .Assistant (processor)    │                                           │
  └──────────────┬───────────────┘                                           │
                 │                                                            │
                 ▼                                                            │
  ┌──────────────────────────────┐                                           │
  │  5. Build prompt context     │                                           │
  │  · resolveTools()            │  ToolRegistry + MCP tools                 │
  │  · System prompt assembly    │  environment + skills + memory            │
  │  · toModelMessages()         │  + agent instructions + format hints      │
  └──────────────┬───────────────┘                                           │
                 │                                                            │
                 ▼                                                            │
  ┌──────────────────────────────┐                                           │
  │  6. LLM.stream()             │  AI SDK streamText()                      │
  │  provider · model · system   │──▶ SSE events ──▶ board (live deltas)     │
  │  messages · tools · format   │                                           │
  └──────────────┬───────────────┘                                           │
                 │                                                            │
                 ▼                                                            │
  ┌──────────────────────────────────────────────────────────────────────┐  │
  │  7. handleEvent() — Stream event dispatch                            │  │
  │                                                                       │  │
  │  reasoning-*:  ReasoningPart (think block, shown incrementally)      │  │
  │  text-*:       TextPart delta ──▶ token-by-token board render        │  │
  │  tool-input-*: ToolPart (pending → running)                          │  │
  │  tool-call:    ┌─ execute tool (ToolRegistry / MCP)                  │  │
  │                ├─ permission.ask() ──▶ allow / deny / ask-user       │  │
  │                └─ doom-loop? 3× same call ──▶ permission.ask("doom") │  │
  │  tool-result:  ToolPart (completed + output + attachments)           │  │
  │  tool-error:   ToolPart (error), failToolCall()                      │  │
  │  step-*:       StepStart / StepFinish part + snapshot patch          │  │
  │  error:        halt() → SessionRetry.policy() ──▶ retry / fail       │  │
  │  finish-step:  ┌─ isOverflow()? → ctx.needsCompaction = true         │  │
  │                └─ SessionSummary.fork() (background)                 │  │
  └──────────────┬───────────────────────────────────────────────────────┘  │
                 │                                                            │
                 ▼                                                            │
  ┌──────────────────────────────────────────────────────────────────────┐  │
  │  8. processor.process() returns Result                               │  │
  │                                                                       │  │
  │  ┌─ "compact"                                                        │  │
  │  │   compaction.create()                                             │  │
  │  │   ──▶ continue loop ──────────────────────────────────────────────┘  │
  │  │                                                                       │
  │  ├─ "stop"                                                               │
  │  │   · permission denied (blocked)                                       │
  │  │   · assistant message error                                           │
  │  │   · structured output captured                                        │
  │  │   ──▶ break (return last assistant)                                   │
  │  │                                                                       │
  │  └─ "continue"                                                           │
  │      · tool-calls pending → loop back, send results to LLM               │
  │      · finish="tool-calls" + hasToolCalls                                │
  │      ──▶ continue loop ─────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Decision Points Summary

| Trigger | Action | Outcome |
|---------|--------|---------|
| `finish="stop"` + no pending tool calls | Exit loop | Return last assistant message |
| Pending subtask in message | `handleSubtask()` → `TaskTool.execute()` | Continue loop |
| Auto/overflow compaction | `compaction.process()` → summarize context | Continue loop |
| Tool call from LLM | `tool.execute()` via ToolRegistry or MCP | Tool result → back to LLM |
| 3× same tool call in a row | `permission.ask("doom_loop")` | Allow / deny / ask user |
| Permission denied by user/rule | `Permission.RejectedError` → `ctx.blocked` | Stop loop |
| Token overflow detected | `isOverflow()` → `ctx.needsCompaction` | Trigger compaction |
| Stream error | `SessionRetry.policy()` → retry with backoff | Retry / halt |
| Structured output format | `StructuredOutput` tool capture | Break (single response) |
| Step ≥ agent.maxSteps | Append MAX_STEPS reminder | LLM sees final nudge |

Each message is composed of typed **Parts** (15 types): `Text`, `Reasoning`, `File`, `Tool`, `StepStart`, `StepFinish`, `Snapshot`, `Patch`, `Agent`, `Subtask`, `Retry`, `Compaction`, etc. — enabling structured incremental rendering in the board.

### Stack

| Layer | Technology |
|-------|-----------|
| Runtime | [Bun](https://bun.sh) 1.3 |
| Backend framework | [Effect](https://effect.website) 4.0 + [Hono](https://hono.dev) 4 |
| Frontend | React 18 + [Vite](https://vite.dev) 8 |
| UI Toolkit | [OpenTUI](https://github.com/opentui/core) (terminal) + React (web board) |
| Database | SQLite via [Drizzle ORM](https://orm.drizzle.team) |
| Styling | Tailwind CSS 4 + CSS Modules |
| Package manager | Bun workspaces (`bun install`) |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3

### Development

```bash
# Install dependencies
bun install

# Start the ravens server (port 4096)
bun run dev

# Start the board frontend (port 3000)
cd board && bun run dev
```

### Docker

```bash
# Build and start both runtime + webapp
docker compose up -d

# Web UI available at http://localhost:5090
```

The Docker setup runs two services:
- **runtime** — ravens server on internal port 4096
- **webapp** — nginx reverse proxy serving the board on port 5090, proxying `/ravens/` to the runtime

## Key Concepts

### Providers & Models

colime supports multiple AI providers (OpenAI-compatible, Anthropic, DeepSeek, Ollama, etc.). Each provider can expose multiple models. Configuration is persisted in `RAVENS_CONFIG_DIR/config.json`.

### Sessions & Messages

Chat sessions are stored as directories under the sessions path. Each message is composed of typed **Parts** (text, tool call, tool result, reasoning, file, etc.) enabling structured rendering in the board.

### SSE Streaming

The server streams responses via Server-Sent Events. The board renders thinking/reasoning blocks incrementally and message text token-by-token as they arrive.

## Workspace Scripts

| Script | Description |
|--------|-------------|
| `bun run dev` | Start ravens server |
| `bun run typecheck` | Type-check all packages |
| `bun run lint` | Lint with oxlint |
| `bun test` (per package) | Run package-level tests |

## Configuration

- `RAVENS_CONFIG_DIR` — directory for config persistence (default: instance directory)
- `RAVENS_SERVER_PASSWORD` — optional server password for HTTP API auth
