import { apiClient } from '@/lib/apiClient'
import { runtimeConfig } from '@/config/runtime'
import {
  normalizeChat,
  normalizeMessage,
  toPromptPayload,
} from './normalize'

// ─── Ravens API helpers ─────────────────────────────────────────────

/**
 * Fetch messages for a session from ravens.
 * GET /session/:id/message → Array<{ info: Message, parts: Part[] }>
 */
async function fetchMessages(chatId, directory) {
  const response = await apiClient.get(`/session/${chatId}/message`)
  const items = Array.isArray(response) ? response : response?.items ?? []
  return items.map((item, i) => normalizeMessage(item, i, directory))
}

// ─── SSE Streaming ────────────────────────────────────────────────────

/**
 * Connect to ravens SSE event stream for a directory.
 * Parses SSE events and calls onEvent for each. Runs until aborted.
 *
 * @param {object} opts
 * @param {string} opts.directory - Session directory for instance routing
 * @param {(event: {event: string, data: object}) => void} opts.onEvent
 * @param {AbortSignal} opts.signal - Abort to disconnect
 */
async function streamSessionEvents({ directory, onEvent, signal }) {
  const baseUrl = runtimeConfig.apiBaseUrl
  const url = `${baseUrl}/event?directory=${encodeURIComponent(directory)}`

  try {
    const response = await fetch(url, {
      signal,
      headers: { Accept: 'text/event-stream' },
    })

    if (!response.ok) {
      console.error('SSE connection failed:', response.status)
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()

      let data = ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          data = line.slice(6)
        } else if (line === '' && data) {
          try {
            const parsed = JSON.parse(data)
            onEvent({ event: 'message', data: parsed })
          } catch (_) {
            // skip malformed events
          }
          data = ''
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('SSE stream error:', err)
    }
  }
}

// ─── Adapter (Ravens) ───────────────────────────────────────────────

