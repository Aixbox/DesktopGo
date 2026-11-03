import assert from 'node:assert/strict'
import test from 'node:test'
import { planItemResize } from './itemResizeTransaction.ts'
import { buildTopLevelOccupancy, getFootprintIndices } from './topLevelLayout.ts'
import { getGridItemSpan, getId } from '../model.ts'

const icon = (key, size = '1x1') => ({ kind: 'icon', key, size, icon: { path: key } })
const folder = (id, size = '1x1') => ({ kind: 'folder', id, size, name: id, children: [] })

function fixture(kind, { holes = [0], anchor = 10, page = 0, fullNextPage = false } = {}) {
  const source = kind === 'folder' ? folder('source') : icon('source')
  const id = getId(source)
  const slots = Array((page + 2) * 16).fill(null)
  const items = [source]
  if (page) {
    items.push(icon('previous-page'))
    slots[0] = 'previous-page'
  }
  for (let i = 0; i < 16; i++) {
    if (i !== anchor && holes.includes(i)) continue
    const key = i === anchor ? id : `neighbor-${i}`
    slots[page * 16 + i] = key
    if (i !== anchor) items.push(icon(key))
  }
  if (fullNextPage)
    for (let i = 0; i < 16; i++) {
      const key = `next-${i}`
      items.push(icon(key))
      slots[(page + 1) * 16 + i] = key
    }
  return { items, slots, itemId: id, size: '2x1', columns: 4, pageSize: 16 }
}

function assertValid(plan, input) {
  assert.ok(plan)
  assert.equal(plan.slots.indexOf(input.itemId), input.slots.indexOf(input.itemId))
  const anchors = plan.slots.filter(Boolean)
  assert.equal(anchors.length, input.items.length)
  assert.deepEqual(new Set(anchors), new Set(input.items.map(getId)))
  const occupancy = buildTopLevelOccupancy(plan.slots, plan.items, 4, 16)
  for (const item of plan.items) {
    const id = getId(item)
    const footprint = getFootprintIndices(plan.slots.indexOf(id), getGridItemSpan(item), 4, 16)
    assert.ok(footprint)
    assert.ok(
      footprint.every(index => occupancy.cells[index] === id),
      `${id} must not overlap`
    )
  }
}

for (const kind of ['icon', 'folder']) {
  for (const page of [0, 1])
    test(`${kind}: use the upper-left vacancy on page ${page} before spilling`, () => {
      const input = fixture(kind, { page, fullNextPage: true })
      const before = structuredClone(input)
      const plan = planItemResize(input)
      assertValid(plan, input)
      assert.equal(plan.slots.indexOf('neighbor-11'), page * 16)
      input.slots.forEach((id, index) => {
        if (id && id !== 'neighbor-11') assert.equal(plan.slots.indexOf(id), index)
      })
      assert.equal(plan.slots.length, input.slots.length, 'do not insert an unnecessary page')
      assert.deepEqual(input, before, 'preview cannot mutate the saved layout')
    })

  test(`${kind}: choose the closest current-page vacancy even when a later page is empty`, () => {
    const input = fixture(kind, { holes: [0, 7, 15] })
    const plan = planItemResize(input)
    assertValid(plan, input)
    assert.equal(plan.slots.indexOf('neighbor-11'), 7)
    assert.equal(plan.slots.length, 16)
  })

  test(`${kind}: spill only the remaining neighbor after filling all current-page holes`, () => {
    const input = fixture(kind, { holes: [0, 1] })
    input.size = '2x2'
    const plan = planItemResize(input)
    assertValid(plan, input)
    const displaced = ['neighbor-11', 'neighbor-14', 'neighbor-15']
    assert.equal(displaced.filter(id => plan.slots.indexOf(id) < 16).length, 2)
    assert.ok(displaced.some(id => plan.slots[0] === id))
    assert.ok(displaced.some(id => plan.slots[1] === id))
    assert.equal(plan.slots.length, 32)
  })

  test(`${kind}: a full page spills forward without pulling icons onto an earlier page`, () => {
    const input = fixture(kind, { holes: [], page: 1, fullNextPage: true })
    const plan = planItemResize(input)
    assertValid(plan, input)
    assert.ok(plan.slots.indexOf('neighbor-11') >= 48)
    assert.equal(plan.slots[0], 'previous-page')
    for (let i = 0; i < 16; i++) assert.equal(plan.slots.indexOf(`next-${i}`), 32 + i)
  })

  for (const neighborKind of ['icon', 'folder'])
    for (const contiguous of [true, false])
      test(`${kind}: displaced 2x2 ${neighborKind} requires a contiguous vacancy (${contiguous})`, () => {
        const input = fixture(kind, {
          holes: contiguous ? [0, 1, 4, 5, 7, 11] : [0, 4, 5, 7, 11, 12],
          anchor: 1,
        })
        // Replace a 2x2 region anchored at 2 with one large item.
        for (const index of [2, 3, 6, 7]) {
          input.items = input.items.filter(item => getId(item) !== input.slots[index])
          input.slots[index] = null
        }
        const large = neighborKind === 'folder' ? folder('large', '2x2') : icon('large', '2x2')
        input.items.push(large)
        input.slots[2] = getId(large)
        // The source occupies 1, so use a lower-left 2x2 hole when contiguous.
        for (const index of contiguous ? [8, 9, 12, 13] : []) {
          input.items = input.items.filter(item => getId(item) !== input.slots[index])
          input.slots[index] = null
        }
        input.slots[1] = input.itemId
        const plan = planItemResize(input)
        assertValid(plan, input)
        const destination = plan.slots.indexOf(getId(large))
        assert.equal(destination < 16, contiguous)
        assert.equal(plan.items.find(item => getId(item) === getId(large)).size, '2x2')
      })
}
