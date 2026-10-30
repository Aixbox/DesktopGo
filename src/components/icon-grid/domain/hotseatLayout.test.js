import {
  createHotseatPlaceholder,
  getHotseatCell,
  getHotseatOrderFromCell,
  mapHotseatCellsToOrder,
  mapHotseatOrderToCells,
  normalizeHotseatEntries,
  reconcileHotseatEntries,
  reorderHotseatItemIds,
  resolveHotseatDisplayEntries,
} from './hotseatLayout.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const horizontal = { count: 4, orientation: 'horizontal', rtl: false }
assert(
  JSON.stringify(getHotseatCell(0, horizontal)) === JSON.stringify({ cellX: 0, cellY: 0 }),
  '横向 LTR 的第一个 Hotseat 项应位于 x=0'
)
assert(
  JSON.stringify(getHotseatCell(0, { ...horizontal, rtl: true })) ===
    JSON.stringify({ cellX: 3, cellY: 0 }),
  '横向 RTL 应镜像主轴'
)
assert(
  JSON.stringify(getHotseatCell(3, horizontal)) === JSON.stringify({ cellX: 3, cellY: 0 }),
  '横向 LTR 的最后一个 Hotseat 项应位于末列'
)
assert(getHotseatOrderFromCell(3, 0, horizontal) === 3, 'cell 坐标应可反向解析为 order')
assert(getHotseatOrderFromCell(0, 4, horizontal) === null, '越界或错误轴向的 cell 不应生成 order')

const verticalEntries = [
  { kind: 'item', id: 'a' },
  createHotseatPlaceholder('divider'),
  { kind: 'item', id: 'b' },
]
const vertical = { count: 3, orientation: 'vertical', rtl: false }
const verticalCells = mapHotseatOrderToCells(verticalEntries, vertical)
assert(
  verticalCells[1].cellX === 0 && verticalCells[1].cellY === 1,
  '纵向 profile 应使用 y 作为主轴'
)
assert(
  mapHotseatCellsToOrder(verticalCells, vertical)[1]?.kind === 'placeholder',
  'cell 映射往返应保留 divider 占位项'
)
assert(
  mapHotseatOrderToCells(verticalEntries, { ...vertical, rtl: true })[0].cellY === 2,
  '纵向 RTL 应镜像主轴顺序'
)

const normalized = normalizeHotseatEntries(
  [{ kind: 'item', id: 'a' }, { kind: 'item', id: 'a' }, createHotseatPlaceholder('docker')],
  horizontal
)
assert(normalized.length === 4, 'Hotseat 归一化应补齐固定槽位')
assert(normalized.filter(entry => entry?.kind === 'item').length === 1, '重复项目只能保留一次')
assert(
  normalized[1]?.kind === 'placeholder' && normalized[1]?.placeholder === 'docker',
  '归一化应保留 Docker 占位项'
)

const displayEntries = resolveHotseatDisplayEntries(
  [
    { kind: 'item', id: 'old-a' },
    createHotseatPlaceholder('divider'),
    { kind: 'item', id: 'old-b' },
  ],
  ['a', 'b'],
  1
)
assert(
  displayEntries.map(entry => entry === null ? 'null' : entry.kind === 'item' ? entry.id : entry.placeholder).join('|') ===
    'a|divider|null|b',
  'Dock 拖动预览应保留占位项并在项目索引处插入空槽'
)

const reconciled = reconcileHotseatEntries(
  [
    { kind: 'item', id: 'old-a' },
    createHotseatPlaceholder('divider'),
    { kind: 'item', id: 'old-b' },
  ],
  ['b', 'a']
)
assert(
  reconciled?.map(entry => entry === null ? 'null' : entry.kind === 'item' ? entry.id : entry.placeholder).join('|') ===
    'b|divider|a',
  'Dock 提交后应保留占位项并应用新的项目顺序'
)
assert(
  reorderHotseatItemIds(['a', 'b', 'c'], 'c', 0).join('|') === 'c|a|b',
  '键盘 Dock 重排应把项目移动到目标索引'
)

console.log('hotseatLayout 测试通过')
