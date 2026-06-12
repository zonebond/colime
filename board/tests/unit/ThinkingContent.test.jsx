import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ThinkingContent from '../../src/components/chats/content-blocks/ThinkingContent'

describe('ThinkingContent', () => {
  it('returns null for empty content', () => {
    const { container } = render(<ThinkingContent content="" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders plain text without cursor when done', () => {
    render(<ThinkingContent content="Just a short text" isStreaming={false} />)
    expect(screen.getByText('Just a short text')).toBeInTheDocument()
    expect(document.querySelector('[class*="thinkingContentDone"]')).toBeTruthy()
  })

  it('renders with cursor when streaming plain text', () => {
    render(<ThinkingContent content="Streaming text" isStreaming={true} />)
    expect(screen.getByText(/Streaming text/)).toBeInTheDocument()
    expect(document.querySelector('[class*="thinkingContentStreaming"]')).toBeTruthy()
    expect(document.querySelector('[class*="thinkingCursor"]')).toBeTruthy()
  })

  it('renders markdown content in markdown wrapper', () => {
    const md = '# Heading\n\n**bold** text with `code`'
    render(<ThinkingContent content={md} />)
    expect(screen.getByText(/# Heading/)).toBeInTheDocument()
    expect(document.querySelector('[class*="thinkingMarkdown"]')).toBeTruthy()
  })

  it('detects code fence as markdown even if short', () => {
    render(<ThinkingContent content="```js\nx\n```" />)
    expect(document.querySelector('[class*="thinkingMarkdown"]')).toBeTruthy()
  })

  it('shows cursor for streaming markdown', () => {
    render(<ThinkingContent content="# Title" isStreaming={true} />)
    expect(document.querySelector('[class*="thinkingCursor"]')).toBeTruthy()
  })

  it('applies custom className', () => {
    render(<ThinkingContent content="text" className="custom" />)
    expect(document.querySelector('.custom')).toBeTruthy()
  })
})
