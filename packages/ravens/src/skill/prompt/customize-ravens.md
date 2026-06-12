<!--
  Built-in skill. Name and description are registered in code at
  packages/ravens/src/skill/index.ts (see CUSTOMIZE_RAVENS_SKILL_NAME
  and CUSTOMIZE_RAVENS_SKILL_DESCRIPTION). The body below becomes the
  skill's content.
-->

# Customizing ravens

ravens validates its own config strictly and refuses to start when a field
is wrong. The shapes below cover the common surface area, but they are a
**summary, not the source of truth**.

## Full schema reference

The authoritative list of every config option — with field types, enums,
defaults, and descriptions — lives in the published JSON Schema:

**<https://ravens.ai/config.json>**

If a field is not documented in this skill, or you need to confirm an exact
shape before writing config, **fetch that URL and read the schema directly**
rather than guessing. ravens hard-fails on invalid config, so the cost of a
wrong shape is a broken startup.

Independently, every `ravens.json` should declare
`"$schema": "https://ravens.ai/config.json"` so the user's editor catches
mistakes as they type.

## Applying changes

- **Skills**: After creating or modifying skill files, the user must reload
  skills for changes to take effect — no restart needed. Reload via the
  frontend reload button, the `/reload-skills` slash command, or calling
  `POST /skill/reload` directly.
- **Config (`ravens.json`, `ravens.jsonc`)**: Loaded once at startup, no
  hot-reload. **Tell the user to quit and restart ravens** for config
  changes to take effect.
- **Agents and Plugins**: Loaded once at startup, no hot-reload. Restart
  required.

The running session keeps using the already-loaded config, agents, and
plugins until ravens restarts.

## Where files live

| Scope                         | Path                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Project config                | `./ravens.json`, `./ravens.jsonc`, or `.ravens/ravens.json` (ravens walks up from the cwd to the worktree root) |
| Global config                 | `~/.config/ravens/ravens.json` (NOT `~/.ravens/`). When `RAVENS_CONFIG_DIR` is set, it overrides this path for the main config file. |
| Project agents                | `.ravens/agent/<name>.md` or `.ravens/agents/<name>.md`                                                               |
| Global agents                 | `~/.config/ravens/agent(s)/<name>.md`                                                                                   |
| Project skills                | `.ravens/skill(s)/<name>/SKILL.md`                                                                                      |
| Global skills                 | `~/.config/ravens/skill(s)/<name>/SKILL.md`                                                                             |
| External skills (auto-loaded) | `~/.claude/skills/<name>/SKILL.md`, `~/.agents/skills/<name>/SKILL.md`                                                    |

Configs from each scope are deep-merged. Project overrides global. Unknown
top-level keys in `ravens.json` are rejected with `ConfigInvalidError`.

**Important:** `~/.config/ravens/` is **always** scanned for global skills,
agents, and plugins — even when `RAVENS_CONFIG_DIR` changes where the main
config file is loaded from. In Docker deployments, ensure
`~/.config/ravens/` (or `/root/.config/ravens/` inside the container) is
mounted as a volume so global resources persist across restarts.

## ravens.json

Every field is optional.

```json
{
  "$schema": "https://ravens.ai/config.json",
  "username": "string",
  "model": "provider/model-id",
  "small_model": "provider/model-id",
  "default_agent": "agent-name",
  "shell": "/bin/zsh",
  "logLevel": "DEBUG" | "INFO" | "WARN" | "ERROR",
  "share": "manual" | "auto" | "disabled",
  "autoupdate": true | false | "notify",
  "snapshot": true,
  "instructions": ["AGENTS.md", "docs/style.md"],

  "skills": {
    "paths": [".ravens/skills", "/abs/path/to/skills"],
    "urls": ["https://example.com/.well-known/skills/"]
  },

  "agent": {
    "my-agent": {
      "model": "anthropic/claude-sonnet-4-6",
      "mode": "subagent",
      "description": "...",
      "permission": { "edit": "deny" }
    }
  },

  "command": {
    "deploy": { "description": "...", "prompt": "..." }
  },

  "provider": {
    "anthropic": { "options": { "apiKey": "..." } }
  },
  "disabled_providers": ["openai"],
  "enabled_providers": ["anthropic"],

  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp"],
      "enabled": true,
      "env": {}
    },
    "remote-thing": {
      "type": "remote",
      "url": "https://...",
      "headers": { "Authorization": "Bearer ..." }
    }
  },

  "plugin": [
    "ravens-gemini-auth",
    "ravens-foo@1.2.3",
    "./local-plugin.ts",
    ["ravens-bar", { "option": "value" }]
  ],

  "permission": {
    "edit": "deny",
    "bash": { "git *": "allow", "*": "ask" }
  },

  "formatter": false,
  "lsp": false,

  "experimental": {
    "primary_tools": ["edit"],
    "mcp_timeout": 30000
  },

  "tool_output": { "max_lines": 200, "max_bytes": 8192 },

  "compaction": { "auto": true, "tail_turns": 15 }
}
```

