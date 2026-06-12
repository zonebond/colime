import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { generateSkillContent } from '@/features/toolbox/toolbox.service'
import styles from './SkillCreateDialog.module.css'

function highlightMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^(#{1,6})\s+(.+)$/gm,
      (_, hashes, content) =>
        `<span class="md-heading">${hashes}</span> <span class="md-heading md-heading-text">${content}</span>`)
    .replace(/(\*\*|__)(.+?)\1/g, '<span class="md-bold">$2</span>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<span class="md-italic">$1</span>')
    .replace(/`([^`\n]+)`/g, '<span class="md-code">`$1`</span>')
    .replace(/^(-{3,})$/gm, '<span class="md-frontmatter">$1</span>')
    .replace(/^([\w-]+):\s*(.*)$/gm,
      '<span class="md-key">$1</span>: <span class="md-value">$2</span>')
    .replace(/^(>\s?)(.*)$/gm, '<span class="md-blockquote">$1$2</span>')
    .replace(/^(\s*[-*+]\s)(.*)$/gm, '<span class="md-list">$1$2</span>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">[$1]($2)</span>')
    .replace(/\n/g, '\n')
}

const SKILL_TEMPLATE = [
  '---',
  'name: my-skill',
  'description: A short description of what this skill does and when to use it.',
  '---',
  '',
  '## Purpose',
  '',
  'Briefly describe the purpose of this skill and what it helps accomplish.',
  '',
  '## When to Use',
  '',
  'Describe the scenarios or triggers where this skill is appropriate.',
  '',
  '## Instructions',
  '',
  'Provide step-by-step instructions or guidelines for executing this skill.',
  '',
  '## Examples',
  '',
  'Provide concrete examples of how to use this skill effectively.',
].join('\n')

export default function SkillCreateDialog({
  title,
  skill,
  onConfirm,
  onCancel,
  cancelText = 'Cancel',
  confirmText = 'Save',
  pendingText = 'Saving...',
  isSubmitting = false,
  t,
}) {
  const isEdit = Boolean(skill)
  const [nextName, setNextName] = useState(skill?.name || '')
  const [nextDescription, setNextDescription] = useState(skill?.description || '')
  const [nextContent, setNextContent] = useState(skill ? (skill.content ?? '') : SKILL_TEMPLATE)
  const [contentViewMode, setContentViewMode] = useState('edit')
  const [generateDescription, setGenerateDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(null)
  const nameInputRef = useRef(null)
  const textareaRef = useRef(null)
  const lineNumbersRef = useRef(null)

  const lineCount = useMemo(() => {
    const count = nextContent.split('\n').length
    return Math.max(count, 1)
  }, [nextContent])

  const lineNumberText = useMemo(() => {
    return Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')
  }, [lineCount])

  const highlightedHtml = useMemo(() => {
    return highlightMarkdown(nextContent)
  }, [nextContent])

  const highlightRef = useRef(null)

  const handleEditorScroll = useCallback(() => {
    const top = textareaRef.current?.scrollTop ?? 0
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = top
    if (highlightRef.current) highlightRef.current.scrollTop = top
  }, [])

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!nextName.trim() || !nextContent.trim()) return

    onConfirm({
      name: nextName.trim(),
      description: nextDescription.trim(),
      content: nextContent,
    })
  }

  const handleGenerate = async () => {
    const desc = generateDescription.trim()
    if (!desc || isGenerating) return

    setIsGenerating(true)
    setGenerateError(null)

    try {
      const generatedText = await generateSkillContent(desc)
      if (generatedText) {
        setNextContent(generatedText)
        setContentViewMode('edit')
      }
    } catch (err) {
      setGenerateError(err?.message || 'Failed to generate content')
    } finally {
      setIsGenerating(false)
    }
  }

  const tp = t?.('toolbox') || {}

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !isSubmitting) onCancel() }}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="skill-name">{tp.skillNameLabel || 'Name'}</label>
              <input
                id="skill-name"
                ref={nameInputRef}
                type="text"
                className={styles.input}
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                placeholder={tp.skillNamePlaceholder || 'my-skill'}
                disabled={isSubmitting || isEdit}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="skill-description">{tp.skillDescLabel || 'Description'}</label>
              <input
                id="skill-description"
                type="text"
                className={styles.input}
                value={nextDescription}
                onChange={(event) => setNextDescription(event.target.value)}
                placeholder={tp.skillDescPlaceholder || 'What does this skill do and when to use it'}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.contentFieldset}>
              <div className={styles.contentToolbar}>
                <label className={styles.label} htmlFor="skill-content">{tp.skillContentLabel || 'Content'}</label>
                <div className={styles.tabGroup}>
                  <button
                    type="button"
                    className={`${styles.tabBtn} ${contentViewMode === 'edit' ? styles.tabBtnActive : ''}`}
                    onClick={() => setContentViewMode('edit')}
                    disabled={isSubmitting}
                  >
                    {tp.skillEditTab || 'Edit'}
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabBtn} ${contentViewMode === 'preview' ? styles.tabBtnActive : ''}`}
                    onClick={() => setContentViewMode('preview')}
                    disabled={isSubmitting}
                  >
                    {tp.skillPreviewTab || 'Preview'}
                  </button>
                </div>
              </div>

              {!isEdit && (
                <div className={styles.aiGenerateSection}>
                  <label className={styles.label}>{tp.skillAiGenerateLabel || 'AI Generate'}</label>
                  <div className={styles.aiGenerateRow}>
                    <input
                      type="text"
                      className={styles.aiGenerateInput}
                      value={generateDescription}
                      onChange={(e) => setGenerateDescription(e.target.value)}
                      placeholder={tp.skillAiGeneratePlaceholder || 'Describe what this skill should do...'}
                      disabled={isGenerating || isSubmitting}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleGenerate()
                      }}
                    />
                    <button
                      type="button"
                      className={styles.aiGenerateBtn}
                      onClick={handleGenerate}
                      disabled={!generateDescription.trim() || isGenerating || isSubmitting}
                    >
                      {isGenerating
                        ? (tp.skillAiGenerating || 'Generating...')
                        : (tp.skillAiGenerateBtn || 'Generate')}
                    </button>
                  </div>
                  {isGenerating && (
                    <div className={styles.aiGenerateLoading}>
                      <span className={styles.spinner} />
                      <span>{tp.skillAiGenerating || 'Generating...'}</span>
                    </div>
                  )}
                  {generateError && (
                    <p className={styles.aiGenerateError}>{generateError}</p>
                  )}
                </div>
              )}

              {contentViewMode === 'edit' && (
                <div className={styles.editorWrapper}>
                  <pre
                    ref={lineNumbersRef}
                    className={styles.lineNumbers}
                    aria-hidden="true"
                  >
                    {lineNumberText}
                  </pre>
                  <div className={styles.editorContent}>
                    <pre
                      ref={highlightRef}
                      className={styles.highlightLayer}
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                    <textarea
                      id="skill-content"
                      ref={textareaRef}
                      className={styles.contentTextarea}
                      value={nextContent}
                      onChange={(event) => setNextContent(event.target.value)}
                      onScroll={handleEditorScroll}
                      placeholder={tp.skillContentPlaceholder || 'Write the SKILL.md content here...'}
                      rows={12}
                      disabled={isSubmitting}
                      spellCheck={false}
                    />
                  </div>
                </div>
              )}

              {contentViewMode === 'preview' && (
                <div className={styles.previewContainer}>
                  {nextContent.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {nextContent}
                    </ReactMarkdown>
                  ) : (
                    <p className={styles.previewEmpty}>
                      {tp.skillContentPlaceholder || 'Write the SKILL.md content here...'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.footer}>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
                {cancelText}
              </button>
              <button type="submit" className={styles.confirmBtn} disabled={!nextName.trim() || !nextContent.trim() || isSubmitting}>
                {isSubmitting ? pendingText : confirmText}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
