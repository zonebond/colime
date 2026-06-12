import { useMemo } from 'react'
import styles from './DiffChanges.module.css'

const ADD_COLOR = '#3a8437'
const DELETE_COLOR = '#ed4831'
const NEUTRAL_COLOR = 'var(--txt3)'

function computeBlocks(additions, deletions) {
  const total = additions + deletions
  if (total === 0) return { added: 0, deleted: 0, neutral: 5 }

  if (total < 5) {
    return {
      added: additions > 0 ? 1 : 0,
      deleted: deletions > 0 ? 1 : 0,
      neutral: 5 - (additions > 0 ? 1 : 0) - (deletions > 0 ? 1 : 0),
    }
  }

  const ratio = additions > deletions ? additions / deletions : deletions / additions
  let blocksForColors = 5

  if (total < 20) {
    blocksForColors = 4
  } else if (ratio < 4) {
    blocksForColors = 4
  }

  const percentAdded = additions / total
  const percentDeleted = deletions / total

  const addedRaw = percentAdded * blocksForColors
  const deletedRaw = percentDeleted * blocksForColors

  let added = additions > 0 ? Math.max(1, Math.round(addedRaw)) : 0
  let deleted = deletions > 0 ? Math.max(1, Math.round(deletedRaw)) : 0

  if (additions > 0 && additions <= 5) added = Math.min(added, 1)
  if (additions > 5 && additions <= 10) added = Math.min(added, 2)
  if (deletions > 0 && deletions <= 5) deleted = Math.min(deleted, 1)
  if (deletions > 5 && deletions <= 10) deleted = Math.min(deleted, 2)

  const totalAllocated = added + deleted
  if (totalAllocated > blocksForColors) {
    if (addedRaw > deletedRaw) {
      added = blocksForColors - deleted
    } else {
      deleted = blocksForColors - added
    }
  }

  const neutral = Math.max(0, 5 - (added + deleted))
  return { added, deleted, neutral }
}

export default function DiffChanges({ changes, variant = 'default', className = '' }) {
  const { additions, deletions } = useMemo(() => {
    if (!changes) return { additions: 0, deletions: 0 }
    if (Array.isArray(changes)) {
      return {
        additions: changes.reduce((acc, d) => acc + (d.additions ?? 0), 0),
        deletions: changes.reduce((acc, d) => acc + (d.deletions ?? 0), 0),
      }
    }
    return { additions: changes.additions ?? 0, deletions: changes.deletions ?? 0 }
  }, [changes])

  const total = additions + deletions

  const visibleBlocks = useMemo(() => {
    const counts = computeBlocks(additions, deletions)
    const blocks = [
      ...Array(counts.added).fill(ADD_COLOR),
      ...Array(counts.deleted).fill(DELETE_COLOR),
      ...Array(counts.neutral).fill(NEUTRAL_COLOR),
    ]
    return blocks.slice(0, 5)
  }, [additions, deletions])

  if (total === 0) return null

  if (variant === 'bars') {
    return (
      <span className={`${styles.bars} ${className}`}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 14" fill="none">
          <g>
            {visibleBlocks.map((color, i) => (
              <rect key={i} x={i * 4} width="2" height="14" rx="1" fill={color} />
            ))}
          </g>
        </svg>
      </span>
    )
  }

  return (
    <span className={`${styles.default} ${className}`}>
      <span className={styles.additions}>{`+${additions}`}</span>
      <span className={styles.deletions}>{`-${deletions}`}</span>
    </span>
  )
}