Shape notes worth being explicit about:

- `model` always carries a provider prefix: `"anthropic/claude-sonnet-4-6"`.
- `skills` is an object with `paths` and/or `urls`, not an array.
- `agent` is an object keyed by agent name, not an array.
- `plugin` is an array of strings or `[name, options]` tuples, not an object.
- `mcp[name].command` is an array of strings, never a single string. `type` is required.
- `permission` is either a string action or an object keyed by tool name.

## Skills

ravens's skill loader scans for `**/SKILL.md` inside skill directories. The
file is named `SKILL.md` exactly, and lives in its own folder named after the
skill:

```
.ravens/skills/my-skill/SKILL.md
```

Frontmatter:

```markdown
---
name: my-skill
description: One sentence covering what this skill does AND when to trigger it. Front-load the literal keywords or filenames the user is likely to say.
---

# My Skill

(skill body in markdown: instructions, examples, references)
```

- `name` is required, lowercase hyphen-separated, up to 64 chars, and matches the folder name.
- `description` is effectively required: skills without one are filtered out and never surfaced to the model. Cover both _what_ the skill does and _when_ to use it. Write in third person ("Use when...", not "I help with..."). Front-load concrete trigger keywords and filenames; gate with "Use ONLY when..." if the skill should stay quiet on adjacent topics.
- Optional: `license`, `compatibility`, `metadata` (string-string map).

Register skills from non-default locations via `skills.paths` (scanned
recursively for `**/SKILL.md`) and `skills.urls` (each URL serves a list of
skills).

## Agents

Two ways to define an agent. Use the file form for anything non-trivial.

### Inline (in `ravens.json`)

```json
{
  "agent": {
    "my-reviewer": {
      "description": "Reviews PRs for style violations.",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-6",
      "permission": { "edit": "deny", "bash": "ask" },
      "prompt": "You are a strict PR reviewer..."
    }
  }
}
```

### File

```
.ravens/agent/my-reviewer.md      OR     .ravens/agents/my-reviewer.md
```

```markdown
---
description: Reviews PRs for style violations.
mode: subagent
model: anthropic/claude-sonnet-4-6
permission:
  edit: deny
  bash: ask
---

You are a strict PR reviewer. Focus on...
```

The file body becomes the agent's `prompt`. Do not also put `prompt:` in the
frontmatter.

`mode` is one of `"primary"`, `"subagent"`, `"all"`.

Allowed top-level frontmatter fields: `name, model, variant, description, mode,
hidden, color, steps, options, permission, disable, temperature, top_p`. Any
unknown field is silently routed into `options`.

To disable a built-in agent: `agent: { build: { disable: true } }`, or in a
file, `disable: true` in frontmatter.

`default_agent` must point to a non-hidden, primary-mode agent.

### Built-in agents

ravens ships with `build`, `plan`, `general`, `explore`, plus optionally
`scout` (gated on `RAVENS_EXPERIMENTAL_SCOUT`). Hidden internal agents:
`compaction`, `title`, `summary`. To override a built-in's fields, define the
same key in `agent: { <name>: { ... } }`.

## Plugins

`plugin:` is an array. Each entry is one of:

```json
"plugin": [
  "ravens-gemini-auth",            // npm spec, latest
  "ravens-foo@1.2.3",              // npm spec, pinned
  "./local-plugin.ts",               // file path, relative to the declaring config
  "file:///abs/path/plugin.js",      // file URL
  ["ravens-bar", { "key": "val" }] // tuple form with options
]
```

Auto-discovered plugins (no config entry needed): any `*.ts` or `*.js` file in
`.ravens/plugin/` or `.ravens/plugins/`.

A plugin module exports `default` (or any named export) of type
`Plugin = (input: PluginInput, options?) => Promise<Hooks>`. The export is a
function, not a plain object literal, and the function returns an object
(return `{}` if there is nothing to register).

```ts
import type { Plugin } from "@ravens-ai/plugin"

export default (async ({ client, project, directory, $ }) => {
  return {
    config: (cfg) => {
      // cfg is the live merged config; mutate fields here.
    },
    "tool.execute.before": async (input, output) => {
      // mutate output.args before the tool runs
    },
  }
}) satisfies Plugin
```

Hook surface (mutate `output` in place; return `void`):

- `event(input)`: every bus event
- `config(cfg)`: once on init with the merged config
- `chat.message`, `chat.params`, `chat.headers`
- `tool.execute.before`, `tool.execute.after`
- `tool.definition`
- `command.execute.before`
- `shell.env`
- `permission.ask`
- `experimental.chat.messages.transform`, `experimental.chat.system.transform`,
  `experimental.session.compacting`, `experimental.compaction.autocontinue`,
  `experimental.text.complete`

