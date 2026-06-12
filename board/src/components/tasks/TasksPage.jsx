import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useTasksModel } from '@/features/tasks/tasks.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import ConfirmDialog from '@/components/chats/ConfirmDialog'
import TaskDialog from './TaskDialog'
import TaskItem from './TaskItem'
import styles from './TasksPage.module.css'

const FILTER_OPTIONS = [
  { id: 'all', labelKey: 'tasks.filterAll' },
  { id: 'scheduled', labelKey: 'tasks.filterScheduled' },
  { id: 'running', labelKey: 'tasks.filterRunning' },
  { id: 'paused', labelKey: 'tasks.filterPaused' },
  { id: 'failed', labelKey: 'tasks.filterFailed' },
]

const TASK_SKELETON_COUNT = 5

export default function TasksPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { tasks, loading, createTask, updateTask, deleteTask, togglePause, triggerTask } = useTasksModel()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [showTaskDialog, setShowTaskDialog] = useState(false)
  const [editTargetTask, setEditTargetTask] = useState(null)

  const tp = t('tasks') || {}
  const search = searchParams.get('search') ?? ''
  const filter = searchParams.get('filter') ?? 'all'

  useEffect(() => {
    const rawFilter = searchParams.get('filter')
    if (rawFilter && !FILTER_OPTIONS.find((f) => f.id === rawFilter)) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('filter', 'all')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const filtered = useMemo(() => {
    let result = tasks

    if (filter !== 'all') {
      result = result.filter((task) => task.status === filter)
    }

    const q = search.toLowerCase().trim()
    if (q) {
      result = result.filter(
        (task) =>
          task.name.toLowerCase().includes(q) ||
          task.description?.toLowerCase().includes(q) ||
          task.cronExpression?.toLowerCase().includes(q)
      )
    }

    return result.sort((a, b) => {
      // Sort by next run time (null values last)
      if (a.nextRunAt && !b.nextRunAt) return -1
      if (!a.nextRunAt && b.nextRunAt) return 1
      if (a.nextRunAt && b.nextRunAt) return a.nextRunAt - b.nextRunAt
      return (b.createdAt ?? 0) - (a.createdAt ?? 0)
    })
  }, [tasks, filter, search])

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

  const handleNewTask = () => {
    setEditTargetTask(null)
    setShowTaskDialog(true)
  }

  const handleEditTask = (task) => {
    setEditTargetTask(task)
    setShowTaskDialog(true)
  }

  const handleCreateTaskConfirm = async (nextValues) => {
    setShowTaskDialog(false)
    await createTask(nextValues)
  }

  const handleUpdateTaskConfirm = async (nextValues) => {
    setShowTaskDialog(false)
    if (editTargetTask) {
      await updateTask(editTargetTask.id, nextValues)
    }
    setEditTargetTask(null)
  }

  const handleDeleteConfirm = async () => {
    await deleteTask(deleteTargetId)
    setShowDeleteDialog(false)
    setDeleteTargetId(null)
  }

  const handleDelete = (id) => {
    setDeleteTargetId(id)
    setShowDeleteDialog(true)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>{tp.title || t('sidebar.tasks')}</h1>
          <button className={styles.newBtn} onClick={handleNewTask}>
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z" />
            </svg>
            {tp.newTask}
          </button>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.toolbarSticky}>
          <div className={styles.toolbar}>
            <div className={styles.filterTabs}>
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`${styles.filterTab} ${filter === option.id ? styles.filterTabActive : ''}`}
                  onClick={() => updateQuery({ filter: option.id === 'all' ? null : option.id })}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>

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
          </div>
        </div>

        <div className={styles.listViewport}>
          <div className={styles.list}>
            {loading ? (
              Array.from({ length: TASK_SKELETON_COUNT }).map((_, index) => (
                <div key={`task-skeleton-${index}`} className={styles.taskSkeletonCard}>
                  <div className={`uiSkeleton ${styles.taskSkeletonTitle}`} />
                  <div className={`uiSkeleton ${styles.taskSkeletonLine}`} />
                  <div className={styles.taskSkeletonFooter}>
                    <div className={`uiSkeleton ${styles.taskSkeletonMeta}`} />
                    <div className={`uiSkeleton ${styles.taskSkeletonBadge}`} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>{search ? tp.noResults : tp.noTasks}</p>
                <p className={styles.emptyDesc}>{search ? tp.noResultsDesc : tp.noTasksDesc}</p>
              </div>
            ) : (
              filtered.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  onEdit={handleEditTask}
                  onDelete={handleDelete}
                  onTogglePause={() => togglePause(task.id)}
                  onTrigger={() => triggerTask(task.id)}
                  t={t}
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

      {showTaskDialog && (
        <TaskDialog
          title={editTargetTask ? tp.editTask : tp.newTask}
          task={editTargetTask}
          onConfirm={editTargetTask ? handleUpdateTaskConfirm : handleCreateTaskConfirm}
          onCancel={() => {
            setShowTaskDialog(false)
            setEditTargetTask(null)
          }}
          cancelText={tp.cancel}
          confirmText={editTargetTask ? tp.save : tp.create}
          pendingText={tp.savingChanges}
          t={t}
        />
      )}
    </div>
  )
}
