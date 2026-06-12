import { useMemo } from 'react'
import AssistantMarkdown from './AssistantMarkdown'
import usePacedText from './usePacedText'
import { repairMarkdown } from './repairMarkdown'

export default function PacedMarkdown({ content, isStreaming, className }) {
  const pacedContent = usePacedText(content || '', isStreaming)
  const repairedContent = useMemo(
    () => isStreaming ? repairMarkdown(pacedContent) : pacedContent,
    [pacedContent, isStreaming]
  )

  return (
    <AssistantMarkdown content={repairedContent} className={className} />
  )
}
