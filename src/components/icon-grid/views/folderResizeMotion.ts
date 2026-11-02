import type { DesktopFolderTileMetrics } from './folderVisualPolicy'

/** DesktopGo resize feedback; independent of the APK's folder-open spring. */
export const FOLDER_RESIZE_TRANSITION = {
  type: 'tween',
  duration: 0.28,
  ease: [0.22, 1, 0.36, 1],
} as const

export const FOLDER_RESIZE_REDUCED_TRANSITION = { duration: 0 } as const

export function interpolateFolderGeometry(
  from: DesktopFolderTileMetrics,
  to: DesktopFolderTileMetrics,
  progress: number
): DesktopFolderTileMetrics {
  const amount = Math.max(0, Math.min(1, progress))
  return Object.fromEntries(
    Object.entries(to).map(([key, value]) => [
      key,
      from[key as keyof DesktopFolderTileMetrics] +
        (value - from[key as keyof DesktopFolderTileMetrics]) * amount,
    ])
  ) as unknown as DesktopFolderTileMetrics
}
