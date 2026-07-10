/**
 * Public chat service API for the rest of the app.
 *
 * The concrete backend (ravens today) lives behind `./adapters/index.js`.
 * This file is intentionally thin: each export is a small wrapper that
 * dispatches to the adapter. Backend-agnostic top-level endpoints that
 * don't fit inside the adapter surface yet (question/permission/session
 * files) still live here and will migrate into the adapter interface
 * in a later pass.
 */
import { apiClient } from '@/lib/apiClient'
import { runtimeConfig } from '@/config/runtime'
import { adapter, streamSessionEvents } from './adapters'

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

/**
 * Re-attach to a session's live event stream — used after a page reload
 * when the backend run is still in progress. Runs until aborted.
 */
export function resumeSessionStream({ directory, onEvent, signal }) {
  return streamSessionEvents({ directory, onEvent, signal })
}

export async function getLlmConfig() {
  return adapter.getLlmConfig()
}

export async function updateLlmConfig(config) {
  return adapter.updateLlmConfig(config)
}

// ─── Backend-specific endpoints (TODO: migrate into adapter interface) ─
// These still call the ravens HTTP surface directly. When we split the
// board into its own repo they should move into adapters/ravens.js and
// become part of the adapter contract.

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
