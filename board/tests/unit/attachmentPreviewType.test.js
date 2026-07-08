import { describe, it, expect } from 'vitest'
import { getAttachmentPreviewType } from '@/components/attachments/AttachmentCard'

const byName = (name) => getAttachmentPreviewType({ name, type: '' })

describe('getAttachmentPreviewType', () => {
  it('classifies .NET and other dev files as code', () => {
    expect(byName('PluginEntry.cs')).toBe('code')
    expect(byName('nx-cam-plugin.csproj')).toBe('code')
    expect(byName('StartPlugin.vb')).toBe('code')
    expect(byName('deploy.ps1')).toBe('code')
    expect(byName('App.vue')).toBe('code')
    expect(byName('build.gradle')).toBe('code')
  })

  it('classifies plain text formats', () => {
    expect(byName('requirements.txt')).toBe('text')
    expect(byName('server.log')).toBe('text')
    expect(byName('.gitignore')).toBe('text')
  })

  it('classifies binary document formats', () => {
    expect(byName('report.pdf')).toBe('pdf')
    expect(byName('doc.docx')).toBe('docx')
    expect(byName('data.xlsx')).toBe('sheet')
    expect(byName('data.csv')).toBe('csv')
  })

  it('falls back to file for unknown types', () => {
    expect(byName('archive.zip')).toBe('file')
    expect(byName('binary.exe')).toBe('file')
  })
})
