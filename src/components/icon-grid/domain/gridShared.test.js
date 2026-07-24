import {
  buildGridGeometryKey,
  fitGridItemCount,
  getLayoutNormalizationMetrics,
  isSuspiciousSingleCellPageGeometry,
} from './gridGeometry.ts'
import { extractDraggedIconsFromSourceFolders, filterItemsByIds } from './gridItems.ts'
import {
  collectElementCenters,
  hasRenderableDragStateChanged,
  resolveSelectedIconDragIds,
  seedMissingInitialCenters,
} from './dragWorkflowShared.ts'
import { DRAG_HOLE_ID } from './slots.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const icon = key => ({ kind: 'icon', key, icon: { key } })
const folder = (id, children, size = '1x1') => ({ kind: 'folder', id, name: id, size, children })

assert(fitGridItemCount(300, 96) === 2, '共享网格间距应参与列数计算')
assert(
  buildGridGeometryKey('large', 'medium', true) === 'large:medium:true',
  '分页和滚动模式应使用同一几何缓存键'
)
assert(
  JSON.stringify(getLayoutNormalizationMetrics([folder('wide', [], '2x2')], 1, 1)) ===
    JSON.stringify({ columns: 2, pageSize: 4 }),
  '包含大文件夹时，共享归一化逻辑必须保留最小二维占位'
)
assert(
  isSuspiciousSingleCellPageGeometry({ columns: 1, rows: 1, pageSize: 1 }),
  '单单元页应继续被识别为可疑测量结果'
)

const sourceItems = [folder('work', [icon('a'), icon('b'), icon('c')]), icon('outside')]
const filtered = filterItemsByIds(sourceItems, ['folder:work'])
assert(filtered.length === 1 && filtered[0].kind === 'folder', '共享筛选应按统一 GridItem id 工作')

const extracted = extractDraggedIconsFromSourceFolders(sourceItems, ['b'])
const remainingFolder = extracted.find(item => item.kind === 'folder' && item.id === 'work')
assert(
  remainingFolder?.children.map(child => child.key).join(',') === 'a,c',
  '从文件夹拖出图标时应保留原文件夹中的其他图标顺序'
)
assert(
  extracted.at(-1)?.kind === 'icon' && extracted.at(-1)?.key === 'b',
  '从文件夹拖出的图标应加入顶层候选集合'
)

const itemById = new Map([
  ['a', icon('a')],
  ['b', icon('b')],
  ['c', icon('c')],
  ['folder:work', folder('work', [])],
])
const selectedDragIds = resolveSelectedIconDragIds(
  ['b', DRAG_HOLE_ID, 'folder:work', 'a', 'c'],
  'a',
  itemById,
  new Set(['a', 'b'])
)
assert(
  JSON.stringify(selectedDragIds) === JSON.stringify(['b']),
  '共享选择解析应保持布局顺序，并排除主拖拽项、洞位和文件夹'
)

const draggingItem = icon('a')
const initialCenters = {}
const baseDragState = {
  context: 'outer',
  sourceFolderId: null,
  pointerId: 1,
  dragStartedAt: 10,
  draggingId: 'a',
  draggingItem,
  draggingIds: ['a'],
  pointerX: 20,
  pointerY: 20,
  offsetX: 0,
  offsetY: 0,
  workingOrder: ['a', 'b'],
  scrollGroupOrder: ['a', 'b'],
  sourceSlotIndex: 0,
  previewSlotIndex: 0,
  dockPreviewIndex: null,
  hoverTargetId: null,
  hoverZone: null,
  hoverIou: 0,
  centerStartedAt: null,
  dwellStartedAt: null,
  folderPreviewTargetId: null,
  lastEvasionSignature: null,
  lastEvasionTriggerPointer: null,
  lastEvasionAt: null,
  initialCenters,
}
const scrollOrderChanged = { ...baseDragState, scrollGroupOrder: ['b', 'a'] }
assert(
  !hasRenderableDragStateChanged(baseDragState, scrollOrderChanged, 'paged'),
  '分页模式不应把滚动分组顺序纳入渲染状态比较'
)
assert(
  hasRenderableDragStateChanged(baseDragState, scrollOrderChanged, 'scroll'),
  '滚动模式必须对 scrollGroupOrder 的变化触发渲染'
)
assert(
  hasRenderableDragStateChanged(
    baseDragState,
    { ...baseDragState, workingOrder: ['b', 'a'] },
    'paged'
  ),
  '两种模式都必须响应当前工作顺序变化'
)

const fakeElement = rect => ({ getBoundingClientRect: () => rect })
const primaryRefs = new Map([['a', fakeElement({ left: 10, top: 20, width: 40, height: 60 })]])
const secondaryRefs = new Map([['b', fakeElement({ left: 100, top: 200, width: 20, height: 40 })]])
assert(
  JSON.stringify(collectElementCenters(primaryRefs).a) === JSON.stringify({ x: 30, y: 50 }),
  '共享元素中心采集应使用 DOMRect 的几何中心'
)
const seededCenters = { a: { x: 1, y: 2 } }
seedMissingInitialCenters(seededCenters, ['a', 'b'], primaryRefs, secondaryRefs)
assert(seededCenters.a.x === 1 && seededCenters.a.y === 2, '已有拖拽中心不得被重新测量覆盖')
assert(seededCenters.b.x === 110 && seededCenters.b.y === 220, '缺失中心应从其他顶层引用补齐')

console.log('gridShared 测试通过')
