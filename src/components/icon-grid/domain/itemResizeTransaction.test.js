import test from 'node:test'
import assert from 'node:assert/strict'
import { planItemResize } from './itemResizeTransaction.ts'
import { getGridItemSpan, asFolderChild } from '../model.ts'
import { buildCanonicalPlacements } from './canonicalLayout.ts'
import { validatePersistedLayout } from './layoutValidation.ts'
import { planFolderDropTransaction } from './folderDropTransaction.ts'
import { getIconTileMetrics } from '../views/iconTileMetrics.ts'
import { isSingleOuterFolderDrag } from './evasionPolicy.ts'

const icon = (key, size) => ({ kind: 'icon', key, icon: { path: key }, ...(size ? { size } : {}) })
const sizes = ['1x1', '1x2', '2x1', '2x2']

for (const previousSize of sizes)
  for (const size of sizes) {
    test(`ordinary icon ${previousSize} -> ${size}: footprint is legal and neighbors survive`, () => {
      const items = [
        icon('app', previousSize),
        ...Array.from({ length: 13 }, (_, i) => icon(`app-${i}`)),
      ]
      const layout = {
        items: items.map(item => ({ type: 'icon', key: item.key, size: item.size })),
        slots: ['app'],
        dockKeys: [],
        columns: 4,
        pageSize: 16,
      }
      const placements = buildCanonicalPlacements(layout)
      const slots = Array(48).fill(null)
      for (const p of placements) slots[p.page * 16 + p.row * 4 + p.col] = p.id
      const before = structuredClone({ items, slots })
      const plan = planItemResize({ items, slots, itemId: 'app', size, columns: 4, pageSize: 16 })
      if (size === previousSize) return assert.equal(plan, null)
      assert.ok(plan)
      assert.deepEqual(getGridItemSpan(plan.items[0]), {
        cols: Number(size[0]),
        rows: Number(size[2]),
      })
      assert.deepEqual(new Set(plan.slots.filter(Boolean)), new Set(items.map(item => item.key)))
      const persisted = {
        ...layout,
        slots: plan.slots,
        items: plan.items.map(item => ({ type: 'icon', key: item.key, size: item.size })),
      }
      persisted.placements = buildCanonicalPlacements(persisted)
      assert.equal(validatePersistedLayout(persisted).valid, true)
      assert.deepEqual({ items, slots }, before, 'preview must not mutate committed data')
    })
  }

test('bottom-right growth cannot move the anchor backwards; dock targets are rejected', () => {
  const items = [icon('app')],
    slots = Array(16).fill(null)
  slots[15] = 'app'
  const input = { items, slots, itemId: 'app', size: '2x2', columns: 4, pageSize: 16 }
  assert.equal(planItemResize(input), null)
  assert.equal(planItemResize({ ...input, columns: 1, pageSize: 16 }), null)
  assert.equal(planItemResize({ ...input, dockKeys: ['app'] }), null)
})

test('every legal icon/folder anchor clamps each resize axis independently on either page', () => {
  for (const kind of ['icon', 'folder'])
    for (const page of [0, 1])
      for (const previousSize of sizes)
        for (let row = 0; row < 4; row++)
          for (let col = 0; col < 4; col++) {
            const oldCols = Number(previousSize[0]),
              oldRows = Number(previousSize[2])
            if (col + oldCols > 4 || row + oldRows > 4) continue
            const source =
              kind === 'icon'
                ? icon('app', previousSize)
                : { kind: 'folder', id: 'app', name: 'App', size: previousSize, children: [] }
            const id = kind === 'icon' ? 'app' : 'folder:app'
            const anchor = page * 16 + row * 4 + col
            const slots = Array((page + 1) * 16).fill(null)
            const items = [source]
            if (page) {
              slots[0] = 'keeper'
              items.push(icon('keeper'))
            }
            slots[anchor] = id
            const before = structuredClone({ items, slots })
            for (const size of sizes) {
              const expected = `${Math.min(Number(size[0]), 4 - col)}x${Math.min(Number(size[2]), 4 - row)}`
              const plan = planItemResize({
                items,
                slots,
                itemId: id,
                size,
                columns: 4,
                pageSize: 16,
              })
              if (expected === previousSize) {
                assert.equal(plan, null)
                continue
              }
              assert.ok(plan, `${kind} ${previousSize} -> ${size} at ${anchor}`)
              assert.equal(plan.size, expected)
              assert.equal(plan.items[0].size, expected)
              assert.equal(plan.anchorIndex, anchor)
              assert.equal(plan.slots.indexOf(id), anchor, 'resize never shifts up or left')
              assert.deepEqual({ items, slots }, before)
            }
          }
})

