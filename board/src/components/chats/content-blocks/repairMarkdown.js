import remend from 'remend'

class LRUCache {
  constructor(maxSize = 200) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get(key) {
    if (!this.cache.has(key)) return undefined
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }
}

const cache = new LRUCache(200)

/**
 * Repair streaming markdown using remend's self-healing:
 * - Closes unclosed **bold**, *italic*, `code`, ~~strikethrough~~
 * - Repairs incomplete [links](url), ![images](url)
 * - Handles $$block math$$, $inline math$ (opt-in)
 *
 * Results are LRU-cached to avoid re-processing the same intermediate text.
 */
export function repairMarkdown(text) {
  if (!text) return text

  const cached = cache.get(text)
  if (cached !== undefined) return cached

  const repaired = remend(text)

  cache.set(text, repaired)
  return repaired
}