const adapter = {
  // ── Session list ──────────────────────────────────────────────────
  async listChats() {
    const response = await apiClient.get('/session')
    const items = Array.isArray(response) ? response : response?.items ?? []
    return items.map(normalizeChat)
  },

  // ── Session detail ─────────────────────────────────────────────────
  async getChatById(chatId, options = {}) {
    const { signal } = options
    const response = await apiClient.get(`/session/${chatId}`, { signal })
    const chat = normalizeChat(response)

    // Load messages from ravens
    if (chat) {
      try {
        chat.messages = await fetchMessages(chatId, chat._directory)
        // Fix up orphaned loading messages — if loaded from history
        // (not actively streaming), finish:null messages should not
        // appear as perpetually "loading".
        if (chat.messages) {
          chat.messages = chat.messages.map((msg) => {
            if (msg.role === 'assistant' && msg.status === 'loading') {
              return { ...msg, status: 'done' }
            }
            return msg
          })
        }
        // Filter out reverted messages — the backend marks a revert point
        // on the session; messages with id >= revert.messageID are hidden
        // from view (matching ravens TUI behavior).
        if (chat._revert?.messageID && chat.messages) {
          chat.messages = chat.messages.filter(
            (msg) => msg.id < chat._revert.messageID
          )
        }
      } catch (_) {
        // session may have no messages yet
      }
    }

    return chat
  },

  // ── Create session ─────────────────────────────────────────────────
  async createChat(input = {}) {
    const body = {}
    if (input.title) body.title = input.title
    if (input.parentID != null) body.parentID = input.parentID
    if (input.labelId) body.labelId = input.labelId
    const response = await apiClient.post('/session', body)
    return normalizeChat(response)
  },

  // ── Send message ───────────────────────────────────────────────────
  async sendChatMessage(chatId, input = {}) {
    const payload = toPromptPayload({
      content: input.content,
      attachments: input.attachments,
      agentId: input.agentId,
      model: input.model,
    })

    // Start SSE stream for real-time events during prompt execution.
    // Fire-and-forget — runs in background until aborted.
    const sseController = new AbortController()
    if (input.directory && input.onEvent) {
      streamSessionEvents({
        directory: input.directory,
        onEvent: input.onEvent,
        signal: sseController.signal,
      })
    }

    const abortController = new AbortController()
    input.onAbortController?.(abortController)

    try {
      const response = await apiClient.post(`/session/${chatId}/message`, payload, {
        signal: abortController.signal,
      })
      // response is { info: Message, parts: Part[] }
      const message = normalizeMessage(response)
      return message
    } finally {
      // Keep SSE alive briefly so late events (session.status idle) are delivered
      setTimeout(() => sseController.abort(), 2000)
    }
  },

  // ── Stop / abort ───────────────────────────────────────────────────
  async stopChatResponse(chatId) {
    await apiClient.post(`/session/${chatId}/abort`)
    return true
  },

  // ── Tool confirmation ──────────────────────────────────────────────
  async confirmToolCall(chatId, toolCallId, action, modifiedInput) {
    const body = { response: action }
    if (modifiedInput) body.modifiedInput = modifiedInput

    // ravens: POST /session/:id/permissions/:permissionID
    await apiClient.post(`/session/${chatId}/permissions/${toolCallId}`, body)
    return true
  },

  // ── Revert ─────────────────────────────────────────────────────────
  async revertConversation(chatId, messageId) {
    const response = await apiClient.post(`/session/${chatId}/revert`, { messageID: messageId })
    return response
  },

  // ── Update operations ──────────────────────────────────────────────
  async renameChat(chatId, title) {
    const response = await apiClient.patch(`/session/${chatId}`, { title })
    return normalizeChat(response)
  },

  async archiveChat(chatId) {
    const response = await apiClient.patch(`/session/${chatId}`, {
      time: { archived: Date.now() },
    })
    return normalizeChat(response)
  },

  async toggleChatPin(chatId) {
    const session = await apiClient.get(`/session/${chatId}`)
    await apiClient.patch(`/session/${chatId}`, { pinned: !(session.pinned ?? false) })
    return null
  },

  async touchChat(chatId) {
    const response = await apiClient.get(`/session/${chatId}`)
    return normalizeChat(response)
  },

  // ── Delete operations ──────────────────────────────────────────────
  async deleteChat(chatId) {
    await apiClient.delete(`/session/${chatId}`)
    return true
  },

  async deleteChats(chatIds) {
    for (const id of chatIds) {
      await apiClient.delete(`/session/${id}`)
    }
    return true
  },

  // ── Group (project) operations ─────────────────────────────────────
  async moveChatsToProject(chatIds, labelId) {
    for (const id of chatIds) {
      await apiClient.patch(`/session/${id}`, { labelId: labelId || null })
    }
    return true
  },

  // ── LLM config ─────────────────────────────────────────────────────
  async getLlmConfig() {
    const response = await apiClient.get('/provider')
    // Ravens returns {all: [...]}
    const providers = Array.isArray(response) ? response : response?.all ?? []
    const active = providers.find((p) => p.connected) ?? providers[0]
    // models is Record<string, Model> — get first entry
    const firstModel = active?.models
      ? (Array.isArray(active.models) ? active.models[0] : Object.values(active.models)[0])
      : null
    return {
      runtimeDefaultProvider: active?.id ?? null,
      runtimeDefaultModel: firstModel?.id ?? null,
      memoryRecallModel: null,
      sessionMemoryExtractionModel: null,
    }
  },

  async updateLlmConfig(_config) {
    return { success: true }
  },

  async completeChatResponse(chatId) {
    return this.getChatById(chatId)
  },

  async getChatMessages(chatId) {
    const chat = await this.getChatById(chatId)
    return { messages: chat?.messages ?? [], hasMore: false, cursor: null }
  },

  // ── Provider ───────────────────────────────────────────────────────
  async updateSessionProvider(chatId, { providerId, modelId }) {
    await apiClient.patch(`/session/${chatId}`, {
      model: { providerID: providerId, modelID: modelId },
    })
    return { success: true, providerId, modelId }
  },

  async getSessionProvider(chatId) {
    const response = await apiClient.get(`/session/${chatId}`)
    return {
      providerId: response?.model?.providerID ?? null,
      modelId: response?.model?.id ?? response?.model?.modelID ?? null,
    }
  },
}

// ─── Public API ───────────────────────────────────────────────────────

export { normalizeChat, normalizeMessage } from './normalize'

export async function listChats() {
  return adapter.listChats()
}

export async function getChatById(chatId, options = {}) {
  return adapter.getChatById(chatId, options)
}

export async function getChatMessages(chatId) {
  if (adapter.getChatMessages) return adapter.getChatMessages(chatId)
  const chat = await adapter.getChatById(chatId)
  return { messages: chat?.messages ?? [], hasMore: false, cursor: null }
}

export async function createChat(input = {}) {
  return adapter.createChat(input)
}

export async function sendChatMessage(chatId, input = {}) {
  return adapter.sendChatMessage(chatId, input)
}

export async function completeChatResponse(chatId) {
  return adapter.completeChatResponse(chatId)
}

export async function stopChatMessage(chatId, runId = null) {
  return adapter.stopChatResponse(chatId, runId)
}

export async function confirmToolCall(chatId, toolCallId, action, modifiedInput, runId) {
  return adapter.confirmToolCall(chatId, toolCallId, action, modifiedInput, runId)
}

export async function touchChat(chatId) {
  return adapter.touchChat(chatId)
}

export async function toggleChatPin(chatId) {
  return adapter.toggleChatPin(chatId)
}

