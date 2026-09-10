export const GRID_GAP = 8
export const PAGINATION_OFFSET = 14
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
export const DRAG_LONG_PRESS_MS = 300
export const DRAG_PENDING_MOVE_TOLERANCE = 7
export const EVASION_REARM_DISTANCE = 14
export const REORDER_ANIMATION_MS = 300
export const FOLDER_SHARED_LAYOUT_WINDOW_MS = 320
export const IMPORT_HIGHLIGHT_MS = 4200

// Collision, dwell, cooldown, and easing values remain owned by each grid mode.
export const OUTER_DRAG_RULES = {
  folderOverlapThreshold: 0.45,
  evasionDwellMs: 300,
  nearestMetric: 'manhattan',
  directionTieBreakByOverlap: true,
} as const
