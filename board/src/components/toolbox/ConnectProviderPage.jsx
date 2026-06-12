import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from '@/i18n'
import { useProvidersModel, useFavoriteModelsModel } from '@/features/toolbox/toolbox.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import { testProvider } from '@/features/toolbox/toolbox.service'
import { getLlmConfig, updateLlmConfig } from '@/features/chats/chats.actions'
import { IconMore, IconCheck, IconXCircle, IconEye, IconEyeSlash, IconFlask, IconPencil, IconTrashSmall, IconMagnifyingGlass, IconPlusSmall, IconWarningCircle, IconInfoPhosphor, IconPlug, IconStar, IconSettings } from '@/components/icons'
import { CircleNotch } from '@phosphor-icons/react'
import ProviderIcon from './ProviderIcon'
import styles from './ConnectProviderPage.module.css'

const QUICK_SETUP_PROVIDERS = [
  { provider: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-5', 'claude-opus-4', 'claude-haiku-4-5'] },
  { provider: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini', 'o1'] },
  { provider: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  { provider: 'minimax-cn', name: 'MiniMax', models: ['MiniMax-M2.7-highspeed', 'MiniMax-M2.7'] },
  { provider: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1', models: ['llama3', 'mistral'] },
  { provider: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-medium-latest'] },
  { provider: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o'] },
  { provider: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1', models: ['local-model'] },
]

function getPopoverPosition(rect, menuWidth = 160, menuHeight = 164) {
  const gap = 6
  const viewportPadding = 12
  const openUp = rect.top < menuHeight + viewportPadding + gap
  return {
    left: Math.max(viewportPadding, rect.right - menuWidth),
    top: openUp
      ? rect.bottom + gap
      : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding),
    side: openUp ? 'bottom' : 'top',
  }
}

function ProviderCard({ provider, index, isFavorite, onToggleFavorite, onEdit, onDelete }) {
  const { t } = useTranslation()
  const tp = t('toolbox') || {}
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [fading, setFading] = useState(false)
  const [showPopover, setShowPopover] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, side: 'bottom' })
  const moreBtnRef = useRef(null)

  const handleTest = async (e) => {
    e.stopPropagation()
    setTesting(true)
    setTestResult(null)
    setFading(false)
    setShowPopover(false)

    try {
      const result = await testProvider(provider.id)
      setTestResult(result)
    } catch {
      setTestResult({ success: false, error: 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  useEffect(() => {
    if (testResult) {
      const fadeTimer = setTimeout(() => setFading(true), 3500)
      const removeTimer = setTimeout(() => {
        setTestResult(null)
        setFading(false)
      }, 4000)
      return () => {
        clearTimeout(fadeTimer)
        clearTimeout(removeTimer)
      }
    }
  }, [testResult])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreBtnRef.current && !moreBtnRef.current.contains(event.target)) {
        setShowPopover(false)
      }
    }
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPopover])

  const handleMoreClick = (e) => {
    e.stopPropagation()
    if (!showPopover && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect()
      setPopoverPos(getPopoverPosition(rect))
    }
    setShowPopover((current) => !current)
  }

  return (
    <div
      className={`${styles.card} ${showPopover ? styles.actionsOpen : ''}`}
      style={{ animationDelay: Math.min(index * 40, 400) + 'ms' }}
    >
      <div className={styles.cardHeader}>
        <div className={styles.cardIcon}>
          <ProviderIcon provider={provider.provider} size={28} />
        </div>
        <div className={styles.cardInfo}>
          <span className={styles.cardName}>{provider.name}</span>
          <div className={styles.cardMeta}>
            {provider.models.length > 0 && (
              <span className={styles.modelCountBadge}>
                {provider.models.length} {tp.models || 'models'}
              </span>
            )}
          </div>
        </div>
        {isFavorite !== undefined && (
          <button
            type="button"
            className={`${styles.cardFavoriteBtn} ${isFavorite ? styles.cardFavoriteActive : ''}`}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite?.() }}
            title={isFavorite ? (tp.unstar || 'Unfavorite') : (tp.star || 'Favorite')}
          >
            <IconStar active={isFavorite} className={isFavorite ? styles.cardFavoriteActive : styles.cardFavoriteInactive} />
          </button>
        )}
      </div>

      <p className={styles.cardDesc}>{provider.description}</p>

      <div className={styles.cardField}>
        <span className={styles.fieldLabel}>{tp.apiKeyLabel || 'API Key'}</span>
        {testing ? (
          <span className={`${styles.apiKeyStatus} ${styles.testingStatus}`}>
            <CircleNotch size={12} weight="bold" className={styles.spinIcon} />
            {tp.testing || 'Testing...'}
          </span>
        ) : testResult ? (
          <span className={`${styles.apiKeyStatus} ${testResult.success ? styles.testSuccess : styles.testFail} ${fading ? styles.testResultFadeOut : ''}`}>
            {testResult.success
              ? <><IconCheck size={12} />{tp.testSuccess || 'Connection successful'}</>
              : <><IconXCircle size={12} />{testResult.error || (tp.testFailed || 'Connection failed')}</>
            }
          </span>
        ) : provider.hasApiKey ? (
          <span className={`${styles.apiKeyStatus} ${styles.apiKeySet}`}>
            <IconCheck size={12} />
            {tp.apiKeySet || 'API Key set'}
          </span>
        ) : (
          <span className={`${styles.apiKeyStatus} ${styles.apiKeyNotSet}`}>
            <IconWarningCircle size={12} />
            {tp.apiKeyNotSet || 'API Key not set'}
          </span>
        )}
      </div>

      <div className={`${styles.actions} ${showPopover ? styles.actionsOpen : ''}`}>
        <button
          ref={moreBtnRef}
          className={styles.moreBtn}
          onClick={handleMoreClick}
          aria-label={`More options for ${provider.name}`}
        >
          <IconMore />
        </button>
      </div>

      {showPopover && createPortal(
        <>
          <div className={styles.popoverBackdrop} onClick={() => setShowPopover(false)} />
          <div
            className={styles.popover}
            data-side={popoverPos.side}
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className={styles.popoverItem}
              onClick={handleTest}
              disabled={testing}
            >
              <IconFlask />
              <span>{testing ? (tp.testing || 'Testing...') : (tp.testConnection || 'Test')}</span>
            </button>
            <button
              className={styles.popoverItem}
              onClick={(e) => { e.stopPropagation(); onEdit(provider); setShowPopover(false) }}
            >
              <IconPencil />
              <span>{tp.edit}</span>
            </button>
            <div className={styles.popoverDivider} />
            <button
              className={`${styles.popoverItem} ${styles.popoverDelete}`}
              onClick={(e) => { e.stopPropagation(); setShowPopover(false); onDelete(provider) }}
            >
              <IconTrashSmall />
              <span>{tp.delete}</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

function ProviderDialog({ provider, initialTemplate, onSave, onClose }) {
  const { t } = useTranslation()
  const tp = t('toolbox') || {}
  const isEdit = Boolean(provider?.id)
  const { templates } = { templates: QUICK_SETUP_PROVIDERS }
  const resolvedTemplate = initialTemplate
    ? { provider: initialTemplate.provider, name: initialTemplate.name, baseUrl: initialTemplate.baseUrl, models: initialTemplate.models || [] }
    : null

  const [providerType, setProviderType] = useState(provider?.provider || resolvedTemplate?.provider || '')
  const [name, setName] = useState(provider?.name || resolvedTemplate?.name || '')
  const [description, setDescription] = useState(provider?.description || '')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl || resolvedTemplate?.baseUrl || '')
  const [apiKey, setApiKey] = useState('')
  const apiKeyPlaceholder = isEdit && provider?.hasApiKey
    ? (tp.apiKeyAlreadySet || 'Already set — enter new key to replace')
    : 'sk-...'
  const normalizeModel = (m) => typeof m === 'string' ? m : (m?.id || String(m))
  const [selectedModels, setSelectedModels] = useState(
    (provider?.models || resolvedTemplate?.models || []).map(normalizeModel)
  )
  const [customModelInput, setCustomModelInput] = useState('')
  const [showKey, setShowKey] = useState(false)

  const availableModels = useMemo(
    () => QUICK_SETUP_PROVIDERS.find((t) => t.provider === providerType)?.models || [],
    [providerType]
  )
  const suggestedModels = useMemo(
    () => availableModels.filter((m) => !selectedModels.includes(m)),
    [availableModels, selectedModels]
  )

  const handleTemplateSelect = (template) => {
    setProviderType(template.provider)
    setName(template.name)
    setBaseUrl(template.baseUrl)
    setSelectedModels(template.models)
    setCustomModelInput('')
    if (!description) {
      setDescription(tp.autoDetected || 'Auto-filled from template')
    }
  }

  const handleAddModel = (model) => {
    setSelectedModels((prev) => prev.includes(model) ? prev : [...prev, model])
  }

  const handleRemoveModel = (model) => {
    setSelectedModels((prev) => prev.filter((m) => m !== model))
  }

  const handleAddCustomModel = () => {
    const trimmed = customModelInput.trim()
    if (trimmed && !selectedModels.includes(trimmed)) {
      setSelectedModels((prev) => [...prev, trimmed])
    }
    setCustomModelInput('')
  }

  const handleCustomModelKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddCustomModel()
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({
      ...(isEdit ? { id: provider.id } : {}),
      provider: providerType || 'custom',
      name,
      description,
      baseUrl,
      apiKey,
      models: selectedModels,
    })
    onClose()
  }

  return (
    <div className={styles.dialogOverlay} onClick={onClose}>
        <div className={`${styles.dialog} ${isEdit ? styles.dialogEdit : ''}`} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.dialogTitle}>
          {isEdit && provider?.name && (
            <span className={styles.dialogTitleIcon}>
              <ProviderIcon provider={provider.provider} size={24} />
            </span>
          )}
          {isEdit ? (tp.editProvider || 'Edit Provider') : (tp.addProvider || 'Add Provider')}
        </h2>
        
        <div className={styles.dialogBody}>
          {!isEdit && (
            <div className={styles.dialogLeft}>
              <span className={styles.templateLabel}>{tp.providerTemplates || 'Quick setup'}</span>
              <div className={styles.templateList}>
                {templates.map(template => (
                  <button
                    key={template.provider}
                    type="button"
                    className={`${styles.templateCard} ${providerType === template.provider ? styles.templateCardActive : ''}`}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <ProviderIcon provider={template.provider} size={20} />
                    <div className={styles.templateCardInfo}>
                      <span className={styles.templateName}>{template.name}</span>
                      <span className={styles.templateUrl}>{(template.baseUrl || '').replace(/^https?:\/\//, '')}</span>
                    </div>
                  </button>
                ))}
           </div>
       </div>
          )}

          <div className={styles.dialogRight}>
            {!isEdit && (
              <div className={styles.providerInfoTitle}>
                {providerType ? (
                  <>
                    <ProviderIcon provider={providerType} size={24} />
                    <span className={styles.providerInfoName}>
                      {templates.find(t => t.provider === providerType)?.name || providerType}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.providerInfoPlaceholderIcon} />
                    <span className={styles.providerInfoPlaceholder}>{tp.selectProvider || 'Select a provider from Quick setup'}</span>
                  </>
                )}
              </div>
            )}
            <form id="provider-form" className={styles.dialogForm} onSubmit={handleSubmit}>
              <label className={styles.dialogField}>
                <span className={styles.dialogLabel}>{tp.nameLabel}</span>
                <input
                  className={styles.dialogInput}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tp.namePlaceholder}
                  required
                />
              </label>

              <label className={styles.dialogField}>
                <span className={styles.dialogLabel}>{tp.descriptionLabel}</span>
                <input
                  className={styles.dialogInput}
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tp.descriptionPlaceholder}
                />
              </label>

              <label className={styles.dialogField}>
                <span className={styles.dialogLabel}>{tp.baseUrlLabel || 'Base URL'}</span>
                <input
                  className={styles.dialogInput}
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </label>

              <label className={styles.dialogField}>
                <span className={styles.dialogLabel}>
                  {tp.apiKeyLabel || 'API Key'}
                  {isEdit && provider?.hasApiKey && (
                    <span className={styles.apiKeySetBadge}>
                      <IconCheck size={10} />
                      {tp.apiKeySet || 'API Key set'}
                    </span>
                  )}
                </span>
                <div className={styles.apiKeyRow}>
                  <input
                    className={styles.dialogInput}
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={apiKeyPlaceholder}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Hide' : 'Show'}
                  >
                    {showKey ? <IconEyeSlash /> : <IconEye />}
                  </button>
                </div>
                {isEdit && provider?.hasApiKey && (
                  <div className={styles.apiKeyHint}>
                    {tp.apiKeyHint || 'Leave empty to keep current key'}
                  </div>
                )}
              </label>

              <div className={styles.dialogField}>
                <span className={styles.dialogLabel}>{tp.modelsLabel || 'Models'}</span>
                {selectedModels.length > 0 && (
                  <div className={styles.modelChips}>
                    {selectedModels.map((model) => (
                      <span key={model} className={styles.modelChip}>
                        {model}
                        <button
                          type="button"
                          className={styles.modelChipRemove}
                          onClick={() => handleRemoveModel(model)}
                          aria-label={`Remove ${model}`}
                        >
                          <IconXCircle size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {suggestedModels.length > 0 && (
                  <div className={styles.modelSuggestions}>
                    {suggestedModels.map((model) => (
                      <button
                        key={model}
                        type="button"
                        className={styles.modelSuggestionBtn}
                        onClick={() => handleAddModel(model)}
                      >
                        + {model}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.customModelRow}>
                  <input
                    className={styles.dialogInput}
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    onKeyDown={handleCustomModelKeyDown}
                    placeholder={tp.modelsPlaceholder}
                  />
                  {customModelInput.trim() && (
                    <button
                      type="button"
                      className={styles.addModelBtn}
                      onClick={handleAddCustomModel}
                    >
                      +
                    </button>
                  )}
                </div>
              </div>
            </form>

            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogCancel} onClick={onClose}>
                {tp.cancel}
              </button>
              <button type="submit" form="provider-form" className={styles.dialogSubmit}>
                {isEdit ? tp.save : tp.create}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DefaultLlmConfig({ providers }) {
  const { t } = useTranslation()
  const tp = t('toolbox') || {}

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const [runtimeProvider, setRuntimeProvider] = useState('')
  const [runtimeModel, setRuntimeModel] = useState('')
  const [memoryProvider, setMemoryProvider] = useState('')
  const [memoryModel, setMemoryModel] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getLlmConfig()
        if (!cancelled) {
          setRuntimeProvider(data.runtimeDefaultProvider || '')
          setRuntimeModel(data.runtimeDefaultModel || '')
          setMemoryProvider(data.sessionMemoryExtractionModel ? data.runtimeDefaultProvider : '')
          setMemoryModel(data.sessionMemoryExtractionModel || '')
        }
      } catch {
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const runtimeProviderData = useMemo(
    () => providers.find((p) => p.provider === runtimeProvider || p.id === runtimeProvider),
    [providers, runtimeProvider]
  )

  const memoryProviderData = useMemo(
    () => providers.find((p) => p.provider === memoryProvider || p.id === memoryProvider),
    [providers, memoryProvider]
  )

  const runtimeModels = useMemo(
    () => runtimeProviderData?.models?.map((m) => typeof m === 'string' ? m : m.id) || [],
    [runtimeProviderData]
  )

  const memoryModels = useMemo(
    () => memoryProviderData?.models?.map((m) => typeof m === 'string' ? m : m.id) || [],
    [memoryProviderData]
  )

  const handleSave = async () => {
    setSaving(true)
    setFeedback(null)
    try {
      await updateLlmConfig({
        runtimeDefaultProvider: runtimeProvider || null,
        runtimeDefaultModel: runtimeModel || null,
        memoryRecallModel: memoryModel || null,
        sessionMemoryExtractionModel: memoryModel || null,
      })
      setFeedback({ type: 'success', message: tp.llmSaveSuccess })
      setTimeout(() => setFeedback(null), 3000)
    } catch {
      setFeedback({ type: 'error', message: tp.llmSaveError })
    } finally {
      setSaving(false)
    }
  }

  const providerOptions = useMemo(
    () => providers.map((p) => ({ id: p.provider, name: p.name })),
    [providers]
  )

  if (loading) {
    return (
      <div className={styles.llmConfigSection}>
        <div className={styles.llmConfigHeader}>
          <h2 className={styles.llmConfigTitle}>
            <IconSettings />
            {tp.defaultLlmTitle || 'Default LLM Configuration'}
          </h2>
          <p className={styles.llmConfigDesc}>{tp.defaultLlmDesc || 'Loading...'}</p>
        </div>
        <div className={styles.llmConfigGrid}>
          <div className={styles.llmConfigCard}>
            <div className={`uiSkeleton ${styles.skeletonTitle}`} style={{ width: '40%' }} />
            <div className={`uiSkeleton ${styles.skeletonDesc}`} style={{ width: '60%' }} />
          </div>
          <div className={styles.llmConfigCard}>
            <div className={`uiSkeleton ${styles.skeletonTitle}`} style={{ width: '40%' }} />
            <div className={`uiSkeleton ${styles.skeletonDesc}`} style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.llmConfigSection}>
      <div className={styles.llmConfigHeader}>
        <h2 className={styles.llmConfigTitle}>
          <IconSettings />
          {tp.defaultLlmTitle || 'Default LLM Configuration'}
        </h2>
        <p className={styles.llmConfigDesc}>{tp.defaultLlmDesc || 'Set default models for chat conversations and memory operations'}</p>
      </div>

      <div className={styles.llmConfigGrid}>
        <div className={styles.llmConfigCard}>
          <div className={styles.llmConfigCardHeader}>
            <h3 className={styles.llmConfigCardTitle}>{tp.runtimeLlmTitle || 'Runtime LLM'}</h3>
            <p className={styles.llmConfigCardDesc}>{tp.runtimeLlmDesc || 'Default model for chat conversations'}</p>
          </div>
          <div className={styles.llmConfigFields}>
            <div className={styles.llmConfigField}>
              <label className={styles.llmConfigLabel}>{tp.llmProviderLabel || 'Provider'}</label>
              <select
                className={styles.llmConfigSelect}
                value={runtimeProvider}
                onChange={(e) => { setRuntimeProvider(e.target.value); setRuntimeModel('') }}
              >
                <option value="">{tp.llmSelectProvider || 'Select provider'}</option>
                {providerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.llmConfigField}>
              <label className={styles.llmConfigLabel}>{tp.llmModelLabel || 'Model'}</label>
              <select
                className={styles.llmConfigSelect}
                value={runtimeModel}
                onChange={(e) => setRuntimeModel(e.target.value)}
                disabled={!runtimeProvider}
              >
                <option value="">{tp.llmSelectModel || 'Select model'}</option>
                {runtimeModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className={styles.llmConfigCard}>
          <div className={styles.llmConfigCardHeader}>
            <h3 className={styles.llmConfigCardTitle}>{tp.memoryLlmTitle || 'Memory LLM'}</h3>
            <p className={styles.llmConfigCardDesc}>{tp.memoryLlmDesc || 'Model for memory recall and extraction'}</p>
          </div>
          <div className={styles.llmConfigFields}>
            <div className={styles.llmConfigField}>
              <label className={styles.llmConfigLabel}>{tp.llmProviderLabel || 'Provider'}</label>
              <select
                className={styles.llmConfigSelect}
                value={memoryProvider}
                onChange={(e) => { setMemoryProvider(e.target.value); setMemoryModel('') }}
              >
                <option value="">{tp.llmSelectProvider || 'Select provider'}</option>
                {providerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.llmConfigField}>
              <label className={styles.llmConfigLabel}>{tp.llmModelLabel || 'Model'}</label>
              <select
                className={styles.llmConfigSelect}
                value={memoryModel}
                onChange={(e) => setMemoryModel(e.target.value)}
                disabled={!memoryProvider}
              >
                <option value="">{tp.llmSelectModel || 'Select model'}</option>
                {memoryModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.llmConfigActions}>
        <button
          className={styles.llmSaveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <>
              <CircleNotch size={14} weight="bold" className={styles.spinIcon} />
              {tp.llmSaving || 'Saving...'}
            </>
          ) : (
            tp.llmSave || 'Save Configuration'
          )}
        </button>
        {feedback && (
          <span className={`${styles.llmConfigFeedback} ${feedback.type === 'success' ? styles.llmConfigFeedbackSuccess : styles.llmConfigFeedbackError}`}>
            {feedback.type === 'success' ? <IconCheck size={12} /> : <IconXCircle size={12} />}
            {feedback.message}
          </span>
        )}
      </div>
    </div>
  )
}

export default function ConnectProviderPage() {
  const { t } = useTranslation()
  const tp = t('toolbox') || {}
  const { providers, loading, createProvider, updateProvider, deleteProvider } = useProvidersModel()
  const { favorites, addFavorite, removeFavorite } = useFavoriteModelsModel()

  const [activeTab, setActiveTab] = useState('providers')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

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

  const favoriteProviderIds = useMemo(
    () => new Set(favorites.map((f) => f.providerId)),
    [favorites]
  )

  const handleToggleFavorite = useCallback((provider) => {
    if (favoriteProviderIds.has(provider.id)) {
      favorites
        .filter((f) => f.providerId === provider.id)
        .forEach((f) => removeFavorite({ providerId: f.providerId, modelId: f.modelId }))
    } else if (provider.models?.length) {
      const firstModel = provider.models[0]
      addFavorite({ providerId: provider.id, modelId: firstModel.id || firstModel })
    }
  }, [favoriteProviderIds, favorites, addFavorite, removeFavorite])

  const filteredProviders = useMemo(() => {
    const filtered = providers.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        (p.baseUrl && p.baseUrl.toLowerCase().includes(search.toLowerCase()))
      
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'hasKey' ? p.hasApiKey : !p.hasApiKey)
      
      return matchesSearch && matchesStatus
    })

    // Sort: favorites first → recent (updatedAt desc) → created (createdAt desc)
    return filtered.sort((a, b) => {
      const aFav = favoriteProviderIds.has(a.id) ? 1 : 0
      const bFav = favoriteProviderIds.has(b.id) ? 1 : 0
      if (aFav !== bFav) return bFav - aFav

      const aUpdated = a.updatedAt || a.createdAt || 0
      const bUpdated = b.updatedAt || b.createdAt || 0
      if (aUpdated !== bUpdated) return bUpdated - aUpdated

      const aCreated = a.createdAt || 0
      const bCreated = b.createdAt || 0
      return bCreated - aCreated
    })
  }, [providers, favorites, favoriteProviderIds, search, statusFilter])

  const hasKeyCount = providers.filter((p) => p.hasApiKey).length

  const [editProvider, setEditProvider] = useState(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [quickAddTemplate, setQuickAddTemplate] = useState(null)

  const handleAdd = useCallback(async (input) => {
    await createProvider(input)
    setQuickAddTemplate(null)
  }, [createProvider])

  const handleEdit = useCallback(async (input) => {
    if (input.id) {
      const { id, ...updates } = input
      if (input.apiKey) {
        await updateProvider(id, updates)
      } else {
        // eslint-disable-next-line no-unused-vars
        const { apiKey, ...restUpdates } = updates
        await updateProvider(id, restUpdates)
      }
    }
  }, [updateProvider])

  const [deleteConfirmProvider, setDeleteConfirmProvider] = useState(null)

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirmProvider) return
    await deleteProvider(deleteConfirmProvider.id)
    setDeleteConfirmProvider(null)
  }, [deleteConfirmProvider, deleteProvider])

  const renderSkeleton = () => (
    <div className={styles.grid}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={`uiSkeleton ${styles.skeletonIcon}`} />
          <div className={styles.skeletonContent}>
            <div className={`uiSkeleton ${styles.skeletonTitle}`} />
            <div className={`uiSkeleton ${styles.skeletonDesc}`} />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className={styles.content}>
      <div className={styles.sectionHeader}>
        <h1 className={styles.sectionTitle}>{tp.providersTitle || tp.providers || 'Connect LLM Provider'}</h1>
        <p className={styles.sectionDesc}>{tp.providersDesc || 'Add and configure LLM providers to enable AI model access'}</p>
      </div>

      <div className={styles.tabBar}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'providers' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('providers')}
        >
          {tp.tabProviders || 'Providers'}
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'defaultLlm' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('defaultLlm')}
        >
          {tp.tabDefaultLlm || 'Default LLM'}
        </button>
      </div>

      {activeTab === 'defaultLlm' ? (
        <DefaultLlmConfig providers={providers} />
      ) : (
        <>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <IconMagnifyingGlass className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder={tp.searchProviders || 'Search providers...'}
            value={searchDraft}
            onChange={handleSearchChange}
            onCompositionStart={handleSearchCompositionStart}
            onCompositionEnd={handleSearchCompositionEnd}
          />
          <div className={styles.filterChips}>
            <button
              className={`${styles.filterChip} ${statusFilter === 'all' ? styles.filterChipActive : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              {tp.statusAll || 'All'}
            </button>
            <button
              className={`${styles.filterChip} ${statusFilter === 'hasKey' ? styles.filterChipActive : ''}`}
              onClick={() => setStatusFilter('hasKey')}
            >
              {tp.apiKeySet || 'API Key set'}
            </button>
            <button
              className={`${styles.filterChip} ${statusFilter === 'noKey' ? styles.filterChipActive : ''}`}
              onClick={() => setStatusFilter('noKey')}
            >
              {tp.apiKeyNotSet || 'API Key not set'}
            </button>
          </div>
        </div>
        <div className={styles.toolbarMeta}>
          {hasKeyCount > 0 && (
            <span className={styles.connectedCount}>
              {hasKeyCount} {tp.apiKeySet || 'API Key set'}
            </span>
          )}
          <button className={styles.addBtn} onClick={() => setShowAddDialog(true)}>
            <IconPlusSmall />
            {tp.addProvider || 'Add Provider'}
          </button>
        </div>
      </div>

      <div className={styles.infoBanner}>
        <IconInfoPhosphor />
        <span>{tp.providerBanner || 'Your API keys are stored locally and never sent to our servers.'}</span>
      </div>

      {loading ? renderSkeleton() : (
        providers.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <IconPlug />
            </div>
            <p className={styles.emptyText}>{tp.noProviders || 'No providers configured'}</p>
            <p className={styles.emptyDesc}>{tp.noProvidersDesc || 'Add an LLM provider to get started.'}</p>
            <div className={styles.templateGrid}>
              {QUICK_SETUP_PROVIDERS.map((t) => (
                <button
                  key={t.provider}
                  className={styles.templateShortcut}
                  onClick={() => {
                    setQuickAddTemplate(t)
                    setShowAddDialog(true)
                  }}
                >
                  <ProviderIcon provider={t.provider} size={18} />
                  <span className={styles.templateShortcutName}>{t.name}</span>
                  <span className={styles.templateShortcutUrl}>{(t.baseUrl || '').replace(/^https?:\/\//, '')}</span>
                </button>
              ))}
            </div>
            <button className={styles.addBtn} onClick={() => setShowAddDialog(true)}>
              <IconPlusSmall />
              {tp.addProvider || 'Add Provider'}
            </button>
          </div>
        ) : filteredProviders.length === 0 ? (
          <div className={styles.emptyState}>
            <IconMagnifyingGlass className={styles.emptyIcon} />
            <p className={styles.emptyText}>{tp.noResults || 'No results'}</p>
            <p className={styles.emptyDesc}>{tp.noResultsDesc || 'Try a different search term.'}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredProviders.map((provider, index) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                index={index}
                isFavorite={favoriteProviderIds.has(provider.id)}
                onToggleFavorite={() => handleToggleFavorite(provider)}
                onEdit={(p) => setEditProvider(p)}
                onDelete={(p) => setDeleteConfirmProvider(p)}
              />
            ))}
          </div>
        )
      )}
        </>
      )}

      {showAddDialog && (
        <ProviderDialog
          initialTemplate={quickAddTemplate}
          onSave={handleAdd}
          onClose={() => { setShowAddDialog(false); setQuickAddTemplate(null) }}
        />
      )}

      {editProvider && (
        <ProviderDialog
          key={editProvider.id}
          provider={editProvider}
          onSave={handleEdit}
          onClose={() => setEditProvider(null)}
        />
      )}

      {deleteConfirmProvider && createPortal(
        <div className={styles.dialogOverlay} onClick={() => setDeleteConfirmProvider(null)}>
          <div className={styles.confirmDialogCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmDialogHeader}>
              <IconWarningCircle size={22} className={styles.confirmDialogHeaderIcon} />
              <h2 className={styles.confirmDialogTitle}>{tp.confirmDeleteTitle || 'Delete Provider'}</h2>
            </div>
            <div className={styles.confirmDialogBody}>
              {tp.confirmDeleteMsg
                ? tp.confirmDeleteMsg.replace('{name}', deleteConfirmProvider.name)
                : <>Are you sure you want to delete <span className={styles.confirmDialogProviderName}>{deleteConfirmProvider.name}</span>? This action cannot be undone.</>
              }
            </div>
            <div className={styles.confirmDialogActions}>
              <button className={styles.confirmDialogCancel} onClick={() => setDeleteConfirmProvider(null)}>
                {tp.cancel || 'Cancel'}
              </button>
              <button className={styles.confirmDialogDelete} onClick={handleDeleteConfirm}>
                {tp.delete || 'Delete'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
