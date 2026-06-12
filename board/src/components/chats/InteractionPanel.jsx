import { memo, useState, useCallback, useReducer, useEffect, useRef } from 'react'
import { X, PencilSimple, Check, ArrowRight, LockKey } from '@phosphor-icons/react'
import { relativizePaths, relativizePath } from '@/lib/path'
import styles from './InteractionPanel.module.css'

const EMPTY_QUESTIONS = []

function initState(questions) {
  return {
    tab: 0,
    answers: questions.map(() => []),
    custom: questions.map(() => ''),
    selected: 0,
    editing: false,
    submitting: false,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'RESET': {
      const qs = action.questions
      return {
        tab: 0,
        answers: qs.map(() => []),
        custom: qs.map(() => ''),
        selected: 0,
        editing: false,
        submitting: false,
      }
    }
    case 'SET_TAB':
      return { ...state, tab: action.tab, selected: 0, editing: false }
    case 'SET_SELECTED':
      return { ...state, selected: action.selected }
    case 'SET_EDITING':
      return { ...state, editing: action.editing }
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.submitting }
    case 'SET_CUSTOM': {
      const custom = [...state.custom]
      custom[action.tab] = action.value
      return { ...state, custom }
    }
    case 'TOGGLE_ANSWER': {
      const answers = [...state.answers]
      const list = [...(answers[action.tab] || [])]
      const idx = list.indexOf(action.value)
      if (idx === -1) list.push(action.value)
      else list.splice(idx, 1)
      answers[action.tab] = list
      return { ...state, answers }
    }
    case 'SET_ANSWER': {
      const answers = [...state.answers]
      answers[action.tab] = [action.value]
      return { ...state, answers, editing: false }
    }
    case 'SAVE_CUSTOM': {
      const questions = action.questions
      const info = questions[state.tab]
      const value = (state.custom[state.tab] || '').trim()
      if (!value) return { ...state, editing: false }
      if (info?.multiple) {
        const answers = [...state.answers]
        const list = [...(answers[state.tab] || [])]
        const prev = state.custom[state.tab]
        if (prev) {
          const pi = list.indexOf(prev)
          if (pi !== -1) list.splice(pi, 1)
        }
        if (!list.includes(value)) list.push(value)
        answers[state.tab] = list
        return { ...state, answers, editing: false }
      }
      const answers = [...state.answers]
      answers[state.tab] = [value]
      return { ...state, answers, editing: false }
    }
    default:
      return state
  }
}

function isSingleQuestion(questions) {
  return questions.length === 1 && questions[0]?.multiple !== true
}

const InteractionPanel = memo(function InteractionPanel({ interaction, onRespond, onClose }) {
  const [isClosing, setIsClosing] = useState(false)

  if (!interaction) return null

  if (interaction.type === 'tool_confirm') {
    return <ToolConfirmPanel interaction={interaction} onRespond={onRespond} onClose={onClose} isClosing={isClosing} setIsClosing={setIsClosing} />
  }

  if (interaction.type === 'question') {
    return <QuestionPanel interaction={interaction} onRespond={onRespond} onClose={onClose} isClosing={isClosing} setIsClosing={setIsClosing} />
  }

  if (interaction.type === 'permission') {
    return <PermissionPanel interaction={interaction} onRespond={onRespond} onClose={onClose} isClosing={isClosing} setIsClosing={setIsClosing} />
  }

  return null
})

