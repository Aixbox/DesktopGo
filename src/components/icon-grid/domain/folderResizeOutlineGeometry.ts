export interface FolderResizeOutlinePoint {
  x: number
  y: number
}

type Point = FolderResizeOutlinePoint

export interface FolderResizeOutlineInput {
  width: number
  height: number
  radius: number
  exponent: number
  frameStrokeWidth: number
  handleArcLength: number
  rtl: boolean
}

const CORNER_STEPS = 64

function createOutlinePoints({
  width,
  height,
  radius,
  exponent,
  frameStrokeWidth,
}: FolderResizeOutlineInput): Point[] {
  const inset = frameStrokeWidth / 2
  const outerRadius = Math.min(Math.max(inset, radius), width / 2, height / 2)
  const centerRadius = Math.max(0, outerRadius - inset)
  const points: Point[] = []
  for (let corner = 0; corner < 4; corner += 1) {
    for (let step = 0; step <= CORNER_STEPS; step += 1) {
      const angle = (step / CORNER_STEPS) * (Math.PI / 2)
      const c = centerRadius * Math.pow(Math.max(0, Math.cos(angle)), 2 / exponent)
      const s = centerRadius * Math.pow(Math.max(0, Math.sin(angle)), 2 / exponent)
      if (corner === 0) points.push({ x: width - outerRadius + s, y: outerRadius - c })
      if (corner === 1) points.push({ x: width - outerRadius + c, y: height - outerRadius + s })
      if (corner === 2) points.push({ x: outerRadius - s, y: height - outerRadius + c })
      if (corner === 3) points.push({ x: outerRadius - c, y: outerRadius - s })
    }
  }
  return [...points, points[0]]
}

const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)

/** Slice by distance along the shared contour, including straight edges if needed. */
function sliceContour(points: Point[], start: number, end: number): Point[] {
  const result: Point[] = []
  let traversed = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const length = distance(a, b)
    const next = traversed + length
    if (length > 0 && next > start && traversed < end) {
      for (const offset of [Math.max(0, start - traversed), Math.min(length, end - traversed)]) {
        const ratio = offset / length
        const point = { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio }
        if (!result.length || distance(result[result.length - 1], point) > 1e-9) result.push(point)
      }
    }
    traversed = next
    if (traversed >= end) break
  }
  return result
}

const toPath = (points: Point[]) =>
  points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(6)} ${point.y.toFixed(6)}`)
    .join(' ')

/** Both strokes share one centerline; SVG supplies a uniform width and round caps. */
export function getFolderResizeOutlinePaths(input: FolderResizeOutlineInput) {
  const points = createOutlinePoints(input)
  const cornerIndex = input.rtl ? 2 : 1
  const midpointIndex = cornerIndex * (CORNER_STEPS + 1) + CORNER_STEPS / 2
  let midpointDistance = 0
  for (let index = 1; index <= midpointIndex; index += 1) {
    midpointDistance += distance(points[index - 1], points[index])
  }
  const halfLength = input.handleArcLength / 2
  const handle = sliceContour(points, midpointDistance - halfLength, midpointDistance + halfLength)
  return { frame: `${toPath(points)} Z`, handle: toPath(handle), handlePoints: handle }
}
