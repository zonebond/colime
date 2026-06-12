import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import {
  Archive,
  ArrowLeft,
  Check,
  Copy,
  File,
  FileCode,
  FileCsv,
  FilePdf,
  FileText,
  Lightbulb,
  DotsThree,
  Paperclip,
  PencilSimple,
  Plus,
  SquaresFour,
  Star,
  Trash,
  X,
} from '@phosphor-icons/react'
import { useTranslation } from '@/i18n'
import { useProjectsModel } from '@/features/projects/projects.hooks'
import { fetchProjectAttachments } from '@/features/projects/projects.service'
import { useChatsModel } from '@/features/chats/chats.hooks'
import { useProviderModels } from '@/features/chats/useProviderModels'
import { useChatAgent } from '@/features/chats/useChatAgent'
import { useFavoriteModelsModel } from '@/features/toolbox/toolbox.hooks'
import AttachmentCard, { AttachmentImage, getAttachmentBlob, getAttachmentPreviewType, isReadableAttachment } from '@/components/attachments/AttachmentCard'
import Composer from '@/components/chats/composer/Composer'
import ConfirmDialog from '@/components/chats/ConfirmDialog'
import MoveDialog from '@/components/chats/MoveDialog'
import RenameDialog from '@/components/chats/RenameDialog'
import chatStyles from '@/components/chats/ChatPage.module.css'
import EditDetailsDialog from './EditDetailsDialog'
import ProjectInstructionsDialog from './ProjectInstructionsDialog'
import styles from './ProjectDetailPage.module.css'

function relativeTime(timestamp, t) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t.justNow
  if (minutes < 60) return `${minutes} ${t.minutesAgo}`
  if (hours < 24) return `${hours} ${t.hoursAgo}`
  return `${days} ${t.daysAgo}`
}

function formatCapacity(files) {
  return Math.min(100, Math.max(1, Math.round(files.length * 12)))
}

function getFloatingMenuPosition(rect, menuWidth, menuHeight) {
  const viewportPadding = 12
  const gap = 4
  const left = Math.max(
    viewportPadding,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
  )
  const openUp = rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding
    && rect.top - gap - menuHeight >= viewportPadding

  return {
    left,
    top: openUp
      ? rect.top - gap - menuHeight
      : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding),
    side: openUp ? 'top' : 'bottom',
  }
}

const DETAIL_CHAT_SKELETON_COUNT = 5
const DETAIL_FILE_SKELETON_COUNT = 4

async function captureScreenshotFile() {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return null
  if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') return null

  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: {
      frameRate: 1,
      preferCurrentTab: true,
    },
  })

  try {
    const [track] = stream.getVideoTracks()
    if (!track) return null

    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.playsInline = true

    await video.play()

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((resolve) => {
        video.addEventListener('loadeddata', resolve, { once: true })
      })
    }

    const width = track.getSettings().width || video.videoWidth || 1440
    const height = track.getSettings().height || video.videoHeight || 900
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(video, 0, 0, width, height)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png')
    })

    if (!blob) return null

    return new File([blob], `screenshot-${Date.now()}.png`, {
      type: 'image/png',
      lastModified: Date.now(),
    })
  } finally {
    stream.getTracks().forEach((track) => track.stop())
  }
}

