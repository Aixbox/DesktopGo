export interface AiOrganizeComposerKeyInput {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  isComposing: boolean
  composerValue: string
  hasComposerCommand: boolean
}

export type AiOrganizeComposerKeyAction = 'default' | 'remove-command' | 'send'

export const resolveAiOrganizeComposerKeyAction = ({
  key,
  shiftKey,
  isComposing,
  composerValue,
  hasComposerCommand,
}: AiOrganizeComposerKeyInput): AiOrganizeComposerKeyAction => {
  if (key === 'Backspace' && composerValue.length === 0 && hasComposerCommand) {
    return 'remove-command'
  }

  if (key === 'Enter' && !shiftKey && isComposing !== true) return 'send'

  return 'default'
}

export interface AiOrganizePreviewVisibility {
  open: boolean
  visible: boolean
  hasOnCollapse: boolean
}

export const shouldRestoreAiOrganizeLayoutPreview = ({
  open,
  visible,
  hasOnCollapse,
}: AiOrganizePreviewVisibility) => !open || (!visible && !hasOnCollapse)
