import { invoke } from '@tauri-apps/api/core'
import { buildGridGeometryKey, readGridGeometryMeasurement } from '../icon-grid/domain/gridGeometry'

/** 布局库只对分页网格开放；滚动模式的分组结构是另一套，先不混进来。 */
export type LayoutLibraryScope = 'paged'

/** 底部抽屉展开时的高度（逻辑像素）：顶栏 48 + 卡片区 136 + 上边框 1，翻页指示器按它上移避开。 */
export const LAYOUT_DRAWER_HEIGHT = 185
/** 抽屉折叠后只剩顶栏。 */
export const LAYOUT_DRAWER_COLLAPSED_HEIGHT = 49

export type LayoutVersionKind = 'auto' | 'saved'

/** 缩略图里的一个条目：锚点在哪一格、占几行几列，文件夹能占 2x2。 */
export interface LayoutThumbnailEntry {
  /** `folder:<id>` 表示文件夹，其余是图标 id。 */
  key: string
  col: number
  row: number
  cols: number
  rows: number
  /** 文件夹名；图标没有。 */
  name?: string
  /** 文件夹里前几个图标的 id，缩略图按它画内部预览。 */
  children?: string[]
}

/** 后端算好的缩略图：只存第一页，按锚点和跨度铺开。 */
export interface LayoutThumbnail {
  columns: number
  rows: number
  entries: LayoutThumbnailEntry[]
  /** 总页数，卡片上的「N 页」用它。 */
  pageTotal: number
}

export interface LayoutVersionMeta {
  id: string
  scope: string
  kind: LayoutVersionKind
  name: string | null
  iconCount: number
  geometryKey: string | null
  thumbnail: LayoutThumbnail | null
  createdAt: number
}

export interface LayoutVersionDetail extends LayoutVersionMeta {
  payload: string
}

/** 预览期间不往历史里写快照：中间态不该占据历史版本。 */
let historyPaused = false

export const setLayoutHistoryPaused = (paused: boolean) => {
  historyPaused = paused
}

/**
 * 历史快照按"改动结束后落一份"记录。
 *
 * 拖拽过程中网格每帧都可能写一次布局，逐次记快照会把 50 条上限冲光；这里用尾沿防抖，
 * 一串连续改动只留最终结果。
 */
const SNAPSHOT_IDLE_MS = 3000
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let pendingSnapshotPayload: string | null = null
let lastSnapshotPayload: string | null = null

export const listLayoutVersions = (scope: LayoutLibraryScope = 'paged') =>
  invoke<LayoutVersionMeta[]>('list_layout_versions', { scope })

export const getLayoutVersion = (id: string) =>
  invoke<LayoutVersionDetail | null>('get_layout_version', { id })

export const saveLayoutVersion = (options: {
  kind: LayoutVersionKind
  name?: string | null
  payload: string
  scope?: LayoutLibraryScope
}) =>
  invoke<LayoutVersionMeta>('save_layout_version', {
    scope: options.scope ?? 'paged',
    kind: options.kind,
    name: options.name ?? null,
    payload: options.payload,
  })

export const renameLayoutVersion = (id: string, name: string) =>
  invoke<void>('rename_layout_version', { id, name })

export const deleteLayoutVersion = (id: string) => invoke<void>('delete_layout_version', { id })

const flushLayoutSnapshot = () => {
  if (snapshotTimer !== null) {
    clearTimeout(snapshotTimer)
    snapshotTimer = null
  }
  const payload = pendingSnapshotPayload
  pendingSnapshotPayload = null
  if (!payload || payload === lastSnapshotPayload) return
  lastSnapshotPayload = payload
  void saveLayoutVersion({ kind: 'auto', payload }).catch(error => {
    console.error('Failed to record layout snapshot:', error)
  })
}

/**
 * 布局写入后补一份历史快照。
 *
 * 调用方（layoutStore）已经在做 payload 去重，这里再叠一层防抖与 Rust 侧的"与上一条相同
 * 就不写"，一次拖拽产生的多轮写入最终只会留下真正变化的版本。
 */
export const recordAutoLayoutSnapshot = (payload: string, scope: string) => {
  if (scope !== 'paged' || historyPaused) return
  pendingSnapshotPayload = payload
  if (snapshotTimer !== null) clearTimeout(snapshotTimer)
  snapshotTimer = setTimeout(flushLayoutSnapshot, SNAPSHOT_IDLE_MS)
}

/** 窗口隐藏前把还没落盘的快照写完，别丢掉最后一次改动。 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushLayoutSnapshot()
  })
  // 启动台失焦就是被收起，这时候补写，不然 3 秒内就切走的改动进不了历史。
  window.addEventListener('blur', flushLayoutSnapshot)
  window.addEventListener('pagehide', flushLayoutSnapshot)
}

export const resolveCurrentGeometryKey = (windowMode: string, iconSize: string, dock: boolean) =>
  buildGridGeometryKey(windowMode, iconSize, dock, readGridGeometryMeasurement())

/**
 * 恢复前按当前网格几何校正 payload。
 *
 * 布局里的槽位是「第几页第几行第几列」，窗口模式、图标尺寸或 Dock 开关一变，行列数跟着变，
 * 旧槽位就会越界。几何不一致时丢掉槽位与坐标，让网格按 items 顺序重排——与 AI 整理写空
 * slots 的路子一致；几何一致则原样恢复，保留用户精确的摆放。
 */
export const prepareLayoutPayloadForApply = (raw: string, currentGeometryKey: string): string => {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return raw
  }
  if (!parsed || typeof parsed !== 'object') return raw

  const savedGeometryKey = typeof parsed.geometryKey === 'string' ? parsed.geometryKey : null
  if (savedGeometryKey === currentGeometryKey) return raw

  return JSON.stringify({
    version: 9,
    items: Array.isArray(parsed.items) ? parsed.items : [],
    slots: [],
    dockKeys: Array.isArray(parsed.dockKeys) ? parsed.dockKeys : [],
    geometryKey: currentGeometryKey,
  })
}

export const formatLayoutVersionTime = (createdAt: number) => {
  const date = new Date(createdAt * 1000)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (sameDay) return time
  return `${date.getMonth() + 1}/${date.getDate()} ${time}`
}
