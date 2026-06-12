import {
  listDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
  searchDocuments,
} from './library.service'

export async function loadDocuments() {
  return listDocuments()
}

export async function loadDocument(docId) {
  return getDocumentById(docId)
}

export async function createDocumentAndReturn(input) {
  return createDocument(input)
}

export async function createDocumentAndReload(input) {
  await createDocument(input)
  return listDocuments()
}

export async function updateDocumentAndReload(docId, input) {
  await updateDocument(docId, input)
  return listDocuments()
}

export async function updateDocumentAndReturn(docId, input) {
  return updateDocument(docId, input)
}

export async function deleteDocumentAndReload(docId) {
  await deleteDocument(docId)
  return listDocuments()
}

export async function searchDocumentsAndReload(query) {
  return searchDocuments(query)
}

export function loadLibraryPageData() {
  return {}
}
