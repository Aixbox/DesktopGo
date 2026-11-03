import assert from 'node:assert/strict'
import test from 'node:test'
import { applyFolderCreateFromSession as paged } from './dropPolicy.ts'
import { applyFolderCreateFromSession as scroll } from '../scroll/scrollDropPolicy.ts'
import { createFolderFromIcons } from './folderCreation.ts'
import { buildPersistedItemCoordinates, normalizeOuterSlots } from './topLevelLayout.ts'
import { hydrateLayout, serializeItems } from '../services/layoutStore.ts'
import { getId } from '../model.ts'
import { DRAG_HOLE_ID } from './slots.ts'

const icon = (key, size) => ({
  kind: 'icon',
  key,
  size,
  icon: {
    id: key,
    name: key,
    path: key,
    target_path: key,
    icon_base64: '',
    item_type: 'shortcut',
    origin: 'import',
  },
})
const sizes = [undefined, '1x1', '1x2', '2x1', '2x2']

for (const [mode, create] of Object.entries({ paged, scroll })) {
  test(`${mode}: new folder retains target size, anchor, occupied cells and persisted size`, () => {
    for (const targetSize of sizes) {
      for (const sourceSize of sizes) {
        const target = icon('target', targetSize)
        const source = icon('source', sourceSize)
        const neighbor = icon('neighbor')
        const base = [source, target, neighbor]
        const slots = Array(16).fill(null)
        // Anchor at the lower/right boundary to catch any footprint shrink or relocation.
        const cols = Number((targetSize ?? '1x1')[0])
        const rows = Number((targetSize ?? '1x1')[2])
        const anchor = (4 - rows) * 4 + 4 - cols
        slots[0] = DRAG_HOLE_ID
        slots[1] = 'neighbor'
        slots[anchor] = 'target'
        const snapshot = JSON.stringify({ base, slots })
        const result = create(base, {
          draggingId: 'source',
          draggingItem: source,
          folderPreviewTargetId: 'target',
          workingOrder: slots,
        })
        const folder = result.items.find(item => item.kind === 'folder')
        assert.equal(folder.size, targetSize ?? '1x1', `${targetSize} <- ${sourceSize}`)
        assert.equal(result.slots[anchor], getId(folder))
        assert.equal(result.slots[0], null)
        assert.equal(result.slots[1], 'neighbor')
        assert.deepEqual(
          folder.children.map(child => child.key),
          ['target', 'source']
        )
        assert.ok(folder.children.every(child => child.size === undefined))
        assert.equal(JSON.stringify({ base, slots }), snapshot)
        assert.deepEqual(normalizeOuterSlots(result.slots, result.items, 16, 4), result.slots)
        const coordinates = buildPersistedItemCoordinates(result.slots, result.items, 16, 4)
        const cells = coordinates.find(entry => entry.id === getId(folder)).cells
        assert.equal(cells.length, cols * rows)
        assert.deepEqual(cells[0], { page: 0, row: 4 - rows, col: 4 - cols })
        const restored = hydrateLayout(
          base.map(item => item.icon),
          {
            items: serializeItems(result.items),
            slots: result.slots,
            dockKeys: [],
            pageSize: 16,
            columns: 4,
            coordinates,
          }
        )
        assert.equal(restored.items.find(item => item.kind === 'folder').size, targetSize ?? '1x1')
        assert.equal(restored.layout.slots[anchor], getId(folder))
      }
    }
  })

  test(`${mode}: external source merges without adding a top-level duplicate; invalid targets are unchanged`, () => {
    const source = icon('external', '2x2')
    const target = icon('target', '2x1')
    const base = [target]
    const session = {
      draggingId: 'external',
      draggingItem: source,
      folderPreviewTargetId: 'target',
      workingOrder: ['target', null],
    }
    const result = create(base, session)
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].size, '2x1')
    assert.equal(result.items[0].children[1].key, 'external')
    for (const targetId of [null, 'missing']) {
      assert.equal(create(base, { ...session, folderPreviewTargetId: targetId }).items, base)
    }
    assert.equal(create(base, { ...session, workingOrder: [] }).items, base)
    assert.equal(
      create(base, { ...session, draggingItem: target, draggingId: 'target' }).items,
      base
    )
  })
}

test('scroll-group folder construction uses target size and normalizes children', () => {
  for (const size of sizes) {
    const folder = createFolderFromIcons(icon('target', size), icon('source', '2x2'))
    assert.equal(folder.size, size ?? '1x1')
    assert.ok(folder.children.every(child => child.size === undefined))
  }
})
