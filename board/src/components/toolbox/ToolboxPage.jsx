import { useSearchParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import ConnectProviderPage from './ConnectProviderPage'
import SkillsPage from './SkillsPage'
import McpPage from './McpPage'
import ToolsPage from './ToolsPage'
import AgentsPage from './AgentsPage'
import styles from './ToolboxPage.module.css'

const NAV_ITEMS = [
  { id: 'providers', i18nKey: 'toolbox.providers' },
  { id: 'skills', i18nKey: 'toolbox.skills' },
  { id: 'agents', i18nKey: 'toolbox.agents' },
  { id: 'mcp', i18nKey: 'toolbox.mcp' },
  { id: 'tools', i18nKey: 'toolbox.tools' },
]

const VALID_SECTIONS = NAV_ITEMS.map((item) => item.id)

export default function ToolboxPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSection = searchParams.get('section') || 'providers'
  const activeSection = VALID_SECTIONS.includes(rawSection) ? rawSection : 'providers'

  const renderContent = () => {
    switch (activeSection) {
      case 'providers':
        return <ConnectProviderPage />
      case 'skills':
        return <SkillsPage />
      case 'agents':
        return <AgentsPage />
      case 'mcp':
        return <McpPage />
      case 'tools':
        return <ToolsPage />
      default:
        return <ConnectProviderPage />
    }
  }

  return (
    <div className={styles.page}>
      <nav className={styles.navPanel}>
        <div className={styles.navScroll}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={[styles.navItem, activeSection === item.id ? styles.navItemActive : ''].join(' ')}
              onClick={() => setSearchParams({ section: item.id })}
            >
              <span className={styles.navLabel}>{t(item.i18nKey)}</span>
            </button>
          ))}
        </div>
      </nav>

      <div className={styles.contentArea}>
        {renderContent()}
      </div>
    </div>
  )
}