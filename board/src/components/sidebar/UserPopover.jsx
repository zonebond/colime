import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  IconSettings, IconLanguage, IconHelp,
  IconPlans, IconApps, IconGift, IconInfo,
  IconLogout, IconChevronRight,
} from '@/components/icons'
import { useTranslation } from '@/i18n'
import { useAppStore } from '@/store/useAppStore'
import styles from './UserPopover.module.css'

export default function UserPopover({ isOpen, popoverRef }) {
  const { t, locale, setLocale } = useTranslation()
  const navigate = useNavigate()
  const rawTheme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const theme = rawTheme === 'warm-editorial' ? 'light' : rawTheme === 'tech-system' ? 'warm' : rawTheme
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [themeDialogOpen, setThemeDialogOpen] = useState(false)

  useEffect(() => {
    if (isOpen) return
    setLangMenuOpen(false)
    setThemeDialogOpen(false)
  }, [isOpen])

  useEffect(() => {
    if (!themeDialogOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setThemeDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [themeDialogOpen])

  if (!isOpen) return null

  return (
    <div className={styles.popover} ref={popoverRef} role="menu">
      <div className={styles.email}>{t('popover.email')}</div>

      {/* Group 1 */}
      <div className={styles.section}>
        <PopItem icon={<IconSettings />} label={t('popover.settings')} kbd={[<span key="s">{'\u21E7'}</span>, <span key="m">{'\u2318'}</span>, <span key="c">,</span>]} />
        <PopItem
          icon={<IconLanguage />}
          label={t('popover.language')}
          chevron
          hasSubMenu
          subOpen={langMenuOpen}
          onClick={() => {
            setLangMenuOpen(o => !o)
          }}
        />
        {langMenuOpen && (
          <div className={styles.subMenu}>
            <button
              className={[styles.item, styles.subItem, locale === 'en' ? styles.subItemActive : ''].join(' ')}
              onClick={() => { setLocale('en'); setLangMenuOpen(false) }}
            >
              <span className={styles.itemLabel}>{t('popover.english')}</span>
              {locale === 'en' && <span className={styles.check}>✓</span>}
            </button>
            <button
              className={[styles.item, styles.subItem, locale === 'zh' ? styles.subItemActive : ''].join(' ')}
              onClick={() => { setLocale('zh'); setLangMenuOpen(false) }}
            >
              <span className={styles.itemLabel}>{t('popover.chinese')}</span>
              {locale === 'zh' && <span className={styles.check}>✓</span>}
            </button>
          </div>
        )}
        <PopItem
          icon={<IconPlans />}
          label={t('popover.theme')}
          onClick={() => {
            setLangMenuOpen(false)
            setThemeDialogOpen(true)
          }}
        />
        <PopItem
          icon={<IconHelp />}
          label={t('popover.help')}
          onClick={() => {
            navigate('/help')
          }}
        />
      </div>

      <div className={styles.divider} />

      {/* Group 2 */}
      <div className={styles.section}>
        <PopItem icon={<IconPlans />} label={t('popover.viewAllPlans')} />
        <PopItem icon={<IconApps />} label={t('popover.getApps')} />
        <PopItem icon={<IconGift />} label={t('popover.gift')} />
        <PopItem icon={<IconInfo />} label={t('popover.learnMore')} chevron />
      </div>

      <div className={styles.divider} />

      {/* Group 3 */}
      <div className={styles.section}>
        <PopItem icon={<IconLogout />} label={t('popover.logOut')} />
      </div>

      {themeDialogOpen && createPortal(
        <div className={styles.themeDialogLayer} role="presentation">
          <button className={styles.themeDialogBackdrop} aria-label={t('popover.close')} onClick={() => setThemeDialogOpen(false)} />
          <div
            className={styles.themeDialog}
            role="dialog"
            aria-modal="true"
            aria-label={t('popover.chooseTheme')}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className={styles.themeDialogHeader}>
              <div>
                <div className={styles.themeDialogTitle}>{t('popover.chooseTheme')}</div>
                <div className={styles.themeDialogDescription}>{t('popover.themeDescription')}</div>
              </div>
              <button className={styles.themeDialogClose} aria-label={t('popover.close')} onClick={() => setThemeDialogOpen(false)}>×</button>
            </div>

            <div className={styles.themeDialogGrid}>
              <button
                className={[styles.themeCard, theme === 'light' ? styles.themeCardActive : ''].join(' ')}
                onClick={() => { setTheme('light'); setThemeDialogOpen(false) }}
              >
                <span className={[styles.themePreview, styles.themeLight].join(' ')}>
                  <span className={styles.themePreviewSidebar} />
                  <span className={styles.themePreviewMain}>
                    <span className={styles.themePreviewGlow} />
                    <span className={styles.themePreviewSurface} />
                  </span>
                </span>
                <span className={styles.themeMeta}>
                  <span className={styles.themeTitle}>{t('popover.light')}</span>
                  <span className={styles.themeCaption}>{t('popover.lightDesc')}</span>
                </span>
                {theme === 'light' && <span className={styles.check}>✓</span>}
              </button>
              <button
                className={[styles.themeCard, theme === 'warm' ? styles.themeCardActive : ''].join(' ')}
                onClick={() => { setTheme('warm'); setThemeDialogOpen(false) }}
              >
                <span className={[styles.themePreview, styles.themeWarm].join(' ')}>
                  <span className={styles.themePreviewSidebar} />
                  <span className={styles.themePreviewMain}>
                    <span className={styles.themePreviewGlow} />
                    <span className={styles.themePreviewSurface} />
                  </span>
                </span>
                <span className={styles.themeMeta}>
                  <span className={styles.themeTitle}>{t('popover.warm')}</span>
                  <span className={styles.themeCaption}>{t('popover.warmDesc')}</span>
                </span>
                {theme === 'warm' && <span className={styles.check}>✓</span>}
              </button>
              <button
                className={[styles.themeCard, theme === 'dark' ? styles.themeCardActive : ''].join(' ')}
                onClick={() => { setTheme('dark'); setThemeDialogOpen(false) }}
              >
                <span className={[styles.themePreview, styles.themeDark].join(' ')}>
                  <span className={styles.themePreviewSidebar} />
                  <span className={styles.themePreviewMain}>
                    <span className={styles.themePreviewGlow} />
                    <span className={styles.themePreviewSurface} />
                  </span>
                </span>
                <span className={styles.themeMeta}>
                  <span className={styles.themeTitle}>{t('popover.dark')}</span>
                  <span className={styles.themeCaption}>{t('popover.darkDesc')}</span>
                </span>
                {theme === 'dark' && <span className={styles.check}>✓</span>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function PopItem({ icon, label, kbd, chevron, subOpen, onClick }) {
  return (
    <button
      className={styles.item}
      role="menuitem"
      onClick={onClick}
    >
      <span className={styles.itemIcon}>{icon}</span>
      <span className={styles.itemLabel}>{label}</span>
      {kbd && (
        <span className={styles.kbd}>
          {Array.isArray(kbd) ? kbd.map((k, i) => <span key={i}>{k}</span>) : kbd}
        </span>
      )}
      {chevron && <IconChevronRight className={[styles.chevron, subOpen ? styles.chevronOpen : ''].join(' ')} />}
    </button>
  )
}
