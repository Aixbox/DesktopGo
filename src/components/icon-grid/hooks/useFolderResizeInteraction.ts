import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FolderSize, GridSpan } from '../model'
import {
  folderSizeFromSpan,
  getFolderResizeVisualGeometry,
  resolveFolderResizeGesture,
} from '../domain/folderResizePolicy'

interface ResizeSession {
  pointerId: number
  baseSpan: GridSpan
  startX: number
  startY: number
  latest: GridSpan
  moved: boolean
}

export interface FolderResizeInteractionParams {
  visible: boolean
  span: GridSpan
  cellWidth: number
  cellHeight: number
  gridGap: number
  rtl: boolean
  onPreview: (size: FolderSize) => void
  onCommit: (size: FolderSize) => void
  onCancel: () => void
}

export interface FolderResizeInteraction {
  active: boolean
  hotSize: number
  startPointerResize: (event: ReactPointerEvent<HTMLButtonElement>) => void
  movePointerResize: (event: ReactPointerEvent<HTMLButtonElement>) => void
  finishPointerResize: (event: ReactPointerEvent<HTMLButtonElement>, cancelled?: boolean) => void
}

export function useFolderResizeInteraction({
  visible,
  span,
  cellWidth,
  cellHeight,
  gridGap,
  rtl,
  onPreview,
  onCommit,
  onCancel,
}: FolderResizeInteractionParams): FolderResizeInteraction {
  const sessionRef = useRef<ResizeSession | null>(null)
  const [active, setActive] = useState(false)
  const hotSize = getFolderResizeVisualGeometry(span).hotSize

  const startPointerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!visible && !active) return
    if (!event.isPrimary || sessionRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    sessionRef.current = {
      pointerId: event.pointerId,
      baseSpan: span,
      startX: event.clientX,
      startY: event.clientY,
      latest: span,
      moved: false,
    }
    setActive(true)
  }

  const movePointerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const result = resolveFolderResizeGesture({
      baseSpan: session.baseSpan,
      deltaX: event.clientX - session.startX,
      deltaY: event.clientY - session.startY,
      cellWidth,
      cellHeight,
      spacingX: gridGap,
      spacingY: gridGap,
      rtl,
    })
    const previousSpan = session.latest
    session.latest = result.span
    session.moved = result.changed
    const spanChanged =
      previousSpan.cols !== result.span.cols || previousSpan.rows !== result.span.rows
    if (result.changed || spanChanged) onPreview(folderSizeFromSpan(result.span))
  }

  const finishPointerResize = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    event.stopPropagation()
    const session = sessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    sessionRef.current = null
    setActive(false)
    if (!cancelled && session.moved) onCommit(folderSizeFromSpan(session.latest))
    else onCancel()
  }

  return { active, hotSize, startPointerResize, movePointerResize, finishPointerResize }
}
