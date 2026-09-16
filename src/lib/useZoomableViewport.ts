import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

export interface ZoomableViewState {
  scale: number
  x: number
  y: number
}

interface ViewportBounds {
  width: number
  height: number
}

/** 把平移量限制在「当前缩放放大量」内，避免图片被拖出可视区域。 */
function clampZoomView(view: ZoomableViewState, bounds: ViewportBounds | null): ZoomableViewState {
  if (view.scale <= 1) return { scale: view.scale, x: 0, y: 0 }
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return { scale: view.scale, x: 0, y: 0 }
  }
  const maxX = (bounds.width * (view.scale - 1)) / 2
  const maxY = (bounds.height * (view.scale - 1)) / 2
  return {
    scale: view.scale,
    x: Math.min(maxX, Math.max(-maxX, view.x)),
    y: Math.min(maxY, Math.max(-maxY, view.y)),
  }
}

interface UseZoomableViewportOptions {
  /** 缩放上限。 */
  maxScale?: number
  /**
   * 缩放下限。默认 1 = 最小只能回到「适应窗口」大小；
   * 传小于 1 的值（如 0.25）允许滚轮继续缩小到比初始显示更小。
   * 平移只在 scale > 1（图片超出视口）时可用，更小时图片始终居中。
   */
  minScale?: number
  /** 单次滚轮/按钮的缩放步进系数。 */
  wheelFactor?: number
}

/**
 * 图片查看的缩放与拖动：滚轮缩放（原生非 passive 监听以阻止页面滚动）、
 * 按住拖动平移、双击复位；另提供 zoomIn/zoomOut/reset 供按钮与键盘操作。
 *
 * viewportRef 是回调 ref：元素每次挂载都会重新挂滚轮监听（React 保证 ref
 * 在挂载时同步调用），比「useEffect 读一次 ref」更能扛条件渲染与 key 重挂——
 * 后者一旦错过首次执行时机，缩放会静默失效。
 */
export function useZoomableViewport(options: UseZoomableViewportOptions = {}) {
  const { maxScale = 5, minScale = 1, wheelFactor = 1.2 } = options
  const viewportElementRef = useRef<HTMLDivElement | null>(null)
  const detachWheelRef = useRef<(() => void) | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    baseX: number
    baseY: number
  } | null>(null)
  const [view, setView] = useState<ZoomableViewState>({ scale: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const applyStep = useCallback(
    (factor: number) => {
      setView(current => {
        const scale = Math.min(maxScale, Math.max(minScale, current.scale * factor))
        const bounds = viewportElementRef.current?.getBoundingClientRect() ?? null
        return clampZoomView({ ...current, scale }, bounds)
      })
    },
    [maxScale, minScale]
  )

  const zoomIn = useCallback(() => applyStep(wheelFactor), [applyStep, wheelFactor])
  const zoomOut = useCallback(() => applyStep(1 / wheelFactor), [applyStep, wheelFactor])
  const reset = useCallback(() => setView({ scale: 1, x: 0, y: 0 }), [])

  const viewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      viewportElementRef.current = element
      detachWheelRef.current?.()
      detachWheelRef.current = null
      if (!element) return
      const handleWheel = (event: WheelEvent) => {
        // React 的 wheel 合成监听是 passive 的，无法 preventDefault 阻止页面滚动，需挂原生非 passive 监听。
        event.preventDefault()
        applyStep(event.deltaY < 0 ? wheelFactor : 1 / wheelFactor)
      }
      element.addEventListener('wheel', handleWheel, { passive: false })
      detachWheelRef.current = () => element.removeEventListener('wheel', handleWheel)
    },
    [applyStep, wheelFactor]
  )

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (view.scale <= 1) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: view.x,
      baseY: view.y,
    }
    setDragging(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setView(current =>
      clampZoomView(
        {
          ...current,
          x: drag.baseX + event.clientX - drag.startX,
          y: drag.baseY + event.clientY - drag.startY,
        },
        viewportElementRef.current?.getBoundingClientRect() ?? null
      )
    )
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return {
    view,
    setView,
    viewportRef,
    dragging,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
    },
    reset,
    zoomIn,
    zoomOut,
  }
}
