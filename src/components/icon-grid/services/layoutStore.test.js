import { hydrateLayout } from './layoutStore.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const icon = id => ({
  id,
  name: id,
  path: id,
  target_path: id,
  icon_base64: '',
  item_type: 'shortcut',
  origin: 'import',
})

const persisted = {
  items: [
    {
      type: 'folder',
      id: 'work',
      name: 'Work',
      size: '1x1',
      children: ['deleted-icon', 'remaining-icon'],
    },
  ],
  slots: [null, 'folder:work', null, null],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
  coordinates: [
    {
      id: 'folder:work',
      cells: [{ page: 0, row: 0, col: 1 }],
    },
  ],
  scrollGroups: [
    {
      id: 'work-group',
      name: 'Work',
      icon: 'briefcase',
      itemIds: ['folder:work'],
    },
  ],
  scrollGroupItemsExplicit: true,
}

const hydrated = hydrateLayout([icon('remaining-icon')], persisted)
assert(
  hydrated.items.length === 1 &&
    hydrated.items[0].kind === 'icon' &&
    hydrated.items[0].key === 'remaining-icon',
  '删除两成员文件夹中的一个图标后，应保留另一个图标并折叠文件夹'
)
assert(
  hydrated.layout?.slots?.[1] === 'remaining-icon',
  '文件夹折叠后，剩余图标应留在文件夹原布局槽位'
)
assert(
  hydrated.layout?.coordinates?.[0]?.id === 'remaining-icon',
  '文件夹折叠后，持久化坐标应归属剩余图标'
)
assert(
  hydrated.layout?.scrollGroups?.[0]?.itemIds[0] === 'remaining-icon',
  '文件夹折叠后，滚动分组应保留剩余图标的原分组'
)

const dockHydrated = hydrateLayout([icon('remaining-icon')], {
  ...persisted,
  slots: [null, null, null, null],
  dockKeys: ['folder:work'],
  scrollGroups: undefined,
})
assert(
  dockHydrated.layout?.dockKeys[0] === 'remaining-icon',
  '文件夹位于 Dock 时，折叠后剩余图标应接替原 Dock 位置'
)

console.log('layoutStore 测试通过')
