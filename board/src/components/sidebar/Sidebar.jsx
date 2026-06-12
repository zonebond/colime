import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePopover } from '@/hooks/usePopover'
import { useTranslation } from '@/i18n'
import { useAppStore } from '@/store/useAppStore'

import NavRow from './NavRow'
import UserPopover from './UserPopover'
import {
  IconToggleSidebar, IconNewChat, IconSearch, IconToolbox,
  IconChats, IconProjects, IconWorkspace, IconAssets,
  IconMore, IconUpDown, IconLogo,
} from '@/components/icons'
import styles from './Sidebar.module.css'

const NAV_ITEMS_GROUP2 = [
  { id: 'chats', i18nKey: 'sidebar.chats', icon: IconChats, path: '/chats' },
  { id: 'projects', i18nKey: 'sidebar.projects', icon: IconProjects, path: '/projects' },
  { id: 'tasks', i18nKey: 'sidebar.tasks', icon: IconWorkspace, path: '/tasks' },
  { id: 'library', i18nKey: 'sidebar.library', icon: IconAssets, path: '/library' },
]

const RECENT_ITEMS = [
  { id: 1, title: '个人 AI Agent 工作区应用设计' },
  { id: 2, title: "Empathy's role in relationships" },
  { id: 3, title: 'Q4 产品路线图规划' },
]

export default function Sidebar({ isOpen, onToggle }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [activeRecent, setActiveRecent] = useState(null)
  const popover = usePopover()
  const openSearchModal = useAppStore((s) => s.openSearchModal)
  const searchModalOpen = useAppStore((s) => s.searchModalOpen)

  const isClosed = !isOpen

  const handleNewChat = useCallback(() => {
    navigate('/chats/new')
  }, [navigate])

  const isChatsActive = location.pathname.startsWith('/chats')
  const isProjectsActive = location.pathname.startsWith('/projects')
  const isTasksActive = location.pathname.startsWith('/tasks')
  const isLibraryActive = location.pathname.startsWith('/library')
  const isToolboxActive = location.pathname.startsWith('/toolbox')

  return (
    <aside className={[styles.sidebar, isClosed ? styles.closed : ''].join(' ')}>
      <div className={styles.header}>
        <div className={[styles.title, isClosed ? styles.titleHidden : ''].join(' ')}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>
              <IconLogo size={24} />
            </span>
            <span className={styles.brandText}>{t('sidebar.brand')}</span>
          </div>
        </div>
        <button
          className={styles.toggleBtn}
          onClick={onToggle}
          aria-label={isOpen ? t('sidebar.closeSidebar') : t('sidebar.openSidebar')}
        >
          <IconToggleSidebar />
          {isClosed && (
            <span className={styles.toggleTip}>
              <span>{isOpen ? t('sidebar.closeSidebar') : t('sidebar.openSidebar')}</span>
              <span className={styles.toggleShortcut}>
                <span>{'\u2318'}</span>
                <span>\</span>
              </span>
            </span>
          )}
        </button>
      </div>

      <nav className={styles.nav}>
        <NavRow
          navKey="new-chat"
          icon={
            <span className={styles.newChatIcon}>
              <IconNewChat />
            </span>
          }
          label={t('sidebar.newChat')}
          tooltip={t('sidebar.newChat')}
          tooltipLabel={t('sidebar.newChat')}
          tooltipMeta={<><span>{'\u21E7'}</span><span>{'\u2318'}</span><span>O</span></>}
          isClosed={isClosed}
          isActive={false}
          onClick={handleNewChat}
        />

        <NavRow
          navKey="search"
          icon={<IconSearch />}
          label={t('sidebar.search')}
          tooltip={t('sidebar.search')}
          tooltipLabel={t('sidebar.search')}
          tooltipMeta={<><span>{'\u2318'}</span><span>K</span></>}
          isClosed={isClosed}
          isActive={searchModalOpen}
          onClick={openSearchModal}
        />

        <NavRow
          navKey="toolbox"
          icon={<IconToolbox />}
          label={t('sidebar.toolbox')}
          isClosed={isClosed}
          isActive={isToolboxActive}
          onClick={() => {
            navigate('/toolbox')
          }}
        />

        <div className={styles.gap} />

        {NAV_ITEMS_GROUP2.map(({ id, i18nKey, icon: Icon, path }) => {
          const isActive = 
            id === 'chats' ? isChatsActive :
            id === 'projects' ? isProjectsActive :
            id === 'tasks' ? isTasksActive :
            id === 'library' ? isLibraryActive : false
          return (
            <NavRow
              key={id}
              navKey={id}
              icon={<Icon />}
              label={t(i18nKey)}
              isClosed={isClosed}
              isActive={isActive}
              onClick={() => {
                navigate(path)
              }}
            />
          )
        })}

        {!isClosed && (
          <div className={styles.recentsSection}>
            <div className={styles.sectionLabel}>{t('sidebar.recents')}</div>
            {RECENT_ITEMS.map((item) => (
              <div
                key={item.id}
                className={[styles.recentRow, activeRecent === item.id ? styles.recentActive : ''].join(' ')}
                onClick={() => {
                  setActiveRecent(item.id)
                  navigate('/chats')
                }}
              >
                <span className={styles.recentTitle}>{item.title}</span>
                <button
                  className={styles.recentMore}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="More options"
                >
                  <IconMore />
                </button>
              </div>
            ))}
          </div>
        )}
      </nav>

      <div className={styles.footer} ref={popover.ref}>
        <div className={styles.userRow}>
          <button className={styles.avatarBtn} onClick={popover.toggle} aria-label="User menu">
            <div className={styles.avatar}>YA</div>
          </button>

          <div className={[styles.userInfo, isClosed ? styles.userInfoHidden : ''].join(' ')}>
            <div className={styles.userName}>{t('user.yourName')}</div>
            <div className={styles.userPlan}>{t('footer.proPlan')}</div>
          </div>

          <button
            className={[styles.footIconBtn, isClosed ? styles.footIconBtnHidden : ''].join(' ')}
            onClick={popover.toggle}
            aria-label="More"
            tabIndex={isClosed ? -1 : 0}
          >
            <IconUpDown />
          </button>
        </div>

        <UserPopover isOpen={popover.isOpen} popoverRef={null} />
      </div>

    </aside>
  )
}
