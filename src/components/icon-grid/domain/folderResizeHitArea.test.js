import assert from 'node:assert/strict'
import test from 'node:test'
import { getFolderResizeOutlinePaths } from './folderResizeOutlineGeometry.ts'
import {
  folderResizeHitAreaClip,
  getFolderResizeHitArea,
  getFolderResizeHitInsets,
} from './folderResizeHitArea.ts'
import { getFolderResizeVisualGeometry } from './folderResizePolicy.ts'

// Test the actual polygon serialized into the HTML button's CSS clip-path.
function parseClip(clip) {
  return [...clip.matchAll(/(-?[\d.]+)px (-?[\d.]+)px/g)].map(([, x, y]) => ({ x: +x, y: +y }))
}

function contains(polygon, point) {
  let winding = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const side = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y)
    if (a.y <= point.y && b.y > point.y && side > 0) winding++
    if (a.y > point.y && b.y <= point.y && side < 0) winding--
  }
  return winding !== 0
}

function distanceToArc(points, point) {
  return Math.min(
    ...points.slice(1).map((b, i) => {
      const a = points[i]
      const dx = b.x - a.x,
        dy = b.y - a.y
      const t = Math.max(
        0,
        Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy))
      )
      return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy)
    })
  )
}

function atDistance(origin, direction, distance) {
  const length = Math.hypot(direction.x, direction.y)
  return {
    x: origin.x + (direction.x / length) * distance,
    y: origin.y + (direction.y / length) * distance,
  }
}

for (const span of [
  { cols: 1, rows: 1 },
  { cols: 1, rows: 2 },
  { cols: 2, rows: 1 },
  { cols: 2, rows: 2 },
]) {
  for (const rtl of [false, true]) {
    for (const exponent of [2, 4]) {
      test(`${span.cols}x${span.rows}, RTL=${rtl}, exponent=${exponent}: hit band extends 10px around the arc only`, () => {
        const geometry = getFolderResizeVisualGeometry(span)
        const insets = getFolderResizeHitInsets(geometry)
        const width = span.cols * 64
        const height = span.rows * 64
        const paths = getFolderResizeOutlinePaths({
          width,
          height,
          radius: exponent === 4 ? 28.368 : 16,
          exponent,
          ...geometry,
          rtl,
        })
        const points = paths.handlePoints.map(p => ({ x: p.x + insets.x, y: p.y + insets.y }))
        const polygon = parseClip(
          folderResizeHitAreaClip(
            getFolderResizeHitArea({
              points: paths.handlePoints,
              strokeWidth: geometry.handleStrokeWidth,
              offsetX: insets.x,
              offsetY: insets.y,
            })
          )
        )
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1]
          const b = points[i]
          const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          const normal = { x: -(b.y - a.y), y: b.x - a.x }
          assert.ok(contains(polygon, midpoint))
          for (const sign of [-1, 1]) {
            for (const extra of [1, 6, 9.99]) {
              assert.ok(
                contains(polygon, atDistance(midpoint, normal, sign * (3 + extra))),
                `visible edge + ${extra}px must be clickable`
              )
            }
            const outside = atDistance(midpoint, normal, sign * 13.2)
            // At a tight inner corner this normal can enter another segment's band.
            if (distanceToArc(points, outside) > 13.05) {
              assert.ok(!contains(polygon, outside), 'do not expand beyond the requested band')
            }
          }
        }
        for (const [end, adjacent] of [
          [points[0], points[1]],
          [points.at(-1), points.at(-2)],
        ]) {
          const outward = { x: end.x - adjacent.x, y: end.y - adjacent.y }
          assert.ok(
            contains(polygon, atDistance(end, outward, 12.99)),
            'round end caps include nearly 10px past the visible end'
          )
          assert.ok(!contains(polygon, atDistance(end, outward, 13.2)))
        }
        assert.ok(
          !contains(polygon, { x: width / 2 + insets.x, y: height / 2 + insets.y }),
          'folder center must not resize'
        )
        assert.ok(
          !contains(polygon, { x: insets.x + (rtl ? width - 2 : 2), y: height + insets.y - 2 }),
          'opposite corner must not resize'
        )
        polygon.forEach(point => {
          assert.ok(
            point.x >= 0 && point.x <= width + insets.x * 2,
            'horizontal padding contains the complete hot area'
          )
          assert.ok(
            point.y >= 0 && point.y <= height + insets.y * 2,
            'vertical padding contains the complete hot area'
          )
        })
      })
    }
  }
}
