import type { FolderResizeOutlinePoint } from './folderResizeOutlineGeometry'
import type { FolderResizeVisualGeometry } from './folderResizePolicy'

type Point = FolderResizeOutlinePoint
export const FOLDER_RESIZE_HIT_PADDING = 10
const CAP_STEPS = 24

export const getFolderResizeHitInsets = (geometry: FolderResizeVisualGeometry) => {
  const hitRadius = geometry.handleStrokeWidth / 2 + FOLDER_RESIZE_HIT_PADDING
  return {
    x: Math.max(geometry.backgroundPaddingX, hitRadius),
    y: Math.max(geometry.backgroundPaddingY, hitRadius),
  }
}

const normal = (a: Point, b: Point): Point => {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }
}

function offsetPoint(points: Point[], index: number, amount: number): Point {
  const point = points[index]
  const before = normal(points[Math.max(0, index - 1)], points[Math.max(1, index)])
  const after = normal(
    points[Math.min(index, points.length - 2)],
    points[Math.min(index + 1, points.length - 1)]
  )
  const denominator = 1 + before.x * after.x + before.y * after.y
  return {
    x: point.x + ((before.x + after.x) * amount) / denominator,
    y: point.y + ((before.y + after.y) * amount) / denominator,
  }
}

function roundCap(center: Point, direction: Point, radius: number): Point[] {
  const start = Math.atan2(direction.y, direction.x)
  return Array.from({ length: CAP_STEPS + 1 }, (_, index) => {
    const angle = start - (index / CAP_STEPS) * Math.PI
    return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) }
  })
}

/** A narrow tube around the visible handle, including its round end caps. */
export function getFolderResizeHitArea({
  points,
  strokeWidth,
  offsetX,
  offsetY,
}: {
  points: Point[]
  strokeWidth: number
  offsetX: number
  offsetY: number
}): Point[] {
  if (points.length < 2) return []
  const radius = strokeWidth / 2 + FOLDER_RESIZE_HIT_PADDING
  const last = points.length - 1
  const startNormal = normal(points[0], points[1])
  const endNormal = normal(points[last - 1], points[last])
  return [
    ...points.map((_, index) => offsetPoint(points, index, radius)),
    ...roundCap(points[last], endNormal, radius),
    ...points.map((_, index) => offsetPoint(points, index, -radius)).reverse(),
    ...roundCap(points[0], { x: -startNormal.x, y: -startNormal.y }, radius),
  ].map(point => ({ x: point.x + offsetX, y: point.y + offsetY }))
}

export const folderResizeHitAreaClip = (points: Point[]): string =>
  points.length
    ? `polygon(nonzero, ${points.map(point => `${point.x.toFixed(4)}px ${point.y.toFixed(4)}px`).join(', ')})`
    : 'polygon(0 0, 0 0, 0 0)'
