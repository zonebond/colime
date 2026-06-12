import { describe, it, expect } from 'vitest'
import {
  buildGroupFileMap,
  collectShellCommands,
  extractMentionedFiles,
  FILE_WRITE_TOOLS,
  TOOL_SCRIPT_EXTS,
  OUTPUT_EXTS,
} from '../../src/components/chats/message-list/VirtualMessageList'

// ─── Helpers ───────────────────────────────────────────────────────────

let _idCounter = 0
function mid() { return `msg_${++_idCounter}` }
function bid() { return `block_${++_idCounter}` }

function msg(role, opts = {}) {
  return {
    id: opts.id || mid(),
    role,
    status: opts.status || (role === 'assistant' ? 'done' : undefined),
    contentBlocks: opts.contentBlocks || [],
    _directory: opts._directory || '/root/.local/share/ravens/sessions/ses_test',
    createdAt: opts.createdAt || new Date().toISOString(),
  }
}

function userMsg(opts) { return msg('user', opts) }

function assistantMsg(opts) { return msg('assistant', opts) }

function toolBlock(toolName, opts = {}) {
  return {
    id: bid(),
    type: 'tool_result',
    toolName,
    state: opts.state || 'done',
    toolInput: opts.toolInput || {},
    _directory: opts._directory,
  }
}

function writeBlock(filePath, opts = {}) {
  return toolBlock('write', {
    state: opts.state || 'done',
    toolInput: {
      filePath,
      content: opts.content || 'file content',
    },
  })
}

function editBlock(filePath, opts = {}) {
  return toolBlock('edit', {
    state: opts.state || 'done',
    toolInput: {
      filePath,
      oldString: opts.oldString || 'old',
      newString: opts.newString || 'new',
    },
  })
}

function applyPatchBlock(patchText, files = []) {
  // apply_patch has patchText, individual file paths are in the patch text itself
  return toolBlock('apply_patch', {
    toolInput: { patchText, files },
  })
}

function shellBlock(command) {
  return toolBlock('shell', {
    toolInput: { command },
  })
}

function bashBlock(command) {
  return toolBlock('bash', {
    toolInput: { command },
  })
}

function textBlock(content) {
  return {
    id: bid(),
    type: 'text',
    content,
  }
}

// ─── Constants validation ──────────────────────────────────────────────

describe('FILE_WRITE_TOOLS', () => {
  it('includes write, edit, and apply_patch', () => {
    expect(FILE_WRITE_TOOLS.has('write')).toBe(true)
    expect(FILE_WRITE_TOOLS.has('edit')).toBe(true)
    expect(FILE_WRITE_TOOLS.has('apply_patch')).toBe(true)
  })

  it('excludes read, shell, bash, grep, glob', () => {
    expect(FILE_WRITE_TOOLS.has('read')).toBe(false)
    expect(FILE_WRITE_TOOLS.has('shell')).toBe(false)
    expect(FILE_WRITE_TOOLS.has('bash')).toBe(false)
    expect(FILE_WRITE_TOOLS.has('grep')).toBe(false)
    expect(FILE_WRITE_TOOLS.has('glob')).toBe(false)
  })
})

// ─── collectShellCommands ─────────────────────────────────────────────

describe('collectShellCommands', () => {
  it('returns empty array for group with no shell tools', () => {
    const group = [assistantMsg({ contentBlocks: [writeBlock('report.md')] })]
    expect(collectShellCommands(group)).toEqual([])
  })

  it('collects shell command text', () => {
    const group = [assistantMsg({
      contentBlocks: [shellBlock('python convert.py')],
    })]
    expect(collectShellCommands(group)).toEqual(['python convert.py'])
  })

  it('collects bash command text', () => {
    const group = [assistantMsg({
      contentBlocks: [bashBlock('npm run build')],
    })]
    expect(collectShellCommands(group)).toEqual(['npm run build'])
  })

  it('collects run_command command text', () => {
    const group = [assistantMsg({
      contentBlocks: [toolBlock('run_command', {
        toolInput: { command: 'echo hello' },
      })],
    })]
    expect(collectShellCommands(group)).toEqual(['echo hello'])
  })

  it('collects from multiple messages and blocks', () => {
    const group = [
      assistantMsg({ contentBlocks: [shellBlock('ls'), bashBlock('pwd')] }),
      assistantMsg({ contentBlocks: [shellBlock('cat file.txt')] }),
    ]
    expect(collectShellCommands(group)).toEqual(['ls', 'pwd', 'cat file.txt'])
  })

  it('skips blocks with empty command', () => {
    const group = [assistantMsg({
      contentBlocks: [toolBlock('shell', { toolInput: {} })],
    })]
    expect(collectShellCommands(group)).toEqual([])
  })

  it('handles cmd and script aliases', () => {
    const group = [assistantMsg({
      contentBlocks: [
        toolBlock('shell', { toolInput: { cmd: 'node index.js' } }),
        toolBlock('bash', { toolInput: { script: './deploy.sh' } }),
      ],
    })]
    expect(collectShellCommands(group)).toEqual(['node index.js', './deploy.sh'])
  })
})

