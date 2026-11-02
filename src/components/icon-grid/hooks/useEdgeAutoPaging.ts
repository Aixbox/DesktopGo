import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import { getGridItemSpan } from '../model'
import { getPageCountBySlots } from '../domain/slots'
import {
  getEdgePageTarget,
  resolveEdgeDirection,
  IDLE_EDGE_STATE,
} from '../domain/edgePagingPolicy'
import type { EdgePagingState, EdgeTarget } from '../domain/edgePagingPolicy'
import { createEdgePagingSession } from '../domain/edgePagingSession'
import type { DragState } from '../state/types'

interface UseEdgeAutoPagingParams {
  containerRef: MutableRefObject<HTMLDivElement | null>
  dragRef: MutableRefObject<DragState | null>
  setDragState: Dispatch<SetStateAction<DragState | null>>
  currentPageRef: MutableRefObject<number>
  setCurrentPage: Dispatch<SetStateAction<number>>
  pageSizeRef: MutableRefObject<number>
  itemWidth: number
  gridGap: number
  disabled: boolean
  prepare: () => void
  recheck: (drag: DragState) => void
}
export interface EdgePagingControl {
  state: EdgePagingState
  onTransitionStart: (page: number) => void
  onTransitionEnd: (page: number) => void
}

function resolveTarget(
  params: UseEdgeAutoPagingParams,
  previous: EdgePagingState
): EdgeTarget | null {
  const drag = params.dragRef.current
  const viewport = params.containerRef.current?.closest<HTMLElement>('[data-edge-paging-viewport]')
  if (params.disabled || !drag || drag.context !== 'outer' || !viewport) return null
  const span = getGridItemSpan(drag.draggingItem)
  const width = span.cols * params.itemWidth + (span.cols - 1) * params.gridGap
  const outer = viewport.getBoundingClientRect()
  const inner = params.containerRef.current!.getBoundingClientRect()
  const direction = resolveEdgeDirection({
    rect: { left: outer.left, right: outer.right, top: inner.top, bottom: inner.bottom },
    pointer: { x: drag.pointerX, y: drag.pointerY },
    centerX: drag.pointerX - drag.offsetX + width / 2,
    previous: previous.target?.direction,
  })
  if (!direction) return null
  const fromPage = params.currentPageRef.current
  const target = getEdgePageTarget({
    direction,
    rtl: getComputedStyle(viewport).direction === 'rtl',
    page: fromPage,
    order: drag.workingOrder,
    pageSize: params.pageSizeRef.current,
  })
  return target
    ? {
        ...target,
        fromPage,
        direction,
        session: [drag.pointerId, drag.dragStartedAt, drag.draggingId].join(':'),
      }
    : null
}

function flipPage(params: UseEdgeAutoPagingParams, target: EdgeTarget) {
  params.prepare()
  const drag = params.dragRef.current
  if (!drag || drag.context !== 'outer') return
  if (target.createPage) {
    const size = Math.max(1, params.pageSizeRef.current)
    const length = (getPageCountBySlots(drag.workingOrder, size) + 1) * size
    const next = {
      ...drag,
      workingOrder: [
        ...drag.workingOrder,
        ...Array<string | null>(length - drag.workingOrder.length).fill(null),
      ],
    }
    params.dragRef.current = next
    params.setDragState(next)
  }
  params.currentPageRef.current = target.toPage
  params.setCurrentPage(target.toPage)
}

export function useEdgeAutoPaging(params: UseEdgeAutoPagingParams) {
  const runtime = useRef(params)
  useLayoutEffect(() => {
    runtime.current = params
  })
  const [state, setState] = useState(IDLE_EDGE_STATE)
  const sessionRef = useRef<ReturnType<typeof createEdgePagingSession> | null>(null)
  useLayoutEffect(() => {
    const session = createEdgePagingSession({
      later: (callback, delay) => window.setTimeout(callback, delay),
      cancel: timer => window.clearTimeout(timer),
      resolve: previous => resolveTarget(runtime.current, previous),
      publish: setState,
      prepare: () => runtime.current.prepare(),
      flip: target => flipPage(runtime.current, target),
      recheck: () => {
        const drag = runtime.current.dragRef.current
        if (drag) runtime.current.recheck(drag)
      },
    })
    sessionRef.current = session
    return () => {
      session.dispose()
      sessionRef.current = null
    }
  }, [])
  useLayoutEffect(() => {
    if (params.disabled) sessionRef.current?.clear()
  }, [params.disabled])
  const clearEdgeSwitchTimer = useCallback(() => sessionRef.current?.clear(), [])
  const maybeHandleOuterEdgeSwitch = useCallback((drag: DragState, x: number, y: number) => {
    runtime.current.dragRef.current = { ...drag, pointerX: x, pointerY: y }
    return sessionRef.current?.update() ?? false
  }, [])
  const onTransitionStart = useCallback(
    (page: number) => sessionRef.current?.startTransition(page),
    []
  )
  const onTransitionEnd = useCallback(
    (page: number) => sessionRef.current?.finishTransition(page),
    []
  )
  return {
    clearEdgeSwitchTimer,
    maybeHandleOuterEdgeSwitch,
    edgePaging: { state, onTransitionStart, onTransitionEnd } satisfies EdgePagingControl,
  }
}
