import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Grip,
} from 'lucide-react'
import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import type { GridSpan, WidgetItem } from '../model'
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
  const width = span.cols * slotWidth + Math.max(0, span.cols - 1) * gridGap
  const height = span.rows * slotHeight + Math.max(0, span.rows - 1) * gridGap
  const canShrinkX = widget.spanX > widget.minSpanX
  const canShrinkY = widget.spanY > widget.minSpanY
  const canGrowX = widget.spanX < widget.maxSpanX
  const canGrowY = widget.spanY < widget.maxSpanY

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

  return (
    <div
      data-widget-id={widget.id}
      data-widget-provider={widget.provider}
      data-widget-span={`${widget.spanX}x${widget.spanY}`}
      className={`relative flex h-full w-full touch-none flex-col overflow-hidden rounded-[var(--radius-folder-surface)] border bg-background/52 p-3 text-foreground shadow-[0_8px_22px_rgba(15,23,42,0.12)] backdrop-blur-lg dark:border-white/16 dark:bg-black/28 dark:text-white/90 ${
        dragPreview ? 'opacity-85' : ''
      }`}
      style={{ width, height, borderRadius: scaledRadius(18) }}
      onPointerDown={onPointerDown}
      role="group"
      aria-label={`${widget.label} (${widget.spanX}×${widget.spanY})`}
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
          {widget.spanX}×{widget.spanY}
        </span>
      </div>
      {onResize ? (
        <div className="mt-2 grid grid-cols-4 items-center justify-end gap-1">
          <button
            type="button"
            aria-label="缩小 Widget 宽度"
            title="缩小宽度"
            disabled={!canShrinkX}
            className={resizeButtonClass}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              resizeAxis('x', -1)
            }}
          >
            <ArrowLeftToLine className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="放大 Widget 宽度"
            title="放大宽度"
            disabled={!canGrowX}
            className={resizeButtonClass}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              resizeAxis('x', 1)
            }}
          >
            <ArrowRightToLine className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="缩小 Widget 高度"
            title="缩小高度"
            disabled={!canShrinkY}
            className={resizeButtonClass}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              resizeAxis('y', -1)
            }}
          >
            <ArrowUpToLine className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="放大 Widget 高度"
            title="放大高度"
            disabled={!canGrowY}
            className={resizeButtonClass}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              resizeAxis('y', 1)
            }}
          >
            <ArrowDownToLine className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
})