export async function archiveChat(chatId) {
  return adapter.archiveChat(chatId)
}

export async function renameChat(chatId, title) {
  return adapter.renameChat(chatId, title)
}

export async function deleteChat(chatId) {
  return adapter.deleteChat(chatId)
}

export async function deleteChats(chatIds) {
  return adapter.deleteChats(chatIds)
}

export async function moveChatsToProject(chatIds, projectId) {
  return adapter.moveChatsToProject(chatIds, projectId)
}

export async function editChatMessage(_chatId, _messageId, _newContent) {
  // Editing messages is not supported by ravens — messages are immutable
  return null
}

export async function uploadChatAttachment(_chatId, fileBlob, { onProgress } = {}) {
  // Ravens has no dedicated file upload — return local blob reference
  if (onProgress) onProgress(100)
  return {
    id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: fileBlob?.name ?? 'file',
    type: fileBlob?.type ?? 'application/octet-stream',
    size: fileBlob?.size ?? 0,
    url: fileBlob ? URL.createObjectURL(fileBlob) : null,
  }
}

export async function revertConversation(chatId, messageId, mode = 'conversation_and_code') {
  return adapter.revertConversation(chatId, messageId, mode)
}

export async function updateSessionProvider(chatId, { providerId, modelId }) {
  return adapter.updateSessionProvider(chatId, { providerId, modelId })
}

export async function getSessionProvider(chatId) {
  return adapter.getSessionProvider(chatId)
}

export async function listQuestions() {
  const response = await apiClient.get('/question')
  return Array.isArray(response) ? response : response?.items ?? []
}

export async function replyQuestion(requestID, answers) {
  await apiClient.post(`/question/${requestID}/reply`, { answers })
  return true
}

export async function rejectQuestion(requestID) {
  await apiClient.post(`/question/${requestID}/reject`)
  return true
}

export async function listPermissions() {
  const response = await apiClient.get('/permission')
  return Array.isArray(response) ? response : response?.items ?? []
}

export async function replyPermission(requestID, reply, message) {
  const body = { reply }
  if (message) body.message = message
  await apiClient.post(`/permission/${requestID}/reply`, body)
  return true
}

export async function rejectPermission(requestID) {
  await apiClient.post(`/permission/${requestID}/reply`, { reply: 'reject' })
  return true
}

export async function getLlmConfig() {
  return adapter.getLlmConfig()
}

export async function updateLlmConfig(config) {
  return adapter.updateLlmConfig(config)
}

// ─── Session files ────────────────────────────────────────────────────

function extractSessionID(directory) {
  return directory?.split('/sessions/')[1]?.split('/')[0] || ''
}

/**
 * Normalize a file path to be relative to the session directory.
 * - If filePath starts with directory, strip the prefix → relative
 * - If already relative, return as-is
 */
function relativePath(directory, filePath) {
  if (!directory || !filePath) return filePath
  const dir = directory.replace(/\/+$/, '') + '/'
  if (filePath.startsWith(dir)) return filePath.slice(dir.length)
  return filePath
}

/**
 * List files in the session directory.
 * Uses typed SDK via apiClient.
 */
export async function listSessionFiles(directory) {
  const sid = extractSessionID(directory)
  const params = new URLSearchParams({ path: '.', directory })
  if (sid) params.set('sessionID', sid)
  const response = await apiClient.get(`/file?${params.toString()}`)
  return Array.isArray(response) ? response : response?.items ?? []
}

/**
 * Download a session file using raw fetch (binary-safe).
 * Returns a Blob for the caller to handle.
 */
export async function downloadSessionFile(directory, filePath) {
  const sid = extractSessionID(directory)
  const params = new URLSearchParams({ path: relativePath(directory, filePath) })
  if (sid) params.set('sessionID', sid)
  const base = runtimeConfig.apiBaseUrl
  const url = `${base}/file/download?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return res.blob()
}

/**
 * Preview the head of a session file using Range request.
 * Returns { text, truncated } — truncated is true when the response
 * was cut off (server returned 200=full body, or 206 but text reached maxBytes).
 */
export async function previewSessionFile(directory, filePath, maxBytes = 8000) {
  const sid = extractSessionID(directory)
  const params = new URLSearchParams({ path: relativePath(directory, filePath) })
  if (sid) params.set('sessionID', sid)
  const base = runtimeConfig.apiBaseUrl
  const url = `${base}/file/download?${params.toString()}`
  const res = await fetch(url, {
    headers: { Range: `bytes=0-${maxBytes - 1}` },
  })
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`)
  const text = await res.text()
  // Truncate client-side as safety net if server didn't honour Range
  const truncated = res.status !== 206 || text.length >= maxBytes
  return { text: text.slice(0, maxBytes), truncated }
}
