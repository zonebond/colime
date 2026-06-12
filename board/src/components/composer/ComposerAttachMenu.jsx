import { Camera, CaretRight, Check, FolderSimple, GlobeSimple, Lightning, MagnifyingGlass, Paperclip, PlugsConnected, TextAa } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import chatStyles from '@/components/chats/ChatPage.module.css'

function ComposerAttachMenuInner({
  labels,
  onClose,
  onChooseFiles,
  onTakeScreenshot,
  canCaptureScreen,
  onAddToProject,
  researchEnabled,
  onToggleResearch,
  webSearchEnabled,
  onToggleWebSearch,
}) {
  return (
    <>
      <button
        type="button"
        className={chatStyles.attachMenuItem}
        onClick={() => {
          onChooseFiles?.()
          onClose?.()
        }}
      >
        <Paperclip size={20} weight="regular" />
        <span>{labels.addFilesOrPhotos}</span>
        <span className={chatStyles.attachMenuShortcut}>⌘U</span>
      </button>
      <button
        type="button"
        className={chatStyles.attachMenuItem}
        disabled={!canCaptureScreen}
        onClick={() => {
          onTakeScreenshot?.()
          onClose?.()
        }}
      >
        <Camera size={20} weight="regular" />
        <span>{labels.takeScreenshot}</span>
      </button>
      {onAddToProject ? (
        <button
          type="button"
          className={chatStyles.attachMenuItem}
          onClick={() => {
            onAddToProject?.()
            onClose?.()
          }}
        >
          <FolderSimple size={20} weight="regular" />
          <span>{labels.addToProject}</span>
        </button>
      ) : null}
      <div className={chatStyles.attachMenuSeparator} />
      <button type="button" className={`${chatStyles.attachMenuItem} ${chatStyles.attachMenuItemHasSubmenu || ''}`.trim()}>
        <Lightning size={20} weight="regular" />
        <span>{labels.skills}</span>
        <CaretRight size={16} weight="bold" className={chatStyles.attachMenuSubmenuArrow} />
      </button>
      <button type="button" className={chatStyles.attachMenuItem}>
        <PlugsConnected size={20} weight="regular" />
        <span>{labels.addConnectors}</span>
      </button>
      <div className={chatStyles.attachMenuSeparator} />
      <button
        type="button"
        className={`${chatStyles.attachMenuItem} ${researchEnabled ? chatStyles.attachMenuItemChecked : ''}`}
        onClick={onToggleResearch}
      >
        <MagnifyingGlass size={20} weight="regular" />
        <span>{labels.research}</span>
        {researchEnabled ? <Check size={16} weight="bold" className={chatStyles.attachMenuCheck} /> : null}
      </button>
      <button
        type="button"
        className={`${chatStyles.attachMenuItem} ${webSearchEnabled ? chatStyles.attachMenuItemChecked : ''}`}
        onClick={onToggleWebSearch}
      >
        <GlobeSimple size={20} weight="regular" />
        <span>{labels.webSearch}</span>
        {webSearchEnabled ? <Check size={16} weight="bold" className={chatStyles.attachMenuCheck} /> : null}
      </button>
      <div className={chatStyles.attachMenuSeparator} />
      <button type="button" className={`${chatStyles.attachMenuItem} ${chatStyles.attachMenuItemHasSubmenu || ''}`.trim()}>
        <TextAa size={20} weight="regular" />
        <span>{labels.useStyle}</span>
        <CaretRight size={16} weight="bold" className={chatStyles.attachMenuSubmenuArrow} />
      </button>
    </>
  )
}

export default function ComposerAttachMenu({
  open,
  mode = 'inline',
  position = null,
  side = 'bottom',
  menuRef = null,
  labels,
  onClose,
  onChooseFiles,
  onTakeScreenshot,
  canCaptureScreen = true,
  onAddToProject = null,
  researchEnabled = false,
  onToggleResearch,
  webSearchEnabled = false,
  onToggleWebSearch,
}) {
  if (!open) return null

  const content = (
    <>
      <div className={chatStyles.attachMenuBackdrop} onClick={onClose} />
      <div
        ref={menuRef}
        className={chatStyles.attachMenu}
        data-side={side}
        style={mode === 'portal' ? { position: 'fixed', left: position?.left, top: position?.top, bottom: 'auto' } : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <ComposerAttachMenuInner
          labels={labels}
          onClose={onClose}
          onChooseFiles={onChooseFiles}
          onTakeScreenshot={onTakeScreenshot}
          canCaptureScreen={canCaptureScreen}
          onAddToProject={onAddToProject}
          researchEnabled={researchEnabled}
          onToggleResearch={onToggleResearch}
          webSearchEnabled={webSearchEnabled}
          onToggleWebSearch={onToggleWebSearch}
        />
      </div>
    </>
  )

  return mode === 'portal' ? createPortal(content, document.body) : content
}
