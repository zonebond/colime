import { useCallback, useEffect, useRef, useState } from 'react'
import { apiClient } from '@/lib/apiClient'

export function useProviderModels() {
  const [models, setModels] = useState([])
  const [providers, setProviders] = useState([])
  const [providerDefault, setProviderDefault] = useState({})
  const [loading, setLoading] = useState(false)
  const [runtimeAvailable, setRuntimeAvailable] = useState(true)
  const effectIdRef = useRef(0)

  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiClient.get('/provider')
      const providerList = Array.isArray(response) ? response : response?.all ?? response?.providers ?? []
      const connectedIds = new Set(response?.connected ?? [])
      setProviderDefault(response?.default ?? {})

      const allModels = []
      const allProviders = []

      // Providers whose types don't need API-key auth (local model servers, etc.)
      const AUTH_FREE_TYPES = new Set(['ollama', 'lmstudio', 'omlx'])

      for (const provider of providerList) {
        const isAuthFree = AUTH_FREE_TYPES.has((provider.type || '').toLowerCase())
        const hasKey = !!provider.key || !!provider.options?.apiKey
        const isConnected = isAuthFree || connectedIds.has(provider.id)
        const modelEntries = Array.isArray(provider.models)
          ? provider.models
          : Object.values(provider.models ?? {})
        allProviders.push({
          id: provider.id,
          provider: provider.type || provider.provider || provider.id,
          name: provider.name || provider.type || provider.id,
          hasApiKey: hasKey || isConnected,
          models: modelEntries,
          status: isConnected ? 'connected' : 'pending',
        })

        if (!hasKey && !isConnected) continue
        for (const model of modelEntries) {
          if (typeof model === 'string') {
            allModels.push({
              id: `${provider.type || provider.id}/${model}`,
              name: model,
              bareId: model,
              provider: provider.type || provider.id,
              providerId: provider.id,
              providerKey: provider.type || provider.id,
              providerName: provider.name || provider.id,
              description: '',
            })
          } else {
            allModels.push({
              id: `${provider.type || model.provider || provider.id}/${model.id}`,
              name: model.name || model.id,
              bareId: model.id,
              provider: provider.type || model.provider || provider.id,
              providerId: provider.id,
              providerKey: provider.type || provider.id,
              providerName: provider.name || provider.id,
              description: model.capabilities?.reasoning
                ? 'Reasoning'
                : model.capabilities?.vision
                  ? 'Vision'
                  : model.capabilities?.tools
                    ? 'Tools'
                    : '',
              capabilities: model.capabilities,
              limits: model.limits,
              cost: model.cost,
            })
          }
        }
      }

      setModels(allModels)
      setProviders(allProviders)
    } catch (error) {
      if (error.name === 'AbortError') return
      setRuntimeAvailable(false)
      if (import.meta.env.DEV) {
        console.debug('Provider models unavailable:', error.message)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!runtimeAvailable) return
    const effectId = ++effectIdRef.current

    fetchModels()

    return () => {
      effectIdRef.current = effectId
    }
  }, [runtimeAvailable, fetchModels])

  const refresh = useCallback(() => {
    if (!runtimeAvailable) return
    fetchModels()
  }, [runtimeAvailable, fetchModels])

  return { models, providers, providerDefault, loading, runtimeAvailable, refresh }
}
