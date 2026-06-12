# ravens.app

AI Agent Workspace — frontend prototype.

## Tech Stack

- **Vite** — build tool & dev server
- **React 18** — UI framework
- **JavaScript (JSX)** — no TypeScript for now
- **CSS Modules** — scoped component styles
- **React Router** — client-side routing (ready, not yet configured)

## Project Structure

```
src/
├── main.jsx              # App entry point
├── App.jsx               # Root layout (sidebar + main)
├── App.module.css
│
├── styles/
│   └── global.css        # CSS variables, reset, fonts
│
├── hooks/
│   ├── useSidebar.js     # Sidebar open/close + ⌘\ shortcut
│   └── usePopover.js     # Click-outside-to-close popover logic
│
└── components/
    ├── icons/
    │   └── index.jsx     # All SVG icon components (named exports)
    │
    └── sidebar/
        ├── Sidebar.jsx           # Main sidebar shell
        ├── Sidebar.module.css
        ├── NavRow.jsx            # Reusable nav item (icon + label + tooltip)
        ├── NavRow.module.css
        ├── UserPopover.jsx       # User menu popover
        └── UserPopover.module.css
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:10001](http://localhost:10001).

## Mock / Real API

The app now supports **feature-level** switching between mock data and the real backend.

### Recommended local integration mode

Use real APIs for the main `chat + project` workflow, while keeping the unfinished features on mocks.

1. Copy `.env.example` to `.env.local`
2. Use the recommended values:

```env
VITE_USE_MOCK_API=true
VITE_USE_MOCK_CHATS=false
VITE_USE_MOCK_PROJECTS=false
VITE_USE_MOCK_TOOLBOX=true
VITE_USE_MOCK_TASKS=true
VITE_USE_MOCK_LIBRARY=true
VITE_API_BASE_URL=/core
VITE_RUNTIME_BASE_URL=/runtime
VITE_USE_MOCK_WORKER=false
```

### Meaning of each flag

- `VITE_USE_MOCK_API`
  Global fallback for any feature that does not define its own mock flag.
- `VITE_USE_MOCK_CHATS`
  Controls `src/features/chats/chats.service.js`.
- `VITE_USE_MOCK_PROJECTS`
  Controls `src/features/projects/projects.service.js`.
- `VITE_USE_MOCK_TOOLBOX`
  Controls toolbox-related services.
- `VITE_USE_MOCK_TASKS`
  Controls tasks-related services.
- `VITE_USE_MOCK_LIBRARY`
  Controls library-related services.
- `VITE_API_BASE_URL`
  Base URL for Core API requests. In local development, `/core` is proxied by Vite to `ravens.core`.
- `VITE_RUNTIME_BASE_URL`
  Base URL for Runtime API requests. In local development, `/runtime` is proxied by Vite to `ravens.runtime`.
- `VITE_USE_MOCK_WORKER`
  Only relevant when chats are still mocked.

### Current recommended backend usage

With the configuration above:

- `Chats` use `ravens.core`
- `Projects` use `ravens.core`
- `Toolbox` stays mocked
- `Tasks` stay mocked
- `Library` stays mocked

This is the safest current development mode because the main product workflow is already backed by the real service, while unfinished feature areas continue using local mocks.

### Start both services locally

Frontend:

```bash
npm install
npm run dev
```

Backend (`../ravens.core`):

```bash
npm install
npm run dev
```

Runtime (`../ravens.runtime`):

```bash
npm install
npm run dev
```

### Local proxy behavior

During local development, the Vite dev server proxies:

- `/core/*` -> `ravens.core:10010` (prefix stripped)
- `/runtime/*` -> `ravens.runtime:10011` (prefix stripped)

This keeps browser requests same-origin and avoids local CORS issues while matching the future production routing model.

Detailed architecture and backend hookup notes:

- `docs/api-switching.md`

## Scripts

| Command         | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Start dev server         |
| `npm run build` | Production build         |
| `npm run preview` | Preview production build |
| `npm run lint`  | Run ESLint               |

## Sidebar Features

- **Open / Close** — click toggle button or press `⌘\`
- **Closed state** — collapses to 52px icon-only strip
- **Tooltips** — appear on hover when sidebar is closed
- **Toolbox** — expandable sub-menu (Skills / Agents / MCP / Tools)
- **Recents** — shows recent chats, hidden when sidebar is closed
- **User popover** — click avatar or chevron to open, click outside to close

## Adding a New Nav Item

1. Export an icon from `src/components/icons/index.jsx`
2. Add a `NavRow` entry in `Sidebar.jsx`

```jsx
import { IconMyNew } from '@/components/icons'

<NavRow
  icon={<IconMyNew />}
  label="My New Item"
  isClosed={isClosed}
  isActive={activeNav === 'my-new'}
  onClick={() => setActiveNav('my-new')}
/>
```

## Design Tokens

All design tokens live in `src/styles/global.css` as CSS custom properties:

```css
--sidebar-bg    sidebar background
--hover         hover state background
--active        active state background
--txt1          primary text
--txt2          secondary text
--txt3          muted / placeholder text
--border        subtle border
--tip-bg        tooltip background
--font-sans     Geist
--font-serif    Instrument Serif (used for "Ravens" title)
--font-mono     Geist Mono
```
