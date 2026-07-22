import { apiClient } from '@/lib/apiClient'

// ─── Skills ────────────────────────────────────────────────────────────

function normalizeSkill(skill) {
  const location = skill.location || ''
  let source = 'External'
  if (location === '<built-in>') source = 'Built-in'
  else if (location.includes('/.ravens/')) source = 'Project'
  else if (location.includes('/.config/ravens/')) source = 'Global'

  return {
    id: skill.name,
    name: skill.name,
    description: skill.description || '',
    location,
    content: skill.content || '',
    mtime: skill.mtime ?? 0,
    enabled: true,
    featured: location === '<built-in>',
    source,
  }
}

export async function listSkills() {
  try {
    const list = await apiClient.get('/skill')
    if (!Array.isArray(list)) return []
    return list.map(normalizeSkill)
  } catch {
    return []
  }
}

export async function reloadSkills() {
  await apiClient.post('/skill/reload')
  return listSkills()
}

export async function removeSkill(name) {
  await apiClient.post(`/skill/remove?name=${encodeURIComponent(name)}`)
  return true
}

export async function createSkill(input = {}) {
  const response = await apiClient.post('/skill', {
    name: input.name,
    description: input.description || '',
    content: input.content || '',
  })
  return normalizeSkill(response)
}

export async function updateSkill(name, input = {}) {
  const body = {}
  if (input.description !== undefined) body.description = input.description
  if (input.content !== undefined) body.content = input.content
  const response = await apiClient.put(`/skill?name=${encodeURIComponent(name)}`, body)
  return normalizeSkill(response)
}

export async function toggleSkill(_skillId) {
  // Skills are always available (no enable/disable toggle).
  // Availability is controlled via permission rules in config.
  return null
}

export async function generateSkillContent(description) {
  const session = await apiClient.post('/session', { title: 'Skill Generation' })

  const prompt = [
    'You are a SKILL.md generator. Generate a valid SKILL.md file with YAML frontmatter based on the following description.',
    '',
    'Requirements:',
    '- YAML frontmatter delimited by ---, containing `name` (a kebab-case slug) and `description` (one sentence) fields',
    '- A ## Purpose section explaining what this skill does',
    '- A ## When to Use section describing triggers and appropriate scenarios',
    '- A ## Instructions section with step-by-step guidelines',
    '- Optionally, an ## Examples section with concrete usage examples',
    '',
    'Use clear, professional markdown. Output ONLY the SKILL.md content, no other text.',
    '',
    `Skill description: ${description}`,
  ].join('\n')

  const payload = {
    parts: [{ type: 'text', text: prompt }],
  }

  const response = await apiClient.post(`/session/${session.id}/message`, payload)

  const parts = Array.isArray(response?.parts) ? response.parts : []
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n')
}

// ─── Agents (from config) ──────────────────────────────────────────────

export async function listAgents() {
  try {
    // /agent returns all available agents (including built-in build/plan), /config.agent only returns custom overrides
    const list = await apiClient.get('/agent')
    if (!Array.isArray(list)) return []
    return list
      .filter((a) => a.name) // JSON schema §agents additionalProperties: name is required
      .map((raw) => {
        const cleanName = (raw.name ?? '').replace(/[​-‏﻿]/g, '').trim()
        const isPrimary = raw.mode === 'primary'
        return {
          id: cleanName,
          ...raw,
          name: cleanName,
          subtitle: isPrimary ? null : (raw.description ?? raw.mode ?? null),
          isSystem: isPrimary,
          enabled: raw.hidden !== true,
        }
      })
  } catch {
    return []
  }
}

export async function createAgent(input = {}) {
  // Agents are configured via config files — cannot CRUD via API
  return input
}

export async function updateAgent(agentId, input = {}) {
  return { id: agentId, ...input }
}

export async function deleteAgent(_agentId) {
  return { success: true }
}

export async function toggleAgent(_agentId) {
  return null
}

// ─── MCP Servers (/mcp) ────────────────────────────────────────────────

export async function listMcpServers() {
  const response = await apiClient.get('/mcp')
  // /mcp returns a status map: Record<string, MCP.Status>
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return Object.entries(response).map(([name, status]) => ({ name, ...status }))
  }
  if (Array.isArray(response)) return response
  return []
}

export async function createMcpServer(input = {}) {
  const response = await apiClient.post('/mcp', { name: input.name, config: input.config ?? {} })
  return response
}

export async function updateMcpServer(_serverId, _input = {}) {
  // MCP server config is updated via /mcp endpoints
  return null
}

export async function deleteMcpServer(serverName) {
  await apiClient.delete(`/mcp/${serverName}`)
  return { success: true }
}

export async function toggleMcpServer(serverName) {
  // Toggle via connect/disconnect
  const servers = await listMcpServers()
  const server = servers.find((s) => s.name === serverName)
  if (server?.connected) {
    await apiClient.post(`/mcp/${serverName}/disconnect`)
  } else {
    await apiClient.post(`/mcp/${serverName}/connect`)
  }
  return listMcpServers()
}

