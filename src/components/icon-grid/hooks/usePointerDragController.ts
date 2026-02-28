import { useEffect, type MutableRefObject } from 'react'

interface PendingPointerDrag {
  pointerId: number
  startX: number
  startY: number
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
  finishDragFnRef: MutableRefObject<(pointerId: number) => void>
  clearPendingFnRef: MutableRefObject<() => void>
  cancelDragFnRef: MutableRefObject<(pointerId: number) => void>
  dragMoveThreshold: number
}

export function usePointerDragController<
  TPending extends PendingPointerDrag,
  TActive extends ActivePointerDrag,
>({
  pendingRef,
  dragRef,
  beginDragFnRef,
  onDragMoveFnRef,
  finishDragFnRef,
  clearPendingFnRef,
  cancelDragFnRef,
  dragMoveThreshold,
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
      if (distance > dragMoveThreshold) {
        beginDragFnRef.current(pending, event.clientX, event.clientY)
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) {
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
    dragMoveThreshold,
    dragRef,
    finishDragFnRef,
    onDragMoveFnRef,
    pendingRef,
    cancelDragFnRef,
  ])
}
