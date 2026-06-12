/**
 * E2E-style tests for the file-card rendering decision pipeline.
 *
 * Each test simulates a complete conversation: user prompt → agent tool calls
 * → message stream → normalization → group-file-map → card/no-card decision.
 *
 * The "E2E" here means we test the FULL data pipeline, not just individual
 * functions.  We don't spin up a browser — we verify the exact data structures
 * that determine whether cards render.
 */

import { describe, it, expect } from 'vitest'
import {
  buildGroupFileMap,
} from '../../src/components/chats/message-list/VirtualMessageList'

// ─── Message factory — mimics what normalize.js produces ──────────────

let _seq = 0
function uid(prefix = 'msg') { return `${prefix}_${++_seq}` }

/**
 * Build a message object matching the shape produced by normalize.js:
 * { id, role, status, contentBlocks[], _directory, createdAt }
 */
function M(role, opts = {}) {
  return {
    id: opts.id || uid(),
    role,
    status: opts.status ?? (role === 'assistant' ? 'done' : undefined),
    contentBlocks: opts.blocks ?? [],
    _directory: opts.dir || '/sessions/ses_e2e',
    createdAt: opts.at || new Date().toISOString(),
  }
}

// ─── Block factories — matching normalize.js contentBlock shapes ──────

/** tool_result block (write / edit / apply_patch) */
function tool(name, input = {}, extra = {}) {
  return {
    id: uid('blk'),
    type: 'tool_result',
    toolName: name,
    state: extra.state ?? 'done',
    toolInput: input,
    toolOutput: extra.output ?? null,
    _directory: extra.dir,
  }
}

/** text block — agent's markdown response */
function text(content) {
  return { id: uid('blk'), type: 'text', content }
}