Special object-shaped (not callbacks): `tool: { my_tool: { ... } }`,
`auth: { ... }`, `provider: { ... }`.

## MCP servers

`mcp:` is an object keyed by server name. Each server is discriminated by
`type`:

```json
{
  "mcp": {
    "playwright": {
      "type": "local",
      "command": ["npx", "-y", "@playwright/mcp"],
      "enabled": true,
      "env": { "BROWSER": "chromium" }
    },
    "github": {
      "type": "remote",
      "url": "https://...",
      "enabled": true,
      "headers": { "Authorization": "Bearer ${GITHUB_TOKEN}" }
    },
    "old-server": { "enabled": false }
  }
}
```

`command` is an array of strings. `type` is required. Use `enabled: false` to
disable a server inherited from a parent config.

## Permissions

```json
"permission": {
  "edit": "deny",
  "bash": { "git *": "allow", "rm *": "deny", "*": "ask" },
  "external_directory": { "~/secrets/**": "deny", "*": "allow" }
}
```

Actions: `"allow"`, `"ask"`, `"deny"`.

Per-tool value forms: `"allow"` shorthand (treated as `{"*": "allow"}`), or an
object `{ pattern: action }`. Within an object, **insertion order matters**.
ravens evaluates the LAST matching rule, so put broad rules first and narrow
rules last.

`permission: "allow"` (a string at the top level) is shorthand for "allow
everything" and is rarely what the user wants.

Known permission keys: `read, edit, glob, grep, list, bash, task,
external_directory, todowrite, question, webfetch, websearch, repo_clone,
repo_overview, lsp, doom_loop, skill`. Some of these (`todowrite,
question, webfetch, websearch, doom_loop`) only accept a flat
action, not a per-pattern object.

`external_directory` patterns are filesystem paths (use `~/`, absolute paths,
or globs like `~/projects/**`).

Per-agent `permission:` overrides top-level `permission:`. Plan Mode lives on
the `plan` agent's permission ruleset (`edit: deny *`).

## Escape hatches

When a user's config is broken and ravens won't start, these env vars help:

- `RAVENS_DISABLE_PROJECT_CONFIG=1`: skip the project's local `ravens.json`
  and start from globals only. Run from the project directory, ravens loads,
  the user edits the broken file, then they restart without the flag.
- `RAVENS_CONFIG=/path/to/file.json`: load an additional explicit config.
- `RAVENS_CONFIG_CONTENT='{"$schema":"https://ravens.ai/config.json"}'`:
  inject inline JSON as a final local-scope merge.
- `RAVENS_DISABLE_DEFAULT_PLUGINS=1`: skip default plugins.
- `RAVENS_PURE=1`: skip external plugins entirely.
- `RAVENS_DISABLE_EXTERNAL_SKILLS=1`,
  `RAVENS_DISABLE_CLAUDE_CODE_SKILLS=1`: skip the external skill scans under
  `~/.claude/` and `~/.agents/`.

## When helping users install skills

When a user asks to find, install, or set up a skill from an external source
(e.g., GitHub, skills.sh, a URL):

1. Execute the installation yourself — do NOT just tell the user what to run.
   - Use `npx skills add <owner/repo@skill> -g -y` for skills.sh ecosystem
   - For raw URLs, add the URL to `skills.urls` in ravens.json and use
     `RAVENS_CONFIG_CONTENT` to inject it, OR download SKILL.md files directly
     to `.ravens/skills/<name>/SKILL.md`
2. After installing, call `POST /skill/reload` to make the skill available
   immediately.
3. Confirm what was installed and verify it appears in the skill list.

If installation fails, diagnose the error and try an alternative approach
rather than giving the user a manual workaround.

## When proposing edits

- Validate against the schema before writing. If you are unsure of a field's
  exact shape, or the field is not covered in this skill, fetch
  `https://ravens.ai/config.json` and read the schema rather than guessing.
- Preserve `$schema` and any existing fields the user did not ask to change.
- For agent, skill, and plugin definitions, prefer creating new files in the
  correct location over inlining everything in `ravens.json`.
- If the user's existing config is malformed, point them at the env-var escape
  hatches above so they can edit from inside ravens without breaking their
  session.
- After creating or modifying skill files, call `POST /skill/reload` yourself
  (curl -X POST http://127.0.0.1:5090/ravens/skill/reload) to make them
  available immediately. No need to tell the user to reload — just do it and
  confirm the result. Skills do NOT require a restart.
- After saving config, agent, or plugin changes, remind the user to quit and
  restart ravens — these are loaded once at startup.
