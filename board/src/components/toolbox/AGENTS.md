# Toolbox Components

## OVERVIEW

Toolbox domain: Skills, Agents, MCP, Tools pages. Each is a standalone list/detail page under `/toolbox/*`.

## WHERE TO LOOK

| Page | File | LOC |
|------|------|-----|
| Toolbox home | `ToolboxPage.jsx` | — |
| Skills | `SkillsPage.jsx` | — |
| Agents | `AgentsPage.jsx` | — |
| MCP | `McpPage.jsx` | — |
| Tools | `ToolsPage.jsx` | — |
| Provider config | `ConnectProviderPage.jsx` | 751 |

## KEY PATTERNS

- All pages follow the same layout: header + filter bar + grid/list
- Data comes from `features/toolbox/toolbox.hooks.js`
- Currently mocked (`VITE_USE_MOCK_TOOLBOX=true`)

## ANTI-PATTERNS

- Do NOT add chat-related logic here
- Keep page components thin — data belongs in `features/toolbox/`
