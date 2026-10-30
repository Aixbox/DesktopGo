import { buildDragItemMap, resolveItemById } from './dragWorkflowShared.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const firstChild = { key: 'icon-a', kind: 'icon', label: 'A' }
const firstSnapshot = [{ id: 'folder-a', kind: 'folder', children: [firstChild] }]
const folderDrag = { context: 'folder', sourceFolderId: 'folder-a' }
const firstMap = buildDragItemMap(folderDrag, firstSnapshot)

assert(firstMap === buildDragItemMap(folderDrag, firstSnapshot), '同一布局快照应复用文件夹子项索引')
assert(firstMap.get('icon-a') === firstChild, '文件夹索引应通过 child key 返回图标')

const secondChild = { key: 'icon-b', kind: 'icon', label: 'B' }
const secondSnapshot = [{ id: 'folder-a', kind: 'folder', children: [secondChild] }]
const secondMap = buildDragItemMap(folderDrag, secondSnapshot)
assert(secondMap !== firstMap, '布局快照变化后不能复用旧索引')
assert(secondMap.get('icon-b') === secondChild, '新快照的文件夹索引应返回最新子项')

const topLevelItem = { id: 'folder-b', kind: 'folder', children: [] }
const indexedItems = new Map([['folder:folder-b', topLevelItem]])
assert(
  resolveItemById(indexedItems, [], 'folder:folder-b') === topLevelItem,
  '命中 Map 时应直接复用索引结果'
)
assert(
  resolveItemById(new Map(), [topLevelItem], 'folder:folder-b') === topLevelItem,
  'Map 未命中时应从最新 items 快照回退'
)

console.log('dragWorkflowShared 测试通过')
