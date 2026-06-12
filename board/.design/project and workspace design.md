# Project And Workspace Design

## Summary

In this product, `project` and `chat` are not the same type of object.

- `Project` is a long-lived workspace around a topic, goal, or body of work.
- `Chat` is a single conversation thread inside that workspace, or a standalone thread when not attached to a project.

This aligns with mainstream AI product patterns such as ChatGPT Projects and Claude Projects, where a project acts as a shared context hub rather than just a folder.

## Core Definitions

### Project

A `project` is a shared context and knowledge workspace.

It can contain:

- Multiple chats
- Project-level files
- Project-level instructions
- Future project-level memory, sources, and reusable knowledge

Its main purpose is to keep long-running work organized and reusable.

### Chat

A `chat` is a single conversation thread.

It can contain:

- Messages
- Chat-level private attachments
- References to project-level resources when the chat belongs to a project

Its main purpose is to carry out one concrete conversation flow within a broader context.

## Resource Ownership Rules

### Project Files

Files uploaded in a `project` belong to that project.

- They are accessible to all chats under that project
- They are reusable project knowledge/resources
- They are not tied to any single message or single chat

### Chat Files

Files uploaded in a `chat` belong only to that chat.

- They are accessible only within that chat
- They act as chat-scoped private context
- They do not automatically become part of the project knowledge base

## Access Rules

When a chat belongs to a project, that chat can access:

- Its own chat files
- The files owned by its parent project

A project can access only its own project files.

Project resources do not inherit chat files in reverse.

## Message Attachment Rule

Messages should reference uploaded files by `attachmentIds`, not send raw files directly in the message API.

Recommended shape:

```json
{
  "content": "Summarize these files",
  "attachmentIds": ["att_1", "att_2"]
}
```

This keeps file resources independent from individual message payloads and supports reuse, preview, and future expansion.

## Product Semantics

This leads to a clear product model:

- `Project` = shared workspace + shared knowledge + reusable context
- `Chat` = one thread inside or outside that workspace
- `Project file` = shared within the project
- `Chat file` = private to the chat

## Why This Model

This model avoids confusion and matches expected user behavior:

- Uploading in a project means adding to the project's shared resources
- Uploading in a chat means adding temporary or private context for that conversation
- Chats can benefit from project knowledge without polluting the project with every chat attachment

## Implementation Direction

Recommended API direction:

1. Upload files first as resources owned by either a `chat` or a `project`
2. Return normalized attachment records with IDs
3. Send messages using `attachmentIds`

This supports the following future capabilities cleanly:

- Project-wide reusable knowledge
- Chat-private attachments
- File previews
- Retrieval and parsing pipelines
- Save to project / add to project workflows

## Entity Model

### Main Entities

#### Project

Suggested fields:

```json
{
  "id": "proj_xxx",
  "name": "Q4 Planning",
  "description": "Optional summary",
  "instructions": "Optional project instructions",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```

#### Chat

Suggested fields:

```json
{
  "id": "chat_xxx",
  "projectId": "proj_xxx",
  "title": "Marketing launch plan",
  "preview": "Last visible preview",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```

Notes:

- `projectId` can be `null` for standalone chats
- A chat belongs to at most one project

#### Attachment

Suggested fields:

```json
{
  "id": "att_xxx",
  "ownerType": "chat",
  "ownerId": "chat_xxx",
  "name": "SOUL.md",
  "type": "text/markdown",
  "size": 24576,
  "kind": "markdown",
  "status": "ready",
  "storageKey": "chat/chat_xxx/att_xxx-soul.md",
  "url": "https://...",
  "previewUrl": "https://...",
  "createdAt": 1710000000000,
  "updatedAt": 1710000000000
}
```

Rules:

- `ownerType` is either `chat` or `project`
- `ownerId` must match the selected owner type
- `status` can support future async processing such as `uploading`, `processing`, `ready`, `failed`

#### Message

Suggested fields:

```json
{
  "id": "msg_xxx",
  "chatId": "chat_xxx",
  "role": "user",
  "content": "Summarize these files",
  "attachmentIds": ["att_1", "att_2"],
  "createdAt": 1710000000000
}
```

Notes:

- The message stores attachment references, not raw files
- API responses may expand attachments for frontend rendering convenience

## Relationship Rules

```text
Project
  -> has many Chats
  -> has many Attachments where ownerType = project

Chat
  -> belongs to zero or one Project
  -> has many Messages
  -> has many Attachments where ownerType = chat

Message
  -> belongs to one Chat
  -> references zero or many Attachments
```

### Access Resolution

When resolving files available to a chat:

```text
availableAttachments(chat) =
  chatOwnedAttachments(chat.id)
  + projectOwnedAttachments(chat.projectId)
```

If `chat.projectId` is `null`, the available set is only the chat's own attachments.

## Ownership Matrix

