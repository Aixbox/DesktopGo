import { invoke } from '@tauri-apps/api/core'
import { normalizeIconColor } from '../../lib/iconColors'
import { createTextIconDataUri } from '../../lib/textIcon'
import { resolveTextIconColor } from '../../lib/textIconColor'
import { isWebsiteTarget } from '../../lib/websiteIcon'
import { resolveDraftIconSource, type AddIconDialogDraft } from './addIconDialogState'

/** 已合成的 PNG 不能通过删除相似色还原，必须从图像层或原始来源读取。 */
export function initialIconArtwork(draft: AddIconDialogDraft | null): string | null {
  if (!draft) return ''
  if (draft.iconArtworkBase64) return draft.iconArtworkBase64
  if (resolveDraftIconSource(draft) === 'text') {
    return createTextIconDataUri(
      draft.iconText ?? '',
      'none',
      256,
      resolveTextIconColor(draft.iconTextColor, draft.iconColor),
      false
    )
  }
  if (normalizeIconColor(draft.iconColor) === 'none') {
    return draft.currentIconBase64 || draft.generatedIconBase64 || draft.websiteIconBase64 || ''
  }
  return null
}

export async function loadOriginalIconArtwork(draft: AddIconDialogDraft): Promise<string> {
  if (resolveDraftIconSource(draft) === 'custom') {
    return invoke<string>('get_custom_icon_source', { path: draft.customIconPath })
  }
  if (draft.entryKind === 'website' || isWebsiteTarget(draft.targetPath)) {
    const result = await invoke<{ icon_base64: string; icons?: string[] }>('extract_website_icon', {
      url: draft.targetPath,
    })
    return result.icons?.find(Boolean) || result.icon_base64 || ''
  }
  return invoke<string>('get_drag_preview_icon', { path: draft.targetPath, iconSize: 256 })
}
