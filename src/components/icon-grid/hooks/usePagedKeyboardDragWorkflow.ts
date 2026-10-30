import {
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useRef, useState, type MutableRefObject } from 'react'
import type { DragState, PendingDrag } from '../state/types'
import {
  resolveKeyboardGridCellCenter,
  resolveKeyboardPageTransition,
} from '../domain/keyboardGrid'
import { captureDragOriginFocus } from './dragFocus'

const KEYBOARD_POINTER_ID = -1

interface UsePagedKeyboardDragWorkflowParams {
  selectionMode: boolean
  columns: number
  rows: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  gridRef: MutableRefObject<HTMLDivElement | null>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  currentPageRef: MutableRefObject<number>
  pageSizeRef: MutableRefObject<number>
  pageCount: number
  setCurrentPage: (value: number | ((current: number) => number)) => void
  dragRef: MutableRefObject<DragState | null>
  pendingRef: MutableRefObject<PendingDrag | null>
  dragOriginFocusRef: MutableRefObject<HTMLElement | null>
  pendingPointerCaptureTargetRef: MutableRefObject<HTMLElement | null>
  beginDrag: (pending: PendingDrag, x: number, y: number) => void
  scheduleDragMove: (pointerId: number, x: number, y: number) => void
  flushDragMove: (pointerId: number, x: number, y: number) => void
  finishActiveDrag: (pointerId: number) => void
  cancelActiveDrag: (pointerId: number) => void
  dragPointerRef: MutableRefObject<{ pointerX: number; pointerY: number } | null>
}

export interface PagedKeyboardDragWorkflowResult {
  keyboardSensors: SensorDescriptor<SensorOptions>[]
  keyboardDragActive: boolean
  handleKeyboardDragStart: (event: DragStartEvent) => void
  handleKeyboardDragMove: (event: DragMoveEvent) => void
  handleKeyboardDragEnd: (event: DragEndEvent) => void
  handleKeyboardDragCancel: (event: DragCancelEvent) => void
}

export function usePagedKeyboardDragWorkflow({
  selectionMode,
  columns,
  rows,
  itemWidth,
  itemHeight,
  gridGap,
  gridRef,
  tileRefs,
  currentPageRef,
  pageSizeRef,
  pageCount,
  setCurrentPage,
  dragRef,
  pendingRef,
  dragOriginFocusRef,
  pendingPointerCaptureTargetRef,
  beginDrag,
  scheduleDragMove,
  flushDragMove,
  finishActiveDrag,
  cancelActiveDrag,
  dragPointerRef,
}: UsePagedKeyboardDragWorkflowParams): PagedKeyboardDragWorkflowResult {
  const [keyboardDragActive, setKeyboardDragActive] = useState(false)
  const keyboardPointRef = useRef<{ x: number; y: number } | null>(null)

  const pageAwareKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
    const coordinates = sortableKeyboardCoordinates(event, args)
    if (!coordinates) return coordinates

    const gridRect = gridRef.current?.getBoundingClientRect()
    if (!gridRect || (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')) {
      keyboardPointRef.current = coordinates
      return coordinates
    }

    const transition = resolveKeyboardPageTransition({
      key: event.code,
      currentPage: currentPageRef.current,
      pageCount,
      currentX: coordinates.x,
      currentY: coordinates.y,
      gridLeft: gridRect.left,
      gridTop: gridRect.top,
      gridRight: gridRect.right,
      itemWidth,
      itemHeight,
      columns,
      rows,
      gridGap,
    })
    if (transition) {
      currentPageRef.current = transition.page
      setCurrentPage(transition.page)
      keyboardPointRef.current = transition.point
      return transition.point
    }

    keyboardPointRef.current = coordinates
    return coordinates
  }

  const keyboardSensors = useSensors(
    useSensor(KeyboardSensor, { coordinateGetter: pageAwareKeyboardCoordinates })
  )

  const resolveKeyboardPoint = (itemId: string) => {
    const gridRect = gridRef.current?.getBoundingClientRect()
    const layoutWidth = columns * itemWidth + Math.max(0, columns - 1) * gridGap
    const layoutHeight = rows * itemHeight + Math.max(0, rows - 1) * gridGap
    const cellPoint = gridRect
      ? resolveKeyboardGridCellCenter({
          id: itemId,
          currentPage: currentPageRef.current,
          columns,
          rows,
          pageSize: pageSizeRef.current,
          itemWidth,
          itemHeight,
          gridGap,
          gridLeft: gridRect.left,
          gridTop: gridRect.top,
          scaleX: layoutWidth > 0 ? gridRect.width / layoutWidth : 1,
          scaleY: layoutHeight > 0 ? gridRect.height / layoutHeight : 1,
        })
      : null
    if (cellPoint) return cellPoint

    const node = tileRefs.current.get(itemId)
    const rect = node?.getBoundingClientRect()
    if (rect) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const pointer = dragPointerRef.current
    return pointer ? { x: pointer.pointerX, y: pointer.pointerY } : null
  }

  const handleKeyboardDragStart = (event: DragStartEvent) => {
    if (selectionMode || dragRef.current || pendingRef.current) return
    const itemId = String(event.active.id)
    const point = resolveKeyboardPoint(itemId)
    const node = tileRefs.current.get(itemId)
    if (!point || !node) return
    keyboardPointRef.current = { x: point.x, y: point.y }

    dragOriginFocusRef.current = captureDragOriginFocus(node)
    pendingPointerCaptureTargetRef.current = null
    const rect = node.getBoundingClientRect()
    beginDrag(
      {
        context: 'outer',
        sourceFolderId: null,
        activateOnMove: true,
        pointerId: KEYBOARD_POINTER_ID,
        itemId,
        startX: point.x,
        startY: point.y,
        offsetX: rect.width / 2,
        offsetY: rect.height / 2,
      },
      point.x,
      point.y
    )
    const activeDrag = dragRef.current as DragState | null
    setKeyboardDragActive(activeDrag?.pointerId === KEYBOARD_POINTER_ID)
  }

  const handleKeyboardDragMove = (event: DragMoveEvent) => {
    if (dragRef.current?.pointerId !== KEYBOARD_POINTER_ID) return
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : activeId
    const point =
      resolveKeyboardPoint(overId) ??
      resolveKeyboardPoint(activeId) ??
      keyboardPointRef.current
    if (point) scheduleDragMove(KEYBOARD_POINTER_ID, point.x, point.y)
  }

  const handleKeyboardDragEnd = (event: DragEndEvent) => {
    if (dragRef.current?.pointerId === KEYBOARD_POINTER_ID) {
      const activeId = String(event.active.id)
      const overId = event.over ? String(event.over.id) : activeId
      const point =
        resolveKeyboardPoint(overId) ??
        resolveKeyboardPoint(activeId) ??
        keyboardPointRef.current
      if (point) flushDragMove(KEYBOARD_POINTER_ID, point.x, point.y)
      finishActiveDrag(KEYBOARD_POINTER_ID)
    }
    setKeyboardDragActive(false)
    keyboardPointRef.current = null
  }

  const handleKeyboardDragCancel = (_event: DragCancelEvent) => {
    if (dragRef.current?.pointerId === KEYBOARD_POINTER_ID) {
      cancelActiveDrag(KEYBOARD_POINTER_ID)
    }
    setKeyboardDragActive(false)
    keyboardPointRef.current = null
  }

  return {
    keyboardSensors,
    keyboardDragActive,
    handleKeyboardDragStart,
    handleKeyboardDragMove,
    handleKeyboardDragEnd,
    handleKeyboardDragCancel,
  }
}
