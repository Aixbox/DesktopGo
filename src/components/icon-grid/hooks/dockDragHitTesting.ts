import type { DragState, OuterOverlapHit } from '../state/types'
import { classifyZone, getRectArea, getRectIntersection } from '../domain/geometry'
import {
  buildDockOccupiedSlotEntries,
  resolveDockInsertIndexByDisplayIndex,
  resolveDockInsertIndexFromCenters,
  selectDockOverlapCandidate,
} from '../domain/dockDragPolicy'

interface DockSlotEntry {
  index: number
  node: HTMLDivElement
  rect: DOMRect
  targetId: string | null
}

const resolveDockSlotEntries = (slotNodes: Map<number, HTMLDivElement>): DockSlotEntry[] =>
  Array.from(slotNodes.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, node]) => ({
      index,
      node,
      rect: node.getBoundingClientRect(),
      targetId: node.querySelector<HTMLElement>('[data-dock-key]')?.dataset.dockKey ?? null,
    }))

const isPointWithinDockBounds = (
  container: HTMLDivElement | null,
  x: number,
  y: number
): boolean => {
  if (!container) return false
  const rect = container.getBoundingClientRect()
  const dockBuffer = 16
  const withinHorizontal = x >= rect.left - dockBuffer && x <= rect.right + dockBuffer
  const withinVertical = y >= rect.top - dockBuffer && y <= rect.bottom + dockBuffer
  return withinHorizontal && withinVertical
}

const resolveStableTargetRect = (slotRect: DOMRect, node: HTMLDivElement | undefined): DOMRect => {
  if (!node) return slotRect

  const nodeRect = node.getBoundingClientRect()
  const iconImage = node.querySelector<HTMLElement>('.icon-image')
  const folderHitbox = node.querySelector<HTMLElement>('[data-folder-icon-hitbox]')
  const folderVisual = node.querySelector<HTMLElement>('[data-folder-icon-visual]')
  const visualRect =
    iconImage?.getBoundingClientRect() ??
    folderHitbox?.getBoundingClientRect() ??
    folderVisual?.getBoundingClientRect() ??
    nodeRect

  return new DOMRect(
    slotRect.left + (visualRect.left - nodeRect.left),
    slotRect.top + (visualRect.top - nodeRect.top),
    visualRect.width,
    visualRect.height
  )
}

const resolveOccupiedSlots = (slotNodes: Map<number, HTMLDivElement>) => {
  const slotEntries = resolveDockSlotEntries(slotNodes)
  const entryByDisplayIndex = new Map(slotEntries.map(entry => [entry.index, entry] as const))

  return buildDockOccupiedSlotEntries(slotEntries.map(entry => entry.targetId)).flatMap(entry => {
    const slotEntry = entryByDisplayIndex.get(entry.displayIndex)
    return slotEntry
      ? [{ ...slotEntry, targetId: entry.targetId, targetIndex: entry.targetIndex }]
      : []
  })
}

export const resolveDockNearestSlotIndex = ({
  state,
  dockContainer,
  slotNodes,
  allowOutside,
}: {
  state: DragState
  dockContainer: HTMLDivElement | null
  slotNodes: Map<number, HTMLDivElement>
  allowOutside?: boolean
}): number | null => {
  if (!allowOutside && !isPointWithinDockBounds(dockContainer, state.pointerX, state.pointerY))
    return null

  const slotEntries = resolveDockSlotEntries(slotNodes)
  if (slotEntries.length === 0) return 0
  const displaySlots = slotEntries.map(entry => entry.targetId)
  const hoveredEntry = slotEntries.find(
    entry =>
      state.pointerX >= entry.rect.left &&
      state.pointerX <= entry.rect.right &&
      state.pointerY >= entry.rect.top &&
      state.pointerY <= entry.rect.bottom
  )
  if (hoveredEntry?.targetId === null) {
    return resolveDockInsertIndexByDisplayIndex(displaySlots, hoveredEntry.index)
  }

  const occupiedSlots = resolveOccupiedSlots(slotNodes)
  if (occupiedSlots.length === 0) return 0
  return resolveDockInsertIndexFromCenters(
    state.pointerX,
    occupiedSlots.map(entry => entry.rect.left + entry.rect.width / 2)
  )
}

export const findDockMaxOverlapHit = ({
  state,
  iconSize,
  slotNodes,
  itemNodes,
}: {
  state: DragState
  iconSize: number
  slotNodes: Map<number, HTMLDivElement>
  itemNodes: Map<string, HTMLDivElement>
}): OuterOverlapHit | null => {
  const dragRect = new DOMRect(
    state.pointerX - iconSize / 2,
    state.pointerY - iconSize / 2,
    iconSize,
    iconSize
  )
  const dragArea = getRectArea(dragRect)
  if (dragArea <= 0) return null

  const candidates: OuterOverlapHit[] = []
  resolveOccupiedSlots(slotNodes).forEach(entry => {
    const targetRect = resolveStableTargetRect(entry.rect, itemNodes.get(entry.targetId))
    const overlapRect = getRectIntersection(dragRect, targetRect)
    if (!overlapRect) return
    const intersectionArea = getRectArea(overlapRect)
    const targetArea = getRectArea(targetRect)
    if (intersectionArea <= 0 || targetArea <= 0) return

    candidates.push({
      targetId: entry.targetId,
      targetIndex: entry.index,
      targetRect,
      overlapRect,
      iou: intersectionArea / dragArea,
      intersectionArea,
      centerManhattanDistance:
        Math.abs(state.pointerX - (targetRect.left + targetRect.width / 2)) +
        Math.abs(state.pointerY - (targetRect.top + targetRect.height / 2)),
      zone: classifyZone(targetRect, state.pointerX, state.pointerY),
    })
  })
  return selectDockOverlapCandidate(candidates, state.hoverTargetId, iconSize)
}

export const resolveDockTopLevelContextAtPoint = ({
  x,
  y,
  dockContainer,
}: {
  x: number
  y: number
  dockContainer: HTMLDivElement | null
}): 'outer' | 'dock' => (isPointWithinDockBounds(dockContainer, x, y) ? 'dock' : 'outer')
