import {
  buildDockLinearPreviewOrder,
  buildDockOccupiedSlotEntries,
  resolveDockInsertIndexByDisplayIndex,
  resolveDockInsertIndexFromCenters,
  selectDockOverlapCandidate,
} from './dockDragPolicy.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(
  JSON.stringify(buildDockLinearPreviewOrder(['a', null, 'b'], 'a', false)) ===
    JSON.stringify([null, 'a', 'b']),
  'Dock 线性预览应能把空槽插入目标之前'
)
assert(
  JSON.stringify(buildDockLinearPreviewOrder(['a', null, 'b'], 'b', true)) ===
    JSON.stringify(['a', 'b', null]),
  'Dock 线性预览应能把空槽插入目标之后'
)
const dockOrderWithoutHole = ['a', 'b']
assert(
  buildDockLinearPreviewOrder(dockOrderWithoutHole, 'b', false) === dockOrderWithoutHole,
  '没有空槽时 Dock 线性预览不得创建新顺序'
)

assert(
  resolveDockInsertIndexFromCenters(70, [100, 200, 300]) === 0,
  '指针落在首个 Dock 图标左侧时，插位索引应为 0'
)
assert(
  resolveDockInsertIndexFromCenters(149, [100, 200, 300]) === 1,
  '指针落在前两个 Dock 图标中间时，插位索引应为 1'
)
assert(
  resolveDockInsertIndexFromCenters(340, [100, 200, 300]) === 3,
  '指针落在最后一个 Dock 图标右侧时，插位索引应为末尾'
)

const occupiedSlots = buildDockOccupiedSlotEntries(['a', null, 'b', 'c'])
assert(
  JSON.stringify(occupiedSlots) ===
    JSON.stringify([
      { displayIndex: 0, targetId: 'a', targetIndex: 0 },
      { displayIndex: 2, targetId: 'b', targetIndex: 1 },
      { displayIndex: 3, targetId: 'c', targetIndex: 2 },
    ]),
  'Dock 显示槽位包含预览空槽时，目标的紧凑索引映射不正确'
)
assert(
  resolveDockInsertIndexByDisplayIndex(['a', null, 'b', 'c'], 1) === 1,
  '命中 Dock 预览空槽时，应锁定到当前空槽对应的插位索引'
)

const stableHoverTarget = selectDockOverlapCandidate(
  [
    {
      targetId: 'left',
      targetIndex: 0,
      iou: 0.57,
      intersectionArea: 57,
      centerManhattanDistance: 24,
    },
    {
      targetId: 'right',
      targetIndex: 1,
      iou: 0.54,
      intersectionArea: 54,
      centerManhattanDistance: 28,
    },
  ],
  'right',
  48
)

assert(
  stableHoverTarget?.targetId === 'right',
  '当两个 Dock 目标命中非常接近时，应优先保持当前悬停目标'
)

const obviousBestTarget = selectDockOverlapCandidate(
  [
    {
      targetId: 'left',
      targetIndex: 0,
      iou: 0.68,
      intersectionArea: 68,
      centerManhattanDistance: 14,
    },
    {
      targetId: 'right',
      targetIndex: 1,
      iou: 0.41,
      intersectionArea: 41,
      centerManhattanDistance: 38,
    },
  ],
  'right',
  48
)

assert(
  obviousBestTarget?.targetId === 'left',
  '当新的 Dock 目标明显更优时，不应继续强行保留旧悬停目标'
)

console.log('dockDragPolicy 测试通过')
