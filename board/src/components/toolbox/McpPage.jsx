import { useMemo, useState } from 'react'
import { useTranslation } from '@/i18n'
import { useMcpServersModel } from '@/features/toolbox/toolbox.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import { IconMagnifyingGlass, IconPlusSmall, IconPencil, IconTrashSmall } from '@/components/icons'
import McpServerDialog from './McpServerDialog'
import ConfirmDialog from '@/components/chats/ConfirmDialog'
import styles from './McpPage.module.css'

const SKELETON_COUNT = 4

export default function McpPage() {
  const { t } = useTranslation()
  const { servers, loading, createMcpServer, updateMcpServer, deleteMcpServer, toggleMcpServer } = useMcpServersModel()

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return servers
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q))
    )
  }, [servers, search])

  const handleCreate = () => {
    setEditTarget(null)
    setShowCreateDialog(true)
  }

  const handleEdit = (server) => {
    setEditTarget(server)
    setShowCreateDialog(true)
  }

  const handleCreateConfirm = async (values) => {
    setShowCreateDialog(false)
    await createMcpServer(values)
  }

  const handleEditConfirm = async (values) => {
    setShowCreateDialog(false)
    if (editTarget) {
      await updateMcpServer(editTarget.id, values)
    }
    setEditTarget(null)
  }

  const handleDeleteConfirm = async () => {
    await deleteMcpServer(deleteTargetId)
    setDeleteTargetId(null)
  }

  const getStatusColor = (status) => {
    if (status === 'connected') return 'var(--success)'
    if (status === 'error') return 'var(--danger)'
    return 'var(--txt3)'
  }

  return (
    <div className={styles.content}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle}>{tp.mcp || 'MCP'}</h1>
        <p className={styles.sectionDesc}>{tp.mcpDesc || 'Manage your Model Context Protocol servers'}</p>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <IconMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={tp.searchMcp || 'Search MCP servers...'}
            value={searchDraft}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
          />
        </div>
        <button className={styles.newBtn} onClick={handleCreate}>
          <IconPlusSmall />
          {tp.newMcpServer}
        </button>
      </div>

      <div className={styles.grid}>
        {loading ? (
          Array.from({ length: SKELETON_COUNT }).map((_, index) => (
            <div key={`skeleton-${index}`} className={styles.skeletonCard}>
              <div className={styles.skeletonHeader}>
                <div className="uiSkeleton" style={{ width: 10, height: 10, borderRadius: '50%' }} />
                <div className={`uiSkeleton ${styles.skeletonTitle}`} />
              </div>
              <div className={`uiSkeleton ${styles.skeletonCode}`} />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>{search ? t('projects.noResults') : (tp.noMcpServers || t('toolbox.noMcpServers'))}</p>
            <p className={styles.emptyDesc}>{search ? t('projects.noResultsDesc') : (tp.noMcpServersDesc || t('toolbox.noMcpServersDesc'))}</p>
          </div>
        ) : (
          filtered.map((server, index) => (
            <div key={server.id} className={styles.card} style={{ animationDelay: Math.min(index * 40, 400) + 'ms' }}>
              <div className={styles.cardTop}>
                <div className={styles.cardInfo}>
                  <span className={styles.statusDot} style={{ background: getStatusColor(server.status) }} />
                  <span className={styles.cardName}>{server.name}</span>
                </div>
                <div className={styles.cardActions}>
                  <button
                    className={`${styles.toggle} ${server.status === 'connected' ? styles.toggleOn : ''}`}
                    onClick={() => toggleMcpServer(server.id)}
                    title={server.status === 'connected' ? t('toolbox.disconnect') : t('toolbox.connect')}
                  >
                    <span className={styles.toggleKnob} />
                  </button>
                  <button className={styles.actionBtn} onClick={() => handleEdit(server)} title={t('toolbox.edit')}>
                    <IconPencil />
                  </button>
                  <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => setDeleteTargetId(server.id)} title={t('toolbox.delete')}>
                    <IconTrashSmall />
                  </button>
                </div>
              </div>
              {server.command && (
                <code className={styles.command}>{server.command}</code>
              )}
              {server.description && (
                <p className={styles.cardDesc}>{server.description}</p>
              )}
            </div>
          ))
        )}
      </div>

      {showCreateDialog && (
        <McpServerDialog
          title={editTarget ? tp.editMcpServer : tp.newMcpServer}
          server={editTarget}
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