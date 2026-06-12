import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAgentsModel } from '@/features/toolbox/toolbox.hooks'
import { updateSessionProvider, getSessionProvider } from './chats.actions'

export function useChatAgent(chatId) {
  const { agents, loading: agentsLoading } = useAgentsModel()
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [sessionProviderId, setSessionProviderId] = useState(null)
  const [sessionModelId, setSessionModelId] = useState(null)

  const systemDefaultAgent = useMemo(
    () => agents.find((a) => a.enabled !== false && a.isSystem) ?? null,
    [agents]
  )

  // Agent model from /config is a string like "provider/model"; parse it.
  const systemDefaultModel = useMemo(() => {
    const raw = systemDefaultAgent?.model
    if (!raw) return null
    if (typeof raw === 'string') {
      const idx = raw.indexOf('/')
      if (idx > 0) return { providerId: raw.slice(0, idx), modelId: raw.slice(idx + 1) }
      return null
    }
    // Object form: { providerID, modelID }
    if (raw.providerID && raw.modelID) return { providerId: raw.providerID, modelId: raw.modelID }
    if (raw.providerId && raw.modelId) return { providerId: raw.providerId, modelId: raw.modelId }
    return null
  }, [systemDefaultAgent])

  useEffect(() => {
    if (!chatId || chatId === 'new') return
    setSessionProviderId(null)
    setSessionModelId(null)
    getSessionProvider(chatId)
      .then((provider) => {
        setSessionProviderId(provider?.providerId ?? null)
        setSessionModelId(provider?.modelId ?? null)
      })
      .catch(() => {})
  }, [chatId])

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  )

  const effectiveProviderId = sessionProviderId ?? systemDefaultModel?.providerId ?? null
  const effectiveModelId = sessionModelId ?? systemDefaultModel?.modelId ?? null

  const selectSessionProvider = useCallback(async (targetChatId, { providerId, modelId }) => {
    if (!targetChatId) return
    // For new chats, only update local state (session doesn't exist yet)
    if (targetChatId === 'new') {
      setSessionProviderId(providerId)
      setSessionModelId(modelId)
      return
    }
    try {
      await updateSessionProvider(targetChatId, { providerId, modelId })
      setSessionProviderId(providerId)
      setSessionModelId(modelId)
    } catch {}
  }, [])

  const clearSessionProvider = useCallback(async (targetChatId) => {
    if (!targetChatId) return
    try {
      await updateSessionProvider(targetChatId, { providerId: null, modelId: null })
      setSessionProviderId(null)
      setSessionModelId(null)
    } catch {}
  }, [])

  return {
    selectedAgentId,
    selectedAgent,
    agents,
    agentsLoading,
    setSelectedAgentId,
    systemDefaultAgent,
    sessionProviderId,
    sessionModelId,
    effectiveProviderId,
    effectiveModelId,
    selectSessionProvider,
    clearSessionProvider,
  }
}