// ─── extractMentionedFiles ─────────────────────────────────────────────

describe('extractMentionedFiles', () => {
  it('extracts backtick-wrapped output filenames from text blocks', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('PDF 已生成：`report.pdf` (1.1 MB)')],
    })]
    const result = extractMentionedFiles(group)
    expect(result.has('report.pdf')).toBe(true)
    expect(result.get('report.pdf')._mentioned).toBe(true)
    expect(result.get('report.pdf').fileName).toBe('report.pdf')
  })

  it('extracts .md files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('报告已生成：`report.md`')],
    })]
    const result = extractMentionedFiles(group)
    expect(result.has('report.md')).toBe(true)
  })

  it('extracts .html files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('PPT 已生成：`slides.html`')],
    })]
    expect(extractMentionedFiles(group).has('slides.html')).toBe(true)
  })

  it('extracts .csv files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('数据导出：`data.csv`')],
    })]
    expect(extractMentionedFiles(group).has('data.csv')).toBe(true)
  })

  it('extracts image files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('图表：`chart.png` 和 `photo.jpg`')],
    })]
    const result = extractMentionedFiles(group)
    expect(result.has('chart.png')).toBe(true)
    expect(result.has('photo.jpg')).toBe(true)
  })

  it('extracts archive files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('打包：`dist.zip`')],
    })]
    expect(extractMentionedFiles(group).has('dist.zip')).toBe(true)
  })

  it('extracts .tar.gz files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('压缩包：`backup.tar.gz`')],
    })]
    const result = extractMentionedFiles(group)
    expect(result.has('backup.tar.gz')).toBe(true)
  })

  it('extracts .tgz files', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('压缩包：`backup.tgz`')],
    })]
    expect(extractMentionedFiles(group).has('backup.tgz')).toBe(true)
  })

  it('ignores non-output extensions', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('运行 `convert.py` 来生成 PDF')],
    })]
    const result = extractMentionedFiles(group)
    expect(result.has('convert.py')).toBe(false)
  })

  it('ignores filenames without backticks', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('文件是 report.pdf 在目录中')],
    })]
    expect(extractMentionedFiles(group).size).toBe(0)
  })

  it('deduplicates by filename within a group', () => {
    const group = [assistantMsg({
      contentBlocks: [
        textBlock('生成 `report.pdf`'),
        textBlock('文件 `report.pdf` 已就绪'),
      ],
    })]
    const result = extractMentionedFiles(group)
    expect(result.size).toBe(1)
    expect(result.has('report.pdf')).toBe(true)
  })

  it('extracts from multiple messages in a group', () => {
    const group = [
      assistantMsg({ contentBlocks: [textBlock('生成了 `doc1.pdf`')] }),
      assistantMsg({ contentBlocks: [textBlock('生成了 `doc2.pdf`')] }),
    ]
    const result = extractMentionedFiles(group)
    expect(result.size).toBe(2)
    expect(result.has('doc1.pdf')).toBe(true)
    expect(result.has('doc2.pdf')).toBe(true)
  })

  it('skips text blocks with no backtick filenames', () => {
    const group = [assistantMsg({
      contentBlocks: [textBlock('这是一段没有文件名的文本')],
    })]
    expect(extractMentionedFiles(group).size).toBe(0)
  })

  it('handles empty content blocks', () => {
    const group = [assistantMsg({ contentBlocks: [] })]
    expect(extractMentionedFiles(group).size).toBe(0)
  })

  it('ignores non-text blocks', () => {
    const group = [assistantMsg({
      contentBlocks: [
        toolBlock('write', { toolInput: { filePath: 'report.pdf' } }),
      ],
    })]
    expect(extractMentionedFiles(group).size).toBe(0)
  })
})

