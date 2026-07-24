import { resolveMixedSelectionDragIds } from './multiSelectionPolicy.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const icon = key => ({ kind: 'icon', key, icon: { key } })
const folder = (id, children) => ({ kind: 'folder', id, name: id, size: '1x1', children })

const lead = icon('lead')
const outerPeer = icon('outer-peer')
const dockPeer = icon('dock-peer')
const firstFolderPeer = icon('folder-first')
const preferredFolderPeer = icon('folder-preferred')
const items = [
  lead,
  outerPeer,
  dockPeer,
  folder('first', [firstFolderPeer]),
  folder('preferred', [preferredFolderPeer]),
]
const itemById = new Map(
  items.map(item => [item.kind === 'folder' ? `folder:${item.id}` : item.key, item])
)
const selectedIconKeys = new Set(items.flatMap(item => (item.kind === 'icon' ? [item.key] : [])))
selectedIconKeys.add(firstFolderPeer.key)
selectedIconKeys.add(preferredFolderPeer.key)

const resolveTopLevelOrder = context =>
  context === 'dock' ? [dockPeer.key] : [outerPeer.key, lead.key]

const outerDragIds = resolveMixedSelectionDragIds({
  context: 'outer',
  leadId: lead.key,
  leadItem: lead,
  sourceOrder: [outerPeer.key, lead.key],
  sourceFolderId: null,
  openFolderId: 'preferred',
  selectionMode: true,
  selectedIconKeys,
  items,
  itemById,
  getTopLevelOrder: resolveTopLevelOrder,
})
assert(
  outerDragIds.join(',') ===
    [lead.key, outerPeer.key, dockPeer.key, preferredFolderPeer.key, firstFolderPeer.key].join(','),
  '外层多选拖拽应保持外层、Dock、首选文件夹、其他文件夹的优先级'
)

const folderDragIds = resolveMixedSelectionDragIds({
  context: 'folder',
  leadId: preferredFolderPeer.key,
  leadItem: preferredFolderPeer,
  sourceOrder: [preferredFolderPeer.key],
  sourceFolderId: 'preferred',
  openFolderId: 'first',
  selectionMode: true,
  selectedIconKeys,
  items,
  itemById,
  getTopLevelOrder: resolveTopLevelOrder,
})
assert(
  folderDragIds.join(',') ===
    [preferredFolderPeer.key, firstFolderPeer.key, dockPeer.key, outerPeer.key, lead.key].join(','),
  '文件夹多选拖拽应先收集文件夹，再收集 Dock 和外层图标'
)

const singleDragIds = resolveMixedSelectionDragIds({
  context: 'outer',
  leadId: lead.key,
  leadItem: lead,
  sourceOrder: [lead.key],
  sourceFolderId: null,
  openFolderId: null,
  selectionMode: false,
  selectedIconKeys,
  items,
  itemById,
  getTopLevelOrder: () => {
    throw new Error('关闭多选时不应解析其他布局')
  },
})
assert(singleDragIds.join(',') === lead.key, '关闭多选时只能拖拽主图标')

console.log('multiSelectionPolicy 测试通过')
