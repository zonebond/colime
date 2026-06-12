import { useState } from 'react'
import { useTranslation } from '@/i18n'
import { useAgentsModel } from '@/features/toolbox/toolbox.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import { IconMagnifyingGlass, IconPlusSmall, IconPencil, IconTrashSmall } from '@/components/icons'
import AgentDialog from './AgentDialog'
import ConfirmDialog from '@/components/chats/ConfirmDialog'
import styles from './AgentsPage.module.css'

const SKELETON_COUNT = 4

export default function AgentsPage() {
  const { t } = useTranslation()
  const { agents, loading, createAgent, updateAgent, deleteAgent, toggleAgent } = useAgentsModel()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
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

  const filtered = agents.filter(agent => {
    if (!search.toLowerCase().trim()) return true
    const q = search.toLowerCase().trim()
    return agent.name.toLowerCase().includes(q) ||
      (agent.description && agent.description.toLowerCase().includes(q))
  })

  const handleCreate = () => {
    setEditTarget(null)
    setShowCreateDialog(true)
  }

  const handleEdit = (agent) => {
    setEditTarget(agent)
    setShowCreateDialog(true)
  }

  const handleCreateConfirm = async (values) => {
    setShowCreateDialog(false)
    await createAgent(values)
  }

  const handleEditConfirm = async (values) => {
    setShowCreateDialog(false)
    if (editTarget) {
      await updateAgent(editTarget.id, values)
    }
    setEditTarget(null)
  }

  const handleDeleteConfirm = async () => {
    await deleteAgent(deleteTargetId)
    setDeleteTargetId(null)
  }

  return (
    <div className={styles.content}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle}>{tp.agents || 'Agents'}</h1>
        <p className={styles.sectionDesc}>{tp.agentsDesc || 'Configure and manage AI agents'}</p>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <IconMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={tp.searchAgents || 'Search agents...'}
            value={searchDraft}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
          />
        </div>
        <button className={styles.newBtn} onClick={handleCreate}>
          <IconPlusSmall />
          {tp.newAgent}
        </button>
      </div>

      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div key={`skeleton-${index}`} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader}>
                <div className="uiSkeleton" style={{ width: 36, height: 22, borderRadius: 11 }} />
                <div className={`uiSkeleton ${styles.skeletonTitle}`} />
              </div>
              <div className={`uiSkeleton ${styles.skeletonDesc}`} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>{search ? t('projects.noResults') : (tp.noAgents || t('toolbox.noAgents'))}</p>
            <p className={styles.emptyDesc}>{search ? t('projects.noResultsDesc') : (tp.noAgentsDesc || t('toolbox.noAgentsDesc'))}</p>
          </div>
        ) : (
          filtered.map((agent, index) => (
            <div key={agent.id} className={styles.card} style={{ animationDelay: Math.min(index * 40, 400) + 'ms' }}>
              <div className={styles.cardTop}>
                <button
                  className={`${styles.toggle} ${agent.enabled ? styles.toggleOn : ''}`}
                  onClick={() => toggleAgent(agent.id)}
                  title={agent.enabled ? t('toolbox.disable') : t('toolbox.enable')}
                >
                  <span className={styles.toggleKnob} />
                </button>
                <div className={styles.cardInfo}>
                  <span className={styles.cardName}>{agent.name}</span>
                  <span className={styles.modelBadge}>{agent.model}</span>
                </div>
                <div className={styles.cardActions}>
                  <button className={styles.actionBtn} onClick={() => handleEdit(agent)} title={t('toolbox.edit')}>
                    <IconPencil />
                  </button>
                  <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => setDeleteTargetId(agent.id)} title={t('toolbox.delete')}>
                    <IconTrashSmall />
                  </button>
                </div>
              </div>
              <p className={styles.cardDesc}>{agent.description}</p>
            </div>
          ))
        )}
      </div>

      {showCreateDialog && (
        <AgentDialog
          title={editTarget ? tp.editAgent : tp.newAgent}
          agent={editTarget}
          onConfirm={editTarget ? handleEditConfirm : handleCreateConfirm}
          onCancel={() => {
            setShowCreateDialog(false)
            setEditTarget(null)
          }}
          cancelText={tp.cancel}
          confirmText={editTarget ? tp.save : tp.create}
          pendingText={tp.saving}
          t={t}
        />
      )}

      {deleteTargetId && (
        <ConfirmDialog
          title={tp.confirmDelete}
          description=""
          confirmText={tp.delete}
          cancelText={tp.cancel}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTargetId(null)}
        />
      )}
    </div>
  )
}