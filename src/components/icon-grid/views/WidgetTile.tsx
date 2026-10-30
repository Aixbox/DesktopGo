import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Grip,
} from 'lucide-react'
import {
  memo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { GridSpan, WidgetItem } from '../model'
import { resolveWidgetResizeGestureSpan } from '../domain/widgetResize'
import { scaledRadius } from './folderVisualPolicy'

interface WidgetTileProps {
  widget: WidgetItem
  span: GridSpan
  slotWidth: number
  slotHeight: number
  gridGap: number
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void
  onResize?: (widgetId: string, spanX: number, spanY: number) => void
  dragPreview?: boolean
}

const clampSpan = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.floor(value)))

const resizeButtonClass =
  'flex h-6 w-6 items-center justify-center rounded-md border border-border/50 text-foreground/65 transition hover:bg-background/70 disabled:pointer-events-none disabled:opacity-30 dark:border-white/16 dark:text-white/70 dark:hover:bg-white/10'

interface ResizePreview {
  spanX: number
  spanY: number
}

interface ResizeSession {
  pointerId: number
  axis: 'x' | 'y'
  direction: 1 | -1
  startX: number
  startY: number
  baseSpanX: number
  baseSpanY: number
  latest: ResizePreview
  moved: boolean
}

export const WidgetTile = memo(function WidgetTile({
  widget,
  span,
  slotWidth,
  slotHeight,
  gridGap,
  onPointerDown,
  onResize,
  dragPreview = false,
}: WidgetTileProps) {
  const resizeSessionRef = useRef<ResizeSession | null>(null)
  const suppressResizeClickRef = useRef(false)
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null)
  const baseSpanX = Math.max(1, span.cols)
  const baseSpanY = Math.max(1, span.rows)
  const effectiveSpanX = resizePreview?.spanX ?? baseSpanX
  const effectiveSpanY = resizePreview?.spanY ?? baseSpanY
  const width = effectiveSpanX * slotWidth + Math.max(0, effectiveSpanX - 1) * gridGap
  const height = effectiveSpanY * slotHeight + Math.max(0, effectiveSpanY - 1) * gridGap
  const canShrinkX = effectiveSpanX > widget.minSpanX
  const canShrinkY = effectiveSpanY > widget.minSpanY
  const canGrowX = effectiveSpanX < widget.maxSpanX
  const canGrowY = effectiveSpanY < widget.maxSpanY

  const resizeAxis = (axis: 'x' | 'y', delta: number) => {
    if (!onResize) return
    const nextSpanX =
      axis === 'x'
        ? clampSpan(widget.spanX + delta, widget.minSpanX, widget.maxSpanX)
        : widget.spanX
    const nextSpanY =
      axis === 'y'
        ? clampSpan(widget.spanY + delta, widget.minSpanY, widget.maxSpanY)
        : widget.spanY
    if (nextSpanX === widget.spanX && nextSpanY === widget.spanY) return
    onResize(widget.id, nextSpanX, nextSpanY)
  }

  const startPointerResize = (
    event: ReactPointerEvent<HTMLButtonElement>,
    axis: 'x' | 'y',
    direction: 1 | -1
  ) => {
    if (!onResize) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeSessionRef.current = {
      pointerId: event.pointerId,
      axis,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      baseSpanX: widget.spanX,
      baseSpanY: widget.spanY,
      latest: { spanX: widget.spanX, spanY: widget.spanY },
      moved: false,
    }
  }

  const movePointerResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const session = resizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    const deltaPixels =
      session.axis === 'x' ? event.clientX - session.startX : event.clientY - session.startY
    const next = resolveWidgetResizeGestureSpan({
      baseSpanX: session.baseSpanX,
      baseSpanY: session.baseSpanY,
      deltaPixels,
      cellPixels: session.axis === 'x' ? slotWidth + gridGap : slotHeight + gridGap,
      axis: session.axis,
      direction: session.direction,
      bounds: {
        minSpanX: widget.minSpanX,
        minSpanY: widget.minSpanY,
        maxSpanX: widget.maxSpanX,
        maxSpanY: widget.maxSpanY,
      },
    })
    if (next.spanX !== session.baseSpanX || next.spanY !== session.baseSpanY) {
      session.moved = true
    }
    session.latest = next
    setResizePreview(next)
  }

  const finishPointerResize = (event: ReactPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const session = resizeSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    resizeSessionRef.current = null
    suppressResizeClickRef.current = session.moved
    setResizePreview(null)
    if (!cancelled && session.moved) {
      onResize?.(widget.id, session.latest.spanX, session.latest.spanY)
    }
  }

  const resizePointerProps = (axis: 'x' | 'y', direction: 1 | -1) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) =>
      startPointerResize(event, axis, direction),
    onPointerMove: movePointerResize,
    onPointerUp: finishPointerResize,
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) =>
      finishPointerResize(event, true),
  })

  const handleResizeClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    axis: 'x' | 'y',
    delta: number
  ) => {
    event.stopPropagation()
    if (suppressResizeClickRef.current) {
      suppressResizeClickRef.current = false
      return
    }
    resizeAxis(axis, delta)
  }

  return (
    <div
      data-widget-id={widget.id}
      data-widget-provider={widget.provider}
      data-widget-span={`${effectiveSpanX}x${effectiveSpanY}`}
      data-widget-resize-frame={resizePreview ? 'active' : 'idle'}
      className={`relative flex h-full w-full touch-none flex-col overflow-hidden rounded-[var(--radius-folder-surface)] border bg-background/52 p-3 text-foreground shadow-[0_8px_22px_rgba(15,23,42,0.12)] backdrop-blur-lg dark:border-white/16 dark:bg-black/28 dark:text-white/90 ${
        dragPreview ? 'opacity-85' : ''
      }`}
      style={{ width, height, borderRadius: scaledRadius(18) }}
      onPointerDown={onPointerDown}
      role="group"
      aria-label={`${widget.label} (${effectiveSpanX}×${effectiveSpanY})`}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
        <Grip
          className="h-3.5 w-3.5 shrink-0 text-foreground/45 dark:text-white/45"
          aria-hidden="true"
        />
        <span className="truncate">{widget.label}</span>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed border-border/55 bg-background/25 text-[10px] text-muted-foreground dark:border-white/18 dark:bg-white/[0.03]">
        <span className="text-center">
          {widget.provider}
          <br />
          {effectiveSpanX}×{effectiveSpanY}
        </span>
      </div>
      {resizePreview ? (
        <div
          data-widget-resize-frame="overlay"
          className="pointer-events-none absolute inset-1 rounded-[var(--radius-folder-surface)] border-2 border-primary/70 bg-primary/8 shadow-[0_0_0_1px_rgba(59,130,246,0.2),0_0_18px_rgba(59,130,246,0.2)] dark:border-sky-200/75 dark:bg-sky-200/8"
          aria-hidden="true"
        />
      ) : null}
      {onResize ? (
        <div className="mt-2 grid grid-cols-4 items-center justify-end gap-1">
          <button
            type="button"
            aria-label="缩小 Widget 宽度"
            title="缩小宽度"
            disabled={!canShrinkX}
            className={resizeButtonClass}
            {...resizePointerProps('x', -1)}
            onClick={event => handleResizeClick(event, 'x', -1)}
          >
            <ArrowLeftToLine className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="放大 Widget 宽度"
            title="放大宽度"
            disabled={!canGrowX}
            className={resizeButtonClass}
            {...resizePointerProps('x', 1)}
            onClick={event => handleResizeClick(event, 'x', 1)}
          >
            <ArrowRightToLine className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="缩小 Widget 高度"
            title="缩小高度"
            disabled={!canShrinkY}
            className={resizeButtonClass}
            {...resizePointerProps('y', -1)}
            onClick={event => handleResizeClick(event, 'y', -1)}
          >
            <ArrowUpToLine className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="放大 Widget 高度"
            title="放大高度"
            disabled={!canGrowY}
            className={resizeButtonClass}
            {...resizePointerProps('y', 1)}
            onClick={event => handleResizeClick(event, 'y', 1)}
          >
            <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
})
