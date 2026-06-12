import {
  listSkills,
  reloadSkills,
  createSkill,
  updateSkill,
  toggleSkill,
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  toggleAgent,
  listMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  toggleMcpServer,
  listTools,
  toggleTool,
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  testProvider,
  listFavoriteModels,
  createFavoriteModel,
  deleteFavoriteModel,
} from './toolbox.service'

export async function loadSkills() {
  return listSkills()
}

export async function reloadSkillsAndRefresh() {
  return reloadSkills()
}

export async function createSkillAndReload(input) {
  await createSkill(input)
  return listSkills()
}

export async function updateSkillAndReload(name, input) {
  await updateSkill(name, input)
  return listSkills()
}

export async function toggleSkillAndReload(skillId) {
  await toggleSkill(skillId)
  return listSkills()
}

export async function loadAgents() {
  return listAgents()
}

export async function createAgentAndReload(input) {
  await createAgent(input)
  return listAgents()
}

export async function updateAgentAndReload(agentId, input) {
  await updateAgent(agentId, input)
  return listAgents()
}

export async function deleteAgentAndReload(agentId) {
  await deleteAgent(agentId)
  return listAgents()
}

export async function toggleAgentAndReload(agentId) {
  await toggleAgent(agentId)
  return listAgents()
}

export async function loadMcpServers() {
  return listMcpServers()
}

export async function createMcpServerAndReload(input) {
  await createMcpServer(input)
  return listMcpServers()
}

export async function updateMcpServerAndReload(serverId, input) {
  await updateMcpServer(serverId, input)
  return listMcpServers()
}

export async function deleteMcpServerAndReload(serverId) {
  await deleteMcpServer(serverId)
  return listMcpServers()
}

export async function toggleMcpServerAndReload(serverId) {
  await toggleMcpServer(serverId)
  return listMcpServers()
}

export async function loadTools() {
  return listTools()
}

export async function toggleToolAndReload(toolId) {
  await toggleTool(toolId)
  return listTools()
}

export async function loadProviders() {
  return listProviders()
}

export async function createProviderAndReload(input) {
  await createProvider(input)
  return listProviders()
}

export async function updateProviderAndReload(providerId, input) {
  await updateProvider(providerId, input)
  return listProviders()
}

export async function deleteProviderAndReload(providerId) {
  await deleteProvider(providerId)
  return listProviders()
}

export async function testProviderConnection(providerId) {
  return testProvider(providerId)
}

export async function loadFavoriteModels() {
  return listFavoriteModels()
}

export async function addFavoriteModel({ providerId, modelId }) {
  await createFavoriteModel({ providerId, modelId })
}

export async function removeFavoriteModel({ providerId, modelId }) {
  await deleteFavoriteModel({ providerId, modelId })
}

export function loadToolboxPageData(_pageKey) {
  return {}
}
