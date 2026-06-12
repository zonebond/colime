/**
 * normalize.js — Ravens ↔ Board data model mapping
 *
 * Ravens Session.Info       → board chat object
 * Ravens {info, parts}[]    → board messages[]
 * Ravens Part               → board contentBlock
 */

// ─── Helpers ──────────────────────────────────────────────────────────

function ts(value) {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return Date.now()
}

// ─── Session → Chat ───────────────────────────────────────────────────

/**
 * Map ravens Session.Info to board chat object.
 *
 * Ravens Session shape (from SDK types.gen.ts):
 *   { id, projectID, directory, parentID?, summary?, share?,
 *     title, version, time: { created, updated, compacting? }, revert? }
 */
export function normalizeChat(session) {
  if (!session) return null

  return {
    id: session.id,
    title: session.title ?? '',
    // Preview is persisted by the backend after the first assistant response completes.
    // During SSE streaming, chats.hooks.js updates preview from live deltas.
    preview: session.preview ?? '',
    messages: [],
    lastActiveAt: ts(session.time?.updated ?? session.time?.created),
    isPinned: session.pinned ?? false,
    isArchived: session.time?.archived != null,
    isResponding: false,
    // Group label — stored in session.labelId (label system)
    groupPath: session.labelId ?? null,
    labelName: session.labelName ?? null,
    // Project ID — use labelId for grouping
    projectId: session.labelId ?? null,
    // No run concept in ravens — always null
    activeRunId: null,
    // Keep raw fields for internal use
    _directory: session.directory,
    _projectID: session.projectID,
    _agent: session.agent ? session.agent.replace(/\s+/g, '').trim() : null,
    _model: session.model ?? null,
    // Revert state — marks messages >= revert.messageID as reverted (hidden)
    _revert: session.revert ?? null,
    // Parent session ID — set when this is a subtask child session
    _parentID: session.parentID ?? null,
  }
}

// ─── Message → Board Message ──────────────────────────────────────────

const ROLE_MAP = { user: 'user', assistant: 'assistant' }

/**
 * Map a single ravens { info, parts } to board message object.
 */
export function normalizeMessage({ info, parts }, index = 0, directory = null) {
  const role = ROLE_MAP[info.role] ?? info.role
  const isAssistant = role === 'assistant'
  const isError = info.error != null || info.finish === 'error'
  const isLoading = !isError && info.finish == null && isAssistant

  const contentBlocks = isAssistant ? buildContentBlocks(parts, directory) : []

  // UserMessage has model at info.model.{providerID,modelID}
  // AssistantMessage has model at info.{providerID,modelID}
  const modelProviderID = info.model?.providerID ?? info.providerID ?? null
  const modelModelID = info.model?.modelID ?? info.modelID ?? null

  return {
    id: info.id,
    role,
    content: extractText(parts),
    model: modelModelID,
    status: isLoading ? 'loading' : (isError ? 'error' : 'done'),
    error: info.error ?? null,
    errorCode: info.error?.name ?? null,
    contentBlocks,
    stopReason: info.finish ?? null,
    attachments: extractAttachments(parts),
    createdAt: ts(info.time?.created ?? Date.now() + index),
    completedAt: info.time?.completed ?? null,
    // Agent / model info for footer display
    agent: info.agent ?? null,
    providerID: modelProviderID,
    // Internal fields for delta tracking
    _directory: directory,
    _parts: parts,
    _tokens: info.tokens ?? null,
    _parentID: info.parentID ?? null,
    // Inline references for text highlighting
    _references: extractReferences(parts),
    // User message summary — title, body, diffs for nav rail display
    summary: info.summary ?? null,
  }
}

// ─── Parts → Content Blocks ───────────────────────────────────────────

function buildContentBlocks(parts, directory = null) {
  if (!Array.isArray(parts)) return []

  const blocks = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    switch (p.type) {
      case 'text':
        blocks.push({
          id: p.id ?? `block-${i}`,
          type: 'text',
          content: p.text ?? '',
          state: 'done',
        })
        break
      case 'reasoning':
        blocks.push({
          id: p.id ?? `block-${i}`,
          type: 'reasoning',
          content: p.text ?? '',
          state: p.time?.end ? 'done' : 'active',
        })
        break
      case 'tool': {
        const isQuestion = p.tool === 'question'
        const isPending = p.state?.status === 'pending' || p.state?.status === 'running'

        const block = {
          id: p.id ?? `block-${i}`,
          type: 'tool_result',
          content: p.state?.output ?? '',
          state: isQuestion && isPending ? 'confirm_required'
               : p.state?.status === 'completed' ? 'done'
               : p.state?.status === 'error' ? 'error'
               : p.state?.status === 'running' ? 'active'
               : p.state?.status === 'pending' ? 'loading'
               : 'done',
          toolName: p.tool ?? null,
          toolId: p.id ?? `block-${i}`,
          toolInput: p.state?.input ?? null,
          toolOutput: p.state?.output ?? null,
          toolMetadata: p.state?.metadata ?? null,
          toolResult: p.state?.status === 'completed' ? (p.state?.output ?? '') : (p.state?.error ?? ''),
          durationMs: (p.state?.time?.end && p.state?.time?.start)
            ? p.state.time.end - p.state.time.start
            : null,
          progress: p.state?.progress ?? null,
          callID: p.callID ?? null,
          _directory: directory,
        }

        if (isQuestion && isPending) {
          const input = p.state?.input
          const questions = Array.isArray(input?.questions) ? input.questions : []
          block.questionMeta = {
            questions,
            callID: p.callID ?? null,
          }
        }

        blocks.push(block)
        break
      }
      case 'file':
        blocks.push({
          id: p.id ?? `block-${i}`,
          type: 'file',
          content: p.filename ?? '',
          fileName: p.filename ?? null,
          url: p.url ?? null,
          state: 'done',
          _directory: directory,
        })
        break
      case 'compaction':
        blocks.push({
          id: p.id ?? `block-${i}`,
          type: 'compaction',
          state: 'done',
        })
        break
      // step-start / step-finish / snapshot / patch / agent / retry / subtask
      // — internal signals, no visual block (matching opencode upstream)
      default:
        break
    }
  }

  return blocks
}

