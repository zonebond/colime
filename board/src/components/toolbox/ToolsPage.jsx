import { useMemo, useState } from 'react'
import { useTranslation } from '@/i18n'
import { useToolsModel } from '@/features/toolbox/toolbox.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import { IconMagnifyingGlass, IconWrench } from '@/components/icons'
import styles from './ToolsPage.module.css'

const SKELETON_COUNT = 6

export default function ToolsPage() {
  const { t } = useTranslation()
  const { tools, loading, toggleTool } = useToolsModel()
  const [search, setSearch] = useState('')

  const tp = t('toolbox') || {}

  const {
    value: searchDraft,
    handleChange: handleSearchChange,
    handleCompositionStart: handleSearchCompositionStart,
    handleCompositionEnd: handleSearchCompositionEnd,
  } = useImeSafeInput({
    value: search,
    onCommit: (value) => setSearch(value),
    debounceMs: 160,
  })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return tools
    return tools.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
    )
  }, [tools, search])

  return (
    <div className={styles.content}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle}>{tp.tools || 'Tools'}</h1>
        <p className={styles.sectionDesc}>{tp.toolsDesc || 'Command-line tools and integrations'}</p>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <IconMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={tp.searchTools || 'Search tools...'}
            value={searchDraft}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
          />
        </div>
      </div>

      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div key={`skeleton-${index}`} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader}>
                <div className="uiSkeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
                <div className={styles.skeletonHeaderText}>
                  <div className={`uiSkeleton ${styles.skeletonTitle}`} />
                  <div className={`uiSkeleton ${styles.skeletonBadge}`} />
                </div>
              </div>
              <div className={`uiSkeleton ${styles.skeletonDesc}`} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>{search ? t('projects.noResults') : (tp.noTools || t('toolbox.noTools'))}</p>
            <p className={styles.emptyDesc}>{search ? t('projects.noResultsDesc') : (tp.noToolsDesc || t('toolbox.noToolsDesc'))}</p>
          </div>
        ) : (
          filtered.map((tool, index) => (
            <div key={tool.id} className={styles.card} style={{ animationDelay: Math.min(index * 40, 400) + 'ms' }}>
              <div className={styles.cardHeader}>
                <div className={styles.cardInfo}>
                  <div className={styles.cardIcon}>
                    <IconWrench />
                  </div>
                  <span className={styles.cardName}>{tool.name}</span>
                  <span className={styles.typeBadge}>{tool.type}</span>
                </div>
                <button
                  className={`${styles.toggle} ${tool.enabled ? styles.toggleOn : ''}`}
                  onClick={() => toggleTool(tool.id)}
                  title={tool.enabled ? t('toolbox.disable') : t('toolbox.enable')}
                >
                  <span className={styles.toggleKnob} />
                </button>
              </div>
              <p className={styles.cardDesc}>{tool.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}