// ─── Tools (/experimental/tool) ────────────────────────────────────────

/**
 * List the tools registered in ravens. The rich endpoint
 * (GET /experimental/tool) returns id + description but requires a
 * provider/model pair, so resolve the default one first; fall back to
 * the bare id list when no provider is connected yet.
 */
export async function listTools() {
  try {
    const provRes = await apiClient.get('/provider')
    const providers = Array.isArray(provRes) ? provRes : provRes?.all ?? []
    const active = providers.find((p) => p.connected) ?? providers[0]
    const models = active?.models
      ? (Array.isArray(active.models) ? active.models : Object.values(active.models))
      : []
    const model = models[0]
    if (active?.id && model?.id) {
      const params = new URLSearchParams({ provider: active.id, model: model.id })
      const list = await apiClient.get(`/experimental/tool?${params.toString()}`)
      if (Array.isArray(list) && list.length > 0) {
        return list
          // 'invalid' is ravens' internal error-reporting pseudo-tool
          .filter((tool) => tool.id !== 'invalid')
          .map((tool) => ({
            id: tool.id,
            name: tool.id,
            description: tool.description || '',
            enabled: true,
          }))
      }
    }
  } catch {
    // fall through to the id-only listing
  }
  try {
    const ids = await apiClient.get('/experimental/tool/ids')
    return Array.isArray(ids)
      ? ids.filter((id) => id !== 'invalid').map((id) => ({ id, name: id, description: '', enabled: true }))
      : []
  } catch {
    return []
  }
}

export async function toggleTool(_toolId) {
  // Tools are configured via config, not togglable via API
  return null
}

// ─── Providers (/provider) ─────────────────────────────────────────────

function normalizeModels(models) {
  if (!models) return []
  // Ravens returns models as Record<string, Model> — convert to array
  if (!Array.isArray(models) && typeof models === 'object') {
    return Object.values(models)
  }
  if (Array.isArray(models)) {
    return models.map((m) => (typeof m === 'string' ? { id: m, name: m } : m))
  }
  return []
}

export async function listProviders() {
  const response = await apiClient.get('/provider')
  // Ravens returns {all: [...], connected: [...], default: {...}}
  const list = Array.isArray(response) ? response : response?.all ?? response?.providers ?? []
  const connectedIDs = new Set(response?.connected ?? [])
  if (!Array.isArray(list)) return []
  return list.map((p) => ({
    ...p,
    // Map ravens provider shape to board's expected fields
    // Use type for icon lookup (supports instance IDs like "deepseek-a1b2c3d4")
    provider: p.type || p.id,
    status: connectedIDs.has(p.id) ? 'connected' : 'disconnected',
    baseUrl: p.options?.baseURL || '',
    hasApiKey: p.env?.length > 0,
    apiKeyMasked: p.env?.[0] || undefined,
    models: normalizeModels(p.models),
  }))
}

export async function createProvider(input = {}) {
  const body = {
    type: input.provider || input.type,
    name: input.name,
    description: input.description || '',
    models: input.models || [],
  }
  if (input.baseUrl) body.baseUrl = input.baseUrl
  if (input.apiKey) body.apiKey = input.apiKey
  const response = await apiClient.post('/provider', body)
  return response?.provider ?? response
}

export async function updateProvider(providerId, input = {}) {
  const body = {}
  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description
  if (input.type !== undefined) body.type = input.type
  if (input.provider !== undefined) body.type = input.provider
  if (input.baseUrl) body.baseUrl = input.baseUrl
  if (input.apiKey) body.apiKey = input.apiKey
  if (input.models !== undefined) body.models = input.models
  const response = await apiClient.patch(`/provider/${providerId}`, body)
  return response?.provider ?? response
}

export async function deleteProvider(providerId) {
  await apiClient.delete(`/provider/${providerId}`)
  return { success: true }
}

export async function testProvider(providerId) {
  const response = await apiClient.post(`/provider/${providerId}/test`)
  return response
}

// ─── Favorite Models ───────────────────────────────────────────────────

const FAVORITES_KEY = "board:favorites"

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeFavorites(items) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items))
}

export async function listFavoriteModels() {
  return readFavorites()
}

export async function createFavoriteModel({ providerId, modelId }) {
  const items = readFavorites()
  const filtered = items.filter((f) => !(f.providerId === providerId && f.modelId === modelId))
  const updated = [{ providerId, modelId, createdAt: Date.now() }, ...filtered]
  writeFavorites(updated)
  return { providerId, modelId }
}

export async function deleteFavoriteModel({ providerId, modelId }) {
  const items = readFavorites()
  writeFavorites(items.filter((f) => !(f.providerId === providerId && f.modelId === modelId)))
  return { success: true }
}
