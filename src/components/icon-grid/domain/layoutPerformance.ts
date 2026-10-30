export type LayoutPerformancePhase =
  | 'hydrate'
  | 'measure'
  | 'normalize'
  | 'reorder-preview'
  | 'persist'
  | 'drag-frame'

export interface LayoutPerformanceSample {
  phase: LayoutPerformancePhase
  durationMs: number
  timestamp: number
  metadata?: Record<string, string | number | boolean | null>
}

export type LayoutPerformanceSink = (sample: LayoutPerformanceSample) => void
export type LayoutPerformanceTelemetrySink = (sample: LayoutPerformanceSample) => void

const MAX_SAMPLES = 120
export const DRAG_FRAME_BUDGET_MS = 1000 / 60
const samples: LayoutPerformanceSample[] = []
let sink: LayoutPerformanceSink | null = null
let telemetrySink: LayoutPerformanceTelemetrySink | null = null

export interface LayoutPerformanceSummary {
  phase: LayoutPerformancePhase
  sampleCount: number
  totalDurationMs: number
  averageDurationMs: number
  maxDurationMs: number
  p95DurationMs: number
  budgetMs: number | null
  overBudgetCount: number
}

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const isFiniteDuration = (value: number): boolean => Number.isFinite(value) && value >= 0

const getBudgetForPhase = (phase: LayoutPerformancePhase): number | null =>
  phase === 'drag-frame' ? DRAG_FRAME_BUDGET_MS : null

/** Record one bounded sample and expose it to optional developer tooling. */
export const recordLayoutPerformance = (
  phase: LayoutPerformancePhase,
  durationMs: number,
  metadata?: LayoutPerformanceSample['metadata']
): LayoutPerformanceSample | null => {
  if (!isFiniteDuration(durationMs)) return null

  const sampleMetadata = metadata ? { ...metadata } : {}
  if (phase === 'drag-frame') {
    sampleMetadata.frameDurationMs = durationMs
    sampleMetadata.frameBudgetMs = DRAG_FRAME_BUDGET_MS
    sampleMetadata.overBudget = durationMs > DRAG_FRAME_BUDGET_MS
  }

  const sample: LayoutPerformanceSample = {
    phase,
    durationMs,
    timestamp: Date.now(),
    ...(Object.keys(sampleMetadata).length > 0 ? { metadata: sampleMetadata } : {}),
  }
  samples.push(sample)
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
  sink?.(sample)
  telemetrySink?.(sample)

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

/** Measure one requestAnimationFrame drag calculation and annotate its frame budget. */
export const measureDragFrame = <T>(
  scope: string,
  operation: () => T,
  metadata?: LayoutPerformanceSample['metadata']
): T => {
  const start = now()
  try {
    return operation()
  } finally {
    recordLayoutPerformance('drag-frame', now() - start, {
      ...metadata,
      scope,
      scheduler: 'raf',
    })
  }
}

export const readLayoutPerformanceSamples = (): LayoutPerformanceSample[] =>
  samples.map(sample => ({
    ...sample,
    ...(sample.metadata ? { metadata: { ...sample.metadata } } : {}),
  }))

/** Summarize the bounded in-memory samples for diagnostics and telemetry export. */
export const readLayoutPerformanceSummary = (
  phase?: LayoutPerformancePhase
): LayoutPerformanceSummary[] => {
  const grouped = new Map<LayoutPerformancePhase, number[]>()
  for (const sample of samples) {
    if (phase && sample.phase !== phase) continue
    const durations = grouped.get(sample.phase) ?? []
    durations.push(sample.durationMs)
    grouped.set(sample.phase, durations)
  }

  return Array.from(grouped, ([samplePhase, durations]) => {
    const sorted = [...durations].sort((left, right) => left - right)
    const totalDurationMs = durations.reduce((total, duration) => total + duration, 0)
    const budgetMs = getBudgetForPhase(samplePhase)
    return {
      phase: samplePhase,
      sampleCount: durations.length,
      totalDurationMs,
      averageDurationMs: totalDurationMs / durations.length,
      maxDurationMs: sorted[sorted.length - 1] ?? 0,
      p95DurationMs: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
      budgetMs,
      overBudgetCount:
        budgetMs === null ? 0 : durations.filter(duration => duration > budgetMs).length,
    }
  })
}

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

/** Attach a product-level telemetry adapter without coupling the domain to a backend. */
export const setLayoutPerformanceTelemetrySink = (
  nextSink: LayoutPerformanceTelemetrySink | null
): (() => void) => {
  const previous = telemetrySink
  telemetrySink = nextSink
  return () => {
    telemetrySink = previous
  }
}
