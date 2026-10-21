import type { DragState, DropImpactEvent } from '../state/types'

export const DROP_IMPACT_DURATION_MS = 460
export const DROP_IMPACT_EASING = 'cubic-bezier(0.22, 1.12, 0.36, 1.02)'

const DROP_IMPACT_RADIUS_FACTOR = 1.75
const DROP_IMPACT_OFFSET_PX = 4
const DROP_IMPACT_MAX_STRETCH = 0.055
const DROP_IMPACT_MAX_ROTATION = 2.8

export interface DropImpactPosition {
  left: number
  top: number
}

export interface DropImpactKeyframeOptions {
  deltaX: number
  deltaY: number
  radialOffsetX?: number
  radialOffsetY?: number
  strength: number
}

interface DropImpactKeyframe {
  [property: string]: string | number
  transform: string
  offset: number
}

export interface AnimateDropImpactNodesOptions {
  nodes: Map<string, HTMLDivElement>
  animations: Map<string, Animation>
  previousPositions: Map<string, DropImpactPosition> | null
  impact: DropImpactEvent
  itemWidth: number
  itemHeight: number
  gridGap: number
  reducedMotion: boolean
}

export function resolveOuterDropImpactTarget(
  session: Pick<
    DragState,
    'context' | 'draggingId' | 'previewSlotIndex' | 'folderPreviewTargetId' | 'hoverTargetId'
  >
): Pick<DropImpactEvent, 'itemId' | 'targetId'> | null {
  if (session.context !== 'outer') return null
  const hasDropLocation =
    session.previewSlotIndex !== null ||
    session.folderPreviewTargetId !== null ||
    session.hoverTargetId !== null
  if (!hasDropLocation) return null

  return {
    itemId: session.draggingId,
    targetId: session.folderPreviewTargetId ?? session.draggingId,
  }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Smoothly fades a shockwave as it travels away from the landing tile. */
export function resolveDropImpactStrength(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 0
  const progress = clamp(1 - distance / radius, 0, 1)
  return progress * progress * (3 - 2 * progress)
}

/**
 * Builds a short spring response for a grid tile. The first channel settles the
 * layout delta while the scale channels carry the squash-and-stretch response.
 */
export function buildDropImpactKeyframes({
  deltaX,
  deltaY,
  radialOffsetX = 0,
  radialOffsetY = 0,
  strength,
}: DropImpactKeyframeOptions): DropImpactKeyframe[] {
  const intensity = clamp(strength, 0, 1)
  const stretch = (0.018 + DROP_IMPACT_MAX_STRETCH * intensity) * 0.5
  const travelX = Math.abs(deltaX) + Math.abs(radialOffsetX)
  const travelY = Math.abs(deltaY) + Math.abs(radialOffsetY)
  const horizontal = travelX >= travelY
  const rotation = clamp(
    ((deltaX + radialOffsetX) * 0.012 - (deltaY + radialOffsetY) * 0.008) * intensity,
    -DROP_IMPACT_MAX_ROTATION,
    DROP_IMPACT_MAX_ROTATION
  )
  const firstTranslateX = deltaX * 0.72 + radialOffsetX
  const firstTranslateY = deltaY * 0.72 + radialOffsetY
  const secondTranslateX = deltaX * 0.2 + radialOffsetX * 0.35
  const secondTranslateY = deltaY * 0.2 + radialOffsetY * 0.35

  const squashX = horizontal ? 1 - stretch : 1 + stretch
  const squashY = horizontal ? 1 + stretch : 1 - stretch
  const reboundX = horizontal ? 1 + stretch * 0.55 : 1 - stretch * 0.55
  const reboundY = horizontal ? 1 - stretch * 0.55 : 1 + stretch * 0.55

  return [
    {
      transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(1, 1) rotate(0deg)`,
      offset: 0,
    },
    {
      transform: `translate3d(${firstTranslateX}px, ${firstTranslateY}px, 0) scale(${squashX}, ${squashY}) rotate(${rotation}deg)`,
      offset: 0.24,
    },
    {
      transform: `translate3d(${secondTranslateX}px, ${secondTranslateY}px, 0) scale(${reboundX}, ${reboundY}) rotate(${-rotation * 0.42}deg)`,
      offset: 0.5,
    },
    {
      transform: `translate3d(${deltaX * 0.035}px, ${deltaY * 0.035}px, 0) scale(${1 - stretch * 0.12}, ${1 + stretch * 0.12}) rotate(${rotation * 0.08}deg)`,
      offset: 0.74,
    },
    {
      transform: 'translate3d(0, 0, 0) scale(1, 1) rotate(0deg)',
      offset: 1,
    },
  ]
}

function getCenter(rect: DOMRect): DropImpactPosition {
  return { left: rect.left + rect.width / 2, top: rect.top + rect.height / 2 }
}

function getLayoutDelta(
  previous: DropImpactPosition | undefined,
  next: DOMRect
): { x: number; y: number } {
  if (!previous) return { x: 0, y: 0 }
  return { x: previous.left - next.left, y: previous.top - next.top }
}

function cancelExistingAnimation(animations: Map<string, Animation>, id: string) {
  const existing = animations.get(id)
  if (!existing) return
  existing.cancel()
  animations.delete(id)
}

/** Applies the landing shockwave to the dropped tile and its nearest neighbours. */
export function animateDropImpactNodes({
  nodes,
  animations,
  previousPositions,
  impact,
  itemWidth,
  itemHeight,
  gridGap,
  reducedMotion,
}: AnimateDropImpactNodesOptions) {
  if (reducedMotion) return

  const targetNode = nodes.get(impact.targetId) ?? nodes.get(impact.itemId)
  const targetCenter = targetNode ? getCenter(targetNode.getBoundingClientRect()) : null
  const radius = Math.max(itemWidth, itemHeight) * DROP_IMPACT_RADIUS_FACTOR + gridGap

  nodes.forEach((node, id) => {
    const nextRect = node.getBoundingClientRect()
    const delta = getLayoutDelta(previousPositions?.get(id), nextRect)
    const center = getCenter(nextRect)
    const distance = targetCenter
      ? Math.hypot(center.left - targetCenter.left, center.top - targetCenter.top)
      : Number.POSITIVE_INFINITY
    const weight = targetCenter ? resolveDropImpactStrength(distance, radius) : 0
    const hasLayoutDelta = Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5
    if (!hasLayoutDelta && weight <= 0 && id !== impact.targetId) return

    const strength = id === impact.targetId ? 1 : Math.max(0.22, weight)
    const radialDistance = Math.min(DROP_IMPACT_OFFSET_PX, distance * 0.06) * weight
    const radialX = targetCenter ? (center.left - targetCenter.left) / Math.max(1, distance) : 0
    const radialY = targetCenter ? (center.top - targetCenter.top) / Math.max(1, distance) : 0

    cancelExistingAnimation(animations, id)
    node.style.transition = 'none'
    node.style.willChange = 'transform'
    const animation = node.animate(
      buildDropImpactKeyframes({
        deltaX: delta.x,
        deltaY: delta.y,
        radialOffsetX: radialX * radialDistance,
        radialOffsetY: radialY * radialDistance,
        strength,
      }),
      {
        duration: DROP_IMPACT_DURATION_MS,
        easing: DROP_IMPACT_EASING,
        fill: 'both',
      }
    )
    const clearAnimation = () => {
      if (animations.get(id) !== animation) return
      animations.delete(id)
      node.style.transition = ''
      node.style.willChange = ''
    }
    animation.onfinish = clearAnimation
    animation.oncancel = clearAnimation
    animations.set(id, animation)
  })
}
