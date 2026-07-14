import { describe, it, expect } from 'vitest'
import { normalizeMessage } from '../../src/features/chats/normalize'

// Uploaded attachments are sent to ravens as file:// URLs into the session
// directory. When messages come back, those URLs must be converted to a
// session-relative serverPath (browsers refuse to fetch file://) so the
// preview modal can pull the bytes through /file/download.

const DIR = '/root/.local/share/ravens/sessions/ses_test'

function fileMsg(url, overrides = {}) {
  return {
    info: { id: 'msg_1', role: 'user', time: { created: Date.now() } },
    parts: [
      { id: 'prt_1', type: 'file', filename: overrides.filename ?? 'report.html', mime: overrides.mime ?? 'text/html', url },
    ],
  }
}

describe('normalizeMessage attachment serverPath mapping', () => {
  it('converts a file:// URL inside the session directory to a relative serverPath', () => {
    const url = 'file://' + `${DIR}/attachments/report.html`.split('/').map(encodeURIComponent).join('/')
    const msg = normalizeMessage(fileMsg(url), 0, DIR)
    expect(msg.attachments).toHaveLength(1)
    expect(msg.attachments[0].serverPath).toBe('attachments/report.html')
    expect(msg.attachments[0].url).toBeNull()
  })

  it('decodes percent-encoded (CJK) path segments', () => {
    const name = '流水对账表-2.html'
    const url = 'file://' + `${DIR}/attachments/${name}`.split('/').map(encodeURIComponent).join('/')
    const msg = normalizeMessage(fileMsg(url, { filename: name }), 0, DIR)
    expect(msg.attachments[0].serverPath).toBe(`attachments/${name}`)
    expect(msg.attachments[0].url).toBeNull()
  })

  it('keeps the absolute path as serverPath when the directory does not match', () => {
    const url = 'file:///somewhere/else/data.bin'
    const msg = normalizeMessage(fileMsg(url), 0, DIR)
    expect(msg.attachments[0].serverPath).toBe('/somewhere/else/data.bin')
    expect(msg.attachments[0].url).toBeNull()
  })

  it('leaves non-file URLs untouched', () => {
    const msg = normalizeMessage(fileMsg('data:text/plain;base64,aGk='), 0, DIR)
    expect(msg.attachments[0].url).toBe('data:text/plain;base64,aGk=')
    expect(msg.attachments[0].serverPath).toBeUndefined()
  })
})
