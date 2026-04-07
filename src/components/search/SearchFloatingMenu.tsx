import { cn } from '@/lib/utils'
import {
  useCallback,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

const FLOATING_MENU_GAP = 8
const FLOATING_MENU_MARGIN = 12
const FLOATING_MENU_Z_INDEX = 90
const FLOATING_MENU_VERTICAL_INSET = '1rem'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getFloatingMenuStyle(
  triggerElement: HTMLElement,
  menuElement: HTMLDivElement,
  preferredWidth: number,
  align: 'start' | 'end'
): CSSProperties {
  const triggerRect = triggerElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = Math.min(preferredWidth, viewportWidth - FLOATING_MENU_MARGIN * 2)
  const menuHeight = menuElement.scrollHeight
  const naturalLeft = align === 'start' ? triggerRect.left : triggerRect.right - menuWidth
  const left = clamp(
    naturalLeft,
    FLOATING_MENU_MARGIN,
    Math.max(FLOATING_MENU_MARGIN, viewportWidth - menuWidth - FLOATING_MENU_MARGIN)
  )
  const spaceBelow = viewportHeight - triggerRect.bottom - FLOATING_MENU_MARGIN
  const spaceAbove = triggerRect.top - FLOATING_MENU_MARGIN
  const shouldOpenUpward =
    spaceBelow < Math.min(menuHeight, 320) + FLOATING_MENU_GAP && spaceAbove > spaceBelow
  const maxHeight = Math.max(
    140,
    shouldOpenUpward
      ? triggerRect.top - FLOATING_MENU_GAP - FLOATING_MENU_MARGIN
      : viewportHeight - triggerRect.bottom - FLOATING_MENU_GAP - FLOATING_MENU_MARGIN
  )

  return {
    position: 'fixed',
    left,
    width: menuWidth,
    maxHeight,
    zIndex: FLOATING_MENU_Z_INDEX,
    top: shouldOpenUpward ? undefined : triggerRect.bottom + FLOATING_MENU_GAP,
    bottom: shouldOpenUpward ? viewportHeight - triggerRect.top + FLOATING_MENU_GAP : undefined,
  }
}

function getViewportMaxHeight(maxHeight: CSSProperties['maxHeight'], verticalInset: string) {
  if (typeof maxHeight === 'number') {
    return `calc(${maxHeight}px - ${verticalInset})`
  }

  if (typeof maxHeight === 'string' && maxHeight.length > 0) {
    return `calc(${maxHeight} - ${verticalInset})`
  }

  return undefined
}

interface SearchFloatingMenuProps {
  open: boolean
  triggerRef: RefObject<HTMLElement | null>
  menuRef: RefObject<HTMLDivElement | null>
  width: number
  align?: 'start' | 'end'
  className?: string
  scrollClassName?: string
  contentClassName?: string
  children: ReactNode
}

export function SearchFloatingMenu({
  open,
  triggerRef,
  menuRef,
  width,
  align = 'start',
  className,
  scrollClassName,
  contentClassName = 'p-2',
  children,
}: SearchFloatingMenuProps) {
  const [style, setStyle] = useState<CSSProperties | null>(null)
  const resolvedStyle =
    style ?? {
      position: 'fixed',
      top: FLOATING_MENU_MARGIN,
      left: FLOATING_MENU_MARGIN,
      width:
        typeof window === 'undefined'
          ? width
          : Math.min(width, window.innerWidth - FLOATING_MENU_MARGIN * 2),
      visibility: 'hidden',
      zIndex: FLOATING_MENU_Z_INDEX,
    }
  const viewportMaxHeight = getViewportMaxHeight(
    resolvedStyle.maxHeight,
    FLOATING_MENU_VERTICAL_INSET
  )

  const updatePosition = useCallback(() => {
    const triggerElement = triggerRef.current
    const menuElement = menuRef.current

    if (!triggerElement || !menuElement) {
      return
    }

    setStyle(getFloatingMenuStyle(triggerElement, menuElement, width, align))
  }, [align, menuRef, triggerRef, width])

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }

    updatePosition()

    const handleViewportChange = () => {
      updatePosition()
    }

    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [open, updatePosition])

  if (!open) {
    return null
  }

  return createPortal(
    <div
      ref={menuRef}
      data-search-floating-menu="true"
      className={className}
      style={{
        ...resolvedStyle,
        ['--search-floating-menu-viewport-max-height' as string]: viewportMaxHeight,
      }}
    >
      <div
        className={cn(
          'max-h-[var(--search-floating-menu-viewport-max-height)] overflow-y-auto overflow-x-hidden',
          scrollClassName
        )}
      >
        <div className={contentClassName}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
