import { del, get, set as kvSet, createStore as createKeyValueStore } from 'idb-keyval'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const APP_STORAGE_KEY = 'app-storage'
const LEGACY_LOCALE_KEY = 'locale'
const LEGACY_SIDEBAR_KEY = 'sidebar:isOpen'
const indexedDBStore = createKeyValueStore('ravens-board', 'app-state')

function getInitialLocale() {
  if (typeof window === 'undefined') return 'en'

  try {
    const stored = localStorage.getItem(LEGACY_LOCALE_KEY)
    if (stored === 'en' || stored === 'zh') return stored
  } catch {
    // ignore
  }

  const browserLang = window.navigator.language.split('-')[0]
  return browserLang === 'zh' ? 'zh' : 'en'
}

function getInitialSidebarOpen() {
  if (typeof window === 'undefined') return true

  try {
    const stored = localStorage.getItem(LEGACY_SIDEBAR_KEY)
    return stored !== null ? JSON.parse(stored) : true
  } catch {
    return true
  }
}

const indexedDBStorage = {
  getItem: async (name) => {
    const value = await get(name, indexedDBStore)
    return value ?? null
  },
  setItem: async (name, value) => {
    await kvSet(name, value, indexedDBStore)
  },
  removeItem: async (name) => {
    await del(name, indexedDBStore)
  },
}

export const useAppStore = create(
  persist(
    (set) => ({
      hasHydrated: false,
      sidebarOpen: getInitialSidebarOpen(),
      locale: getInitialLocale(),
      theme: 'light',
      showReasoning: true,
      searchModalOpen: false,
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      toggleShowReasoning: () => set((state) => ({ showReasoning: !state.showReasoning })),
      openSearchModal: () => set({ searchModalOpen: true }),
      closeSearchModal: () => set({ searchModalOpen: false }),
    }),
    {
      name: APP_STORAGE_KEY,
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: ({ sidebarOpen, locale, theme, showReasoning }) => ({
        sidebarOpen,
        locale,
        theme,
        showReasoning,
      }),
      onRehydrateStorage: (state) => {
        return () => {
          state?.setHasHydrated(true)
        }
      },
    }
  )
)
