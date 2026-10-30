import {
  clearLayoutPerformanceSamples,
  measureDragFrame,
  measureLayoutPerformance,
  readLayoutPerformanceSamples,
  readLayoutPerformanceSummary,
  recordLayoutPerformance,
  setLayoutPerformanceSink,
  setLayoutPerformanceTelemetrySink,
} from './layoutPerformance.ts'

clearLayoutPerformanceSamples()
const received = []
const restoreSink = setLayoutPerformanceSink(sample => received.push(sample))
const telemetry = []
const restoreTelemetry = setLayoutPerformanceTelemetrySink(sample => telemetry.push(sample))
const result = measureLayoutPerformance('normalize', () => 42, { scope: 'paged', itemCount: 3 })
restoreSink()
restoreTelemetry()

if (result !== 42) throw new Error('性能采样不能改变计算结果')
if (received.length !== 1 || received[0].phase !== 'normalize') {
  throw new Error('性能采样 sink 未收到 phase')
}
if (received[0].metadata?.scope !== 'paged') {
  throw new Error('性能采样应保留 metadata')
}
if (telemetry.length !== 1 || telemetry[0].phase !== 'normalize') {
  throw new Error('telemetry sink 未收到布局样本')
}

recordLayoutPerformance('measure', 4)
const samples = readLayoutPerformanceSamples()
if (samples.length !== 2 || samples[0].durationMs < 0) {
  throw new Error('性能采样快照不完整')
}

clearLayoutPerformanceSamples()
const dragResult = measureDragFrame('paged', () => 7, { draggingItemCount: 2 })
if (dragResult !== 7) throw new Error('拖动帧采样不能改变计算结果')
const dragSamples = readLayoutPerformanceSamples()
if (
  dragSamples.length !== 1 ||
  dragSamples[0].phase !== 'drag-frame' ||
  dragSamples[0].metadata?.scope !== 'paged' ||
  dragSamples[0].metadata?.draggingItemCount !== 2 ||
  dragSamples[0].metadata?.frameDurationMs !== dragSamples[0].durationMs
) {
  throw new Error('拖动帧采样缺少必要 metadata')
}
const dragSummary = readLayoutPerformanceSummary('drag-frame')[0]
if (
  !dragSummary ||
  dragSummary.sampleCount !== 1 ||
  dragSummary.budgetMs === null ||
  dragSummary.maxDurationMs < 0 ||
  dragSummary.overBudgetCount < 0
) {
  throw new Error('拖动帧性能统计不完整')
}

clearLayoutPerformanceSamples()
if (readLayoutPerformanceSamples().length !== 0) throw new Error('性能采样清理失败')

console.log('layoutPerformance 测试通过')