| Action | Resulting ownerType | Resulting ownerId | Visibility |
|---|---|---|---|
| Upload in chat | `chat` | current `chat.id` | current chat only |
| Upload in project | `project` | current `project.id` | all chats in project |
| Send message with chat file | unchanged | unchanged | current chat only |
| Send message with project file | unchanged | unchanged | any chat in that project |

## API Design

The recommended design is resource-first upload, then message send by reference.

### Upload Chat Attachment

`POST /chats/:chatId/attachments`

Request:

- `multipart/form-data`
- field: `file`

Response:

```json
{
  "id": "att_xxx",
  "ownerType": "chat",
  "ownerId": "chat_xxx",
  "name": "SOUL.md",
  "type": "text/markdown",
  "size": 24576,
  "kind": "markdown",
  "status": "ready",
  "url": "https://...",
  "previewUrl": null
}
```

### Upload Project Attachment

`POST /projects/:projectId/attachments`

Request:

- `multipart/form-data`
- field: `file`

Response follows the same normalized attachment shape with `ownerType = project`.

### List Chat Attachments

`GET /chats/:chatId/attachments`

Returns chat-owned attachments only.

### List Project Attachments

`GET /projects/:projectId/attachments`

Returns project-owned attachments only.

### Send Chat Message

`POST /chats/:chatId/messages`

Request:

```json
{
  "content": "Summarize these files",
  "attachmentIds": ["att_1", "att_2"]
}
```

Validation rules:

- Every `attachmentId` must be visible to that chat
- A chat may reference:
  - chat-owned attachments belonging to itself
  - project-owned attachments belonging to its parent project
- A chat may not reference attachments from another chat or another project

### Send Message Response

Recommended response shape:

```json
{
  "id": "chat_xxx",
  "messages": [
    {
      "id": "msg_user_1",
      "role": "user",
      "content": "Summarize these files",
      "attachments": [
        {
          "id": "att_1",
          "name": "SOUL.md",
          "type": "text/markdown",
          "size": 24576,
          "kind": "markdown",
          "ownerType": "chat",
          "ownerId": "chat_xxx",
          "url": "https://..."
        }
      ]
    }
  ]
}
```

This keeps the request small while keeping the UI response render-ready.

## Frontend State Model

### Composer State

The chat composer should treat local files and uploaded attachments as separate states.

Suggested shape:

```ts
type ComposerAttachmentDraft = {
  localId: string
  file: File
  status: 'queued' | 'uploading' | 'uploaded' | 'failed'
  progress: number
  uploadedAttachment: Attachment | null
  error: string | null
}
```

This is better than storing only raw `File[]`, because the UI needs upload progress, retry state, and the final `attachmentId`.

### Recommended Send Flow

```text
1. User selects files in chat composer
2. Frontend creates local draft items
3. On send:
   - upload any queued or failed files first
   - collect returned attachment IDs
   - call POST /chats/:chatId/messages with content + attachmentIds
4. On success:
   - clear composer drafts
   - render returned message attachments
```

### Project Upload Flow

```text
1. User uploads file in project page
2. Frontend calls POST /projects/:projectId/attachments
3. Returned attachment becomes part of project resources
4. Chats under that project can reference it later
```

### Chat Upload Flow

```text
1. User uploads file in chat page
2. Frontend calls POST /chats/:chatId/attachments
3. Returned attachment is private to that chat
4. It can be attached to current or future messages in the same chat
```

## UI Rules

### In Chat Page

The chat page should eventually expose two resource groups when the chat belongs to a project:

- `This chat`
- `Project files`

This makes file origin and visibility obvious.

### Attachment Cards

Attachment cards should render from normalized attachment records, not from ad hoc local file assumptions.

Important UI differences:

- Local draft attachment: shows upload progress or failure state
- Uploaded attachment: shows final metadata and preview support
- Project attachment: may show project origin badge later if needed

## Permission Rules

Even if the first implementation uses mock data or a lightweight backend, the contract should preserve these checks:

1. A chat attachment upload must target an existing chat
2. A project attachment upload must target an existing project
3. A sent message can only reference attachments visible to that chat
4. A project cannot automatically absorb chat files
5. Moving a chat into a project does not automatically convert its existing chat files into project files

## Future Extensions

This model cleanly supports later features without changing the core contract:

- Save chat attachment to project as an explicit action
- Project-level file library
- Retrieval and indexing pipeline
- Parsing states for PDF, CSV, images, and docs
- File citations in assistant responses
- Sharing and permissions at project level

## Implementation Notes For This Repo

Based on the current frontend structure:

- `chat.projectId` already exists and is the correct bridge between chat and project scope
- `message.attachments` is already present in the UI model and can remain the render-ready response shape
- `sendMessage(content, attachments)` should evolve into `sendMessage(content, attachmentIds)` internally after upload abstraction is introduced
- The current composer `attachments` state should evolve from `File[]` into richer draft attachment objects when real upload begins

## Final Product Definition

Use this as the working product definition:

> A project is a shared workspace and knowledge scope.
> A chat is a single conversation thread within or outside that scope.
> Project files are shared across chats in the same project.
> Chat files remain private to their own chat.
