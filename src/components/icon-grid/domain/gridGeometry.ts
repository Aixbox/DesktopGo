import type { GridItem } from '../model'
import { getGridItemSpan } from '../model'
import { GRID_GAP } from '../constants'

export const fitGridItemCount = (container: number, item: number) => {
  if (item <= 0 || container <= item) return 1
  return Math.floor((container - item) / (item + GRID_GAP)) + 1
}

export interface GridGeometryMeasurement {
  viewportWidth: number
  viewportHeight: number
  visualViewportWidth?: number
  visualViewportHeight?: number
  devicePixelRatio?: number
  orientation?: 'portrait' | 'landscape'
  direction?: 'ltr' | 'rtl'
}

const normalizeMeasurementNumber = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && value !== undefined ? Math.max(0, Math.round(value)) : fallback

/**
 * Build a stable layout cache key. The three argument form remains compatible with
 * saved layout-library entries; live grid callers should pass viewport measurements
 * so a DPI, rotation, RTL or window resize cannot reuse stale page geometry.
 */
export const buildGridGeometryKey = (
  windowMode: string,
  iconSize: string,
  dockEnabled: boolean,
  measurement?: GridGeometryMeasurement
) => {
  const base = `${windowMode}:${iconSize}:${dockEnabled}`
  if (!measurement) return base

  const width = normalizeMeasurementNumber(measurement.viewportWidth, 0)
  const height = normalizeMeasurementNumber(measurement.viewportHeight, 0)
  const visualWidth = normalizeMeasurementNumber(measurement.visualViewportWidth, width)
  const visualHeight = normalizeMeasurementNumber(measurement.visualViewportHeight, height)
  const dpr = Number.isFinite(measurement.devicePixelRatio)
    ? Math.round((measurement.devicePixelRatio ?? 1) * 100) / 100
    : 1
  const orientation = measurement.orientation ?? (width >= height ? 'landscape' : 'portrait')
  const direction = measurement.direction ?? 'ltr'
  return `${base}:viewport-${width}x${height}:visual-${visualWidth}x${visualHeight}:dpr-${dpr}:orientation-${orientation}:dir-${direction}`
}

export const readGridGeometryMeasurement = (): GridGeometryMeasurement => {
  if (typeof window === 'undefined') {
    return {
      viewportWidth: 0,
      viewportHeight: 0,
      visualViewportWidth: 0,
      visualViewportHeight: 0,
      devicePixelRatio: 1,
      orientation: 'landscape',
      direction: 'ltr',
    }
  }

  const viewportWidth = Math.max(0, Math.round(window.innerWidth))
  const viewportHeight = Math.max(0, Math.round(window.innerHeight))
  const visualViewport = window.visualViewport
  const direction =
    typeof document !== 'undefined' &&
    (document.documentElement.dir === 'rtl' ||
      (typeof window.getComputedStyle === 'function' &&
        window.getComputedStyle(document.documentElement).direction === 'rtl'))
      ? 'rtl'
      : 'ltr'
  const orientation =
    window.screen?.orientation?.type?.startsWith('portrait') || viewportWidth < viewportHeight
      ? 'portrait'
      : 'landscape'

  return {
    viewportWidth,
    viewportHeight,
    visualViewportWidth: visualViewport ? Math.round(visualViewport.width) : viewportWidth,
    visualViewportHeight: visualViewport ? Math.round(visualViewport.height) : viewportHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    orientation,
    direction,
  }
}

export const getFolderModalMaxAvailableWidth = (maxWidth: number) => {
  const resolvedMaxWidth =
    typeof window === 'undefined' ? maxWidth : Math.min(maxWidth, window.innerWidth * 0.92)
  return Math.max(0, resolvedMaxWidth - 40)
}

export const getDefaultFolderColumnCount = (tileWidth: number, maxWidth: number) =>
  fitGridItemCount(getFolderModalMaxAvailableWidth(maxWidth), tileWidth)

export const getLayoutNormalizationMetrics = (
  items: GridItem[],
  columns: number,
  pageSize: number
): { columns: number; pageSize: number } => {
  const minColumns = items.some(item => getGridItemSpan(item).cols > 1) ? 2 : 1
  const minRows = items.some(item => getGridItemSpan(item).rows > 1) ? 2 : 1
  const safeColumns = Math.max(minColumns, columns)
  return {
    columns: safeColumns,
    pageSize: Math.max(pageSize, safeColumns * minRows),
  }
}

export const isSuspiciousSingleCellPageGeometry = ({
  columns,
  rows,
  pageSize,
}: {
  columns: number
  rows: number
  pageSize: number
}) => columns === 1 && rows === 1 && pageSize === 1
