import {
  clearLayoutPerformanceSamples,
  measureLayoutPerformance,
  readLayoutPerformanceSamples,
  recordLayoutPerformance,
  setLayoutPerformanceSink,
} from './layoutPerformance.ts'

clearLayoutPerformanceSamples()
const received = []
const restoreSink = setLayoutPerformanceSink(sample => received.push(sample))
const result = measureLayoutPerformance('normalize', () => 42, { scope: 'paged', itemCount: 3 })
restoreSink()

if (result !== 42) throw new Error('性能采样不能改变计算结果')
if (received.length !== 1 || received[0].phase !== 'normalize') {
  throw new Error('性能采样 sink 未收到 phase')
}
if (received[0].metadata?.scope !== 'paged') {
  throw new Error('性能采样应保留 metadata')
}

recordLayoutPerformance('measure', 4)
const samples = readLayoutPerformanceSamples()
if (samples.length !== 2 || samples[0].durationMs < 0) {
  throw new Error('性能采样快照不完整')
}

clearLayoutPerformanceSamples()
if (readLayoutPerformanceSamples().length !== 0) throw new Error('性能采样清理失败')

console.log('layoutPerformance 测试通过')
