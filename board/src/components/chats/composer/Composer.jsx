import {
  ArrowDown,
  ArrowUp,
  CardsThree,
  CircleNotch,
  GlobeSimple,
  MagnifyingGlass,
  Plus,
  StopCircle,
  Waveform,
  X,
} from '@phosphor-icons/react'
import { useRef } from 'react'
import { useTranslation } from '@/i18n'
import { useNavigate } from 'react-router-dom'
import AgentSelector from '@/components/chats/AgentSelector'
import ComposerAttachMenu from '@/components/composer/ComposerAttachMenu'
import InteractionPanel from '@/components/chats/InteractionPanel'
import ModelSelector from '@/components/chats/ModelSelector'
import AttachmentPreviews from './AttachmentPreviews'
import styles from './Composer.module.css'

export default function Composer({
  wrapRef,
  centered,
  inputRef,
  fileInputRef,
  composerValue,
  onComposerChange,
  onSend,
  attachments,
  exitingAttachments,
  onRemoveAttachment,
  onPreviewAttachment,
  editingMessage,
  replyingToMessage,
  onCancelEdit,
  onCancelReply,
  showScrollButton,
  onScrollToBottom,
  interaction,
  onInteractionRespond,
  onCloseInteraction,
  isSending,
  chatIsResponding,
  onAddFiles,
  showAttachMenu,
  setShowAttachMenu,
  researchMode,
  setResearchMode,
  webSearchMode,
  setWebSearchMode,
  project,
  onRemoveFromProject,
  charCount,
  maxChars,
  estimatedTokens,
  models,
  providers,
  modelsLoading,
  refreshProviders,
  selectedAgentId,
  selectedAgent,
  agents,
  agentsLoading,
  setSelectedAgentId,
  favoriteModels,
  addFavorite,
  removeFavorite,
  showModelDropdown,
  setShowModelDropdown,
  showAgentSelector,
  setShowAgentSelector,
  displayAgent,
  getProviderName,
  getModelName,
  effectiveProviderId,
  effectiveModelId,
  chatId,
  onStop,
  onSelectModel,
  onAddToProject,
  onTakeScreenshot,
  canCaptureScreen,
  hideDisclaimer,
  placeholder,
}) {
  const { t } = useTranslation()
  const tc = t('chats')
  const tp = t('projects')
  const navigate = useNavigate()
  const agentBtnRef = useRef(null)

  const handleChange = (event) => {
    const value = event.target.value
    onComposerChange(value)
    const lines = value.split('\n')
    const currentLine = lines[lines.length - 1]
    if (/\/agent\s*$/.test(currentLine)) {
      setShowAgentSelector(true)
    } else {
      setShowAgentSelector(false)
    }
  }

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || isSending) return
    event.preventDefault()
    onSend()
  }

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || [])
    onAddFiles(files)
    event.target.value = ''
  }

  const handleToggleModelDropdown = () => {
    if (!showModelDropdown) refreshProviders()
    setShowModelDropdown(!showModelDropdown)
  }

  const handleSelectAgent = (agentId) => {
    setSelectedAgentId(agentId)
    setShowAgentSelector(false)
    onComposerChange(composerValue.replace(/\/agent\s*$/, ''))
  }

  const handleSelectModel = (providerId, modelId) => {
    onSelectModel(providerId, modelId)
    setShowModelDropdown(false)
  }

  const handleToggleFavorite = (providerId, modelId) => {
    const isFav = favoriteModels.find((f) => f.providerId === providerId && f.modelId === modelId)
    if (isFav) removeFavorite({ providerId, modelId })
    else addFavorite({ providerId, modelId })
  }

  return (
    <div ref={wrapRef} className={`${styles.bottomComposerWrap} ${centered ? styles.centered : ''}`}>
      {showScrollButton ? (
        <button
          type="button"
          className={styles.scrollToBottomBtn}
          onClick={onScrollToBottom}
          aria-label={tc.scrollToBottom}
        >
          <ArrowDown size={18} weight="bold" />
        </button>
      ) : null}
      {interaction ? (
        <InteractionPanel
          interaction={interaction}
          onRespond={onInteractionRespond}
          onClose={onCloseInteraction}
        />
      ) : (
        <>
          <div className={styles.bottomComposerGlow} />
          <form className={styles.bottomComposer} onSubmit={(event) => { event.preventDefault(); onSend() }}>
            {(editingMessage || replyingToMessage) && (
              <div className={styles.composerContextHeader}>
                <span className={styles.composerContextLabel}>
                  {editingMessage ? tc.editing : tc.replyingTo}
                </span>
                <button
                  type="button"
                  className={styles.composerContextCancel}
                  onClick={editingMessage ? onCancelEdit : onCancelReply}
                  aria-label={tc.cancel}
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
            )}
            <AttachmentPreviews
              attachments={attachments}
              exitingAttachments={exitingAttachments}
              onPreview={onPreviewAttachment}
              onRemove={onRemoveAttachment}
            />
            <div className={styles.bottomComposerInputWrap}>
              <textarea
                ref={inputRef}
                className={styles.bottomComposerInput}
                value={composerValue}
                onChange={handleChange}
                onKeyDown={handleComposerKeyDown}
                placeholder={placeholder || tc.replyPlaceholder}
                disabled={isSending}
              />
            </div>
            <div className={styles.bottomComposerFooter}>
              <div className={styles.bottomComposerLeft}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className={styles.hiddenFileInput}
                  onChange={handleFileChange}
                />
                <div className={styles.attachMenuWrapper}>
                  <button
                    type="button"
                    className={styles.bottomIconBtn}
                    aria-label={tp.addFilesMenu}
                    disabled={chatIsResponding || isSending}
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                  >
                    <Plus size={18} weight="bold" />
                  </button>
                  <ComposerAttachMenu
                    open={showAttachMenu}
                    labels={{
                      addFilesOrPhotos: attachments.length >= 5 ? 'Max 5 files' : 'Add files or photos',
                      takeScreenshot: 'Take a screenshot',
                      addToProject: 'Add to project',
                      skills: 'Skills',
                      addConnectors: 'Add connectors',
                      research: 'Research',
                      webSearch: 'Web search',
                      useStyle: 'Use style',
                    }}
                    onClose={() => setShowAttachMenu(false)}
                    onChooseFiles={() => fileInputRef.current?.click()}
                    onTakeScreenshot={onTakeScreenshot || (() => {})}
                    canCaptureScreen={canCaptureScreen}
                    onAddToProject={onAddToProject}
                    researchEnabled={researchMode}
                    onToggleResearch={() => {
                      const newValue = !researchMode
                      setResearchMode(newValue)
                      localStorage.setItem('chat:researchMode', String(newValue))
                    }}
                    webSearchEnabled={webSearchMode}
                    onToggleWebSearch={() => {
                      const newValue = !webSearchMode
                      setWebSearchMode(newValue)
                      localStorage.setItem('chat:webSearchMode', String(newValue))
                    }}
                  />
                </div>
                {researchMode && (
                  <div className={`${styles.modeChip} ${(chatIsResponding || isSending) ? styles.modeChipDisabled : ''}`}>
                    <span className={styles.modeChipTooltip}>Research</span>
                    <MagnifyingGlass size={16} weight="regular" />
                    <button
                      type="button"
                      className={styles.modeChipRemove}
                      disabled={chatIsResponding || isSending}
                      onClick={() => {
                        setResearchMode(false)
                        localStorage.setItem('chat:researchMode', 'false')
                      }}
                      aria-label="Remove Research"
                    >
                      <X size={10} weight="bold" />
                    </button>
                  </div>
                )}
                {webSearchMode && (
                  <div className={`${styles.modeChip} ${(chatIsResponding || isSending) ? styles.modeChipDisabled : ''}`}>
                    <span className={styles.modeChipTooltip}>Web search</span>
                    <GlobeSimple size={16} weight="regular" />
                    <button
                      type="button"
                      className={styles.modeChipRemove}
                      disabled={chatIsResponding || isSending}
                      onClick={() => {
                        setWebSearchMode(false)
                        localStorage.setItem('chat:webSearchMode', 'false')
                      }}
                      aria-label="Remove Web Search"
                    >
                      <X size={10} weight="bold" />
                    </button>
                  </div>
                )}
                {project && (
                  <div className={`${styles.projectChip} ${(chatIsResponding || isSending) ? styles.projectChipDisabled : ''}`}>
                    <span className={styles.projectChipTooltip}>{project.name}</span>
                    <span className={styles.projectChipIcon}>
                      <CardsThree size={20} weight="fill" />
                    </span>
                    <button
                      type="button"
                      className={styles.projectChipRemove}
                      disabled={chatIsResponding || isSending}
                      onClick={onRemoveFromProject}
                      aria-label={tc.removeFromProject}
                    >
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M13.147 6.146a.5.5 0 0 1 .707.707L10.707 10l3.146 3.146a.5.5 0 0 1-.628.772l-.079-.065L10 10.707l-3.147 3.146a.5.5 0 0 1-.707-.707L9.293 10 6.146 6.853l-.064-.078a.5.5 0 0 1 .693-.693l.078.064L10 9.293z"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.bottomComposerRight}>
                {charCount != null && (
                  <span className={`${styles.charCount} ${charCount > maxChars ? styles.charCountOver : ''}`}>
                    {charCount > 0 ? `~${estimatedTokens} tok · ${charCount}/${maxChars}` : ''}
                  </span>
                )}
                <div className={styles.modelSelectorWrapper}>
                  {providers.length > 0 ? (
                    <div className={styles.modelBadge}>
                      <button
                        ref={agentBtnRef}
                        type="button"
                        className={styles.modelBadgeBtn}
                        disabled={isSending}
                        onClick={() => setShowAgentSelector(true)}
                      >
                        <span className={styles.modelBadgeAgentName}>{displayAgent ? displayAgent.name.charAt(0).toUpperCase() + displayAgent.name.slice(1) : 'Agent'}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.modelBadgeBtn}
                        disabled={isSending}
                        onClick={handleToggleModelDropdown}
                      >
                        <span className={styles.modelBadgeModelName}>{getModelName(effectiveModelId)}</span>
                        <span className={styles.modelBadgeProviderName}>{getProviderName(effectiveProviderId)}</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.modelBadgeConfigure}
                      disabled={chatIsResponding || isSending}
                      onClick={() => navigate('/toolbox?section=providers')}
                    >
                      <Plus size={14} weight="bold" />
                      <span>{tc.addProvider || 'Add Provider'}</span>
                    </button>
                  )}

                  {showModelDropdown && (
                    <ModelSelector
                      models={models}
                      providers={providers}
                      loading={modelsLoading}
                      selectedModelId={effectiveModelId}
                      selectedProviderId={effectiveProviderId}
                      favorites={favoriteModels}
                      onSelect={handleSelectModel}
                      onToggleFavorite={handleToggleFavorite}
                      onNavigateToProviders={() => navigate('/toolbox?section=providers')}
                      onClose={() => setShowModelDropdown(false)}
                      t={t}
                    />
                  )}

                  {showAgentSelector && (
                    <AgentSelector
                      agents={agents}
                      loading={agentsLoading}
                      selectedAgentId={selectedAgentId}
                      onSelect={handleSelectAgent}
                      onClose={() => setShowAgentSelector(false)}
                      triggerRef={agentBtnRef}
                    />
                  )}
                </div>

                {chatIsResponding ? (
                  <button
                    type="button"
                    className={styles.bottomSendBtn}
                    aria-label={tc.stop}
                    onClick={onStop}
                  >
                    <StopCircle size={18} weight="fill" />
                  </button>
                ) : (
                  <button
                    type={composerValue.trim() || attachments.length > 0 ? 'submit' : 'button'}
                    className={`${styles.bottomSendBtn} ${(composerValue.trim() || attachments.length > 0) ? styles.bottomSendBtnActive : ''} ${isSending ? styles.bottomSendBtnLoading : ''}`}
                    aria-label={composerValue.trim() || attachments.length > 0 ? tp.send : tp.useVoice}
                    disabled={chatIsResponding || isSending}
                  >
                    {isSending
                      ? <CircleNotch size={16} weight="bold" className={styles.spinIcon} />
                      : composerValue.trim() || attachments.length > 0
                        ? <ArrowUp size={16} weight="bold" />
                        : <Waveform size={18} weight="regular" />}
                  </button>
                )}
              </div>
            </div>
          </form>
          {!hideDisclaimer && (
            <div role="note" data-disclaimer="true" className={styles.disclaimer}>
              <a
                href="https://support.anthropic.com/en/articles/8525154-claude-is-providing-incorrect-or-misleading-responses-what-s-going-on"
                target="_blank"
                rel="noopener noreferrer"
              >
                {tc.disclaimer}
              </a>
            </div>
          )}
        </>
      )}
    </div>
  )
}
