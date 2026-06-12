import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadSkills,
  reloadSkillsAndRefresh,
  createSkillAndReload,
  updateSkillAndReload,
  toggleSkillAndReload,
  loadAgents,
  createAgentAndReload,
  updateAgentAndReload,
  deleteAgentAndReload,
  toggleAgentAndReload,
  loadMcpServers,
  createMcpServerAndReload,
  updateMcpServerAndReload,
  deleteMcpServerAndReload,
  toggleMcpServerAndReload,
  loadTools,
  toggleToolAndReload,
  loadProviders,
  createProviderAndReload,
  updateProviderAndReload,
  deleteProviderAndReload,
  testProviderConnection,
  loadFavoriteModels,
  addFavoriteModel,
  removeFavoriteModel,
} from './toolbox.actions'

const TOOLBOX_STALE_TIME = 30_000

function createCache() {
  return {
    data: null,
    error: null,
    fetchedAt: 0,
    promise: null,
    listeners: new Set(),
  }
}

const skillsCache = createCache()
const agentsCache = createCache()
const mcpCache = createCache()
const toolsCache = createCache()
const providersCache = createCache()
const favoritesCache = createCache()

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown error'
}

function createOptimisticId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getSnapshot(cache) {
  return {
    items: cache.data ?? [],
    loading: cache.data === null && Boolean(cache.promise),
    error: cache.error,
  }
}

function emitSnapshot(cache) {
  const snapshot = getSnapshot(cache)
  cache.listeners.forEach((listener) => listener(snapshot))
}

function subscribe(cache, listener) {
  cache.listeners.add(listener)
  return () => cache.listeners.delete(listener)
}

function setData(cache, nextItems) {
  cache.data = nextItems
  cache.error = null
  cache.fetchedAt = Date.now()
  emitSnapshot(cache)
}

function setError(cache, error) {
  cache.error = error
  emitSnapshot(cache)
}

function hasFresh(cache) {
  return cache.data !== null && (Date.now() - cache.fetchedAt) < TOOLBOX_STALE_TIME
}

async function ensure(cache, loadFn, force = false) {
  if (!force && hasFresh(cache)) {
    return cache.data
  }

  if (cache.promise) {
    return cache.promise
  }

  const request = loadFn()
    .then((nextItems) => {
      setData(cache, nextItems)
      return nextItems
    })
    .catch((error) => {
      setError(cache, getErrorMessage(error))
      throw error
    })
    .finally(() => {
      cache.promise = null
      emitSnapshot(cache)
    })

  cache.promise = request
  emitSnapshot(cache)
  return request
}

async function runMutation(cache, optimisticUpdater, action, args) {
  cache.error = null
  const previousItems = cache.data

  if (optimisticUpdater) {
    cache.data = optimisticUpdater(previousItems ?? [])
    emitSnapshot(cache)
  }

  try {
    const result = await action(...args)
    if (result !== undefined) {
      cache.data = result
      emitSnapshot(cache)
    }
    return cache.data
  } catch (error) {
    if (optimisticUpdater) {
      cache.data = previousItems
    }
    setError(cache, getErrorMessage(error))
    return null
  }
}

export function useSkillsModel() {
  const [state, setState] = useState(() => getSnapshot(skillsCache))

  useEffect(() => subscribe(skillsCache, setState), [])

  useEffect(() => {
    ensure(skillsCache, loadSkills)
  }, [])

  const refresh = useCallback(() => ensure(skillsCache, loadSkills, true), [])

  const reloadSkills = useCallback(async () => {
    return ensure(skillsCache, reloadSkillsAndRefresh, true)
  }, [])

  const createSkill = useCallback(
    async (input) => {
      skillsCache.error = null
      const previousItems = skillsCache.data
      const optimisticItem = {
        id: input.name,
        name: input.name,
        description: input.description || '',
        location: '',
        content: input.content || '',
        enabled: true,
        featured: false,
        source: 'Global',
      }

      skillsCache.data = [optimisticItem, ...(previousItems ?? [])]
      emitSnapshot(skillsCache)

      try {
        await createSkillAndReload(input)
      } catch (error) {
        skillsCache.data = previousItems
        setError(skillsCache, getErrorMessage(error))
      }
    },
    []
  )

  const updateSkill = useCallback(
    (name, input) =>
      runMutation(
        skillsCache,
        (current) =>
          current.map((item) =>
            item.id === name ? { ...item, ...input } : item
          ),
        updateSkillAndReload,
        [name, input]
      ),
    []
  )

  const toggleSkill = useCallback(
    (skillId) =>
      runMutation(
        skillsCache,
        (current) =>
          current.map((item) =>
            item.id === skillId ? { ...item, enabled: !item.enabled } : item
          ),
        toggleSkillAndReload,
        [skillId]
      ),
    []
  )

  return {
    skills: state.items,
    loading: state.loading,
    error: state.error,
    refresh,
    reloadSkills,
    createSkill,
    updateSkill,
    toggleSkill,
  }
}