// ─── Parts → Text Extract ─────────────────────────────────────────────

function extractText(parts) {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p) => p.type === 'text' && !p.synthetic)
    .map((p) => p.text)
    .join('\n\n')
    .trim()
}

function extractAttachments(parts) {
  if (!Array.isArray(parts)) return []
  return parts
    .filter((p) => p.type === 'file')
    .map((p) => ({
      id: p.id,
      name: p.filename ?? '',
      type: p.mime ?? 'application/octet-stream',
      size: p.size ?? 0,
      url: p.url ?? null,
    }))
}

function extractReferences(parts) {
  if (!Array.isArray(parts)) return []
  const refs = []
  for (const p of parts) {
    const source = p.source
    if (!source?.text) continue
    if (p.type === 'file') {
      refs.push({ _type: 'file', start: source.text.start, end: source.text.end, name: p.filename })
    } else if (p.type === 'agent') {
      refs.push({ _type: 'agent', start: source.text.start, end: source.text.end, name: p.name })
    }
  }
  return refs.sort((a, b) => a.start - b.start)
}

// ─── Chat → Session Create Payload ───────────────────────────────────

/**
 * Build ravens session create payload from board input.
 * directory is computed by the service layer (session-directory-mapping).
 */
export function toSessionCreate({ title, directory, model, agent }) {
  const body = {}
  if (title) body.title = title
  if (model) body.model = model
  if (agent) body.agent = agent
  if (directory) body.directory = directory
  return body
}

// ─── Chat → Session Update Payload ───────────────────────────────────

export function toSessionUpdate({ title, archived, groupPath }) {
  const payload = {}
  if (title !== undefined) payload.title = title
  if (archived !== undefined) payload.time = { ...payload.time, archived: archived ? Date.now() : null }
  if (groupPath !== undefined) payload.path = groupPath || null
  return payload
}

// ─── Chat → Prompt Payload ────────────────────────────────────────────

/**
 * Build ravens prompt payload from board user input.
 * Open endpoint: POST /session/:id/message
 * Body: SessionPrompt.PromptInput — { prompt: Part[] }
 */
export function toPromptPayload({ content, attachments, agentId, model }) {
  const parts = []

  if (content?.trim()) {
    parts.push({ type: 'text', text: content.trim() })
  }

  if (Array.isArray(attachments)) {
    for (const att of attachments) {
      parts.push({
        type: 'file',
        filename: att.name,
        mime: att.type ?? 'application/octet-stream',
        url: att.url,
        size: att.size,
      })
    }
  }

  const payload = { parts }

  if (model?.providerID || model?.modelID) {
    payload.model = {}
    if (model.providerID) payload.model.providerID = model.providerID
    if (model.modelID) payload.model.modelID = model.modelID
  }

  if (agentId) {
    payload.agent = agentId
  }

  return payload
}

// ─── Parts Delta ──────────────────────────────────────────────────────

/**
 * Recompute derived fields from a message's internal _parts array.
 * Returns a new message object (immutable).
 */
export function recomputeMessage(message) {
  const parts = message._parts || []
  return {
    ...message,
    content: extractText(parts),
    contentBlocks: buildContentBlocks(parts, message._directory),
  }
}

/**
 * Apply a part update to an existing board message (in-place).
 * Used for real-time SSE event handling.
 * Returns true if the message was modified.
 */
export function applyPartDelta(message, part) {
  if (!message || !part) return false

  // Create a new parts array so React detects the change
  const parts = message._parts || []
  const idx = parts.findIndex((p) => p.id === part.id)
  const nextParts = idx >= 0
    ? [...parts.slice(0, idx), part, ...parts.slice(idx + 1)]
    : [...parts, part]
  message._parts = nextParts

  // Recompute derived fields
  Object.assign(message, recomputeMessage(message))

  // Update status based on message info
  const isAssistant = message.role === 'assistant'
  if (isAssistant && part.type === 'tool' && part.state?.status === 'error') {
    message.status = 'error'
  }

  return true
}

/**
 * Apply an incremental text delta to a specific part within a message.
 * Creates a new message object (immutable).
 */
export function applyPartTextDelta(message, partID, delta) {
  if (!message || !partID || !delta) return message

  const parts = message._parts || []
  const idx = parts.findIndex((p) => p.id === partID)
  if (idx === -1) return message

  const nextParts = [...parts]
  nextParts[idx] = { ...nextParts[idx], text: (nextParts[idx].text || '') + delta }

  return recomputeMessage({ ...message, _parts: nextParts })
}

/**
 * Finalize a loading message (called when agent finishes).
 */
export function finalizeMessage(message, info) {
  if (!message) return message
  const isAssistant = message.role === 'assistant'
  if (!isAssistant) return message

  const isError = info?.error != null || info?.finish === 'error'

  return {
    ...message,
    status: isError ? 'error' : 'done',
    error: info?.error ?? null,
    errorCode: info?.error?.name ?? null,
    stopReason: info?.finish ?? null,
    _tokens: info?.tokens ?? null,
  }
}
