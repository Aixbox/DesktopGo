import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileCrossPageReorder, projectPageAnchor } from './crossPageReorder.ts'
import { getPageAnchorEntries } from './topLevelLayout.ts'
import { planItemResize } from './itemResizeTransaction.ts'

const items = Array.from({ length: 8 }, (_, index) => ({
  kind: 'icon',
  key: String(index),
  icon: {},
}))
function layout(order, options = {}) {
  const config = { page: 0, pageSize: 4, columns: 2, hiddenIds: [], ...options }
  return {
    ...config,
    order,
    entries: getPageAnchorEntries(
      order,
      options.items ?? items,
      config.page,
      config.pageSize,
      config.columns
    ),
  }
}
const initial = before => ({ layout: before, flights: new Map() })

test('full page resize retains every item spilled into another page until animation completes', () => {
  const order = items.map(item => item.key)
  const plan = planItemResize({
    items,
    slots: order,
    dockKeys: [],
    itemId: '0',
    size: '2x2',
    columns: 2,
    pageSize: 4,
  })
  assert.ok(plan)
  const before = layout(order)
  const after = layout(plan.slots, { items: plan.items })
  const next = reconcileCrossPageReorder(initial(before), after)
  assert.deepEqual([...next.flights.keys()].sort(), ['1', '2', '3'])
  next.flights.forEach((flight, id) => {
    assert.equal(flight.exiting, true)
    assert.equal(
      flight.entry,
      before.entries.find(entry => entry.id === id)
    )
    assert.equal(flight.toIndex, plan.slots.indexOf(id))
    assert.ok(flight.toIndex >= 4)
  })
})

test('page-internal moves, deletion, merge and dragged/hidden items do not become cross-page ghosts', () => {
  const before = layout(['0', '1', '2', '3', '4', '5', '6', '7'])
  assert.equal(
    reconcileCrossPageReorder(initial(before), layout(['1', '0', '2', '3', '4', '5', '6', '7']))
      .flights.size,
    0
  )
  assert.equal(
    reconcileCrossPageReorder(initial(before), layout(['0', '1', '2', null, '4', '5', '6', '7']))
      .flights.size,
    0
  )
  const moved = layout(['0', '1', '2', null, '4', '5', '6', '3'], { hiddenIds: ['3'] })
  assert.equal(reconcileCrossPageReorder(initial(before), moved).flights.size, 0)
  assert.equal(
    reconcileCrossPageReorder(initial({ ...before, hiddenIds: ['3'] }), { ...moved, hiddenIds: [] })
      .flights.size,
    0
  )
})

test('returning spill reuses the retained item and new destination; no duplicate render entry', () => {
  const before = layout(['0', '1', '2', '3', '4', '5', null, null])
  const after = layout(['0', '1', '2', null, '4', '5', '3', null])
  const departure = reconcileCrossPageReorder(initial(before), after)
  const returned = reconcileCrossPageReorder(
    departure,
    layout(['0', '1', '3', '2', '4', '5', null, null])
  )
  const flight = returned.flights.get('3')
  assert.equal(flight.exiting, false)
  assert.equal(flight.toIndex, 2)
  assert.equal(flight.entry.globalIndex, 2)
  assert.equal([...returned.flights.values()].filter(f => f.exiting).length, 0)
})

test('arrivals project their true previous offscreen page and changes in unrelated items do not restart', () => {
  const before = layout(['0', '1', '2', null, '4', '5', '3', null])
  const after = layout(['0', '1', '3', '2', '4', '5', null, null])
  const arrival = reconcileCrossPageReorder(initial(before), after)
  assert.equal(arrival.flights.get('3').fromIndex, 6)
  const same = reconcileCrossPageReorder(arrival, layout([...after.order]))
  assert.equal(same.flights, arrival.flights)
})

test('switching pages or grid dimensions discards old retained flights', () => {
  const before = layout(['0', '1', '2', '3', null, null, null, null])
  const after = layout(['0', '1', '2', null, '3', null, null, null])
  const departure = reconcileCrossPageReorder(initial(before), after)
  for (const options of [{ page: 1 }, { pageSize: 6 }, { columns: 1 }]) {
    assert.equal(reconcileCrossPageReorder(departure, layout(after.order, options)).flights.size, 0)
  }
})

test('offscreen targets retain row/column, use full viewport pitch, and reverse in RTL', () => {
  const geometry = {
    page: 0,
    pageSize: 4,
    columns: 2,
    stepX: 108,
    stepY: 128,
    pagePitch: 1000,
    rtl: false,
  }
  assert.deepEqual(projectPageAnchor(6, geometry), { x: 1000, y: 128 })
  assert.deepEqual(projectPageAnchor(7, geometry), { x: 1108, y: 128 })
  assert.deepEqual(projectPageAnchor(6, { ...geometry, rtl: true }), { x: -892, y: 128 })
  assert.deepEqual(projectPageAnchor(2, { ...geometry, page: 1 }), { x: -1000, y: 128 })
})
