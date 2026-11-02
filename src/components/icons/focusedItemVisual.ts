import { isPointInFocusVisual, type FocusedItemVisual } from './focusedItemMenuGeometry'

/** Measure the artwork/surface, never the folder's title or grid footprint. */
export function readFocusedItemVisual(target: HTMLElement): FocusedItemVisual {
  const surface =
    target.querySelector<HTMLElement>(
      '[data-folder-body-hitbox], [data-item-focus-visual], .icon-image'
    ) ?? target
  const rect = surface.getBoundingClientRect()
  const style = window.getComputedStyle(surface)
  const shape =
    style.getPropertyValue('corner-top-left-shape') || style.getPropertyValue('corner-shape')
  const superellipse = /^superellipse\(([-\d.]+)\)$/.exec(shape.trim())
  const scale = rect.width / (Number.parseFloat(style.width) || rect.width || 1)
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: (Number.parseFloat(style.borderTopLeftRadius) || 0) * scale,
    exponent: shape.trim() === 'squircle' ? 4 : superellipse ? 2 ** Number(superellipse[1]) : 2,
    // The backdrop meets the real surface edge; invisible resize clearance belongs to the shield.
    padding: 0,
  }
}

/** Visible cutout and invisible resize hit area have independent responsibilities. */
export function isFocusTargetInteraction(
  event: Event,
  target: HTMLElement | null,
  visual: FocusedItemVisual
) {
  if (!target?.contains(event.target as Node)) return false
  if ((event.target as Element | null)?.closest?.('[data-folder-resize-hit-area]')) return true
  const pointer = event as MouseEvent
  return isPointInFocusVisual(visual, pointer.clientX, pointer.clientY)
}
