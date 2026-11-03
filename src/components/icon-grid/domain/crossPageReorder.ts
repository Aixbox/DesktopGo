import type { PageAnchorEntry } from './topLevelLayout'

export interface CrossPageLayout {
  page: number
  pageSize: number
  columns: number
  entries: PageAnchorEntry[]
  order: Array<string | null>
  hiddenIds: readonly string[]
}
export interface CrossPageFlight {
  entry: PageAnchorEntry
  fromIndex: number
  toIndex: number
  exiting: boolean
}
export interface CrossPageReorderState {
  layout: CrossPageLayout
  flights: Map<string, CrossPageFlight>
}

/** Retain only actual page transfers: deletes, folder merges and dragged items are not exits. */
export function reconcileCrossPageReorder(
  previous: CrossPageReorderState,
  layout: CrossPageLayout
): CrossPageReorderState {
  const before = previous.layout
  if (
    before.page !== layout.page ||
    before.pageSize !== layout.pageSize ||
    before.columns !== layout.columns
  ) {
    return { layout, flights: new Map() }
  }
  const hidden = new Set(layout.hiddenIds)
  const previouslyHidden = new Set(before.hiddenIds)
  const nextEntries = new Map(layout.entries.map(entry => [entry.id, entry]))
  const nextIndices = new Map(layout.order.map((id, index) => [id, index]))
  const oldIndices = new Map(before.order.map((id, index) => [id, index]))
  const candidates = new Map(before.entries.map(entry => [entry.id, entry]))
  previous.flights.forEach(flight => candidates.set(flight.entry.id, flight.entry))
  layout.entries.forEach(entry => {
    if (!candidates.has(entry.id)) candidates.set(entry.id, entry)
  })
  const flights = new Map<string, CrossPageFlight>()
  candidates.forEach((entry, id) => {
    if (hidden.has(id) || previouslyHidden.has(id)) return
    const next = nextEntries.get(id)
    const toIndex = nextIndices.get(id)
    if (toIndex === undefined) return
    const active = previous.flights.get(id)
    const fromIndex = active?.fromIndex ?? oldIndices.get(id)
    if (fromIndex === undefined) return
    const exiting = !next && Math.floor(toIndex / layout.pageSize) !== layout.page
    const entering = !!next && Math.floor(fromIndex / layout.pageSize) !== layout.page
    if (!active && !exiting && !entering) return
    if (!next && !exiting) return
    const rendered = next ?? entry
    const flight = { entry: rendered, fromIndex, toIndex, exiting }
    flights.set(
      id,
      active &&
        active.toIndex === toIndex &&
        active.exiting === exiting &&
        active.entry.globalIndex === rendered.globalIndex &&
        active.entry.item === rendered.item
        ? active
        : flight
    )
  })
  const unchanged =
    flights.size === previous.flights.size &&
    [...flights].every(([id, flight]) => previous.flights.get(id) === flight)
  return { layout, flights: unchanged ? previous.flights : flights }
}

/** Off-page coordinates use viewport pitch, retaining the actual destination row and column. */
export function projectPageAnchor(
  index: number,
  geometry: {
    page: number
    pageSize: number
    columns: number
    stepX: number
    stepY: number
    pagePitch: number
    rtl: boolean
  }
) {
  const local = index % geometry.pageSize
  const pageDelta = Math.floor(index / geometry.pageSize) - geometry.page
  const column = local % geometry.columns
  return {
    x:
      pageDelta * geometry.pagePitch * (geometry.rtl ? -1 : 1) +
      (geometry.rtl ? geometry.columns - 1 - column : column) * geometry.stepX,
    y: Math.floor(local / geometry.columns) * geometry.stepY,
  }
}
