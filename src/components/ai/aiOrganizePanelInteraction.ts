import type { AiOrganizeMessage } from '@/lib/aiOrganizeSessions'

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

// 重新生成时定位该条回复对应的上一条用户消息。
export const findAiRegenerateSourcePrompt = (
  messages: AiOrganizeMessage[],
  messageId: string
): AiOrganizeMessage | null => {
  const index = messages.findIndex(item => item.id === messageId)
  if (index < 0) return null
  return [...messages.slice(0, index)].reverse().find(item => item.role === 'user') ?? null
}
