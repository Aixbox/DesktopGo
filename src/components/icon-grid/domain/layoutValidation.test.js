import { validatePersistedLayout } from './layoutValidation.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const base = {
  items: [
    { type: 'folder', id: 'work', name: 'Work', size: '2x2', children: ['a', 'b'] },
    { type: 'icon', key: 'mail' },
  ],
  slots: ['folder:work', null, null, null, 'mail', null, null, null],
  dockKeys: [],
  pageSize: 8,
  columns: 4,
}

const validPlacements = [
  {
    id: 'folder:work',
    container: 'workspace',
    page: 0,
    row: 0,
    col: 0,
    spanX: 2,
    spanY: 2,
    rank: 0,
  },
  {
    id: 'mail',
    container: 'workspace',
    page: 0,
    row: 1,
    col: 2,
    spanX: 1,
    spanY: 1,
    rank: 1,
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
]

assert(
  validatePersistedLayout({ ...base, placements: validPlacements }).valid,
  '完整 canonical placements 应通过深层校验'
)

const overlap = validatePersistedLayout({
  ...base,
  placements: validPlacements.map(placement =>
    placement.id === 'mail' ? { ...placement, row: 0, col: 1 } : placement
  ),
})
assert(!overlap.valid, 'workspace span 重叠应被拒绝')

const missing = validatePersistedLayout({
  ...base,
  placements: validPlacements.filter(placement => placement.id !== 'b'),
})
assert(!missing.valid, '缺少 folder child placement 应被拒绝')

const wrongFolder = validatePersistedLayout({
  ...base,
  items: [...base.items, { type: 'folder', id: 'other', name: 'Other', size: '1x1', children: [] }],
  placements: validPlacements.map(placement =>
    placement.id === 'b' ? { ...placement, container: { folderId: 'folder:other' } } : placement
  ),
})
assert(!wrongFolder.valid, 'folder child 放入错误容器应被拒绝')

const validWidgetLayout = {
  items: [
    {
      type: 'widget',
      id: 'clock',
      provider: 'com.example.clock',
      label: 'Clock',
      spanX: 2,
      spanY: 1,
      minSpanX: 1,
      minSpanY: 1,
      maxSpanX: 3,
      maxSpanY: 2,
      appWidgetId: 7,
    },
  ],
  slots: ['widget:clock', null, null, null, null, null, null, null],
  dockKeys: [],
  pageSize: 8,
  columns: 4,
  placements: [
    {
      id: 'widget:clock',
      container: 'workspace',
      page: 0,
      row: 0,
      col: 0,
      spanX: 2,
      spanY: 1,
      rank: 0,
    },
  ],
}
assert(
  validatePersistedLayout(validWidgetLayout).valid,
  '有效 Widget 元数据和 placement 应通过校验'
)

const invalidWidgetBounds = validatePersistedLayout({
  ...validWidgetLayout,
  items: [{ ...validWidgetLayout.items[0], spanX: 4, maxSpanX: 3 }],
  placements: [{ ...validWidgetLayout.placements[0], spanX: 4 }],
})
assert(!invalidWidgetBounds.valid, 'Widget 当前 span 超出 provider max span 应被拒绝')

const invalidWidgetShape = validatePersistedLayout({
  ...validWidgetLayout,
  items: [{ ...validWidgetLayout.items[0], spanY: undefined, appWidgetId: -1 }],
})
assert(!invalidWidgetShape.valid, 'Widget 缺少 span 或使用负 appWidgetId 应被拒绝')

console.log('layoutValidation canonical 测试通过')
