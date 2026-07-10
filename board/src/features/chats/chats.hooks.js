import { useCallback, useEffect, useRef, useState } from 'react'
import { resumeSessionStream, revertConversation } from './chats.service'
import {
  applyPartDelta,
  applyPartTextDelta,
  finalizeMessage,
  normalizeMessage,
} from './normalize'
import {
  archiveChatAndReload,
  createChatAndReturn,
  deleteChatAndReload,
  deleteChatsAndReload,
  loadChat,
  loadChats,
  loadChatMessages,
  moveChatsToProjectAndReload,
  renameChatAndReload,
  sendChatMessageAndLoad,
  toggleChatPinAndReload,
  touchChatAndLoad,
  updateSessionProvider,
} from './chats.actions'

const CHATS_STALE_TIME = 30_000

// ═══════════════════════════════════════════════════════════════════════
// Cache System
// ═══════════════════════════════════════════════════════════════════════

const chatsCache = {
  data: null,
  error: null,
  fetchedAt: 0,
  promise: null,
  listeners: new Set(),
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function createOptimisticId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getChatsSnapshot() {
  const hasNoData = chatsCache.data === null
  return {
    chats: chatsCache.data ?? [],
    loading: hasNoData,
    error: chatsCache.error,
  }
}

function emitChatsSnapshot() {
  const snapshot = getChatsSnapshot()
  chatsCache.listeners.forEach((listener) => listener(snapshot))
}

function subscribeChats(listener) {
  chatsCache.listeners.add(listener)
  return () => chatsCache.listeners.delete(listener)
}

function setChatsData(nextChats) {
  chatsCache.data = mergeChatsWithCache(chatsCache.data ?? [], nextChats)
  chatsCache.error = null
  chatsCache.fetchedAt = Date.now()
  emitChatsSnapshot()
}

function setChatsError(error) {
  chatsCache.error = error
  emitChatsSnapshot()
}

function hasFreshChats() {
  return chatsCache.data !== null && (Date.now() - chatsCache.fetchedAt) < CHATS_STALE_TIME
}

function getCachedChat(chatId) {
  if (!chatId || chatsCache.data === null) return null
  return chatsCache.data.find((chat) => chat.id === chatId) ?? null
}

// ═══════════════════════════════════════════════════════════════════════
// Stable Merge Helpers
// ═══════════════════════════════════════════════════════════════════════

function areContentBlocksEqual(previousBlocks = [], nextBlocks = []) {
  if (previousBlocks === nextBlocks) return true
  if (previousBlocks.length !== nextBlocks.length) return false

  for (let index = 0; index < previousBlocks.length; index += 1) {
    const previousBlock = previousBlocks[index]
    const nextBlock = nextBlocks[index]

    if (
      previousBlock?.id !== nextBlock?.id
      || previousBlock?.type !== nextBlock?.type
      || previousBlock?.content !== nextBlock?.content
      || previousBlock?.state !== nextBlock?.state
      || previousBlock?.durationMs !== nextBlock?.durationMs
      || previousBlock?.toolName !== nextBlock?.toolName
      || previousBlock?.toolInput !== nextBlock?.toolInput
      || previousBlock?.toolResult !== nextBlock?.toolResult
      || previousBlock?.sourceUrl !== nextBlock?.sourceUrl
      || previousBlock?.fileName !== nextBlock?.fileName
      || previousBlock?.alt !== nextBlock?.alt
      || previousBlock?.url !== nextBlock?.url
    ) {
      return false
    }
  }

  return true
}

function areAttachmentsEqual(previousAttachments = [], nextAttachments = []) {
  if (previousAttachments === nextAttachments) return true
  if (previousAttachments.length !== nextAttachments.length) return false

  for (let index = 0; index < previousAttachments.length; index += 1) {
    const previousAttachment = previousAttachments[index]
    const nextAttachment = nextAttachments[index]

    if (
      previousAttachment?.name !== nextAttachment?.name
      || previousAttachment?.type !== nextAttachment?.type
      || previousAttachment?.size !== nextAttachment?.size
      || previousAttachment?.lastModified !== nextAttachment?.lastModified
      || previousAttachment?.url !== nextAttachment?.url
    ) {
      return false
    }
  }

  return true
}

function areMessagesEqual(previousMessage, nextMessage) {
  if (previousMessage === nextMessage) return true
  if (!previousMessage || !nextMessage) return false

  return previousMessage.id === nextMessage.id
    && previousMessage.role === nextMessage.role
    && previousMessage.content === nextMessage.content
    && previousMessage.status === nextMessage.status
    && previousMessage.createdAt === nextMessage.createdAt
    && areAttachmentsEqual(previousMessage.attachments ?? [], nextMessage.attachments ?? [])
    && areContentBlocksEqual(previousMessage.contentBlocks ?? [], nextMessage.contentBlocks ?? [])
}

function mergeStableMessages(previousMessages = [], nextMessages = []) {
  if (previousMessages.length === 0) return nextMessages

  const previousById = new Map(previousMessages.map((message) => [message.id, message]))
  let didChange = previousMessages.length !== nextMessages.length

  const mergedMessages = nextMessages.map((message) => {
    const previousMessage = previousById.get(message.id)

    if (previousMessage && areMessagesEqual(previousMessage, message)) {
      return previousMessage
    }

    // Prefer the cache version when the server snapshot has fewer parts —
    // happens when GET /message is called mid-response before SSE events
    // have fully populated the assistant message.
    if (previousMessage && hasMoreContent(previousMessage, message)) {
      return previousMessage
    }

    didChange = true
    return message
  })

  return didChange ? mergedMessages : previousMessages
}

function hasMoreContent(previousMessage, nextMessage) {
  const prevParts = previousMessage._parts || previousMessage.parts || []
  const nextParts = nextMessage._parts || nextMessage.parts || []
  if (prevParts.length > nextParts.length) return true
  const prevBlocks = previousMessage.contentBlocks || []
  const nextBlocks = nextMessage.contentBlocks || []
  if (prevBlocks.length > nextBlocks.length) return true
  return false
}

function mergeStableChat(previousChat, nextChat) {
  if (!previousChat || !nextChat) return nextChat

  const prevMessages = previousChat.messages ?? []
  const incomingMessages = nextChat.messages ?? []

  // When a chat is actively streaming, the server's GET /message snapshot
  // may be incomplete (taken mid-response). If the cache already has more
  // messages than the server response, keep the cached versions — they've
  // been enriched by SSE events that the server snapshot missed.
  const cacheHasMore = previousChat.isResponding
    && prevMessages.length > 0
    && incomingMessages.length < prevMessages.length

  const nextMessages = cacheHasMore
    ? prevMessages
    : mergeStableMessages(prevMessages, incomingMessages)
  const topLevelUnchanged = previousChat.id === nextChat.id
    && previousChat.title === nextChat.title
    && previousChat.preview === nextChat.preview
    && previousChat.lastActiveAt === nextChat.lastActiveAt
    && previousChat.isPinned === nextChat.isPinned
    && previousChat.isArchived === nextChat.isArchived
    && previousChat.isResponding === nextChat.isResponding
    && previousChat.groupPath === nextChat.groupPath

  // Preserve the cache preview when the server response has an empty or
  // less informative one — normalizeChat sets preview to '' since the
  // ravens summary has no body field. The real preview is populated
  // during SSE streaming from the assistant's response.
  let nextPreview = nextChat.preview
  if (!nextPreview && previousChat.preview) {
    nextPreview = previousChat.preview
  }

  if (topLevelUnchanged && nextPreview === previousChat.preview && nextMessages === previousChat.messages) {
    return previousChat
  }

  // Preserve group/label info from previous chat if the next chat doesn't provide it
  const groupPath = nextChat.groupPath ?? previousChat.groupPath ?? null
  const labelName = nextChat.labelName ?? previousChat.labelName ?? null
  const projectId = nextChat.projectId ?? previousChat.projectId ?? null

  return {
    ...nextChat,
    preview: nextPreview,
    groupPath,
    labelName,
    projectId,
    messages: nextMessages,
  }
}

function mergeChatsWithCache(previousChats = [], nextChats = []) {
  const previousChatById = new Map(previousChats.map((chat) => [chat.id, chat]))
  return nextChats.map((chat) => {
    const prev = previousChatById.get(chat.id)
    if (!prev) return chat
    // Keep detailed messages from cache if the incoming chat has no messages
    const hasMessages = Array.isArray(prev.messages) && prev.messages.length > 0
    const incomingEmpty = !chat.messages || chat.messages.length === 0
    // Preserve cache preview when the server response has an empty one
    // (normalizeChat sets preview to '' since the ravens summary has no body)
    const preview = !chat.preview && prev.preview ? prev.preview : chat.preview
    if (hasMessages && incomingEmpty) {
      return { ...chat, preview, messages: prev.messages }
    }
    return { ...chat, preview }
  })
}

function upsertCachedChat(nextChat) {
  const current = chatsCache.data ?? []
  const existingIndex = current.findIndex((chat) => chat.id === nextChat.id)

  if (existingIndex === -1) {
    setChatsData([nextChat, ...current])
    return nextChat
  }

  const nextChats = [...current]
  nextChats[existingIndex] = mergeStableChat(current[existingIndex], nextChat)
  setChatsData(nextChats)
  return nextChats[existingIndex]
}

function mutateCachedChat(chatId, updater) {
  const current = chatsCache.data ?? []
  const nextChats = current.map((chat) => {
    if (chat.id !== chatId) return chat
    return updater(chat)
  })

  setChatsData(nextChats)
  return nextChats.find((chat) => chat.id === chatId) ?? null
}

function replaceCachedChat(tempId, nextChat) {
  const current = chatsCache.data ?? []
  const nextChats = current.map((chat) => (chat.id === tempId ? mergeStableChat(chat, nextChat) : chat))
  setChatsData(nextChats)
  return nextChats.find((chat) => chat.id === nextChat.id) ?? nextChat
}

// ═══════════════════════════════════════════════════════════════════════
// Optimistic Message Helpers
// ═══════════════════════════════════════════════════════════════════════

function createOptimisticAssistantMessage(id, now, directory = null) {
  return {
    id,
    role: 'assistant',
    content: '',
    status: 'loading',
    contentBlocks: [],
    createdAt: now,
    _parts: [],
    // Session directory — streamed file blocks resolve on-disk paths
    // against it, so it must be present before the final message arrives.
    _directory: directory,
  }
}

function createOptimisticUserMessage(id, content, attachments, now) {
  return {
    id,
    role: 'user',
    content,
    status: 'done',
    attachments,
    createdAt: now,
    contentBlocks: content.trim()
      ? [{ id: `${id}-text`, type: 'text', content: content.trim(), state: 'done' }]
      : [],
    _parts: [],
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Ravens Event Handler
// ═══════════════════════════════════════════════════════════════════════
//
// Ravens SSE events arrive as { event: 'message', data: { type, properties } }
// where type is the Bus event type (e.g. 'message.part.updated')
// and properties is the event payload.

/**
 * Find a message index matching either a real ID or an optimistic temp ID.
 */
function findMessageIndex(messages, messageID, optimisticID) {
  const realIdx = messages.findIndex((m) => m.id === messageID)
  if (realIdx >= 0) return realIdx
  if (optimisticID) {
    return messages.findIndex((m) => m.id === optimisticID)
  }
  return -1
}

/**
 * Apply a ravens SSE event to a chat object. Returns the updated chat.
 *
 * @param {object} chat - The current chat state
 * @param {object} event - The parsed SSE event { event, data }
 * @param {string} optimisticAsstId - Temp ID of the optimistic assistant message
 * @param {string} optimisticUserId - Temp ID of the optimistic user message
 */
function applyOpenCodeEvent(chat, event, optimisticAsstId, optimisticUserId) {
  const { type, properties } = event.data
  if (!type || !properties) return chat

  switch (type) {
    // ── Part updates ──────────────────────────────────────────────
    case 'message.part.updated': {
      const { part } = properties
      const messageID = part?.messageID
      if (!messageID) return chat

      const idx = findMessageIndex(chat.messages, messageID, optimisticAsstId)
      if (idx === -1) return chat

      const nextMessages = [...chat.messages]
      const msg = { ...nextMessages[idx] }
      applyPartDelta(msg, part)
      nextMessages[idx] = msg

      return { ...chat, messages: nextMessages, isResponding: true }
    }

    // ── Text delta (streaming) ────────────────────────────────────
    case 'message.part.delta': {
      const { messageID, partID, delta } = properties
      if (!messageID || !delta) return chat

      const idx = findMessageIndex(chat.messages, messageID, optimisticAsstId)
      if (idx === -1) return chat

      const nextMessages = [...chat.messages]
      nextMessages[idx] = applyPartTextDelta(nextMessages[idx], partID, delta)

      const preview = nextMessages[idx].role === 'assistant' && nextMessages[idx].content
        ? nextMessages[idx].content.slice(0, 200)
        : chat.preview

      return { ...chat, messages: nextMessages, isResponding: true, preview }
    }

    // ── Message metadata update ───────────────────────────────────
    case 'message.updated': {
      const { info } = properties
      if (!info) return chat

      const isAssistant = info.role === 'assistant'
      const isError = info.error != null || info.finish === 'error'
      const isLoading = isAssistant && info.finish == null

      // Try to find existing message
      let existingIdx = chat.messages.findIndex((m) => m.id === info.id)
      if (existingIdx === -1 && isAssistant && optimisticAsstId) {
        existingIdx = chat.messages.findIndex((m) => m.id === optimisticAsstId)
      }
      if (existingIdx === -1 && !isAssistant && optimisticUserId) {
        existingIdx = chat.messages.findIndex((m) => m.id === optimisticUserId)
      }

      const nextMessages = [...chat.messages]

      if (existingIdx >= 0) {
        // Update existing message metadata (preserve parts)
        const existing = nextMessages[existingIdx]
        nextMessages[existingIdx] = {
          ...existing,
          id: info.id, // Replace optimistic ID with real one
          role: info.role,
          model: info.modelID ?? existing.model,
          status: isLoading ? 'loading' : (isError ? 'error' : 'done'),
          error: info.error ?? null,
          errorCode: info.error?.name ?? null,
          stopReason: info.finish ?? null,
          _tokens: info.tokens ?? existing._tokens,
        }
      } else if (!chat.messages.some((m) => m.id === info.id)) {
        // New message — create with empty parts
        nextMessages.push(normalizeMessage({ info, parts: [] }, 0, chat._directory))
      }

      return {
        ...chat,
        messages: nextMessages,
        isResponding: isAssistant && isLoading,
      }
    }

    // ── Permission request ────────────────────────────────────────
    case 'permission.asked': {
      return { ...chat, _pendingPermission: properties }
    }

    case 'permission.replied': {
      return { ...chat, _pendingPermission: null }
    }

    // ── Session status (replaces deprecated session.idle) ─────────
    case 'session.status': {
      const statusType = properties.status?.type
      const statusError = properties.status?.error

      if (statusType === 'busy' || statusType === 'retry') {
        return {
          ...chat,
          isResponding: true,
          _sessionStatus: statusType === 'retry' ? properties.status : null,
        }
      }

      if (statusType === 'error') {
        return {
          ...chat,
          isResponding: false,
          messages: chat.messages.map((msg) => {
            if (msg.role === 'assistant' && msg.status === 'loading') {
              return finalizeMessage(msg, { error: statusError, finish: 'error' })
            }
            return msg
          }),
        }
      }

      if (statusType === 'idle') {
        return {
          ...chat,
          isResponding: false,
          messages: chat.messages.map((msg) => {
            if (msg.role === 'assistant' && msg.status === 'loading') {
              return finalizeMessage(msg, { finish: 'stop' })
            }
            return msg
          }),
        }
      }

      return chat
    }

    // ── Session compacted — messages may have changed ─────────────
    case 'session.compacted':
      // The message list has been pruned. Mark that a reload is desirable.
      // The UI can trigger a refresh to get the new message list.
      return chat

    // ── Session update — chat metadata changed ────────────────────
    case 'session.updated': {
      const { info: sessionInfo } = properties
      if (!sessionInfo) return chat

      return {
        ...chat,
        title: sessionInfo.title ?? chat.title,
        preview: sessionInfo.preview !== undefined ? sessionInfo.preview : chat.preview,
        isArchived: sessionInfo.time?.archived != null,
        groupPath: sessionInfo.path !== undefined ? sessionInfo.path : chat.groupPath,
        lastActiveAt: sessionInfo.time?.updated
          ? (typeof sessionInfo.time.updated === 'number' ? sessionInfo.time.updated : Date.now())
          : chat.lastActiveAt,
        _revert: 'revert' in sessionInfo ? (sessionInfo.revert ?? null) : chat._revert,
      }
    }

    default:
      return chat
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Mutation Queue
// ═══════════════════════════════════════════════════════════════════════

const mutationQueue = {
  pending: [],
  running: false,
}

async function processMutationQueue() {
  if (mutationQueue.running) return
  mutationQueue.running = true

  while (mutationQueue.pending.length > 0) {
    const mutation = mutationQueue.pending.shift()
    try {
      await mutation()
    } catch (error) {
      console.error('Mutation queue error:', error)
    }
  }

  mutationQueue.running = false
}

function enqueueMutation(mutation) {
  return new Promise((resolve, reject) => {
    mutationQueue.pending.push(async () => {
      try {
        const result = await mutation()
        resolve(result)
      } catch (error) {
        reject(error)
      }
    })
    processMutationQueue()
  })
}

async function runChatsMutation(action, args, optimisticUpdater) {
  return enqueueMutation(async () => {
    chatsCache.error = null

    const previousChats = chatsCache.data

    if (optimisticUpdater) {
      chatsCache.data = optimisticUpdater(previousChats ?? [])
      emitChatsSnapshot()
    }

    try {
      const nextChats = await action(...args)
      setChatsData(nextChats)
      return nextChats
    } catch (error) {
      if (optimisticUpdater) {
        chatsCache.data = previousChats
      }
      setChatsError(getErrorMessage(error))
      return null
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════
// Data Fetchers
// ═══════════════════════════════════════════════════════════════════════

async function ensureChats(options = {}) {
  const { force = false } = options

  if (!force && hasFreshChats()) {
    return chatsCache.data
  }

  if (chatsCache.promise) {
    return chatsCache.promise
  }

  const request = loadChats()
    .then((nextChats) => {
      setChatsData(nextChats)
      return nextChats
    })
    .catch((error) => {
      setChatsError(getErrorMessage(error))
      throw error
    })
    .finally(() => {
      chatsCache.promise = null
      emitChatsSnapshot()
    })

  chatsCache.promise = request
  emitChatsSnapshot()
  return request
}

// ═══════════════════════════════════════════════════════════════════════
// Public Hooks
// ═══════════════════════════════════════════════════════════════════════

/**
 * Hook for the chat list sidebar. Provides CRUD operations on the chat list.
 */
export function useChatsModel() {
  const [state, setState] = useState(() => getChatsSnapshot())
  const createChatAbortRef = useRef(null)

  useEffect(() => subscribeChats(setState), [])

  useEffect(() => {
    if (chatsCache.data === null) {
      ensureChats()
      return
    }

    if (!hasFreshChats()) {
      ensureChats({ force: true })
    }
  }, [])

  const refresh = useCallback(() => ensureChats({ force: true }), [])

  const runOptimisticMutation = useCallback((optimisticUpdater, action, ...args) => (
    runChatsMutation(action, args, optimisticUpdater)
  ), [])

  const createChat = useCallback(async (input) => {
    chatsCache.error = null
    const previousChats = chatsCache.data
    const createdAt = Date.now()
    const tempId = createOptimisticId()
    const hasInitialInput = ((input.userPrompt || '').trim().length > 0) || (input.attachments || []).length > 0

    const optimisticChat = {
      id: tempId,
      title: input.title || '',
      preview: input.userPrompt || input.preview || '',
      messages: [],
      lastActiveAt: createdAt,
      isPinned: false,
      isArchived: false,
      isResponding: hasInitialInput,
      groupPath: input.groupPath ?? input.projectId ?? null,
    }

    chatsCache.data = [optimisticChat, ...(previousChats ?? [])]
    emitChatsSnapshot()

    try {
      const chat = await createChatAndReturn({
        title: input.title,
        parentID: input.parentID,
        labelId: input.groupPath || input.projectId || undefined,
      })

      if (!chat?.id) {
        chatsCache.data = previousChats
        setChatsError('Failed to create chat')
        return null
      }

      replaceCachedChat(tempId, {
        ...chat,
        messages: [],
        isResponding: hasInitialInput,
        preview: optimisticChat.preview,
      })

      // Apply model/provider to the new session if provided
      if ((input.providerId || input.modelId) && chat.id) {
        updateSessionProvider(chat.id, { providerId: input.providerId, modelId: input.modelId }).catch(() => {})
      }

      // Send initial message if provided
      if (hasInitialInput && chat.id) {
        const optimisticAsstId = createOptimisticId()
        const optimisticUserId = createOptimisticId()
        const now = Date.now()

        const userMsg = createOptimisticUserMessage(optimisticUserId, input.userPrompt || '', input.attachments || [], now)
        const asstMsg = createOptimisticAssistantMessage(optimisticAsstId, now + 1, chat._directory)

        // Update cache with optimistic messages
        mutateCachedChat(chat.id, (c) => ({
          ...c,
          messages: [userMsg, asstMsg],
          isResponding: true,
          preview: input.userPrompt || input.attachments?.[0]?.name || c.preview,
        }))

        // Set up event handler for streaming
        const onEvent = (event) => {
          const eventData = event.data
          if (eventData?.properties?.sessionID !== chat.id) return

          mutateCachedChat(chat.id, (c) =>
            applyOpenCodeEvent(c, event, optimisticAsstId, optimisticUserId)
          )
        }

        sendChatMessageAndLoad(chat.id, {
          content: input.userPrompt || '',
          attachments: input.attachments || [],
          agentId: input.agentId,
          model: (input.providerId || input.modelId) ? { providerID: input.providerId, modelID: input.modelId } : undefined,
          directory: chat._directory,
          onEvent,
          onAbortController: (ctrl) => { createChatAbortRef.current = ctrl },
        }).then((result) => {
          // Sync IDs and finalize — result is the complete assistant message
          // from POST /message. If SSE events already populated content, merge
          // preserves it; otherwise result fills in the response.
          if (result?.id) {
            const parentID = result._parentID
            mutateCachedChat(chat.id, (c) => ({
              ...c,
              isResponding: false,
              messages: c.messages.map((m) => {
                if (m.id === optimisticAsstId) return result
                if (m.id === optimisticUserId && parentID) return { ...m, id: parentID }
                return m
              }),
            }))
          }
        }).catch((error) => {
          if (error?.name === 'AbortError') {
            mutateCachedChat(chat.id, (c) => ({ ...c, isResponding: false }))
            return
          }
          setChatsError(getErrorMessage(error))
        })
      }

      return getCachedChat(chat.id) ?? chat
    } catch (error) {
      chatsCache.data = previousChats
      setChatsError(getErrorMessage(error))
      return null
    }
  }, [])

  return {
    chats: state.chats,
    loading: state.loading,
    error: state.error,
    refresh,
    createChat,
    togglePin: (chatId) => runOptimisticMutation((current) => current.map((chat) => (
      chat.id === chatId
        ? { ...chat, isPinned: !chat.isPinned, lastActiveAt: Date.now() }
        : chat
    )), toggleChatPinAndReload, chatId),
    archiveChat: (chatId) => runOptimisticMutation((current) => current.map((chat) => (
      chat.id === chatId
        ? { ...chat, isArchived: true, lastActiveAt: Date.now() }
        : chat
    )), archiveChatAndReload, chatId),
    deleteChat: (chatId) => runOptimisticMutation((current) => current.filter((chat) => chat.id !== chatId), deleteChatAndReload, chatId),
    deleteChats: (chatIds) => {
      const idSet = new Set(chatIds)
      return runOptimisticMutation((current) => current.filter((chat) => !idSet.has(chat.id)), deleteChatsAndReload, chatIds)
    },
    renameChat: (chatId, title) => runOptimisticMutation((current) => current.map((chat) => (
      chat.id === chatId
        ? { ...chat, title, lastActiveAt: Date.now() }
        : chat
    )), renameChatAndReload, chatId, title),
    moveChatsToProject: (chatIds, projectId) => {
      const idSet = new Set(chatIds)
      return runOptimisticMutation((current) => current.map((chat) => (
        idSet.has(chat.id)
          ? { ...chat, groupPath: projectId, lastActiveAt: Date.now() }
          : chat
      )), moveChatsToProjectAndReload, chatIds, projectId)
    },
  }
}

/**
 * Hook for a single chat view. Provides message sending, streaming,
 * abort, and revert operations.
 */
export function useChatModel(chatId) {
  const [chat, setChat] = useState(() => getCachedChat(chatId))
  const [loading, setLoading] = useState(() => Boolean(chatId) && chatId !== 'new')
  const [error, setError] = useState(null)
  const activeAbortControllerRef = useRef(null)
  const loadingStartRef = useRef(0)
  const minTimerRef = useRef(null)
  // True while sendMessage owns its own SSE stream — blocks the resume
  // effect below from opening a duplicate stream for the same run.
  const localSendActiveRef = useRef(false)

  const finishLoading = useCallback((nextChat) => {
    if (nextChat !== undefined) setChat(nextChat)
    const remaining = 1000 - (Date.now() - loadingStartRef.current)
    if (remaining > 0) {
      clearTimeout(minTimerRef.current)
      minTimerRef.current = setTimeout(() => setLoading(false), remaining)
    } else {
      setLoading(false)
    }
  }, [])

  // Subscribe to cache updates for this chat
  useEffect(() => {
    if (!chatId || chatId === 'new') {
      setChat(null)
      setLoading(false)
      return undefined
    }

    const unsubscribe = subscribeChats((snapshot) => {
      const cachedChat = snapshot.chats.find((item) => item.id === chatId) ?? null
      if (cachedChat) {
        setChat(cachedChat)
        if (cachedChat.messages?.length || cachedChat.isResponding) {
          finishLoading()
        }
      }
    })

    return () => {
      unsubscribe()
      clearTimeout(minTimerRef.current)
    }
  }, [chatId])

  // Fetch chat data on mount / chatId change
  useEffect(() => {
    if (!chatId || chatId === 'new') {
      setChat(null)
      setLoading(false)
      return undefined
    }

    loadingStartRef.current = Date.now()

    const abortController = new AbortController()
    const { signal } = abortController

    async function fetchChat() {
      const cachedChat = getCachedChat(chatId)

      if (cachedChat) {
        setChat(cachedChat)
        if (cachedChat.isResponding) {
          finishLoading(cachedChat)
          // When the chat is actively streaming (isResponding), skip the
          // server fetch. GET /message may return an incomplete snapshot
          // mid-response, and merging it would clobber SSE-streamed content.
          // SSE events + the sendMessage/createChat .then() callback handle
          // state reconciliation.
          return
        }
        if (!cachedChat.messages?.length) {
          // Messages not loaded yet — keep loading state until fetch completes
        } else {
          finishLoading()
        }
      } else {
        setLoading(true)
      }

      setError(null)

      try {
        const nextChat = await touchChatAndLoad(chatId, { signal })
        if (!signal.aborted) {
          const mergedChat = upsertCachedChat(nextChat)
          finishLoading(mergedChat)
        }
      } catch (nextError) {
        if (signal.aborted) return
        if (!cachedChat) {
          try {
            const fallbackChat = await loadChat(chatId, { signal })
            if (!signal.aborted) {
              const mergedFallbackChat = upsertCachedChat(fallbackChat)
              setChat(mergedFallbackChat)
            }
          } catch (fallbackError) {
            if (!signal.aborted) {
              setError(getErrorMessage(fallbackError))
            }
          }
        } else {
          setError(getErrorMessage(nextError))
        }
        setLoading(false)
      }
    }

    fetchChat()

    return () => {
      abortController.abort()
      clearTimeout(minTimerRef.current)
    }
  }, [chatId])

  const openChat = useCallback(async () => {
    if (!chatId || chatId === 'new') return null
    setError(null)

    try {
      const nextChat = await touchChatAndLoad(chatId)
      const mergedChat = upsertCachedChat(nextChat)
      setChat(mergedChat)
      return mergedChat
    } catch (nextError) {
      setError(getErrorMessage(nextError))
      return null
    }
  }, [chatId])

  // Resume live updates after a page reload while the backend run is
  // still active: the send-time SSE stream died with the old page, so
  // re-attach to the session's event stream until it reports idle/error.
  const isResponding = Boolean(chat?.isResponding)
  const directory = chat?._directory
  useEffect(() => {
    if (!chatId || chatId === 'new' || !isResponding || !directory) return undefined
    if (localSendActiveRef.current) return undefined

    const controller = new AbortController()
    resumeSessionStream({
      directory,
      onEvent: (event) => {
        if (event.data?.properties?.sessionID !== chatId) return
        const updated = mutateCachedChat(chatId, (c) => applyOpenCodeEvent(c, event, null, null))
        if (updated) setChat(updated)
      },
      signal: controller.signal,
    })

    return () => controller.abort()
  }, [chatId, isResponding, directory])

  const sendMessage = useCallback(async (content, attachments = [], opts = {}) => {
    const trimmedContent = content.trim()
    if (!chatId || chatId === 'new' || (!trimmedContent && attachments.length === 0)) return null
    setError(null)
    localSendActiveRef.current = true

    const now = Date.now()
    const optimisticUserId = createOptimisticId()
    const optimisticAsstId = createOptimisticId()

    const previousChat = getCachedChat(chatId)
    const optimisticChat = previousChat
      ? {
          ...previousChat,
          preview: trimmedContent || attachments[0]?.name || previousChat.preview,
          messages: [
            ...(previousChat.messages ?? []),
            createOptimisticUserMessage(optimisticUserId, trimmedContent, attachments, now),
            createOptimisticAssistantMessage(optimisticAsstId, now + 1, previousChat._directory),
          ],
          lastActiveAt: now,
          isResponding: true,
        }
      : null

    if (optimisticChat) {
      const mergedOptimisticChat = upsertCachedChat(optimisticChat)
      setChat(mergedOptimisticChat)
    }

    try {
      // Set up SSE event handler for streaming
      const onEvent = (event) => {
        const eventData = event.data
        if (eventData?.properties?.sessionID !== chatId) return

        const updated = mutateCachedChat(chatId, (c) =>
          applyOpenCodeEvent(c, event, optimisticAsstId, optimisticUserId)
        )
        if (updated) {
          setChat(updated)
        }
      }

      // Store reference so SSE handler can access it
      const resultRef = { current: null }
      const onEventWrapped = (event) => {
        onEvent(event)
        // If SSE stream already delivered the final message, use it
        const finalMsg = resultRef.current
        if (finalMsg?.id) {
          mutateCachedChat(chatId, (c) => ({
            ...c,
            isResponding: false,
            messages: c.messages.map((m) => {
              if (m.id === optimisticAsstId) return { ...finalMsg, id: finalMsg.id }
              if (m.id === optimisticUserId && finalMsg._parentID) return { ...m, id: finalMsg._parentID }
              return m
            }),
          }))
        }
      }

      const result = await sendChatMessageAndLoad(chatId, {
        content: trimmedContent,
        attachments,
        agentId: opts.agentId,
        model: (opts.providerId || opts.modelId) ? { providerID: opts.providerId, modelID: opts.modelId } : undefined,
        directory: previousChat?._directory,
        onEvent: onEventWrapped,
        onAbortController: (ctrl) => { activeAbortControllerRef.current = ctrl },
      })

      // ravens POST /message returns {info: assistant-message, parts: [...]} synchronously
      // info.parentID contains the user message ID
      if (result?.id) {
        const parentID = result._parentID
        mutateCachedChat(chatId, (c) => ({
          ...c,
          isResponding: false,
          messages: c.messages.map((m) => {
            if (m.id === optimisticAsstId) return result
            if (m.id === optimisticUserId && parentID) return { ...m, id: parentID }
            return m
          }),
        }))
        resultRef.current = result
      }

      const currentChat = getCachedChat(chatId)
      if (currentChat) {
        setChat(currentChat)
        return currentChat
      }

      return null
    } catch (nextError) {
      // A user-initiated stop aborts the in-flight request — keep the
      // optimistic messages (the server-side /abort finalizes them) and
      // don't surface it as an error.
      if (nextError?.name === 'AbortError') {
        mutateCachedChat(chatId, (c) => ({ ...c, isResponding: false }))
        const currentChat = getCachedChat(chatId)
        if (currentChat) setChat(currentChat)
        return currentChat ?? null
      }
      if (previousChat) {
        upsertCachedChat(previousChat)
        setChat(getCachedChat(chatId))
      }
      setError(getErrorMessage(nextError))
      return null
    } finally {
      localSendActiveRef.current = false
    }
  }, [chatId])

  const abortChatStream = useCallback(() => {
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort()
      activeAbortControllerRef.current = null
    }
  }, [])

  // ── Revert ────────────────────────────────────────────────────────

  const [isReverting, setIsReverting] = useState(false)
  const [revertError, setRevertError] = useState(null)

  const resetToMessage = useCallback(async (messageId, mode = 'conversation_and_code') => {
    if (!chatId || chatId === 'new' || !messageId) return

    setIsReverting(true)
    setRevertError(null)

    try {
      await revertConversation(chatId, messageId, mode)

      // Reload the full chat from the server to reflect revert state.
      // The backend marks the revert point on the session and emits
      // session.updated, but we reload explicitly so the UI updates
      // even when no SSE connection is active.
      const refreshed = await touchChatAndLoad(chatId)
      if (refreshed) {
        const merged = upsertCachedChat(refreshed)
        setChat(merged)
      }
    } catch (revertErr) {
      const message = revertErr?.message || 'Failed to reset conversation'
      setRevertError(message)
    } finally {
      setIsReverting(false)
    }
  }, [chatId])

  return { chat, loading, error, clearError: () => setError(null), openChat, sendMessage, abortChatStream, isReverting, revertError, resetToMessage }
}

/**
 * Hook for paginating through chat history messages.
 */
export function useChatMessagesPagination(chatId, options = {}) {
  const { limit = 50 } = options
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cursor, setCursor] = useState(null)

  const loadMore = useCallback(async () => {
    if (!chatId || chatId === 'new' || !hasMore || loadingMore) return

    setLoadingMore(true)

    try {
      const { messages: olderMessages, hasMore: moreAvailable, cursor: newCursor } = await loadChatMessages(chatId, {
        limit,
        before: cursor,
      })

      if (olderMessages.length > 0) {
        const currentChat = getCachedChat(chatId)
        if (currentChat) {
          const mergedChat = {
            ...currentChat,
            messages: [...olderMessages, ...(currentChat.messages || [])],
          }
          upsertCachedChat(mergedChat)
        }
      }

      setHasMore(moreAvailable)
      setCursor(newCursor)
    } catch (loaderError) {
      console.error('Failed to load more messages:', loaderError)
    } finally {
      setLoadingMore(false)
    }
  }, [chatId, cursor, hasMore, loadingMore, limit])

  useEffect(() => {
    setCursor(null)
    setHasMore(true)
    setLoadingMore(false)
  }, [chatId])

  return {
    hasMore,
    loadingMore,
    loadMore,
  }
}
