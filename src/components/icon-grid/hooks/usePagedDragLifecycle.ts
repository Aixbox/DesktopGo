import { useEffect, type MutableRefObject } from 'react'
import type { DragState, PendingDrag } from '../state/types'
import { usePointerDragController } from './usePointerDragController'

interface DragControllerRefs {
  beginDrag: MutableRefObject<(pending: PendingDrag, x: number, y: number) => void>
  onDragMove: MutableRefObject<(pointerId: number, x: number, y: number) => void>
  flushDragMove: MutableRefObject<(pointerId: number, x: number, y: number) => void>
  finishDrag: MutableRefObject<(pointerId: number) => void>
  clearPending: MutableRefObject<() => void>
  abortPending: MutableRefObject<(pointerId: number) => void>
  cancelDrag: MutableRefObject<(pointerId: number) => void>
}

interface DragControllerActions {
  beginDrag: (pending: PendingDrag, x: number, y: number) => void
  onDragMove: (pointerId: number, x: number, y: number) => void
  flushDragMove: (pointerId: number, x: number, y: number) => void
  finishDrag: (pointerId: number) => void
  clearPending: () => void
  abortPending: (pointerId: number) => void
  cancelDrag: (pointerId: number) => void
}

interface UsePagedDragLifecycleParams {
  pendingRef: MutableRefObject<PendingDrag | null>
  dragRef: MutableRefObject<DragState | null>
  controllerRefs: DragControllerRefs
  actions: DragControllerActions
  pendingMoveTolerance: number
}

export function usePagedDragLifecycle({
  pendingRef,
  dragRef,
  controllerRefs,
  actions,
  pendingMoveTolerance,
}: UsePagedDragLifecycleParams) {
  const armPointerControllerSession = () => {
    controllerRefs.beginDrag.current = actions.beginDrag
    controllerRefs.onDragMove.current = actions.onDragMove
    controllerRefs.flushDragMove.current = actions.flushDragMove
    controllerRefs.finishDrag.current = actions.finishDrag
    controllerRefs.clearPending.current = actions.clearPending
    controllerRefs.abortPending.current = actions.abortPending
    controllerRefs.cancelDrag.current = actions.cancelDrag
  }

  useEffect(() => {
    armPointerControllerSession()
  })

  useEffect(() => {
    const cancelActiveInteractions = () => {
      const activeDrag = dragRef.current
      if (activeDrag) {
        controllerRefs.cancelDrag.current(activeDrag.pointerId)
        return
      }
      if (pendingRef.current) controllerRefs.clearPending.current()
    }

    const handleWindowBlur = () => cancelActiveInteractions()
    const handleDocumentVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelActiveInteractions()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!dragRef.current && !pendingRef.current)) return
      event.preventDefault()
      event.stopPropagation()
      cancelActiveInteractions()
    }

    window.addEventListener('blur', handleWindowBlur)
    document.addEventListener('visibilitychange', handleDocumentVisibilityChange)
    window.addEventListener('keydown', handleEscape, true)
    return () => {
      window.removeEventListener('blur', handleWindowBlur)
      document.removeEventListener('visibilitychange', handleDocumentVisibilityChange)
      window.removeEventListener('keydown', handleEscape, true)
    }
  }, [controllerRefs.cancelDrag, controllerRefs.clearPending, dragRef, pendingRef])

  usePointerDragController({
    pendingRef,
    dragRef,
    beginDragFnRef: controllerRefs.beginDrag,
    onDragMoveFnRef: controllerRefs.onDragMove,
    flushDragMoveFnRef: controllerRefs.flushDragMove,
    finishDragFnRef: controllerRefs.finishDrag,
    clearPendingFnRef: controllerRefs.clearPending,
    abortPendingFnRef: controllerRefs.abortPending,
    cancelDragFnRef: controllerRefs.cancelDrag,
    pendingMoveTolerance,
  })

  return { armPointerControllerSession }
}
