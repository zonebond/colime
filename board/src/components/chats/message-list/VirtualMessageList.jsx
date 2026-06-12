import { memo, useMemo } from 'react'
import UserMessageRow from './UserMessageRow'
import AssistantMessageRow from './AssistantMessageRow'
import { isContextTool } from '../content-blocks/ContextToolGroup'
import styles from './VirtualMessageList.module.css'

const FILE_WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch'])

/**
 * Collect all shell / run-command text executed in a group so we can
 * identify which written files are consumed as tool inputs rather
 * than being the user's intended deliverable.
 */
function collectShellCommands(group) {
  const commands = []
  for (const msg of group) {
    for (const block of msg.contentBlocks || []) {
      if (block.type !== 'tool_result') continue
      const tn = block.toolName
      if (tn !== 'shell' && tn !== 'bash' && tn !== 'run_command') continue
      const cmd = block.toolInput?.command || block.toolInput?.cmd || block.toolInput?.script || ''
      if (cmd) commands.push(cmd)
    }
  }
  return commands
}

const TOOL_SCRIPT_EXTS = new Set(['.py', '.sh', '.js', '.ts', '.json', '.yaml', '.yml', '.toml'])

/**
 * File extensions that represent user-facing output / deliverable formats.
 * When the agent mentions a filename with one of these extensions in a text
 * block, it is treated as a candidate output file.
 */
const OUTPUT_EXTS = new Set([
  '.pdf', '.md', '.html', '.htm', '.txt', '.csv',
  '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
  '.zip', '.tar.gz', '.tgz', '.gz',
])

/**
 * Scan text blocks across the group for filenames wrapped in backticks
 * (e.g. `report.pdf`). These are explicit agent mentions of output files,
 * typically produced as side effects of shell commands (weasyprint, pandoc, etc.)
 * and therefore invisible to tool-input-based collection.
 */
function extractMentionedFiles(group) {
  const mentioned = new Map()
  for (const msg of group) {
    for (const block of msg.contentBlocks || []) {
      if (block.type !== 'text' || !block.content) continue
      const matches = block.content.match(/`([^`]+\.[a-zA-Z0-9]+(?:\.gz)?)`/g)
      if (!matches) continue
      for (const m of matches) {
        const name = m.replace(/`/g, '')
        const ext = name.endsWith('.tar.gz') ? '.tar.gz'
          : name.endsWith('.tgz') ? '.tgz'
          : name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
        if (!OUTPUT_EXTS.has(ext)) continue
        if (!mentioned.has(name)) {
          mentioned.set(name, {
            fileName: name,
            filePath: name,
            rawPath: name,
            _directory: msg._directory,
            _mentioned: true,
          })
        }
      }
    }
  }
  return mentioned
}

/**
 * Collect produced files across each group of consecutive assistant messages.
 * Returns a Map<messageId, files[]> where files are assigned to the LAST
 * message of each group (the one that renders the responseFooter).
 *
 * Files that are referenced in subsequent shell/run commands are treated as
 * intermediate tool scripts and excluded from the display — only the user's
 * intended target documents should appear.
 */
function buildGroupFileMap(messages) {
  const fileMap = new Map()
  let group = []

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    group.push(msg)

    const nextMsg = messages[i + 1]
    const isGroupEnd = !nextMsg || nextMsg.role === 'user'

    if (isGroupEnd && group.length > 0) {
      // Collect all shell commands run in this group
      const shellCmds = collectShellCommands(group)

      // Collect files from every message in this group
      const seen = new Map()
      for (const groupMsg of group) {
        for (const block of groupMsg.contentBlocks || []) {
          if (block.type !== 'tool_result') continue
          if (!FILE_WRITE_TOOLS.has(block.toolName)) continue
          if (block.state !== 'done') continue
          const fp = block.toolInput?.filePath || block.toolInput?.path
          if (!fp) continue
          const name = fp.split('/').pop()
          if (!name) continue

          // ── Tool file detection ──────────────────────────────
          // A file is a "tool" (intermediate) when:
          // 1. It has a script extension, AND
          // 2. Its basename appears in a subsequent shell command
          //    (e.g. "python convert_md_to_pdf.py")
          const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
          const isToolScript =
            TOOL_SCRIPT_EXTS.has(ext) &&
            shellCmds.some((cmd) => cmd.includes(name))

          if (isToolScript) continue

          // Dedupe by basename, later message's file wins
          seen.set(name, {
            fileName: name,
            filePath: fp,
            rawPath: fp,
            _directory: groupMsg._directory || block._directory,
          })
        }
      }

      // ── Supplement with agent-mentioned output files ──────────
      // Shell commands (weasyprint, pandoc, etc.) produce files that
      // aren't captured by tool inputs.  Scan text blocks for
      // backtick-wrapped filenames (e.g. `report.pdf`) and include
      // them when no tool-produced entry already exists for that name.
      for (const [name, entry] of extractMentionedFiles(group)) {
        if (!seen.has(name)) {
          seen.set(name, entry)
        }
      }

      // Assign files to the last message in the group
      const lastMsg = group[group.length - 1]
      fileMap.set(lastMsg.id, Array.from(seen.values()))

      group = []
    }
  }

  return fileMap
}