export function useAgentsModel() {
  const [state, setState] = useState(() => getSnapshot(agentsCache))

  useEffect(() => subscribe(agentsCache, setState), [])

  useEffect(() => {
    ensure(agentsCache, loadAgents)
  }, [])

  const refresh = useCallback(() => ensure(agentsCache, loadAgents, true), [])

  const createAgent = useCallback(
    async (input) => {
      agentsCache.error = null
      const previousItems = agentsCache.data
      const tempId = createOptimisticId()
      const optimisticItem = {
        id: tempId,
        name: input.name || 'New Agent',
        description: input.description || '',
        providerId: input.providerId || null,
        modelId: input.modelId || input.model || null,
        model: input.modelId || input.model || null,
        enabled: false,
        config: input.config || { maxTokens: 4096, temperature: 0.7 },
      }

      agentsCache.data = [optimisticItem, ...(previousItems ?? [])]
      emitSnapshot(agentsCache)

      try {
        await createAgentAndReload(input)
      } catch (error) {
        agentsCache.data = previousItems
        setError(agentsCache, getErrorMessage(error))
      }
    },
    []
  )

  const updateAgent = useCallback(
    (agentId, input) =>
      runMutation(
        agentsCache,
        (current) =>
          current.map((item) =>
            item.id === agentId ? { ...item, ...input } : item
          ),
        updateAgentAndReload,
        [agentId, input]
      ),
    []
  )

  const deleteAgent = useCallback(
    (agentId) =>
      runMutation(
        agentsCache,
        (current) => current.filter((item) => item.id !== agentId),
        deleteAgentAndReload,
        [agentId]
      ),
    []
  )

  const toggleAgent = useCallback(
    (agentId) =>
      runMutation(
        agentsCache,
        (current) =>
          current.map((item) =>
            item.id === agentId ? { ...item, enabled: !item.enabled } : item
          ),
        toggleAgentAndReload,
        [agentId]
      ),
    []
  )

  return {
    agents: state.items,
    loading: state.loading,
    error: state.error,
    refresh,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgent,
  }
}

export function useMcpServersModel() {
  const [state, setState] = useState(() => getSnapshot(mcpCache))

  useEffect(() => subscribe(mcpCache, setState), [])

  useEffect(() => {
    ensure(mcpCache, loadMcpServers)
  }, [])

  const refresh = useCallback(() => ensure(mcpCache, loadMcpServers, true), [])

  const createMcpServer = useCallback(
    async (input) => {
      mcpCache.error = null
      const previousItems = mcpCache.data
      const tempId = createOptimisticId()
      const optimisticItem = {
        id: tempId,
        name: input.name || 'New MCP Server',
        description: input.description || '',
        status: 'disconnected',
        command: input.command || '',
        args: input.args || [],
        env: input.env || {},
      }

      mcpCache.data = [optimisticItem, ...(previousItems ?? [])]
      emitSnapshot(mcpCache)

      try {
        await createMcpServerAndReload(input)
      } catch (error) {
        mcpCache.data = previousItems
        setError(mcpCache, getErrorMessage(error))
      }
    },
    []
  )

  const updateMcpServer = useCallback(
    (serverId, input) =>
      runMutation(
        mcpCache,
        (current) =>
          current.map((item) =>
            item.id === serverId ? { ...item, ...input } : item
          ),
        updateMcpServerAndReload,
        [serverId, input]
      ),
    []
  )

  const deleteMcpServer = useCallback(
    (serverId) =>
      runMutation(
        mcpCache,
        (current) => current.filter((item) => item.id !== serverId),
        deleteMcpServerAndReload,
        [serverId]
      ),
    []
  )

  const toggleMcpServer = useCallback(
    (serverId) =>
      runMutation(
        mcpCache,
        (current) =>
          current.map((item) => {
            if (item.id !== serverId) return item
            return {
              ...item,
              status: item.status === 'connected' ? 'disconnected' : 'connected',
            }
          }),
        toggleMcpServerAndReload,
        [serverId]
      ),
    []
  )

  return {
    servers: state.items,
    loading: state.loading,
    error: state.error,
    refresh,
    createMcpServer,
    updateMcpServer,
    deleteMcpServer,
    toggleMcpServer,
  }
}

