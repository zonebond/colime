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

  it('classifies compressed bundles as archive (never previewed)', () => {
    expect(byName('archive.zip')).toBe('archive')
    expect(byName('backup.tar.gz')).toBe('archive')
    expect(byName('data.tgz')).toBe('archive')
    expect(byName('release.7z')).toBe('archive')
    expect(byName('old.rar')).toBe('archive')
  })

  it('code extensions win over the generic text/* mime', () => {
    expect(getAttachmentPreviewType({ name: 'page.html', type: 'text/html' })).toBe('code')
    expect(getAttachmentPreviewType({ name: 'style.css', type: 'text/css' })).toBe('code')
    expect(getAttachmentPreviewType({ name: 'note.txt', type: 'text/plain' })).toBe('text')
  })

  it('falls back to file for unknown types', () => {
    expect(byName('binary.exe')).toBe('file')
  })
})
