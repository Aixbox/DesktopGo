import { useCallback, useEffect, useRef, useState } from 'react'
import type { LayoutThumbnail } from './layoutLibrary'

/** 悬停多久才弹出来：划过一排卡片时不该一路闪。 */
const HOVER_DELAY_MS = 320

export interface HoverPreviewAnchor {
  thumbnail: LayoutThumbnail | null
  /** 卡片在屏幕上的位置，浮层贴着它居中。 */
  rect: DOMRect
}

/**
 * 卡片悬停放大预览的状态。
 *
 * 滚轮、滚动、窗口缩放都会把浮层收掉：这几种操作会让卡片在屏幕上挪位置，
 * 浮层跟着卡片走反而更乱，收起来重新悬停更干净。
 */
export function useLayoutHoverPreview(delay = HOVER_DELAY_MS) {
  const [anchor, setAnchor] = useState<HoverPreviewAnchor | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setAnchor(null)
  }, [clearTimer])

  const show = useCallback(
    (element: HTMLElement, thumbnail: LayoutThumbnail | null) => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        setAnchor({ thumbnail, rect: element.getBoundingClientRect() })
      }, delay)
    },
    [clearTimer, delay]
  )

  // 组件卸载时把还没到点的定时器掐掉，别对已卸载的组件 setState。
  useEffect(() => clearTimer, [clearTimer])

  useEffect(() => {
    if (!anchor) return
    const close = () => hide()
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('wheel', close, { passive: true })
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('wheel', close)
    }
  }, [anchor, hide])

  return { anchor, show, hide }
}
