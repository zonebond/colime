import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from '@/components/sidebar/Sidebar'
import ChatsPage from '@/components/chats/ChatsPage'

import SearchModal from '@/components/search/SearchModal'
import ProjectsPage from '@/components/projects/ProjectsPage'
import ProjectDetailPage from '@/components/projects/ProjectDetailPage'
import TasksPage from '@/components/tasks/TasksPage'
import LibraryPage from '@/components/library/LibraryPage'
import ToolboxPage from '@/components/toolbox/ToolboxPage'
import Help from '@/components/help/Help'
import { useSidebar } from '@/hooks/useSidebar'
import { useAppStore } from '@/store/useAppStore'
import { setHighlightTheme } from '@/lib/highlight'
import styles from './App.module.css'

const ChatPage = lazy(() => import('@/components/chats/ChatPage'))

function ChatPageSuspense() {
  return (
    <Suspense fallback={<div className={styles.routeFallback}><div className={`uiSkeleton ${styles.routeFallbackTitle}`} /><div className={`uiSkeleton ${styles.routeFallbackBody}`} /></div>}>
      <ChatPage />
    </Suspense>
  )
}

export default function App() {
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
        <Routes>
          <Route path="/" element={<Navigate to="/chats" replace />} />
          <Route path="/chats" element={<ChatsPage />} />
          <Route
            path="/chats/:chatId"
            element={<ChatPageSuspense />}
          />

          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/toolbox" element={<ToolboxPage />} />
          <Route path="/help" element={<Help />} />
        </Routes>
      </main>
      {searchModalOpen && <SearchModal />}
    </div>
  )
}