test('occupied forward cells displace neighbors without choosing a less occupied backward anchor', () => {
  const slots = Array(16).fill(null)
  slots[5] = 'app'
  slots[6] = 'neighbor'
  const plan = planItemResize({
    items: [icon('app'), icon('neighbor')],
    slots,
    itemId: 'app',
    size: '2x1',
    columns: 4,
    pageSize: 16,
  })
  assert.equal(plan.slots.indexOf('app'), 5)
  assert.notEqual(plan.slots.indexOf('neighbor'), 6)
  assert.ok(plan.slots.includes('neighbor'))
})

test('large icons enter folders as compact children without changing their source object', () => {
  const source = icon('large', '2x2')
  const plan = planFolderDropTransaction({
    currentChildren: [icon('a')],
    incomingChildren: [source],
  })
  assert.deepEqual(getGridItemSpan(plan.nextChildren[1]), { cols: 1, rows: 1 })
  assert.equal(plan.nextChildren[1].size, undefined)
  assert.deepEqual(asFolderChild(source), plan.nextChildren[1])
  assert.equal(source.size, '2x2')
  assert.equal(
    isSingleOuterFolderDrag({ context: 'outer', draggingIds: ['large'], draggingItem: source }),
    true
  )
})

test('Dock stays one cell while preserving the desktop icon size for returning to the workspace', () => {
  const layout = {
    items: [{ type: 'icon', key: 'app', size: '2x2' }],
    slots: [],
    dockKeys: ['app'],
    columns: 4,
    pageSize: 16,
  }
  const placements = buildCanonicalPlacements(layout)
  assert.deepEqual([placements[0].spanX, placements[0].spanY], [1, 1])
  assert.equal(validatePersistedLayout({ ...layout, placements }).valid, true)
  assert.equal(layout.items[0].size, '2x2')
})

test('each icon size fills exactly its footprint and keeps room for either title height', () => {
  for (const size of sizes)
    for (const titleLineCount of ['one', 'two']) {
      const span = getGridItemSpan(icon('app', size))
      const m = getIconTileMetrics({
        span,
        slotWidth: 76,
        slotHeight: 93,
        gridGap: 8,
        imageSize: 48,
        titleLineCount,
      })
      assert.equal(m.footprintWidth, span.cols * 76 + (span.cols - 1) * 8)
      assert.equal(m.footprintHeight, span.rows * 93 + (span.rows - 1) * 8)
      assert.ok(m.shapeWidth <= m.bodyWidth && m.shapeHeight <= m.bodyHeight)
      assert.ok(4 + m.bodyHeight + 4 + (titleLineCount === 'one' ? 15 : 30) <= m.footprintHeight)
    }
})

test('persisted icon sizes accept legacy layouts and reject invalid values', () => {
  const layout = {
    items: [{ type: 'icon', key: 'app' }],
    slots: ['app'],
    dockKeys: [],
    columns: 4,
    pageSize: 16,
  }
  assert.equal(validatePersistedLayout(layout).valid, true)
  for (const size of ['3x3', '', null, 2, { cols: 2, rows: 2 }]) {
    const result = validatePersistedLayout({ ...layout, items: [{ ...layout.items[0], size }] })
    assert.equal(result.valid, false)
    assert.ok(result.issues.some(issue => issue.path === 'items[0].size'))
  }
})
