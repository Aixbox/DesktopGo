import type { FolderSize, GridSpan } from '../model'

export const FOLDER_RESIZE_MIN_SIZE = 1
export const FOLDER_RESIZE_MAX_SIZE = 2
export const FOLDER_RESIZE_LOW_SLOPE = Math.tan(Math.PI / 8)
export const FOLDER_RESIZE_HIGH_SLOPE = Math.tan((3 * Math.PI) / 8)

export interface FolderResizeThreshold {
  strideX: number
  strideY: number
  threshold: number
  deadZone: number
}

export interface FolderResizeGestureInput {
  baseSpan: GridSpan
  deltaX: number
  deltaY: number
  cellWidth: number
  cellHeight: number
  spacingX: number
  spacingY: number
  rtl?: boolean
}

export interface FolderResizeGestureResult {
  span: GridSpan
  threshold: FolderResizeThreshold
  changed: boolean
  direction: 'horizontal' | 'vertical' | 'diagonal' | 'none'
}

export interface FolderResizeVisualGeometry {
  hotSize: number
  handleArcLength: number
  frameStrokeWidth: number
  handleStrokeWidth: number
  backgroundPaddingX: number
  backgroundPaddingY: number
}

export interface FolderResizeHandlePlacement {
  side: 'left' | 'right'
  horizontalInset: number
  bottomInset: number
}

/** Keep the original handle length and idle line widths throughout resizing. */
export const getFolderResizeVisualGeometry = (span: GridSpan): FolderResizeVisualGeometry => {
  const singleSlot = span.cols === 1 && span.rows === 1
  return {
    hotSize: singleSlot ? 32 : 46,
    handleArcLength: ((singleSlot ? 16 : 18) * Math.PI) / 2,
    frameStrokeWidth: 2,
    handleStrokeWidth: 6,
    backgroundPaddingX: 10,
    backgroundPaddingY: 16,
  }
}

/**
 * The resize frame is expanded around the folder background. Place the hot
 * region back inside that expansion so its arc overlaps the folder corner.
 */
export const getFolderResizeHandlePlacement = (
  rtl: boolean,
  geometry: Pick<FolderResizeVisualGeometry, 'backgroundPaddingX' | 'backgroundPaddingY'>
): FolderResizeHandlePlacement => ({
  side: rtl ? 'left' : 'right',
  horizontalInset: Math.max(0, geometry.backgroundPaddingX),
  bottomInset: Math.max(0, geometry.backgroundPaddingY),
})

const safePositive = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 1)

export const getFolderResizeThreshold = ({
  cellWidth,
  cellHeight,
  spacingX,
  spacingY,
}: Pick<
  FolderResizeGestureInput,
  'cellWidth' | 'cellHeight' | 'spacingX' | 'spacingY'
>): FolderResizeThreshold => {
  const strideX = safePositive(cellWidth) + Math.max(0, spacingX)
  const strideY = safePositive(cellHeight) + Math.max(0, spacingY)
  const threshold = (strideX + strideY) / 2
  return { strideX, strideY, threshold, deadZone: threshold / 2 }
}

const normalizeSpan = (span: GridSpan): GridSpan => ({
  cols: Math.max(FOLDER_RESIZE_MIN_SIZE, Math.min(FOLDER_RESIZE_MAX_SIZE, Math.floor(span.cols))),
  rows: Math.max(FOLDER_RESIZE_MIN_SIZE, Math.min(FOLDER_RESIZE_MAX_SIZE, Math.floor(span.rows))),
})

const getAxisIntent = (delta: number, deadZone: number, grow: boolean): boolean =>
  grow ? delta > deadZone : delta < -deadZone

/**
 * Resolve the ColorOS bottom-corner gesture into one of the four legal folder
 * spans. The slope bands keep a diagonal gesture from accidentally selecting
 * an axis when it is close to the 22.5°/67.5° boundaries.
 */
export const resolveFolderResizeGesture = ({
  baseSpan,
  deltaX: rawDeltaX,
  deltaY: rawDeltaY,
  cellWidth,
  cellHeight,
  spacingX,
  spacingY,
  rtl = false,
}: FolderResizeGestureInput): FolderResizeGestureResult => {
  const threshold = getFolderResizeThreshold({ cellWidth, cellHeight, spacingX, spacingY })
  const deltaX = rtl ? -rawDeltaX : rawDeltaX
  const deltaY = rawDeltaY
  const distance = Math.hypot(deltaX, deltaY)
  const normalized = normalizeSpan(baseSpan)
  if (distance < threshold.deadZone) {
    return { span: normalized, threshold, changed: false, direction: 'none' }
  }

  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  const slope = absX === 0 ? Number.POSITIVE_INFINITY : absY / absX
  const diagonal = slope > FOLDER_RESIZE_LOW_SLOPE && slope < FOLDER_RESIZE_HIGH_SLOPE
  const horizontal = slope <= FOLDER_RESIZE_LOW_SLOPE
  const vertical = slope >= FOLDER_RESIZE_HIGH_SLOPE
  const growX = normalized.cols === FOLDER_RESIZE_MIN_SIZE
  const growY = normalized.rows === FOLDER_RESIZE_MIN_SIZE
  const wantsX = getAxisIntent(deltaX, threshold.deadZone, growX)
  const wantsY = getAxisIntent(deltaY, threshold.deadZone, growY)

  const useX = wantsX && (horizontal || diagonal)
  const useY = wantsY && (vertical || diagonal)
  const next: GridSpan = {
    cols: useX ? (growX ? 2 : 1) : normalized.cols,
    rows: useY ? (growY ? 2 : 1) : normalized.rows,
  }
  const changed = next.cols !== normalized.cols || next.rows !== normalized.rows
  const direction = !changed ? 'none' : useX && useY ? 'diagonal' : useX ? 'horizontal' : 'vertical'

  return { span: normalizeSpan(next), threshold, changed, direction }
}

export const folderSizeFromSpan = (span: GridSpan): FolderSize => {
  const normalized = normalizeSpan(span)
  if (normalized.cols === 2 && normalized.rows === 2) return '2x2'
  if (normalized.cols === 2) return '2x1'
  if (normalized.rows === 2) return '1x2'
  return '1x1'
}
