import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ErrorBoundary from '@/components/common/ErrorBoundary'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatsPage from '@/components/chats/ChatsPage'

import SearchModal from '@/components/search/SearchModal'
import { useSidebar } from '@/hooks/useSidebar'
import { useAppStore } from '@/store/useAppStore'
import { setHighlightTheme } from '@/lib/highlight'
import styles from './App.module.css'

// Every non-default route is lazy so its page code (and heavy deps like
// @lobehub/icons in Toolbox or react-markdown in Projects) stays out of
// the initial bundle. ChatsPage is the landing route and stays static.
const ChatPage = lazy(() => import('@/components/chats/ChatPage'))
const ProjectsPage = lazy(() => import('@/components/projects/ProjectsPage'))
const ProjectDetailPage = lazy(() => import('@/components/projects/ProjectDetailPage'))
const TasksPage = lazy(() => import('@/components/tasks/TasksPage'))
const LibraryPage = lazy(() => import('@/components/library/LibraryPage'))
const ToolboxPage = lazy(() => import('@/components/toolbox/ToolboxPage'))
const Help = lazy(() => import('@/components/help/Help'))

function RouteFallback() {
  return (
    <div className={styles.routeFallback}>
      <div className={`uiSkeleton ${styles.routeFallbackTitle}`} />
      <div className={`uiSkeleton ${styles.routeFallbackBody}`} />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const hasHydrated = useAppStore((state) => state.hasHydrated)
  const rawTheme = useAppStore((state) => state.theme)
  const searchModalOpen = useAppStore((state) => state.searchModalOpen)
  const openSearchModal = useAppStore((state) => state.openSearchModal)
  const { isOpen, toggle } = useSidebar()
  const theme = rawTheme === 'warm-editorial' ? 'light' : rawTheme === 'tech-system' ? 'warm' : rawTheme

  useEffect(() => {
    setHighlightTheme(theme === 'dark')
  }, [theme])

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        openSearchModal()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openSearchModal])

  if (!hasHydrated) return null

  return (
    <div className={styles.layout} data-theme={theme}>
      <Sidebar isOpen={isOpen} onToggle={toggle} />
      <main className={styles.main}>
        <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/chats" replace />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route path="/chats/:chatId" element={<ChatPage />} />

          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/toolbox" element={<ToolboxPage />} />
          <Route path="/help" element={<Help />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </main>
      {searchModalOpen && <SearchModal />}
    </div>
  )
}
