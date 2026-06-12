import { useEffect, useRef, useState } from 'react'
import styles from './TaskDialog.module.css'

const TASK_TYPES = [
  { value: 'cron', labelKey: 'tasks.typeCron' },
  { value: 'once', labelKey: 'tasks.typeOnce' },
  { value: 'interval', labelKey: 'tasks.typeInterval' },
]

const PRESET_CRONS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at midnight', value: '0 0 * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
  { label: 'First of month', value: '0 0 1 * *' },
]

const PRESET_INTERVALS = [
  { label: '5 minutes', value: 300000 },
  { label: '15 minutes', value: 900000 },
  { label: '30 minutes', value: 1800000 },
  { label: '1 hour', value: 3600000 },
  { label: '6 hours', value: 21600000 },
]

const TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
]

export default function TaskDialog({
  title,
  task,
  onConfirm,
  onCancel,
  cancelText = 'Cancel',
  confirmText = 'Save',
  pendingText = 'Saving...',
  isSubmitting = false,
  t,
}) {
  const [nextName, setNextName] = useState(task?.name || '')
  const [nextDescription, setNextDescription] = useState(task?.description || '')
  const [nextType, setNextType] = useState(task?.type || 'cron')
  const [nextCronExpression, setNextCronExpression] = useState(task?.cronExpression || '0 * * * *')
  const [nextTimezone, setNextTimezone] = useState(task?.timezone || 'UTC')
  const [nextIntervalMs, setNextIntervalMs] = useState(task?.intervalMs || 3600000)
  const [nextScheduledAt, setNextScheduledAt] = useState(
    task?.scheduledAt ? new Date(task.scheduledAt).toISOString().slice(0, 16) : ''
  )
  const [nextCommand, setNextCommand] = useState(task?.config?.command || '')
  const [nextArgs, setNextArgs] = useState(task?.config?.args?.join('\n') || '')
  const nameInputRef = useRef(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!nextName.trim()) return

    const args = nextArgs
      .split('\n')
      .map((arg) => arg.trim())
      .filter(Boolean)

    onConfirm({
      name: nextName.trim(),
      description: nextDescription.trim(),
      type: nextType,
      cronExpression: nextType === 'cron' ? nextCronExpression : undefined,
      timezone: nextType === 'cron' ? nextTimezone : undefined,
      intervalMs: nextType === 'interval' ? nextIntervalMs : undefined,
      scheduledAt: nextType === 'once' ? (nextScheduledAt ? new Date(nextScheduledAt).getTime() : null) : undefined,
      config: {
        command: nextCommand.trim(),
        args,
      },
    })
  }

  const handleTypeChange = (type) => {
    setNextType(type)
    if (type === 'cron' && !nextCronExpression) {
      setNextCronExpression('0 * * * *')
    }
    if (type === 'interval' && !nextIntervalMs) {
      setNextIntervalMs(3600000)
    }
  }

  const handleCronPreset = (preset) => {
    setNextCronExpression(preset)
  }

  const handleIntervalPreset = (preset) => {
    setNextIntervalMs(preset)
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
              <label className={styles.label} htmlFor="task-name">{t('tasks.nameLabel')}</label>
              <input
                id="task-name"
                ref={nameInputRef}
                type="text"
                className={styles.input}
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                placeholder={t('tasks.namePlaceholder')}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="task-description">{t('tasks.descriptionLabel')}</label>
              <textarea
                id="task-description"
                className={styles.textarea}
                value={nextDescription}
                onChange={(event) => setNextDescription(event.target.value)}
                placeholder={t('tasks.descriptionPlaceholder')}
                rows={2}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label}>{t('tasks.taskType')}</label>
              <div className={styles.typeTabs}>
                {TASK_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    className={`${styles.typeTab} ${nextType === type.value ? styles.typeTabActive : ''}`}
                    onClick={() => handleTypeChange(type.value)}
                    disabled={isSubmitting}
                  >
                    {t(type.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            {nextType === 'cron' && (
              <>
                <div className={styles.fieldset}>
                  <label className={styles.label} htmlFor="task-cron">{t('tasks.cronExpression')}</label>
                  <input
                    id="task-cron"
                    type="text"
                    className={styles.input}
                    value={nextCronExpression}
                    onChange={(event) => setNextCronExpression(event.target.value)}
                    placeholder="0 * * * *"
                    disabled={isSubmitting}
                  />
                  <div className={styles.presets}>
                    {PRESET_CRONS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={styles.presetBtn}
                        onClick={() => handleCronPreset(preset.value)}
                        disabled={isSubmitting}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.fieldset}>
                  <label className={styles.label} htmlFor="task-timezone">{t('tasks.timezone')}</label>
                  <select
                    id="task-timezone"
                    className={styles.select}
                    value={nextTimezone}
                    onChange={(event) => setNextTimezone(event.target.value)}
                    disabled={isSubmitting}
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {nextType === 'interval' && (
              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="task-interval">{t('tasks.intervalMs')}</label>
                <input
                  id="task-interval"
                  type="number"
                  className={styles.input}
                  value={nextIntervalMs / 1000}
                  onChange={(event) => setNextIntervalMs(parseInt(event.target.value, 10) * 1000)}
                  min={1000}
                  step={1000}
                  disabled={isSubmitting}
                />
                <div className={styles.presets}>
                  {PRESET_INTERVALS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={styles.presetBtn}
                      onClick={() => handleIntervalPreset(preset.value)}
                      disabled={isSubmitting}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {nextType === 'once' && (
              <div className={styles.fieldset}>
                <label className={styles.label} htmlFor="task-scheduled">{t('tasks.scheduledAt')}</label>
                <input
                  id="task-scheduled"
                  type="datetime-local"
                  className={styles.input}
                  value={nextScheduledAt}
                  onChange={(event) => setNextScheduledAt(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className={styles.sectionDivider}>
              <span>{t('tasks.executionConfig')}</span>
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="task-command">{t('tasks.command')}</label>
              <input
                id="task-command"
                type="text"
                className={styles.input}
                value={nextCommand}
                onChange={(event) => setNextCommand(event.target.value)}
                placeholder="python /scripts/backup.py"
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="task-args">{t('tasks.args')}</label>
              <textarea
                id="task-args"
                className={styles.textarea}
                value={nextArgs}
                onChange={(event) => setNextArgs(event.target.value)}
                placeholder={t('tasks.argsPlaceholder')}
                rows={3}
                disabled={isSubmitting}
              />
              <span className={styles.hint}>{t('tasks.argsHint')}</span>
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
