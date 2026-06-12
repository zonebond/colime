let highlighter = null
let initPromise = null
let currentTheme = 'catppuccin-latte'

export async function getHighlighter() {
  if (highlighter) return highlighter
  if (initPromise) return initPromise

  initPromise = import('./highlight-engine.js').then(async (mod) => {
    highlighter = await mod.createEngine()
    return highlighter
  })

  return initPromise
}

export function setHighlightTheme(isDark) {
  currentTheme = isDark ? 'catppuccin-mocha' : 'catppuccin-latte'
}

export function highlightSync(code, lang) {
  if (!highlighter) return null
  const loaded = highlighter.getLoadedLanguages()
  const safeLang = lang && loaded.includes(lang) ? lang : loaded[0]
  return highlighter.codeToHtml(code, { lang: safeLang, theme: currentTheme })
}