export function useToolsModel() {
  const [state, setState] = useState(() => getSnapshot(toolsCache))

  useEffect(() => subscribe(toolsCache, setState), [])

  useEffect(() => {
    ensure(toolsCache, loadTools)
  }, [])

  const refresh = useCallback(() => ensure(toolsCache, loadTools, true), [])

  const toggleTool = useCallback(
    (toolId) =>
      runMutation(
        toolsCache,
        (current) =>
          current.map((item) =>
            item.id === toolId ? { ...item, enabled: !item.enabled } : item
          ),
        toggleToolAndReload,
        [toolId]
      ),
    []
  )

  return {
    tools: state.items,
    loading: state.loading,
    error: state.error,
    refresh,
    toggleTool,
  }
}

export function useProvidersModel() {
  const [state, setState] = useState(() => getSnapshot(providersCache))

  useEffect(() => subscribe(providersCache, setState), [])

  useEffect(() => {
    ensure(providersCache, loadProviders)
  }, [])

  const refresh = useCallback(() => ensure(providersCache, loadProviders, true), [])

  const createProvider = useCallback(
    async (input) => {
      providersCache.error = null
      const previousItems = providersCache.data
      const tempId = createOptimisticId()
      const optimisticItem = {
        id: tempId,
        provider: input.provider || 'custom',
        name: input.name || 'New Provider',
        description: input.description || '',
        baseUrl: input.baseUrl || '',
        apiKey: input.apiKey || '',
        models: input.models || [],
        enabled: false,
        status: 'pending',
      }

      providersCache.data = [optimisticItem, ...(previousItems ?? [])]
      emitSnapshot(providersCache)

      try {
        await createProviderAndReload(input)
      } catch (error) {
        providersCache.data = previousItems
        setError(providersCache, getErrorMessage(error))
      }
    },
    []
  )

  const updateProvider = useCallback(
    (providerId, input) =>
      runMutation(
        providersCache,
        (current) =>
          current.map((item) =>
            item.id === providerId ? { ...item, ...input } : item
          ),
        updateProviderAndReload,
        [providerId, input]
      ),
    []
  )

  const deleteProvider = useCallback(
    (providerId) =>
      runMutation(
        providersCache,
        (current) => current.filter((item) => item.id !== providerId),
        deleteProviderAndReload,
        [providerId]
      ),
    []
  )

  const testConnection = useCallback(
    async (providerId) => {
      try {
        return await testProviderConnection(providerId)
      } catch (error) {
        return { success: false, error: getErrorMessage(error) }
      }
    },
    []
  )

  return {
    providers: state.items,
    loading: state.loading,
    error: state.error,
    refresh,
    createProvider,
    updateProvider,
    deleteProvider,
    testConnection,
  }
}

export function useFavoriteModelsModel() {
  const [state, setState] = useState(() => getSnapshot(favoritesCache))

  useEffect(() => subscribe(favoritesCache, setState), [])

  useEffect(() => {
    ensure(favoritesCache, loadFavoriteModels)
  }, [])

  const refresh = useCallback(() => ensure(favoritesCache, loadFavoriteModels, true), [])

  const addFavorite = useCallback(
    ({ providerId, modelId }) =>
      runMutation(
        favoritesCache,
        (current) =>
          [{ providerId, modelId, createdAt: Date.now() }, ...current.filter(
            (f) => !(f.providerId === providerId && f.modelId === modelId)
          )],
        addFavoriteModel,
        [{ providerId, modelId }]
      ),
    []
  )

  const removeFavorite = useCallback(
    ({ providerId, modelId }) =>
      runMutation(
        favoritesCache,
        (current) => current.filter(
          (f) => !(f.providerId === providerId && f.modelId === modelId)
        ),
        removeFavoriteModel,
        [{ providerId, modelId }]
      ),
    []
  )

  return {
    favorites: state.items,
    loading: state.loading,
    error: state.error,
    refresh,
    addFavorite,
    removeFavorite,
  }
}

export function useToolboxPageData(_pageKey) {
  return useMemo(() => ({}), [])
}