function ToolConfirmPanel({ interaction, onRespond, onClose, isClosing, setIsClosing }) {
  const { toolName, toolInput, isDestructive, directory } = interaction.data

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => onClose?.(), 200)
  }, [onClose, setIsClosing])

  const handleRespond = useCallback((response) => {
    setIsClosing(true)
    setTimeout(() => onRespond?.(response), 200)
  }, [onRespond, setIsClosing])

  const getToolInputDisplay = () => {
    if (!toolInput) return null
    try {
      const parsed = JSON.parse(typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput))
      const rel = directory ? relativizePaths(parsed, directory) : parsed
      if (typeof rel === 'object' && rel.command) return rel.command
      return JSON.stringify(rel, null, 2)
    } catch {
      return typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput)
    }
  }

  return (
    <div className={`${styles.panel} ${isClosing ? styles.panelClosing : ''}`}>
      <div className={styles.toolContainer}>
        <div className={styles.toolHeader}>
          <div className={styles.toolHeaderLeft}>
            <div className={styles.toolIconWrap}>
              <span className={styles.toolIconEmoji}>⚡</span>
            </div>
            <div className={styles.toolHeaderText}>
              <div className={styles.toolTitle}>{toolName || 'Tool'}</div>
              <div className={styles.toolSubtitle}>needs your permission to run</div>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={16} weight="bold" />
          </button>
        </div>
        {toolInput && (
          <div className={styles.toolContent}>
            <pre className={styles.toolInputCode}>{getToolInputDisplay()}</pre>
          </div>
        )}
        {isDestructive && (
          <div className={styles.toolWarning}>
            <span>⚠</span>
            <span>This tool modifies files</span>
          </div>
        )}
        <div className={styles.toolActions}>
          <button type="button" className={styles.toolDenyBtn} onClick={() => handleRespond({ action: 'deny' })}>
            Reject
          </button>
          <button type="button" className={styles.toolAllowAlwaysBtn} onClick={() => handleRespond({ action: 'always' })}>
            Allow Always
          </button>
          <button type="button" className={styles.toolAllowOnceBtn} onClick={() => handleRespond({ action: 'allow' })}>
            Allow Once
          </button>
        </div>
      </div>
    </div>
  )
}

const PERMISSION_LABELS = {
  bash: 'Bash command',
  external_directory: 'Access external directory',
  read: 'Read file',
  edit: 'Edit file',
  write: 'Write file',
  glob: 'Search files',
  grep: 'Search code',
  webfetch: 'Fetch URL',
  websearch: 'Web search',
  lsp: 'Language server',
  repo_clone: 'Clone repository',
  repo_overview: 'Repository overview',
  todowrite: 'Update todos',
  task: 'Run subtask',
}

