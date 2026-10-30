import {
  commitWidgetResize,
  previewWidgetResize,
  resolveWidgetResizeGestureSpan,
} from './widgetResize.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const base = {
  revision: 4,
  placements: [
    {
      id: 'widget:clock',
      container: 'workspace',
      page: 0,
      row: 0,
      col: 0,
      spanX: 1,
      spanY: 1,
      rank: 0,
    },
    { id: 'mail', container: 'workspace', page: 0, row: 0, col: 2, spanX: 1, spanY: 1, rank: 1 },
  ],
}
const bounds = { minSpanX: 1, minSpanY: 1, maxSpanX: 2, maxSpanY: 2 }

const gestureGrow = resolveWidgetResizeGestureSpan({
  baseSpanX: 1,
  baseSpanY: 1,
  deltaPixels: 120,
  cellPixels: 100,
  axis: 'x',
  direction: 1,
  bounds,
})
assert(gestureGrow.spanX === 2 && gestureGrow.spanY === 1, '水平 resize frame 应按网格步长增长')
const gestureShrink = resolveWidgetResizeGestureSpan({
  baseSpanX: 2,
  baseSpanY: 2,
  deltaPixels: 240,
  cellPixels: 100,
  axis: 'y',
  direction: -1,
  bounds,
})
assert(gestureShrink.spanX === 2 && gestureShrink.spanY === 1, '垂直 resize frame 应按方向收缩')

const accepted = previewWidgetResize({
  snapshot: base,
  grid: { columns: 4, rows: 4 },
  request: { widgetId: 'widget:clock', sourceRevision: 4, nextSpanX: 2, nextSpanY: 1, bounds },
})
assert(accepted.accepted && accepted.placement?.spanX === 2, '可用区域应生成 resize preview')
const committed = commitWidgetResize({ snapshot: base, preview: accepted, sourceRevision: 4 })
assert(
  committed?.revision === 5 && committed.placements[0].spanX === 2,
  'resize commit 应递增 revision'
)

const occupied = previewWidgetResize({
  snapshot: base,
  grid: { columns: 4, rows: 4 },
  request: { widgetId: 'widget:clock', sourceRevision: 4, nextSpanX: 3, nextSpanY: 1, bounds },
})
assert(occupied.reason === 'invalid-span', '超出 provider max span 应拒绝')

const stale = previewWidgetResize({
  snapshot: base,
  grid: { columns: 4, rows: 4 },
  request: { widgetId: 'widget:clock', sourceRevision: 3, nextSpanX: 1, nextSpanY: 1, bounds },
})
assert(stale.reason === 'stale-revision', '过期 source revision 应拒绝 resize')

const blocked = previewWidgetResize({
  snapshot: {
    ...base,
    placements: [base.placements[0], { ...base.placements[1], col: 1 }],
  },
  grid: { columns: 4, rows: 4 },
  request: { widgetId: 'widget:clock', sourceRevision: 4, nextSpanX: 2, nextSpanY: 1, bounds },
})
assert(blocked.reason === 'occupied', '扩大到已占用单元时应拒绝')

const outOfBounds = previewWidgetResize({
  snapshot: base,
  grid: { columns: 1, rows: 4 },
  request: { widgetId: 'widget:clock', sourceRevision: 4, nextSpanX: 2, nextSpanY: 1, bounds },
})
assert(outOfBounds.reason === 'out-of-bounds', '超出当前网格边界时应拒绝')

console.log('widgetResize 测试通过')
