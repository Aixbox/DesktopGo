import type { IconColorId } from '../../lib/textIcon'
import { normalizeIconColor } from '../../lib/iconColors'
import { isWebsiteTarget } from '../../lib/websiteIcon'

export type AddIconKind = 'app' | 'website'
export type IconSource = 'target' | 'custom' | 'text'
export type IconChoice = IconSource | 'current'

export const DEFAULT_TEXT_ICON_TEXT = 'D'
export const DEFAULT_TEXT_ICON_COLOR: IconColorId = 'ocean'

export interface AddIconDialogDraft {
  entryKind?: AddIconKind
  displayName: string
  targetPath: string
  launchArguments: string
  workingDirectory: string
  customIconPath: string
  websiteIconBase64?: string
  generatedIconBase64?: string
  /** 仅供编辑会话展示和还原，不作为新的持久化图标来源。 */
  currentIconBase64?: string
  iconSource?: IconSource
  iconColor?: IconColorId
  iconText?: string
}

export interface AddIconDialogInitialState {
  entryKind: AddIconKind
  name: string
  targetPath: string
  launchArguments: string
  workingDirectory: string
  customIconPath: string
  selectedIconSource: IconChoice
  currentIconPreview: string
  iconColor: IconColorId
  iconText: string
  editedTextIconPreview: string
  targetPreview: string
  targetPreviewLoading: boolean
  customPreview: string
  customPreviewLoading: boolean
  websitePreview: string
  websitePreviews: string[]
  websitePreviewResolved: boolean
}

export function createAddIconDialogInitialState(
  draft: AddIconDialogDraft | null
): AddIconDialogInitialState {
  if (!draft) {
    return {
      entryKind: 'app',
      name: '',
      targetPath: '',
      launchArguments: '',
      workingDirectory: '',
      customIconPath: '',
      selectedIconSource: 'text',
      currentIconPreview: '',
      iconColor: DEFAULT_TEXT_ICON_COLOR,
      iconText: DEFAULT_TEXT_ICON_TEXT,
      editedTextIconPreview: '',
      targetPreview: '',
      targetPreviewLoading: false,
      customPreview: '',
      customPreviewLoading: false,
      websitePreview: '',
      websitePreviews: [],
      websitePreviewResolved: false,
    }
  }

  const entryKind = draft.entryKind ?? (isWebsiteTarget(draft.targetPath) ? 'website' : 'app')
  const selectedIconSource = resolveDraftIconSource(draft)
  const currentIconPreview = draft.currentIconBase64 ?? ''
  const generatedPreview = draft.generatedIconBase64 ?? ''
  const targetPreview =
    entryKind === 'app' && selectedIconSource === 'target' && !currentIconPreview
      ? generatedPreview
      : ''
  const customPreview = selectedIconSource === 'custom' ? generatedPreview : ''
  const websitePreview = draft.websiteIconBase64 ?? ''

  return {
    entryKind,
    name: draft.displayName,
    targetPath: draft.targetPath,
    launchArguments: draft.launchArguments,
    workingDirectory: draft.workingDirectory,
    customIconPath: draft.customIconPath,
    selectedIconSource: currentIconPreview ? 'current' : selectedIconSource,
    currentIconPreview,
    iconColor: normalizeIconColor(draft.iconColor),
    iconText: draft.iconText ?? '',
    editedTextIconPreview: selectedIconSource === 'text' ? generatedPreview : '',
    targetPreview,
    targetPreviewLoading: entryKind === 'app' && Boolean(draft.targetPath.trim()) && !targetPreview,
    customPreview,
    customPreviewLoading: Boolean(draft.customIconPath.trim()) && !customPreview,
    websitePreview,
    websitePreviews: websitePreview ? [websitePreview] : [],
    websitePreviewResolved: Boolean(websitePreview),
  }
}

export function resolveDraftIconSource(draft: AddIconDialogDraft): IconSource {
  return (
    draft.iconSource ??
    (draft.generatedIconBase64 ? 'text' : draft.customIconPath ? 'custom' : 'target')
  )
}
