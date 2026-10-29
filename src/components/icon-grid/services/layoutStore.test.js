import {
  calculateLayoutChecksum,
  hydrateLayout,
  parsePersistedLayout,
  parsePersistedLayoutStrict,
} from './layoutStore.ts'

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

const validV10Layout = {
  items: [{ type: 'icon', key: 'remaining-icon' }],
  slots: ['remaining-icon'],
  dockKeys: [],
  pageSize: 1,
  columns: 1,
  revision: 7,
}
const validV10Payload = JSON.stringify({
  version: 10,
  ...validV10Layout,
  checksum: calculateLayoutChecksum(validV10Layout),
})
const parsedV10 = parsePersistedLayout(validV10Payload)
assert(parsedV10?.revision === 7, 'v10 布局应保留 revision')
assert(parsedV10?.checksum, 'v10 布局应保留 checksum')
assert(
  parsePersistedLayoutStrict(validV10Payload, 'paged').revision === 7,
  '合法 checksum 应通过严格读取'
)

const canonicalV10Layout = {
  items: [
    { type: 'icon', key: 'a' },
    { type: 'icon', key: 'b' },
  ],
  slots: ['a', 'b', null, null],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
  placements: [
    {
      id: 'a',
      container: 'workspace',
      page: 0,
      row: 0,
      col: 1,
      spanX: 1,
      spanY: 1,
      rank: 0,
    },
    {
      id: 'b',
      container: 'workspace',
      page: 0,
      row: 0,
      col: 0,
      spanX: 1,
      spanY: 1,
      rank: 1,
    },
  ],
  revision: 8,
}
const canonicalV10Payload = JSON.stringify({
  version: 10,
  ...canonicalV10Layout,
  checksum: calculateLayoutChecksum(canonicalV10Layout),
})
const parsedCanonical = parsePersistedLayoutStrict(canonicalV10Payload, 'paged')
const canonicalHydrated = hydrateLayout([icon('a'), icon('b')], parsedCanonical)
assert(
  canonicalHydrated.layout?.slots?.[0] === 'b' && canonicalHydrated.layout?.slots?.[1] === 'a',
  'hydration 应以 canonical placement 覆盖冲突的旧 slots'
)

let missingIntegrityRejected = false
try {
  parsePersistedLayoutStrict(JSON.stringify({ version: 10, ...validV10Layout }), 'paged')
} catch {
  missingIntegrityRejected = true
}
assert(missingIntegrityRejected, 'v10 布局缺少 revision/checksum 时应拒绝读取')

assert(
  parsePersistedLayout(
    JSON.stringify({ version: 10, items: [], slots: [42], dockKeys: [], revision: 1, checksum: '' })
  ) === null,
  'slot 引用包含非字符串值时不能静默转换为 null'
)

let malformedCoordinateRejected = false
try {
  parsePersistedLayoutStrict(
    JSON.stringify({
      version: 10,
      items: [],
      slots: [],
      dockKeys: [],
      coordinates: [{ id: 'a', cells: [{ page: 0, row: 'bad', col: 0 }] }],
      revision: 1,
      checksum: '00000000',
    }),
    'paged'
  )
} catch {
  malformedCoordinateRejected = true
}
assert(malformedCoordinateRejected, '非法坐标不能在严格 hydration 时被静默丢弃')

const tamperedV10Payload = validV10Payload.replace('remaining-icon', 'tampered-icon')
let checksumRejected = false
try {
  parsePersistedLayoutStrict(tamperedV10Payload, 'paged')
} catch {
  checksumRejected = true
}
assert(checksumRejected, '修改布局内容后应拒绝 checksum 不匹配的 payload')

const duplicateSlotPayload = JSON.stringify({
  version: 10,
  items: [{ type: 'icon', key: 'a' }],
  slots: ['a', 'a'],
  dockKeys: [],
  revision: 1,
  checksum: calculateLayoutChecksum({
    items: [{ type: 'icon', key: 'a' }],
    slots: ['a', 'a'],
    dockKeys: [],
    revision: 1,
  }),
})
let duplicateRejected = false
try {
  parsePersistedLayoutStrict(duplicateSlotPayload, 'paged')
} catch {
  duplicateRejected = true
}
assert(duplicateRejected, '重复 slot 引用应被深层布局校验拒绝')

console.log('layoutStore 测试通过')
