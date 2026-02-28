import type { DesktopIcon } from '../../../types'
import type { DragContext, GridItem, HoverZone } from '../model'

export interface DragState {
  context: DragContext
  sourceFolderId: string | null
  pointerId: number
  draggingId: string
  draggingItem: GridItem
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
  workingOrder: Array<string | null>
  sourceSlotIndex: number | null
  previewSlotIndex: number | null
  hoverTargetId: string | null
  hoverZone: HoverZone | null
  hoverIou: number
  centerStartedAt: number | null
  dwellStartedAt: number | null
  folderPreviewTargetId: string | null
  lastEvasionSignature: string | null
  lastEvasionTriggerPointer: { x: number; y: number } | null
  lastEvasionAt: number | null
  initialCenters: Record<string, { x: number; y: number }>
}

export interface DragHit {
  targetId: string | null
  zone: HoverZone
  globalSlotIndex: number
}

export interface OuterOverlapHit {
  targetId: string
  targetIndex: number
  targetRect: DOMRect
  overlapRect: DOMRect
  iou: number
  intersectionArea: number
  centerManhattanDistance: number
  zone: HoverZone
}

export interface PendingDrag {
  context: DragContext
  sourceFolderId: string | null
  pointerId: number
  itemId: string
  startX: number
  startY: number
  offsetX: number
  offsetY: number
}

export interface FolderDropFlight {
  id: number
  icon: DesktopIcon
  startX: number
  startY: number
  startSize: number
  endX: number
  endY: number
  endSize: number
  animate: boolean
}
