import { useLayoutEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { mountFocusedItemForeground } from './focusedItemForeground'
import {
  ITEM_MENU_HIT_CLEARANCE,
  itemFocusBackdropClip,
  type FocusedItemVisual,
  type MenuRect,
} from './focusedItemMenuGeometry'

interface FocusedItemPresentationProps {
  targetRef: RefObject<HTMLElement | null>
  visual: FocusedItemVisual
  viewport: MenuRect
}

export function FocusedItemPresentation({
  targetRef,
  visual,
  viewport,
}: FocusedItemPresentationProps) {
  const foregroundRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!targetRef.current || !foregroundRef.current) return
    return mountFocusedItemForeground(targetRef.current, foregroundRef.current)
  }, [targetRef, visual])
  return createPortal(
    <div data-focused-item-presentation>
      <div
        data-item-focus-glass
        aria-hidden="true"
        className="window-portal-overlay pointer-events-none fixed z-[280] bg-background/20 backdrop-blur-[2px] dark:bg-background/30"
      />
      <div
        data-item-focus-backdrop
        aria-hidden="true"
        className="window-portal-overlay fixed z-[280]"
        style={{
          clipPath: itemFocusBackdropClip(
            { ...visual, padding: ITEM_MENU_HIT_CLEARANCE },
            viewport
          ),
        }}
      />
      <div
        ref={foregroundRef}
        aria-hidden="true"
        inert
        className="pointer-events-none fixed inset-0 z-[281] overflow-visible"
      />
    </div>,
    document.body
  )
}
