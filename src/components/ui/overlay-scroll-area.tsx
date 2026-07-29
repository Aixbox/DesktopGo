import * as React from 'react'
import * as ScrollArea from '@radix-ui/react-scroll-area'

import { cn } from '@/lib/utils'

const scrollbarSize = 16

// Radix must own the thumb's main-axis size so its endpoint calculation stays accurate.
const thumbBaseClassName =
  'group relative flex-1 rounded-full bg-transparent focus-visible:outline-none'

type OverlayScrollAreaProps = React.ComponentPropsWithoutRef<typeof ScrollArea.Viewport> & {
  className?: string
  viewportClassName?: string
  scrollbars?: 'vertical' | 'both'
}

function OverlayScrollbars({ scrollbars }: Pick<OverlayScrollAreaProps, 'scrollbars'>) {
  const hasHorizontalScrollbar = scrollbars === 'both'

  return (
    <>
      <ScrollArea.Scrollbar
        orientation="vertical"
        className="absolute right-0 top-0 z-20 flex w-4 touch-none select-none bg-transparent p-[3px]"
        style={{ bottom: hasHorizontalScrollbar ? scrollbarSize : 0 }}
      >
        <ScrollArea.Thumb className={thumbBaseClassName}>
          <span className="pointer-events-none absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-foreground/18 transition-colors group-hover:bg-foreground/34 group-active:bg-foreground/48" />
        </ScrollArea.Thumb>
      </ScrollArea.Scrollbar>

      {hasHorizontalScrollbar ? (
        <>
          <ScrollArea.Scrollbar
            orientation="horizontal"
            className="absolute bottom-0 left-0 z-20 flex h-4 flex-col touch-none select-none bg-transparent p-[3px]"
            style={{ right: scrollbarSize }}
          >
            <ScrollArea.Thumb className={thumbBaseClassName}>
              <span className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-foreground/18 transition-colors group-hover:bg-foreground/34 group-active:bg-foreground/48" />
            </ScrollArea.Thumb>
          </ScrollArea.Scrollbar>
          <ScrollArea.Corner className="bg-transparent" />
        </>
      ) : null}
    </>
  )
}

const OverlayScrollArea = React.forwardRef<HTMLDivElement, OverlayScrollAreaProps>(
  ({ className, viewportClassName, scrollbars = 'vertical', children, ...viewportProps }, ref) => (
    <ScrollArea.Root type="always" className={cn('relative overflow-hidden', className)}>
      <ScrollArea.Viewport
        ref={ref}
        className={cn('h-full w-full', viewportClassName)}
        {...viewportProps}
      >
        {children}
      </ScrollArea.Viewport>
      <OverlayScrollbars scrollbars={scrollbars} />
    </ScrollArea.Root>
  )
)

OverlayScrollArea.displayName = 'OverlayScrollArea'

export { OverlayScrollArea }
