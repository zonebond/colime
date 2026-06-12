# Chat Components

## OVERVIEW

The most complex UI area. ChatPage.jsx (~3035 LOC) is the main chat view — handles message rendering, auto-scroll, thinking blocks, tool cards, markdown, and composer.

## WHERE TO LOOK

| Concern | File | Notes |
|---------|------|-------|
| Main chat page | `ChatPage.jsx` | Everything: messages, scroll, composer, actions |
| Chat list | `ChatsPage.jsx` | Sidebar chat list with pin/archive |
| Chat item | `ChatItem.jsx` | Single chat row in list |
| Move dialog | `MoveDialog.jsx` | Move chat to project |

## KEY PATTERNS

- **Auto-scroll** — `scrollAreaRef` + `autoScrollRef` + `ResizeObserver` on content for streaming follow
- **Message blocks** — `contentBlocks[]` array with types: `thinking`, `text`, `tool_result`, `source`, `image`, `file`
- **Thinking state** — `thinkingState`: `active` → `done` / `error`; `thinkingBlock.state` drives collapse UI
- **Status pills** — `AssistantStatus` shows thinking/Stopped/error badges
- **SSE event handling** — `applyRuntimeEventToChat` (hooks) maps events → message state

## ANTI-PATTERNS

- Do NOT add state that should live in `features/chats/chats.hooks.js`
- Do NOT bypass the `contentBlocks` system — add new block types there
- ChatPage.jsx is already ~3035 LOC — extract new sub-components instead of growing it
