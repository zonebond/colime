import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { IconMore, IconChats, IconPencil, IconSparkle, IconTrashSmall } from '@/components/icons'
import { removeSkill } from '@/features/toolbox/toolbox.service'
import ConfirmDialog from './ConfirmDialog'
import styles from './SkillActionsMenu.module.css'

const STORAGE_KEY = 'board:disabledSkills'

function getDisabledSkills() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

export function isSkillDisabled(name) {
  return getDisabledSkills().includes(name)
}

export function setSkillDisabled(name, disabled) {
  const list = getDisabledSkills()
  const next = disabled
    ? [...new Set([...list, name])]
    : list.filter((n) => n !== name)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

function getPopoverPosition(rect, menuWidth = 160, menuHeight = 180) {
  const gap = 6
  const viewportPadding = 12
  return {
    left: Math.max(viewportPadding, rect.right - menuWidth),
    top: Math.min(rect.top - menuHeight - gap, window.innerHeight - menuHeight - viewportPadding),
    side: rect.top < menuHeight + viewportPadding + gap ? 'bottom' : 'top',
  }
}

export default function SkillActionsMenu({ skill, onToggle, onDelete, onEditInDialog }) {
  const navigate = useNavigate()
  const [showPopover, setShowPopover] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, side: 'bottom' })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const moreBtnRef = useRef(null)

  const { t } = useTranslation()
  const tp = t('toolbox.skillActions') || {}
  const isBuiltin = skill.location === '<built-in>'
  const disabled = isSkillDisabled(skill.name)
  const locked = deleting

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

  const close = useCallback(() => setShowPopover(false), [])

  // Prevent click-through: after popover unmounts, the browser may re-dispatch
  // the click to the card underneath, opening the skill detail dialog.
  // onMouseDown + preventDefault stops the click event from being generated.
  const consume = (fn) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }

  const handleTryInChat = () => {
    close()
    navigate('/chats/new', {
      state: { initialPrompt: `Please load and use the "${skill.name}" skill to help me.` },
    })
  }

  const handleEdit = () => {
    close()
    if (onEditInDialog) {
      onEditInDialog(skill)
    } else {
      navigate('/chats/new', {
        state: { initialPrompt: `Please help me edit skill "${skill.name}", file path: ${skill.location}` },
      })
    }
  }

  const handleEditInRavens = () => {
    close()
    navigate('/chats/new', {
      state: { initialPrompt: `Please help me edit skill "${skill.name}" in ravens\n\nSkill file path: ${skill.location}\n\nCurrent content:\n\n\`\`\`markdown\n${skill.content}\n\`\`\`` },
    })
  }

  const handleToggle = () => {
    const nextDisabled = !disabled
    setSkillDisabled(skill.name, nextDisabled)
    onToggle?.(skill.name, nextDisabled)
    close()
  }

  const handleDeleteClick = () => {
    close()
    setConfirmDelete(true)
  }

  const handleDeleteConfirm = async () => {
    setDeleting(true)
    try {
      await removeSkill(skill.name)
      onDelete?.(skill.name)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <>
      <button
        ref={moreBtnRef}
        className={styles.moreBtn}
        onClick={handleMoreClick}
        disabled={locked}
        aria-label={`More options for ${skill.name}`}
      >
        <IconMore />
      </button>

      {showPopover && createPortal(
        <>
          <div className={styles.popoverBackdrop} onMouseDown={(e) => { e.preventDefault(); setShowPopover(false) }} />
          <div
            className={styles.popover}
            data-side={popoverPos.side}
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button className={styles.popoverItem} onMouseDown={consume(handleTryInChat)}>
              <IconChats />
              <span>{tp.tryInChat}</span>
            </button>

            <div className={styles.popoverDivider} />

            <button className={styles.popoverItem} onMouseDown={consume(handleEdit)} disabled={isBuiltin}>
              <IconPencil />
              <span>{tp.edit}</span>
            </button>
            <button className={styles.popoverItem} onMouseDown={consume(handleEditInRavens)}>
              <IconSparkle />
              <span>{tp.editInRavens}</span>
            </button>

            <div className={styles.popoverDivider} />

            <button className={styles.popoverItem} onMouseDown={consume(handleToggle)}>
              <span>{disabled ? tp.enable : tp.disable}</span>
            </button>
            <button className={`${styles.popoverItem} ${styles.popoverDelete}`} onMouseDown={consume(handleDeleteClick)} disabled={isBuiltin}>
              <IconTrashSmall />
              <span>{tp.deleteUninstall}</span>
            </button>
          </div>
        </>,
        document.body,
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={tp.confirmDeleteTitle}
          message={tp.confirmDeleteMessage.replace('{name}', skill.name)}
          danger
          loading={deleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  )
}