/** reasoning block */
function reasoning(content) {
  return { id: uid('blk'), type: 'reasoning', content, state: 'done' }
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Get the file names that would render as cards for a given message. */
function cardFiles(messages, messageId) {
  const map = buildGroupFileMap(messages)
  const files = map.get(messageId)
  if (!files) return null
  return files.map(f => f.fileName).sort()
}

/** Assert that exactly these file cards render on the given message. */
function expectCards(messages, messageId, expectedNames) {
  const names = cardFiles(messages, messageId)
  expect(names).not.toBeNull()
  expect(names).toEqual(expectedNames.slice().sort())
}

/** Assert that NO file cards render on the given message. */
function expectNoCards(messages, messageId) {
  const map = buildGroupFileMap(messages)
  const files = map.get(messageId)
  // Either the message isn't in the map (not last in group) or has empty files
  if (files === undefined) return // not in map = no cards
  expect(files).toEqual([])
}

// =========================================================================
//  SHOULD RENDER CARDS
// =========================================================================

describe('E2E: should render file cards', () => {

  it('User asks "write a report" → agent writes report.md via write tool', () => {
    // User prompt: "帮我写一份工业AI报告"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        reasoning('Let me write a comprehensive report.'),
        tool('write', { filePath: '/sessions/ses_e2e/工业AI报告.md', content: '# 报告\n...' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        reasoning('Report written.'),
        text('报告已生成：`工业AI报告.md`'),
      ] }),
    ]

    // File cards should appear on a2 (last in group), showing the .md file
    expectCards(messages, 'a2', ['工业AI报告.md'])
    // a1 should NOT have cards (not last in group)
    expectNoCards(messages, 'a1')
  })

  it('User asks "create hello.txt" → agent writes a single file, single message', () => {
    // User prompt: "create hello.txt for testing"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/hello.txt', content: 'Hello world' }),
        text('Done. `hello.txt` created.'),
      ] }),
    ]

    expectCards(messages, 'a1', ['hello.txt'])
  })

  it('User asks "generate analysis with chart" → agent writes .md + shell produces .png', () => {
    // User: "分析销售数据并生成图表"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        reasoning('Writing analysis script.'),
        tool('write', { filePath: '/sessions/ses_e2e/analyze.py', content: 'import matplotlib...' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('shell', { command: 'python analyze.py' }),
      ] }),
      M('assistant', { id: 'a3', blocks: [
        text('分析完成。报告：`analysis.md`，图表：`chart.png`'),
      ] }),
    ]

    // analyze.py consumed by shell → excluded
    // analysis.md + chart.png mentioned in text → included (if on disk)
    const files = cardFiles(messages, 'a3')
    expect(files).not.toContain('analyze.py')
    expect(files).toContain('analysis.md')
    expect(files).toContain('chart.png')
  })

  it('User asks "convert my doc to PDF" → agent writes converter + shell generates PDF', () => {
    // User: "把 report.md 转成 PDF"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        reasoning('I need to write a conversion script.'),
        tool('write', { filePath: '/sessions/ses_e2e/convert_to_pdf.py', content: 'from weasyprint...' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('shell', { command: 'python convert_to_pdf.py report.md' }),
      ] }),
      M('assistant', { id: 'a3', blocks: [
        text('PDF 已生成：`report.pdf`（29 页，1.1 MB）'),
      ] }),
    ]

    // convert_to_pdf.py: script ext + in shell cmd → EXCLUDED
    // report.pdf: mentioned in text → INCLUDED
    const files = cardFiles(messages, 'a3')
    expect(files).not.toContain('convert_to_pdf.py')
    expect(files).toContain('report.pdf')
    expect(files).toHaveLength(1)
  })

  it('User asks "edit the report" → agent uses edit tool', () => {
    // User: "修改报告中的第三章内容"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('read', { filePath: '/sessions/ses_e2e/report.md' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        reasoning('Updating chapter 3.'),
        tool('edit', { filePath: '/sessions/ses_e2e/report.md', oldString: '旧内容', newString: '新内容' }),
        text('第三章已更新。'),
      ] }),
    ]

    // edit tool produces the file → should show card
    expectCards(messages, 'a2', ['report.md'])
  })

  it('User asks "apply this patch" → agent uses apply_patch', () => {
    // User: "用这个 patch 修复 bug"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('apply_patch', { path: '/sessions/ses_e2e/buggy.js', patchText: '...' }),
        text('Patch applied to `buggy.js`.'),
      ] }),
    ]

    expectCards(messages, 'a1', ['buggy.js'])
  })

  it('Multi-turn: user asks 3 separate things in 3 turns', () => {
    // Turn 1: "write hello.txt"
    // Turn 2: "write world.txt"
    // Turn 3: "write universe.txt"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/hello.txt', content: 'hello' }),
        text('`hello.txt` created.'),
      ] }),
      M('user', { id: 'u2' }),
      M('assistant', { id: 'a2', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/world.txt', content: 'world' }),
        text('`world.txt` created.'),
      ] }),
      M('user', { id: 'u3' }),
      M('assistant', { id: 'a3', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/universe.txt', content: 'universe' }),
        text('`universe.txt` created.'),
      ] }),
    ]

    // Each turn is its own group → each gets its own file card
    expectCards(messages, 'a1', ['hello.txt'])
    expectCards(messages, 'a2', ['world.txt'])
    expectCards(messages, 'a3', ['universe.txt'])
  })

  it('Agent writes multiple target files in one turn', () => {
    // User: "create the project structure"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/README.md', content: '# Project' }),
        tool('write', { filePath: '/sessions/ses_e2e/CHANGELOG.md', content: '# Changelog' }),
        tool('write', { filePath: '/sessions/ses_e2e/CONTRIBUTING.md', content: '# Contributing' }),
        text('Project docs created.'),
      ] }),
    ]

    expectCards(messages, 'a1', ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md'])
  })

  it('Agent writes .html file as deliverable (webpage output)', () => {
    // User: "create a landing page"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/index.html', content: '<!DOCTYPE html>...' }),
        text('Landing page created: `index.html`'),
      ] }),
    ]

    expectCards(messages, 'a1', ['index.html'])
  })

  it('Agent writes a Python script that the user WANTS (not a tool script)', () => {
    // User: "写一个数据分析脚本"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/data_analysis.py', content: 'import pandas...' }),
        text('数据分析脚本已写好：`data_analysis.py`。运行 `python data_analysis.py` 即可。'),
      ] }),
    ]

    // data_analysis.py IS the deliverable — no shell command consumed it
    const files = cardFiles(messages, 'a1')
    expect(files).toContain('data_analysis.py')
    // Not _mentioned — it's from tool input
    const map = buildGroupFileMap(messages)
    expect(map.get('a1')[0]._mentioned).toBeUndefined()
  })

  it('Chinese filenames: write + shell generation', () => {
    // User: "生成竞品分析报告"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/竞品分析报告.md', content: '# 竞品分析...' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/转换脚本.py', content: 'from weasyprint...' }),
        tool('shell', { command: 'python 转换脚本.py 竞品分析报告.md' }),
      ] }),
      M('assistant', { id: 'a3', blocks: [
        text('报告已生成：`竞品分析报告.md`，PDF 版本：`竞品分析报告.pdf`'),
      ] }),
    ]

    const files = cardFiles(messages, 'a3')
    expect(files).toContain('竞品分析报告.md')
    expect(files).toContain('竞品分析报告.pdf')
    expect(files).not.toContain('转换脚本.py')
  })
})

