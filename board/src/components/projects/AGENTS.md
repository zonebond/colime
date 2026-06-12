# Project Components

## OVERVIEW

Project list and detail pages. ProjectDetailPage.jsx (1357 LOC) is the second-largest component — handles project chats, resources, and settings.

## WHERE TO LOOK

| Concern | File |
|---------|------|
| Project list | `ProjectsPage.jsx` |
| Project detail | `ProjectDetailPage.jsx` |
| Project card | `ProjectItem.jsx` |

## KEY PATTERNS

- Project detail fetches chats + resources via `features/projects/`
- Project ↔ Chat relationship: chats belong to projects, can be moved

## ANTI-PATTERNS

- ProjectDetailPage.jsx is large — extract sub-components instead of growing it
- Do NOT duplicate chat list logic — reuse from `chats/`
