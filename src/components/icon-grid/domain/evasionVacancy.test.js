import { applyOuterEvasionPolicy } from './dragMovePolicy.ts'
import { DRAG_HOLE_ID } from './slots.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const makeIcon = key => ({
  kind: 'icon',
  key,
  icon: { path: key },
})

const makeRect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
})

const items = ['a', 'b', 'c', 'd', 'e'].map(makeIcon)
let order = [DRAG_HOLE_ID, 'a', 'b', 'c', 'd', 'e']

for (const targetIndex of [4, 2, 5, 1, 3]) {
  const targetId = order[targetIndex]
  assert(targetId !== DRAG_HOLE_ID, '测试目标不能是当前拖拽洞')

  order = applyOuterEvasionPolicy(
    order,
    {
      targetId,
      targetIndex,
      targetRect: makeRect(0, 0, 100, 100),
      overlapRect: makeRect(45, 45, 20, 20),
      iou: 0.04,
      intersectionArea: 400,
      centerManhattanDistance: 10,
      zone: 'center',
    },
    6,
    3,
    true,
    { items }
  ).order

  assert(order.length === 6, '满页已有拖拽洞时，连续避让不得创建新页面')
  assert(
    order.filter(slot => slot === DRAG_HOLE_ID).length === 1,
    '连续避让后必须仍然只有一个拖拽洞'
  )
  assert(order.filter(Boolean).length === 6, '连续避让不得遗留额外空槽或丢失图标')
}

assert(
  JSON.stringify([...order].filter(slot => slot !== DRAG_HOLE_ID).sort()) ===
    JSON.stringify(['a', 'b', 'c', 'd', 'e']),
  '连续避让不得改变图标集合'
)

const largeFolder = {
  kind: 'folder',
  id: 'large',
  name: 'Large',
  size: '2x2',
  children: [],
}
const footprintIcons = ['a', 'b', 'c', 'd'].map(makeIcon)
const footprintItems = [...footprintIcons, largeFolder]
const footprintBaseOrder = Array.from({ length: 12 }, () => null)
footprintBaseOrder[2] = 'a'
footprintBaseOrder[3] = 'b'
footprintBaseOrder[6] = 'c'
footprintBaseOrder[7] = 'd'
const footprintHit = {
  targetId: 'a',
  targetIndex: 2,
  targetRect: makeRect(100, 0, 100, 100),
  overlapRect: makeRect(100, 0, 30, 30),
  iou: 0.09,
  intersectionArea: 900,
  centerManhattanDistance: 10,
  zone: 'left',
}

const fullFootprintPreview = applyOuterEvasionPolicy(
  footprintBaseOrder,
  footprintHit,
  12,
  4,
  true,
  {
    items: footprintItems,
    draggingItem: largeFolder,
    draggingIds: ['folder:large'],
    targetAnchorIndex: 2,
  }
).order
assert(
  [2, 3, 6, 7].every(index => !['a', 'b', 'c', 'd'].includes(fullFootprintPreview[index])),
  '2x2 文件夹首次避让时，四个占位格的图标都应让开'
)

const partialFootprintPreview = applyOuterEvasionPolicy(
  footprintBaseOrder,
  footprintHit,
  12,
  4,
  true,
  {
    items: footprintItems,
    draggingItem: largeFolder,
    draggingIds: ['folder:large'],
    targetAnchorIndex: 1,
  }
).order
assert(
  partialFootprintPreview[3] === 'b' && partialFootprintPreview[7] === 'd',
  '2x2 文件夹左移后，已释放的右侧两格应恢复原图标'
)
assert(
  partialFootprintPreview[2] !== 'a' && partialFootprintPreview[6] !== 'c',
  '仍与文件夹 footprint 重叠的左侧两格图标应继续避让'
)

console.log('分页避让 vacancy 测试通过')
