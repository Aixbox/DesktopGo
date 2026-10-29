import type { GridItem, WidgetItem } from '../model'
import { getId } from '../model'
import { buildCanonicalPlacements } from './canonicalLayout'
import { compactEmptyPages } from './slots'
import { normalizeOuterSlots } from './topLevelLayout'
import { commitWidgetResize, previewWidgetResize } from './widgetResize'
import { serializeItems } from '../services/layoutStore'

export interface WidgetResizeLayoutRequest {
  items: GridItem[]
  slots: Array<string | null>
  dockKeys: Array<string | null>
  pageSize: number
  columns: number
  widgetId: string
  nextSpanX: number
  nextSpanY: number
  revision: number
}

export interface WidgetResizeLayoutResult {
  items: GridItem[]
  slots: Array<string | null>
  revision: number
}

/** Apply a provider resize to the canonical workspace projection atomically. */
export const applyWidgetResizeLayout = (
  request: WidgetResizeLayoutRequest
): WidgetResizeLayoutResult | null => {
  const widget = request.items.find(
    (item): item is WidgetItem => item.kind === 'widget' && item.id === request.widgetId
  )
  if (!widget) return null

  const columns = Math.max(1, Math.floor(request.columns))
  const pageSize = Math.max(1, Math.floor(request.pageSize))
  const widgetId = getId(widget)
  const placements = buildCanonicalPlacements({
    items: serializeItems(request.items),
    slots: request.slots,
    dockKeys: request.dockKeys,
    pageSize,
    columns,
  })
  const placement = placements.find(candidate => candidate.id === widgetId)
  if (!placement || placement.container !== 'workspace') return null

  const preview = previewWidgetResize({
    snapshot: { revision: request.revision, placements },
    grid: { columns, rows: Math.max(1, Math.ceil(pageSize / columns)) },
    request: {
      widgetId,
      sourceRevision: request.revision,
      nextSpanX: request.nextSpanX,
      nextSpanY: request.nextSpanY,
      bounds: {
        minSpanX: widget.minSpanX,
        minSpanY: widget.minSpanY,
        maxSpanX: widget.maxSpanX,
        maxSpanY: widget.maxSpanY,
      },
    },
  })
  const committed = commitWidgetResize({
    snapshot: { revision: request.revision, placements },
    preview,
    sourceRevision: request.revision,
  })
  const nextPlacement = committed?.placements.find(candidate => candidate.id === widgetId)
  if (!committed || !nextPlacement) return null

  const items = request.items.map(item =>
    item.kind === 'widget' && item.id === request.widgetId
      ? { ...item, spanX: nextPlacement.spanX, spanY: nextPlacement.spanY }
      : item
  )
  const anchorIndex =
    nextPlacement.page * pageSize + nextPlacement.row * columns + nextPlacement.col
  const slots = compactEmptyPages(
    normalizeOuterSlots(request.slots, items, pageSize, columns, {
      preferredAnchorById: new Map([[widgetId, anchorIndex]]),
      spillStrategy: 'row-major-forward',
    }),
    pageSize
  )
  return { items, slots, revision: committed.revision }
}
