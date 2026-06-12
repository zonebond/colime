# ravens Documentation

ravens is an interactive CLI tool and HTTP server that helps users with software engineering tasks. It routes LLM requests, manages sessions, executes tools, and streams real-time events.

## Key Concepts

### Sessions
A session represents a conversation thread. Each session lives in its own directory under `~/.local/share/ravens/sessions/` (or the configured data directory). Sessions contain messages, config, and file system snapshots.

### Messages and Parts
Messages belong to sessions. Each message contains one or more **parts** — individual content units like text, tool calls, tool results, reasoning, or steps. Parts are the atomic unit of the streaming protocol.

### Agents
ravens ships with built-in agents:
- **general** — handles most software engineering tasks
- **build** — CI/build-focused agent
- **plan** — read-only planning (edit: deny by default)
- **explore** — codebase exploration
- **compaction**, **title**, **summary** — internal agents (hidden)

Custom agents can be defined in `ravens.json` or as `.ravens/agent/<name>.md` files.

### Tools
ravens provides tools for file operations (Read, Write, Edit, Glob, Grep), shell execution (Bash), task management (Task, TodoWrite), web access (WebFetch, WebSearch), and more. Tools are defined in the tool registry and can be extended via plugins.

### Skills
Skills are markdown files (`.ravens/skills/<name>/SKILL.md`) that extend ravens with domain knowledge and workflows. Built-in skills include `customize-ravens` for configuration. After creating or modifying skills, use the frontend reload button, `/reload-skills`, or `POST /skill/reload` to reload — no restart needed.

### SSE Streaming
ravens exposes an SSE endpoint at `/event?directory=...` for real-time streaming of session events:
- `message.part.updated` — full part replacement
- `message.part.delta` — incremental text delta
- `message.updated` — message metadata update
- `session.status` — session lifecycle events
- `session.updated` — session metadata update

## Configuration

Config is loaded from `ravens.json` (project scope, walks up from cwd) and `~/.config/ravens/ravens.json` (global scope). They are deep-merged — project overrides global.

Key config options:
- **model** — provider-prefixed model ID, e.g. `anthropic/claude-sonnet-4-6`
- **small_model** — lightweight model for quick tasks
- **default_agent** — which agent handles new sessions
- **permission** — tool-level allow/ask/deny rules
- **mcp** — MCP server definitions (local or remote)
- **plugin** — plugin array (npm specs, file paths, or tuples with options)
- **skills** — additional skill paths/URLs

Changes to config require a restart to take effect (no hot-reload).

## MCP Servers

MCP servers extend ravens with additional tools. Two types:
- **local** — spawned as a child process (`type: "local"`, `command: [...]`)
- **remote** — HTTP-based (`type: "remote"`, `url: "..."`)

## Plugin System

Plugins are JS/TS modules that hook into ravens lifecycle events:
- `tool.execute.before` / `tool.execute.after` — intercept tool calls
- `chat.message` / `chat.params` / `chat.headers` — modify chat requests
- `config` — mutate merged config at startup
- `permission.ask` — custom permission handlers

Plugins can register new tools, auth providers, and LLM providers.

## HTTP API

When running in serve mode (`ravens serve --port 5090`), ravens exposes REST endpoints:
- `/ravens/session` — session CRUD
- `/ravens/session/:id/message` — message CRUD
- `/ravens/provider` — provider management
- `/ravens/event?directory=...` — SSE event stream

## Escape Hatches

If config is broken and ravens won't start:
- `RAVENS_DISABLE_PROJECT_CONFIG=1` — skip project config
- `RAVENS_CONFIG=/path/to/file.json` — load additional config
- `RAVENS_CONFIG_CONTENT='{...}'` — inject inline JSON config
- `RAVENS_DISABLE_DEFAULT_PLUGINS=1` — skip default plugins

## File Locations

| Scope | Path |
|-------|------|
| Project config | `./ravens.json` or `.ravens/ravens.json` |
| Global config | `~/.config/ravens/ravens.json` |
| Project agents | `.ravens/agent/<name>.md` |
| Project skills | `.ravens/skills/<name>/SKILL.md` |
| Session data | `~/.local/share/ravens/sessions/` |
