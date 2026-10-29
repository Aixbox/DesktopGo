export type LayoutPerformancePhase =
  | 'hydrate'
  | 'measure'
  | 'normalize'
  | 'reorder-preview'
  | 'persist'

export interface LayoutPerformanceSample {
  phase: LayoutPerformancePhase
  durationMs: number
  timestamp: number
  metadata?: Record<string, string | number | boolean | null>
}

export type LayoutPerformanceSink = (sample: LayoutPerformanceSample) => void

const MAX_SAMPLES = 120
const samples: LayoutPerformanceSample[] = []
let sink: LayoutPerformanceSink | null = null

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const isFiniteDuration = (value: number): boolean => Number.isFinite(value) && value >= 0

/** Record one bounded sample and expose it to optional developer tooling. */
export const recordLayoutPerformance = (
  phase: LayoutPerformancePhase,
  durationMs: number,
  metadata?: LayoutPerformanceSample['metadata']
): LayoutPerformanceSample | null => {
  if (!isFiniteDuration(durationMs)) return null

  const sample: LayoutPerformanceSample = {
    phase,
    durationMs,
    timestamp: Date.now(),
    ...(metadata ? { metadata: { ...metadata } } : {}),
  }
  samples.push(sample)
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
  sink?.(sample)

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('desktopgo:layout-performance', { detail: sample }))
  }
  return sample
}

/** Measure a synchronous layout-domain calculation without changing its result. */
export const measureLayoutPerformance = <T>(
  phase: LayoutPerformancePhase,
  operation: () => T,
  metadata?: LayoutPerformanceSample['metadata']
): T => {
  const start = now()
  try {
    return operation()
  } finally {
    recordLayoutPerformance(phase, now() - start, metadata)
  }
}

export const readLayoutPerformanceSamples = (): LayoutPerformanceSample[] =>
  samples.map(sample => ({
    ...sample,
    ...(sample.metadata ? { metadata: { ...sample.metadata } } : {}),
  }))

export const clearLayoutPerformanceSamples = (): void => {
  samples.length = 0
}

export const setLayoutPerformanceSink = (nextSink: LayoutPerformanceSink | null): (() => void) => {
  const previousSink = sink
  sink = nextSink
  return () => {
    sink = previousSink
  }
}
