import { describe, it, expect } from 'vitest'
import { en } from '@/i18n/en'
import { zh } from '@/i18n/zh'

function flattenKeys(obj, prefix = '') {
  const keys = []
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') {
      keys.push(...flattenKeys(value, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

describe('i18n key parity', () => {
  const enKeys = flattenKeys(en)
  const zhKeys = flattenKeys(zh)

  it('zh has every en key', () => {
    const zhSet = new Set(zhKeys)
    const missing = enKeys.filter((key) => !zhSet.has(key))
    expect(missing).toEqual([])
  })

  it('en has every zh key', () => {
    const enSet = new Set(enKeys)
    const missing = zhKeys.filter((key) => !enSet.has(key))
    expect(missing).toEqual([])
  })

  it('no empty translation values', () => {
    function findEmpty(obj, prefix = '') {
      const empty = []
      for (const [key, value] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object') {
          empty.push(...findEmpty(value, path))
        } else if (typeof value !== 'string' || value.length === 0) {
          empty.push(path)
        }
      }
      return empty
    }
    expect(findEmpty(en)).toEqual([])
    expect(findEmpty(zh)).toEqual([])
  })
})
