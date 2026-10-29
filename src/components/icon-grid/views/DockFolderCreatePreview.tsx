import type { DesktopIcon } from '../../../types'
import {
  DOCK_FOLDER_SURFACE_ACTIVE_CLASS,
  DOCK_FOLDER_SURFACE_CLASS,
  type DesktopSingleSlotFolderMetrics,
  scaledRadius,
} from './folderVisualPolicy'
import { FolderIconVisual } from './FolderVisuals'

interface DockFolderCreatePreviewProps {
  active: boolean
  icon: DesktopIcon
  metrics: DesktopSingleSlotFolderMetrics
  reorderAnimationMs: number
}

export function DockFolderCreatePreview({
  active,
  icon,
  metrics,
  reorderAnimationMs,
}: DockFolderCreatePreviewProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30" aria-hidden="true">
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={`${DOCK_FOLDER_SURFACE_CLASS} flex items-center justify-center transition-all duration-200 ${
            active
              ? `${DOCK_FOLDER_SURFACE_ACTIVE_CLASS} scale-100 opacity-100`
              : 'scale-[0.94] opacity-0'
          }`}
          style={{
            width: `${metrics.surfaceSize}px`,
            height: `${metrics.surfaceSize}px`,
            borderRadius: scaledRadius(metrics.surfaceRadius),
            transitionDuration: `${reorderAnimationMs}ms`,
          }}
        >
          <FolderIconVisual icons={[icon]} imgSize={metrics.previewSize} withSurface={false} />
        </div>
      </div>
    </div>
  )
}
