/**
 * Shared closed-folder artwork and stacked-slot geometry.
 *
 * The 1x3 and 3x3 previews use different outer footprints, but ColorOS keeps
 * their artwork scale and the final 2x2 stacked slot geometry consistent.
 */
export const FOLDER_PREVIEW_ICON_SCALE = 0.84
export const FOLDER_PREVIEW_ICON_FALLBACK_SCALE = 0.68
export const FOLDER_STACKED_PREVIEW_PADDING = 1
export const FOLDER_STACKED_PREVIEW_GAP = 1

export const getFolderPreviewArtworkSize = (
  size: number,
  scale = FOLDER_PREVIEW_ICON_SCALE,
  minimum = 5
): number => {
  const slotSize = Math.max(0, size)
  // Minimum artwork sizes must not overflow compact preview slots and erase their gaps.
  return Math.min(slotSize, Math.max(minimum, Math.floor(slotSize * scale)))
}

export interface FolderStackedPreviewMetrics {
  padding: number
  gap: number
  miniSize: number
}

export const getFolderStackedPreviewMetrics = (size: number): FolderStackedPreviewMetrics => {
  const safeSize = Math.max(0, Math.floor(size))
  const padding = FOLDER_STACKED_PREVIEW_PADDING
  const gap = FOLDER_STACKED_PREVIEW_GAP
  const miniSize = Math.max(5, Math.floor((safeSize - padding * 2 - gap) / 2))
  return { padding, gap, miniSize }
}
