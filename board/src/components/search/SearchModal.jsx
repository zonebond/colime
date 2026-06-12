import { useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useSearchModal } from '@/hooks/useSearchModal'
import { useSessionSearch } from '@/features/search/search.hooks'
import { useAppStore } from '@/store/useAppStore'
import styles from './SearchModal.module.css'

function Snippet({ html }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

export default function SearchModal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { close } = useSearchModal()
  const {
    query, setQuery,
    results, loading, isEmpty,
    selectedIndex, setSelectedIndex, moveSelection,
    isSearching, hasSessionResults, hasContentResults,
  } = useSessionSearch()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const closeSearchModal = useAppStore((s) => s.closeSearchModal)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeSearchModal()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [closeSearchModal])

  const navigateToItem = useCallback(
    (item) => {
      if (item._type === 'content' && item.messageID) {
        navigate(`/chats/${item.sessionID}?scrollTo=${item.messageID}`)
      } else {
        navigate(`/chats/${item.id || item.sessionID}`)
      }
      close()
    },
    [navigate, close],
  )

  const handleInputKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveSelection(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveSelection(-1)
      } else if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault()
        const item = results[selectedIndex]
        if (item) navigateToItem(item)
      }
    },
    [results, selectedIndex, moveSelection, navigateToItem],
  )

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const showSections = isSearching && !loading && results.length > 0
  const recentLabel = !isSearching ? t('searchModal.recent') : null

  return createPortal(
    <div className={styles.overlay} onClick={close}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.inputWrapper}>
          <svg className={styles.inputIcon} width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
            <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t('searchModal.placeholder')}
            spellCheck={false}
            autoCorrect="off"
            autoComplete="off"
            autoCapitalize="off"
          />
          {query && (
            <button
              className={styles.clearBtn}
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
              aria-label="Clear"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
              </svg>
            </button>
          )}
        </div>

        <div className={styles.results} ref={listRef}>
          {loading && (
            <div className={styles.loading}>
              <div className={`uiSkeleton ${styles.skeletonLine}`} style={{ width: '60%', height: '16px' }} />
              <div className={`uiSkeleton ${styles.skeletonLine}`} style={{ width: '80%', height: '16px' }} />
              <div className={`uiSkeleton ${styles.skeletonLine}`} style={{ width: '40%', height: '16px' }} />
            </div>
          )}

          {!loading && isEmpty && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{t('searchModal.noResults')}</p>
              <p className={styles.emptyDesc}>{t('searchModal.noResultsDesc')}</p>
            </div>
          )}

          {/* Recent sessions (no query) */}
          {!loading && !isSearching && results.length > 0 && (
            <>
              <div className={styles.sectionLabel}>{recentLabel}</div>
              {results.map((chat, i) => (
                <div
                  key={chat.id}
                  data-index={i}
                  className={`${styles.resultItem} ${i === selectedIndex ? styles.resultItemActive : ''}`}
                  onClick={() => navigateToItem(chat)}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <div className={styles.resultTitle}>{chat.title}</div>
                  {chat.preview && (
                    <div className={styles.resultPreview}>{chat.preview}</div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Search results with sections */}
          {showSections && (
            <>
              {hasSessionResults && (
                <>
                  <div className={styles.sectionLabel}>{t('searchModal.sessionResults')}</div>
                  {results
                    .filter((item) => item._type === 'session')
                    .map((chat) => {
                      const idx = results.indexOf(chat)
                      return (
                        <div
                          key={chat.id}
                          data-index={idx}
                          className={`${styles.resultItem} ${idx === selectedIndex ? styles.resultItemActive : ''}`}
                          onClick={() => navigateToItem(chat)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <div className={styles.resultTitle}>{chat.title}</div>
                          {chat.preview && (
                            <div className={styles.resultPreview}>{chat.preview}</div>
                          )}
                        </div>
                      )
                    })}
                </>
              )}

              {hasContentResults && (
                <>
                  <div className={styles.sectionLabel}>{t('searchModal.contentResults')}</div>
                  {results
                    .filter((item) => item._type === 'content')
                    .map((item) => {
                      const idx = results.indexOf(item)
                      const roleLabel =
                        item.role === 'user'
                          ? t('searchModal.roleUser')
                          : item.role === 'assistant'
                            ? t('searchModal.roleAssistant')
                            : ''
                      return (
                        <div
                          key={item.partID}
                          data-index={idx}
                          className={`${styles.resultItem} ${idx === selectedIndex ? styles.resultItemActive : ''}`}
                          onClick={() => navigateToItem(item)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                        >
                          <div className={styles.resultTitle}>
                            <Snippet html={item.snippet || item.sessionTitle} />
                          </div>
                          <div className={styles.resultPreview}>
                            {item.sessionTitle}
                            {roleLabel && ` · ${roleLabel}`}
                          </div>
                        </div>
                      )
                    })}
                </>
              )}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerItem}>
            <kbd>↑↓</kbd> {t('searchModal.footerHint')}
          </span>
          <span className={styles.footerItem}>
            <kbd>↵</kbd> {t('searchModal.footerOpen')}
          </span>
          <span className={styles.footerItem}>
            <kbd>Esc</kbd> {t('searchModal.footerClose')}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