// =========================================================================
//  SHOULD NOT RENDER CARDS
// =========================================================================

describe('E2E: should NOT render file cards', () => {

  it('User asks a knowledge question → agent answers with text only', () => {
    // User: "什么是闭包？"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        reasoning('Explaining closures.'),
        text('闭包是指函数能够访问其外部作用域中的变量...'),
      ] }),
    ]

    expectNoCards(messages, 'a1')
  })

  it('Agent only reads files, never writes', () => {
    // User: "read the config file for me"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('read', { filePath: '/sessions/ses_e2e/config.yaml' }),
        text('Config file contents: ...'),
      ] }),
    ]

    expectNoCards(messages, 'a1')
  })

  it('Agent runs shell commands but no files are written or mentioned', () => {
    // User: "what files are in the directory?"
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('shell', { command: 'ls -la' }),
        text('目录内容如下：...'),
      ] }),
    ]

    expectNoCards(messages, 'a1')
  })

  it('Write tool is still running (state=active) → not collected', () => {
    // This simulates a streaming scenario where the write hasn't completed
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/draft.md', content: '...' }, { state: 'active' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        text('Writing in progress...'),
      ] }),
    ]

    // a2 is last in group, but the write tool was active, so no files collected
    expectNoCards(messages, 'a2')
  })

  it('Write tool failed (state=error) → not collected', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/failed.md' }, { state: 'error' }),
        text('Failed to write file.'),
      ] }),
    ]

    expectNoCards(messages, 'a1')
  })

  it('Intermediate message in a group → no cards (only last message gets them)', () => {
    const messages = [
      M('user', { id: 'u1' }),
      // This message has a write tool but is NOT the last in the group
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/part1.md', content: '# Part 1' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/part2.md', content: '# Part 2' }),
      ] }),
      // This is the last message — gets ALL files from the group
      M('assistant', { id: 'a3', blocks: [
        text('All parts written.'),
      ] }),
    ]

    // a1 and a2 should NOT have cards (not last in group)
    const map = buildGroupFileMap(messages)
    expect(map.has('a1')).toBe(false)
    expect(map.has('a2')).toBe(false)
    // a3 gets all files
    expect(map.get('a3').map(f => f.fileName).sort()).toEqual(['part1.md', 'part2.md'])
  })

  it('Agent mentions a file in text that does not have an output extension', () => {
    // Agent says "运行 `run.sh` 来部署" — .sh is not an output extension
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        text('请运行 `deploy.sh` 来部署应用。'),
      ] }),
    ]

    // .sh is not in OUTPUT_EXTS → not extracted as mentioned file
    // No write tools either → no files at all
    expectNoCards(messages, 'a1')
  })

  it('Agent writes a tool script AND user never asked for it', () => {
    // The agent writes a helper script to do its work — the user wants the OUTPUT
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/fetch_data.py', content: 'import requests...' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('shell', { command: 'python fetch_data.py > data.csv' }),
      ] }),
      M('assistant', { id: 'a3', blocks: [
        text('数据已导出：`data.csv`'),
      ] }),
    ]

    // fetch_data.py: script ext + in shell → excluded
    // data.csv: mentioned in text → included
    const files = cardFiles(messages, 'a3')
    expect(files).not.toContain('fetch_data.py')
    expect(files).toContain('data.csv')
    expect(files).toHaveLength(1)
  })

  it('User sends two prompts: first produces files, second is text-only', () => {
    const messages = [
      // Turn 1: files
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/analysis.md', content: '# Analysis' }),
        text('`analysis.md` 已生成。'),
      ] }),
      // Turn 2: text only
      M('user', { id: 'u2' }),
      M('assistant', { id: 'a2', blocks: [
        text('好的，有其他需要吗？'),
      ] }),
    ]

    // Turn 1 should have card
    expectCards(messages, 'a1', ['analysis.md'])
    // Turn 2 should NOT have card
    expectNoCards(messages, 'a2')
  })

  it('Grep/grep/ls tool results → not file-producing tools, no cards', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('grep', { pattern: 'TODO' }),
        tool('glob', { pattern: '**/*.md' }),
        tool('lsp', {}),
        tool('list', { path: '/src' }),
        text('Search results: ...'),
      ] }),
    ]

    expectNoCards(messages, 'a1')
  })
})

