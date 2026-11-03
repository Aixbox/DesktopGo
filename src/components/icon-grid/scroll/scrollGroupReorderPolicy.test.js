import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScrollGroupEntries } from './scrollGroupLayout.ts'
import {
  resolveScrollGroupReorderAnchor,
  resolveScrollGroupReorderPreview,
} from './scrollGroupReorderPolicy.ts'

test('mixed footprints choose the closest achievable anchor, matching exhaustive insertion', () => {
  let seed = 17
  const random = () => (seed = (seed * 16807) % 2147483647)
  for (let run = 0; run < 100; run++) {
    const columns = 2 + (random() % 6)
    const items = Array.from({ length: 24 }, (_, i) => ({
      kind: 'icon',
      key: `item-${i}`,
      size: ['1x1', '1x2', '2x1', '2x2'][random() % 4],
      icon: {},
    }))
    const order = items.map(item => item.key)
    const map = new Map(items.map(item => [item.key, item]))
    const source = items[random() % items.length]
    const draggingIds = run % 2 ? [source.key] : [...new Set([source.key, order[0]])]
    const state = {
      scrollGroupOrder: order,
      draggingId: source.key,
      draggingIds,
      draggingItem: source,
    }
    const layout = buildScrollGroupEntries(order, map, columns)
    const target = layout[random() % layout.length].globalIndex
    const distance = index =>
      (Math.floor(index / columns) - Math.floor(target / columns)) ** 2 +
      ((index % columns) - (target % columns)) ** 2
    const result = resolveScrollGroupReorderPreview({ state, items, columns, anchorIndex: target })
    const remaining = order.filter(id => !draggingIds.includes(id))
    let closest = distance(layout.find(entry => entry.id === source.key).globalIndex)
    for (let index = 0; index <= remaining.length; index++) {
      const candidate = [...remaining.slice(0, index), ...draggingIds, ...remaining.slice(index)]
      const entry = buildScrollGroupEntries(candidate, map, columns).find(
        entry => entry.id === source.key
      )
      closest = Math.min(closest, distance(entry.globalIndex))
    }
    assert.equal(distance(result.previewSlotIndex), closest, `run ${run}, ${source.size}`)
    assert.deepEqual([...result.order].sort(), [...order].sort())
    assert.deepEqual(
      result.order.filter(id => !draggingIds.includes(id)),
      remaining
    )
  }
})

test('reorder searches 1000 icons with linear occupancy work', t => {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    kind: 'icon',
    key: `item-${i}`,
    icon: {},
    size: i === 999 ? '2x2' : '1x1',
  }))
  const state = {
    scrollGroupOrder: items.map(item => item.key),
    draggingId: 'item-999',
    draggingIds: ['item-999'],
    draggingItem: items[999],
  }
  let checks = 0
  const has = Set.prototype.has
  t.mock.method(Set.prototype, 'has', function (value) {
    checks++
    return has.call(this, value)
  })
  const result = resolveScrollGroupReorderPreview({ state, items, columns: 8, anchorIndex: 500 })
  assert.equal(result.previewSlotIndex, 500)
  assert.ok(checks < 25000, `expected linear packing, got ${checks} occupancy checks`)
})

test('explicit edge evasion chooses a different equally close placement without accepting a worse one', () => {
  for (const [size, columns] of [
    ['2x1', 4],
    ['1x2', 1],
  ]) {
    const source = { kind: 'icon', key: 'source', icon: {} }
    const target = { kind: 'icon', key: 'target', size, icon: {} }
    const items = [source, target]
    const state = {
      scrollGroupOrder: ['source', 'target'],
      draggingId: 'source',
      draggingIds: ['source'],
      draggingItem: source,
    }
    const params = { state, items, columns, anchorIndex: 1 }
    assert.deepEqual(resolveScrollGroupReorderPreview(params).order, ['source', 'target'])
    const moved = resolveScrollGroupReorderPreview({ ...params, preferMoveOnTie: true })
    assert.deepEqual(moved.order, ['target', 'source'])
    assert.equal(moved.previewSlotIndex, 2)
    assert.deepEqual(
      resolveScrollGroupReorderPreview({ ...params, anchorIndex: 0, preferMoveOnTie: true }).order,
      ['source', 'target'],
      'a worse placement must not be selected just to animate'
    )
  }
})

test('small drags stay within the selected large target; large drags keep their own footprint anchor', () => {
  for (const size of ['1x2', '2x1', '2x2']) {
    const source = { kind: 'icon', key: 'source', icon: {} }
    const target = { kind: 'icon', key: 'target', size, icon: {} }
    const items = [source, target]
    const order = ['source', 'target']
    const state = { draggingItem: source, scrollGroupOrder: order }
    const entry = buildScrollGroupEntries(
      order,
      new Map(items.map(item => [item.key, item])),
      4
    ).find(item => item.id === 'target')
    const resolve = (drag, candidateAnchorIndex) =>
      resolveScrollGroupReorderAnchor({
        state: drag,
        items,
        columns: 4,
        targetId: 'target',
        candidateAnchorIndex,
      })
    assert.equal(resolve(state, entry.globalIndex - 1), entry.globalIndex)
    assert.equal(
      resolve(state, 11),
      (entry.row + entry.span.rows - 1) * 4 + entry.col + entry.span.cols - 1
    )
    assert.equal(resolve({ ...state, draggingItem: { ...source, size } }, 11), 11)
  }
})
