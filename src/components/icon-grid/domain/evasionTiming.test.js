import {
  getEvasionIntentSignature,
  getEvasionReadyDelay,
  hasPointerExitedEvasionHold,
} from './evasionPolicy.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(
  getEvasionIntentSignature('target', 'left') !== getEvasionIntentSignature('target', 'right'),
  '同一目标的不同命中区域必须是不同避让意图'
)

assert(
  getEvasionReadyDelay({
    now: 50,
    dwellStartedAt: 0,
    dwellMs: 100,
    lastEvasionAt: null,
    cooldownMs: 200,
  }) === 50,
  '首次避让只需要等待 dwell'
)

assert(
  getEvasionReadyDelay({
    now: 1000,
    dwellStartedAt: 1000,
    dwellMs: 250,
    lastEvasionAt: 900,
    cooldownMs: 200,
  }) === 250,
  'A changed anchor must still wait for the full 250ms dwell'
)

assert(
  getEvasionReadyDelay({
    now: 150,
    dwellStartedAt: 100,
    dwellMs: 100,
    lastEvasionAt: 100,
    cooldownMs: 200,
  }) === 150,
  '冷却期内切换目标时应等待剩余冷却，而不是触发后永久失效'
)

assert(
  getEvasionReadyDelay({
    now: 320,
    dwellStartedAt: 100,
    dwellMs: 100,
    lastEvasionAt: 100,
    cooldownMs: 200,
  }) === 0,
  'dwell 和冷却都结束后必须立即允许下一次避让'
)

assert(
  getEvasionReadyDelay({
    now: 299.4,
    dwellStartedAt: 100,
    dwellMs: 100,
    lastEvasionAt: 100,
    cooldownMs: 200,
  }) === 1,
  '小数毫秒必须向上取整，避免 timer 提前触发后重新落入冷却'
)

const holdBounds = {
  centerX: 100,
  centerY: 100,
  stepX: 100,
  stepY: 80,
  exitMargin: 16,
}
assert(
  !hasPointerExitedEvasionHold({ pointerX: 166, pointerY: 100, ...holdBounds }),
  '越过中线但未超过 16px 缓冲时应保持避让'
)
assert(
  hasPointerExitedEvasionHold({ pointerX: 167, pointerY: 100, ...holdBounds }),
  '指针超过水平中线 16px 缓冲后才应释放避让'
)
assert(
  hasPointerExitedEvasionHold({ pointerX: 100, pointerY: 157, ...holdBounds }),
  '指针超过垂直中线 16px 缓冲后才应释放避让'
)

console.log('evasionTiming tests passed')
