import { ICON_CROP_OUTPUT_SIZE, type CropCornerRadii } from '../../lib/imageCrop'
import {
  createColoredIconDataUri,
  normalizeTextIconText,
  type IconColorId,
} from '../../lib/textIcon'
import { normalizeWebsiteUrl } from '../../lib/websiteIcon'
import { resolveTextIconColor, type TextIconColor } from '../../lib/textIconColor'
import {
  resolveDraftIconSource,
  type AddIconDialogDraft,
  type AddIconKind,
  type IconChoice,
} from './addIconDialogState'

interface IconAppearanceInput {
  initialDraft: AddIconDialogDraft | null
  entryKind: AddIconKind
  selectedIconSource: IconChoice
  selectedPreview: string
  selectedCornerRadii?: CropCornerRadii
  editedRasterPreviews: string[]
  normalizedTargetPath: string
  customIconPath: string
  websitePreview: string
  iconColor: IconColorId
  iconText: string
  iconTextColor: TextIconColor
}

type IconAppearanceDraft = Pick<
  AddIconDialogDraft,
  | 'customIconPath'
  | 'websiteIconBase64'
  | 'generatedIconBase64'
  | 'iconSource'
  | 'iconColor'
  | 'iconText'
  | 'iconTextColor'
>

/** 「当前图标」还原进入编辑前的图片和来源；其他选项沿用已有的生成、裁剪流程。 */
export async function createIconAppearanceDraft(
  input: IconAppearanceInput
): Promise<IconAppearanceDraft> {
  const { initialDraft, selectedIconSource, selectedPreview, iconColor, iconText, entryKind } =
    input
  if (selectedIconSource === 'current') {
    if (!initialDraft?.currentIconBase64) throw new Error('Current icon is unavailable')
    const source = resolveDraftIconSource(initialDraft)
    return {
      customIconPath: source === 'custom' ? initialDraft.customIconPath.trim() : '',
      websiteIconBase64: initialDraft.websiteIconBase64 ?? '',
      generatedIconBase64: initialDraft.generatedIconBase64 || initialDraft.currentIconBase64,
      iconSource: source,
      iconColor: initialDraft.iconColor ?? 'none',
      iconText: source === 'text' ? normalizeTextIconText(initialDraft.iconText ?? '') : '',
      iconTextColor: source === 'text' ? initialDraft.iconTextColor : undefined,
    }
  }

  const initialTargetPath = initialDraft
    ? initialDraft.entryKind === 'website'
      ? normalizeWebsiteUrl(initialDraft.targetPath)
      : initialDraft.targetPath.trim()
    : ''
  const canReuseGeneratedIcon = Boolean(
    initialDraft?.generatedIconBase64 &&
    selectedPreview === initialDraft.generatedIconBase64 &&
    !input.editedRasterPreviews.includes(selectedPreview) &&
    selectedIconSource === initialDraft.iconSource &&
    iconColor === initialDraft.iconColor &&
    input.normalizedTargetPath === initialTargetPath &&
    (selectedIconSource !== 'custom' ||
      input.customIconPath.trim() === initialDraft.customIconPath.trim()) &&
    (selectedIconSource !== 'text' ||
      (normalizeTextIconText(iconText) === normalizeTextIconText(initialDraft.iconText ?? '') &&
        input.iconTextColor ===
          resolveTextIconColor(initialDraft.iconTextColor, initialDraft.iconColor)))
  )
  const generatedIconBase64 = canReuseGeneratedIcon
    ? (initialDraft?.generatedIconBase64 ?? '')
    : selectedIconSource === 'text'
      ? selectedPreview
      : iconColor !== 'none'
        ? await createColoredIconDataUri(
            selectedPreview,
            iconColor,
            ICON_CROP_OUTPUT_SIZE,
            input.selectedCornerRadii
          )
        : input.editedRasterPreviews.includes(selectedPreview) &&
            !(entryKind === 'website' && selectedIconSource === 'target')
          ? selectedPreview
          : ''
  return {
    customIconPath: selectedIconSource === 'custom' ? input.customIconPath.trim() : '',
    websiteIconBase64:
      entryKind === 'website' && selectedIconSource === 'target' && iconColor === 'none'
        ? input.websitePreview
        : '',
    generatedIconBase64,
    iconSource: selectedIconSource,
    iconColor,
    iconText: selectedIconSource === 'text' ? normalizeTextIconText(iconText) : '',
    iconTextColor: selectedIconSource === 'text' ? input.iconTextColor : undefined,
  }
}
