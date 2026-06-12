import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadTasks,
  loadTask,
  createTaskAndReturn,
  createTaskAndReload,
  updateTaskAndReload,
  updateTaskAndReturn,
  deleteTaskAndReload,
  toggleTaskPauseAndReload,
  toggleTaskPauseAndReturn,
  triggerTaskAndReload,
  triggerTaskAndReturn,
} from './tasks.actions'

const TASKS_STALE_TIME = 30_000

const tasksCache = {
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

function getTasksSnapshot() {
  return {
    tasks: tasksCache.data ?? [],
    loading: tasksCache.data === null && Boolean(tasksCache.promise),
    error: tasksCache.error,
  }
}

function emitTasksSnapshot() {
  const snapshot = getTasksSnapshot()
  tasksCache.listeners.forEach((listener) => listener(snapshot))
}

function subscribeTasks(listener) {
  tasksCache.listeners.add(listener)
  return () => tasksCache.listeners.delete(listener)
}

function setTasksData(nextTasks) {
  tasksCache.data = nextTasks
  tasksCache.error = null
  tasksCache.fetchedAt = Date.now()
  emitTasksSnapshot()
}

function replaceCachedTask(tempId, nextTask) {
  const current = tasksCache.data ?? []
  const hasTempTask = current.some((task) => task.id === tempId)
  const nextTasks = hasTempTask
    ? current.map((task) => (task.id === tempId ? nextTask : task))
    : [nextTask, ...current]

  setTasksData(nextTasks)
}

function setTasksError(error) {
  tasksCache.error = error
  emitTasksSnapshot()
}

function hasFreshTasks() {
  return tasksCache.data !== null && (Date.now() - tasksCache.fetchedAt) < TASKS_STALE_TIME
}

async function ensureTasks(options = {}) {
  const { force = false } = options

  if (!force && hasFreshTasks()) {
    return tasksCache.data
  }

  if (tasksCache.promise) {
    return tasksCache.promise
  }

  const request = loadTasks()
    .then((nextTasks) => {
      setTasksData(nextTasks)
      return nextTasks
    })
    .catch((error) => {
      setTasksError(getErrorMessage(error))
      throw error
    })
    .finally(() => {
      tasksCache.promise = null
      emitTasksSnapshot()
    })

  tasksCache.promise = request
  emitTasksSnapshot()
  return request
}

async function runTasksMutation(action, args, optimisticUpdater) {
  tasksCache.error = null

  const previousTasks = tasksCache.data

  if (optimisticUpdater) {
    tasksCache.data = optimisticUpdater(previousTasks ?? [])
    emitTasksSnapshot()
  }

  try {
    const nextTasks = await action(...args)
    setTasksData(nextTasks)
    return nextTasks
  } catch (error) {
    if (optimisticUpdater) {
      tasksCache.data = previousTasks
    }
    setTasksError(getErrorMessage(error))
    return null
  }
}

export function useTasksModel() {
  const [state, setState] = useState(() => getTasksSnapshot())

  useEffect(() => subscribeTasks(setState), [])

  useEffect(() => {
    if (tasksCache.data === null) {
      ensureTasks()
      return
    }

    if (!hasFreshTasks()) {
      ensureTasks({ force: true })
    }
  }, [])

  const refresh = useCallback(() => ensureTasks({ force: true }), [])

  const runMutation = useCallback((action, ...args) => runTasksMutation(action, args), [])

  const runOptimisticMutation = useCallback(
    (optimisticUpdater, action, ...args) => runTasksMutation(action, args, optimisticUpdater),
    []
  )

  return {
    tasks: state.tasks,
    loading: state.loading,
    error: state.error,
    refresh,
    createTask: async (input) => {
      tasksCache.error = null
      const previousTasks = tasksCache.data
      const createdAt = Date.now()
      const tempId = createOptimisticId()
      const nextRunAt = input.type === 'once'
        ? (input.scheduledAt || Date.now() + 3600000)
        : input.type === 'interval'
          ? Date.now() + (input.intervalMs || 3600000)
          : Date.now() + 3600000

      const optimisticTask = {
        id: tempId,
        name: input.name || 'New scheduled task',
        description: input.description || '',
        type: input.type || 'cron',
        status: 'scheduled',
        cronExpression: input.type === 'cron' ? (input.cronExpression || '0 * * * *') : null,
        timezone: input.timezone || 'UTC',
        intervalMs: input.type === 'interval' ? (input.intervalMs || 3600000) : null,
        scheduledAt: input.type === 'once' ? (input.scheduledAt || Date.now() + 3600000) : null,
        nextRunAt,
        lastRunAt: null,
        lastRunStatus: null,
        config: input.config || {},
        createdAt,
        updatedAt: createdAt,
      }

      tasksCache.data = [optimisticTask, ...(previousTasks ?? [])]
      emitTasksSnapshot()

      try {
        const createdTask = await createTaskAndReturn(input)
        replaceCachedTask(tempId, createdTask)
        return createdTask
      } catch (error) {
        tasksCache.data = previousTasks
        setTasksError(getErrorMessage(error))
        return null
      }
    },
    updateTask: (taskId, input) =>
      runOptimisticMutation(
        (current) =>
          current.map((task) =>
            task.id === taskId
              ? { ...task, ...input, updatedAt: Date.now() }
              : task
          ),
        updateTaskAndReload,
        taskId,
        input
      ),
    deleteTask: (taskId) =>
      runOptimisticMutation(
        (current) => current.filter((task) => task.id !== taskId),
        deleteTaskAndReload,
        taskId
      ),
    togglePause: (taskId) =>
      runOptimisticMutation(
        (current) =>
          current.map((task) => {
            if (task.id !== taskId) return task
            const newStatus = task.status === 'paused' ? 'scheduled' : 'paused'
            return { ...task, status: newStatus, updatedAt: Date.now() }
          }),
        toggleTaskPauseAndReload,
        taskId
      ),
    triggerTask: (taskId) =>
      runOptimisticMutation(
        (current) =>
          current.map((task) =>
            task.id === taskId
              ? { ...task, status: 'running', lastRunAt: Date.now(), lastRunStatus: 'running', updatedAt: Date.now() }
              : task
          ),
        triggerTaskAndReload,
        taskId
      ),
  }
}

export function useTasksPageData() {
  return useMemo(() => ({}), [])
}

export function useTaskModel(taskId) {
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!taskId) {
      setTask(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    loadTask(taskId)
      .then((nextTask) => {
        if (!cancelled) {
          setTask(nextTask)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [taskId])

  const updateTaskData = useCallback(
    async (input) => {
      if (!taskId) return null
      setError(null)
      try {
        const updated = await updateTaskAndReturn(taskId, input)
        setTask(updated)
        return updated
      } catch (err) {
        setError(getErrorMessage(err))
        return null
      }
    },
    [taskId]
  )

  const togglePause = useCallback(async () => {
    if (!taskId) return null
    setError(null)
    try {
      const updated = await toggleTaskPauseAndReturn(taskId)
      setTask(updated)
      return updated
    } catch (err) {
      setError(getErrorMessage(err))
      return null
    }
  }, [taskId])

  return { task, loading, error, updateTask: updateTaskData, togglePause }
}
