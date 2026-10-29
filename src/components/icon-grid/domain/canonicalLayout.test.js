import {
  buildCanonicalPlacements,
  materializeLayoutFromCanonicalPlacements,
} from './canonicalLayout.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const legacyLayout = {
  items: [
    { type: 'folder', id: 'work', name: 'Work', size: '2x2', children: ['b', 'a'] },
    { type: 'icon', key: 'mail' },
  ],
  slots: ['folder:work', null, null, null, 'mail', null, null, null],
  dockKeys: ['mail'],
  pageSize: 8,
  columns: 4,
}

const placements = buildCanonicalPlacements(legacyLayout)
const workspaceFolder = placements.find(
  placement => placement.id === 'folder:work' && placement.container === 'workspace'
)
assert(
  workspaceFolder?.spanX === 2 && workspaceFolder?.spanY === 2,
  'folder placement 应保存 2×2 span'
)
assert(
  placements.some(
    placement =>
      placement.id === 'a' &&
      typeof placement.container === 'object' &&
      placement.container.folderId === 'folder:work' &&
      placement.rank === 1
  ),
  'folder child placement 应保存 folder container 和 rank'
)

const widgetPlacements = buildCanonicalPlacements({
  items: [
    {
      type: 'widget',
      id: 'clock',
      provider: 'com.example.clock',
      label: 'Clock',
      spanX: 2,
      spanY: 1,
    },
  ],
  slots: ['widget:clock', null, null, null],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
})
assert(
  widgetPlacements.find(placement => placement.id === 'widget:clock')?.spanX === 2,
  'canonical placement 应保留 Widget provider 的 span'
)

const thirteenChildren = Array.from({ length: 13 }, (_, index) => `child-${index}`)
const pagedFolderPlacements = buildCanonicalPlacements({
  items: [{ type: 'folder', id: 'paged', name: 'Paged', children: thirteenChildren }],
  slots: ['folder:paged'],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
}).filter(placement => typeof placement.container === 'object')
assert(
  pagedFolderPlacements.find(placement => placement.rank === 12)?.page === 1 &&
    pagedFolderPlacements.find(placement => placement.rank === 12)?.row === 0 &&
    pagedFolderPlacements.find(placement => placement.rank === 12)?.col === 0,
  'canonical folder placement 应按 profile 将第 13 个项目放入第二页左上角'
)

const simpleProfilePlacements = buildCanonicalPlacements({
  items: [{ type: 'folder', id: 'simple', name: 'Simple', children: thirteenChildren }],
  folderProfileId: 'simple',
  slots: ['folder:simple'],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
}).filter(placement => typeof placement.container === 'object')
assert(
  simpleProfilePlacements.find(placement => placement.rank === 6)?.page === 1 &&
    simpleProfilePlacements.find(placement => placement.rank === 6)?.row === 0 &&
    simpleProfilePlacements.find(placement => placement.rank === 6)?.col === 0,
  'canonical placement 应按持久化的 simple profile 使用 2×3 容量'
)

const canonicalLayout = {
  ...legacyLayout,
  slots: ['mail', null, null, null, 'folder:work', null, null, null],
  dockKeys: ['folder:work'],
  placements: [
    {
      id: 'folder:work',
      container: 'workspace',
      page: 0,
      row: 0,
      col: 2,
      spanX: 2,
      spanY: 2,
      rank: 1,
    },
    {
      id: 'mail',
      container: 'workspace',
      page: 0,
      row: 0,
      col: 0,
      spanX: 1,
      spanY: 1,
      rank: 0,
    },
    {
      id: 'a',
      container: { folderId: 'folder:work' },
      page: 0,
      row: 0,
      col: 0,
      spanX: 1,
      spanY: 1,
      rank: 0,
    },
    {
      id: 'b',
      container: { folderId: 'folder:work' },
      page: 0,
      row: 0,
      col: 1,
      spanX: 1,
      spanY: 1,
      rank: 1,
    },
  ],
}

const materialized = materializeLayoutFromCanonicalPlacements(canonicalLayout)
assert(
  materialized.slots[2] === 'folder:work' && materialized.slots[0] === 'mail',
  'canonical workspace placement 应覆盖旧 slots'
)
assert(materialized.dockKeys[0] === 'folder:work', 'canonical Dock placement 应覆盖旧 dockKeys')
assert(
  materialized.items[0].type === 'folder' && materialized.items[0].children[0] === 'a',
  'canonical folder rank 应决定 children 顺序'
)
assert(
  materialized.coordinates?.find(entry => entry.id === 'folder:work')?.cells.length === 4,
  'canonical span 应派生完整 workspace coordinates'
)

const legacyWithoutPlacements = materializeLayoutFromCanonicalPlacements({
  ...legacyLayout,
  placements: undefined,
})
assert(
  legacyWithoutPlacements.slots[0] === 'folder:work',
  '没有 placements 的旧 payload 应保持 slots 迁移路径'
)

console.log('canonicalLayout 测试通过')
