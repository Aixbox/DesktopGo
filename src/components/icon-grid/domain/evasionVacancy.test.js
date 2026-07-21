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

console.log('分页避让 vacancy 测试通过')
