import {
  buildScrollGroupEntries,
  buildScrollGroupDragPreviewOrder,
  commitScrollFolderCreation,
  commitScrollGroupItemOrder,
  deleteScrollGroup,
  isPointInScrollMergeZone,
  moveScrollItemRelative,
  moveScrollGroupItem,
  normalizeScrollGroups,
  replaceScrollPreviewItemsWithFolder,
  resolveScrollDropPosition,
} from './scrollGroupLayout.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const defaultName = index => `Group ${index + 1}`
const meta = (id, itemIds = []) => ({ id, name: id, icon: 'grid', itemIds })

const migrated = normalizeScrollGroups({
  groups: [meta('work'), meta('games'), meta('tools')],
  outerItemIds: ['a', 'b', 'c', 'd', 'e', 'f', 'new'],
  legacySlots: ['a', 'b', null, 'c', 'd', null, 'e', 'f'],
  legacyPageSize: 3,
  hasExplicitItems: false,
  defaultName,
})
assert(migrated.length === 3, 'Legacy page chunks must not create extra scroll groups')
assert(
  JSON.stringify(migrated.map(group => group.itemIds)) ===
    JSON.stringify([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f', 'new'],
    ]),
  'Legacy migration must recover overflow and missing icons into the last real group'
)

const normalized = normalizeScrollGroups({
  groups: [meta('one', ['a', 'b', 'missing']), meta('two', ['b', 'c'])],
  outerItemIds: ['a', 'b', 'c', 'd'],
  hasExplicitItems: true,
  defaultName,
  preferredGroupId: 'one',
})
assert(
  JSON.stringify(normalized.map(group => group.itemIds)) ===
    JSON.stringify([['a', 'b', 'd'], ['c']]),
  'Explicit groups must dedupe IDs, remove invalid IDs, and recover missing shared icons once'
)

const moved = moveScrollGroupItem(normalized, 'b', 'two')
assert(
  JSON.stringify(moved.map(group => group.itemIds)) ===
    JSON.stringify([
      ['a', 'd'],
      ['c', 'b'],
    ]),
  'Cross-group moves must update membership without duplicating the icon'
)

const afterDelete = deleteScrollGroup(moved, 'two')
assert(
  afterDelete.length === 1 &&
    JSON.stringify(afterDelete[0].itemIds) === JSON.stringify(['a', 'd', 'c', 'b']),
  'Deleting a group must preserve its icons in a neighboring group'
)

const committed = commitScrollGroupItemOrder(normalized, 'one', ['d', 'b', 'a'])
assert(
  JSON.stringify(committed.map(group => group.itemIds)) ===
    JSON.stringify([['d', 'b', 'a'], ['c']]),
  'Drop commit must preserve the exact preview order'
)
assert(
  commitScrollGroupItemOrder(normalized, 'one', ['a', 'b']) === normalized,
  'Drop commit must reject an order that loses an item'
)

