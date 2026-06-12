import {
  archiveChat,
  completeChatResponse,
  createChat,
  deleteChat,
  deleteChats,
  getChatById,
  getChatMessages,
  getLlmConfig,
  getSessionProvider,
  listChats,
  moveChatsToProject,
  renameChat,
  sendChatMessage,
  toggleChatPin,
  updateLlmConfig,
  updateSessionProvider,
} from './chats.service'

export async function loadChats() {
  return listChats()
}

export async function loadChat(chatId, options = {}) {
  return getChatById(chatId, options)
}

export async function createChatAndReload(input) {
  await createChat(input)
  return listChats()
}

export async function createChatAndReturn(input) {
  return createChat(input)
}

export async function sendChatMessageAndLoad(chatId, input) {
  return sendChatMessage(chatId, input)
}

export async function completeChatResponseAndLoad(chatId) {
  return completeChatResponse(chatId)
}

export async function toggleChatPinAndReload(chatId) {
  await toggleChatPin(chatId)
  return listChats()
}

export async function archiveChatAndReload(chatId) {
  await archiveChat(chatId)
  return listChats()
}

export async function deleteChatAndReload(chatId) {
  await deleteChat(chatId)
  return listChats()
}

export async function deleteChatsAndReload(chatIds) {
  await deleteChats(chatIds)
  return listChats()
}

export async function renameChatAndReload(chatId, title) {
  await renameChat(chatId, title)
  return listChats()
}

export async function moveChatsToProjectAndReload(chatIds, projectId) {
  await moveChatsToProject(chatIds, projectId)
  return listChats()
}

export async function touchChatAndLoad(chatId, options = {}) {
  return getChatById(chatId, options)
}

export async function loadChatMessages(chatId, options = {}) {
  return getChatMessages(chatId, options)
}

export async function loadSessionProvider(chatId) {
  return getSessionProvider(chatId)
}

export async function updateSessionProviderAndLoad(chatId, providerData) {
  await updateSessionProvider(chatId, providerData)
  return { providerId: providerData.providerId, modelId: providerData.modelId }
}

export { updateSessionProvider, getSessionProvider }
export { getLlmConfig, updateLlmConfig }
