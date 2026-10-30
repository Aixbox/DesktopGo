import {
  applyEvasionPreview,
  applyRebasedEvasionPreview,
  getEvasionIntentSignature,
  getEvasionReadyDelay,
  moveDragHoleToIndex,
  resolveVacatedBaseIconCellIntent,
} from './evasionPolicy.ts'
import { armPendingCellReorderAlarm } from './pendingCellReorderAlarm.ts'
import { applyOuterEvasionPolicy } from './dragMovePolicy.ts'
import { DRAG_HOLE_ID } from './slots.ts'
import { OUTER_DRAG_RULES } from '../constants.ts'
import { useTopLevelDwellEvasion } from '../hooks/useTopLevelDwellEvasion.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

assert(
  getEvasionIntentSignature('target', 'left') !== getEvasionIntentSignature('target', 'right'),
  '同一目标的不同命中区域必须是不同避让意图'
)
assert(
  getEvasionIntentSignature('target', 'left', 1) ===
    getEvasionIntentSignature('target', 'right', 1),
  '普通图标重排以目标格为意图，同一格内命中区域变化不应重启 alarm'
)
assert(
  getEvasionIntentSignature('target', 'left', 1) !== getEvasionIntentSignature('target', 'left', 2),
  '同一图标移动到新的临时格后必须作为新的重排意图'
)

assert(
  getEvasionReadyDelay({
    now: 50,
    dwellStartedAt: 0,
    dwellMs: 100,
    lastEvasionAt: null,
    cooldownMs: 200,
  }) === 50,
  '首次避让只需要等待 dwell'
)

assert(
  getEvasionReadyDelay({
    now: 1000,
    dwellStartedAt: 1000,
    dwellMs: 400,
    lastEvasionAt: 900,
    cooldownMs: 200,
  }) === 400,
  '目标格变化后仍需等待完整的 400ms 普通图标 alarm'
)

assert(
  getEvasionReadyDelay({
    now: 150,
    dwellStartedAt: 100,
    dwellMs: 100,
    lastEvasionAt: 100,
    cooldownMs: 200,
  }) === 150,
  '冷却期内切换目标时应等待剩余冷却，而不是触发后永久失效'
)

assert(
  getEvasionReadyDelay({
    now: 320,
    dwellStartedAt: 100,
    dwellMs: 100,
    lastEvasionAt: 100,
    cooldownMs: 200,
  }) === 0,
  'dwell 和冷却都结束后必须立即允许下一次避让'
)

assert(
  getEvasionReadyDelay({
    now: 299.4,
    dwellStartedAt: 100,
    dwellMs: 100,
    lastEvasionAt: 100,
    cooldownMs: 200,
  }) === 1,
  '小数毫秒必须向上取整，避免 timer 提前触发后重新落入冷却'
)

assert(OUTER_DRAG_RULES.evasionDwellMs === 400, '普通图标避让等待应与 ColorOS 的 400ms 对齐')

const makeRect = (left, top, width = 100, height = 100) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
})
const firstHit = {
  targetId: 'b',
  targetIndex: 1,
  targetRect: makeRect(100, 0),
  overlapRect: makeRect(75, 40, 20, 20),
  iou: 0.04,
  intersectionArea: 400,
  centerManhattanDistance: 10,
  zone: 'left',
}
const initialOrder = [DRAG_HOLE_ID, 'b', null, 'c', null, null]
const initialState = {
  workingOrder: initialOrder,
  pointerX: 90,
  pointerY: 50,
  lastEvasionSignature: null,
  lastEvasionTriggerPointer: null,
  lastEvasionAt: null,
  hoverTargetId: null,
  hoverZone: null,
  hoverIou: 0,
  folderPreviewTargetId: null,
  dockPreviewIndex: null,
  dwellStartedAt: null,
}
const firstOrder = applyOuterEvasionPolicy(initialOrder, firstHit, 6, 3, true).order
const firstState = applyEvasionPreview(
  {
    ...initialState,
    evasionBaseOrder: [...initialOrder],
  },
  firstOrder,
  firstHit,
  400,
  null
)
assert(
  firstState.workingOrder[1] === null && firstState.workingOrder[2] === 'b',
  '首次避让应将目标图标移入右侧空位'
)

const orderWhileSecondAlarmPending = moveDragHoleToIndex(firstState.workingOrder, 1)
assert(orderWhileSecondAlarmPending[2] === 'b', '拖动进入避让腾出的原格后，邻居必须保留在新的位置')
const secondState = applyRebasedEvasionPreview(
  {
    ...firstState,
    workingOrder: orderWhileSecondAlarmPending,
    pointerX: 450,
    pointerY: 50,
    previewSlotIndex: 4,
    hoverTargetIndex: null,
  },
  initialOrder,
  null,
  null,
  800,
  null
)
assert(
  secondState.workingOrder[1] === 'b',
  '触发新的 400ms alarm 后，邻居应从正式布局重新求解并回到原格'
)
assert(secondState.workingOrder[2] === null, '重新求解后邻居的临时格应恢复为空')
assert(secondState.evasionBaseOrder === null, '临时布局回到正式布局后应清除旧避让基线')
assert(secondState.previewSlotIndex === 4, '邻居复位不应丢失 alarm 到期时拖动项当前的候选落点')

