import { useEffect, type MutableRefObject } from 'react'
import { resolvePendingDragMoveAction } from './dragActivationPolicy'

interface PendingPointerDrag {
  pointerId: number
  startX: number
  startY: number
  activateOnMove?: boolean
}

interface ActivePointerDrag {
  pointerId: number
}

interface UsePointerDragControllerParams<
  TPending extends PendingPointerDrag,
  TActive extends ActivePointerDrag,
> {
  pendingRef: MutableRefObject<TPending | null>
  dragRef: MutableRefObject<TActive | null>
  beginDragFnRef: MutableRefObject<(pending: TPending, x: number, y: number) => void>
  onDragMoveFnRef: MutableRefObject<(pointerId: number, x: number, y: number) => void>
  flushDragMoveFnRef: MutableRefObject<(pointerId: number, x: number, y: number) => void>
  finishDragFnRef: MutableRefObject<(pointerId: number) => void>
  clearPendingFnRef: MutableRefObject<() => void>
  abortPendingFnRef: MutableRefObject<(pointerId: number) => void>
  cancelDragFnRef: MutableRefObject<(pointerId: number) => void>
  pendingMoveTolerance: number
}

export function usePointerDragController<
  TPending extends PendingPointerDrag,
  TActive extends ActivePointerDrag,
>({
  pendingRef,
  dragRef,
  beginDragFnRef,
  onDragMoveFnRef,
  flushDragMoveFnRef,
  finishDragFnRef,
  clearPendingFnRef,
  abortPendingFnRef,
  cancelDragFnRef,
  pendingMoveTolerance,
}: UsePointerDragControllerParams<TPending, TActive>) {
  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const current = dragRef.current
      if (current && current.pointerId === event.pointerId) {
        event.preventDefault()
        onDragMoveFnRef.current(event.pointerId, event.clientX, event.clientY)
        return
      }

      const pending = pendingRef.current
      if (!pending || pending.pointerId !== event.pointerId) return
      const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY)
      const action = resolvePendingDragMoveAction(pending, distance, pendingMoveTolerance)
      if (action === 'begin') {
        beginDragFnRef.current(pending, event.clientX, event.clientY)
      } else if (action === 'abort') {
        abortPendingFnRef.current(event.pointerId)
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        flushDragMoveFnRef.current(event.pointerId, event.clientX, event.clientY)
        finishDragFnRef.current(event.pointerId)
        return
      }
      if (pendingRef.current?.pointerId === event.pointerId) {
        clearPendingFnRef.current()
      }
    }

    const handlePointerCancel = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        cancelDragFnRef.current(event.pointerId)
      }
      if (pendingRef.current?.pointerId === event.pointerId) {
        clearPendingFnRef.current()
      }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
    }
  }, [
    beginDragFnRef,
    clearPendingFnRef,
    abortPendingFnRef,
    pendingMoveTolerance,
    dragRef,
    finishDragFnRef,
    flushDragMoveFnRef,
    onDragMoveFnRef,
    pendingRef,
    cancelDragFnRef,
  ])
}
