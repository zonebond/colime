import { Brain, DotsThree, Files, NotePencil, SquaresFour, Star, Trash, X } from '@phosphor-icons/react'

import ChatNavRail from './ChatNavRail'
import WelcomeLogo from './WelcomeLogo'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { useTranslation } from '@/i18n'
import { useAppStore } from '@/store/useAppStore'
import { useChatModel, useChatsModel } from '@/features/chats/chats.hooks'
import { useProviderModels } from '@/features/chats/useProviderModels'
import { useChatAgent } from '@/features/chats/useChatAgent'
import { stopChatMessage, uploadChatAttachment, confirmToolCall, listQuestions, replyQuestion, rejectQuestion, replyPermission, rejectPermission } from '@/features/chats/chats.service'
import { reloadSkills } from '@/features/toolbox/toolbox.service'
import { useProjectsModel } from '@/features/projects/projects.hooks'
import { useFavoriteModelsModel } from '@/features/toolbox/toolbox.hooks'
import { getAttachmentBlob, getAttachmentPreviewType, isReadableAttachment } from '@/components/attachments/AttachmentCard'
import ConfirmDialog from './ConfirmDialog'
import MoveDialog from './MoveDialog'
import styles from './ChatPage.module.css'

// Extracted components
import ChatTimeline from './message-list/ChatTimeline'
import MessageSearch from './message-list/MessageSearch'
import getMenuPosition from './message-list/getMenuPosition'
import useMessageKeyboard from './message-list/useMessageKeyboard'
import SessionRetry from './content-blocks/SessionRetry'
import SessionFilesPanel from './SessionFilesPanel'

import Composer from './composer/Composer'
import SubagentFooter from './SubagentFooter'
import AttachmentPreviewModal from './AttachmentPreviewModal'
import ResetDialog from './ResetDialog'
import useChatAutoScroll from './hooks/useChatAutoScroll'
import useNavRailActiveIndex from './hooks/useNavRailActiveIndex'

