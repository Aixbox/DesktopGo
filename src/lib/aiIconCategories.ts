import { invoke } from '@tauri-apps/api/core'

export interface AiIconCategoryEntry {
  name: string
  category: string
}

/** 用户自定义层的 KV 存储键；与后端 icon_categories 模块保持一致。 */
const AI_ICON_CATEGORIES_KEY = 'desktopgo.ai.icon-categories.v1'

/** 用户层的完整状态：自定义/覆盖条目 + 被删除的内置条目名（墓碑）。 */
export interface AiIconCategoryState {
  entries: AiIconCategoryEntry[]
  deletedBuiltinNames: string[]
}

/** 合并内置表与用户层后的展示行。uid 用于 React 稳定 key。 */
export type AiIconCategoryRow = AiIconCategoryEntry & {
  origin: 'builtin' | 'custom'
  modified: boolean
  deleted: boolean
  uid: string
}

/** 读取用户层状态（兼容旧格式：无墓碑字段视为空）。 */
export async function loadAiIconCategoryState(): Promise<AiIconCategoryState> {
  const raw = await invoke<string | null>('get_layout_payload', { key: AI_ICON_CATEGORIES_KEY })
  if (!raw) return { entries: [], deletedBuiltinNames: [] }

  try {
    const parsed = JSON.parse(raw) as { entries?: unknown; deletedBuiltinNames?: unknown }
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
          .filter(
            (entry): entry is { name: string; category: string } =>
              typeof entry === 'object' &&
              entry !== null &&
              typeof (entry as { name?: unknown }).name === 'string' &&
              typeof (entry as { category?: unknown }).category === 'string'
          )
          .map(entry => ({ name: entry.name.trim(), category: entry.category.trim() }))
          .filter(entry => entry.name.length > 0 || entry.category.length > 0)
      : []
    const deletedBuiltinNames = Array.isArray(parsed.deletedBuiltinNames)
      ? parsed.deletedBuiltinNames
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
          .map(name => name.trim())
      : []
    return { entries, deletedBuiltinNames }
  } catch {
    return { entries: [], deletedBuiltinNames: [] }
  }
}

/**
 * 保存用户层。同名（忽略大小写）条目去重保留最后一条、与后端合并语义一致；
 * 空条目不入库（仅留在本地编辑中）。墓碑按内置表原名记录。
 */
export async function saveAiIconCategoryState(state: AiIconCategoryState): Promise<void> {
  const deduped = new Map<string, AiIconCategoryEntry>()
  for (const entry of state.entries) {
    const name = entry.name.trim()
    const category = entry.category.trim()
    if (!name || !category) continue
    deduped.set(name.toLowerCase(), { name, category })
  }

  await invoke('set_layout_payload', {
    key: AI_ICON_CATEGORIES_KEY,
    payload: JSON.stringify({
      entries: [...deduped.values()],
      deletedBuiltinNames: state.deletedBuiltinNames,
    }),
  })
}

/** 内置分类参考表（后端静态数据）。 */
export async function loadBuiltinIconCategories(): Promise<AiIconCategoryEntry[]> {
  const result = await invoke<{ entries: AiIconCategoryEntry[] }>('get_builtin_icon_categories')
  return result.entries ?? []
}

/**
 * 合并内置表与用户层：内置表 → 剔除墓碑 → 同名覆盖 → 追加自定义条目。
 * 与后端 load_effective_icon_categories 的语义保持一致。
 */
export function mergeIconCategoryRows(
  builtins: AiIconCategoryEntry[],
  state: AiIconCategoryState
): AiIconCategoryRow[] {
  const deleted = new Set(state.deletedBuiltinNames.map(name => name.toLowerCase()))

  // 同名覆盖保留最后一条（与后端合并语义一致）。
  const overrideByName = new Map<string, AiIconCategoryEntry>()
  state.entries.forEach(entry => {
    overrideByName.set(entry.name.trim().toLowerCase(), entry)
  })
  const lastIndexOf = new Map<string, number>()
  state.entries.forEach((entry, index) => {
    lastIndexOf.set(entry.name.trim().toLowerCase(), index)
  })

  const rows: AiIconCategoryRow[] = builtins.map(builtin => {
    const key = builtin.name.toLowerCase()
    const override = overrideByName.get(key)
    if (!override) {
      return {
        ...builtin,
        origin: 'builtin',
        modified: false,
        deleted: deleted.has(key),
        uid: `b:${key}`,
      }
    }
    return {
      name: builtin.name,
      category: override.category,
      origin: 'builtin',
      modified: override.category !== builtin.category,
      deleted: deleted.has(key),
      uid: `b:${key}`,
    }
  })

  const builtinKeys = new Set(builtins.map(builtin => builtin.name.toLowerCase()))
  state.entries.forEach((entry, index) => {
    const key = entry.name.trim().toLowerCase()
    // 覆盖内置表的条目已并入内置行；同名重复只保留最后一条。
    if (builtinKeys.has(key) || lastIndexOf.get(key) !== index) return
    rows.push({
      name: entry.name,
      category: entry.category,
      origin: 'custom',
      modified: false,
      deleted: false,
      uid: `u:${index}`,
    })
  })

  return rows
}
