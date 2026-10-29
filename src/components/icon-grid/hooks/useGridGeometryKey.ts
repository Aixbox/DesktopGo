import { useEffect, useState } from 'react'
import {
  buildGridGeometryKey,
  readGridGeometryMeasurement,
  type GridGeometryMeasurement,
} from '../domain/gridGeometry'

/**
 * Recompute the layout identity whenever the viewport measurement changes.
 * ResizeObserver in the layout hook still measures the actual grid; this hook
 * only prevents a persisted page geometry from surviving a different window
 * size, DPR, orientation or writing direction.
 */
export const useGridGeometryKey = (
  windowMode: string,
  iconSize: string,
  dockEnabled: boolean,
  suffix?: string
) => {
  const [measurement, setMeasurement] = useState<GridGeometryMeasurement>(() =>
    readGridGeometryMeasurement()
  )

  useEffect(() => {
    let updateTimer: number | null = null
    const update = () => {
      const next = readGridGeometryMeasurement()
      setMeasurement(previous =>
        buildMeasurementSignature(previous) === buildMeasurementSignature(next) ? previous : next
      )
    }
    const scheduleUpdate = () => {
      if (updateTimer !== null) window.clearTimeout(updateTimer)
      updateTimer = window.setTimeout(() => {
        updateTimer = null
        update()
      }, 100)
    }

    update()
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('orientationchange', scheduleUpdate)
    const visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', scheduleUpdate)
    visualViewport?.addEventListener('scroll', scheduleUpdate)
    return () => {
      if (updateTimer !== null) window.clearTimeout(updateTimer)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('orientationchange', scheduleUpdate)
      visualViewport?.removeEventListener('resize', scheduleUpdate)
      visualViewport?.removeEventListener('scroll', scheduleUpdate)
    }
  }, [])

  const base = buildGridGeometryKey(windowMode, iconSize, dockEnabled, measurement)
  return suffix ? `${base}:${suffix}` : base
}

const buildMeasurementSignature = (measurement: GridGeometryMeasurement) =>
  [
    measurement.viewportWidth,
    measurement.viewportHeight,
    measurement.visualViewportWidth,
    measurement.visualViewportHeight,
    measurement.devicePixelRatio,
    measurement.orientation,
    measurement.direction,
  ].join('|')