export default function ProjectDetailPage() {
  const projectMenuWidth = 128
  const projectMenuHeight = 118
  const chatMenuWidth = 176
  const chatMenuHeight = 182
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const [searchParams] = useSearchParams()
  const {
    projects,
    loading: projectsLoading,
    createProject,
    toggleProjectStar,
    archiveProject,
    deleteProject,
    updateProjectDetails,
    updateProjectInstructions,
    addProjectFiles,
    removeProjectFile,
  } = useProjectsModel()
  const { chats, loading: chatsLoading, createChat, renameChat, deleteChat, togglePin, moveChatsToProject } = useChatsModel()
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
  } = useChatAgent('new')
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

  const handleSelectModel = useCallback((providerId, modelId) => {
    selectSessionProvider('new', { providerId, modelId })
  }, [selectSessionProvider])

  const canCaptureScreen = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'

  const displayProviderId = effectiveProviderId
    || providers.find((p) => p.status === 'connected')?.id
    || providers[0]?.id
    || null
  const displayModelId = effectiveModelId
    || providerDefault[displayProviderId]
    || models[0]?.bareId
    || ''

  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showAgentSelector, setShowAgentSelector] = useState(false)

  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState([])
  const [projectFiles, setProjectFiles] = useState([])
  const [previewAttachment, setPreviewAttachment] = useState(null)
  const [previewContent, setPreviewContent] = useState(null)
  const [codeCopied, setCodeCopied] = useState(false)
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [instructionsDraft, setInstructionsDraft] = useState('')
  const [instructionsSavedAt, setInstructionsSavedAt] = useState(null)
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false)
  const [showProjectMenu, setShowProjectMenu] = useState(false)
  const [projectMenuPos, setProjectMenuPos] = useState({ top: 0, left: 0, side: 'bottom' })
  const [showEditDetailsDialog, setShowEditDetailsDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showChatRenameDialog, setShowChatRenameDialog] = useState(false)
  const [showChatDeleteDialog, setShowChatDeleteDialog] = useState(false)
  const [showMoveChatDialog, setShowMoveChatDialog] = useState(false)
  const [chatRenameTargetId, setChatRenameTargetId] = useState(null)
  const [chatDeleteTargetId, setChatDeleteTargetId] = useState(null)
  const [chatMoveTargetId, setChatMoveTargetId] = useState(null)
  const [chatMenu, setChatMenu] = useState(null)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [researchEnabled, setResearchEnabled] = useState(() => {
    try {
      return localStorage.getItem('chat:researchMode') === 'true'
    } catch {
      return false
    }
  })
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => {
    try {
      return localStorage.getItem('chat:webSearchMode') !== 'false'
    } catch {
      return true
    }
  })
  const resolveProjectId = useCallback(async (projectIdOrName) => {
    if (projects.some((item) => item.id === projectIdOrName)) {
      return projectIdOrName
    }

    const newProject = await createProject({ name: projectIdOrName })
    return newProject?.id ?? null
  }, [createProject, projects])
  const composerFileInputRef = useRef(null)
  const projectFileInputRef = useRef(null)
  const menuBtnRef = useRef(null)

  const tp = t('projects') || {}
  const tc = t('chats') || {}
  const project = useMemo(
    () => projects.find((item) => item.id === projectId) ?? null,
    [projects, projectId]
  )

  const projectChats = useMemo(
    () => chats
      .filter((chat) => chat.projectId === projectId && !chat.isArchived)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt),
    [chats, projectId]
  )

  useEffect(() => {
    setInstructionsDraft(project?.instructions ?? '')
  }, [project?.instructions])

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    fetchProjectAttachments(projectId).then((files) => {
      if (!cancelled) setProjectFiles(files)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [projectId])

  const refreshProjectFiles = useCallback(() => {
    if (!projectId) return
    fetchProjectAttachments(projectId).then(setProjectFiles).catch(() => {})
  }, [projectId])

  useEffect(() => {
    if (!showProjectMenu) return undefined

    const handleClickOutside = (event) => {
      if (menuBtnRef.current && !menuBtnRef.current.contains(event.target)) {
        setShowProjectMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showProjectMenu])

  useEffect(() => {
    const handleShortcut = (event) => {
      const isUploadShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'u'
      if (!isUploadShortcut) return

      event.preventDefault()
      composerFileInputRef.current?.click()
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const handleMenuOpen = (event) => {
    event.stopPropagation()
    if (!showProjectMenu && menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect()
      setProjectMenuPos(getFloatingMenuPosition(rect, projectMenuWidth, projectMenuHeight))
    }
    setShowProjectMenu((current) => !current)
  }

  const handleSubmitPrompt = async (event) => {
    if (event) event.preventDefault()
    const value = prompt.trim()
    if ((!value && attachments.length === 0) || !project || isCreatingChat) return

    setIsCreatingChat(true)
    try {
      const createdChat = await createChat({
        title: value ? value.slice(0, 48) : attachments[0]?.name || 'New chat',
        preview: value || attachments[0]?.name || 'New chat',
        userPrompt: value,
        attachments,
        projectId: project.id,
        agentId: selectedAgentId,
        providerId: displayProviderId,
        modelId: displayModelId,
      })

      if (createdChat?.id) {
        setPrompt('')
        setAttachments([])
        navigate(`/chats/${createdChat.id}`, { state: { from: `/projects/${project.id}` } })
      }
    } finally {
      setIsCreatingChat(false)
    }
  }

  const readAttachmentContent = useCallback(async (file) => {
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
  }, [])

  const handlePreviewAttachment = useCallback(async (file) => {
    const previewType = getAttachmentPreviewType(file)
    if (previewType === 'image' || previewType === 'file') {
      setPreviewContent(null)
    } else {
      try {
        const content = await readAttachmentContent(file)
        setPreviewContent(content)
      } catch {
        setPreviewContent(null)
      }
    }

    setPreviewAttachment({ file, previewType })
  }, [readAttachmentContent])

  const handleClosePreview = useCallback(() => {
    setPreviewAttachment(null)
    setPreviewContent(null)
    setCodeCopied(false)
  }, [])

  const handleCopyCode = useCallback(async () => {
    if (!previewContent) return
    try {
      await navigator.clipboard.writeText(previewContent)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 1200)
    } catch {
      // ignore
    }
  }, [previewContent])

  const handleSaveInstructions = async () => {
    if (!project) return
    const nextSavedAt = Date.now()
    setInstructionsSavedAt(nextSavedAt)
    setShowInstructionsDialog(false)
    await updateProjectInstructions(project.id, instructionsDraft.trim())
  }

  const handleOpenInstructionsDialog = () => {
    setInstructionsDraft(project?.instructions ?? '')
    setShowInstructionsDialog(true)
  }

  const handleAddProjectFiles = async (event) => {
    if (!project) return
    const nextFiles = Array.from(event.target.files ?? [])
    if (nextFiles.length === 0) return
    await addProjectFiles(project.id, nextFiles)
    refreshProjectFiles()
    event.target.value = ''
  }

  const handleAddComposerFiles = useCallback((files) => {
    const maxFiles = 5
    const maxSize = 500 * 1024 * 1024

    const validFiles = files.filter((file) => file.size <= maxSize)
    const availableSlots = Math.max(0, maxFiles - attachments.length)
    const nextFiles = validFiles.slice(0, availableSlots)

    if (nextFiles.length === 0) return
    setAttachments((current) => [...current, ...nextFiles])
  }, [attachments.length])

  const handleCaptureScreenshot = useCallback(async () => {
    if (!project) return

    setShowAttachMenu(false)

    try {
      const screenshot = await captureScreenshotFile()
      if (!screenshot) return
      handleAddComposerFiles([screenshot])
    } catch {
      // Ignore permission denials and interrupted captures.
    }
  }, [handleAddComposerFiles, project])

  const handleDeleteProject = async () => {
    if (!project) return
    await deleteProject(project.id)
    navigate(projectsListTarget)
  }

  const handleArchiveProject = async () => {
    if (!project) return
    await archiveProject(project.id)
    navigate(projectsListTarget)
  }

  const loading = projectsLoading || chatsLoading
  const projectsListParams = new URLSearchParams()

  if (searchParams.get('search')) {
    projectsListParams.set('search', searchParams.get('search'))
  }

  if (searchParams.get('sort')) {
    projectsListParams.set('sort', searchParams.get('sort'))
  }

  const projectsListTarget = projectsListParams.toString()
    ? `/projects?${projectsListParams.toString()}`
    : '/projects'

  if (loading) {
    return (
      <div className={`${styles.page} ${styles.skeletonPage}`}>
        <div className={`${styles.scrollArea} ${styles.skeletonScrollArea}`}>
          <header className={`${styles.header} ${styles.skeletonHeader}`}>
            <div className={styles.headerGradient} />
            <div className={styles.headerInner}>
              <div className={`uiSkeleton ${styles.detailSkeletonBack}`} />
            </div>
          </header>

          <main className={styles.main}>
            <section className={styles.primaryColumn}>
              <div className={`${styles.projectHead} ${styles.skeletonProjectHead}`}>
                <div className={styles.projectHeadTop}>
                  <div className={`uiSkeleton ${styles.detailSkeletonTitle}`} />
                  <div className={styles.detailSkeletonActionRow}>
                    <div className={`uiSkeleton ${styles.detailSkeletonIconBtn}`} />
                    <div className={`uiSkeleton ${styles.detailSkeletonIconBtn}`} />
                  </div>
                </div>
                <div className={`uiSkeleton ${styles.detailSkeletonDescription}`} />
                <div className={`uiSkeleton ${styles.detailSkeletonDescriptionShort}`} />
                <div className={styles.projectMetaRow}>
                  <div className={`uiSkeleton ${styles.detailSkeletonMetaPill}`} />
                  <div className={`uiSkeleton ${styles.detailSkeletonMetaPill}`} />
                  <div className={`uiSkeleton ${styles.detailSkeletonMetaPill}`} />
                </div>
              </div>

              <div className={`${styles.composerShell} ${styles.skeletonComposerShell}`}>
                <div className={styles.composer}>
                  <div className={`uiSkeleton ${styles.detailSkeletonComposerBody}`} />
                  <div className={styles.composerFooter}>
                    <div className={styles.composerLeft}>
                      <div className={`uiSkeleton ${styles.detailSkeletonGhostBtn}`} />
                    </div>
                    <div className={styles.composerRight}>
                      <div className={`uiSkeleton ${styles.detailSkeletonModelBtn}`} />
                      <div className={`uiSkeleton ${styles.detailSkeletonSendBtn}`} />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.chatListWrap}>
                <ul className={styles.chatList}>
                  {Array.from({ length: DETAIL_CHAT_SKELETON_COUNT }).map((_, index) => (
                    <li key={`detail-chat-skeleton-${index}`} className={`${styles.chatRow} ${index === 0 ? styles.chatRowFirst : ''}`}>
                      <div className={styles.chatLink}>
                        <div className={styles.chatTopRow}>
                          <div className={`uiSkeleton ${styles.detailSkeletonChatTitle}`} />
                          <div className={`uiSkeleton ${styles.detailSkeletonChatTime}`} />
                        </div>
                        <div className={`uiSkeleton ${styles.detailSkeletonChatPreview}`} />
                        <div className={`uiSkeleton ${styles.detailSkeletonChatPreviewShort}`} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <aside className={styles.sidebar}>
              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardHeadText}>
                    <div className={`uiSkeleton ${styles.detailSkeletonSideTitle}`} />
                    <div className={`uiSkeleton ${styles.detailSkeletonSideHint}`} />
                  </div>
                  <div className={`uiSkeleton ${styles.detailSkeletonSideBtn}`} />
                </div>
                <div className={styles.instructionsContent}>
                  <div className={`uiSkeleton ${styles.detailSkeletonParagraph}`} />
                  <div className={`uiSkeleton ${styles.detailSkeletonParagraph}`} />
                  <div className={`uiSkeleton ${styles.detailSkeletonParagraphShort}`} />
                </div>
              </section>

              <section className={styles.sideCard}>
                <div className={styles.sideCardHeader}>
                  <div className={styles.sideCardHeadText}>
                    <div className={`uiSkeleton ${styles.detailSkeletonSideTitle}`} />
                  </div>
                  <div className={`uiSkeleton ${styles.detailSkeletonSideBtn}`} />
                </div>
                <div className={styles.capacityWrap}>
                  <div className={`uiSkeleton ${styles.detailSkeletonCapacityBar}`} />
                  <div className={`uiSkeleton ${styles.detailSkeletonCapacityText}`} />
                </div>
                <div className={styles.fileGrid}>
                  {Array.from({ length: DETAIL_FILE_SKELETON_COUNT }).map((_, index) => (
                    <div key={`detail-file-skeleton-${index}`} className={styles.fileCard}>
                      <div className={`uiSkeleton ${styles.detailSkeletonFileThumb}`} />
                      <div className={styles.fileFooter}>
                        <div className={`uiSkeleton ${styles.detailSkeletonFileName}`} />
                        <div className={`uiSkeleton ${styles.detailSkeletonFileMeta}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </main>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className={styles.page}>
        <div className={styles.scrollArea}>
          <div className={styles.centerState}>{tp.projectNotFound}</div>
        </div>
      </div>
    )
  }

  const files = projectFiles
  const capacityUsed = formatCapacity(files)
  const activeChatMenu = chatMenu ? projectChats.find((chat) => chat.id === chatMenu.id) ?? null : null
  const projectMetaItems = [
    { key: 'activity', label: tp.lastActivityLabel, value: relativeTime(project.lastActivityAt ?? project.updatedAt, tp) },
    { key: 'chats', label: tp.chatsLabel, value: projectChats.length },
    { key: 'files', label: tp.filesLabel, value: files.length },
  ]

  const handleChatMenuOpen = (event, chatId) => {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setChatMenu((current) => (
      current?.id === chatId
        ? null
        : {
            id: chatId,
            ...getFloatingMenuPosition(rect, chatMenuWidth, chatMenuHeight),
          }
    ))
  }

  const handleChatRename = (chatId) => {
    setChatMenu(null)
    setChatRenameTargetId(chatId)
    setShowChatRenameDialog(true)
  }

  const handleChatToggleStar = async (chatId) => {
    setChatMenu(null)
    await togglePin(chatId)
  }

  const handleChatChangeProject = (chatId) => {
    setChatMenu(null)
    setChatMoveTargetId(chatId)
    setShowMoveChatDialog(true)
  }

  const handleChatDelete = (chatId) => {
    setChatMenu(null)
    setChatDeleteTargetId(chatId)
    setShowChatDeleteDialog(true)
  }

  const handleChatRemoveFromProject = async (chatId) => {
    setChatMenu(null)
    await moveChatsToProject([chatId], null)
  }

  return (
    <div className={styles.page}>
      <div className={styles.scrollArea}>
        <header className={styles.header}>
          <div className={styles.headerGradient} />
          <div className={styles.headerInner}>
            <button type="button" className={styles.backLink} onClick={() => navigate(projectsListTarget)}>
              <ArrowLeft size={16} weight="regular" />
              <span>{tp.backToProjects}</span>
            </button>
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.primaryColumn}>
            <div className={styles.projectHead}>
              <div className={styles.projectHeadTop}>
                <h1 className={styles.projectTitle}>{project.name || tp.untitledProject}</h1>
                <div className={styles.projectActions}>
                  <button
                    type="button"
                    ref={menuBtnRef}
                    className={styles.iconBtn}
                    onClick={handleMenuOpen}
                    aria-label={tp.more}
                  >
                    <DotsThree size={20} weight="bold" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconBtn} ${project.isStarred ? styles.iconBtnActive : ''}`}
                    onClick={() => toggleProjectStar(project.id, !project.isStarred)}
                    aria-label={project.isStarred ? tp.unstarProject : tp.starProject}
                  >
                    <Star size={20} weight={project.isStarred ? 'fill' : 'regular'} color={project.isStarred ? '#f59e0b' : undefined} />
                  </button>
                </div>
              </div>
              <p className={`${styles.projectDescription} ${!project.description ? styles.projectDescriptionEmpty : ''}`}>
                {project.description || tp.projectDescriptionEmpty}
              </p>
              <div className={styles.projectMetaRow}>
                {projectMetaItems.map((item) => (
                  <div key={item.key} className={styles.projectMetaItem}>
                    <span className={styles.projectMetaLabel}>{item.label}</span>
                    <span className={styles.projectMetaValue}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.projectComposer}>
              <Composer
                centered
                composerValue={prompt}
                onComposerChange={setPrompt}
                onSend={handleSubmitPrompt}
                attachments={attachments}
                exitingAttachments={[]}
                onRemoveAttachment={(file) => setAttachments((prev) => prev.filter((a) => a !== file))}
                onPreviewAttachment={handlePreviewAttachment}
                isSending={isCreatingChat}
                onAddFiles={handleAddComposerFiles}
                fileInputRef={composerFileInputRef}
                showAttachMenu={showAttachMenu}
                setShowAttachMenu={setShowAttachMenu}
                researchMode={researchEnabled}
                setResearchMode={setResearchEnabled}
                webSearchMode={webSearchEnabled}
                setWebSearchMode={setWebSearchEnabled}
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
                chatId="new"
                onSelectModel={handleSelectModel}
                onTakeScreenshot={handleCaptureScreenshot}
                canCaptureScreen={canCaptureScreen}
                hideDisclaimer
                placeholder={tp.inputPlaceholder}
              />
            </div>

            <div className={styles.chatListWrap}>
              {projectChats.length > 0 ? (
                <ul className={styles.chatList}>
                  {projectChats.map((chat, index) => (
                    <li key={chat.id} className={`${styles.chatRow} ${index === 0 ? styles.chatRowFirst : ''} ${chat.isPinned ? styles.starredChatRow : ''}`}>
                      <button className={styles.chatLink} onClick={() => navigate(`/chats/${chat.id}`, { state: { from: `/projects/${project.id}` } })}>
                        <div className={styles.chatTopRow}>
                          <div className={styles.chatTitleCluster}>
                            <span className={styles.chatTitle}>{chat.title}</span>
                            {chat.isPinned ? (
                              <span className={styles.chatPinnedBadge}>
                                <Star size={10} weight="fill" />
                                <span>{tc.star}</span>
                              </span>
                            ) : null}
                          </div>
                          <span className={styles.chatTime}>{relativeTime(chat.lastActiveAt, tp)}</span>
                        </div>
                        <span className={styles.chatPreview}>{chat.preview || tc.lastMessage}</span>
                      </button>
                      <div className={styles.chatRowActions}>
                        <button
                          type="button"
                          className={styles.chatMoreBtn}
                          onClick={(event) => handleChatMenuOpen(event, chat.id)}
                          aria-label={`${tp.more}: ${chat.title}`}
                        >
                          <DotsThree size={18} weight="bold" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={styles.emptyChats}>
                  <span className={styles.emptyChatsTitle}>{tp.noProjectChats}</span>
                  <span className={styles.emptyChatsDesc}>{tp.noProjectChatsDesc}</span>
                </div>
              )}
            </div>
          </section>

          <aside className={styles.sidebar}>
            <section className={styles.sideCard}>
              <div className={styles.sideCardHeader}>
                <div className={styles.sideCardHeadText}>
                  <h3 className={styles.sideCardTitle}>{tp.instructionsTitle}</h3>
                  <p className={styles.sideCardHint}>{tp.instructionsHint}</p>
                </div>
                <button
                  type="button"
                  className={styles.sideCardIconBtn}
                  onClick={handleOpenInstructionsDialog}
                  aria-label={tp.editInstructions}
                >
                  {project.instructions ? <PencilSimple size={16} weight="regular" /> : <Plus size={16} weight="bold" />}
                </button>
              </div>
              {project.instructions ? (
                <div className={styles.instructionsContent}>
                  <p className={styles.instructionsText}>{project.instructions}</p>
                  {instructionsSavedAt ? (
                    <span className={styles.instructionsSavedText}>{`${tp.savedLabel} ${relativeTime(instructionsSavedAt, tp)}`}</span>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  className={styles.instructionsEmpty}
                  onClick={handleOpenInstructionsDialog}
                >
                  <span className={styles.instructionsEmptyIcon}>
                    <Lightbulb size={20} weight="regular" />
                  </span>
                  <span className={styles.instructionsEmptyTitle}>{tp.instructionsEmptyTitle}</span>
                  <span className={styles.instructionsEmptyDesc}>{tp.instructionsEmptyDesc}</span>
                </button>
              )}
            </section>

            <section className={styles.sideCard}>
              <div className={styles.sideCardHeader}>
                <div className={styles.sideCardHeadText}>
                  <h3 className={styles.sideCardTitle}>{tp.filesTitle}</h3>
                </div>
                <button
                  type="button"
                  className={styles.sideCardIconBtn}
                  onClick={() => projectFileInputRef.current?.click()}
                  aria-label={tp.addFiles}
                >
                  <Plus size={16} weight="bold" />
                </button>
              </div>

              {files.length > 0 ? (
                <>
                  <div className={styles.capacityWrap}>
                    <div className={styles.capacityBar}>
                      <div className={styles.capacityFill} style={{ width: `${capacityUsed}%` }} />
                    </div>
                    <span className={styles.capacityText}>{tp.capacityUsed.replace('{count}', capacityUsed)}</span>
                  </div>
                  <div className={styles.fileGrid}>
                    {files.map((file) => (
                      <AttachmentCard
                        key={file.id}
                        file={file}
                        onPreview={handlePreviewAttachment}
                        metaMode="size"
                        onRemove={async () => { await removeProjectFile(project.id, file.id); refreshProjectFiles() }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.emptyFiles}>
                  <Paperclip size={36} weight="regular" />
                  <span className={styles.emptyFilesTitle}>{tp.filesEmpty}</span>
                  <span className={styles.emptyFilesDesc}>{tp.filesHint}</span>
                </div>
              )}
            </section>
            <input
              ref={projectFileInputRef}
              type="file"
              className={styles.hiddenInput}
              multiple
              onChange={handleAddProjectFiles}
            />
          </aside>
        </main>
      </div>

      {showProjectMenu && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setShowProjectMenu(false)} />
          <div className={styles.menu} data-side={projectMenuPos.side} style={{ top: projectMenuPos.top, left: projectMenuPos.left }} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className={styles.menuItem} onClick={() => { setShowProjectMenu(false); setShowEditDetailsDialog(true) }}>
              <PencilSimple size={16} weight="regular" />
              <span>{tp.editDetails}</span>
            </button>
            <div className={styles.menuDivider} />
            <button type="button" className={styles.menuItem} onClick={() => { setShowProjectMenu(false); handleArchiveProject() }}>
              <Archive size={16} weight="regular" />
              <span>{tp.archive}</span>
            </button>
            <button type="button" className={`${styles.menuItem} ${styles.menuDelete}`} onClick={() => { setShowProjectMenu(false); setShowDeleteDialog(true) }}>
              <Trash size={16} weight="regular" />
              <span>{tp.delete}</span>
            </button>
          </div>
        </>,
        document.body
      )}

      {previewAttachment && createPortal(
        <>
          <div className={chatStyles.previewBackdrop} onClick={handleClosePreview} />
          <div className={chatStyles.previewModal} data-type={previewAttachment.previewType}>
            {previewAttachment.previewType === 'image' ? (
              <>
                <div className={chatStyles.previewImageHeader}>
                  <span className={chatStyles.previewImageName}>{previewAttachment.file.name}</span>
                </div>
                <div className={chatStyles.previewImageWrap}>
                  <AttachmentImage file={previewAttachment.file} alt={previewAttachment.file.name} className={chatStyles.previewImage} />
                  <button type="button" className={chatStyles.previewClose} onClick={handleClosePreview} aria-label="Close preview">
                    <X size={18} weight="bold" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={chatStyles.previewHeader}>
                  <div className={chatStyles.previewHeaderLeft}>
                    <span className={chatStyles.previewFileName}>{previewAttachment.file.name}</span>
                  </div>
                  <button type="button" className={chatStyles.previewClose} onClick={handleClosePreview} aria-label="Close preview">
                    <X size={18} weight="bold" />
                  </button>
                </div>
                <div className={chatStyles.previewTypeBar}>
                  <div className={chatStyles.previewTypeLeft}>
                    <span className={chatStyles.previewTypeIcon}>
                      {previewAttachment.previewType === 'pdf' && <FilePdf size={14} />}
                      {previewAttachment.previewType === 'csv' && <FileCsv size={14} />}
                      {previewAttachment.previewType === 'code' && <FileCode size={14} />}
                      {previewAttachment.previewType === 'text' && <FileText size={14} />}
                      {previewAttachment.previewType === 'markdown' && <FileText size={14} />}
                      {previewAttachment.previewType === 'file' && <File size={14} />}
                    </span>
                    <span className={chatStyles.previewTypeLabel}>
                      {previewAttachment.previewType === 'markdown' && 'Markdown'}
                      {previewAttachment.previewType === 'code' && 'Code'}
                      {previewAttachment.previewType === 'text' && 'Text'}
                      {previewAttachment.previewType === 'csv' && 'Spreadsheet'}
                      {previewAttachment.previewType === 'pdf' && 'PDF Document'}
                      {previewAttachment.previewType === 'file' && 'File'}
                    </span>
                  </div>
                  <button type="button" className={chatStyles.previewCopyBtn} onClick={handleCopyCode} aria-label="Copy content">
                    {codeCopied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="regular" />}
                    <span>{codeCopied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div className={chatStyles.previewBody}>
                  {previewAttachment.previewType === 'markdown' ? (
                    previewContent ? (
                      <div className={chatStyles.previewMarkdown}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className={chatStyles.previewFileCenter}><div className={chatStyles.previewFileHint}>Preview content is not available for this stored attachment.</div></div>
                    )
                  ) : (
                    previewContent ? (
                      <div className={chatStyles.previewCodeWrap}>
                        <div className={chatStyles.previewLineNumbers}>
                          {previewContent.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}
                        </div>
                        <pre className={chatStyles.previewCode}><code>{previewContent}</code></pre>
                      </div>
                    ) : (
                      <div className={chatStyles.previewFileCenter}><div className={chatStyles.previewFileHint}>Preview content is not available for this stored attachment.</div></div>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </>,
        document.body,
      )}

      {activeChatMenu && createPortal(
        <>
          <div className={styles.menuBackdrop} onClick={() => setChatMenu(null)} />
          <div className={styles.menu} data-side={chatMenu.side} style={{ top: chatMenu.top, left: chatMenu.left }} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className={styles.menuItem} onClick={() => handleChatToggleStar(activeChatMenu.id)}>
              <Star size={16} weight={activeChatMenu.isPinned ? 'fill' : 'regular'} />
              <span>{activeChatMenu.isPinned ? tc.unstar : tc.star}</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={() => handleChatRename(activeChatMenu.id)}>
              <PencilSimple size={16} weight="regular" />
              <span>{tc.rename}</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={() => handleChatChangeProject(activeChatMenu.id)}>
              <SquaresFour size={16} weight="regular" />
              <span>{tc.changeProject}</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={() => handleChatRemoveFromProject(activeChatMenu.id)}>
              <X size={16} weight="regular" />
              <span>{tc.removeFromProject}</span>
            </button>
            <div className={styles.menuDivider} />
            <button type="button" className={`${styles.menuItem} ${styles.menuDelete}`} onClick={() => handleChatDelete(activeChatMenu.id)}>
              <Trash size={16} weight="regular" />
              <span>{tc.delete}</span>
            </button>
          </div>
        </>,
        document.body
      )}

      {showEditDetailsDialog && (
        <EditDetailsDialog
          title={tp.editDetails}
          nameValue={project.name}
          descriptionValue={project.description || ''}
          permissionsValue={project.permissions || {}}
          nameLabel={tp.projectNameLabel}
          descriptionLabel={tp.projectDescriptionLabel}
          namePlaceholder={tp.projectNamePlaceholder}
          descriptionPlaceholder={tp.projectDescriptionPlaceholder}
          onConfirm={async (nextValues) => {
            setShowEditDetailsDialog(false)
            await updateProjectDetails(project.id, nextValues)
          }}
          onCancel={() => setShowEditDetailsDialog(false)}
          cancelText={tp.cancel}
          confirmText={tp.confirm}
        />
      )}

      {showInstructionsDialog && (
        <ProjectInstructionsDialog
          title={tp.instructionsDialogTitle}
          description={tp.instructionsDialogDescription.replace('{project}', project.name || tp.untitledProject)}
          value={instructionsDraft}
          placeholder={tp.instructionsDialogPlaceholder}
          placeholderRotations={[
            tp.instructionsDialogPlaceholder,
            tp.instructionsDialogPlaceholderAlt1,
            tp.instructionsDialogPlaceholderAlt2,
          ]}
          onChange={setInstructionsDraft}
          onSave={handleSaveInstructions}
          onCancel={() => {
            setInstructionsDraft(project.instructions || '')
            setShowInstructionsDialog(false)
          }}
          cancelText={tp.cancel}
          confirmText={tp.saveInstructions}
        />
      )}

      {showChatRenameDialog && (
        <RenameDialog
          title={tc.rename}
          value={projectChats.find((chat) => chat.id === chatRenameTargetId)?.title || ''}
          onConfirm={async (nextName) => {
            await renameChat(chatRenameTargetId, nextName)
            setShowChatRenameDialog(false)
            setChatRenameTargetId(null)
          }}
          onCancel={() => {
            setShowChatRenameDialog(false)
            setChatRenameTargetId(null)
          }}
          cancelText={tc.cancel}
          confirmText={tc.confirm}
        />
      )}

      {showMoveChatDialog && (
        <MoveDialog
          t={tc}
          count={1}
          title={tc.changeProject}
          description={tc.changeProjectDesc}
          excludeProjectIds={project?.id ? [project.id] : []}
          onMove={async (nextProjectIdOrName) => {
            const nextProjectId = await resolveProjectId(nextProjectIdOrName)
            if (!nextProjectId) return
            await moveChatsToProject([chatMoveTargetId], nextProjectId)
            setShowMoveChatDialog(false)
            setChatMoveTargetId(null)
          }}
          onCancel={() => {
            setShowMoveChatDialog(false)
            setChatMoveTargetId(null)
          }}
        />
      )}

      {showDeleteDialog && (
        <ConfirmDialog
          title={tp.confirmDelete}
          description=""
          confirmText={tp.delete}
          cancelText={tp.cancel}
          onConfirm={handleDeleteProject}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}

      {showChatDeleteDialog && (
        <ConfirmDialog
          title={tc.confirmDelete}
          description=""
          confirmText={tc.delete}
          cancelText={tc.cancel}
          onConfirm={async () => {
            await deleteChat(chatDeleteTargetId)
            setShowChatDeleteDialog(false)
            setChatDeleteTargetId(null)
          }}
          onCancel={() => {
            setShowChatDeleteDialog(false)
            setChatDeleteTargetId(null)
          }}
        />
      )}
    </div>
  )
}
