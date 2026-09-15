/**
 * 「快捷导入」的数据模型：扫描结果的类型、确认弹窗的分组与勾选规则。
 *
 * 后端在扫描阶段就完成重复检测并标注三档状态：
 * - new：新应用，默认勾选；
 * - possible_duplicate：与图标库中的应用重名但目标不同（可能重复），默认勾选；
 * - exact_duplicate：目标与图标库一致（已导入 / 一定重复），默认取消勾选。
 *
 * 弹窗按来源位置分组（与后端扫描来源优先级一致），组内按状态排序：
 * 新应用在前，可能重复与已导入靠后，便于对照检查重复项。
 */

import type { AddIconDialogDraft } from '@/components/icons/addIconDialogState'

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
  /**
   * 跨来源去重时并入本条目的其他来源条目：来源标签 → 条目数。
   * 后端只在非空时返回该字段；用于在分组标题解释「条目为什么变少」。
   */
  mergedSources?: Record<string, number>
}

/** 确认弹窗中的单个条目：在扫描结果上附加勾选与预览状态。 */
export interface QuickImportAppDraft extends Omit<ScannedInstalledApp, 'status'> {
  status: QuickImportAppStatus
  key: string
  selected: boolean
  preview: string
  previewLoading: boolean
  /** 通过「编辑图标信息」弹窗保存的草稿；导入时覆盖默认字段。 */
  edit?: AddIconDialogDraft
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

/** 组内状态排序：新应用 → 可能重复 → 一定重复。 */
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

/** 来源分组的展示顺序：与后端扫描来源的优先级一致。 */
export const QUICK_IMPORT_SOURCE_ORDER = [
  '开始菜单',
  '公共开始菜单',
  '桌面',
  '公共桌面',
  '快速启动',
  '注册表',
  '商店应用',
]

export interface QuickImportAppSourceGroup {
  source: string
  apps: QuickImportAppDraft[]
}

/**
 * 把弹窗条目按来源位置分组：已知来源按固定顺序排列，未知来源按出现顺序排在最后，
 * 空分组直接丢弃；组内按状态排序（新应用 → 可能重复 → 已导入）。
 */
export function groupQuickImportAppsBySource(
  apps: QuickImportAppDraft[]
): QuickImportAppSourceGroup[] {
  const buckets = new Map<string, QuickImportAppDraft[]>()
  for (const app of apps) {
    const bucket = buckets.get(app.sourceLabel)
    if (bucket) bucket.push(app)
    else buckets.set(app.sourceLabel, [app])
  }
  const orderedSources: string[] = []
  for (const source of QUICK_IMPORT_SOURCE_ORDER) {
    if (buckets.has(source)) orderedSources.push(source)
  }
  for (const source of buckets.keys()) {
    if (!QUICK_IMPORT_SOURCE_ORDER.includes(source)) orderedSources.push(source)
  }
  return orderedSources.map(source => {
    const groupApps = buckets.get(source) ?? []
    const sorted = [...groupApps].sort(
      (a, b) =>
        QUICK_IMPORT_GROUP_ORDER.indexOf(a.status) - QUICK_IMPORT_GROUP_ORDER.indexOf(b.status)
    )
    return { source, apps: sorted }
  })
}

export function countSelectedQuickImportApps(apps: QuickImportAppDraft[]): number {
  return apps.reduce((count, app) => (app.selected ? count + 1 : count), 0)
}

/**
 * 汇总某个来源被跨来源去重合并的条目去向。
 * 合并信息记在保留条目（mergedSources 的键是被合并来源）上，
 * 这里反向聚合：返回该来源的条目被并入了哪些来源、各多少条，
 * 供分组标题展示「另有 N 个与 XX 重复」。
 */
export function summarizeQuickImportMerges(
  apps: QuickImportAppDraft[],
  source: string
): { target: string; count: number }[] {
  const buckets = new Map<string, number>()
  for (const app of apps) {
    const merged = app.mergedSources?.[source] ?? 0
    if (merged > 0) {
      buckets.set(app.sourceLabel, (buckets.get(app.sourceLabel) ?? 0) + merged)
    }
  }
  return [...buckets.entries()]
    .map(([target, count]) => ({ target, count }))
    .sort((left, right) => right.count - left.count)
}

/**
 * 把待导入应用转成「编辑图标信息」弹窗的初始草稿。
 * 目标路径用 sourcePath（导入时的真实入口路径）；已编辑过的应用沿用其编辑草稿。
 */
export function buildQuickImportEditDraft(app: QuickImportAppDraft): AddIconDialogDraft {
  const edit = app.edit
  return {
    entryKind: edit?.entryKind,
    displayName: edit?.displayName ?? app.displayName,
    targetPath: edit?.targetPath ?? app.sourcePath,
    launchArguments: edit?.launchArguments ?? '',
    workingDirectory: edit?.workingDirectory ?? '',
    customIconPath: edit?.customIconPath ?? '',
    websiteIconBase64: edit?.websiteIconBase64 ?? '',
    generatedIconBase64: edit?.generatedIconBase64 ?? '',
    iconSource: edit?.iconSource ?? 'target',
    iconColor: edit?.iconColor ?? 'none',
    iconText: edit?.iconText ?? '',
  }
}

/** 导入载荷：编辑过的应用用编辑草稿覆盖默认字段（与未编辑时的后端默认值一致）。 */
export function buildQuickImportEntryInput(app: QuickImportAppDraft) {
  const edit = app.edit
  return {
    displayName: edit?.displayName ?? app.displayName,
    targetPath: edit?.targetPath ?? app.sourcePath,
    origin: 'import',
    launchArguments: edit?.launchArguments ?? '',
    workingDirectory: edit?.workingDirectory ?? '',
    customIconPath: edit?.customIconPath ?? '',
    websiteIconBase64: edit?.websiteIconBase64 ?? '',
    generatedIconBase64: edit?.generatedIconBase64 ?? '',
    iconSource: edit?.iconSource ?? 'target',
    iconColor: edit?.iconColor ?? 'none',
    iconText: edit?.iconText ?? '',
  }
}
