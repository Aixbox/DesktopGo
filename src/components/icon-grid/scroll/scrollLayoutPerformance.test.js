import assert from 'node:assert/strict'
import test from 'node:test'
import { buildScrollGroupEntries } from './scrollGroupLayout.ts'
import { resolveScrollGroupHitLayout } from './scrollGroupHitLayout.ts'
import { getGridItemSpan } from '../model.ts'

// Independent rectangle collision oracle: preserve first-fit placement, gaps and reserved anchors.
function firstFit(ids, items, columns, reserved) {
  const placed = reserved.map(entry => ({ ...entry }))
  for (const id of ids) {
    if (reserved.some(entry => entry.id === id)) continue
    const span = getGridItemSpan(items.get(id))
    for (let index = 0; ; index++) {
      const row = Math.floor(index / columns),
        col = index % columns
      if (col + span.cols > columns) continue
      if (
        placed.some(
          p =>
            col < p.col + p.span.cols &&
            col + span.cols > p.col &&
            row < p.row + p.span.rows &&
            row + span.rows > p.row
        )
      )
        continue
      placed.push({ id, row, col, span })
      break
    }
  }
  return placed
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(({ id, row, col }) => [id, row, col])
}

test('span search cursors preserve mixed-size first-fit layouts and reserved cells', () => {
  let seed = 17
  const random = () => (seed = (seed * 16807) % 2147483647)
  for (let run = 0; run < 80; run++) {
    const columns = 2 + (random() % 7)
    const ids = Array.from({ length: 60 }, (_, i) => `item-${i}`)
    const items = new Map(
      ids.map(key => [
        key,
        { kind: 'icon', key, icon: {}, size: ['1x1', '1x2', '2x1', '2x2'][random() % 4] },
      ])
    )
    const reserved =
      run % 2
        ? [
            {
              id: ids[0],
              item: items.get(ids[0]),
              row: 2,
              col: 0,
              span: getGridItemSpan(items.get(ids[0])),
            },
          ]
        : []
    const actual = buildScrollGroupEntries(ids, items, columns, reserved)
    assert.deepEqual(
      actual.map(({ id, row, col }) => [id, row, col]),
      firstFit(ids, items, columns, reserved)
    )
  }
})

test('one-cell layout uses a linear number of occupancy checks', t => {
  const ids = Array.from({ length: 1000 }, (_, i) => `icon-${i}`)
  const items = new Map(ids.map(key => [key, { kind: 'icon', key, icon: {} }]))
  let checks = 0
  const has = Set.prototype.has
  t.mock.method(Set.prototype, 'has', function (value) {
    checks++
    return has.call(this, value)
  })
  assert.equal(buildScrollGroupEntries(ids, items, 8).length, 1000)
  assert.ok(checks < 5000, `expected linear work, measured ${checks} checks`)
})

test('pointer-only changes reuse hit layout; reorder, resize and column changes invalidate it', () => {
  const items = [
    { kind: 'icon', key: 'a', icon: {} },
    { kind: 'icon', key: 'b', icon: {} },
  ]
  const order = ['a', 'b']
  const first = resolveScrollGroupHitLayout(items, order, 4)
  for (let frame = 0; frame < 120; frame++)
    assert.equal(resolveScrollGroupHitLayout(items, order, 4), first)
  const reordered = resolveScrollGroupHitLayout(items, ['b', 'a'], 4)
  assert.equal(reordered.entries[0].id, 'b')
  const resized = resolveScrollGroupHitLayout([{ ...items[0], size: '2x2' }, items[1]], order, 4)
  assert.equal(resized.entries[1].col, 2)
  assert.notEqual(resolveScrollGroupHitLayout(items, order, 3), first)
})