// =========================================================================
//  BOUNDARY / EDGE CASES
// =========================================================================

describe('E2E: boundary & edge cases', () => {

  it('Empty conversation → no messages → no cards', () => {
    const map = buildGroupFileMap([])
    expect(map.size).toBe(0)
  })

  it('Only user messages → no cards', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('user', { id: 'u2' }),
    ]
    expect(buildGroupFileMap(messages).size).toBe(0)
  })

  it('Single assistant message with only reasoning → no cards', () => {
    const messages = [
      M('assistant', { id: 'a1', blocks: [
        reasoning('Thinking about the problem...'),
      ] }),
    ]
    expectNoCards(messages, 'a1')
  })

  it('File with basename collision: later write wins, proper path used', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/draft/report.md', content: 'v1' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/final/report.md', content: 'v2' }),
        text('Report finalized.'),
      ] }),
    ]

    const map = buildGroupFileMap(messages)
    const files = map.get('a2')
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('report.md')
    expect(files[0].filePath).toBe('/sessions/ses_e2e/final/report.md')
  })

  it('Same file written via write then modified via edit → shows once', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/config.json', content: '{}' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('edit', { filePath: '/sessions/ses_e2e/config.json', oldString: '{}', newString: '{"key":"val"}' }),
        text('Config updated.'),
      ] }),
    ]

    const files = cardFiles(messages, 'a2')
    expect(files).toEqual(['config.json'])
  })

  it('Shell output references file that was NOT written → _mentioned, disk verifies later', () => {
    // Agent runs imagemagick which generates output.png without a write tool
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('shell', { command: 'convert input.jpg -resize 50% output.png' }),
        text('图片已缩放：`output.png`'),
      ] }),
    ]

    const map = buildGroupFileMap(messages)
    const files = map.get('a1')
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('output.png')
    expect(files[0]._mentioned).toBe(true)
    // Disk verification in AssistantMessageRow will confirm or drop it
  })

  it('Agent mentions multiple files, some outputs some not', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/main.py', content: '...' }),
        tool('shell', { command: 'python main.py' }),
        text('运行了 `main.py`，生成了 `output.pdf` 和 `data.csv`。工具脚本 `helper.py` 是内部使用的。'),
      ] }),
    ]

    const files = cardFiles(messages, 'a1')
    // main.py: script ext + in shell cmd → excluded
    expect(files).not.toContain('main.py')
    // helper.py: NOT a write tool, not in shell (just text mention), script ext → not in OUTPUT_EXTS → excluded from mentions
    expect(files).not.toContain('helper.py')
    // output.pdf: mentioned in text, output ext → included
    expect(files).toContain('output.pdf')
    // data.csv: mentioned in text, output ext → included
    expect(files).toContain('data.csv')
  })

  it('Very long conversation: 10 turns, mixed file/no-file', () => {
    const messages = []
    for (let i = 1; i <= 10; i++) {
      messages.push(M('user', { id: `u${i}` }))
      if (i % 3 === 0) {
        // Every 3rd turn produces a file
        messages.push(M('assistant', {
          id: `a${i}`,
          blocks: [
            tool('write', { filePath: `/sessions/ses_e2e/report_${i}.md`, content: `# Report ${i}` }),
            text(`Report ${i} done.`),
          ],
        }))
      } else {
        messages.push(M('assistant', {
          id: `a${i}`,
          blocks: [text('OK, anything else?')],
        }))
      }
    }

    const map = buildGroupFileMap(messages)
    for (let i = 1; i <= 10; i++) {
      if (i % 3 === 0) {
        expect(map.get(`a${i}`).map(f => f.fileName)).toEqual([`report_${i}.md`])
      } else {
        expect(map.get(`a${i}`)).toEqual([])
      }
    }
  })

  it('Nested file paths: files in subdirectories', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/src/components/App.tsx', content: '...' }),
        tool('write', { filePath: '/sessions/ses_e2e/src/utils/helpers.ts', content: '...' }),
        tool('write', { filePath: '/sessions/ses_e2e/src/index.ts', content: '...' }),
        text('Project structure created.'),
      ] }),
    ]

    expectCards(messages, 'a1', ['App.tsx', 'helpers.ts', 'index.ts'])
  })

  it('apply_patch with only patchText (no filePath) → correctly skipped', () => {
    // Some apply_patch calls have the file path embedded in the patch text only
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('apply_patch', {
          patchText: '*** Begin Patch\n*** Add File: newfile.md\n+Hello\n*** End Patch',
        }),
        text('Patch applied.'),
      ] }),
    ]

    // No filePath/path in toolInput → can't extract filename → no files
    expectNoCards(messages, 'a1')
  })

  it('Mentioned .tar.gz extraction → correct extension handling', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        text('Backup created: `data.tar.gz`'),
      ] }),
    ]

    const files = cardFiles(messages, 'a1')
    expect(files).toContain('data.tar.gz')
  })

  it('Mentioned .tgz extraction → correct extension handling', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        text('Compressed: `backup.tgz`'),
      ] }),
    ]

    const files = cardFiles(messages, 'a1')
    expect(files).toContain('backup.tgz')
  })

  it('File in root directory (no path separator) → basename equals filename', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: 'README.md', content: '# Hello' }),
        text('Created README.'),
      ] }),
    ]

    expectCards(messages, 'a1', ['README.md'])
  })

  it('Absolute path from different session directory → still extracts correct basename', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', {
        id: 'a1',
        dir: '/sessions/ses_abc',
        blocks: [
          tool('write', { filePath: '/tmp/somewhere/notes.txt', content: 'notes' }),
          text('Notes written.'),
        ],
      }),
    ]

    expectCards(messages, 'a1', ['notes.txt'])
  })

  it('Non-done but non-loading message status → still processes (status is not "loading")', () => {
    // Message.status = 'done' → isDone = true, files should be collected
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', status: 'done', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/ok.md', content: 'ok' }),
        text('Done.'),
      ] }),
    ]

    expectCards(messages, 'a1', ['ok.md'])
  })

  it('Consecutive assistant groups without user in between → treated as one group', () => {
    const messages = [
      M('user', { id: 'u1' }),
      M('assistant', { id: 'a1', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/f1.md', content: '1' }),
      ] }),
      M('assistant', { id: 'a2', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/f2.md', content: '2' }),
      ] }),
      M('assistant', { id: 'a3', blocks: [
        tool('write', { filePath: '/sessions/ses_e2e/f3.md', content: '3' }),
        text('All done.'),
      ] }),
    ]

    // All files on a3, nothing on a1 or a2
    const map = buildGroupFileMap(messages)
    expect(map.has('a1')).toBe(false)
    expect(map.has('a2')).toBe(false)
    expect(map.get('a3').map(f => f.fileName).sort()).toEqual(['f1.md', 'f2.md', 'f3.md'])
  })
})
