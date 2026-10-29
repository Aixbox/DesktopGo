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