const gridItems = new Map([
  ['a', { kind: 'icon', key: 'a', icon: { path: 'a' } }],
  ['folder:large', { kind: 'folder', id: 'large', name: 'large', size: '2x2', children: [] }],
  ['b', { kind: 'icon', key: 'b', icon: { path: 'b' } }],
  ['folder:wide', { kind: 'folder', id: 'wide', name: 'wide', size: '2x1', children: [] }],
  [
    'folder:vertical',
    { kind: 'folder', id: 'vertical', name: 'vertical', size: '1x2', children: [] },
  ],
  ['c', { kind: 'icon', key: 'c', icon: { path: 'c' } }],
])
const assertNoEntryOverlap = (itemIds, message) => {
  const entries = buildScrollGroupEntries(itemIds, gridItems, 4)
  const occupied = new Set()
  entries.forEach(entry => {
    assert(entry.col + entry.span.cols <= 4, `${message}: footprint exceeds the grid width`)
    for (let row = entry.row; row < entry.row + entry.span.rows; row += 1) {
      for (let col = entry.col; col < entry.col + entry.span.cols; col += 1) {
        const cell = `${row}:${col}`
        assert(!occupied.has(cell), `${message}: overlapping cell ${cell}`)
        occupied.add(cell)
      }
    }
  })
  assert(entries.length === itemIds.length, `${message}: an item was lost`)
}
assertNoEntryOverlap(
  ['a', 'folder:large', 'b', 'folder:wide', 'folder:vertical', 'c'],
  'Mixed-size initial layout must not overlap'
)
assertNoEntryOverlap(
  ['folder:wide', 'c', 'folder:vertical', 'folder:large', 'a', 'b'],
  'Mixed-size drag preview layout must not overlap after reorder'
)
const stressOrder = Array.from(gridItems.keys())
stressOrder.forEach((_, offset) => {
  assertNoEntryOverlap(
    [...stressOrder.slice(offset), ...stressOrder.slice(0, offset)],
    `Mixed-size rotation ${offset} must not overlap`
  )
})
const narrowEntries = buildScrollGroupEntries(['folder:large', 'a'], gridItems, 1)
assert(
  narrowEntries[0].span.cols === 2,
  'Narrow measurements must not compress a large folder footprint'
)
const initialAnchor = buildScrollGroupEntries(['a', 'b', 'c'], gridItems, 4).find(
  entry => entry.id === 'a'
)
const reservedPreview = buildScrollGroupEntries(
  ['b', 'c', 'a'],
  gridItems,
  4,
  initialAnchor ? [initialAnchor] : []
)
const reservedAnchor = reservedPreview.find(entry => entry.id === 'a')
assert(
  initialAnchor &&
    reservedAnchor &&
    initialAnchor.row === reservedAnchor.row &&
    initialAnchor.col === reservedAnchor.col,
  'Drag preview must keep the source footprint as a fixed placeholder'
)
const reservedOccupied = new Set()
reservedPreview.forEach(entry => {
  for (let row = entry.row; row < entry.row + entry.span.rows; row += 1) {
    for (let col = entry.col; col < entry.col + entry.span.cols; col += 1) {
      const cell = `${row}:${col}`
      assert(!reservedOccupied.has(cell), `Reserved placeholder preview overlaps ${cell}`)
      reservedOccupied.add(cell)
    }
  }
})
const movingAnchor = buildScrollGroupEntries(['b', 'c', 'a'], gridItems, 4).find(
  entry => entry.id === 'a'
)
const movingReservedPreview = buildScrollGroupEntries(
  ['b', 'c', 'a'],
  gridItems,
  4,
  movingAnchor ? [movingAnchor] : []
)
const movingReservedAnchor = movingReservedPreview.find(entry => entry.id === 'a')
assert(
  movingAnchor &&
    movingReservedAnchor &&
    movingAnchor.row === movingReservedAnchor.row &&
    movingAnchor.col === movingReservedAnchor.col,
  'The placeholder must follow the current preview target footprint'
)
assert(
  isPointInScrollMergeZone({ x: 200, y: 200 }, { left: 100, top: 100, width: 200, height: 200 }),
  'The center of a large folder must activate merge intent'
)
assert(
  !isPointInScrollMergeZone({ x: 110, y: 200 }, { left: 100, top: 100, width: 200, height: 200 }),
  'The edge of a large folder must remain a reorder target'
)

