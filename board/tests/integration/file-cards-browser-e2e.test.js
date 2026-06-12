/**
 * Real browser E2E tests for file-card rendering.
 *
 * Opens actual session pages in Playwright and verifies:
 * 1. File cards RENDER in the DOM when they should
 * 2. File cards are correctly POSITIONED between content and footer
 * 3. File cards do NOT render when they shouldn't
 * 4. Correct files are shown (tool scripts excluded, mentioned PDFs included)
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = 'http://localhost:5090'

// Session URLs and their expected file-card behavior
const SESSIONS = {
  // Has write/edit tools → should show .md cards on group-last messages
  industrialAI: {
    id: 'ses_15aa530e8ffetUL4d5CeL4TnVf',
    name: '工业AI报告',
    // At least 3 groups should have file cards with .md or .pdf
    // convert_md_to_pdf.py should NOT appear (tool script excluded)
    expectedFilesOnCards: ['AI工业领域商业演进闭环报告.md', '开源工业AI营收模型深度分析.md', '开源工业AI营收模型深度分析.pdf'],
    forbiddenOnCards: ['convert_md_to_pdf.py', '转换脚本.py'],
  },
  // Simple single-file write → should show one card
  travelPlan: {
    id: 'ses_158858ee2ffefU7jNidAKfyjw1',
    name: '家庭旅行计划',
    expectedFilesOnCards: ['我的家庭旅行计划_北京.md'],
    forbiddenOnCards: [],
  },
  // Pure Q&A, no file tools → should have NO cards
  weather: {
    id: 'ses_19aa8fb3dffefe83kX0aOMF5YJ',
    name: '西安天气查询',
    expectNoCards: true,
  },
}

/** Collect all file-card filenames visible on the page */
async function collectCardFiles(page) {
  return page.evaluate(() => {
    const cards = document.querySelectorAll('[class*="producedFiles"]')
    const results = []
    for (const section of cards) {
      const fileNames = []
      const cardEls = section.querySelectorAll('[class*="producedFileName"]')
      for (const el of cardEls) {
        fileNames.push(el.textContent.trim())
      }
      const footer = section.parentElement?.querySelector('[class*="responseFooter"]')
      const hasFooterAfter = !!(
        footer &&
        section.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING
      )
      // Check: is producedFiles BETWEEN responseBlockContent and responseFooter?
      const parent = section.parentElement
      const content = parent?.querySelector('[class*="responseBlockContent"]')
      const hasContentBefore = !!(
        content &&
        content.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING
      )
      results.push({ fileNames, hasFooterAfter, hasContentBefore, sectionIndex: Array.from(parent.children).indexOf(section) })
    }
    return results
  })
}

/** Verify card position: producedFiles must be AFTER responseBlockContent and BEFORE responseFooter */
async function verifyCardPositions(page) {
  return page.evaluate(() => {
    const sections = document.querySelectorAll('[class*="responseBlock"]')
    const violations = []
    for (const section of sections) {
      if (!section.className?.includes('responseBlock') || section.className?.includes('responseBlockContent')) continue
      const children = Array.from(section.children)
      const pfIdx = children.findIndex(c => c.className?.includes('producedFiles'))
      const footerIdx = children.findIndex(c => c.className?.includes('responseFooter'))
      const contentIdx = children.findIndex(c => c.className?.includes('responseBlockContent'))

      if (pfIdx === -1) continue // no producedFiles in this section

      // Must be after content, before footer
      if (contentIdx !== -1 && pfIdx <= contentIdx) {
        violations.push(`producedFiles (idx ${pfIdx}) must be AFTER content (idx ${contentIdx})`)
      }
      if (footerIdx !== -1 && pfIdx >= footerIdx) {
        violations.push(`producedFiles (idx ${pfIdx}) must be BEFORE footer (idx ${footerIdx})`)
      }
    }
    return violations
  })
}

/** Get all filenames that are currently displayed on file cards */
async function getAllCardFileNames(page) {
  return page.evaluate(() => {
    const names = document.querySelectorAll('[class*="producedFileName"]')
    return Array.from(names).map(el => el.textContent.trim())
  })
}

// ─── Test Suite ───────────────────────────────────────────────────────