export default function ChatPage() {
  const { t } = useTranslation()
  const showReasoning = useAppStore((s) => s.showReasoning)
  const toggleShowReasoning = useAppStore((s) => s.toggleShowReasoning)
  const location = useLocation()
  const navigate = useNavigate()
  const { chatId } = useParams()
  const isNew = chatId === 'new'
  const [searchParams] = useSearchParams()
  const tc = t('chats')
  const { chat, loading, error, clearError, sendMessage, abortChatStream, resetToMessage, isReverting, revertError } = useChatModel(chatId)
  const { renameChat, deleteChat, togglePin, moveChatsToProject, createChat } = useChatsModel()
  const { projects, createProject } = useProjectsModel()
  const [composerValue, setComposerValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, side: 'bottom' })
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editingTitleValue, setEditingTitleValue] = useState('')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const [resetTargetId, setResetTargetId] = useState(null)
  const [toastMessage, setToastMessage] = useState('')


  const [replyingToMessage, setReplyingToMessage] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [attachments, setAttachments] = useState([])
  const [exitingAttachments, setExitingAttachments] = useState([])
  const [previewAttachment, setPreviewAttachment] = useState(null)
  const [sessionFilePreview, setSessionFilePreview] = useState(null)
  const [previewContent, setPreviewContent] = useState(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showAgentSelector, setShowAgentSelector] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [researchMode, setResearchMode] = useState(() => {
    try {
      return localStorage.getItem('chat:researchMode') === 'true'
    } catch { return false }
  })
  const [webSearchMode, setWebSearchMode] = useState(() => {
    try {
      return localStorage.getItem('chat:webSearchMode') === 'true'
    } catch { return false }
  })
  const fileInputRef = useRef(null)
  const menuBtnRef = useRef(null)
  const composerInputRef = useRef(null)
  const titleInputRef = useRef(null)
  const scrollAreaRef = useRef(null)
  const contentRef = useRef(null)
  const composerWrapRef = useRef(null)
  const [anchorMessageId, setAnchorMessageId] = useState(null)
  const [showSearch, setShowSearch] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [searchHighlightIndex, setSearchHighlightIndex] = useState(-1)
  const [interaction, setInteraction] = useState(null)
  const exitingAttachmentsTimerRef = useRef(null)
  const initialPromptHandledRef = useRef(null)

  const { models, providers, providerDefault, loading: modelsLoading, refresh: refreshProviders } = useProviderModels()
  const {
    selectedAgentId,
    selectedAgent,
    agents,
    agentsLoading,
    setSelectedAgentId,
    systemDefaultAgent,
    effectiveProviderId,
    effectiveModelId,
    selectSessionProvider,
  } = useChatAgent(chatId)
  const { favorites: favoriteModels, addFavorite, removeFavorite } = useFavoriteModelsModel()

  const displayAgent = selectedAgent || systemDefaultAgent

  const getProviderName = useCallback((providerId) => {
    if (!providerId) return ''
    const fromModels = models.find((m) => m.providerId === providerId || m.provider === providerId)
    if (fromModels?.providerName) return fromModels.providerName
    const fromProviders = providers.find((p) => p.id === providerId || p.provider === providerId)
    if (fromProviders?.name) return fromProviders.name
    return providerId
  }, [models, providers])

  const getModelName = useCallback((modelId) => {
    if (!modelId) return ''
    const model = models.find((m) => m.id === modelId || m.bareId === modelId)
    return model?.name || modelId
  }, [models])

  // Resolve model/provider for DISPLAY on the composer badge.
  // Follows ravens's fallback chain: session/agent → provider default → first model.
  const displayProviderId = effectiveProviderId
    || providers.find((p) => p.status === 'connected')?.id
    || providers[0]?.id
    || null
  const displayModelId = effectiveModelId
    || providerDefault[displayProviderId]
    || models[0]?.bareId
    || ''

  const charCount = composerValue.length
  const maxChars = 10000
  const estimatedTokens = Math.ceil(charCount / 3.5)

  const chatsListParams = new URLSearchParams()

  if (searchParams.get('search')) {
    chatsListParams.set('search', searchParams.get('search'))
  }

  const chatsListTarget = chatsListParams.toString()
    ? `/chats?${chatsListParams.toString()}`
    : '/chats'

  const project = chat?.projectId ? projects.find((item) => item.id === chat.projectId) ?? null : null
  const messages = chat?.messages ?? []
  const isEmpty = !loading && chat && messages.length === 0
  const showWelcome = isNew || isEmpty

  useEffect(() => {
    // Check for permission requests (SSE-driven, stored on chat object)
    if (chat?._pendingPermission) {
      const perm = chat._pendingPermission
      setInteraction({
        type: 'permission',
        data: {
          requestID: perm.id,
          permission: perm.permission,
          patterns: perm.patterns,
          toolMessageID: perm.tool?.messageID,
          toolCallID: perm.tool?.callID,
          directory: chat._directory,
        },
      })
      return
    }

    if (!messages?.length) return

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role !== 'assistant') return

    const toolBlock = lastMessage.contentBlocks?.find(
      (block) => block.type === 'tool_result' && block.state === 'confirm_required'
    )

    if (toolBlock) {
      if (toolBlock.toolName === 'question') {
        const qm = toolBlock.questionMeta
        const questions = Array.isArray(qm?.questions) ? qm.questions : []
        if (questions.length > 0) {
          setInteraction({
            type: 'question',
            data: {
              questions,
              callID: qm.callID || toolBlock.callID || null,
            },
          })
        }
      } else {
        setInteraction({
          type: 'tool_confirm',
          data: {
            toolId: toolBlock.toolId,
            runId: toolBlock.runId,
            toolName: toolBlock.toolName,
            toolInput: toolBlock.toolInput,
            isReadOnly: toolBlock.isReadOnly,
            isDestructive: toolBlock.isDestructive,
            directory: toolBlock._directory,
          },
        })
      }
    } else {
      setInteraction(null)
    }
  }, [chat?._pendingPermission, messages])

  const resolveProjectId = useCallback(async (projectIdOrName) => {
    if (projects.some((item) => item.id === projectIdOrName)) {
      return projectIdOrName
    }

    const newProject = await createProject({ name: projectIdOrName })
    return newProject?.id ?? null
  }, [createProject, projects])

  const {
    showScrollButton,
    composerHeight,
    scrollToBottomSmooth,
    autoScrollRef,
  } = useChatAutoScroll({
    scrollAreaRef,
    composerWrapRef,
    contentRef,
    composerInputRef,
    messages,
    loading,
    isResponding: chat?.isResponding ?? false,
    composerValue,
    chatId,
    anchorMessageId,
    setAnchorMessageId,
  })

  const navRailActiveIndex = useNavRailActiveIndex({
    scrollAreaRef,
    messageCount: messages.length,
  })

  useEffect(() => () => {
    if (exitingAttachmentsTimerRef.current) {
      clearTimeout(exitingAttachmentsTimerRef.current)
    }
  }, [])

  // Auto-reload skills when entering or creating a session
  useEffect(() => {
    if (!chatId) return
    reloadSkills().catch(() => {})
  }, [chatId])

  useEffect(() => {
    const initialPrompt = typeof location.state?.initialPrompt === 'string'
      ? location.state.initialPrompt.trim()
      : ''

    if (!chat?.id || !initialPrompt || isSending) {
      return
    }

    const promptKey = `${chat.id}:${initialPrompt}`
    if (initialPromptHandledRef.current === promptKey) {
      return
    }

    initialPromptHandledRef.current = promptKey

    ;(async () => {
      setIsSending(true)
      try {
        await sendMessage(initialPrompt, [])
      } finally {
        setIsSending(false)
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
      }
    })()
  }, [chat?.id, isSending, location.pathname, location.search, location.state, messages.length, navigate, sendMessage])

  const handleOpenMenu = (event) => {
    event.stopPropagation()
    if (!showMenu && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      setMenuPos(getMenuPosition(rect, 176, 196))
    }
    setShowMenu((current) => !current)
  }

  const handleRenameConfirm = async (nextTitle) => {
    setIsEditingTitle(false)
    if (nextTitle.trim()) {
      await renameChat(chat.id, nextTitle.trim())
    }
  }

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleRenameConfirm(editingTitleValue)
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false)
      setEditingTitleValue(chat?.title || '')
    }
  }

  const handleTitleClick = () => {
    setEditingTitleValue(chat?.title || '')
    setIsEditingTitle(true)
  }

  const handleDeleteConfirm = async () => {
    await deleteChat(chat.id)
    setShowDeleteDialog(false)

    // Priority: 1. location.state.from (where user came from)  2. chat.projectId  3. /chats
    const fromPath = location.state?.from
    const projectPath = chat?.projectId ? `/projects/${chat.projectId}` : null
    const target = fromPath || projectPath || chatsListTarget
    navigate(target)
  }

  const handleViewAllFiles = useCallback(() => setShowFiles(true), [])

  const showToast = useCallback((message) => {
    setToastMessage(message)
    setTimeout(() => setToastMessage(''), 2000)
  }, [])

  const readFileContent = async (file) => {
    if (!isReadableAttachment(file) && typeof file?.url === 'string' && file.url) {
      const response = await fetch(file.url)
      if (!response.ok) {
        throw new Error(`Failed to fetch attachment content: ${response.status}`)
      }
      return response.text()
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsText(getAttachmentBlob(file))
    })
  }

  const updateAttachmentDraft = useCallback((localId, updater) => {
    setAttachments((prev) => prev.map((attachment) => {
      if (attachment.localId !== localId) return attachment
      return typeof updater === 'function' ? updater(attachment) : { ...attachment, ...updater }
    }))
  }, [])

  const startAttachmentUpload = useCallback(async (draft) => {
    if (!chat?.id || !draft.fileBlob) {
      return
    }

    try {
      const uploadedAttachment = await uploadChatAttachment(chat.id, draft.fileBlob, {
        onProgress: (progress) => {
          updateAttachmentDraft(draft.localId, {
            uploadStatus: 'uploading',
            uploadProgress: progress,
          })
        },
      })

      updateAttachmentDraft(draft.localId, {
        ...uploadedAttachment,
        uploadStatus: 'uploaded',
        uploadProgress: 100,
        error: null,
      })
      setTimeout(() => {
        updateAttachmentDraft(draft.localId, (current) => current.uploadStatus === 'uploaded'
          ? { ...current, uploadStatus: null }
          : current)
      }, 900)
    } catch (error) {
      updateAttachmentDraft(draft.localId, {
        uploadStatus: 'error',
        error: error.message,
      })
      showToast(error.message || 'Attachment upload failed')
    }
  }, [chat?.id, showToast, updateAttachmentDraft])

  const handleAddFiles = useCallback((files) => {
    const maxFiles = 5
    const maxSize = 500 * 1024 * 1024

    const validFiles = files.filter((file) => {
      if (file.size > maxSize) {
        setToastMessage(`File "${file.name}" exceeds 500MB limit`)
        return false
      }
      return true
    })

    const availableSlots = Math.max(0, maxFiles - attachments.length)
    if (validFiles.length > availableSlots) {
      setToastMessage(`Maximum ${maxFiles} files allowed`)
    }

    const drafts = validFiles.slice(0, availableSlots).map((file) => ({
      localId: globalThis.crypto?.randomUUID?.() || `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size || 0,
      fileBlob: file,
      uploadStatus: 'uploading',
      uploadProgress: 1,
      error: null,
    }))

    if (drafts.length === 0) {
      return
    }

    setAttachments((prev) => [...prev, ...drafts])
    drafts.forEach((draft) => {
      startAttachmentUpload(draft)
    })
  }, [attachments.length, startAttachmentUpload])

  const handlePreviewAttachment = async (file) => {
    const previewType = getAttachmentPreviewType(file)
    if (previewType === 'image' || previewType === 'file') {
      setPreviewContent(null)
    } else {
      try {
        const content = await readFileContent(file)
        setPreviewContent(content)
      } catch (err) {
        console.error('Failed to read file:', err)
        setPreviewContent(null)
      }
    }
    setPreviewAttachment({ file, previewType })
  }

  const handleSessionFilePreview = useCallback((preview) => setSessionFilePreview(preview), [])
  const handleCloseSessionFilePreview = useCallback(() => {
    if (sessionFilePreview?.blobUrl) URL.revokeObjectURL(sessionFilePreview.blobUrl)
    setSessionFilePreview(null)
  }, [sessionFilePreview?.blobUrl])

  const handleClosePreview = () => {
    setPreviewAttachment(null)
    setPreviewContent(null)
    setCodeCopied(false)
  }

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(previewContent)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSend = async () => {
    const value = composerValue.trim()
    if ((!value && attachments.length === 0) || isSending) return
    if (!isNew && !chat) return

    if (attachments.some((attachment) => attachment.uploadStatus === 'uploading')) {
      showToast('Please wait for attachments to finish uploading')
      return
    }

    if (attachments.some((attachment) => attachment.uploadStatus === 'error')) {
      showToast('Remove failed attachments before sending')
      return
    }

    // New chat: create session then send first message
    if (isNew) {
      setIsSending(true)
      const pendingAttachments = attachments
      const pendingComposerValue = composerValue

      if (pendingAttachments.length > 0) {
        setExitingAttachments(pendingAttachments)
        if (exitingAttachmentsTimerRef.current) {
          clearTimeout(exitingAttachmentsTimerRef.current)
        }
        exitingAttachmentsTimerRef.current = setTimeout(() => {
          setExitingAttachments([])
        }, 260)
      }

      setAttachments([])
      setComposerValue('')
      setReplyingToMessage(null)
      setEditingMessage(null)

      try {
        const newChat = await createChat({
          userPrompt: value,
          attachments: pendingAttachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            type: attachment.type,
            size: attachment.size,
            url: attachment.url,
            previewUrl: attachment.previewUrl,
          })),
          agentId: selectedAgentId,
          providerId: effectiveProviderId,
          modelId: effectiveModelId,
        })
        if (newChat?.id) {
          navigate(`/chats/${newChat.id}`, { replace: true })
        } else {
          setComposerValue(pendingComposerValue)
          setAttachments(pendingAttachments)
          setExitingAttachments([])
        }
      } catch (error) {
        setComposerValue(pendingComposerValue)
        setAttachments(pendingAttachments)
        setExitingAttachments([])
        throw error
      } finally {
        setIsSending(false)
      }
      return
    }

    setIsSending(true)
    const pendingAttachments = attachments
    const pendingComposerValue = composerValue

    if (pendingAttachments.length > 0) {
      setExitingAttachments(pendingAttachments)
      if (exitingAttachmentsTimerRef.current) {
        clearTimeout(exitingAttachmentsTimerRef.current)
      }
      exitingAttachmentsTimerRef.current = setTimeout(() => {
        setExitingAttachments([])
      }, 260)
    }

    setAttachments([])
    setComposerValue('')
    setReplyingToMessage(null)
    setEditingMessage(null)

    try {
      const nextChat = await sendMessage(value, attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        url: attachment.url,
        previewUrl: attachment.previewUrl,
      })), {
        agentId: selectedAgentId,
        providerId: effectiveProviderId,
        modelId: effectiveModelId,
      })
      if (nextChat) {
        return
      }
      setComposerValue(pendingComposerValue)
      setAttachments(pendingAttachments)
      setExitingAttachments([])
    } catch (error) {
      setComposerValue(pendingComposerValue)
      setAttachments(pendingAttachments)
      setExitingAttachments([])
      throw error
    } finally {
      setIsSending(false)
    }
  }

  const handleCopyMessage = useCallback(async (content, type = 'text') => {
    try {
      await navigator.clipboard.writeText(content)
      showToast(type === 'user' ? tc.copiedUser : tc.copied)
    } catch {
      showToast(tc.copyFailed)
    }
  }, [showToast, tc])

  const handleInteractionRespond = useCallback(async (response) => {
    if (!interaction) return

    try {
      if (interaction.type === 'tool_confirm') {
        const { toolId, runId } = interaction.data
        const { action } = response
        if (chat?.id && toolId) {
          await confirmToolCall(chat.id, toolId, action, null, runId)
        }
      } else if (interaction.type === 'question') {
        const { callID } = interaction.data
        if (chat?.id) {
          const pending = await listQuestions()
          const request = pending.find(
            (r) => r.sessionID === chat.id && r.tool?.callID === callID
          )
          if (request?.id) {
            await replyQuestion(request.id, response.answers)
          }
        }
      } else if (interaction.type === 'permission') {
        const { requestID } = interaction.data
        const reply = response.action === 'allow' ? 'once' : response.action === 'always' ? 'always' : 'reject'
        if (requestID) {
          await replyPermission(requestID, reply)
        }
      }
    } catch (err) {
      console.error('Failed to handle interaction response:', err)
    } finally {
      setInteraction(null)
    }
  }, [chat?.id, interaction])

  const handleCloseInteraction = useCallback(async () => {
    try {
      if (interaction?.type === 'tool_confirm') {
        const { toolId, runId } = interaction.data
        if (chat?.id && toolId) {
          await confirmToolCall(chat.id, toolId, 'deny', null, runId)
        }
      } else if (interaction?.type === 'question') {
        const { callID } = interaction.data
        if (chat?.id) {
          const pending = await listQuestions()
          const request = pending.find(
            (r) => r.sessionID === chat.id && r.tool?.callID === callID
          )
          if (request?.id) {
            await rejectQuestion(request.id)
          }
        }
      } else if (interaction?.type === 'permission') {
        const { requestID } = interaction.data
        if (requestID) {
          await rejectPermission(requestID)
        }
      }
    } catch (err) {
      console.error('Failed to close interaction:', err)
    } finally {
      setInteraction(null)
    }
  }, [chat?.id, interaction])

  const handleStop = useCallback(async () => {
    if (!chat) return
    abortChatStream()
    await stopChatMessage(chat.id, chat.activeRunId || null)
    setIsSending(false)
  }, [chat, abortChatStream])

  const handleConfirmTool = useCallback(async (toolId, action) => {
    if (!chat?.id || !toolId) return
    await confirmToolCall(chat.id, toolId, action)
  }, [chat?.id])

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(null)
    setComposerValue('')
  }, [])

  const handleResetToHere = useCallback((messageId) => {
    setResetTargetId(messageId)
    setShowResetDialog(true)
  }, [])

  const handleResetConfirm = useCallback(async () => {
    if (!resetTargetId) return
    setShowResetDialog(false)
    try {
      await resetToMessage(resetTargetId, 'conversation_and_code')
    } catch (err) {
      console.error('Failed to reset to message:', err)
    }
    setResetTargetId(null)
  }, [resetTargetId, resetToMessage])

  const { focusedIndex, scrollToMessage } = useMessageKeyboard({ messages, scrollAreaRef, onCopyMessage: handleCopyMessage })

  const handleMessageClick = useCallback((messageId) => {
    setAnchorMessageId((prev) => prev === messageId ? null : messageId)
    autoScrollRef.current = false
  }, [])

  const handleSearchNavigate = useCallback((index) => {
    setSearchHighlightIndex(index)
    if (index >= 0 && index < messages.length) {
      const container = scrollAreaRef.current
      if (container) {
        const el = container.querySelector(`[data-message-index="${index}"]`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [messages.length, scrollAreaRef])

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown)
    return () => document.removeEventListener('keydown', handleGlobalKeyDown)
  }, [])

  return (
    <div className={styles.page}>
      {/* Only set the var once measured — an invalid value like "nullpx"
          would defeat the CSS fallback and collapse the bottom padding. */}
      <div className={`${styles.shell} ${showWelcome ? styles.shellEmpty : ''}`} style={composerHeight != null ? { '--composer-height': `${composerHeight}px` } : undefined}>
        {!showWelcome && <header className={styles.header}>
          <div className={styles.headerGradient} />
          <div className={styles.headerInner}>
            <div className={styles.headerTitleWrap}>
              {project ? (
                <>
                  <button type="button" className={styles.projectLink} onClick={() => navigate(`/projects/${project.id}`)}>
                    {project.name}
                  </button>
                  <span className={styles.headerDivider}>/</span>
                </>
              ) : null}
              <div className={styles.chatTitleGroup}>
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    className={styles.chatTitleInput}
                    value={editingTitleValue}
                    onChange={(e) => setEditingTitleValue(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={() => handleRenameConfirm(editingTitleValue)}
                    autoFocus
                  />
                ) : chat?._parentID ? (
                  <span className={styles.chatTitleText}>{chat?.title || tc.chatNotFound}</span>
                ) : (
                  <button type="button" className={styles.chatTitleBtn} onClick={handleTitleClick}>
                    <span className={styles.chatTitleText}>{loading ? tc.loadingChat : chat?.title || tc.chatNotFound}</span>
                  </button>
                )}
                {!isEditingTitle && !chat?._parentID && (
                  <button type="button" ref={menuBtnRef} className={styles.chatMenuBtn} aria-label={tc.more} onClick={handleOpenMenu}>
                    <DotsThree size={16} weight="bold" />
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              className={`${styles.reasoningToggle} ${showFiles ? styles.reasoningToggleOff : ''}`}
              onClick={() => setShowFiles((v) => !v)}
              aria-label="Session files"
              title="Session files"
            >
              <Files size={16} weight={showFiles ? 'fill' : 'regular'} />
            </button>
            <button
              type="button"
              className={`${styles.reasoningToggle} ${!showReasoning ? styles.reasoningToggleOff : ''}`}
              onClick={toggleShowReasoning}
              aria-label={showReasoning ? tc.hideReasoning : tc.showReasoning}
              title={showReasoning ? tc.hideReasoning : tc.showReasoning}
            >
              <Brain size={16} weight={showReasoning ? 'fill' : 'regular'} />
            </button>
          </div>
        </header>}

        {showWelcome ? (
          <div className={styles.welcomeArea}>
            <div className={styles.welcomeGlow} />
            <WelcomeLogo text="RAVENS" />
            <p className={styles.welcomeTagline}>AI Coding Agent</p>
          </div>
        ) : (
          <div ref={scrollAreaRef} className={styles.scrollArea}>
          <div ref={contentRef} className={styles.content}>
            <SessionRetry status={chat?._sessionStatus} />
            <ChatTimeline
              loading={loading}
              hasChat={Boolean(chat)}
              messages={messages}
              tc={tc}
              focusedIndex={focusedIndex}
              models={models}
              anchorMessageId={anchorMessageId}
              onMessageClick={handleMessageClick}
              searchHighlightIndex={searchHighlightIndex}
              onPreviewAttachment={handlePreviewAttachment}
              onConfirmTool={handleConfirmTool}
              onResetToHere={handleResetToHere}
              isReverting={isReverting}
              onViewAllFiles={handleViewAllFiles}
              onPreviewSessionFile={handleSessionFilePreview}
            />
          </div>
        </div>
        )}

        {error && (
          <div className={styles.sendErrorBanner}>
            <span className={styles.sendErrorText}>{error}</span>
            <button type="button" className={styles.sendErrorClose} onClick={clearError} aria-label={tc.dismiss}>
              <X size={14} weight="bold" />
            </button>
          </div>
        )}

        {!showWelcome && (
          <ChatNavRail
            messages={messages}
            onScrollToMessage={scrollToMessage}
            focusedIndex={focusedIndex}
            activeMessageIndex={navRailActiveIndex}
          />
        )}

        {!showWelcome && showFiles && (
          <div className={styles.searchBarWrap}>
            <SessionFilesPanel
              directory={chat?._directory}
              isResponding={chat?.isResponding ?? false}
              onClose={() => setShowFiles(false)}
              onPreviewFile={handleSessionFilePreview}
            />
          </div>
        )}

        {!showWelcome && showSearch && (
          <div className={styles.searchBarWrap}>
            <MessageSearch
              messages={messages}
              onNavigate={handleSearchNavigate}
              onClose={() => { setShowSearch(false); setSearchHighlightIndex(-1) }}
            />
          </div>
        )}

        {!loading && (chat?._parentID ? (
          <SubagentFooter parentID={chat._parentID} currentID={chat.id} />
        ) : (
          <Composer
          centered={showWelcome}
          wrapRef={composerWrapRef}
          inputRef={composerInputRef}
          fileInputRef={fileInputRef}
          composerValue={composerValue}
          onComposerChange={setComposerValue}
          onSend={handleSend}
          attachments={attachments}
          exitingAttachments={exitingAttachments}
          onRemoveAttachment={(file) => setAttachments((prev) => prev.filter((a) => file.localId ? a.localId !== file.localId : a.id !== file.id))}
          onPreviewAttachment={handlePreviewAttachment}
          editingMessage={editingMessage}
          replyingToMessage={replyingToMessage}
          onCancelEdit={handleCancelEdit}
          onCancelReply={() => setReplyingToMessage(null)}
          showScrollButton={showScrollButton}
          onScrollToBottom={() => {
            setAnchorMessageId(null)
            scrollToBottomSmooth()
          }}
          interaction={interaction}
          onInteractionRespond={handleInteractionRespond}
          onCloseInteraction={handleCloseInteraction}
          isSending={isSending}
          chatIsResponding={chat?.isResponding}
          onAddFiles={handleAddFiles}
          showAttachMenu={showAttachMenu}
          setShowAttachMenu={setShowAttachMenu}
          researchMode={researchMode}
          setResearchMode={setResearchMode}
          webSearchMode={webSearchMode}
          setWebSearchMode={setWebSearchMode}
          project={project}
          onRemoveFromProject={() => moveChatsToProject([chat.id], null)}
          charCount={charCount}
          maxChars={maxChars}
          estimatedTokens={estimatedTokens}
          models={models}
          providers={providers}
          modelsLoading={modelsLoading}
          refreshProviders={refreshProviders}
          selectedAgentId={selectedAgentId}
          selectedAgent={selectedAgent}
          agents={agents}
          agentsLoading={agentsLoading}
          setSelectedAgentId={setSelectedAgentId}
          favoriteModels={favoriteModels}
          addFavorite={addFavorite}
          removeFavorite={removeFavorite}
          showModelDropdown={showModelDropdown}
          setShowModelDropdown={setShowModelDropdown}
          showAgentSelector={showAgentSelector}
          setShowAgentSelector={setShowAgentSelector}
          displayAgent={displayAgent}
          getProviderName={getProviderName}
          getModelName={getModelName}
          effectiveProviderId={displayProviderId}
          effectiveModelId={displayModelId}
          chatId={chatId}
          onStop={handleStop}
          onSelectModel={(providerId, modelId) => selectSessionProvider(chatId, { providerId, modelId })}
          onAddToProject={() => setShowMoveDialog(true)}
        />
        ))}

        {showMenu && createPortal(
          <>
            <div className={styles.menuBackdrop} onClick={() => setShowMenu(false)} />
            <div className={styles.menu} data-side={menuPos.side} style={{ top: menuPos.top, left: menuPos.left }} onMouseDown={(event) => event.stopPropagation()}>
              <button type="button" className={styles.menuItem} onClick={async () => { setShowMenu(false); await togglePin(chat.id) }}>
                <Star size={16} weight={chat.isPinned ? 'fill' : 'regular'} />
                <span>{chat.isPinned ? tc.unstar : tc.star}</span>
              </button>
              <button type="button" className={styles.menuItem} onClick={() => { setShowMenu(false); handleTitleClick() }}>
                <NotePencil size={16} weight="regular" />
                <span>{tc.rename}</span>
              </button>
              {project ? (
                <>
                  <button type="button" className={styles.menuItem} onClick={() => { setShowMenu(false); setShowMoveDialog(true) }}>
                    <SquaresFour size={16} weight="regular" />
                    <span>{tc.changeProject}</span>
                  </button>
                  <button type="button" className={styles.menuItem} onClick={async () => { setShowMenu(false); await moveChatsToProject([chat.id], null) }}>
                    <X size={16} weight="regular" />
                    <span>{tc.removeFromProject}</span>
                  </button>
                </>
              ) : (
                <button type="button" className={styles.menuItem} onClick={() => { setShowMenu(false); setShowMoveDialog(true) }}>
                  <SquaresFour size={16} weight="regular" />
                  <span>{tc.addToProject}</span>
                </button>
              )}
              <div className={styles.menuDivider} />
              <button type="button" className={`${styles.menuItem} ${styles.menuDelete}`} onClick={() => { setShowMenu(false); setShowDeleteDialog(true) }}>
                <Trash size={16} weight="regular" />
                <span>{tc.delete}</span>
              </button>
            </div>
          </>,
          document.body
        )}

        {showDeleteDialog && chat ? (
          <ConfirmDialog
            title={tc.deleteConfirmTitle.replace('{count}', '1').replace('{sCount}', '')}
            description={tc.deleteConfirmDesc}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setShowDeleteDialog(false)}
            confirmText={tc.delete}
            cancelText={t('projects').cancel}
          />
        ) : null}

        {showMoveDialog && chat ? (
          <MoveDialog
            t={tc}
            count={1}
            title={tc.changeProject}
            description={tc.changeProjectDesc}
            excludeProjectIds={project?.id ? [project.id] : []}
            onMove={async (nextProjectIdOrName) => {
              const nextProjectId = await resolveProjectId(nextProjectIdOrName)
              if (!nextProjectId) return
              await moveChatsToProject([chat.id], nextProjectId)
              setShowMoveDialog(false)
            }}
            onCancel={() => setShowMoveDialog(false)}
          />
        ) : null}

        <ResetDialog
          open={showResetDialog}
          onClose={() => setShowResetDialog(false)}
          onConfirm={handleResetConfirm}
          isReverting={isReverting}
          revertError={revertError}
          title={tc.resetToHereConfirm || 'Reset to here?'}
          description={tc.resetToHereWarning || 'This will revert the conversation and code state to this point. All changes after this message will be lost.'}
          cancelText={t('projects').cancel || 'Cancel'}
          confirmText={tc.resetToHere || 'Reset to here'}
          resettingText={tc.resetting || 'Resetting...'}
        />

        <AttachmentPreviewModal
          attachment={previewAttachment}
          content={previewContent}
          codeCopied={codeCopied}
          onClose={handleClosePreview}
          onCopyCode={handleCopyCode}
        />

        <AttachmentPreviewModal
          attachment={sessionFilePreview?.attachment}
          content={sessionFilePreview?.content}
          blobUrl={sessionFilePreview?.blobUrl}
          truncated={sessionFilePreview?.truncated}
          onClose={handleCloseSessionFilePreview}
          onCopyCode={sessionFilePreview?.onCopyCode}
          onDownload={sessionFilePreview?.onDownload}
        />

        {toastMessage && (
          <div className={styles.toast}>
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  )
}
