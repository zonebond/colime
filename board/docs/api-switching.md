# API Switching

## Goal

This project supports two data modes:

- mock mode: feature modules return local mock data
- real API mode: feature modules call the backend through a shared API client

The switch is controlled by Vite env variables.

## Env Variables

Create `.env.local` from `.env.example`.

```env
VITE_USE_MOCK_API=true
VITE_API_BASE_URL=/core
```

- `VITE_USE_MOCK_API=true`
  Use mock adapters. This is the default local development mode.
- `VITE_USE_MOCK_API=false`
  Use real HTTP requests.
- `VITE_API_BASE_URL`
  Base URL passed into `src/lib/apiClient.js`.

## Data Flow

Feature modules follow this structure:

```text
component -> hooks -> actions -> service -> mock adapter / real adapter
```

Examples:

- `src/components/chats/ChatsPage.jsx`
- `src/features/chats/chats.hooks.js`
- `src/features/chats/chats.actions.js`
- `src/features/chats/chats.service.js`

## Shared Runtime Pieces

- `src/config/runtime.js`
  Reads `VITE_USE_MOCK_API` and `VITE_API_BASE_URL`
- `src/lib/apiClient.js`
  Shared request wrapper for `GET/POST/PATCH/PUT/DELETE`

## Current Feature Coverage

Already wired for mock/real switching:

- `chats`
- `projects`

Already wired to feature `hooks/actions/service`, but still placeholder data only:

- `tasks`
- `library`
- `toolbox`

## Where To Hook Real Backend

### Chats

Edit:

- `src/features/chats/chats.service.js`

Current real adapter expects these endpoints:

- `GET /chats`
- `GET /chats/:id`
- `POST /chats`
- `POST /chats/:id/touch`
- `PATCH /chats/:id/pin`
- `PATCH /chats/:id/archive`
- `PATCH /chats/:id`
- `DELETE /chats/:id`
- `POST /chats/batch-delete`
- `POST /chats/move`

If your backend path or payload shape differs, change:

- request paths in the real adapter
- `normalizeChat()`

### Projects

Edit:

- `src/features/projects/projects.service.js`

Current real adapter expects:

- `GET /projects`

If payload shape differs, change:

- request path
- `normalizeProject()`

## Request Customization

If you need auth headers, cookies, tenant headers, or a different error format, update:

- `src/lib/apiClient.js`

Typical changes:

- add `Authorization` header
- switch to `credentials: 'include'`
- normalize backend error payloads
- add request timeout / retry logic

## Adding A New Feature Module

Recommended structure:

```text
src/features/<feature>/
  <feature>.mock.js
  <feature>.service.js
  <feature>.actions.js
  <feature>.hooks.js
```

Recommended rule:

- components do not call `fetch` directly
- components use feature hooks
- services own backend paths and payload normalization
- mock and real logic stay inside the same feature service until the feature is stable
