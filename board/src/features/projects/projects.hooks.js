import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadProjects,
  createProjectAndReturn,
  renameProjectAndReload,
  updateProjectDetailsAndReload,
  updateProjectDescriptionAndReload,
  toggleProjectStarAndReload,
  archiveProjectAndReload,
  updateProjectInstructionsAndReload,
  addProjectFilesAndReload,
  removeProjectFileAndReload,
  deleteProjectAndReload,
} from './projects.actions'

const PROJECTS_STALE_TIME = 30_000

const projectsCache = {
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

function getProjectsSnapshot() {
  return {
    projects: projectsCache.data ?? [],
    loading: projectsCache.data === null && Boolean(projectsCache.promise),
    error: projectsCache.error,
  }
}

function emitProjectsSnapshot() {
  const snapshot = getProjectsSnapshot()
  projectsCache.listeners.forEach((listener) => listener(snapshot))
}

function subscribeProjects(listener) {
  projectsCache.listeners.add(listener)
  return () => projectsCache.listeners.delete(listener)
}

function setProjectsData(nextProjects) {
  projectsCache.data = nextProjects
  projectsCache.error = null
  projectsCache.fetchedAt = Date.now()
  emitProjectsSnapshot()
}

function replaceCachedProject(tempId, nextProject) {
  const current = projectsCache.data ?? []
  const hasTempProject = current.some((project) => project.id === tempId)
  const nextProjects = hasTempProject
    ? current.map((project) => (project.id === tempId ? nextProject : project))
    : [nextProject, ...current]

  setProjectsData(nextProjects)
}

function setProjectsError(error) {
  projectsCache.error = error
  emitProjectsSnapshot()
}

function hasFreshProjects() {
  return projectsCache.data !== null && (Date.now() - projectsCache.fetchedAt) < PROJECTS_STALE_TIME
}

async function ensureProjects(options = {}) {
  const { force = false } = options

  if (!force && hasFreshProjects()) {
    return projectsCache.data
  }

  if (projectsCache.promise) {
    return projectsCache.promise
  }

  const request = loadProjects()
    .then((nextProjects) => {
      setProjectsData(nextProjects)
      return nextProjects
    })
    .catch((error) => {
      setProjectsError(getErrorMessage(error))
      throw error
    })
    .finally(() => {
      projectsCache.promise = null
      emitProjectsSnapshot()
    })

  projectsCache.promise = request
  emitProjectsSnapshot()
  return request
}

async function runProjectsMutation(action, args, optimisticUpdater) {
  projectsCache.error = null

  const previousProjects = projectsCache.data

  if (optimisticUpdater) {
    projectsCache.data = optimisticUpdater(previousProjects ?? [])
    emitProjectsSnapshot()
  }

  try {
    const nextProjects = await action(...args)
    setProjectsData(nextProjects)
    return nextProjects
  } catch (error) {
    if (optimisticUpdater) {
      projectsCache.data = previousProjects
    }
    setProjectsError(getErrorMessage(error))
    return null
  }
}

export function useProjectsModel() {
  const [state, setState] = useState(() => getProjectsSnapshot())

  useEffect(() => subscribeProjects(setState), [])

  useEffect(() => {
    if (projectsCache.data === null) {
      ensureProjects()
      return
    }

    if (!hasFreshProjects()) {
      ensureProjects({ force: true })
    }
  }, [])

  const refresh = useCallback(() => ensureProjects({ force: true }), [])

  const runMutation = useCallback((action, ...args) => (
    runProjectsMutation(action, args)
  ), [])

  const runOptimisticMutation = useCallback((optimisticUpdater, action, ...args) => (
    runProjectsMutation(action, args, optimisticUpdater)
  ), [])

  return {
    projects: state.projects,
    loading: state.loading,
    error: state.error,
    refresh,
    createProject: async (input) => {
      projectsCache.error = null
      const previousProjects = projectsCache.data
      const createdAt = Date.now()
      const tempId = createOptimisticId()
      const optimisticProject = {
        id: tempId,
        name: input.name ?? 'New project',
        description: input.description ?? '',
        isStarred: false,
        isArchived: false,
        instructions: '',
        files: [],
        createdAt,
        updatedAt: createdAt,
        lastActivityAt: createdAt,
      }

      projectsCache.data = [optimisticProject, ...(previousProjects ?? [])]
      emitProjectsSnapshot()

      try {
        const createdProject = await createProjectAndReturn(input)
        replaceCachedProject(tempId, createdProject)
        return createdProject
      } catch (error) {
        projectsCache.data = previousProjects
        setProjectsError(getErrorMessage(error))
        return null
      }
    },
    renameProject: (id, name) => runMutation(renameProjectAndReload, id, name),
    updateProjectDetails: (id, input) => runOptimisticMutation((current) => current.map((project) => (
      project.id === id
        ? {
            ...project,
            name: input.name,
            description: input.description,
            updatedAt: Date.now(),
            lastActivityAt: Date.now(),
          }
        : project
    )), updateProjectDetailsAndReload, id, input),
    updateProjectDescription: (id, description) => runMutation(updateProjectDescriptionAndReload, id, description),
    toggleProjectStar: (id, pinned) => runOptimisticMutation((current) => current.map((project) => (
      project.id === id
        ? { ...project, isStarred: pinned, updatedAt: Date.now(), lastActivityAt: Date.now() }
        : project
    )), toggleProjectStarAndReload, id, pinned),
    archiveProject: (id) => runOptimisticMutation((current) => current.map((project) => (
      project.id === id
        ? { ...project, isArchived: true, updatedAt: Date.now(), lastActivityAt: Date.now() }
        : project
    )), archiveProjectAndReload, id),
    updateProjectInstructions: (id, instructions) => runOptimisticMutation((current) => current.map((project) => (
      project.id === id
        ? { ...project, instructions, updatedAt: Date.now(), lastActivityAt: Date.now() }
        : project
    )), updateProjectInstructionsAndReload, id, instructions),
    addProjectFiles: (id, files) => runOptimisticMutation((current) => current.map((project) => (
      project.id === id
        ? {
            ...project,
            files: [
              ...project.files,
              ...files.map((file) => ({
                id: createOptimisticId(),
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size || 0,
                addedAt: Date.now(),
              })),
            ],
            updatedAt: Date.now(),
            lastActivityAt: Date.now(),
          }
        : project
    )), addProjectFilesAndReload, id, files),
    removeProjectFile: (id, fileId) => runOptimisticMutation((current) => current.map((project) => (
      project.id === id
        ? {
            ...project,
            files: project.files.filter((file) => file.id !== fileId),
            updatedAt: Date.now(),
            lastActivityAt: Date.now(),
          }
        : project
    )), removeProjectFileAndReload, id, fileId),
    deleteProject: (id) => runOptimisticMutation((current) => current.filter((project) => project.id !== id), deleteProjectAndReload, id),
  }
}

export function useProjectsPageData() {
  return useMemo(() => ({}), [])
}