function PermissionPanel({ interaction, onRespond, onClose, isClosing, setIsClosing }) {
  const { permission, patterns, directory } = interaction.data
  const label = PERMISSION_LABELS[permission] || permission || 'Unknown'

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => onClose?.(), 200)
  }, [onClose, setIsClosing])

  const handleRespond = useCallback((action) => {
    setIsClosing(true)
    setTimeout(() => onRespond?.({ action }), 200)
  }, [onRespond, setIsClosing])

  return (
    <div className={`${styles.panel} ${isClosing ? styles.panelClosing : ''}`}>
      <div className={styles.toolContainer}>
        <div className={styles.toolHeader}>
          <div className={styles.toolHeaderLeft}>
            <div className={styles.toolIconWrap}>
              <LockKey size={18} weight="fill" className={styles.permissionIcon} />
            </div>
            <div className={styles.toolHeaderText}>
              <div className={styles.toolTitle}>{label}</div>
              <div className={styles.toolSubtitle}>requests permission to run</div>
            </div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={16} weight="bold" />
          </button>
        </div>
        {patterns && patterns.length > 0 && (
          <div className={styles.toolContent}>
            {patterns.map((pattern, i) => (
              <div key={i} className={styles.permissionPattern}>
                <code>{directory ? relativizePath(pattern, directory) : pattern}</code>
              </div>
            ))}
          </div>
        )}
        <div className={styles.toolActions}>
          <button type="button" className={styles.toolDenyBtn} onClick={() => handleRespond('deny')}>
            Deny
          </button>
          <button type="button" className={styles.toolAllowAlwaysBtn} onClick={() => handleRespond('always')}>
            Allow Always
          </button>
          <button type="button" className={styles.toolAllowOnceBtn} onClick={() => handleRespond('allow')}>
            Allow Once
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionPanel({ interaction, onRespond, onClose, isClosing, setIsClosing }) {
  const { questions: rawQuestions, callID } = interaction.data
  const questions = Array.isArray(rawQuestions) ? rawQuestions : EMPTY_QUESTIONS
  const [state, dispatch] = useReducer(reducer, questions, initState)
  const single = isSingleQuestion(questions)
  const inputRef = useRef(null)
  const prevCallID = useRef(null)

  // Reset state when a new question request arrives
  useEffect(() => {
    if (callID && callID !== prevCallID.current) {
      prevCallID.current = callID
      dispatch({ type: 'RESET', questions })
    }
  }, [callID, questions])

  // Focus custom input when editing
  useEffect(() => {
    if (state.editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [state.editing])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => onClose?.(), 200)
  }, [onClose, setIsClosing])

  const handleSubmit = useCallback((answers) => {
    setIsClosing(true)
    setTimeout(() => onRespond?.({ answers }), 200)
  }, [onRespond, setIsClosing])

  const isConfirmTab = !single && state.tab === questions.length
  const info = questions[state.tab]
  if (!info && !isConfirmTab) return null

  const customIdx = info ? info.options.length : 0

  const handleOptionClick = (index) => {
    if (isConfirmTab) return
    dispatch({ type: 'SET_SELECTED', selected: index })

    if (index === customIdx) {
      // "Other" option selected
      dispatch({ type: 'SET_EDITING', editing: true })
      return
    }

    const option = info.options[index]
    if (!option) return

    if (info.multiple) {
      dispatch({ type: 'TOGGLE_ANSWER', tab: state.tab, value: option.label })
    } else if (single) {
      // Single question, single select — respond immediately
      handleSubmit([[option.label]])
    } else {
      // Multi-question, single select — set answer and advance
      dispatch({ type: 'SET_ANSWER', tab: state.tab, value: option.label })
      const nextTab = state.tab < questions.length - 1 ? state.tab + 1 : questions.length
      setTimeout(() => dispatch({ type: 'SET_TAB', tab: nextTab }), 150)
    }
  }

  const handleCustomSave = () => {
    const value = (state.custom[state.tab] || '').trim()
    if (!value) {
      dispatch({ type: 'SET_EDITING', editing: false })
      return
    }
    if (info.multiple) {
      dispatch({ type: 'SAVE_CUSTOM', questions })
      dispatch({ type: 'SET_EDITING', editing: false })
    } else if (single) {
      handleSubmit([[value]])
    } else {
      dispatch({ type: 'SAVE_CUSTOM', questions })
      const nextTab = state.tab < questions.length - 1 ? state.tab + 1 : questions.length
      setTimeout(() => dispatch({ type: 'SET_TAB', tab: nextTab }), 150)
    }
  }

  const handleKeyDown = (e, index) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleOptionClick(index)
    }
  }

  const handleCustomKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCustomSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      dispatch({ type: 'SET_EDITING', editing: false })
    }
  }

  const renderTabHeader = () => {
    if (single) return null
    return (
      <div className={styles.tabBar}>
        {questions.map((q, i) => {
          const isAnswered = (state.answers[i] || []).length > 0
          const isActive = state.tab === i
          return (
            <button
              key={i}
              type="button"
              className={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ''} ${isAnswered ? styles.tabBtnAnswered : ''}`}
              onClick={() => dispatch({ type: 'SET_TAB', tab: i })}
            >
              <span className={styles.tabDot}>{isAnswered ? <Check size={10} weight="bold" /> : i + 1}</span>
              <span className={styles.tabLabel}>{q.header || `Q${i + 1}`}</span>
            </button>
          )
        })}
        <button
          type="button"
          className={`${styles.tabBtn} ${isConfirmTab ? styles.tabBtnActive : ''}`}
          onClick={() => dispatch({ type: 'SET_TAB', tab: questions.length })}
        >
          <span className={styles.tabDot}><ArrowRight size={10} weight="bold" /></span>
          <span className={styles.tabLabel}>Review</span>
        </button>
      </div>
    )
  }

  const renderConfirm = () => (
    <div className={styles.confirmBody}>
      <div className={styles.confirmTitle}>Review your answers</div>
      <div className={styles.confirmList}>
        {questions.map((q, i) => {
          const answers = state.answers[i] || []
          return (
            <div key={i} className={styles.confirmItem}>
              <div className={styles.confirmItemQ}>{q.header || q.question}</div>
              <div className={styles.confirmItemA}>
                {answers.length > 0 ? answers.join(', ') : <span className={styles.noAnswer}>No answer</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div className={styles.confirmActions}>
        <button type="button" className={styles.confirmCancelBtn} onClick={handleClose}>Dismiss</button>
        <button
          type="button"
          className={styles.confirmAcceptBtn}
          onClick={() => handleSubmit(state.answers.map((a) => a || []))}
        >
          Submit
        </button>
      </div>
    </div>
  )

  const renderQuestion = () => (
    <div className={styles.questionBody}>
      <div className={styles.questionHeader}>
        {!single && <span className={styles.questionIndex}>{state.tab + 1}/{questions.length}</span>}
        <span className={styles.questionText}>{info.question}</span>
      </div>

      {state.editing ? (
        <div className={styles.customEditWrap}>
          <input
            ref={inputRef}
            type="text"
            className={styles.customEditInput}
            placeholder="Type your answer..."
            value={state.custom[state.tab] || ''}
            onChange={(e) => dispatch({ type: 'SET_CUSTOM', tab: state.tab, value: e.target.value })}
            onKeyDown={handleCustomKeyDown}
          />
          <div className={styles.customEditActions}>
            <button type="button" className={styles.customEditCancel} onClick={() => dispatch({ type: 'SET_EDITING', editing: false })}>Cancel</button>
            <button type="button" className={styles.customEditSave} onClick={handleCustomSave}>Save</button>
          </div>
        </div>
      ) : (
        <div className={styles.questionOptions} role="listbox" aria-label={info.question}>
          {info.options.map((option, index) => {
            const isSelected = state.selected === index
            const isChecked = (state.answers[state.tab] || []).includes(option.label)
            return (
              <button
                key={index}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`${styles.option} ${isSelected ? styles.optionActive : ''} ${isChecked ? styles.optionChecked : ''}`}
                onClick={() => handleOptionClick(index)}
                onMouseEnter={() => dispatch({ type: 'SET_SELECTED', selected: index })}
                onKeyDown={(e) => handleKeyDown(e, index)}
                tabIndex={-1}
              >
                <span className={styles.optionIndex}>
                  {info.multiple ? (
                    <span className={`${styles.checkbox} ${isChecked ? styles.checkboxChecked : ''}`}>
                      {isChecked && <Check size={10} weight="bold" />}
                    </span>
                  ) : (
                    <span className={styles.optionIndexText}>{index + 1}</span>
                  )}
                </span>
                <span className={styles.optionContent}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description && (
                    <span className={styles.optionDesc}>{option.description}</span>
                  )}
                </span>
              </button>
            )
          })}
          {info.custom !== false && (
            <button
              type="button"
              role="option"
              aria-selected={state.selected === customIdx}
              className={`${styles.option} ${styles.optionOther} ${state.selected === customIdx ? styles.optionActive : ''}`}
              onClick={() => handleOptionClick(customIdx)}
              onMouseEnter={() => dispatch({ type: 'SET_SELECTED', selected: customIdx })}
              onKeyDown={(e) => handleKeyDown(e, customIdx)}
              tabIndex={-1}
            >
              <span className={styles.optionIndex}>
                <PencilSimple size={14} weight="fill" />
              </span>
              <span className={styles.optionLabel}>Something else...</span>
            </button>
          )}
        </div>
      )}

      {!single && (
        <div className={styles.questionFooter}>
          <span className={styles.questionHint}>
            {info.multiple ? 'Select one or more options' : 'Choose an option'}
          </span>
        </div>
      )}
    </div>
  )

  return (
    <div className={`${styles.panel} ${isClosing ? styles.panelClosing : ''}`}>
      <div className={styles.questionContainer}>
        <div className={styles.questionTopBar}>
          <span className={styles.questionTopTitle}>
            {single ? '' : 'Questions'}
          </span>
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Dismiss">
            <X size={16} weight="bold" />
          </button>
        </div>
        {renderTabHeader()}
        {isConfirmTab ? renderConfirm() : renderQuestion()}
      </div>
    </div>
  )
}

export default InteractionPanel
