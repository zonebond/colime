import { apiClient } from '@/lib/apiClient'
import { normalizeChat } from '@/features/chats/normalize'

export async function searchSessions(query) {
  const response = await apiClient.get(`/session?search=${encodeURIComponent(query)}`)
  const items = Array.isArray(response) ? response : response?.items ?? []
  return items.map(normalizeChat)
}

export async function searchContent(query) {
  const response = await apiClient.get(`/search?q=${encodeURIComponent(query)}`)
  const items = Array.isArray(response) ? response : response?.items ?? response ?? []
  return items.map((item) => ({
    sessionID: item.sessionID,
    partID: item.partID,
    messageID: item.messageID,
    type: item.type,
    role: item.role,
    snippet: item.snippet,
    rank: item.rank,
    sessionTitle: item.sessionTitle,
    timeCreated: item.timeCreated,
  }))
}