const vacatedCellOrder = moveDragHoleToIndex(firstState.workingOrder, 1)
const vacatedCellIntent = resolveVacatedBaseIconCellIntent(
  vacatedCellOrder,
  firstState.evasionBaseOrder,
  1,
  null,
  targetId => targetId === 'b'
)
assert(
  vacatedCellIntent?.targetId === 'b' && vacatedCellIntent.targetIndex === 1,
  '当前临时布局看似空出的格子，若基线仍有图标，应启动 cell reorder alarm'
)
assert(
  resolveVacatedBaseIconCellIntent(
    vacatedCellOrder,
    firstState.evasionBaseOrder,
    1,
    1,
    targetId => targetId === 'b'
  ) === null,
  '同一 cell 的 alarm 已触发且拖动项未离开时，不应重复启动 reorder'
)

const createAlarmHarness = latestCellIndex => {
  const timerRef = { current: null }
  const intentRef = { current: null }
  const timers = new Map()
  let nextTimerId = 1
  let alarmResult = null
  const dragRef = {
    current: {
      ...firstState,
      context: 'outer',
      draggingId: 'a',
      draggingIds: ['a'],
      draggingItem: { kind: 'icon', key: 'a', icon: {} },
      workingOrder: vacatedCellOrder,
      pointerX: latestCellIndex === 1 ? 150 : 450,
      evasionBaseOrder: [...initialOrder],
    },
  }
  const clearPending = () => {
    if (timerRef.current !== null) timers.delete(timerRef.current)
    timerRef.current = null
    intentRef.current = null
  }
  const setTimer = (callback, delayMs) => {
    const id = nextTimerId++
    timers.set(id, { callback, delayMs })
    return id
  }
  const triggerEvasion = useTopLevelDwellEvasion({
    dragRef,
    itemsRef: { current: [] },
    itemById: new Map(),
    isDraggingFromDock: () => false,
    findTopLevelMaxOverlapHit: () => null,
    resolveCandidateAnchorIndexByContext: () => null,
    resolveNearestSlotIndexByContext: () => 1,
    resolveRawOuterCellIndex: state => (state.pointerX < 300 ? 1 : 4),
    resolveTopLevelOverlapPreviewIndex: () => null,
    tryApplyTopLevelEvasion: (state, _hit, now) => {
      const baseHit = state.pointerX < 300 ? firstHit : null
      return applyRebasedEvasionPreview(
        state,
        initialOrder,
        baseHit,
        baseHit ? firstOrder : null,
        now,
        null
      )
    },
    publishMoveDragState: state => {
      alarmResult = state
      dragRef.current = state
    },
  })
  const armed = armPendingCellReorderAlarm({
    timerRef,
    intentRef,
    intent: vacatedCellIntent,
    delayMs: 400,
    clearPending,
    setTimer,
    onAlarm: intent => {
      assert(intent.targetIndex === 1, 'cell alarm 应保留进入时的 cell identity')
      triggerEvasion(intent)
    },
  })
  return {
    armed,
    timerRef,
    intentRef,
    timers,
    setTimer,
    clearPending,
    setLatestPointerCell: index => {
      dragRef.current = { ...dragRef.current, pointerX: index === 1 ? 150 : 450 }
    },
    fire: () => {
      const timer = timers.get(timerRef.current)
      assert(timer?.delayMs === 400, '基线占用空格应安排完整的 400ms cell alarm')
      timers.delete(timerRef.current)
      timer.callback()
    },
    getAlarmResult: () => alarmResult,
  }
}

const leaveBeforeAlarm = createAlarmHarness(1)
assert(leaveBeforeAlarm.armed, '进入被临时避让腾出的基线格应安排 alarm')
assert(
  !armPendingCellReorderAlarm({
    timerRef: leaveBeforeAlarm.timerRef,
    intentRef: leaveBeforeAlarm.intentRef,
    intent: { targetId: 'other', targetIndex: 3, zone: 'center' },
    delayMs: 400,
    clearPending: leaveBeforeAlarm.clearPending,
    setTimer: leaveBeforeAlarm.setTimer,
    onAlarm: () => undefined,
  }),
  '已有 cell alarm 时不得因后续 cell 变化重置等待时间'
)
leaveBeforeAlarm.setLatestPointerCell(4)
leaveBeforeAlarm.fire()
assert(
  leaveBeforeAlarm.getAlarmResult().workingOrder[1] === 'b',
  '拖动项在 400ms 到期前离开腾空格后，alarm 必须按最新指针恢复邻居基线位置'
)

const remainOnVacatedCell = createAlarmHarness(1)
remainOnVacatedCell.fire()
assert(
  remainOnVacatedCell.getAlarmResult().workingOrder[2] === 'b',
  '拖动项仍停在基线占用格时，alarm 应按基线重新预览避让，而不是提前回位'
)

console.log('evasionTiming tests passed')
