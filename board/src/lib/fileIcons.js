import {
  File,
  FileText,
  FileCode,
  FileImage,
  FileArchive,
  FileVideo,
  FileAudio,
  FilePdf,
  FileCsv,
  FileCloud,
} from '@phosphor-icons/react'

const ICON_MAP = {
  // Use specific icons where Phosphor provides them; fall back to
  // semantic categories for the rest.
  csv: FileCsv,
  pdf: FilePdf,

  // Code
  js: FileCode, jsx: FileCode, mjs: FileCode, cjs: FileCode,
  ts: FileCode, tsx: FileCode, mts: FileCode, cts: FileCode,
  css: FileCode, scss: FileCode, sass: FileCode, less: FileCode,
  html: FileCode, htm: FileCode,
  vue: FileCode, svelte: FileCode,
  py: FileCode, rb: FileCode, go: FileCode, rs: FileCode, java: FileCode,
  kt: FileCode, swift: FileCode, c: FileCode, cpp: FileCode, h: FileCode, hpp: FileCode,
  cs: FileCode,
  php: FileCode, r: FileCode, lua: FileCode, zig: FileCode,
  sh: FileCode, bash: FileCode, zsh: FileCode, fish: FileCode,
  sql: FileCode,
  json: FileCode, yaml: FileCode, yml: FileCode, toml: FileCode, xml: FileCode,
  env: FileCode, ini: FileCode, cfg: FileCode, conf: FileCode,
  xls: FileCode, xlsx: FileCode,

  // Documents
  md: FileText, mdx: FileText, txt: FileText, log: FileText,
  doc: FileText, docx: FileText, ppt: FileText, pptx: FileText,

  // Images
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
  svg: FileImage, webp: FileImage, ico: FileImage, bmp: FileImage,
  avif: FileImage, apng: FileImage, tiff: FileImage, tif: FileImage,

  // Archives
  zip: FileArchive, tar: FileArchive, gz: FileArchive, bz2: FileArchive,
  xz: FileArchive, '7z': FileArchive, rar: FileArchive, zst: FileArchive,

  // Media
  mp4: FileVideo, avi: FileVideo, mov: FileVideo, webm: FileVideo,
  mkv: FileVideo, flv: FileVideo, wmv: FileVideo,
  mp3: FileAudio, wav: FileAudio, ogg: FileAudio, flac: FileAudio,
  aac: FileAudio, wma: FileAudio, m4a: FileAudio, weba: FileAudio,

  // Lockfiles / configs
  lock: FileText, gitignore: FileText, dockerfile: FileText,
  eslintrc: FileCode, prettierrc: FileCode,
}

/**
 * Get a Phosphor icon component for the given filename or extension.
 * Falls back to FileCloud for unknown types, File for directories.
 */
export function getFileIcon(filename, opts = {}) {
  if (!filename) return opts.isDirectory ? File : FileCloud
  if (opts.isDirectory) return File
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext && ICON_MAP[ext]) return ICON_MAP[ext]
  const name = filename.toLowerCase()
  if (ICON_MAP[name]) return ICON_MAP[name]
  return FileCloud
}

/**
 * Get a color for the given filename/extension.
 * Returns a CSS color string.
 */
export function getFileColor(filename) {
  if (!filename) return 'var(--txt3)'
  const ext = filename.split('.').pop()?.toLowerCase()

  // PDF — iconic red
  if (ext === 'pdf') return '#ef4444'

  // Documents (Word-style blue)
  if (['doc', 'docx', 'md', 'mdx', 'txt', 'log', 'ppt', 'pptx'].includes(ext)) return '#2563eb'

  // Spreadsheets (Excel-style green)
  if (['csv', 'xls', 'xlsx'].includes(ext)) return '#16a34a'

  // Images (orange)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif', 'apng', 'tiff', 'tif'].includes(ext)) return '#f59e0b'

  // Archives (brown)
  if (['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'zst'].includes(ext)) return '#78716c'

  // Code — language-specific
  if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return '#f0db4f'
  if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return '#3178c6'
  if (ext === 'css' || ext === 'scss' || ext === 'sass' || ext === 'less') return '#06b6d4'
  if (ext === 'html' || ext === 'htm') return '#e44d26'
  if (ext === 'vue') return '#42b883'
  if (ext === 'py') return '#3776ab'
  if (ext === 'rb') return '#cc342d'
  if (ext === 'go') return '#00add8'
  if (ext === 'rs') return '#dea584'
  if (ext === 'sql') return '#f59e0b'
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh' || ext === 'fish') return '#4eaa25'
  if (ext === 'json' || ext === 'yaml' || ext === 'yml') return '#8bc34a'

  // Code generics
  const codeExts = ['php', 'r', 'lua', 'zig', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp', 'java', 'cs', 'toml', 'xml', 'env', 'ini', 'cfg', 'conf']
  if (codeExts.includes(ext)) return '#6b7280'

  // Audio
  if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a', 'weba'].includes(ext)) return '#8b5cf6'

  // Video
  if (['mp4', 'avi', 'mov', 'webm', 'mkv', 'flv', 'wmv'].includes(ext)) return '#ec4899'

  return 'var(--txt3)'
}

export default ICON_MAP
