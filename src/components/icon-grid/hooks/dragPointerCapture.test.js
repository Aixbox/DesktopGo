import { activateDragPointerCapture, releaseDragPointerCapture } from './dragPointerCapture.ts'
import { resolvePendingDragMoveAction } from './dragActivationPolicy.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const history = []
const target = {
  captured: false,
  setPointerCapture(pointerId) {
    history.push(`set:${pointerId}`)
    this.captured = true
  },
  hasPointerCapture(pointerId) {
    history.push(`has:${pointerId}`)
    return this.captured
  },
  releasePointerCapture(pointerId) {
    history.push(`release:${pointerId}`)
    this.captured = false
  },
}

assert(history.length === 0, '待定点击阶段不应主动设置 pointer capture')
assert(
  resolvePendingDragMoveAction({ activateOnMove: true }, 8, 7) === 'begin',
  '滚动网格指针移动超过阈值后应立即进入拖拽'
)
assert(
  resolvePendingDragMoveAction({ activateOnMove: false }, 8, 7) === 'abort',
  '长按拖拽在计时完成前移动超过阈值时应取消'
)
assert(
  resolvePendingDragMoveAction({ activateOnMove: true }, 7, 7) === 'wait',
  '指针移动未超过阈值时不应提前进入拖拽'
)

const activeTarget = activateDragPointerCapture(target, 7)
assert(activeTarget === target, '进入真实拖拽后应返回当前 capture 目标')
assert(history[0] === 'set:7', '只有进入真实拖拽后才应设置 pointer capture')

const releasedTarget = releaseDragPointerCapture(activeTarget, 7)
assert(releasedTarget === null, '释放 pointer capture 后应清空保存的目标引用')
assert(
  JSON.stringify(history) === JSON.stringify(['set:7', 'has:7', 'release:7']),
  `pointer capture 的设置与释放时序不正确：${JSON.stringify(history)}`
)

console.log('dragPointerCapture 测试通过')
