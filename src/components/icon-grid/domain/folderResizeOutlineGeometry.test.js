import assert from 'node:assert/strict'
import test from 'node:test'
import { getFolderResizeOutlinePaths } from './folderResizeOutlineGeometry.ts'
import { getFolderResizeVisualGeometry } from './folderResizePolicy.ts'

const pointsOf = path =>
  [...path.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({ x: +x, y: +y }))
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)
const lengthOf = points =>
  points.slice(1).reduce((length, point, index) => length + distance(points[index], point), 0)

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const squaredLength = dx * dx + dy * dy
  const fraction = squaredLength ? ((point.x - a.x) * dx + (point.y - a.y) * dy) / squaredLength : 0
  const ratio = Math.max(0, Math.min(1, fraction))
  return distance(point, { x: a.x + dx * ratio, y: a.y + dy * ratio })
}

for (const span of [
  { cols: 1, rows: 1 },
  { cols: 1, rows: 2 },
  { cols: 2, rows: 1 },
  { cols: 2, rows: 2 },
]) {
  for (const exponent of [2, 4]) {
    test(`${span.cols}x${span.rows}, exponent ${exponent}: original length on the shared frame centerline`, () => {
      const geometry = getFolderResizeVisualGeometry(span)
      const input = {
        width: span.cols * 64,
        height: span.rows * 64,
        radius: 20 * (exponent === 4 ? 1.773 : 1),
        exponent,
        ...geometry,
        rtl: false,
      }
      const paths = getFolderResizeOutlinePaths(input)
      const frame = pointsOf(paths.frame)
      const handle = pointsOf(paths.handle)
      assert.ok(Math.abs(lengthOf(handle) - geometry.handleArcLength) < 0.0001)
      for (const point of handle) {
        const nearest = Math.min(
          ...frame.slice(1).map((end, i) => distanceToSegment(point, frame[i], end))
        )
        assert.ok(nearest < 0.00001, 'every handle point must lie on the frame centerline')
      }
      for (const point of frame) {
        assert.ok(point.x >= 0 && point.x <= input.width)
        assert.ok(point.y >= 0 && point.y <= input.height)
      }
      const mirrored = pointsOf(
        getFolderResizeOutlinePaths({ ...input, rtl: true }).handle
      ).reverse()
      assert.equal(mirrored.length, handle.length)
      handle.forEach((point, i) => {
        assert.ok(distance({ x: input.width - point.x, y: point.y }, mirrored[i]) < 0.00001)
      })
    })
  }
}

test('handle length stays fixed when the folder radius grows or is clamped by a small surface', () => {
  for (const width of [32, 64, 128, 256]) {
    const input = {
      width,
      height: width,
      radius: 24 * 1.773,
      exponent: 4,
      ...getFolderResizeVisualGeometry({ cols: 1, rows: 1 }),
      rtl: false,
    }
    const { handle } = getFolderResizeOutlinePaths(input)
    assert.ok(Math.abs(lengthOf(pointsOf(handle)) - 8 * Math.PI) < 0.0001)
  }
})

test('the frame overlaps the artwork edge by 1px, including fractional sizes and rounded corners', () => {
  for (const width of [32, 63.5, 64, 127.25, 256]) {
    for (const exponent of [2, 4]) {
      const input = {
        width,
        height: width * 2,
        radius: 24 * (exponent === 4 ? 1.773 : 1),
        exponent,
        ...getFolderResizeVisualGeometry({ cols: 1, rows: 2 }),
        rtl: false,
      }
      const frame = pointsOf(getFolderResizeOutlinePaths(input).frame)
      const radius = Math.min(input.radius, width / 2)
      for (let sample = 0; sample <= 512; sample++) {
        const angle = (sample / 512) * (Math.PI / 2)
        const outer = {
          x: width - radius + radius * Math.cos(angle) ** (2 / exponent),
          y: input.height - radius + radius * Math.sin(angle) ** (2 / exponent),
        }
        const nearest = Math.min(
          ...frame.slice(1).map((end, i) => distanceToSegment(outer, frame[i], end))
        )
        const opaqueCoverage = input.frameStrokeWidth / 2 - nearest
        assert.ok(
          opaqueCoverage >= 0.995,
          `width=${width}, exponent=${exponent}, sample=${sample}: coverage ${opaqueCoverage}`
        )
      }
    }
  }
})
