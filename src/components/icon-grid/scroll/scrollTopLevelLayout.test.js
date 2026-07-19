import {
  buildCompactOuterDropPreview,
  compactOuterSlotsWithinPages,
  isCompactSlotVacantForDrag,
  maskDraggingIdsInCompactOrder,
  resolveCompactStableTargetId,
  preserveCompactPreviewOrderForCommit,
  recoverInfiniteScrollGroupSlots,
  remapScrollPageIndexAfterReorder,
  reorderScrollGroupPages,
} from './scrollTopLevelLayout.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const assertOrder = (actual, expected, message) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message)
}

const assertContainsEachIdOnce = (order, expectedIds, message) => {
  const ids = order.filter(id => typeof id === 'string')
  assert(new Set(ids).size === ids.length, `${message}: duplicate IDs found`)
  assert(
    JSON.stringify([...ids].sort()) === JSON.stringify([...expectedIds].sort()),
    `${message}: item IDs were lost or added`
  )
}

const makeIcon = key => ({
  kind: 'icon',
  key,
  icon: { path: key },
})

const makeFolder = (id, size) => ({
  kind: 'folder',
  id,
  name: id,
  size,
  children: [],
})

const recoveredInfiniteGroups = recoverInfiniteScrollGroupSlots(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(makeIcon),
  2,
  2,
  3
)
assertContainsEachIdOnce(
  recoveredInfiniteGroups,
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  'Recovering infinite scroll groups must retain every shared icon exactly once'
)
assert(
  recoveredInfiniteGroups
    .slice(0, 6)
    .filter(id => typeof id === 'string')
    .join(',') === 'a,b',
  'Recovery must preserve the first existing group members'
)
assert(
  recoveredInfiniteGroups
    .slice(6, 12)
    .filter(id => typeof id === 'string')
    .join(',') === 'c,d',
  'Recovery must preserve the second existing group members'
)
assert(
  recoveredInfiniteGroups
    .slice(12)
    .filter(id => typeof id === 'string')
    .join(',') === 'e,f,g,h,i',
  'Icons from obsolete tail groups and missing shared icons must move into the last real group'
)

const buildPreview = overrides => {
  const slots = overrides.slots
  const ids = slots.filter(id => typeof id === 'string')
  const items = overrides.items ?? ids.map(makeIcon)

  return buildCompactOuterDropPreview({
    slots,
    items,
    draggingIds: overrides.draggingIds,
    sourceIndex: overrides.sourceIndex,
    targetIndex: overrides.targetIndex,
    targetId: overrides.targetId,
    zone: overrides.zone,
    pageSize: overrides.pageSize ?? 4,
    columns: overrides.columns ?? 2,
    minPageCount: overrides.minPageCount ?? 1,
  })
}

assertOrder(
  reorderScrollGroupPages(['a', null, 'b', 'c', 'd', null], 2, 3, 0, 2),
  ['b', 'c', 'd', null, 'a', null],
  'Moving a scroll group forward must move its complete page without mixing page contents'
)

assertOrder(
  reorderScrollGroupPages(['a', null, 'b', 'c', 'd', null], 2, 3, 2, 0),
  ['d', null, 'a', null, 'b', 'c'],
  'Moving a scroll group backward must preserve the relative order of the remaining pages'
)

assert(
  remapScrollPageIndexAfterReorder(0, 0, 2) === 2 &&
    remapScrollPageIndexAfterReorder(1, 0, 2) === 0 &&
    remapScrollPageIndexAfterReorder(1, 2, 0) === 2,
  'The active page must follow its group or shift with the surrounding reordered pages'
)

const adjacentForward = buildPreview({
  slots: ['a', 'b', 'c', null],
  draggingIds: ['a'],
  sourceIndex: 0,
  targetIndex: 0,
  zone: 'left',
})

assertOrder(
  adjacentForward.order,
  ['b', 'a', 'c', null],
  'Moving an item after its next neighbor must change the compact order'
)
assert(
  adjacentForward.previewSlotIndex === 1,
  'The preview index must point at the moved item after an adjacent forward move'
)
const droppedIntoVacatedSlot = buildPreview({
  slots: ['a', 'b', 'c', null],
  draggingIds: ['a'],
  sourceIndex: 0,
  targetIndex: adjacentForward.previewSlotIndex,
  targetId: null,
  zone: 'center',
})

assertOrder(
  droppedIntoVacatedSlot.order,
  adjacentForward.order,
  'Dropping into the vacated preview slot must not restore the original order'
)

const vacatedSlotHitOrder = maskDraggingIdsInCompactOrder(droppedIntoVacatedSlot.order, ['a'])
assertOrder(
  vacatedSlotHitOrder,
  ['b', null, 'c', null],
  'Hit testing must keep the current preview slot vacant instead of restoring baseline occupants'
)
assert(
  isCompactSlotVacantForDrag({
    order: droppedIntoVacatedSlot.order,
    items: ['a', 'b', 'c'].map(makeIcon),
    draggingIds: ['a'],
    slotIndex: droppedIntoVacatedSlot.previewSlotIndex,
    pageSize: 4,
    columns: 2,
  }),
  'The hidden dragged slot must take priority over animated neighbor overlap'
)

const footprintFolder = makeFolder('footprint', '2x2')
assert(
  !isCompactSlotVacantForDrag({
    order: ['folder:footprint', null, null, null],
    items: [footprintFolder],
    draggingIds: [],
    slotIndex: 1,
    pageSize: 4,
    columns: 2,
  }),
  'A null slot covered by a folder footprint must remain occupied for hit testing'
)

