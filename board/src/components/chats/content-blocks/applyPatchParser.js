/**
 * Parse block.toolMetadata.files into structured ApplyPatchFile objects.
 * Lightweight JS port of packages/ui/src/components/apply-patch-file.ts.
 *
 * @param {unknown} raw - expected: Array of file patch objects from toolMetadata.files
 * @returns {ApplyPatchFile[]}
 */
export function parseApplyPatchFiles(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(patchFile).filter(Boolean)
}

/**
 * @typedef {Object} ApplyPatchFile
 * @property {string} filePath
 * @property {string} relativePath
 * @property {'add'|'update'|'delete'|'move'} type
 * @property {number} additions
 * @property {number} deletions
 * @property {string} [movePath]
 * @property {string} [patchText]
 * @property {string} [afterText]
 */

function kind(value) {
  if (value === 'add' || value === 'update' || value === 'delete' || value === 'move') return value
}

/** @param {unknown} raw */
function patchFile(raw) {
  if (!raw || typeof raw !== 'object') return

  const value = /** @type {Record<string, unknown>} */ (raw)
  const type = kind(value.type)
  const filePath = typeof value.filePath === 'string' ? value.filePath : undefined
  const relativePath = typeof value.relativePath === 'string' ? value.relativePath : filePath
  const patch = typeof value.patch === 'string' ? value.patch
    : typeof value.diff === 'string' ? value.diff
    : undefined
  const after = typeof value.after === 'string' ? value.after : undefined

  if (!type || !filePath || !relativePath) return
  if (!patch && typeof value.before !== 'string' && typeof value.after !== 'string') return

  return {
    filePath,
    relativePath,
    type,
    additions: typeof value.additions === 'number' ? value.additions : 0,
    deletions: typeof value.deletions === 'number' ? value.deletions : 0,
    movePath: typeof value.movePath === 'string' ? value.movePath : undefined,
    patchText: patch,
    afterText: after,
  }
}
