import { resolveGridPreviewFootprint } from './gridPreviewFootprint.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const makeIcon = key => ({
  kind: 'icon',
  key,
  icon: { path: key },
})

const folder = {
  kind: 'folder',
  id: 'docs',
  name: 'Docs',
  size: '2x2',
  children: [],
}

const emptySlots = Array.from({ length: 12 }, () => null)
const folderFootprint = resolveGridPreviewFootprint({
  anchorIndex: 1,
  currentPage: 0,
  columns: 4,
  folderPreviewTargetId: null,
  item: folder,
  items: [folder],
  pageSize: 12,
  slots: emptySlots,
})

assert(
  JSON.stringify(folderFootprint) ===
    JSON.stringify({ row: 0, col: 1, span: { cols: 2, rows: 2 } }),
  'A 2x2 folder preview should describe its full grid footprint'
)

const singleIconFootprint = resolveGridPreviewFootprint({
  anchorIndex: 5,
  currentPage: 0,
  columns: 4,
  folderPreviewTargetId: null,
  item: makeIcon('app'),
  items: [makeIcon('app')],
  pageSize: 12,
  slots: emptySlots,
})
assert(
  singleIconFootprint?.row === 1 && singleIconFootprint.col === 1,
  'Single-icon previews should keep their existing 1x1 placement'
)

assert(
  resolveGridPreviewFootprint({
    anchorIndex: 3,
    currentPage: 0,
    columns: 4,
    folderPreviewTargetId: null,
    item: folder,
    items: [folder],
    pageSize: 12,
    slots: emptySlots,
  }) === null,
  'A multi-cell preview should not cross the right edge of a grid'
)

const occupiedSlots = [...emptySlots]
occupiedSlots[2] = 'blocked'
assert(
  resolveGridPreviewFootprint({
    anchorIndex: 1,
    currentPage: 0,
    columns: 4,
    folderPreviewTargetId: null,
    item: folder,
    items: [folder, makeIcon('blocked')],
    pageSize: 12,
    slots: occupiedSlots,
  }) === null,
  'A multi-cell preview should be hidden when its footprint overlaps an occupied cell'
)

assert(
  resolveGridPreviewFootprint({
    anchorIndex: 1,
    currentPage: 0,
    columns: 4,
    folderPreviewTargetId: 'folder:target',
    item: folder,
    items: [folder],
    pageSize: 12,
    slots: emptySlots,
  }) === null,
  'A merge target should keep using the folder merge preview'
)