describe('File Cards — Real Browser E2E', { concurrency: 1 }, () => {
  /** @type {import('playwright').Browser} */
  let browser
  /** @type {import('playwright').Page} */
  let page

  before(async () => {
    browser = await chromium.launch({ headless: true })
  })

  after(async () => {
    if (browser) await browser.close()
  })

  // ── Session: 工业AI报告 (complex: write + edit + shell → PDF) ─────

  describe('Session: 工业AI报告 (write/edit/shell → .md + .pdf)', () => {
    before(async () => {
      page = await browser.newPage()
      await page.goto(`${BASE}/chats/${SESSIONS.industrialAI.id}`, { waitUntil: 'networkidle' })
      // Wait for React to hydrate and diskLookup to resolve
      await page.waitForTimeout(3000)
    })

    after(async () => {
      if (page) await page.close()
    })

    it('renders file cards somewhere on the page', async () => {
      const cardSections = await collectCardFiles(page)
      assert.ok(cardSections.length > 0, 'Should have at least one producedFiles section')
    })

    it('file cards are positioned between content and footer', async () => {
      const violations = await verifyCardPositions(page)
      assert.deepStrictEqual(violations, [], `Position violations: ${violations.join('; ')}`)
    })

    it('shows expected target files', async () => {
      const allNames = await getAllCardFileNames(page)
      for (const expected of SESSIONS.industrialAI.expectedFilesOnCards) {
        assert.ok(
          allNames.includes(expected),
          `Expected "${expected}" on file cards, got: [${allNames.join(', ')}]`
        )
      }
    })

    it('excludes tool scripts consumed by shell commands', async () => {
      const allNames = await getAllCardFileNames(page)
      for (const forbidden of SESSIONS.industrialAI.forbiddenOnCards) {
        assert.ok(
          !allNames.includes(forbidden),
          `"${forbidden}" should NOT appear on file cards (tool script), but it does. Cards: [${allNames.join(', ')}]`
        )
      }
    })

    it('every producedFiles section has a corresponding responseFooter after it', async () => {
      const cards = await collectCardFiles(page)
      for (const card of cards) {
        assert.ok(card.hasFooterAfter, 'Each producedFiles section must have a responseFooter after it')
      }
    })
  })

  // ── Session: 家庭旅行计划 (simple single-file write) ──────────────

  describe('Session: 家庭旅行计划 (single write tool)', () => {
    before(async () => {
      page = await browser.newPage()
      await page.goto(`${BASE}/chats/${SESSIONS.travelPlan.id}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
    })

    after(async () => {
      if (page) await page.close()
    })

    it('renders the expected file card', async () => {
      const allNames = await getAllCardFileNames(page)
      assert.ok(
        allNames.includes('我的家庭旅行计划_北京.md'),
        `Expected travel plan file, got: [${allNames.join(', ')}]`
      )
    })

    it('file card is positioned correctly (content → card → footer)', async () => {
      const violations = await verifyCardPositions(page)
      assert.deepStrictEqual(violations, [], `Position violations: ${violations.join('; ')}`)
    })
  })

  // ── Session: 西安天气查询 (pure Q&A, no files) ────────────────────

  describe('Session: 西安天气查询 (pure Q&A — no file cards)', () => {
    before(async () => {
      page = await browser.newPage()
      await page.goto(`${BASE}/chats/${SESSIONS.weather.id}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
    })

    after(async () => {
      if (page) await page.close()
    })

    it('renders ZERO file cards for a pure Q&A session', async () => {
      const allNames = await getAllCardFileNames(page)
      assert.deepStrictEqual(
        allNames, [],
        `Expected no file cards, but found: [${allNames.join(', ')}]`
      )
    })

    it('still renders responseFooter for text-only messages', async () => {
      const footerCount = await page.evaluate(() =>
        document.querySelectorAll('[class*="responseFooter"]').length
      )
      assert.ok(footerCount > 0, 'Text-only messages should still have responseFooter')
    })
  })

  // ── General: card DOM structure ────────────────────────────────────

  describe('General: card DOM structure verification', () => {
    before(async () => {
      page = await browser.newPage()
      await page.goto(`${BASE}/chats/${SESSIONS.industrialAI.id}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
    })

    after(async () => {
      if (page) await page.close()
    })

    it('each card has an icon, filename, and type label', async () => {
      const structure = await page.evaluate(() => {
        const cards = document.querySelectorAll('[class*="producedFileCard"]')
        return Array.from(cards).map(card => ({
          hasIcon: !!card.querySelector('[class*="producedFileIcon"]'),
          hasName: !!card.querySelector('[class*="producedFileName"]'),
          hasMeta: !!card.querySelector('[class*="producedFileMeta"]'),
          fileName: card.querySelector('[class*="producedFileName"]')?.textContent,
          typeLabel: card.querySelector('[class*="producedFileMeta"]')?.textContent,
        }))
      })
      assert.ok(structure.length > 0, 'Should have at least one card')
      for (const card of structure) {
        assert.ok(card.hasIcon, `Card "${card.fileName}" missing icon`)
        assert.ok(card.hasName, `Card "${card.fileName}" missing filename`)
        assert.ok(card.hasMeta, `Card "${card.fileName}" missing type/meta label`)
        assert.ok(card.typeLabel?.length > 0, `Card "${card.fileName}" has empty type label`)
      }
    })

    it('"View all files" button exists below each file grid', async () => {
      const viewAllButtons = await page.evaluate(() =>
        document.querySelectorAll('[class*="producedFilesViewAll"]').length
      )
      const cardSections = await page.evaluate(() =>
        document.querySelectorAll('[class*="producedFilesGrid"]').length
      )
      assert.strictEqual(
        viewAllButtons,
        cardSections,
        `Each producedFiles section should have a "View all files" button`
      )
    })
  })

  // ── Edge: no cards render on intermediate (non-last) messages ──────

  describe('Edge: only last message in group gets cards', () => {
    before(async () => {
      page = await browser.newPage()
      await page.goto(`${BASE}/chats/${SESSIONS.industrialAI.id}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)
    })

    after(async () => {
      if (page) await page.close()
    })

    it('no message shows both producedFiles AND lacks a responseFooter', async () => {
      // Every section that has producedFiles must also have responseFooter
      const orphans = await page.evaluate(() => {
        const sections = document.querySelectorAll('[class*="responseBlock"]')
        const result = []
        for (const s of sections) {
          if (s.className?.includes('responseBlockContent')) continue
          const pf = s.querySelector('[class*="producedFiles"]')
          const footer = s.querySelector('[class*="responseFooter"]')
          if (pf && !footer) {
            result.push(s.className)
          }
        }
        return result
      })
      assert.deepStrictEqual(orphans, [], 'No section should have producedFiles without responseFooter')
    })
  })
})
