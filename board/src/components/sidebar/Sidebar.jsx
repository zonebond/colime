import { useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePopover } from '@/hooks/usePopover'
import { useTranslation } from '@/i18n'
import { useAppStore } from '@/store/useAppStore'
import { useChatsModel } from '@/features/chats/chats.hooks'

import NavRow from './NavRow'
import UserPopover from './UserPopover'
import {
  IconToggleSidebar, IconNewChat, IconSearch, IconToolbox,
  IconChats, IconProjects, IconWorkspace, IconAssets,
  IconPin, IconUpDown, IconLogo,
} from '@/components/icons'
import styles from './Sidebar.module.css'

const NAV_ITEMS_GROUP2 = [
  { id: 'chats', i18nKey: 'sidebar.chats', icon: IconChats, path: '/chats' },
  { id: 'projects', i18nKey: 'sidebar.projects', icon: IconProjects, path: '/projects' },
  { id: 'tasks', i18nKey: 'sidebar.tasks', icon: IconWorkspace, path: '/tasks' },
  { id: 'library', i18nKey: 'sidebar.library', icon: IconAssets, path: '/library' },
]

const RECENT_LIMIT = 8

function formatRelativeTime(ts, locale) {
  if (!ts) return ''
  const diffSec = Math.round((ts - Date.now()) / 1000)
  if (Math.abs(diffSec) < 60) return locale === 'zh' ? '刚刚' : 'now'
  const rtf = new Intl.RelativeTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { numeric: 'always', style: 'narrow' })
  const min = Math.round(diffSec / 60)
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')
  const hr = Math.round(min / 60)
  if (Math.abs(hr) < 24) return rtf.format(hr, 'hour')
  const day = Math.round(hr / 24)
  if (Math.abs(day) < 7) return rtf.format(day, 'day')
  const week = Math.round(day / 7)
  if (Math.abs(week) < 5) return rtf.format(week, 'week')
  return rtf.format(Math.round(day / 30), 'month')
}

export default function Sidebar({ isOpen, onToggle }) {
  const { t, locale } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const popover = usePopover()
  const { chats } = useChatsModel()

  // Pinned first, then most recently active; hide archived and subtask
  // child sessions.
  const recentChats = useMemo(() => {
    const list = (chats ?? []).filter((c) => !c.isArchived && !c._parentID)
    list.sort((a, b) => (Number(b.isPinned) - Number(a.isPinned)) || (b.lastActiveAt - a.lastActiveAt))
    return list.slice(0, RECENT_LIMIT)
  }, [chats])
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

        {!isClosed && recentChats.length > 0 && (
          <div className={styles.recentsSection}>
            <div className={styles.sectionLabel}>{t('sidebar.recents')}</div>
            {recentChats.map((chat) => {
              const isActive = location.pathname === `/chats/${chat.id}`
              return (
                <div
                  key={chat.id}
                  className={[styles.recentRow, isActive ? styles.recentActive : ''].join(' ')}
                  onClick={() => navigate(`/chats/${chat.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') navigate(`/chats/${chat.id}`)
                  }}
                >
                  {chat.isResponding && <span className={styles.recentRunningDot} aria-label={t('sidebar.chatRunning')} />}
                  {!chat.isResponding && chat.isPinned && (
                    <span className={styles.recentPin}><IconPin isPinned /></span>
                  )}
                  <span className={styles.recentTitle} title={chat.preview || undefined}>
                    {chat.title || t('sidebar.untitledChat')}
                  </span>
                  <span className={styles.recentTime}>{formatRelativeTime(chat.lastActiveAt, locale)}</span>
                </div>
              )
            })}
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
