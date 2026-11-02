import type { GridItem } from '../model'
import { resolveUntransformedGridRect } from './gridMotionGeometry'

/** Resolve the overlay's unscaled box and its scale at the final, post-drop grid position. */
export function resolveDropFlightTarget(
  tileNode: HTMLElement | undefined,
  item: GridItem,
  iconImageSize: number
) {
  if (!tileNode) return null
  const targetNode =
    item.kind === 'folder'
      ? (tileNode.querySelector<HTMLElement>('[data-folder-visual-body]') ?? tileNode)
      : (tileNode.querySelector<HTMLElement>('.icon-image') ?? tileNode)
  const rect = resolveUntransformedGridRect(targetNode, tileNode)
  const width = item.kind === 'folder' ? rect.width : iconImageSize
  const height = item.kind === 'folder' ? rect.height : iconImageSize
  const motionGrid = targetNode.closest<HTMLElement>('.launchpad-edit-grid-motion')
  const editing = motionGrid?.closest('.launchpad-bg[data-edit-mode="true"]')
  // Single-item drag zoom returns to 1; selection mode keeps its CSS target scale.
  // Read the target variable rather than the matrix, which may still be transitioning.
  const configuredScale =
    editing && motionGrid
      ? Number(window.getComputedStyle(motionGrid).getPropertyValue('--launchpad-edit-grid-scale'))
      : 1
  const scale = Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale : 1
  const gridRect = motionGrid?.getBoundingClientRect()
  const originX = gridRect ? gridRect.left + gridRect.width / 2 : 0
  const originY = gridRect ? gridRect.top + gridRect.height / 2 : 0
  const centerX = originX + (rect.left + rect.width / 2 - originX) * scale
  const centerY = originY + (rect.top + rect.height / 2 - originY) * scale
  return {
    // DragOverlays scales about the overlay's center, so retain its unscaled dimensions.
    left: centerX - width / 2,
    top: centerY - height / 2,
    width,
    height,
    scale,
  }
}
