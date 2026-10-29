export const GRID_GAP = 8
// scroll 模式指示器相对滚动内容底边的偏移（分页模式的指示器已改为固定
// bottom 定位、紧贴 dock 上方，不再使用此常量）。
export const PAGINATION_OFFSET = 40
export const PAGINATION_DOT_SIZE = 8
export const PAGINATION_DOT_GAP = 10
export const PAGINATION_ACTIVE_WIDTH = 18
// 66 是按“窗口带 8px DWM 隐藏边框”时代校准的；shadow(false) 后窗口边缘与
// 画面边缘重合，66 会让左右分页按钮贴死窗口边缘（可见部分被裁 2px）。
// 56 = 按钮可见部分距窗口边缘约 8px，恢复旧版观感。
export const SIDE_ARROW_OFFSET = 56
export const DRAG_EDGE_SWITCH_ZONE = 72
export const DRAG_EDGE_SWITCH_MS = 600
export const WHEEL_PAGE_DELTA_THRESHOLD = 54
export const WHEEL_PAGE_COOLDOWN_MS = 180
/** 布局抽屉浮在网格之上，它把自己的滚轮增量用这个事件转给网格翻页。 */
export const LAYOUT_PAGE_STEP_EVENT = 'launchpad:layout-page-step'
export const DRAG_LONG_PRESS_MS = 300
export const DRAG_PENDING_MOVE_TOLERANCE = 7
export const EVASION_HOLD_EXIT_MARGIN = 16
export const EVASION_REARM_DISTANCE = 14
export const REORDER_ANIMATION_MS = 300
/** ColorOS Workspace/PagedView timing baseline extracted from OplusLauncher. */
export const COLOROS_MOTION = {
  pageSnapMs: 750,
  workspacePageSnapMs: 600,
  largeScreenPageSnapMs: 550,
  largeScreenWorkspacePageSnapMs: 440,
  adjacentScreenDropMs: 300,
  workspaceReorderAlarmMs: 650,
  folderReorderAlarmMs: 200,
  folderDropMs: 600,
  spring: {
    response: 0.3,
    dampingRatio: 1,
    stiffness: 438.649,
    damping: 41.884,
    minimumVisibleChange: 0.001,
    positionThreshold: 0.00075,
    velocityThreshold: 0.046875,
  },
} as const
// Shared motion language for layout changes: a quick settle with a restrained
// overshoot keeps reflow feeling physical without turning into a visible bounce.
export const MOTION_SPRING_EASING = 'cubic-bezier(0.22, 1.12, 0.36, 1.02)'
export const DROP_FLIGHT_HANDOFF_MS = 240
export const FOLDER_SHARED_LAYOUT_WINDOW_MS = 320
export const IMPORT_HIGHLIGHT_MS = 4200

// Collision, dwell, cooldown, and easing values remain owned by each grid mode.
export const OUTER_DRAG_RULES = {
  folderOverlapThreshold: 0.45,
  evasionDwellMs: 300,
  nearestMetric: 'manhattan',
  directionTieBreakByOverlap: true,
} as const
