import type { DesktopIcon } from '../types'
import { buildIconSelectionKey } from './iconKey.ts'
import type { GridItem, IconItem } from '../components/icon-grid/model.ts'
import { makeFolderId } from '../components/icon-grid/model.ts'

export interface AiIconInput {
  key: string
  name: string
  target_leaf: string
  item_type: string
}

export interface AiGroup {
  folder_name: string
  icon_keys: string[]
}

export interface AiClassifyResult {
  groups: AiGroup[]
  leftover: string[]
}

const getPathLeaf = (value: string): string => {
  const segments = value.split(/[\\/]/).filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : value
}

/**
 * 把当前图标列表转换成发给模型的精简清单：只带名称、目标叶子名和类型，
 * 不外传完整磁盘路径。名称优先使用用户自定义名。
 */
export function buildAiIconInputs(
  icons: DesktopIcon[],
  customNames: Record<string, string> = {}
): AiIconInput[] {
  return icons.map(icon => {
    const key = buildIconSelectionKey(icon)
    const customName = customNames[icon.path]
    return {
      key,
      name: (customName && customName.trim()) || icon.name,
      target_leaf: getPathLeaf(icon.target_path || icon.path),
      item_type: icon.item_type,
    }
  })
}

/**
 * 收集所有顶层及文件夹内的图标项，按 key 建立索引，
 * 这样无论图标当前在外层还是已在某个文件夹里，都能被重新分组。
 */
const collectIconItems = (items: GridItem[]): Map<string, IconItem> => {
  const map = new Map<string, IconItem>()
  items.forEach(item => {
    if (item.kind === 'icon') {
      map.set(item.key, item)
      return
    }
    item.children.forEach(child => {
      map.set(child.key, child)
    })
  })
  return map
}

/**
 * 把 AI 返回的分组应用到当前布局，生成新的顶层 GridItem 列表：
 * - 每个有效分组（>=2 个能匹配到的图标）合并为一个新文件夹；
 * - 已分组的图标从原位置（顶层或旧文件夹）移除；
 * - 未分组的图标按原相对顺序保留在顶层；
 * - 应用后原有的空文件夹会被丢弃，单成员文件夹自动展开为图标。
 *
 * 返回的 items 适合直接传给 writeLayout(newItems, [], [])，
 * 让 IconGrid 重新 hydrate 出 slots，与「重置布局」路径一致。
 */
export function applyAiGroupsToLayout(items: GridItem[], groups: AiGroup[]): GridItem[] {
  const iconByKey = collectIconItems(items)
  const consumed = new Set<string>()
  const folders: GridItem[] = []

  groups.forEach(group => {
    const children: IconItem[] = []
    group.icon_keys.forEach(key => {
      if (consumed.has(key)) return
      const iconItem = iconByKey.get(key)
      if (!iconItem) return
      consumed.add(key)
      children.push(iconItem)
    })

    if (children.length >= 2) {
      const name = group.folder_name.trim() || '未命名分组'
      folders.push({
        kind: 'folder',
        id: makeFolderId(),
        name,
        size: '1x1',
        children,
      })
    } else {
      // 不足 2 项的分组解散，成员回退到未分组集合。
      children.forEach(child => consumed.delete(child.key))
    }
  })

  const leftover: GridItem[] = []
  items.forEach(item => {
    if (item.kind === 'icon') {
      if (!consumed.has(item.key)) {
        leftover.push(item)
      }
      return
    }
    // 旧文件夹：保留未被 AI 重新分组的子项；若仍有 >=2 项则保留文件夹，
    // 恰好 1 项则展开为图标，0 项则丢弃。
    const remaining = item.children.filter(child => !consumed.has(child.key))
    if (remaining.length >= 2) {
      leftover.push({ ...item, children: remaining })
    } else if (remaining.length === 1) {
      leftover.push(remaining[0])
    }
  })

  // 新文件夹排在前面，便于用户一眼看到整理结果。
  return [...folders, ...leftover]
}