const dropRect = { left: 100, top: 100, width: 100, height: 100 }
assert(
  resolveScrollDropPosition({ x: 149, y: 150 }, dropRect, false) === 'before' &&
    resolveScrollDropPosition({ x: 150, y: 150 }, dropRect, false) === 'after',
  'Normal targets must split into exact before and after halves'
)
assert(
  resolveScrollDropPosition({ x: 150, y: 150 }, dropRect, true) === 'middle' &&
    resolveScrollDropPosition({ x: 124, y: 150 }, dropRect, true) === 'before' &&
    resolveScrollDropPosition({ x: 176, y: 150 }, dropRect, true) === 'after' &&
    resolveScrollDropPosition({ x: 150, y: 124 }, dropRect, true) === 'before' &&
    resolveScrollDropPosition({ x: 150, y: 176 }, dropRect, true) === 'after',
  'Merge-capable targets must reserve only the center 50% and keep every edge sortable'
)
assert(
  JSON.stringify(moveScrollItemRelative(['a', 'b', 'c', 'd'], 'a', 'c', 'before')) ===
    JSON.stringify(['b', 'a', 'c', 'd']),
  'Before insertion must place the active item immediately before the target'
)
assert(
  JSON.stringify(moveScrollItemRelative(['a', 'b', 'c', 'd'], 'a', 'c', 'after')) ===
    JSON.stringify(['b', 'c', 'a', 'd']),
  'After insertion must place the active item immediately after the target'
)
assert(
  JSON.stringify(moveScrollItemRelative(['a', 'b', 'c', 'd'], 'd', 'b', 'before')) ===
    JSON.stringify(['a', 'd', 'b', 'c']),
  'Relative insertion must remain correct when moving backward through the order'
)
assert(
  JSON.stringify(
    buildScrollGroupDragPreviewOrder({
      groupItemIds: ['folder:source', 'a', 'b', 'c'],
      workingOrder: ['other-group', 'a', 'folder-child', 'b', 'c'],
      draggingIds: ['folder-child'],
      availableIds: new Set(['a', 'b', 'c', 'folder-child', 'other-group']),
    })
  ) === JSON.stringify(['a', 'folder-child', 'b', 'c']),
  'A folder child preview must enter the active group order and exclude unrelated or removed items'
)
const sourceFolderPreviewInput = {
  groupItemIds: ['a', 'folder:source', 'b', 'c'],
  workingOrder: ['a', 'folder:source', 'b', 'c', 'folder-child'],
  draggingIds: ['folder-child'],
  availableIds: new Set(['a', 'folder:source', 'b', 'c', 'folder-child']),
}
assert(
  JSON.stringify(
    buildScrollGroupDragPreviewOrder({
      ...sourceFolderPreviewInput,
    })
  ) === JSON.stringify(['a', 'folder:source', 'b', 'c', 'folder-child']),
  'A source folder omitted by the legacy order must keep its original relative position'
)
assert(
  JSON.stringify(
    buildScrollGroupDragPreviewOrder({
      ...sourceFolderPreviewInput,
      workingOrder: ['a', 'folder-child', 'folder:source', 'b', 'c'],
    })
  ) === JSON.stringify(['a', 'folder-child', 'folder:source', 'b', 'c']),
  'Dragging over the leading side of the source folder must place the child before it'
)
assert(
  JSON.stringify(
    buildScrollGroupDragPreviewOrder({
      ...sourceFolderPreviewInput,
      workingOrder: ['a', 'folder:source', 'folder-child', 'b', 'c'],
    })
  ) === JSON.stringify(['a', 'folder:source', 'folder-child', 'b', 'c']),
  'Dragging over the trailing side of the source folder must place the child after it'
)
assert(
  JSON.stringify(
    buildScrollGroupDragPreviewOrder({
      ...sourceFolderPreviewInput,
      workingOrder: ['a', 'folder-child', 'folder:source', 'b', 'c'],
    })
  ) === JSON.stringify(['a', 'folder-child', 'folder:source', 'b', 'c']),
  'Folder intent must preserve the last accepted ordering instead of forcing a side reorder'
)
assert(
  JSON.stringify(
    buildScrollGroupDragPreviewOrder({
      groupItemIds: ['a', 'b', 'c'],
      workingOrder: [null, 'b', 'c'],
      draggingIds: ['a'],
      availableIds: new Set(['a', 'b', 'c']),
    })
  ) === JSON.stringify(['b', 'c', 'a']),
  'A dragged group item must not be mistaken for a missing group item during folder intent'
)
assert(
  JSON.stringify(
    replaceScrollPreviewItemsWithFolder({
      itemIds: ['a', 'source', 'target', 'b'],
      sourceIds: ['source'],
      targetId: 'target',
      folderId: 'folder:new',
    })
  ) === JSON.stringify(['a', 'folder:new', 'b']),
  'A newly created folder must replace the merge target instead of being appended'
)
assert(
  JSON.stringify(
    commitScrollFolderCreation({
      groups: [meta('group-a', ['a', 'source', 'target', 'b']), meta('group-b', ['c'])],
      previewItemIds: ['a', 'source', 'target', 'b'],
      sourceIds: ['source'],
      targetId: 'target',
      folderId: 'folder:new',
    })
  ) === JSON.stringify([meta('group-a', ['a', 'folder:new', 'b']), meta('group-b', ['c'])]),
  'Folder creation must update the target scroll group in the same transaction'
)

console.log('scrollGroupLayout tests passed')
