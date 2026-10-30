import { invoke } from '@tauri-apps/api/core'
import {
  setLayoutPerformanceTelemetrySink,
  type LayoutPerformanceSample,
} from '../domain/layoutPerformance'

const MAX_BATCH_SIZE = 32
const FLUSH_DELAY_MS = 250

let pendingSamples: LayoutPerformanceSample[] = []
let flushTimer: number | null = null
let installed = false

const flush = async () => {
  flushTimer = null
  if (pendingSamples.length === 0) return
  const batch = pendingSamples.splice(0, MAX_BATCH_SIZE)
  try {
    await invoke('record_layout_performance_samples', { samples: batch })
  } catch {
    // Telemetry must never affect layout interaction or surface an error toast.
  }
  if (pendingSamples.length > 0) scheduleFlush()
}
const scheduleFlush = () => {
  if (flushTimer !== null || typeof window === 'undefined') return
  flushTimer = window.setTimeout(() => {
    void flush()
  }, FLUSH_DELAY_MS)
}

const enqueue = (sample: LayoutPerformanceSample) => {
  pendingSamples.push(sample)
  if (pendingSamples.length >= MAX_BATCH_SIZE) {
    if (flushTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(flushTimer)
      flushTimer = null
    }
    void flush()
    return
  }
  scheduleFlush()
}

/** Connect bounded frontend performance samples to the local diagnostics DB. */
export const installLayoutPerformanceTelemetry = (): (() => void) => {
  if (installed) return () => undefined
  installed = true
  const restore = setLayoutPerformanceTelemetrySink(enqueue)
  return () => {
    restore()
    installed = false
    if (flushTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(flushTimer)
    }
    flushTimer = null
    pendingSamples = []
  }
}
