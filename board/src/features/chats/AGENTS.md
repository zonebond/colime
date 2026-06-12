# Chat Feature Layer

## OVERVIEW

Data layer for chat: hooks, API service, mock engine, SSE streaming. This is where chat logic lives — components should only consume hooks from here.

## WHERE TO LOOK

| Concern | File | LOC |
|---------|------|-----|
| Hooks (useChatModel, useChatsModel) | `chats.hooks.js` | 1294 |
| API + SSE streaming | `chats.service.js` | 990 |
| Mock AI responses | `mockChatEngine.js` | 1427 |
| Mock data fixtures | `chats.mock.js` | 396 |
| Action functions | `chats.actions.js` | thin wrappers |
| Mock worker bridge | `mockChatWorker.js` | Web Worker |

## KEY PATTERNS

- **Cache** — `chatsCache` (module-level) with `subscribeChats` listener pattern
- **useChatModel** — returns `{ chat, loading, sendMessage }`; subscribes to cache
- **SSE parsing** — `parseSseStream` yields `{ event, data }` from response body
- **Runtime events** — `applyRuntimeEventToChat` maps SSE events to chat/message state
- **Optimistic UI** — temp IDs, then `replaceCachedChat` on server response
- **Mock toggle** — `runtimeConfig.useMockChats` switches real/mock path

## ANTI-PATTERNS

- Do NOT put UI rendering logic here — this is data-only
- Do NOT call `setState` directly — always go through cache mutation
- Do NOT add new mock responses without updating `mockChatEngine.js`
