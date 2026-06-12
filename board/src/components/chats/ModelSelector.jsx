import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, MagnifyingGlass, Star, Spinner, Clock } from '@phosphor-icons/react'
import styles from './ModelSelector.module.css'

// Provider accent colors using existing design tokens
const PROVIDER_ACCENTS = {
  openai: 'var(--main-blue)',
  anthropic: 'var(--accent)',
  google: 'var(--success)',
  deepseek: 'var(--main-blue)',
  ollama: 'var(--txt2)',
  default: 'var(--txt3)',
}

function getProviderAccent(providerId) {
  const key = (providerId || '').toLowerCase()
  for (const [k, v] of Object.entries(PROVIDER_ACCENTS)) {
    if (key.includes(k)) return v
  }
  return PROVIDER_ACCENTS.default
}

const RECENT_MODELS_KEY = 'model_selector_recent'
const MAX_RECENT = 5

function getRecentModels() {
  try {
    const raw = localStorage.getItem(RECENT_MODELS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function addRecentModel(providerId, modelId) {
  try {
    const recent = getRecentModels().filter((r) => !(r.providerId === providerId && r.modelId === modelId))
    recent.unshift({ providerId, modelId, ts: Date.now() })
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
  } catch {
    // Storage may be unavailable; silently continue
  }
}

export default function ModelSelector({
  models,
  providers,
  loading,
  selectedModelId,
  selectedProviderId,
  favorites,
  onSelect,
  onToggleFavorite,
  onClose,
  onNavigateToProviders,
  t,
}) {
  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const searchRef = useRef(null)
  const overlayRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const providerMap = useMemo(() => {
    const map = new Map()
    if (providers) {
      providers.forEach((p) => map.set(p.id, p))
    }
    return map
  }, [providers])

  const modelMap = useMemo(() => {
    const map = new Map()
    if (models) {
      models.forEach((m) => {
        const pid = m.providerId || m.provider
        const key = `${pid}|${m.id}`
        map.set(key, m)
      })
    }
    return map
  }, [models])

  const favoriteSet = useMemo(() => {
    const set = new Set()
    if (favorites) {
      favorites.forEach((f) => set.add(`${f.providerId}|${f.modelId}`))
    }
    return set
  }, [favorites])

  const groupedModels = useMemo(() => {
    if (!models) {
      return { favoriteModels: [], recentModels: [], groups: [], flatModels: [] }
    }

    const filtered = search.trim()
      ? models.filter((m) => {
          const q = search.toLowerCase()
          const provider = providerMap.get(m.provider)
          return (
            (m.name || '').toLowerCase().includes(q) ||
            (m.providerName || '').toLowerCase().includes(q) ||
            (m.id || '').toLowerCase().includes(q) ||
            (provider?.name || '').toLowerCase().includes(q)
          )
        })
      : models

    // Provider groups
    const rawGroups = new Map()
    filtered.forEach((m) => {
      const providerId = m.providerId || m.provider
      if (!rawGroups.has(providerId)) {
        const provider = providerMap.get(providerId) || providerMap.get(m.provider)
        rawGroups.set(providerId, {
          providerId,
          providerName: m.providerName || provider?.name || providerId,
          isFavorite: provider?.enabled && provider?.status === 'connected',
          models: [],
        })
      }
      rawGroups.get(providerId).models.push(m)
    })

    const allGroups = Array.from(rawGroups.values()).sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1
      if (!a.isFavorite && b.isFavorite) return 1
      return a.providerName.localeCompare(b.providerName)
    })

    allGroups.forEach((g) => {
      g.models.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    })

    const favoriteModels = []
    if (!search.trim()) {
      favorites?.forEach((f) => {
        const key = `${f.providerId}|${f.modelId}`
        const model = modelMap.get(key)
        if (model) {
          const provider = providerMap.get(f.providerId)
          favoriteModels.push({
            ...model,
            providerId: f.providerId,
            providerName: model.providerName || provider?.name || f.providerId,
          })
        }
      })
    }

    const groups = allGroups.map((g) => ({
      ...g,
      models: g.models.map((m) => ({ ...m, providerId: g.providerId, providerName: g.providerName })),
    }))

    const recentKeys = search.trim() ? [] : getRecentModels()
    const recentModels = []
    recentKeys.forEach((r) => {
      const key = `${r.providerId}|${r.modelId}`
      const model = modelMap.get(key)
      if (model) {
        const provider = providerMap.get(r.providerId)
        recentModels.push({
          ...model,
          providerId: r.providerId,
          providerName: model.providerName || provider?.name || r.providerId,
        })
      }
    })

    const flatModels = [...favoriteModels, ...recentModels]
    groups.forEach((g) => {
      g.models.forEach((m) => flatModels.push(m))
    })

    return { favoriteModels, recentModels, groups, flatModels }
  }, [models, search, providerMap, modelMap, favorites])

  const flatIndexOf = useCallback(
    (providerId, modelId) => {
      return groupedModels.flatModels.findIndex(
        (m) => m.id === modelId && m.providerId === providerId,
      )
    },
    [groupedModels.flatModels],
  )

  const handleSelect = useCallback(
    (providerId, modelId) => {
      addRecentModel(providerId, modelId)
      onSelect(providerId, modelId)
    },
    [onSelect],
  )

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) =>
          Math.min(prev + 1, groupedModels.flatModels.length - 1),
        )
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, 0))
        return
      }

      if (
        e.key === 'Enter' &&
        highlightedIndex >= 0 &&
        highlightedIndex < groupedModels.flatModels.length
      ) {
        e.preventDefault()
        const model = groupedModels.flatModels[highlightedIndex]
        handleSelect(model.providerId, model.bareId)
        return
      }
    },
    [highlightedIndex, groupedModels.flatModels, handleSelect, onClose],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.querySelector(`[data-flat-index="${highlightedIndex}"]`)
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  useEffect(() => {
    setHighlightedIndex(-1)
  }, [search])

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose()
    }
  }

  const renderModelItem = (model, flatIndex) => {
    const isSelected = model.bareId === selectedModelId && model.providerId === selectedProviderId
    const isKeyboardHighlighted = flatIndex === highlightedIndex
    const isFavorited = favoriteSet.has(`${model.providerId}|${model.id}`)
    const accent = getProviderAccent(model.providerId)
    return (
      <div
        key={`${model.providerId}|${model.id}`}
        role="option"
        tabIndex={0}
        data-flat-index={flatIndex}
        className={`${styles.modelItem} ${isSelected ? styles.modelItemSelected : ''} ${isKeyboardHighlighted ? styles.modelItemHighlighted : ''} ${styles.modelItemWithStar}`}
	onClick={() => handleSelect(model.providerId, model.bareId)}
	onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(model.providerId, model.bareId) } }}
        style={{ '--item-accent': accent }}
      >
        <span
          className={styles.modelAccentBar}
          style={{ '--provider-accent': accent }}
        />
        <div className={styles.modelInfo}>
          <span className={styles.modelName}>{model.name}</span>
          {model.description && (
            <span className={styles.modelDesc}>{model.description}</span>
          )}
        </div>
        <button
          type="button"
          className={styles.starBtn}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite?.(model.providerId, model.id)
          }}
          title={isFavorited ? 'Unfavorite' : 'Favorite'}
        >
          <Star
            size={14}
            weight="fill"
            className={isFavorited ? styles.starIcon : styles.starIconFaded}
          />
        </button>
        {isSelected && (
          <div className={styles.checkBadge}>
            <Check size={13} weight="bold" className={styles.checkIcon} />
          </div>
        )}
      </div>
    )
  }

  return createPortal(
    <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={styles.popup}>
        <div className={styles.header}>
          <h2 className={styles.title}>{t('chats.modelSelector')}</h2>
        </div>

        <div className={styles.searchBar}>
          <MagnifyingGlass size={15} weight="regular" className={styles.searchIcon} />
          <input
            ref={searchRef}
            type="text"
            className={styles.searchInput}
            placeholder={t('chats.modelSelectorPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd className={styles.searchShortcut}>⌘K</kbd>
        </div>

        <div className={styles.list} ref={listRef}>
          {loading && (
            <div className={styles.loadingState}>
              <Spinner size={20} weight="regular" className={styles.loadingSpinner} />
              <span>{t('chats.loading')}</span>
            </div>
          )}

          {!loading && groupedModels.flatModels.length === 0 && !providers?.length && onNavigateToProviders && (
            <div className={styles.configureEmpty}>
              <span className={styles.configureEmptyText}>{t('chats.noConfiguredProviders') || 'No configured providers'}</span>
              <span className={styles.configureEmptyDesc}>{t('chats.noConfiguredProvidersDesc') || 'Add a provider to start chatting'}</span>
              <button className={styles.configureBtn} onClick={() => { onClose(); onNavigateToProviders() }}>
                {t('chats.configureProvider') || 'Configure'}
              </button>
            </div>
          )}

          {!loading && groupedModels.flatModels.length === 0 && providers?.length > 0 && (
            <div className={styles.emptyState}>
              <MagnifyingGlass size={24} weight="light" className={styles.emptyIcon} />
              <span>{t('chats.noModelsFound')}</span>
            </div>
          )}

          {!loading && groupedModels.flatModels.length > 0 && (
            <>
              {/* ── Favorites ── */}
              {groupedModels.favoriteModels.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Star size={11} weight="fill" className={styles.sectionIcon} />
                    <span className={styles.sectionTitle}>{t('chats.favorites')}</span>
                  </div>
                  {groupedModels.favoriteModels.map((model) =>
                    renderModelItem(model, flatIndexOf(model.providerId, model.id)),
                  )}
                </div>
              )}

              {/* ── Recent ── */}
              {groupedModels.recentModels.length > 0 && (
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Clock size={11} weight="fill" className={styles.sectionIcon} />
                    <span className={styles.sectionTitle}>{t('chats.recents')}</span>
                  </div>
                  {groupedModels.recentModels.map((model) =>
                    renderModelItem(model, flatIndexOf(model.providerId, model.id)),
                  )}
                </div>
              )}

              {/* ── Provider groups ── */}
              {groupedModels.groups.map((group, groupIndex) => {
                const accentColor = getProviderAccent(group.providerId)
                return (
                  <div
                    key={group.providerId}
                    className={styles.providerGroup}
                    style={{ '--group-index': groupIndex }}
                  >
                    <div className={styles.providerHeader}>
                      <span
                        className={styles.providerDot}
                        style={{ '--provider-accent': accentColor }}
                      />
                      <span className={styles.providerName}>{group.providerName}</span>
                      {group.providerId === selectedProviderId && (
                        <span className={styles.providerActiveBadge}>
                          {t('chats.active') || 'Active'}
                        </span>
                      )}
                    </div>
                    {group.models.map((model) =>
                      renderModelItem(model, flatIndexOf(model.providerId, model.id)),
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerHint}>
            <kbd className={styles.footerKbd}>↑</kbd>
            <kbd className={styles.footerKbd}>↓</kbd>
            navigate
          </span>
          <span className={styles.footerDivider}>·</span>
          <span className={styles.footerHint}>
            <kbd className={styles.footerKbd}>↵</kbd>
            select
          </span>
          <span className={styles.footerDivider}>·</span>
          <span className={styles.footerHint}>
            <kbd className={styles.footerKbd}>esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