function formatDateGroup(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (msgDay.getTime() === today.getTime()) return 'Today'
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday'

  const diffDays = Math.floor((today - msgDay) / 86400000)
  if (diffDays < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
  }

  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: msgDay.getFullYear() !== today.getFullYear() ? 'numeric' : undefined }).format(date)
}

function shouldShowDateSeparator(messages, index) {
  if (index === 0) return true
  const prev = new Date(messages[index - 1].createdAt)
  const curr = new Date(messages[index].createdAt)
  return prev.toDateString() !== curr.toDateString()
}

function mergeAdjacentContextMessages(messages) {
  if (!messages || messages.length < 2) return messages

  const result = []
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]

    if (msg.role !== 'assistant' || !isSingleContextToolMessage(msg)) {
      result.push(msg)
      i++
      continue
    }

    const mergedToolBlocks = [...msg.contentBlocks?.filter((b) => b.type === 'tool_result') || []]
    let j = i + 1
    while (j < messages.length) {
      const next = messages[j]
      if (next.role !== 'assistant' || !isSingleContextToolMessage(next)) break
      mergedToolBlocks.push(...next.contentBlocks?.filter((b) => b.type === 'tool_result') || [])
      j++
    }

    if (j > i + 1) {
      const originalBlocks = msg.contentBlocks || []
      const textBlocks = originalBlocks.filter((b) => b.type === 'text')
      const otherBlocks = originalBlocks.filter((b) => b.type !== 'tool_result' && b.type !== 'text')

      result.push({
        ...msg,
        contentBlocks: [...mergedToolBlocks, ...textBlocks, ...otherBlocks],
      })
    } else {
      result.push(msg)
    }
    i = j
  }
  return result
}

function isSingleContextToolMessage(msg) {
  const blocks = msg.contentBlocks || []
  const toolBlocks = blocks.filter((b) => b.type === 'tool_result')
  const textBlocks = blocks.filter((b) => b.type === 'text' && b.content)

  if (toolBlocks.length !== 1 || textBlocks.length > 0) return false

  const toolName = toolBlocks[0].toolName
  return isContextTool(toolName) && toolBlocks[0].state === 'done'
}

const VirtualMessageList = memo(function VirtualMessageList({ messages, tc, focusedIndex = -1, models, onPreviewAttachment, anchorMessageId, onMessageClick, searchHighlightIndex = -1, onConfirmTool, onRetryTool, onResetToHere, isReverting, onViewAllFiles, onPreviewSessionFile }) {
  const mergedMessages = useMemo(() => mergeAdjacentContextMessages(messages), [messages])
  const groupFileMap = useMemo(() => buildGroupFileMap(mergedMessages), [mergedMessages])

  return (
    <div className={styles.list}>
      {mergedMessages.map((message, index) => {
        const isFocused = index === focusedIndex
        const isAnchored = message.id === anchorMessageId
        const isSearchMatch = index === searchHighlightIndex
        const showDateSep = shouldShowDateSeparator(mergedMessages, index)
        const blocks = message.contentBlocks || []
        const hasTextContent = blocks.some((b) => b.type === 'text' && b.content)
        const hasNonTextOnly = !hasTextContent && blocks.some((b) => b.type === 'reasoning' || b.type === 'tool_result')
        const isLastMessage =
          index + 1 >= mergedMessages.length ||
          mergedMessages[index + 1]?.role === 'user'
        // For assistant messages managed by buildGroupFileMap:
        // - last in group → files array (may be empty)
        // - non-last     → null (group mode, suppress per-message files)
        // For user messages: undefined (not in group mode)
        const isLastInGroup = groupFileMap.has(message.id)
        const groupFiles = message.role === 'assistant'
          ? (isLastInGroup ? groupFileMap.get(message.id) : null)
          : undefined

        return (
          <div
            key={message.id}
            data-message-index={index}
            data-message-id={message.id}
            className={`${isFocused ? styles.messageFocused : ''} ${isAnchored ? styles.messageAnchored : ''} ${isSearchMatch ? styles.messageSearchHighlight : ''}`}
            onClick={() => onMessageClick?.(message.id)}
            style={{
              paddingBottom: hasNonTextOnly ? 0 : undefined,
              cursor: 'pointer',
            }}
          >
            {showDateSep && (
              <div className={styles.dateSeparator}>
                <span>{formatDateGroup(message.createdAt)}</span>
              </div>
            )}
            {message.role === 'user' ? (
              <UserMessageRow
                message={message}
                tc={tc}
                models={models}
                onPreviewAttachment={onPreviewAttachment}
                onResetToHere={onResetToHere}
                isReverting={isReverting}
              />
            ) : (
              <AssistantMessageRow
                message={message}
                tc={tc}
                models={models}
                onConfirmTool={onConfirmTool}
                onRetryTool={onRetryTool}
                isLastMessage={isLastMessage}
                groupFiles={groupFiles}
                onViewAllFiles={onViewAllFiles}
                onPreviewSessionFile={onPreviewSessionFile}
              />
            )}
          </div>
        )
      })}
    </div>
  )
})

export default VirtualMessageList

// ── Exported for testing ─────────────────────────────────────────────
export {
  buildGroupFileMap,
  collectShellCommands,
  extractMentionedFiles,
  FILE_WRITE_TOOLS,
  TOOL_SCRIPT_EXTS,
  OUTPUT_EXTS,
}
