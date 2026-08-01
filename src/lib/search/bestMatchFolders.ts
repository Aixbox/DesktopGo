/**
 * 「最佳匹配」扫哪些目录，完全由用户说了算。
 *
 * 这里没有「内置目录」和「自定义目录」两套东西：清单只有一份，开始菜单、桌面、
 * 快速启动只是**预设**内容 —— 首次使用时写进清单（`presetsApplied`），之后可以像
 * 任何一条那样改路径、改层数、停用或删除。删掉就不再自动补回来，需要时用设置里的
 * 「恢复预设目录」重新加进来。
 *
 * 层数各目录独立：开始菜单要往里钻四层（`Visual Studio Code\...lnk`），绿色软件仓库
 * 通常两层就够，写死一个值要么漏、要么把整棵树读进来。`maxDepth: 0` 表示不限层数，
 * 由 Rust 侧的条目上限与符号链接防护兜底。
 */

import { DEFAULT_CATALOG_EXTENSIONS, normalizeCatalogExtensions } from './catalogFileTypes'

export interface CatalogFolder {
  path: string
  /** 往下钻几层。1 表示只读这一层，0 表示不限层数。 */
  maxDepth: number
  enabled: boolean
}

export interface BestMatchFolderConfig {
  /**
   * 预设目录是否已经写入过清单。它存在的唯一意义是让「删掉预设」成为可能：
   * 没有这个标记，下次加载又会把用户删掉的目录补回来。
   */
  presetsApplied: boolean
  folders: CatalogFolder[]
  /** 收录哪些扩展名（不含点、小写）；`*` 表示未列出的类型也收。 */
  extensions: string[]
  /** 是否把子文件夹本身也收进清单（开始菜单里的 `Visual Studio Code` 这类）。 */
  includeFolders: boolean
}

export const MIN_CATALOG_DEPTH = 1
export const MAX_CATALOG_DEPTH = 8
export const DEFAULT_CATALOG_DEPTH = 2
/** 不限层数。 */
export const UNLIMITED_CATALOG_DEPTH = 0
/** 上限存在的意义是兜住误操作：每个目录都要在面板打开时重新枚举一遍。 */
export const MAX_CATALOG_FOLDERS = 16

export const DEFAULT_BEST_MATCH_FOLDER_CONFIG: BestMatchFolderConfig = {
  presetsApplied: false,
  folders: [],
  extensions: DEFAULT_CATALOG_EXTENSIONS,
  includeFolders: true,
}

/** 去重与前缀比较都按这个形式：正斜杠、小写、去掉尾部斜杠。 */
export const normalizeCatalogFolderPath = (path: string): string =>
  path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()

export const clampCatalogDepth = (value: unknown): number => {
  const numeric = Math.round(Number(value))
  if (!Number.isFinite(numeric) || numeric < 0) return DEFAULT_CATALOG_DEPTH
  if (numeric === UNLIMITED_CATALOG_DEPTH) return UNLIMITED_CATALOG_DEPTH
  return Math.min(MAX_CATALOG_DEPTH, Math.max(MIN_CATALOG_DEPTH, numeric))
}

const normalizeFolder = (value: unknown): CatalogFolder | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const path = typeof record.path === 'string' ? record.path.trim() : ''
  if (!path) return null

  return {
    path,
    maxDepth: clampCatalogDepth(record.maxDepth),
    // 旧数据里没有这个字段时按启用处理：用户加过的目录不该因为升级而静默失效。
    enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
  }
}

const normalizeFolderList = (value: unknown): CatalogFolder[] => {
  const raw = Array.isArray(value) ? value : []
  const seen = new Set<string>()
  const folders: CatalogFolder[] = []
  for (const entry of raw) {
    if (folders.length >= MAX_CATALOG_FOLDERS) break
    const folder = normalizeFolder(entry)
    if (!folder) continue
    const key = normalizeCatalogFolderPath(folder.path)
    if (seen.has(key)) continue
    seen.add(key)
    folders.push(folder)
  }
  return folders
}

/**
 * 存档里的值一律当成不可信输入：钳层数、丢掉空路径与重复路径、截断到上限。
 *
 * 也读得懂上一版的形状（`customFolders`）：目录列表照搬过来，内置目录的分组开关
 * 无法精确表达，就让预设重新写入一次，用户再调整。
 */
export const normalizeBestMatchFolderConfig = (value: unknown): BestMatchFolderConfig => {
  if (!value || typeof value !== 'object') return DEFAULT_BEST_MATCH_FOLDER_CONFIG

  const record = value as Record<string, unknown>
  const rawFolders = 'folders' in record ? record.folders : record.customFolders

  return {
    presetsApplied: record.presetsApplied === true,
    folders: normalizeFolderList(rawFolders),
    extensions: normalizeCatalogExtensions(record.extensions),
    includeFolders: record.includeFolders !== false,
  }
}

/** 已经存在同一个目录时返回 true，用于在界面上提示重复而不是静默忽略。 */
export const hasCatalogFolder = (config: BestMatchFolderConfig, path: string): boolean => {
  const normalized = normalizeCatalogFolderPath(path)
  return config.folders.some(folder => normalizeCatalogFolderPath(folder.path) === normalized)
}

/**
 * 把预设目录并进清单：已经在清单里的按路径跳过，其余追加到末尾。
 * 只在首次（`presetsApplied` 为假）和用户手动点「恢复预设目录」时调用。
 */
export const withPresetFolders = (
  config: BestMatchFolderConfig,
  presets: CatalogFolder[]
): BestMatchFolderConfig => {
  const folders = [...config.folders]
  const seen = new Set(folders.map(folder => normalizeCatalogFolderPath(folder.path)))
  for (const preset of presets) {
    if (folders.length >= MAX_CATALOG_FOLDERS) break
    const key = normalizeCatalogFolderPath(preset.path)
    if (!key || seen.has(key)) continue
    seen.add(key)
    folders.push({ path: preset.path, maxDepth: clampCatalogDepth(preset.maxDepth), enabled: true })
  }

  return { ...config, presetsApplied: true, folders }
}
