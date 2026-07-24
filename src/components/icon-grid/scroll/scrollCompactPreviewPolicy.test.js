import {
  buildCompactOuterBaseOrder,
  buildCompactOuterPreviewItems,
  compactPreviewOrderByPage,
} from './scrollCompactPreviewPolicy.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const icon = key => ({ kind: 'icon', key, icon: { key } })
const folder = (id, children = [], size = '1x1') => ({
  kind: 'folder',
  id,
  name: id,
  size,
  children,
})

const wideFolder = folder('wide', [], '2x2')
const first = icon('first')
const second = icon('second')
const itemById = new Map([
  ['folder:wide', wideFolder],
  [first.key, first],
  [second.key, second],
])
const compacted = compactPreviewOrderByPage({
  sourceOrder: ['folder:wide', first.key, second.key, null],
  itemById,
  omittedIds: new Set(),
  pageSize: 4,
  columns: 2,
})
assert(
  JSON.stringify(compacted) ===
    JSON.stringify(['folder:wide', null, null, null, first.key, second.key, null, null]),
  '大文件夹占满当前页时，紧凑预览应把溢出图标按顺序带到下一页'
)

const draggedChild = icon('dragged-child')
const sourceFolder = folder('source', [draggedChild, icon('remaining')])
const dragState = {
  draggingId: draggedChild.key,
  draggingItem: draggedChild,
  draggingIds: [draggedChild.key],
}
const previewItems = buildCompactOuterPreviewItems({
  state: dragState,
  outerItems: [first],
  allItems: [sourceFolder, first],
  itemById: new Map([[draggedChild.key, draggedChild]]),
})
assert(
  previewItems.map(item => (item.kind === 'folder' ? `folder:${item.id}` : item.key)).join(',') ===
    [first.key, draggedChild.key].join(','),
  '紧凑预览必须补回从文件夹拖出的图标'
)

const baseOrder = buildCompactOuterBaseOrder({
  state: dragState,
  sourceOrder: [first.key, draggedChild.key, second.key, null],
  previewItems: [first, draggedChild, second],
  pageSize: 4,
  columns: 2,
})
assert(
  JSON.stringify(baseOrder) === JSON.stringify([first.key, second.key, null, null]),
  '构建拖拽基准顺序时应移除全部拖拽项并紧凑排列剩余项'
)

console.log('scrollCompactPreviewPolicy 测试通过')
