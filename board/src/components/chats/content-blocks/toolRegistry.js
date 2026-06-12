import {
  Wrench,
  FileText,
  PencilSimple,
  TerminalWindow,
  MagnifyingGlass,
  Globe,
  Flag,
  ListChecks,
  CheckSquare,
  Question,
  Code,
  FloppyDisk,
  Brain,
  GitFork,
  FolderOpen,
  Folder,
  Prohibit,
  ArrowsOutLineVertical,
} from '@phosphor-icons/react'
import { relativizePath } from '@/lib/path'
import { parseApplyPatchFiles } from './applyPatchParser'

/**
 * ToolRegistry maps ravens tool names to their display configuration.
 * Each entry defines: icon, label resolver, description resolver, color.
 *
 * The registry is used by BasicTool to render tool-specific header content
 * while keeping the card shell (expand/collapse, states, progress) generic.
 */
const registry = {
  read: {
    icon: FileText,
    label: () => 'Read file',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      const raw = input?.filePath || input?.path || input?.file_path || null
      if (!raw) return null
      const rel = relativizePath(raw, block._directory) || raw
      return rel.split('/').pop()
    },
    args: (block) => {
      const input = block.toolInput
      if (!input || typeof input === 'string') return []
      const result = []
      if (input.offset !== undefined) result.push(`offset=${input.offset}`)
      if (input.limit !== undefined) result.push(`limit=${input.limit}`)
      return result
    },
    color: '#22a552',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      const raw = block.toolInput?.filePath || block.toolInput?.path
      if (!output) return null
      const loaded = Array.isArray(block.toolMetadata?.loaded) ? block.toolMetadata.loaded : null
      return { type: 'read', output, path: relativizePath(raw, block._directory), loaded }
    },
  },
  write: {
    icon: PencilSimple,
    label: () => 'Write file',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      const raw = input?.filePath || input?.path || input?.file_path || null
      if (!raw) return null
      const rel = relativizePath(raw, block._directory) || raw
      return rel.split('/').pop()
    },
    color: '#3b82f6',
    renderSummary: (block) => {
      const raw = block.toolInput?.filePath || block.toolInput?.path
      if (!raw) return null
      const content = block.toolInput?.content || ''
      const additions = content ? content.split('\n').length : 0
      const contentTruncated = content.length > 100000
      return { type: 'write-edit', path: relativizePath(raw, block._directory), action: 'write', content, additions, deletions: 0, diagnostics: block.toolMetadata?.diagnostics || null, contentTruncated }
    },
  },
  edit: {
    icon: PencilSimple,
    label: () => 'Edit file',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      const raw = input?.filePath || input?.path || input?.file_path || null
      if (!raw) return null
      const rel = relativizePath(raw, block._directory) || raw
      return rel.split('/').pop()
    },
    color: '#3b82f6',
    renderSummary: (block) => {
      const raw = block.toolInput?.filePath || block.toolInput?.path
      if (!raw) return null
      const filediff = block.toolMetadata?.filediff
      const additions = filediff?.additions ?? 0
      const deletions = filediff?.deletions ?? 0
      const content = block.toolResult || ''
      const contentTruncated = content.length > 100000
      return { type: 'write-edit', path: relativizePath(raw, block._directory), action: 'edit', content, additions, deletions, diagnostics: block.toolMetadata?.diagnostics || null, contentTruncated }
    },
  },
  apply_patch: {
    icon: PencilSimple,
    label: () => 'Apply patch',
    description: (block) => {
      const files = block.toolMetadata?.files
      const count = Array.isArray(files) ? files.length : 0
      if (count === 0) return null
      return `${count} file${count > 1 ? 's' : ''}`
    },
    color: '#3b82f6',
    renderSummary: (block) => {
      const files = block.toolMetadata?.files
      const parsed = parseApplyPatchFiles(files)
      if (!parsed.length) return null
      return { type: 'apply-patch', files: parsed, rawOutput: block.toolResult }
    },
  },
  bash: {
    icon: TerminalWindow,
    label: () => 'Run command',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.description || input?.command || null
    },
    color: '#f59e0b',
    renderSummary: (block) => {
      const command = block.toolInput?.command
      if (!command) return null
      return { type: 'bash', command }
    },
  },
  glob: {
    icon: MagnifyingGlass,
    label: () => 'Search files',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return null
      return relativizePath(input?.path || null, block._directory)
    },
    args: (block) => {
      const input = block.toolInput
      if (!input || typeof input === 'string') return []
      const result = []
      if (input.pattern) result.push(input.pattern)
      return result
    },
    color: '#8b5cf6',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'markdown', output: String(output) }
    },
  },
  grep: {
    icon: MagnifyingGlass,
    label: () => 'Search code',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return null
      return relativizePath(input?.path || null, block._directory)
    },
    args: (block) => {
      const input = block.toolInput
      if (!input || typeof input === 'string') return []
      const result = []
      if (input.pattern) result.push(input.pattern)
      if (input.include) result.push(`include=${input.include}`)
      return result
    },
    color: '#8b5cf6',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'markdown', output: String(output) }
    },
  },
  list: {
    icon: FolderOpen,
    label: () => 'List directory',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return relativizePath(input?.path || null, block._directory)
    },
    color: '#6cbf7b',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'markdown', output: String(output) }
    },
  },
  task: {
    icon: ListChecks,
    label: () => 'Subtask',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.description || input?.prompt || null
    },
    color: '#ec4899',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      const subagentType = block.toolInput?.subagent_type || block.toolMetadata?.subagent_type || null
      const sessionId = block.toolMetadata?.sessionId || null
      return { type: 'task', output: String(output), subagentType, sessionId }
    },
    errorProps: (block) => {
      const input = block.toolInput
      const desc = typeof input === 'string' ? input : input?.description || input?.prompt || null
      return { subtitle: desc || 'Subtask' }
    },
  },
  todo_write: {
    icon: CheckSquare,
    label: () => 'Update todos',
    description: () => null,
    color: '#f59e0b',
  },
  webfetch: {
    icon: Globe,
    label: () => 'Fetch URL',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.url || null
    },
    triggerHref: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return null
      return input?.url || null
    },
    color: '#3b82f6',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'webfetch', output: String(output), url: block.toolInput?.url || null, isMarkdown: true }
    },
    errorProps: (block) => {
      const input = block.toolInput
      const url = typeof input === 'string' ? input : input?.url || null
      return { subtitle: url || 'Web fetch' }
    },
  },
  websearch: {
    icon: Globe,
    label: () => 'Web search',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.query || null
    },
    color: '#3b82f6',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'websearch', output: String(output) }
    },
    errorProps: (block) => {
      const input = block.toolInput
      const query = typeof input === 'string' ? input : input?.query || null
      return { subtitle: query || 'Web search' }
    },
  },
  question: {
    icon: Question,
    label: (block) => {
      const input = block.toolInput
      const count = Array.isArray(input?.questions) ? input.questions.length : 0
      return count > 1 ? `Ask ${count} questions` : 'Ask question'
    },
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      const questions = Array.isArray(input?.questions) ? input.questions : []
      const first = questions[0]
      return first?.question || first?.header || null
    },
    color: '#f59e0b',
    autoExpand: (block) => {
      const answers = block.toolMetadata?.answers
      return Array.isArray(answers) && answers.length > 0
    },
    renderSummary: (block) => {
      const input = block.toolInput
      const questions = Array.isArray(input?.questions) ? input.questions : []
      const metadata = block.toolMetadata
      const answers = Array.isArray(metadata?.answers) ? metadata.answers : null
      if (questions.length === 0) return null
      return {
        type: 'qa',
        questions,
        answers,
      }
    },
  },
  plan_exit: {
    icon: Flag,
    label: () => 'Exit plan mode',
    description: () => null,
    color: '#6cbf7b',
  },
  skill: {
    icon: Brain,
    label: () => 'Skill',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.name || null
    },
    color: '#8b5cf6',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      const name = block.toolInput?.name || block.toolMetadata?.name || null
      return { type: 'skill', output: String(output), name }
    },
  },
  invalid: {
    icon: Prohibit,
    label: () => 'Invalid tool',
    description: () => null,
    color: '#ef4444',
  },
  lsp: {
    icon: Code,
    label: () => 'LSP',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.operation || null
    },
    args: (block) => {
      const input = block.toolInput
      if (!input || typeof input === 'string') return []
      const result = []
      if (input.filePath) result.push(input.filePath)
      return result
    },
    color: '#8b5cf6',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'lsp', output: String(output), operation: block.toolInput?.operation || null }
    },
  },
  repo_clone: {
    icon: GitFork,
    label: () => 'Clone repo',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.url || null
    },
    color: '#f59e0b',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'markdown', output: String(output) }
    },
  },
  repo_overview: {
    icon: Folder,
    label: () => 'Repo overview',
    description: () => null,
    color: '#6cbf7b',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'markdown', output: String(output) }
    },
  },
  truncate: {
    icon: ArrowsOutLineVertical,
    label: () => 'Truncate',
    description: () => null,
    color: '#a1a1aa',
  },
  memory_save: {
    icon: FloppyDisk,
    label: () => 'Save memory',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.title || input?.name || null
    },
    color: '#ec4899',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      return { type: 'memory', output: String(output), action: 'save' }
    },
  },
  memory_search: {
    icon: Brain,
    label: () => 'Search memory',
    description: (block) => {
      const input = block.toolInput
      if (typeof input === 'string') return input
      return input?.query || null
    },
    color: '#ec4899',
    renderSummary: (block) => {
      const output = block.toolResult || block.toolOutput
      if (!output) return null
      const count = block.toolMetadata?.count ?? null
      return { type: 'memory', output: String(output), action: 'search', count }
    },
  },
}

const DEFAULT_ENTRY = {
  icon: Wrench,
  label: (toolName) => toolName || 'Tool',
  description: () => null,
  color: '#a1a1aa',
}

export function getToolEntry(toolName) {
  return registry[toolName] || { ...DEFAULT_ENTRY, label: () => DEFAULT_ENTRY.label(toolName) }
}

export default registry
