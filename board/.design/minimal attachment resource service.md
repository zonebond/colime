# Minimal Attachment Resource Service

## Summary

This document defines the minimum backend resource service needed to support real file uploads for the current product.

Current aligned decisions:

- Storage layer uses local MinIO
- MinIO endpoint: `http://127.0.0.1:9000`
- Bucket: `attachments`
- Files uploaded in a `chat` belong only to that chat
- Files uploaded in a `project` belong to that project and are reusable by all chats in that project
- Messages should reference uploaded files by `attachmentIds`

## Goal

Build the smallest correct backend layer that can:

- Store file binaries in MinIO
- Create attachment resource records
- Preserve resource ownership by `chat` or `project`
- Let messages reference attachment resources by ID

This layer is intentionally minimal and does not yet include knowledge indexing, OCR, RAG, or advanced permissions.

## Minimal Data Model

### Attachments

```ts
{
  id: string
  ownerType: 'chat' | 'project'
  ownerId: string
  name: string
  type: string
  size: number
  bucket: string
  objectKey: string
  status: 'ready' | 'failed'
  createdAt: number
  updatedAt: number
}
```

### Messages

```ts
{
  id: string
  chatId: string
  role: 'user' | 'assistant'
  content: string
  attachmentIds: string[]
  createdAt: number
}
```

Notes:

- `messages` should store only `attachmentIds`
- API responses may expand attachments into full metadata for frontend rendering

## MinIO Object Key Rules

```text
chat/{chatId}/{attachmentId}-{filename}
project/{projectId}/{attachmentId}-{filename}
```

Examples:

```text
chat/chat_123/att_001-SOUL.md
project/proj_123/att_002-report.pdf
```

## Minimal API List

### 1. Upload chat attachment

`POST /chats/:chatId/attachments`

Request:

- `multipart/form-data`
- field: `file`

Responsibilities:

1. Validate `chatId`
2. Generate `attachmentId`
3. Upload file to MinIO
4. Create attachment record with:
   - `ownerType = chat`
   - `ownerId = chatId`
5. Return normalized attachment metadata

### 2. Upload project attachment

`POST /projects/:projectId/attachments`

Request:

- `multipart/form-data`
- field: `file`

Responsibilities:

1. Validate `projectId`
2. Generate `attachmentId`
3. Upload file to MinIO
4. Create attachment record with:
   - `ownerType = project`
   - `ownerId = projectId`
5. Return normalized attachment metadata

### 3. List chat attachments

`GET /chats/:chatId/attachments`

Returns:

- attachments owned by the current chat only

### 4. List project attachments

`GET /projects/:projectId/attachments`

Returns:

- attachments owned by the current project only

### 5. Send chat message

`POST /chats/:chatId/messages`

Request:

```json
{
  "content": "Summarize these files",
  "attachmentIds": ["att_1", "att_2"]
}
```

Validation rules:

- every `attachmentId` must be visible to that chat
- a chat may reference:
  - its own chat-owned attachments
  - project-owned attachments from its parent project
- a chat may not reference attachments from another chat or another project

## Access Rules

For a chat that belongs to a project:

```text
visible attachments =
  chat-owned attachments of current chat
  + project-owned attachments of current project
```

For a standalone chat:

```text
visible attachments = chat-owned attachments only
```

## Minimal Attachment Response

```json
{
  "id": "att_xxx",
  "ownerType": "chat",
  "ownerId": "chat_xxx",
  "name": "SOUL.md",
  "type": "text/markdown",
  "size": 24576,
  "bucket": "attachments",
  "objectKey": "chat/chat_xxx/att_xxx-SOUL.md",
  "status": "ready"
}
```

## Minimal Message Response

```json
{
  "id": "msg_xxx",
  "role": "user",
  "content": "Summarize these files",
  "attachments": [
    {
      "id": "att_xxx",
      "name": "SOUL.md",
      "type": "text/markdown",
      "size": 24576,
      "ownerType": "chat",
      "ownerId": "chat_xxx"
    }
  ]
}
```

## Frontend Request Order

### Chat upload and send

```text
1. User selects files in chat composer
2. Frontend uploads each file through POST /chats/:chatId/attachments
3. Frontend receives attachment records
4. Frontend sends POST /chats/:chatId/messages with content + attachmentIds
5. Frontend renders returned message attachments
```

### Project upload

```text
1. User uploads file in project page
2. Frontend calls POST /projects/:projectId/attachments
3. Returned attachment becomes part of project shared resources
4. Chats under that project can reference it later
```

## Not Included Yet

This minimum service does not include:

- OCR
- document parsing pipelines
- chunking and embeddings
- RAG or retrieval indexing
- file versioning
- advanced sharing and permission models
- cross-project reuse

## Implementation Priority

1. Create `attachments` table
2. Implement `POST /chats/:chatId/attachments`
3. Implement `POST /projects/:projectId/attachments`
4. Implement `POST /chats/:chatId/messages` with attachment visibility validation
5. Update frontend upload flow from raw `File[]` sending to upload-first, message-second

## Final Principle

Keep storage and business semantics separate:

- MinIO stores file binaries
- the backend resource service manages ownership, visibility, and attachment IDs
- messages reference resources, not raw files
