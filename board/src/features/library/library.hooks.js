import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  loadDocuments,
  loadDocument,
  createDocumentAndReturn,
  createDocumentAndReload,
  updateDocumentAndReload,
  updateDocumentAndReturn,
  deleteDocumentAndReload,
  searchDocumentsAndReload,
} from './library.actions'

const LIBRARY_STALE_TIME = 30_000

const documentsCache = {
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

function getDocumentsSnapshot() {
  return {
    documents: documentsCache.data ?? [],
    loading: documentsCache.data === null && Boolean(documentsCache.promise),
    error: documentsCache.error,
  }
}

function emitDocumentsSnapshot() {
  const snapshot = getDocumentsSnapshot()
  documentsCache.listeners.forEach((listener) => listener(snapshot))
}

function subscribeDocuments(listener) {
  documentsCache.listeners.add(listener)
  return () => documentsCache.listeners.delete(listener)
}

function setDocumentsData(nextDocuments) {
  documentsCache.data = nextDocuments
  documentsCache.error = null
  documentsCache.fetchedAt = Date.now()
  emitDocumentsSnapshot()
}

function replaceCachedDocument(tempId, nextDocument) {
  const current = documentsCache.data ?? []
  const hasTempDoc = current.some((doc) => doc.id === tempId)
  const nextDocs = hasTempDoc
    ? current.map((doc) => (doc.id === tempId ? nextDocument : doc))
    : [nextDocument, ...current]

  setDocumentsData(nextDocs)
}

function setDocumentsError(error) {
  documentsCache.error = error
  emitDocumentsSnapshot()
}

function hasFreshDocuments() {
  return documentsCache.data !== null && (Date.now() - documentsCache.fetchedAt) < LIBRARY_STALE_TIME
}

async function ensureDocuments(options = {}) {
  const { force = false } = options

  if (!force && hasFreshDocuments()) {
    return documentsCache.data
  }

  if (documentsCache.promise) {
    return documentsCache.promise
  }

  const request = loadDocuments()
    .then((nextDocs) => {
      setDocumentsData(nextDocs)
      return nextDocs
    })
    .catch((error) => {
      setDocumentsError(getErrorMessage(error))
      throw error
    })
    .finally(() => {
      documentsCache.promise = null
      emitDocumentsSnapshot()
    })

  documentsCache.promise = request
  emitDocumentsSnapshot()
  return request
}

async function runDocumentsMutation(action, args, optimisticUpdater) {
  documentsCache.error = null

  const previousDocs = documentsCache.data

  if (optimisticUpdater) {
    documentsCache.data = optimisticUpdater(previousDocs ?? [])
    emitDocumentsSnapshot()
  }

  try {
    const nextDocs = await action(...args)
    setDocumentsData(nextDocs)
    return nextDocs
  } catch (error) {
    if (optimisticUpdater) {
      documentsCache.data = previousDocs
    }
    setDocumentsError(getErrorMessage(error))
    return null
  }
}

export function useLibraryModel() {
  const [state, setState] = useState(() => getDocumentsSnapshot())

  useEffect(() => subscribeDocuments(setState), [])

  useEffect(() => {
    if (documentsCache.data === null) {
      ensureDocuments()
      return
    }

    if (!hasFreshDocuments()) {
      ensureDocuments({ force: true })
    }
  }, [])

  const refresh = useCallback(() => ensureDocuments({ force: true }), [])

  const runMutation = useCallback(
    (action, ...args) => runDocumentsMutation(action, args),
    []
  )

  const runOptimisticMutation = useCallback(
    (optimisticUpdater, action, ...args) => runDocumentsMutation(action, args, optimisticUpdater),
    []
  )

  return {
    documents: state.documents,
    loading: state.loading,
    error: state.error,
    refresh,
    createDocument: async (input) => {
      documentsCache.error = null
      const previousDocs = documentsCache.data
      const createdAt = Date.now()
      const tempId = createOptimisticId()
      const optimisticDoc = {
        id: tempId,
        title: input.title || 'Untitled document',
        content: input.content || '',
        type: input.type || 'markdown',
        tags: input.tags || [],
        createdAt,
        updatedAt: createdAt,
      }

      documentsCache.data = [optimisticDoc, ...(previousDocs ?? [])]
      emitDocumentsSnapshot()

      try {
        const createdDoc = await createDocumentAndReturn(input)
        replaceCachedDocument(tempId, createdDoc)
        return createdDoc
      } catch (error) {
        documentsCache.data = previousDocs
        setDocumentsError(getErrorMessage(error))
        return null
      }
    },
    updateDocument: (docId, input) =>
      runOptimisticMutation(
        (current) =>
          current.map((doc) =>
            doc.id === docId
              ? { ...doc, ...input, updatedAt: Date.now() }
              : doc
          ),
        updateDocumentAndReload,
        docId,
        input
      ),
    deleteDocument: (docId) =>
      runOptimisticMutation(
        (current) => current.filter((doc) => doc.id !== docId),
        deleteDocumentAndReload,
        docId
      ),
    searchDocuments: (query) =>
      runDocumentsMutation(searchDocumentsAndReload, [query]),
  }
}

export function useLibraryPageData() {
  return useMemo(() => ({}), [])
}

export function useDocumentModel(docId) {
  const [document, setDocument] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!docId) {
      setDocument(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    loadDocument(docId)
      .then((nextDoc) => {
        if (!cancelled) {
          setDocument(nextDoc)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(getErrorMessage(err))
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [docId])

  const updateDocumentData = useCallback(
    async (input) => {
      if (!docId) return null
      setError(null)
      try {
        const updated = await updateDocumentAndReturn(docId, input)
        setDocument(updated)
        return updated
      } catch (err) {
        setError(getErrorMessage(err))
        return null
      }
    },
    [docId]
  )

  return { document, loading, error, updateDocument: updateDocumentData }
}
