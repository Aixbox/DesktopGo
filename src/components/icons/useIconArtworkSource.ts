import { useEffect, useState } from 'react'
import type { AddIconDialogDraft } from './addIconDialogState'
import { initialIconArtwork, loadOriginalIconArtwork } from './iconOriginalArtwork'

/** 当前图标保留保存时的外观；编辑和取色则使用没有额外背景的图像层。 */
export function useIconArtworkSource(initialDraft: AddIconDialogDraft | null) {
  const [original, setOriginal] = useState(() => initialIconArtwork(initialDraft))
  useEffect(() => {
    if (!initialDraft || original !== null) return
    let active = true
    void loadOriginalIconArtwork(initialDraft)
      .catch(() => '')
      .then(source => {
        if (active) setOriginal(source)
      })
    return () => {
      active = false
    }
  }, [initialDraft, original])

  return (preview: string): string => {
    if (!preview || !initialDraft) return preview
    const savedPreviews = [
      initialDraft.currentIconBase64,
      initialDraft.generatedIconBase64,
      initialDraft.websiteIconBase64,
    ]
    return savedPreviews.includes(preview) ? (original ?? '') : preview
  }
}
