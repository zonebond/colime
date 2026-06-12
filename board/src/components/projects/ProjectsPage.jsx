import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useProjectsModel } from '@/features/projects/projects.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import ConfirmDialog from '@/components/chats/ConfirmDialog'
import EditDetailsDialog from './EditDetailsDialog'
import ProjectItem from './ProjectItem'
import styles from './ProjectsPage.module.css'

const SORT_OPTIONS = ['recent-activity', 'last-edited', 'date-created']
const PROJECT_SKELETON_COUNT = 6

export default function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { projects, loading, createProject, updateProjectDetails, toggleProjectStar, archiveProject, deleteProject } = useProjectsModel()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDetailsDialog, setShowEditDetailsDialog] = useState(false)
  const [editDetailsTargetId, setEditDetailsTargetId] = useState(null)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef(null)

  const tp = t('projects') || {}
  const search = searchParams.get('search') ?? ''
  const sortBy = SORT_OPTIONS.includes(searchParams.get('sort'))
    ? searchParams.get('sort')
    : 'recent-activity'

  useEffect(() => {
    const rawSort = searchParams.get('sort')
    if (!rawSort || SORT_OPTIONS.includes(rawSort)) return

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('sort', 'recent-activity')
    setSearchParams(nextParams, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!sortMenuOpen) return undefined

    function handleClickOutside(event) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target)) {
        setSortMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [sortMenuOpen])

  const filtered = useMemo(() => {
    const visibleProjects = projects.filter((p) => {
      if (p.isArchived) return false
      const q = search.toLowerCase().trim()
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q))
    })

    return visibleProjects.sort((a, b) => {
      const aStar = a.isStarred ? 1 : 0
      const bStar = b.isStarred ? 1 : 0
      if (aStar !== bStar) return bStar - aStar

      if (sortBy === 'date-created') {
        return (b.createdAt ?? 0) - (a.createdAt ?? 0)
      }

      if (sortBy === 'last-edited') {
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      }

      return (b.lastActivityAt ?? b.updatedAt ?? 0) - (a.lastActivityAt ?? a.updatedAt ?? 0)
    })
  }, [projects, search, sortBy])

  const sortOptions = [
    { id: 'recent-activity', label: tp.sortRecentActivity },
    { id: 'last-edited', label: tp.sortLastEdited },
    { id: 'date-created', label: tp.sortDateCreated },
  ]

  const currentSortLabel =
    sortBy === 'last-edited'
      ? tp.sortByEdited
      : sortBy === 'date-created'
        ? tp.sortByCreated
        : tp.sortByActivity

  const handleNewProject = () => {
    setShowCreateDialog(true)
  }

  const handleCreateProjectConfirm = async (nextValues) => {
    setShowCreateDialog(false)
    await createProject(nextValues)
  }

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

  const handleProjectClick = (id) => {
    const nextSearch = searchParams.toString()
    navigate({
      pathname: `/projects/${id}`,
      search: nextSearch ? `?${nextSearch}` : '',
    })
  }

  const handleEditDetails = (id) => {
    setEditDetailsTargetId(id)
    setShowEditDetailsDialog(true)
  }

  const handleEditDetailsConfirm = async (nextValues) => {
    const targetId = editDetailsTargetId
    setShowEditDetailsDialog(false)
    setEditDetailsTargetId(null)
    await updateProjectDetails(targetId, nextValues)
  }

  const handleDeleteConfirm = async () => {
    await deleteProject(deleteTargetId)
    setShowDeleteDialog(false)
    setDeleteTargetId(null)
  }

  const handleDelete = (id) => {
    setDeleteTargetId(id)
    setShowDeleteDialog(true)
  }

  const handleToggleStar = async (id, pinned) => {
    await toggleProjectStar(id, pinned)
  }

  const handleArchive = async (id) => {
    await archiveProject(id)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>{tp.title}</h1>
          <button className={styles.newBtn} onClick={handleNewProject}>
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z" />
            </svg>
            {tp.newProject}
          </button>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.listViewport}>
          <div className={styles.toolbarSticky}>
            <div className={styles.toolbar}>
              <div className={styles.searchWrap}>
                <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8.5 2a6.5 6.5 0 0 1 4.935 10.728l4.419 4.419.064.078a.5.5 0 0 1-.693.693l-.079-.064-4.419-4.42A6.5 6.5 0 1 1 8.5 2m0 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11" />
                </svg>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder={tp.searchPlaceholder}
                    value={searchDraft}
                    onChange={handleSearchChange}
                    onCompositionStart={handleSearchCompositionStart}
                    onCompositionEnd={handleSearchCompositionEnd}
                  />
              </div>
              <div className={styles.toolbarRight}>
                <span className={styles.sortLabel}>{tp.sortBy}</span>
                <div className={styles.sortMenuWrap} ref={sortMenuRef}>
                  <button
                    className={styles.sortBtn}
                    onClick={() => setSortMenuOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={sortMenuOpen}
                    aria-label={tp.sortProjects}
                  >
                    <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                      <path d="M128,128a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16h72A8,8,0,0,1,128,128ZM48,72H184a8,8,0,0,0,0-16H48a8,8,0,0,0,0,16Zm56,112H48a8,8,0,0,0,0,16h56a8,8,0,0,0,0-16Zm125.66-21.66a8,8,0,0,0-11.32,0L192,188.69V112a8,8,0,0,0-16,0v76.69l-26.34-26.35a8,8,0,0,0-11.32,11.32l40,40a8,8,0,0,0,11.32,0l40-40A8,8,0,0,0,229.66,162.34Z" />
                    </svg>
                    <span className={styles.sortValue}>{currentSortLabel}</span>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className={styles.sortChevron}>
                      <path d="M14.128 7.165a.502.502 0 0 1 .744.67l-4.5 5-.078.07a.5.5 0 0 1-.666-.07l-4.5-5-.06-.082a.501.501 0 0 1 .729-.656l.075.068L10 11.752z" />
                    </svg>
                  </button>

                  {sortMenuOpen && (
                    <div className={styles.sortMenu} role="menu">
                      {sortOptions.map((option) => (
                        <button
                          key={option.id}
                          className={`${styles.sortMenuItem} ${sortBy === option.id ? styles.sortMenuItemActive : ''}`}
                          onClick={() => {
                            updateQuery({ sort: option.id })
                            setSortMenuOpen(false)
                          }}
                        >
                          <span>{option.label}</span>
                          {sortBy === option.id && <span className={styles.sortMenuCheck}>✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.grid}>
            {loading ? (
              Array.from({ length: PROJECT_SKELETON_COUNT }).map((_, index) => (
                <div key={`project-skeleton-${index}`} className={styles.projectSkeletonCard}>
                  <div className={`uiSkeleton ${styles.projectSkeletonTitle}`} />
                  <div className={`uiSkeleton ${styles.projectSkeletonLine}`} />
                  <div className={`uiSkeleton ${styles.projectSkeletonLineShort}`} />
                  <div className={styles.projectSkeletonFooter}>
                    <div className={`uiSkeleton ${styles.projectSkeletonTime}`} />
                    <div className={`uiSkeleton ${styles.projectSkeletonAction}`} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>{search ? tp.noResults : tp.noProjects}</p>
                <p className={styles.emptyDesc}>{search ? tp.noResultsDesc : tp.noProjectsDesc}</p>
              </div>
            ) : (
              filtered.map((project, index) => (
                <ProjectItem
                  key={project.id}
                  project={project}
                  index={index}
                  onClick={handleProjectClick}
                  onEditDetails={handleEditDetails}
                  onArchive={handleArchive}
                  onToggleStar={handleToggleStar}
                  onDelete={handleDelete}
                  t={tp}
                />
              ))
            )}
          </div>
        </div>

        <div className={styles.listFade} />
      </div>

      {showDeleteDialog && (
        <ConfirmDialog
          title={tp.confirmDelete}
          description=""
          confirmText={tp.delete}
          cancelText={tp.cancel}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteDialog(false)
            setDeleteTargetId(null)
          }}
        />
      )}

      {showCreateDialog && (
        <EditDetailsDialog
          title={tp.newProject}
          nameValue=""
          descriptionValue=""
          nameLabel={tp.createProjectNameLabel}
          descriptionLabel={tp.createProjectDescriptionLabel}
          namePlaceholder={tp.createProjectNamePlaceholder}
          descriptionPlaceholder={tp.createProjectDescriptionPlaceholder}
          onConfirm={handleCreateProjectConfirm}
          onCancel={() => setShowCreateDialog(false)}
          cancelText={tp.cancel}
          confirmText={tp.create}
        />
      )}

      {showEditDetailsDialog && (
        <EditDetailsDialog
          title={tp.editDetails}
          nameValue={projects.find((p) => p.id === editDetailsTargetId)?.name || ''}
          descriptionValue={projects.find((p) => p.id === editDetailsTargetId)?.description || ''}
          nameLabel={tp.projectNameLabel}
          descriptionLabel={tp.projectDescriptionLabel}
          namePlaceholder={tp.projectNamePlaceholder}
          descriptionPlaceholder={tp.projectDescriptionPlaceholder}
          onConfirm={handleEditDetailsConfirm}
          onCancel={() => {
            setShowEditDetailsDialog(false)
            setEditDetailsTargetId(null)
          }}
          cancelText={tp.cancel}
          confirmText={tp.confirm}
        />
      )}
    </div>
  )
}