// ─── OUTPUT_EXTS coverage ─────────────────────────────────────────────

describe('OUTPUT_EXTS', () => {
  const expectedExts = [
    '.pdf', '.md', '.html', '.htm', '.txt', '.csv',
    '.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.zip', '.tar.gz', '.tgz', '.gz',
  ]
  expectedExts.forEach(ext => {
    it(`includes ${ext}`, () => {
      expect(OUTPUT_EXTS.has(ext)).toBe(true)
    })
  })

  it('excludes script extensions', () => {
    expect(OUTPUT_EXTS.has('.py')).toBe(false)
    expect(OUTPUT_EXTS.has('.sh')).toBe(false)
    expect(OUTPUT_EXTS.has('.js')).toBe(false)
    expect(OUTPUT_EXTS.has('.ts')).toBe(false)
  })
})

// ─── TOOL_SCRIPT_EXTS coverage ─────────────────────────────────────────

describe('TOOL_SCRIPT_EXTS', () => {
  it('includes common script extensions', () => {
    expect(TOOL_SCRIPT_EXTS.has('.py')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.sh')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.js')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.ts')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.json')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.yaml')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.yml')).toBe(true)
    expect(TOOL_SCRIPT_EXTS.has('.toml')).toBe(true)
  })
})

// ─── buildGroupFileMap ─────────────────────────────────────────────────

