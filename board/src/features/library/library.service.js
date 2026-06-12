import { apiClient } from '@/lib/apiClient'

function normalizeDocument(payload) {
  if (!payload) return null
  return {
    id: String(payload.id ?? ''),
    title: payload.title ?? '',
    content: payload.content ?? '',
    type: payload.type ?? 'markdown',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    createdAt: payload.time?.created ?? Date.now(),
    updatedAt: payload.time?.updated ?? Date.now(),
  }
}

export async function listDocuments() {
  const response = await apiClient.get('/document')
  const items = Array.isArray(response) ? response : []
  return items.map(normalizeDocument)
}

export async function getDocumentById(id) {
  const response = await apiClient.get(`/document/${id}`)
  return normalizeDocument(response)
}

export async function createDocument(input) {
  const body = {
    title: input.title || 'Untitled',
    content: input.content ?? '',
    type: input.type ?? 'markdown',
    tags: input.tags ?? [],
  }
  const response = await apiClient.post('/document', body)
  return normalizeDocument(response)
}

export async function updateDocument(id, input) {
  const body = {}
  if (input.title !== undefined) body.title = input.title
  if (input.content !== undefined) body.content = input.content
  if (input.type !== undefined) body.type = input.type
  if (input.tags !== undefined) body.tags = input.tags
  const response = await apiClient.patch(`/document/${id}`, body)
  return normalizeDocument(response)
}

export async function deleteDocument(id) {
  await apiClient.delete(`/document/${id}`)
  return { success: true }
}

export async function searchDocuments(_query) {
  return []
}
