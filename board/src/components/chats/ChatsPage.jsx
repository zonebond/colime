import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { IconProjects, IconTrash, IconX } from '@/components/icons'
import { Funnel } from '@phosphor-icons/react'
import { useChatsModel } from '@/features/chats/chats.hooks'
import { useProjectsModel } from '@/features/projects/projects.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import ChatItem from './ChatItem'
import EmptyState from './EmptyState'
import ConfirmDialog from './ConfirmDialog'
import MoveDialog from './MoveDialog'
import RenameDialog from './RenameDialog'
import styles from './ChatsPage.module.css'

const CHAT_SKELETON_COUNT = 8
const FILTER_OPTIONS = ['all', 'main', 'sub']

export default function ChatsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMoveDialog, setShowMoveDialog] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameTargetId, setRenameTargetId] = useState(null)
  const [excludeProjectIds, setExcludeProjectIds] = useState([])
  const {
    chats,
    loading,
    togglePin,
    archiveChat,
    deleteChat,
    deleteChats,
    renameChat,
    moveChatsToProject,
  } = useChatsModel()
  const { createProject, projects } = useProjectsModel()
  const barCheckRef = useRef(null)
  const resolveProjectId = useCallback(async (projectIdOrName) => {
    if (projects.some((project) => project.id === projectIdOrName)) {
      return projectIdOrName
    }

    const newProject = await createProject({ name: projectIdOrName })
    return newProject?.id ?? null
  }, [createProject, projects])

  const tc = t('chats')
  const search = searchParams.get('search') ?? ''
  const filter = FILTER_OPTIONS.includes(searchParams.get('filter'))
    ? searchParams.get('filter')
    : 'all'
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const filterMenuRef = useRef(null)

  const updateQuery = (updates) => {
    const nextParams = new URLSearchParams(searchParams)

    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key)
      } else {
        nextParams.set(key, value)
      }
    })

    setSearchParams(nextParams, { replace: true })
  }

  const {
    value: searchDraft,
    handleChange: handleSearchChange,
    handleCompositionStart: handleSearchCompositionStart,
    handleCompositionEnd: handleSearchCompositionEnd,
  } = useImeSafeInput({
    value: search,
    onCommit: (value) => updateQuery({ search: value }),
    debounceMs: 160,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return chats
      .filter((chat) => !chat.isArchived)
      .filter((chat) => {
        if (filter === 'main') return !chat._parentID
        if (filter === 'sub') return !!chat._parentID
        return true
      })
      .filter((chat) => !q || chat.title.toLowerCase().includes(q) || chat.preview.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1
        return b.lastActiveAt - a.lastActiveAt
      })
  }, [chats, search, filter])

  const selectAll = filtered.length > 0 && filtered.every((chat) => selectedIds.includes(chat.id))
  const selectIndeterminate = !selectAll && selectedIds.length > 0 && selectedIds.length < filtered.length

  useEffect(() => {
    if (barCheckRef.current) {
      barCheckRef.current.indeterminate = selectIndeterminate
    }
  }, [selectIndeterminate])

  useEffect(() => {
    if (!filterMenuOpen) return undefined

    function handleClickOutside(event) {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setFilterMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterMenuOpen])

  const filterOptions = [
    { id: 'all', label: tc.filterAll },
    { id: 'main', label: tc.filterMain },
    { id: 'sub', label: tc.filterSub },
  ]

  const currentFilterLabel = filter === 'main'
    ? tc.filterMain
    : filter === 'sub'
      ? tc.filterSub
      : tc.filterAll

  const handleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleSelectAll = (checked) => {
    if (checked) setSelectedIds(filtered.map((chat) => chat.id))
    else setSelectedIds([])
  }

  const handleToggleSelectMode = () => {
    if (selectedIds.length > 0) {
      setSelectedIds([])
    } else {
      setSelectedIds(filtered.map((chat) => chat.id))
    }
  }

  const handleMoveToProject = () => {
    // Exclude all projects that selected chats are already in
    const exclude = [...new Set(
      chats
        .filter((c) => selectedIds.includes(c.id) && c.projectId)
        .map((c) => c.projectId)
    )]
    setExcludeProjectIds(exclude)
    setShowMoveDialog(true)
  }

  const handleMove = async (projectIdOrName) => {
    const projectId = await resolveProjectId(projectIdOrName)
    if (!projectId) return
    await moveChatsToProject(selectedIds, projectId)
    setShowMoveDialog(false)
    setSelectedIds([])
  }

  const handleRemoveFromProject = async (chatId) => {
    await moveChatsToProject([chatId], null)
  }

  const handleNewChat = useCallback(() => {
    navigate('/chats/new')
  }, [navigate])

  const handlePin = (id) => {
    togglePin(id)
  }

  const handleArchive = (id) => {
    archiveChat(id)
    setSelectedIds((prev) => prev.filter((item) => item !== id))
  }

  const handleDelete = (id) => {
    deleteChat(id)
    setSelectedIds((prev) => prev.filter((item) => item !== id))
  }

  const handleRename = (id) => {
    setRenameTargetId(id)
    setShowRenameDialog(true)
  }

  const handleRenameConfirm = async (newTitle) => {
    await renameChat(renameTargetId, newTitle)
    setShowRenameDialog(false)
    setRenameTargetId(null)
  }

  const handleAddToProject = (chatId) => {
    const chat = chats.find((c) => c.id === chatId)
    setSelectedIds([chatId])
    setExcludeProjectIds(chat?.projectId ? [chat.projectId] : [])
    setShowMoveDialog(true)
  }

  const handleChatClick = (id) => {
    const nextSearch = searchParams.toString()
    navigate({
      pathname: `/chats/${id}`,
      search: nextSearch ? `?${nextSearch}` : '',
    })
  }

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'N' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        handleNewChat()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNewChat])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerSpacer} />
        <div className={styles.headerItems}>
          <h1 className={styles.title}>{tc.title}</h1>
          <button className={styles.newBtn} onClick={handleNewChat}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="7" y1="1" x2="7" y2="13" />
              <line x1="1" y1="7" x2="13" y2="7" />
            </svg>
            {tc.newChat}
          </button>
        </div>
      </header>

      <div className={styles.searchWrap}>
        <div className={styles.searchSpacer} />
        <div className={styles.searchContent}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="6.5" cy="6.5" r="5" />
            <line x1="10" y1="10" x2="14.5" y2="14.5" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder={tc.searchPlaceholder}
            value={searchDraft}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
          />
        </div>
        <div className={styles.filterWrap} ref={filterMenuRef}>
          <button
            className={styles.filterBtn}
            onClick={() => setFilterMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={filterMenuOpen}
          >
            <Funnel size={16} weight="regular" />
            <span className={styles.filterValue}>{currentFilterLabel}</span>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={styles.filterChevron}>
              <path d="M14.128 7.165a.502.502 0 0 1 .744.67l-4.5 5-.078.07a.5.5 0 0 1-.666-.07l-4.5-5-.06-.082a.501.501 0 0 1 .729-.656l.075.068L10 11.752z" />
            </svg>
          </button>

          {filterMenuOpen && (
            <div className={styles.filterMenu} role="menu">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.filterMenuItem} ${filter === option.id ? styles.filterMenuItemActive : ''}`}
                  onClick={() => {
                    updateQuery({ filter: option.id === 'all' ? '' : option.id })
                    setFilterMenuOpen(false)
                  }}
                >
                  <span>{option.label}</span>
                  {filter === option.id && <span className={styles.filterMenuCheck}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className={`${styles.bar} ${(selectAll || selectIndeterminate) ? styles.barActive : ''}`}>
        <div className={styles.barCheckWrap}>
          <input
            ref={barCheckRef}
            type="checkbox"
            className={styles.barCheck}
            checked={selectAll}
            onChange={(event) => handleSelectAll(event.target.checked)}
          />
        </div>
        <div className={styles.barContent}>
          <span className={styles.barLabel}>
            {selectedIds.length > 0 ? (
              <>
                <span className={styles.barCount}>{selectedIds.length}</span> selected
              </>
            ) : (
              tc.yourChats
            )}
          </span>
          {selectedIds.length > 0 ? (
            <div className={styles.barActions}>
              <button className={styles.actionBtn} onClick={handleMoveToProject} data-tooltip={tc.moveToProjectTooltip.replace('{count}', selectedIds.length).replace('{sCount}', selectedIds.length > 1 ? 's' : '')}>
                <IconProjects />
              </button>
              <button className={styles.actionBtn} onClick={() => setShowDeleteDialog(true)} data-tooltip={tc.deleteSelectedTooltip.replace('{count}', selectedIds.length).replace('{sCount}', selectedIds.length > 1 ? 's' : '')}>
                <IconTrash />
              </button>
            </div>
          ) : (
            <button className={styles.selectBtn} onClick={handleToggleSelectMode}>
              {tc.select}
            </button>
          )}
        </div>
        {selectedIds.length > 0 && (
          <button className={styles.closeBtn} onClick={() => setSelectedIds([])} data-tooltip={tc.cancel}>
            <IconX />
          </button>
        )}
      </div>

      <div className={styles.list}>
        {loading ? (
          Array.from({ length: CHAT_SKELETON_COUNT }).map((_, index) => (
            <div key={`chat-skeleton-${index}`} className={styles.chatSkeletonRow}>
              <div className={styles.chatSkeletonSpacer} />
              <div className={styles.chatSkeletonContent}>
                <div className={styles.chatSkeletonText}>
                  <div className={`uiSkeleton ${styles.chatSkeletonTitle}`} />
                  <div className={`uiSkeleton ${styles.chatSkeletonPreview}`} />
                  <div className={`uiSkeleton ${styles.chatSkeletonTime}`} />
                </div>
                <div className={styles.chatSkeletonActions}>
                  <div className={`uiSkeleton ${styles.chatSkeletonAction}`} />
                  <div className={`uiSkeleton ${styles.chatSkeletonAction}`} />
                </div>
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <EmptyState type={search ? 'no-results' : 'no-chats'} t={tc} />
        ) : (
          filtered.map((chat, index) => (
            <ChatItem
              key={chat.id}
              chat={chat}
              index={index}
              isActive={false}
              selected={selectedIds.includes(chat.id)}
              onSelect={handleSelect}
              onClick={handleChatClick}
              onPin={handlePin}
              onArchive={handleArchive}
              onRename={handleRename}
              onAddToProject={handleAddToProject}
              onRemoveFromProject={handleRemoveFromProject}
              onDelete={handleDelete}
              t={tc}
            />
          ))
        )}
      </div>
      <div className={styles.listFade} />

      {showDeleteDialog && (
        <ConfirmDialog
          title={tc.deleteConfirmTitle.replace('{count}', selectedIds.length).replace('{sCount}', selectedIds.length > 1 ? 's' : '')}
          description={tc.deleteConfirmDesc}
          confirmText={tc.delete}
          cancelText={tc.cancel}
          onConfirm={() => {
            setShowDeleteDialog(false)
            deleteChats(selectedIds)
            setSelectedIds([])
          }}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}

      {showMoveDialog && (
        <MoveDialog
          t={tc}
          count={selectedIds.length}
          excludeProjectIds={excludeProjectIds}
          onMove={handleMove}
          onCancel={() => setShowMoveDialog(false)}
        />
      )}

      {showRenameDialog && (
        <RenameDialog
          title={tc.rename}
          value={chats.find((chat) => chat.id === renameTargetId)?.title || ''}
          onConfirm={handleRenameConfirm}
          onCancel={() => {
            setShowRenameDialog(false)
            setRenameTargetId(null)
          }}
          cancelText={tc.cancel}
          confirmText={tc.confirm || 'Confirm'}
        />
      )}
    </div>
  )
}
