import { resolveVerticalEdgeScrollSpeed } from './scrollEdgeAutoScrollPolicy.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(resolveVerticalEdgeScrollSpeed(0, 0, 600) === -12, '顶部边缘应达到最大向上速度')
assert(resolveVerticalEdgeScrollSpeed(36, 0, 600) === -6, '顶部速度应随指针接近边缘渐增')
assert(resolveVerticalEdgeScrollSpeed(300, 0, 600) === 0, '滚动区域中部不应触发自动滚动')
assert(resolveVerticalEdgeScrollSpeed(564, 0, 600) === 6, '底部速度应随指针接近边缘渐增')
assert(resolveVerticalEdgeScrollSpeed(600, 0, 600) === 12, '底部边缘应达到最大向下速度')

console.log('scrollEdgeAutoScrollPolicy 测试通过')
