# Feature Layer

## OVERVIEW

Data layer pattern: each domain has `{name}.hooks.js` + `{name}.service.js` + `{name}.mock.js`. Components consume hooks, never call services directly.

## STRUCTURE

```
features/
├── chats/       # hooks + service + mock + mockChatEngine (chats only: also actions.js)
├── projects/    # hooks + service + mock
├── tasks/       # hooks + service + mock
├── library/     # hooks + service + mock
└── toolbox/     # hooks + service + mock
```

## PATTERN

Each feature follows:
- `.hooks.js` — React hooks (use{Name}Model, use{Name}sModel)
- `.service.js` — API calls + mock fallback, toggled by `runtimeConfig.useMock{Name}`
- `.mock.js` — fixture data arrays
- `.actions.js` — (chats only) thin async wrappers for cache operations

Notable files:
- `chats/mockChatEngine.js` — 1427 LOC simulated AI responses
- `chats/chats.hooks.js` — 1294 LOC primary chat state hook
- `toolbox/toolbox.hooks.js` — 531 LOC provider/agent/skill/tool state

## ANTI-PATTERNS

- Do NOT skip the service layer — no direct fetch in components
- Do NOT add new features without the hooks/service/mock triad
- Do NOT bypass `runtimeConfig.useMock*` toggles