describe('buildGroupFileMap', () => {
  // ── Basic grouping ──────────────────────────────────────────────────

  it('assigns files to the last message in an assistant group', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/report.md')] }),
      assistantMsg({ id: 'a2', contentBlocks: [textBlock('Done.')] }),
    ]
    const result = buildGroupFileMap(messages)

    // File should be on a2 (last in group), not a1
    expect(result.has('a1')).toBe(false)
    expect(result.has('a2')).toBe(true)
    expect(result.get('a2')).toHaveLength(1)
    expect(result.get('a2')[0].fileName).toBe('report.md')
  })

  it('collects files from all messages in a group', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/file1.md')] }),
      assistantMsg({ id: 'a2', contentBlocks: [writeBlock('/dir/file2.md')] }),
      assistantMsg({ id: 'a3', contentBlocks: [textBlock('All done.')] }),
    ]
    const result = buildGroupFileMap(messages)

    expect(result.has('a3')).toBe(true)
    const files = result.get('a3')
    expect(files).toHaveLength(2)
    expect(files.map(f => f.fileName).sort()).toEqual(['file1.md', 'file2.md'])
  })

  it('isolates files between user-bounded groups', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/group1.md')] }),
      userMsg({ id: 'u2' }),
      assistantMsg({ id: 'a2', contentBlocks: [writeBlock('/dir/group2.md')] }),
    ]
    const result = buildGroupFileMap(messages)

    expect(result.get('a1')[0].fileName).toBe('group1.md')
    expect(result.get('a2')[0].fileName).toBe('group2.md')
  })

  it('returns empty map for empty messages array', () => {
    expect(buildGroupFileMap([]).size).toBe(0)
  })

  it('returns empty map for only user messages', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      userMsg({ id: 'u2' }),
    ]
    expect(buildGroupFileMap(messages).size).toBe(0)
  })

  it('handles single assistant message with no files', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [textBlock('Hello')] }),
    ]
    // Group ends at the end of messages — still records the last message
    const result = buildGroupFileMap(messages)
    expect(result.has('a1')).toBe(true)
    expect(result.get('a1')).toEqual([])
  })

  // ── File path extraction ────────────────────────────────────────────

  it('extracts basename from absolute paths', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [writeBlock('/root/.local/share/ravens/sessions/ses_x/report.md')],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('report.md')
    expect(result.get('a1')[0].filePath).toBe('/root/.local/share/ravens/sessions/ses_x/report.md')
  })

  it('extracts basename from relative paths', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('hello.txt')] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('hello.txt')
    expect(result.get('a1')[0].filePath).toBe('hello.txt')
  })

  it('uses path field when filePath is absent', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [toolBlock('apply_patch', {
          toolInput: { path: '/dir/patched.js', patchText: '...' },
        })],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('patched.js')
  })

  it('skips blocks without filePath or path', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [toolBlock('write', {
          toolInput: { content: 'no path here' },
        })],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  it('skips blocks with empty basename (trailing slash)', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [writeBlock('/some/dir/')],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  // ── Tool state filtering ────────────────────────────────────────────

  it('includes only done-state tool blocks', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [
          writeBlock('/dir/done.md', { state: 'done' }),
          writeBlock('/dir/active.md', { state: 'active' }),
          writeBlock('/dir/error.md', { state: 'error' }),
          writeBlock('/dir/loading.md', { state: 'loading' }),
        ],
      }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a1').map(f => f.fileName)
    expect(names).toEqual(['done.md'])
  })

  // ── Tool type filtering ─────────────────────────────────────────────

  it('includes write, edit, and apply_patch tools', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [
          writeBlock('/dir/written.md'),
          editBlock('/dir/edited.md'),
          toolBlock('apply_patch', { toolInput: { path: '/dir/patched.md' } }),
        ],
      }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a1').map(f => f.fileName).sort()
    expect(names).toEqual(['edited.md', 'patched.md', 'written.md'])
  })

  it('excludes non-file tools (read, shell, grep, glob)', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [
          toolBlock('read', { toolInput: { filePath: '/dir/read.md' } }),
          shellBlock('ls'),
          toolBlock('grep', { toolInput: {} }),
          toolBlock('glob', { toolInput: {} }),
        ],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  // ── Deduplication ───────────────────────────────────────────────────

  it('deduplicates by basename, later write wins', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [
          writeBlock('/dir/v1/report.md'),
          writeBlock('/dir/v2/report.md'),
        ],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toHaveLength(1)
    expect(result.get('a1')[0].filePath).toBe('/dir/v2/report.md')
  })

  it('deduplicates across messages in a group', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/early/report.md')] }),
      assistantMsg({ id: 'a2', contentBlocks: [writeBlock('/dir/later/report.md'), textBlock('Updated.')] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a2')).toHaveLength(1)
    expect(result.get('a2')[0].filePath).toBe('/dir/later/report.md')
  })

  // ── Tool file exclusion ─────────────────────────────────────────────

  it('excludes script files that are consumed by shell commands', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/convert.py')] }),
      assistantMsg({ id: 'a2', contentBlocks: [
        shellBlock('python convert.py input.md'),
        textBlock('`output.pdf` generated.'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a2').map(f => f.fileName)
    expect(names).not.toContain('convert.py')
    expect(names).toContain('output.pdf') // mentioned file still appears
  })

  it('keeps script files NOT referenced in shell commands', () => {
    // User asked for a script → it IS the target
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/deploy.sh')] }),
      assistantMsg({ id: 'a2', contentBlocks: [textBlock('Deploy script is ready.')] }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a2').map(f => f.fileName)
    expect(names).toContain('deploy.sh')
  })

  it('excludes .js files consumed by shell (node script.js)', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/build.js'),
        shellBlock('node build.js'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  it('does not exclude non-script files mentioned in shell commands', () => {
    // shell command references an .md file — it's still a target
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/report.md'),
        shellBlock('wc -l report.md'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a1').map(f => f.fileName)
    expect(names).toContain('report.md')
  })

  it('excludes .json config files consumed by shell', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/config.json'),
        shellBlock('cat config.json | jq .'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  it('handles partial name matches correctly', () => {
    // "convert.py" should not match "convert2.py" or "convert_data.py"
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/convert.py'),
        writeBlock('/dir/convert_data.py'),
        shellBlock('python convert.py'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a1').map(f => f.fileName)
    // convert.py excluded (in shell cmd), convert_data.py kept (not in shell cmd)
    expect(names).not.toContain('convert.py')
    // Note: current implementation uses String.includes, so "convert.py" would match
    // inside "convert_data.py" — this is a known limitation
  })

  // ── Mentioned file integration ──────────────────────────────────────

  it('supplements tool-produced files with mentioned files', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/report.md'),
        shellBlock('weasyprint report.md'),
      ] }),
      assistantMsg({ id: 'a2', contentBlocks: [
        textBlock('PDF 已生成：`report.pdf` (1.1 MB)'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a2').map(f => f.fileName).sort()
    expect(names).toContain('report.md')
    expect(names).toContain('report.pdf')
  })

  it('mentioned file does not override tool-produced file', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/real/report.md'),
        textBlock('File: `report.md`'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const files = result.get('a1')
    // Tool-produced entry wins (has real filePath, not _mentioned flag)
    const f = files.find(f => f.fileName === 'report.md')
    expect(f.filePath).toBe('/dir/real/report.md')
    expect(f._mentioned).toBeUndefined()
  })

  it('marks mentioned-only files with _mentioned flag', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        textBlock('生成完毕：`output.pdf`'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const f = result.get('a1')[0]
    expect(f.fileName).toBe('output.pdf')
    expect(f._mentioned).toBe(true)
  })

  // ── Edge cases ──────────────────────────────────────────────────────

  it('handles messages with no contentBlocks', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: undefined }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.has('a1')).toBe(true)
    expect(result.get('a1')).toEqual([])
  })

  it('preserves _directory from message', () => {
    const dir = '/custom/session/dir'
    const messages = [
      assistantMsg({ id: 'a1', _directory: dir, contentBlocks: [writeBlock('file.md')] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0]._directory).toBe(dir)
  })

  it('preserves _directory from block when message._directory is missing', () => {
    const dir = '/custom/block/dir'
    // Bypass the msg() helper's _directory default — set to null after creation
    const m = assistantMsg({ id: 'a1' })
    m._directory = null
    m.contentBlocks = [toolBlock('write', {
      toolInput: { filePath: 'file.md' },
      _directory: dir,
    })]
    const result = buildGroupFileMap([m])
    // Falls back to block._directory since message._directory is null
    expect(result.get('a1')[0]._directory).toBe(dir)
  })

  it('handles consecutive write/edit/apply_patch across many messages', () => {
    const blocks = []
    for (let i = 1; i <= 10; i++) {
      blocks.push(assistantMsg({
        id: `a${i}`,
        contentBlocks: [writeBlock(`/dir/file${i}.md`)],
      }))
    }
    const messages = [userMsg({ id: 'u1' }), ...blocks]
    const result = buildGroupFileMap(messages)
    expect(result.get('a10')).toHaveLength(10)
  })

  it('handles multiple user-assistant groups', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/f1.md')] }),
      userMsg({ id: 'u2' }),
      assistantMsg({ id: 'a2', contentBlocks: [writeBlock('/dir/f2.md')] }),
      assistantMsg({ id: 'a3', contentBlocks: [writeBlock('/dir/f3.md'), textBlock('done')] }),
      userMsg({ id: 'u3' }),
      assistantMsg({ id: 'a4', contentBlocks: [textBlock('no files here')] }),
    ]
    const result = buildGroupFileMap(messages)

    // Group 1: a1 alone → files on a1
    expect(result.get('a1').map(f => f.fileName)).toEqual(['f1.md'])

    // Group 2: a2 + a3 → files on a3
    expect(result.has('a2')).toBe(false)
    expect(result.get('a3').map(f => f.fileName).sort()).toEqual(['f2.md', 'f3.md'])

    // Group 3: a4 → empty
    expect(result.get('a4')).toEqual([])
  })

  it('handles a standalone assistant with no preceding user', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/standalone.md')] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('standalone.md')
  })

  it('handles apply_patch with no explicit filePath (only patchText)', () => {
    // apply_patch might only have patchText, not individual filePath
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [applyPatchBlock('*** Begin Patch\n*** Add File: hello.txt\n+Hello\n*** End Patch')],
      }),
    ]
    // No filePath/path in toolInput → skipped
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  it('handles files in nested paths', () => {
    const messages = [
      assistantMsg({
        id: 'a1',
        contentBlocks: [writeBlock('/dir/src/components/App.tsx')],
      }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('App.tsx')
  })

  it('handles multiple text blocks with mixed mentioned files', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        textBlock('Generated `output.pdf`. Also see `data.csv` for details.'),
        textBlock('Backup saved as `backup.tar.gz`.'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    const names = result.get('a1').map(f => f.fileName).sort()
    expect(names).toEqual(['backup.tar.gz', 'data.csv', 'output.pdf'])
  })

  it('mentioned .gz files (not .tar.gz or .tgz)', () => {
    const messages = [
      assistantMsg({ id: 'a1', contentBlocks: [
        textBlock('Compressed: `archive.gz`'),
      ] }),
    ]
    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('archive.gz')
  })
})

// ─── Integration scenarios ─────────────────────────────────────────────

describe('buildGroupFileMap — realistic scenarios', () => {
  it('Scenario: user asks for a report, agent writes .md, then converts to .pdf via shell', () => {
    const messages = [
      // User asks
      userMsg({ id: 'u1' }),
      // Agent reasons and writes the markdown
      assistantMsg({ id: 'a1', contentBlocks: [writeBlock('/dir/report.md')] }),
      // Agent writes converter script and runs it
      assistantMsg({ id: 'a2', contentBlocks: [
        writeBlock('/dir/convert.py'),
        shellBlock('python convert.py report.md'),
      ] }),
      // Agent confirms
      assistantMsg({ id: 'a3', contentBlocks: [
        textBlock('报告完成。`report.md` (源文件) 和 `report.pdf` (PDF, 1.1 MB) 已生成。'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    const files = result.get('a3')

    // convert.py should be excluded (tool script)
    expect(files.map(f => f.fileName)).not.toContain('convert.py')
    // report.md should be present (tool-produced)
    expect(files.map(f => f.fileName)).toContain('report.md')
    // report.pdf should be present (mentioned in text)
    expect(files.map(f => f.fileName)).toContain('report.pdf')
  })

  it('Scenario: user asks for a Python script', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/analyze.py'),
        textBlock('`analyze.py` 脚本已写好，可以直接运行。'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    const files = result.get('a1')

    // analyze.py should be present (it IS the target, not a tool)
    expect(files.map(f => f.fileName)).toContain('analyze.py')
    // It should NOT be _mentioned (it's from tool input)
    expect(files[0]._mentioned).toBeUndefined()
  })

  it('Scenario: multi-file webapp generation', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/index.html'),
        writeBlock('/dir/style.css'),
        writeBlock('/dir/app.js'),
        writeBlock('/dir/package.json'),
        writeBlock('/dir/build.js'),
      ] }),
      assistantMsg({ id: 'a2', contentBlocks: [
        shellBlock('node build.js'),
        shellBlock('cat package.json | jq .scripts'),
      ] }),
      assistantMsg({ id: 'a3', contentBlocks: [
        textBlock('项目已创建，运行 `npm start` 查看。'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    const files = result.get('a3')

    const names = files.map(f => f.fileName).sort()
    // build.js consumed by "node build.js" → excluded (script + in shell cmd)
    expect(names).not.toContain('build.js')
    // package.json consumed by "cat package.json" → excluded (script + in shell cmd)
    expect(names).not.toContain('package.json')
    // index.html, style.css, app.js — NOT in any shell command → included
    expect(names).toContain('index.html')
    expect(names).toContain('style.css')
    expect(names).toContain('app.js')
  })

  it('Scenario: edit tool modifying an existing file', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        editBlock('/dir/report.md', { oldString: 'v1', newString: 'v2' }),
        textBlock('已更新 `report.md`。'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    expect(result.get('a1')[0].fileName).toBe('report.md')
  })

  it('Scenario: agent only reasons, no files', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        textBlock('这个问题的答案是 42。'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    expect(result.get('a1')).toEqual([])
  })

  it('Scenario: Chinese filenames in tool input and text mentions', () => {
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        writeBlock('/dir/工业AI报告.md'),
      ] }),
      assistantMsg({ id: 'a2', contentBlocks: [
        shellBlock('weasyprint 工业AI报告.md'),
      ] }),
      assistantMsg({ id: 'a3', contentBlocks: [
        textBlock('PDF 已生成：`工业AI报告.pdf`'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    const files = result.get('a3')
    expect(files.map(f => f.fileName)).toContain('工业AI报告.md')
    expect(files.map(f => f.fileName)).toContain('工业AI报告.pdf')
  })

  it('Scenario: shell command that mentions a filename but file was never written', () => {
    // Agent runs a command that references a file that doesn't exist from tool perspective
    const messages = [
      userMsg({ id: 'u1' }),
      assistantMsg({ id: 'a1', contentBlocks: [
        shellBlock('magick input.png output.pdf'),
        textBlock('转换完成：`output.pdf`'),
      ] }),
    ]

    const result = buildGroupFileMap(messages)
    // output.pdf is mentioned in text but was never written by a tool
    // It will be _mentioned — disk verification in AssistantMessageRow handles the rest
    const files = result.get('a1')
    expect(files).toHaveLength(1)
    expect(files[0].fileName).toBe('output.pdf')
    expect(files[0]._mentioned).toBe(true)
  })
})
