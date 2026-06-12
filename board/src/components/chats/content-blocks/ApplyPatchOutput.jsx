import CodeBlock from './CodeBlock'
import FileAccordion from './FileAccordion'
import styles from './ApplyPatchOutput.module.css'

/**
 * Renders apply_patch tool output as a list of file accordions.
 *
 * @param {Object} props
 * @param {import('./applyPatchParser').ApplyPatchFile[]} props.files
 * @param {string} [props.rawOutput] - fallback if no parsed files
 * @param {string} [props.directory] - session directory for download URL context
 */
export default function ApplyPatchOutput({ files, rawOutput, directory = '' }) {
  if (!files || files.length === 0) {
    if (!rawOutput) return null
    return <pre className={styles.fallback}>{rawOutput}</pre>
  }

  if (files.length === 1) {
    const file = files[0]
    return (
      <FileAccordion
        filePath={file.relativePath}
        changeType={file.type}
        additions={file.additions}
        deletions={file.deletions}
        defaultExpanded
        directory={directory}
      >
        {file.patchText ? (
          <CodeBlock language="diff" content={file.patchText} />
        ) : file.afterText ? (
          <CodeBlock content={file.afterText} />
        ) : null}
      </FileAccordion>
    )
  }

  return (
    <div className={styles.list}>
      {files.map((file) => (
        <FileAccordion
          key={file.filePath}
          filePath={file.relativePath}
          changeType={file.type}
          additions={file.additions}
          deletions={file.deletions}
          defaultExpanded={false}
          directory={directory}
        >
          {file.patchText ? (
            <CodeBlock language="diff" content={file.patchText} />
          ) : file.afterText ? (
            <CodeBlock content={file.afterText} />
          ) : null}
        </FileAccordion>
      ))}
    </div>
  )
}
