import { getEvasionIntentSignature, getEvasionReadyDelay } from './evasionPolicy.ts'

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

console.log('evasionTiming tests passed')
