import { applyMultiOuterDropFromSession, applyOuterDropFromSession } from './dropPolicy.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const makeIcon = key => ({
  kind: 'icon',
  key,
  icon: { path: key },
})

const makeFolder = (id, size = '1x2') => ({
  kind: 'folder',
  id,
  name: id,
  size,
  children: [],
})

const buildSession = ({
  workingOrder,
  draggingIds = ['x', 'y'],
  draggingId = 'x',
  previewSlotIndex = 0,
  sourceSlotIndex = 8,
}) => ({
  context: 'outer',
  sourceFolderId: null,
  pointerId: 1,
  dragStartedAt: 0,
  draggingId,
  draggingItem: makeIcon(draggingId),
  draggingIds,
  pointerX: 0,
  pointerY: 0,
  offsetX: 0,
  offsetY: 0,
  workingOrder,
  sourceSlotIndex,
  previewSlotIndex,
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
  initialCenters: {},
})

const singleInsertNewPageResult = applyOuterDropFromSession({
  base: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x'].map(makeIcon),
  session: buildSession({
    draggingIds: ['x'],
    workingOrder: ['a', 'b', 'c', 'd', null, 'f', 'g', 'h', 'x', null, null, null],
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => null,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x', null, null, null],
})

assert(
  JSON.stringify(singleInsertNewPageResult.slots) ===
    JSON.stringify(['x', 'a', 'b', 'c', 'd', null, null, null, 'e', 'f', 'g', 'h']),
  '单图标拖放时，当前页应按从左到右顺序腾挪，放不下的图标再插入当前页后的新页'
)

const multiInsertNewPageResult = applyMultiOuterDropFromSession({
  base: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x', 'y'].map(makeIcon),
  session: buildSession({
    workingOrder: ['a', 'b', 'c', 'd', null, 'f', 'g', 'h', 'x', 'y', null, null],
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => null,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x', 'y', null, null],
})

assert(
  JSON.stringify(multiInsertNewPageResult.slots) ===
    JSON.stringify(['x', 'y', 'a', 'b', 'c', 'd', null, null, 'e', 'f', 'g', 'h']),
  '多图标拖放时，应在原下一页满页的情况下于当前页后插入新页，而不是吞掉预览空洞'
)

const currentPageHolePriorityResult = applyMultiOuterDropFromSession({
  base: ['a', 'b', 'd', 'e', 'f', 'g', 'h', 'x', 'y'].map(makeIcon),
  session: buildSession({
    workingOrder: ['a', 'b', null, 'd', 'e', 'f', 'g', 'h', 'x', 'y', null, null],
    previewSlotIndex: 3,
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => null,
  mode: 'paged',
  sourceSlots: ['a', 'b', null, 'd', 'e', 'f', 'g', 'h', 'x', 'y', null, null],
})

assert(
  JSON.stringify(currentPageHolePriorityResult.slots) ===
    JSON.stringify(['a', 'b', 'y', 'x', 'd', null, null, null, 'e', 'f', 'g', 'h']),
  '当前页仍有空位时，应先按从左到右顺序填满当前页，再考虑下一页或插新页'
)

const reuseNextPageResult = applyMultiOuterDropFromSession({
  base: ['a', 'b', 'c', 'd', 'e', 'g', 'x', 'y', 'i', 'j'].map(makeIcon),
  session: buildSession({
    workingOrder: ['a', 'b', 'c', 'd', 'e', null, 'g', null, 'x', 'y', 'i', 'j'],
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => null,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'e', null, 'g', null, 'x', 'y', 'i', 'j'],
})

assert(
  JSON.stringify(reuseNextPageResult.slots) ===
    JSON.stringify(['x', 'y', 'a', 'b', 'e', 'c', 'g', 'd', null, null, 'i', 'j']),
  '下一页空位足够时，应优先复用下一页空位而不是插入新页'
)

const blockedNullsShouldInsertNewPageResult = applyMultiOuterDropFromSession({
  base: [
    makeIcon('a'),
    makeIcon('b'),
    makeIcon('c'),
    makeIcon('d'),
    makeFolder('tower', '1x2'),
    makeIcon('e'),
    makeIcon('x'),
    makeIcon('y'),
  ],
  session: buildSession({
    workingOrder: ['a', 'b', 'c', 'd', 'folder:tower', null, null, 'e', 'x', 'y', null, null],
    sourceSlotIndex: 8,
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => null,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'folder:tower', null, null, 'e', 'x', 'y', null, null],
})

assert(
  JSON.stringify(blockedNullsShouldInsertNewPageResult.slots) ===
    JSON.stringify(['x', 'y', 'a', 'b', 'c', 'd', null, null, 'folder:tower', null, null, 'e']),
  '下一页存在被 folder footprint 占住的假空位时，应判定为空位不足并插入新页'
)

const singleShouldReuseLaterRealHoleOnNextPageResult = applyOuterDropFromSession({
  base: ['a', 'b', 'c', 'd', 'e', 'f', 'x'].map(makeIcon),
  session: buildSession({
    draggingIds: ['x'],
    workingOrder: [null, 'a', 'b', 'c', 'e', null, null, 'f'],
    previewSlotIndex: 0,
    sourceSlotIndex: 5,
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => 0,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'e', 'x', null, 'f'],
})

assert(
  JSON.stringify(singleShouldReuseLaterRealHoleOnNextPageResult.slots) ===
    JSON.stringify(['x', 'a', 'b', 'c', 'e', 'd', null, 'f']),
  "single overflow should reuse the next page's later real hole instead of taking the first occupied slot"
)

const multiShouldReuseLaterRealHolesOnNextPageResult = applyMultiOuterDropFromSession({
  base: ['a', 'b', 'c', 'd', 'e', 'f', 'x', 'y'].map(makeIcon),
  session: buildSession({
    workingOrder: [null, 'a', 'b', 'c', 'e', null, null, 'f', null, null, null, null],
    previewSlotIndex: 0,
    sourceSlotIndex: 5,
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => 0,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'e', 'x', null, 'f', 'y', null, null, null],
})

assert(
  JSON.stringify(multiShouldReuseLaterRealHolesOnNextPageResult.slots) ===
    JSON.stringify(['x', 'y', 'a', 'b', 'e', 'c', 'd', 'f']),
  'multi overflow should reuse later real holes on the next page in row-major order'
)

const multiPreviewOrderShouldDriveCurrentPageSpillResult = applyMultiOuterDropFromSession({
  base: ['a', 'b', 'c', 'd', 'e', 'f', 'x', 'y'].map(makeIcon),
  session: buildSession({
    workingOrder: ['a', 'c', 'b', 'd', 'e', 'f', null, null, 'x', 'y', null, null],
    previewSlotIndex: 1,
    sourceSlotIndex: 8,
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => 1,
  mode: 'paged',
  sourceSlots: ['a', 'b', 'c', 'd', 'e', 'f', null, null, 'x', 'y', null, null],
})

assert(
  JSON.stringify(multiPreviewOrderShouldDriveCurrentPageSpillResult.slots) ===
    JSON.stringify(['a', 'x', 'y', 'c', 'e', 'f', 'b', 'd']),
  'å¤šå›¾æ ‡æ‹–æ”¾æ—¶ï¼Œå½“å‰é¡µçš„æŒ¤å‡ºç»“æžœåº”è·Ÿéšå½“å‰é¢„è§ˆé¡ºåºï¼Œä¸èƒ½æŠŠå•æ´žé¢„è§ˆå½“æˆåŽç»­é¡µçš„åŸºçº¿'
)

const singleFullVisualPageShouldSpillActualLastItemResult = applyOuterDropFromSession({
  base: [makeFolder('tower', '2x1'), makeIcon('a'), makeIcon('b'), makeIcon('x')],
  session: buildSession({
    draggingIds: ['x'],
    workingOrder: ['folder:tower', null, null, 'a', 'x', 'b', null, null],
    previewSlotIndex: 2,
    sourceSlotIndex: 4,
  }),
  pageSize: 4,
  columns: 2,
  resolveNearestSlotIndexByContext: () => null,
  mode: 'paged',
  sourceSlots: ['folder:tower', null, 'a', 'b', 'x', null, null, null],
})

assert(
  JSON.stringify(singleFullVisualPageShouldSpillActualLastItemResult.slots) ===
    JSON.stringify(['folder:tower', null, 'x', 'a', 'b', null, null, null]),
  '视觉上满页但存在 footprint 假空位时，提交结果应与预览一致，挤出当前页最后一个真实图标'
)

console.log('dropPolicy 拖放分页测试通过')
