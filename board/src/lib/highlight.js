let highlighter = null
let engineModule = null
let initPromise = null
let currentTheme = 'catppuccin-latte'

export async function getHighlighter() {
  if (highlighter) return highlighter
  if (initPromise) return initPromise

  initPromise = import('./highlight-engine.js').then(async (mod) => {
    engineModule = mod
    highlighter = await mod.createEngine()
    return highlighter
  })

  return initPromise
}

/**
 * Ensure the highlighter is ready AND the given language's grammar is
 * loaded, lazy-fetching it on first use. Unknown languages resolve
 * without loading anything — highlightSync falls back to plain text.
 */
export async function ensureLanguage(lang) {
  const h = await getHighlighter()
  if (!lang) return h

  const key = lang.toLowerCase()
  if (h.getLoadedLanguages().includes(key)) return h

  const loader = engineModule.LANG_LOADERS[key]
  if (loader) {
    const grammar = await loader()
    await h.loadLanguage(grammar.default)
  }
  return h
}

export function setHighlightTheme(isDark) {
  currentTheme = isDark ? 'catppuccin-mocha' : 'catppuccin-latte'
}

export function highlightSync(code, lang) {
  if (!highlighter) return null
  const key = lang ? lang.toLowerCase() : 'text'
  // 'text' is shiki's built-in plaintext language, always available.
  const safeLang = highlighter.getLoadedLanguages().includes(key) ? key : 'text'
  return highlighter.codeToHtml(code, { lang: safeLang, theme: currentTheme })
}
