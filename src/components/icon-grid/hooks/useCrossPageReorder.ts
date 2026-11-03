import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { MOTION_SPRING_EASING } from '../constants'
import {
  reconcileCrossPageReorder,
  projectPageAnchor,
  type CrossPageLayout,
  type CrossPageFlight,
  type CrossPageReorderState,
} from '../domain/crossPageReorder'
import { getReorderAnimationDuration, readCurrentTranslate } from './reorderMotion'

interface Geometry {
  itemWidth: number
  itemHeight: number
  gap: number
}
interface RunningFlight {
  flight: CrossPageFlight
  baseIndex: number
  node: HTMLDivElement
  animation: Animation
}

/** Keeps departing tiles mounted until they leave the viewport; returning tiles reuse the same node. */
export function useCrossPageReorder(layout: CrossPageLayout, geometry: Geometry) {
  const reduced = useReducedMotion() ?? false
  const [state, setState] = useState<CrossPageReorderState>(() => ({ layout, flights: new Map() }))
  let current = state
  if (
    state.layout.entries !== layout.entries ||
    state.layout.order !== layout.order ||
    state.layout.hiddenIds !== layout.hiddenIds ||
    state.layout.page !== layout.page ||
    state.layout.pageSize !== layout.pageSize ||
    state.layout.columns !== layout.columns
  ) {
    current = reconcileCrossPageReorder(state, layout)
    if (reduced) current = { layout, flights: new Map() }
    setState(current)
  }
  const nodes = useRef(new Map<string, HTMLDivElement>())
  const running = useRef(new Map<string, RunningFlight>())
  const bindNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) nodes.current.set(id, node)
    else nodes.current.delete(id)
  }, [])
  const flights = current.flights
  const { itemWidth, itemHeight, gap } = geometry

  useLayoutEffect(() => {
    const active = running.current
    active.forEach((record, id) => {
      if (flights.has(id) && !reduced) return
      active.delete(id)
      record.animation.cancel()
      record.node.style.willChange = ''
    })
    flights.forEach((flight, id) => {
      const node = nodes.current.get(id)
      if (!node || active.get(id)?.flight === flight) return
      const complete = () =>
        setState(previous => {
          if (previous.flights.get(id) !== flight) return previous
          const next = new Map(previous.flights)
          next.delete(id)
          return { ...previous, flights: next }
        })
      if (reduced || typeof node.animate !== 'function') {
        complete()
        return
      }
      startFlight({
        node,
        flight,
        active,
        layout,
        geometry: { itemWidth, itemHeight, gap },
        complete,
      })
    })
  }, [flights, reduced, layout, itemWidth, itemHeight, gap])
  useLayoutEffect(() => {
    const active = running.current
    return () => {
      active.forEach(record => {
        record.animation.cancel()
        record.node.style.willChange = ''
      })
      active.clear()
    }
  }, [])

  return {
    entries: [
      ...layout.entries,
      ...[...flights.values()].filter(flight => flight.exiting).map(flight => flight.entry),
    ],
    flightIds: new Set(flights.keys()),
    bindNode,
  }
}

function startFlight({
  node,
  flight,
  active,
  layout,
  geometry,
  complete,
}: {
  node: HTMLDivElement
  flight: CrossPageFlight
  active: Map<string, RunningFlight>
  layout: CrossPageLayout
  geometry: Geometry
  complete: () => void
}) {
  const id = flight.entry.id
  const previous = active.get(id)
  const grid = node.parentElement!
  const viewport = node.closest('[data-edge-paging-viewport]')
  const gridWidth = layout.columns * (geometry.itemWidth + geometry.gap) - geometry.gap
  const scale = grid.getBoundingClientRect().width / Math.max(1, gridWidth) || 1
  const coordinates = {
    page: layout.page,
    pageSize: layout.pageSize,
    columns: layout.columns,
    stepX: geometry.itemWidth + geometry.gap,
    stepY: geometry.itemHeight + geometry.gap,
    pagePitch: (viewport?.getBoundingClientRect().width ?? gridWidth) / scale,
    rtl: getComputedStyle(grid).direction === 'rtl',
  }
  const baseIndex = flight.entry.globalIndex
  const base = projectPageAnchor(baseIndex, coordinates)
  const origin = projectPageAnchor(previous?.baseIndex ?? flight.fromIndex, coordinates)
  const destination = projectPageAnchor(flight.toIndex, coordinates)
  const translate = readCurrentTranslate(node)
  const from = { x: origin.x - base.x + translate.x, y: origin.y - base.y + translate.y }
  const to = { x: destination.x - base.x, y: destination.y - base.y }
  previous?.animation.cancel()
  node.style.willChange = 'transform'
  const animation = node.animate(
    [
      { transform: 'translate3d(' + from.x + 'px,' + from.y + 'px,0)' },
      { transform: 'translate3d(' + to.x + 'px,' + to.y + 'px,0)' },
    ],
    {
      duration: getReorderAnimationDuration(
        to.x - from.x,
        to.y - from.y,
        Math.max(coordinates.stepX, coordinates.stepY)
      ),
      easing: MOTION_SPRING_EASING,
      fill: 'both',
    }
  )
  active.set(id, { flight, baseIndex, node, animation })
  animation.onfinish = () => {
    if (active.get(id)?.animation === animation) complete()
  }
}
