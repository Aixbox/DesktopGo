import { invoke } from '@tauri-apps/api/core'

export interface AiIconCategoryEntry {
  name: string
  category: string
}

/** 用户自定义分类条目的 KV 存储键；与后端 icon_categories 模块保持一致。 */
const AI_ICON_CATEGORIES_KEY = 'desktopgo.ai.icon-categories.v1'

/** 读取用户自定义的「应用 → 分类」条目（不含内置表）。 */
export async function loadAiIconCategories(): Promise<AiIconCategoryEntry[]> {
  const raw = await invoke<string | null>('get_layout_payload', { key: AI_ICON_CATEGORIES_KEY })
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as { entries?: unknown }
    if (!Array.isArray(parsed.entries)) return []

    return parsed.entries
      .filter(
        (entry): entry is { name: string; category: string } =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { name?: unknown }).name === 'string' &&
          typeof (entry as { category?: unknown }).category === 'string'
      )
      .map(entry => ({
        name: entry.name.trim(),
        category: entry.category.trim(),
      }))
      .filter(entry => entry.name.length > 0 && entry.category.length > 0)
  } catch {
    return []
  }
}

/** 保存用户自定义条目；同名（忽略大小写）条目在运行时覆盖内置分类。 */
export async function saveAiIconCategories(entries: AiIconCategoryEntry[]): Promise<void> {
  await invoke('set_layout_payload', {
    key: AI_ICON_CATEGORIES_KEY,
    payload: JSON.stringify({ entries }),
  })
}

/** 内置分类参考表（后端静态数据），设置页只读展示。 */
export async function loadBuiltinIconCategories(): Promise<AiIconCategoryEntry[]> {
  const result = await invoke<{ entries: AiIconCategoryEntry[] }>('get_builtin_icon_categories')
  return result.entries ?? []
}
