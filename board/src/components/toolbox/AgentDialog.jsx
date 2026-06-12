import { useEffect, useMemo, useRef, useState } from 'react'
import { useProvidersModel } from '@/features/toolbox/toolbox.hooks'
import styles from './AgentDialog.module.css'

export default function AgentDialog({
  title,
  agent,
  onConfirm,
  onCancel,
  cancelText = 'Cancel',
  confirmText = 'Save',
  pendingText = 'Saving...',
  isSubmitting = false,
  t,
}) {
  const { providers } = useProvidersModel()
  const [nextName, setNextName] = useState(agent?.name || '')
  const [nextDescription, setNextDescription] = useState(agent?.description || '')
  const [nextProviderId, setNextProviderId] = useState(agent?.providerId || '')
  const [nextModelId, setNextModelId] = useState(agent?.modelId || agent?.model || '')
  const [nextMaxTokens, setNextMaxTokens] = useState(agent?.config?.maxTokens?.toString() || '4096')
  const [nextTemperature, setNextTemperature] = useState(agent?.config?.temperature?.toString() || '0.7')
  const nameInputRef = useRef(null)

  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === nextProviderId) ?? null,
    [providers, nextProviderId]
  )

  const availableModels = selectedProvider?.models ?? []

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!nextName.trim()) return

    onConfirm({
      name: nextName.trim(),
      description: nextDescription.trim(),
      providerId: nextProviderId,
      modelId: nextModelId,
      model: nextModelId,
      config: {
        maxTokens: parseInt(nextMaxTokens, 10) || 4096,
        temperature: parseFloat(nextTemperature) || 0.7,
      },
    })
  }

  return (
    <div className={styles.overlay} onClick={isSubmitting ? undefined : onCancel}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="agent-name">{t('toolbox.nameLabel')}</label>
              <input
                id="agent-name"
                ref={nameInputRef}
                type="text"
                className={styles.input}
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                placeholder={t('toolbox.namePlaceholder')}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="agent-description">{t('toolbox.descriptionLabel')}</label>
              <textarea
                id="agent-description"
                className={styles.textarea}
                value={nextDescription}
                onChange={(event) => setNextDescription(event.target.value)}
                placeholder={t('toolbox.descriptionPlaceholder')}
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="agent-provider">{t('toolbox.providerLabel')}</label>
              <select
                id="agent-provider"
                className={styles.select}
                value={nextProviderId}
                onChange={(event) => {
                  setNextProviderId(event.target.value)
                  setNextModelId('')
                }}
                disabled={isSubmitting}
              >
                <option value="">{t('toolbox.providerPlaceholder')}</option>
                {providers
                  .filter((p) => p.enabled)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="agent-model">{t('toolbox.modelLabel')}</label>
              <select
                id="agent-model"
                className={styles.select}
                value={nextModelId}
                onChange={(event) => setNextModelId(event.target.value)}
                disabled={isSubmitting || !nextProviderId || availableModels.length === 0}
              >
                <option value="">{t('toolbox.modelPlaceholder')}</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className={styles.row}>
              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="agent-max-tokens">{t('toolbox.maxTokensLabel')}</label>
                <input
                  id="agent-max-tokens"
                  type="number"
                  className={styles.input}
                  value={nextMaxTokens}
                  onChange={(event) => setNextMaxTokens(event.target.value)}
                  min={1024}
                  max={8192}
                  step={1024}
                  disabled={isSubmitting}
                />
              </div>

              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="agent-temperature">{t('toolbox.temperatureLabel')}</label>
                <input
                  id="agent-temperature"
                  type="number"
                  className={styles.input}
                  value={nextTemperature}
                  onChange={(event) => setNextTemperature(event.target.value)}
                  min={0}
                  max={2}
                  step={0.1}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <div className={styles.footer}>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
                {cancelText}
              </button>
              <button type="submit" className={styles.confirmBtn} disabled={!nextName.trim() || isSubmitting}>
                {isSubmitting ? pendingText : confirmText}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}