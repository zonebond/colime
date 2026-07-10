/**
 * Ravens backend adapter.
 *
 * This module owns everything specific to how the ravens backend
 * represents sessions, messages, streaming, and providers. Any other
 * adapter (e.g. a future pi-agent) would live alongside this one and
 * implement the same shape.
 *
 * The rest of the chats feature module goes through the adapter object
 * exported here and does not care which backend answered.
 */
import { apiClient } from '@/lib/apiClient'
import { streamEvents } from '@/lib/sseClient'
import { runtimeConfig } from '@/config/runtime'
import {
  finalizeStaleMessage,
  normalizeChat,
  normalizeMessage,
  toPromptPayload,
} from '../normalize'

/**
 * Fetch messages for a session from ravens.
 * GET /session/:id/message → Array<{ info: Message, parts: Part[] }>
 */
async function fetchMessages(chatId, directory) {
  const response = await apiClient.get(`/session/${chatId}/message`)
  const items = Array.isArray(response) ? response : response?.items ?? []
  return items.map((item, i) => normalizeMessage(item, i, directory))
}

/**
 * Connect to ravens SSE event stream for a directory.
 * Reconnects automatically on dropped connections; runs until aborted.
 *
 * @param {object} opts
 * @param {string} opts.directory - Session directory for instance routing
 * @param {(event: {event: string, data: object}) => void} opts.onEvent
 * @param {AbortSignal} opts.signal - Abort to disconnect
 */
export function streamSessionEvents({ directory, onEvent, signal }) {
  const baseUrl = runtimeConfig.apiBaseUrl
  const url = `${baseUrl}/event?directory=${encodeURIComponent(directory)}`
  return streamEvents({ url, onEvent, signal })
}

export const ravensAdapter = {
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
      // Ask the backend whether this session is actually still running.
      // After a page reload this decides between resuming live updates
      // (busy) and settling stale in-progress states (idle).
      let busy = false
      try {
        const statusMap = await apiClient.get('/session/status', { signal })
        const statusType = statusMap?.[chatId]?.type
        busy = statusType === 'busy' || statusType === 'retry'
      } catch (_) {
        // status endpoint unavailable — treat as idle
      }
      chat.isResponding = busy

      try {
        chat.messages = await fetchMessages(chatId, chat._directory)
        // Fix up orphaned in-progress states — but only when the session
        // is NOT running. A busy session keeps its loading states and the
        // caller resumes the SSE stream to receive live updates.
        if (chat.messages && !busy) {
          chat.messages = chat.messages.map(finalizeStaleMessage)
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
    // The stream stays open until the session reports a terminal status
    // (idle/error) after the POST settles, with a hard cap as a safety
    // net so a missed event can't leak the connection.
    const SSE_FLUSH_DELAY = 500
    const SSE_LINGER_MAX = 60_000

    const sseController = new AbortController()
    let postSettled = false
    let sawTerminalStatus = false
    let lingerTimer = null

    const closeStream = (delay) => {
      clearTimeout(lingerTimer)
      lingerTimer = setTimeout(() => sseController.abort(), delay)
    }

    if (input.directory && input.onEvent) {
      streamSessionEvents({
        directory: input.directory,
        onEvent: (event) => {
          input.onEvent(event)
          const { type, properties } = event.data ?? {}
          if (type === 'session.status' && properties?.sessionID === chatId) {
            const statusType = properties.status?.type
            if (statusType === 'idle' || statusType === 'error') {
              sawTerminalStatus = true
              if (postSettled) closeStream(SSE_FLUSH_DELAY)
            }
          }
        },
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
      postSettled = true
      closeStream(sawTerminalStatus ? SSE_FLUSH_DELAY : SSE_LINGER_MAX)
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