const committedVacatedSlotOrder = compactOuterSlotsWithinPages(
  droppedIntoVacatedSlot.order,
  ['a', 'b', 'c'].map(makeIcon),
  4,
  2,
  1
)
assertOrder(
  committedVacatedSlotOrder,
  adjacentForward.order,
  'Commit normalization must preserve the vacated-slot preview order'
)
const adjacentBackward = buildPreview({
  slots: ['a', 'b', 'c', null],
  draggingIds: ['c'],
  sourceIndex: 2,
  targetIndex: 1,
  zone: 'left',
})

assertOrder(
  adjacentBackward.order,
  ['a', 'c', 'b', null],
  'Moving an item before its previous neighbor must change the compact order'
)
assert(
  adjacentBackward.previewSlotIndex === 1,
  'The preview index must point at the moved item after an adjacent backward move'
)

const forwardFromLeftEdge = buildPreview({
  slots: ['a', 'b', 'c', 'd'],
  draggingIds: ['a'],
  sourceIndex: 0,
  targetIndex: 1,
  zone: 'left',
})
const forwardFromRightEdge = buildPreview({
  slots: ['a', 'b', 'c', 'd'],
  draggingIds: ['a'],
  sourceIndex: 0,
  targetIndex: 1,
  zone: 'right',
})

assertOrder(
  forwardFromLeftEdge.order,
  ['b', 'c', 'a', 'd'],
  'A forward drag must move after the target even when entering from its left edge'
)
assertOrder(
  forwardFromRightEdge.order,
  ['b', 'c', 'a', 'd'],
  'A forward drag must remain stable after crossing to the target right edge'
)

const blankPageTail = buildPreview({
  slots: ['a', 'b', 'c', null],
  draggingIds: ['a'],
  sourceIndex: 0,
  targetIndex: 3,
  zone: 'right',
})

assertOrder(
  blankPageTail.order,
  ['b', 'c', 'a', null],
  'Dropping on a blank page tail must append within the compact page'
)
assert(blankPageTail.previewSlotIndex === 2, 'A blank tail drop must expose the final compact slot')

const fullPageOverflow = buildPreview({
  slots: ['a', 'b', 'c', 'd', 'e', null, null, null],
  draggingIds: ['e'],
  sourceIndex: 4,
  targetIndex: 1,
  zone: 'right',
  minPageCount: 2,
})

assertOrder(
  fullPageOverflow.order,
  ['a', 'e', 'b', 'c', 'd', null, null, null],
  'A backward move into a full page must carry the displaced item into the next page'
)
assertContainsEachIdOnce(
  fullPageOverflow.order,
  ['a', 'b', 'c', 'd', 'e'],
  'A full-page insertion must preserve every item exactly once'
)

const boundaryFolder = makeFolder('boundary', '2x1')
const folderBoundaryReorder = buildPreview({
  slots: ['a', 'folder:boundary', null, 'b'],
  items: [makeIcon('a'), boundaryFolder, makeIcon('b')],
  draggingIds: ['a'],
  sourceIndex: 0,
  targetIndex: 0,
  targetId: 'folder:boundary',
  zone: 'left',
  pageSize: 4,
  columns: 2,
})

assertOrder(
  folderBoundaryReorder.order,
  ['folder:boundary', null, 'a', 'b'],
  'Dragging across a folder boundary must reorder the grid instead of activating the folder'
)
const largeFolder = makeFolder('large', '2x2')
const largeFolderSlots = [
  'folder:large',
  null,
  'a',
  'b',
  null,
  null,
  'c',
  'd',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
]
const largeFolderMove = buildPreview({
  slots: largeFolderSlots,
  items: [largeFolder, ...['a', 'b', 'c', 'd'].map(makeIcon)],
  draggingIds: ['folder:large'],
  sourceIndex: 0,
  targetIndex: 15,
  zone: 'right',
  pageSize: 8,
  columns: 4,
  minPageCount: 2,
})

assertContainsEachIdOnce(
  largeFolderMove.order,
  ['folder:large', 'a', 'b', 'c', 'd'],
  'Moving a large folder must preserve each top-level item exactly once'
)
assert(
  largeFolderMove.order.indexOf('folder:large') > 0,
  'Moving a large folder to a later page must change its anchor position'
)
assert(
  largeFolderMove.previewSlotIndex === largeFolderMove.order.indexOf('folder:large'),
  'The large-folder preview index must match its final anchor'
)

const stablePhysicalTarget = resolveCompactStableTargetId({
  baseOrder: ['b', 'c', 'd', null],
  workingOrder: ['b', 'a', 'c', 'd'],
  draggingIds: ['a'],
  slotIndex: 2,
})
assert(
  stablePhysicalTarget === 'd',
  'A physical slot must keep its baseline target when preview occupants move through it'
)

const currentPreviewSlotTarget = resolveCompactStableTargetId({
  baseOrder: ['b', 'c', 'd', null],
  workingOrder: ['b', 'a', 'c', 'd'],
  draggingIds: ['a'],
  slotIndex: 1,
})
assert(
  currentPreviewSlotTarget === null,
  'A slot occupied by the hidden dragged preview must remain an explicit empty target'
)

const committedCompactPreviewOrder = preserveCompactPreviewOrderForCommit(
  droppedIntoVacatedSlot.order,
  ['a', 'b', 'c'].map(makeIcon)
)
assert(committedCompactPreviewOrder !== null, 'A valid compact preview must pass commit validation')
assertOrder(
  committedCompactPreviewOrder,
  droppedIntoVacatedSlot.order,
  'Commit validation must preserve the forward compact preview without recomputing positions'
)

assert(
  preserveCompactPreviewOrderForCommit(['a', 'a', null, null], [makeIcon('a')]) === null,
  'Commit validation must reject duplicate preview IDs instead of silently normalizing them'
)

console.log('scrollTopLevelLayout compact drag preview tests passed')
