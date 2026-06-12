import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from '@/i18n'
import { useSkillsModel } from '@/features/toolbox/toolbox.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import { IconMagnifyingGlass, IconSparkle, IconReload, IconPlusSmall } from '@/components/icons'
import SkillDetailDialog from './SkillDetailDialog'
import SkillCreateDialog from './SkillCreateDialog'
import SkillActionsMenu, { isSkillDisabled } from './SkillActionsMenu'
import styles from './SkillsPage.module.css'

const SKELETON_COUNT = 6

export default function SkillsPage() {
  const { t } = useTranslation()
  const { skills, loading, reloadSkills, createSkill, updateSkill } = useSkillsModel()
  const [reloading, setReloading] = useState(false)
  const reloadLockRef = useRef(false)
  const COOLDOWN_MS = 300

  const handleReload = useCallback(async () => {
    if (reloadLockRef.current) return
    reloadLockRef.current = true
    setReloading(true)
    try {
      await reloadSkills()
    } finally {
      setReloading(false)
      setTimeout(() => { reloadLockRef.current = false }, COOLDOWN_MS)
    }
  }, [reloadSkills])
  const [search, setSearch] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [showDisabled, setShowDisabled] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [disabledNames, setDisabledNames] = useState(() => {
    try { return JSON.parse(localStorage.getItem('board:disabledSkills') || '[]') } catch { return [] }
  })

  const handleToggleSkill = useCallback((name, disabled) => {
    setDisabledNames((prev) => {
      const next = disabled ? [...new Set([...prev, name])] : prev.filter((n) => n !== name)
      return next
    })
  }, [])

  const handleDeleteSkill = useCallback(async (_name) => {
    await reloadSkills()
  }, [reloadSkills])

  const handleAddSkill = useCallback(() => {
    setEditTarget(null)
    setShowCreateDialog(true)
  }, [])

  const handleCreateConfirm = useCallback(async (values) => {
    setSubmitting(true)
    try {
      await createSkill(values)
      setShowCreateDialog(false)
    } finally {
      setSubmitting(false)
    }
  }, [createSkill])

  const handleEditConfirm = useCallback(async (values) => {
    if (!editTarget) return
    setSubmitting(true)
    try {
      await updateSkill(editTarget.name, values)
      setShowCreateDialog(false)
      setEditTarget(null)
    } finally {
      setSubmitting(false)
    }
  }, [editTarget, updateSkill])

  const handleEditInDialog = useCallback((skill) => {
    setEditTarget(skill)
    setShowCreateDialog(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    if (submitting) return
    setShowCreateDialog(false)
    setEditTarget(null)
  }, [submitting])

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
    return skills.filter((s) => {
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
      )
    })
  }, [skills, search])

  const { enabledSkills, disabledSkills } = useMemo(() => {
    const disabledSet = new Set(disabledNames)
    return {
      enabledSkills: filtered.filter((s) => !disabledSet.has(s.name)),
      disabledSkills: filtered.filter((s) => disabledSet.has(s.name)),
    }
  }, [filtered, disabledNames])

  return (
    <div className={styles.content}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle}>{tp.skills || 'Skills'}</h1>
        <p className={styles.sectionDesc}>{tp.skillsDesc || 'Pre-packaged repeatable best practices and tools'}</p>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <IconMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={tp.searchSkills || 'Search skills...'}
            value={searchDraft}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
          />
        </div>
        <div className={styles.toolbarRight}>
          {disabledSkills.length > 0 && (
            <button
              className={styles.filterBtn}
              onClick={() => setShowDisabled((v) => !v)}
            >
              {showDisabled ? (tp.hideDisabled || 'Hide disabled') : (tp.showDisabled || 'Show disabled')}
              <span className={styles.filterBadge}>{disabledSkills.length}</span>
            </button>
          )}
          <button
            className={styles.reloadBtn}
            onClick={handleReload}
            disabled={reloading}
            title="Reload skills from disk"
            aria-label="Reload skills from disk"
          >
            <span className={`${styles.reloadIcon} ${reloading ? styles.reloadSpinning : ''}`}>
              <IconReload />
            </span>
          </button>
        </div>
      </div>

      <div className={styles.addBanner} onClick={handleAddSkill} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') handleAddSkill() }}>
        <div className={styles.addBannerIcon}>
          <IconPlusSmall />
        </div>
        <div className={styles.addBannerContent}>
          <span className={styles.addBannerTitle}>{tp.addCustomSkills || '+ Add custom Skills'}</span>
          <p className={styles.addBannerDesc}>{tp.addCustomSkillsDesc || 'Create your own SKILL.md with instructions for the AI'}</p>
        </div>
        <button className={styles.addBannerBtn} onClick={(e) => { e.stopPropagation(); handleAddSkill() }}>
          <IconPlusSmall /> {tp.add || 'Add'}
        </button>
      </div>

      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div key={`skeleton-${index}`} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader}>
                <div className={`uiSkeleton ${styles.skeletonTitle}`} />
              </div>
              <div className={`uiSkeleton ${styles.skeletonDesc}`} />
              <div className={styles.skeletonDivider} />
              <div className={styles.skeletonFooter}>
                <div className={`uiSkeleton ${styles.skeletonBadge}`} />
              </div>
            </div>
          ))
        ) : enabledSkills.length === 0 && (!showDisabled || disabledSkills.length === 0) ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>{search ? t('projects.noResults') : (tp.noSkills || t('toolbox.noSkills'))}</p>
            <p className={styles.emptyDesc}>{search ? t('projects.noResultsDesc') : (tp.noSkillsDesc || t('toolbox.noSkillsDesc'))}</p>
          </div>
        ) : (
          <>
            {enabledSkills.map((skill, index) => (
              <div key={skill.id} className={styles.card} style={{ animationDelay: Math.min(index * 40, 400) + 'ms' }} onClick={() => setSelectedSkill(skill)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedSkill(skill) }}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardNameRow}>
                    {skill.featured && (
                      <IconSparkle className={styles.sparkle} />
                    )}
                    <span className={styles.cardName}>{skill.name}</span>
                  </div>
                </div>
                <p className={styles.cardDesc}>{skill.description}</p>
                <div className={styles.cardDivider} />
                <div className={styles.cardFooter}>
                  <span className={styles.footerBadge}>{skill.source}</span>
                  {skill.location && skill.location !== '<built-in>' && (
                    <>
                      <span className={styles.footerSep}>&middot;</span>
                      <span className={styles.footerMeta} title={skill.location}>{skill.location.split('/').slice(-2).join('/')}</span>
                    </>
                  )}
                  {isSkillDisabled(skill.name) && (
                    <>
                      <span className={styles.footerSep}>&middot;</span>
                      <span className={styles.disabledBadge}>Disabled</span>
                    </>
                  )}
                </div>
                <div className={styles.actions}>
                  <SkillActionsMenu skill={skill} onToggle={handleToggleSkill} onDelete={handleDeleteSkill} onEditInDialog={handleEditInDialog} />
                </div>
              </div>
            ))}
            {showDisabled && disabledSkills.map((skill, index) => (
              <div key={skill.id} className={`${styles.card} ${styles.cardDisabled}`} style={{ animationDelay: Math.min(index * 40, 400) + 'ms' }} onClick={() => setSelectedSkill(skill)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedSkill(skill) }}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardNameRow}>
                    {skill.featured && (
                      <IconSparkle className={styles.sparkle} />
                    )}
                    <span className={styles.cardName}>{skill.name}</span>
                  </div>
                </div>
                <p className={styles.cardDesc}>{skill.description}</p>
                <div className={styles.cardDivider} />
                <div className={styles.cardFooter}>
                  <span className={styles.footerBadge}>{skill.source}</span>
                  {skill.location && skill.location !== '<built-in>' && (
                    <>
                      <span className={styles.footerSep}>&middot;</span>
                      <span className={styles.footerMeta} title={skill.location}>{skill.location.split('/').slice(-2).join('/')}</span>
                    </>
                  )}
                  <span className={styles.footerSep}>&middot;</span>
                  <span className={styles.disabledBadge}>Disabled</span>
                </div>
                <div className={styles.actions}>
                  <SkillActionsMenu skill={skill} onToggle={handleToggleSkill} onDelete={handleDeleteSkill} onEditInDialog={handleEditInDialog} />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {selectedSkill && (
        <SkillDetailDialog
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
        />
      )}

      {showCreateDialog && (
        <SkillCreateDialog
          title={editTarget ? (tp.editSkill || 'Edit Skill') : (tp.newSkill || 'Create Skill')}
          skill={editTarget}
          onConfirm={editTarget ? handleEditConfirm : handleCreateConfirm}
          onCancel={handleCloseDialog}
          cancelText={tp.cancel || 'Cancel'}
          confirmText={editTarget ? (tp.save || 'Save') : (tp.add || 'Create')}
          pendingText={tp.saving || 'Saving...'}
          isSubmitting={submitting}
          t={t}
        />
      )}
    </div>
  )
}