import { applyWidgetResizeLayout } from './widgetResizeLayout.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const widget = {
  kind: 'widget',
  id: 'clock',
  provider: 'clock.provider',
  label: 'Clock',
  spanX: 1,
  spanY: 1,
  minSpanX: 1,
  minSpanY: 1,
  maxSpanX: 2,
  maxSpanY: 2,
}
const result = applyWidgetResizeLayout({
  items: [widget],
  slots: ['widget:clock', null, null, null],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
  widgetId: 'clock',
  nextSpanX: 2,
  nextSpanY: 1,
  revision: 0,
})
assert(
  result?.items[0].spanX === 2 && result.revision === 1,
  'Widget layout resize 应提交新的 span/revision'
)
assert(result?.slots[0] === 'widget:clock', 'Widget resize 应保留原 anchor')

const rejected = applyWidgetResizeLayout({
  items: [widget, { kind: 'icon', key: 'other', icon: {} }],
  slots: ['widget:clock', 'other', null, null],
  dockKeys: [],
  pageSize: 4,
  columns: 2,
  widgetId: 'clock',
  nextSpanX: 2,
  nextSpanY: 1,
  revision: 0,
})
assert(rejected === null, '占用单元应拒绝 Widget layout resize')

console.log('widgetResizeLayout 测试通过')
