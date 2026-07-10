import { describe, it, expect } from 'vitest'
import {
  parseTableRow,
  isMarkdownTableRow,
  isTableSeparator,
  parseTableContent,
  hasTableStructure,
} from '@/components/chats/content-blocks/helpers'

describe('streaming table recognition', () => {
  describe('isMarkdownTableRow', () => {
    it('accepts complete rows', () => {
      expect(isMarkdownTableRow('| a | b |')).toBe(true)
      expect(isMarkdownTableRow('|a|b|')).toBe(true)
    })

    it('accepts the row currently being streamed (no closing pipe)', () => {
      expect(isMarkdownTableRow('| foo')).toBe(true)
      expect(isMarkdownTableRow('| foo | bar')).toBe(true)
    })

    it('rejects blanks and lone pipes', () => {
      expect(isMarkdownTableRow('')).toBe(false)
      expect(isMarkdownTableRow('|')).toBe(false)
      expect(isMarkdownTableRow('not a table')).toBe(false)
    })
  })

  describe('parseTableRow', () => {
    it('parses complete rows', () => {
      expect(parseTableRow('| a | b | c |')).toEqual(['a', 'b', 'c'])
    })

    it('preserves the last cell when the trailing pipe is missing', () => {
      expect(parseTableRow('| foo | bar')).toEqual(['foo', 'bar'])
      expect(parseTableRow('| 1 | 2 | 3')).toEqual(['1', '2', '3'])
    })

    it('handles a single-cell streaming row', () => {
      expect(parseTableRow('| streaming')).toEqual(['streaming'])
    })
  })

  describe('isTableSeparator', () => {
    it('accepts full separators', () => {
      expect(isTableSeparator('|---|---|')).toBe(true)
      expect(isTableSeparator('| :--- | ---: |')).toBe(true)
    })

    it('accepts partial separators during streaming', () => {
      expect(isTableSeparator('|--')).toBe(true)
      expect(isTableSeparator('|---|--')).toBe(true)
    })

    it('rejects lines without a dash', () => {
      expect(isTableSeparator('| a | b |')).toBe(false)
      expect(isTableSeparator('|')).toBe(false)
    })
  })

  describe('parseTableContent + hasTableStructure', () => {
    it('detects a table as soon as the separator starts', () => {
      const midStream = '| A | B |\n|-'
      expect(hasTableStructure(midStream)).toBe(true)
      const parsed = parseTableContent(midStream)
      expect(parsed?.headerCells).toEqual(['A', 'B'])
      expect(parsed?.dataRows).toEqual([])
    })

    it('keeps the actively-streaming last row in dataRows', () => {
      const midStream = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4'
      const parsed = parseTableContent(midStream)
      expect(parsed?.dataRows).toEqual(['| 1 | 2 |', '| 3 | 4'])
      const streamingRow = parsed.dataRows.at(-1)
      expect(isMarkdownTableRow(streamingRow)).toBe(true)
      expect(parseTableRow(streamingRow)).toEqual(['3', '4'])
    })
  })
})
