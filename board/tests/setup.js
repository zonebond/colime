import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom has no IndexedDB — back idb-keyval with an in-memory Map so
// importing useAppStore (zustand persist) doesn't crash component tests.
vi.mock('idb-keyval', () => {
  const store = new Map()
  return {
    get: vi.fn(async (key) => store.get(key)),
    set: vi.fn(async (key, value) => { store.set(key, value) }),
    del: vi.fn(async (key) => { store.delete(key) }),
    createStore: vi.fn(() => ({})),
  }
})
