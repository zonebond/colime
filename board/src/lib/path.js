/**
 * Strip baseDir prefix from filePath to show a path relative to the
 * chat working directory. Returns the original path when either argument
 * is missing or the path lies outside the base directory.
 */
const PATH_KEYS = ['filePath', 'path', 'file_path']

export function relativizePath(filePath, baseDir) {
  if (!filePath || !baseDir) return filePath
  const normalized = filePath.replace(/\\/g, '/')
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '')
  if (normalized === base) return '.'
  if (normalized.startsWith(base + '/')) return normalized.slice(base.length + 1)
  return filePath
}

/** Relativize known path fields in a tool input object for display. */
export function relativizePaths(obj, baseDir) {
  if (!obj || !baseDir) return obj
  const input = typeof obj === 'string' ? (() => { try { return JSON.parse(obj) } catch { return null } })() : { ...obj }
  if (!input) return obj
  for (const key of PATH_KEYS) {
    if (input[key]) input[key] = relativizePath(input[key], baseDir)
  }
  return input
}

/** Replace all occurrences of baseDir with '.' in a text string. */
export function relativizeText(text, baseDir) {
  if (!text || !baseDir) return text
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '')
  return text.replaceAll(base, '.')
}
