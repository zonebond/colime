import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ImageWithPlaceholder from './ImageWithPlaceholder'
import UrlText from './UrlText'
import CodeBlock from './CodeBlock'
import styles from './AssistantMarkdown.module.css'

const PASTED_PATTERN = /\[Pasted\s+~?\d+\s+lines?\]/g

export default memo(function AssistantMarkdown({ content, className = '', inline = false }) {
  const RootTag = inline ? 'span' : 'div'
  const cleanContent = content?.replace(PASTED_PATTERN, '').trim() || content
  const renderImage = ({ src, alt }) => <ImageWithPlaceholder src={src} alt={alt} />
  const renderParagraph = ({ node, children }) => {
    const hasImageChild = node?.children?.some((child) => child.tagName === 'img')

    if (hasImageChild) {
      return <div className={styles.markdownParagraphBlock}>{children}</div>
    }

    if (typeof children === 'string') {
      return inline
        ? <span className={styles.inlineMarkdownParagraph}><UrlText text={children} /></span>
        : <p><UrlText text={children} /></p>
    }

    return inline
      ? <span className={styles.inlineMarkdownParagraph}>{children}</span>
      : <p>{children}</p>
  }

  return (
    <RootTag className={`${styles.responseMarkdown} ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[]}
        components={{
          a: ({ node, sourcePosition, index, siblingCount, ...rest }) => <a {...rest} target="_blank" rel="noreferrer" className={styles.markdownLink} />,
          img: ({ src, alt }) => renderImage({ src, alt }),
          p: renderParagraph,
          blockquote: ({ children }) => <blockquote className={styles.blockquote}>{children}</blockquote>,
          code: ({ className, children, node, sourcePosition, index, siblingCount, ...rest }) => {
            const isFencedBlock = className && /language-/.test(className)
            return isFencedBlock
              ? <code {...rest} className={`${styles.codeInlineBlock} ${className}`.trim()}>{children}</code>
              : <code {...rest} className={styles.inlineCode}>{children}</code>
          },
          hr: () => <hr className={styles.markdownRule} />,
          input: ({ checked, node, sourcePosition, index, siblingCount, ...rest }) => (
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className={styles.taskCheckbox}
              {...rest}
            />
          ),
          li: ({ children, className, node, sourcePosition, index, siblingCount, ...rest }) => {
            const hasCheckbox = className?.includes('task-list-item')
            return (
              <li className={`${hasCheckbox ? styles.taskItem : ''} ${className || ''}`.trim()} {...rest}>
                {children}
              </li>
            )
          },
          pre: ({ children, node, sourcePosition, index, siblingCount, ...rest }) => {
            const codeChild = Array.isArray(children) ? children[0] : children
            const codeClassName = codeChild?.props?.className || ''
            return <CodeBlock className={codeClassName}>{codeChild?.props?.children || children}</CodeBlock>
          },
          table: ({ children }) => <div className={styles.tableWrap}><table className={styles.markdownTable}>{children}</table></div>,
          th: ({ children }) => <th className={styles.markdownTh}>{children}</th>,
          td: ({ children }) => <td className={styles.markdownTd}>{children}</td>,
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </RootTag>
  )
})
