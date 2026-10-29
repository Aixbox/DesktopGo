import {
  createHotseatPlaceholder,
  getHotseatCell,
  getHotseatOrderFromCell,
  mapHotseatCellsToOrder,
  mapHotseatOrderToCells,
  normalizeHotseatEntries,
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

console.log('hotseatLayout 测试通过')
