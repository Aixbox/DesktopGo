import {
  buildFolderAutoOpenOrder,
  canExitFolderThroughMask,
  FOLDER_AUTO_OPEN_DWELL_MS,
  FOLDER_EXIT_DWELL_MS,
  isFolderAutoOpenIntentValid,
  isPointOutsideFolderContent,
} from './folderPolicy.ts'
import { DRAG_HOLE_ID } from './slots.ts'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const validIntent = {
  context: 'outer',
  draggingCount: 1,
  draggingKind: 'icon',
  folderPreviewTargetId: 'folder:work',
  hoverTargetId: 'folder:work',
  hoverZone: 'center',
  expectedTargetId: 'folder:work',
}

assert(FOLDER_AUTO_OPEN_DWELL_MS === 500, '分页和滚动模式应共享 WeTab 风格的 500ms 打开停留时间')
assert(FOLDER_EXIT_DWELL_MS === 200, '真正离开文件夹内容区后应等待 200ms 再退出')
assert(isFolderAutoOpenIntentValid(validIntent), '单图标停留在同一文件夹中心时应允许自动打开')
assert(
  !isFolderAutoOpenIntentValid({ ...validIntent, hoverTargetId: 'folder:other' }),
  '指针切换到其他目标后，旧计时器不得打开原文件夹'
)
assert(
  !isFolderAutoOpenIntentValid({ ...validIntent, hoverZone: 'left' }),
  '指针离开文件夹中心区域后不得自动打开'
)
assert(
  !isFolderAutoOpenIntentValid({ ...validIntent, draggingCount: 2 }),
  '多选拖拽不得进入单图标文件夹自动打开流程'
)
assert(
  JSON.stringify(buildFolderAutoOpenOrder(['a', 'dragged', 'b'], 'dragged')) ===
    JSON.stringify(['a', DRAG_HOLE_ID, 'b']),
  '自动打开后应把拖动图标转换为文件夹内部唯一拖拽洞'
)
assert(
  buildFolderAutoOpenOrder(['a', 'b'], 'missing') === null,
  '提交结果中缺少拖动图标时必须中止自动打开'
)
assert(
  !canExitFolderThroughMask({
    dragStartedInFolder: false,
    enteredFolderContent: false,
  }),
  '从网格自动打开文件夹后，未进入内容区前在遮罩层移动不得关闭文件夹'
)
assert(
  canExitFolderThroughMask({
    dragStartedInFolder: false,
    enteredFolderContent: true,
  }),
  '真正进入文件夹内容区后才允许从遮罩层退出'
)
assert(
  !isPointOutsideFolderContent({ x: 100, y: 50 }, { left: 0, top: 0, width: 100, height: 100 }),
  '文件夹内容边界应算作内部，避免边缘抖动触发退出'
)
assert(
  isPointOutsideFolderContent({ x: 101, y: 50 }, { left: 0, top: 0, width: 100, height: 100 }),
  '越过文件夹内容边界后才进入遮罩层退出判定'
)

console.log('folderAutoOpenPolicy 测试通过')
