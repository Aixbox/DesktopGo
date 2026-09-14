/**
 * 「快捷导入」的数据模型：扫描结果的类型、确认弹窗的分组与勾选规则。
 *
 * 后端在扫描阶段就完成重复检测并标注三档状态：
 * - new：新应用，默认勾选；
 * - possible_duplicate：与图标库中的应用重名但目标不同（可能重复），默认勾选；
 * - exact_duplicate：目标与图标库一致（已导入 / 一定重复），默认取消勾选。
 *
 * 弹窗分组顺序：新应用在前，可能重复与一定重复相邻排列，
 * 便于用户对照检查重复项。
 */

export type QuickImportAppStatus = 'new' | 'possible_duplicate' | 'exact_duplicate'

/** 后端 scan_installed_apps 返回的单个已安装应用。 */
export interface ScannedInstalledApp {
  /** 导入时作为入口路径：lnk/url 用快捷方式文件本身，exe 用可执行文件路径。 */
  sourcePath: string
  displayName: string
  /** 解析出的目标 / exe 路径 / URL，仅用于展示。 */
  targetPath: string
  itemType: string
  sourceLabel: string
  status: string
}

/** 确认弹窗中的单个条目：在扫描结果上附加勾选与预览状态。 */
export interface QuickImportAppDraft extends Omit<ScannedInstalledApp, 'status'> {
  status: QuickImportAppStatus
  key: string
  selected: boolean
  preview: string
  previewLoading: boolean
}

/** import_app_entries 的返回值（沿用导入命令的统计字段）。 */
export interface QuickImportResult {
  imported_count: number
  duplicate_count: number
  invalid_count: number
}

const QUICK_IMPORT_STATUSES: QuickImportAppStatus[] = [
  'new',
  'possible_duplicate',
  'exact_duplicate',
]

/** 弹窗分组展示顺序：新应用 → 可能重复 → 一定重复。 */
export const QUICK_IMPORT_GROUP_ORDER = QUICK_IMPORT_STATUSES

/** 后端状态容错：未知取值一律按新应用处理。 */
export function normalizeQuickImportStatus(value: string): QuickImportAppStatus {
  return value === 'possible_duplicate' || value === 'exact_duplicate' ? value : 'new'
}

/** 「一定重复」即已导入的应用，默认取消勾选；其余默认勾选。 */
export function isQuickImportAppDefaultSelected(status: QuickImportAppStatus): boolean {
  return status !== 'exact_duplicate'
}

export function buildQuickImportDrafts(scanned: ScannedInstalledApp[]): QuickImportAppDraft[] {
  return scanned.map((app, index) => {
    const status = normalizeQuickImportStatus(app.status)
    return {
      ...app,
      status,
      key: `${app.sourcePath}#${index}`,
      selected: isQuickImportAppDefaultSelected(status),
      preview: '',
      previewLoading: false,
    }
  })
}

export interface QuickImportAppGroup {
  status: QuickImportAppStatus
  apps: QuickImportAppDraft[]
}

/** 把弹窗条目按固定顺序分组，空分组直接丢弃。 */
export function groupQuickImportApps(apps: QuickImportAppDraft[]): QuickImportAppGroup[] {
  return QUICK_IMPORT_GROUP_ORDER.map(status => ({
    status,
    apps: apps.filter(app => app.status === status),
  })).filter(group => group.apps.length > 0)
}

export function countSelectedQuickImportApps(apps: QuickImportAppDraft[]): number {
  return apps.reduce((count, app) => (app.selected ? count + 1 : count), 0)
}
