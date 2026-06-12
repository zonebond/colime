import { useMemo } from 'react'
import stripAnsi from 'strip-ansi'
import CodeBlock from './CodeBlock'
import FileAccordion from './FileAccordion'
import ApplyPatchOutput from './ApplyPatchOutput'
import DiagnosticsDisplay from './DiagnosticsDisplay'
import AssistantMarkdown from './AssistantMarkdown'
import { relativizeText } from '@/lib/path'
import styles from './ToolOutputSummary.module.css'

function guessLanguage(filePath) {
  if (!filePath) return ''
  const ext = filePath.split('.').pop()?.toLowerCase()
  const map = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
    css: 'css', html: 'html', json: 'json', md: 'markdown',
    sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
    yml: 'yaml', yaml: 'yaml', toml: 'toml',
    java: 'java', kt: 'kotlin', swift: 'swift',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
  }
  return map[ext] || ''
}

export default function ToolOutputSummary({ summary, result, directory }) {
  const content = useMemo(() => {
    if (!summary) return null
    const { type } = summary

    if (type === 'read' && summary.output) {
      const lang = summary.path ? guessLanguage(summary.path) : ''
      return { view: 'code', language: lang, content: summary.output, path: summary.path, loaded: summary.loaded || null }
    }

    if (type === 'bash' && summary.command) {
      const rawOutput = summary.output || result
      return { view: 'bash-output', command: summary.command, output: rawOutput ? stripAnsi(String(rawOutput)).replace(/\r\n?/g, '\n') : null }
    }

    if (type === 'apply-patch') {
      return { view: 'apply-patch', files: summary.files, rawOutput: summary.rawOutput }
    }

    if (type === 'write-edit') {
      return { view: 'write-edit', path: summary.path, action: summary.action, content: summary.content, additions: summary.additions || 0, deletions: summary.deletions || 0, diagnostics: summary.diagnostics || null }
    }

    if (type === 'qa') {
      return { view: 'qa', questions: summary.questions, answers: summary.answers }
    }

    if (type === 'markdown') {
      return { view: 'markdown', output: summary.output }
    }

    if (type === 'lsp') {
      return { view: 'lsp', output: summary.output, operation: summary.operation }
    }

    if (type === 'websearch') {
      return { view: 'websearch', output: summary.output }
    }

    if (type === 'webfetch') {
      return { view: 'webfetch', output: summary.output, url: summary.url, isMarkdown: summary.isMarkdown }
    }

    if (type === 'skill') {
      return { view: 'skill', output: summary.output, name: summary.name }
    }

    if (type === 'task') {
      return { view: 'task', output: summary.output, subagentType: summary.subagentType, sessionId: summary.sessionId }
    }

    if (type === 'memory') {
      return { view: 'memory', output: summary.output, action: summary.action, count: summary.count }
    }

    return null
  }, [summary, result])

  if (!content) {
    // Fallback: render result as formatted text with path relativization
    if (!result) return null
    const raw = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
    const display = directory ? relativizeText(raw, directory) : raw
    return <pre className={styles.fallback}>{display}</pre>
  }

  if (content.view === 'code') {
    return (
      <div className={styles.wrapper}>
        <CodeBlock language={content.language} content={content.content} />
        {content.loaded?.length > 0 && (
          <div className={styles.loadedFiles}>
            <span className={styles.loadedLabel}>Loaded into context:</span>
            {content.loaded.map((f, i) => (
              <span key={i} className={styles.loadedFile}>{f}</span>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (content.view === 'bash-output') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.bashHeader}>
          <code className={styles.bashCommand}>{content.command}</code>
        </div>
        {content.output && (
          <CodeBlock language="bash" content={content.output} />
        )}
      </div>
    )
  }

  if (content.view === 'apply-patch') {
    return (
      <div className={styles.wrapper}>
        <ApplyPatchOutput files={content.files} rawOutput={content.rawOutput} directory={directory} />
      </div>
    )
  }

  if (content.view === 'write-edit') {
    const lang = content.path ? guessLanguage(content.path) : ''
    return (
      <div className={styles.wrapper}>
        <FileAccordion
          filePath={content.path}
          changeType={content.action === 'write' ? 'add' : 'update'}
          additions={content.additions}
          deletions={content.deletions}
          defaultExpanded
          directory={directory}
          contentTruncated={content.contentTruncated || false}
          renderActions={() => (
            <span className={styles.action}>
              {content.action === 'write' ? 'Wrote' : 'Edited'}
            </span>
          )}
        >
          {content.content && (
            <CodeBlock language={lang} content={content.content} />
          )}
        </FileAccordion>
        <DiagnosticsDisplay diagnostics={content.diagnostics} filePath={content.path} />
      </div>
    )
  }

  if (content.view === 'qa') {
    const { questions, answers } = content
    return (
      <div className={styles.qaList}>
        {questions.map((q, i) => {
          const answer = answers?.[i]
          const answerText = Array.isArray(answer) ? answer.join(', ') : (typeof answer === 'string' ? answer : null)
          return (
            <div key={i} className={styles.qaItem}>
              <div className={styles.qaQuestion}>{q.header || q.question}</div>
              <div className={styles.qaAnswer}>
                {answerText || <span className={styles.qaNoAnswer}>Unanswered</span>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (content.view === 'markdown') {
    return (
      <div className={styles.wrapper}>
        <AssistantMarkdown content={content.output} />
      </div>
    )
  }

  if (content.view === 'lsp') {
    return (
      <div className={styles.wrapper}>
        {content.operation && (
          <div className={styles.lspHeader}>
            <span className={styles.lspLabel}>{content.operation}</span>
          </div>
        )}
        <pre className={styles.fallback}>{String(content.output)}</pre>
      </div>
    )
  }

  if (content.view === 'websearch') {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
    const urls = [...new Set(String(content.output).match(urlRegex) || [])]
    return (
      <div className={styles.wrapper}>
        <div className={styles.websearchOutput}>
          {urls.length > 0 && (
            <div className={styles.websearchUrls}>
              <span className={styles.websearchLabel}>Sources:</span>
              {urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={styles.websearchLink}>
                  {url.replace(/^https?:\/\//, '').split('/')[0]}{url.length > 50 ? '…' : ''}
                </a>
              ))}
            </div>
          )}
          <pre className={styles.fallback}>{String(content.output)}</pre>
        </div>
      </div>
    )
  }

  if (content.view === 'webfetch') {
    return (
      <div className={styles.wrapper}>
        {content.url && (
          <div className={styles.webfetchUrl}>
            <a href={content.url} target="_blank" rel="noopener noreferrer" className={styles.webfetchLink}>
              {content.url}
            </a>
          </div>
        )}
        {content.isMarkdown ? (
          <AssistantMarkdown content={content.output} />
        ) : (
          <pre className={styles.fallback}>{String(content.output)}</pre>
        )}
      </div>
    )
  }

  if (content.view === 'skill') {
    return (
      <div className={styles.wrapper}>
        {content.name && (
          <div className={styles.skillHeader}>
            <span className={styles.skillLabel}>Loaded skill: {content.name}</span>
          </div>
        )}
        <pre className={styles.fallback}>{String(content.output)}</pre>
      </div>
    )
  }

  if (content.view === 'task') {
    return (
      <div className={styles.wrapper}>
        {content.subagentType && (
          <div className={styles.taskHeader}>
            <span className={styles.taskLabel}>
              Subagent: {content.subagentType}
            </span>
          </div>
        )}
        <pre className={styles.fallback}>{String(content.output)}</pre>
      </div>
    )
  }

  if (content.view === 'memory') {
    return (
      <div className={styles.wrapper}>
        <pre className={styles.fallback}>{String(content.output)}</pre>
      </div>
    )
  }

  return null
}
