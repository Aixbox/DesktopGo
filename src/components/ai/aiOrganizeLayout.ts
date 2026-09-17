import {
  getId,
  type GridItem,
  type PersistedLayout,
  type ScrollGroupMeta,
} from '../icon-grid/model'
import { normalizeScrollGroups } from '../icon-grid/scroll/scrollGroupLayout'
import type { LaunchpadLayoutScope } from '../icon-grid/services/layoutStore'
import type { LaunchpadGridViewMode } from '../../types'

type LayoutStore = typeof import('../icon-grid/services/layoutStore')

export const resolveAiOrganizeLayoutScope = (
  viewMode: LaunchpadGridViewMode
): LaunchpadLayoutScope => (viewMode === 'scroll' ? 'scroll' : 'paged')

export const readAiOrganizeLayout = (viewMode: LaunchpadGridViewMode) =>
  import('../icon-grid/services/layoutStore').then(({ readLayoutStrict }) =>
    readLayoutStrict(resolveAiOrganizeLayoutScope(viewMode))
  )

export const restoreAiOrganizeLayout = (
  viewMode: LaunchpadGridViewMode,
  layout: PersistedLayout | null
) =>
  import('../icon-grid/services/layoutStore').then(({ writePersistedLayout }) =>
    writePersistedLayout(layout, resolveAiOrganizeLayoutScope(viewMode))
  )

interface BuildAiOrganizeLayoutWriteOptions {
  viewMode: LaunchpadGridViewMode
  items: GridItem[]
  baselineLayout: PersistedLayout | null
  defaultScrollGroupName: (index: number) => string
}

export interface AiOrganizeLayoutWrite {
  scope: LaunchpadLayoutScope
  scrollGroups?: ScrollGroupMeta[]
}

interface WriteAiOrganizeLayoutStateOptions extends BuildAiOrganizeLayoutWriteOptions {
  slots?: Array<string | null>
  dockKeys?: Array<string | null>
}

const normalizeLegacySlotIds = (slots: Array<string | null> | null | undefined) =>
  (slots ?? []).map(itemId => (itemId ? itemId.replace(/^(desktop|customapp):/, '') : null))

export const buildAiOrganizeLayoutWrite = ({
  viewMode,
  items,
  baselineLayout,
  defaultScrollGroupName,
}: BuildAiOrganizeLayoutWriteOptions): AiOrganizeLayoutWrite => {
  const scope = resolveAiOrganizeLayoutScope(viewMode)
  if (scope === 'paged') return { scope }

  const legacySlots = normalizeLegacySlotIds(baselineLayout?.slots)
  const scrollGroups = normalizeScrollGroups({
    groups: baselineLayout?.scrollGroups,
    outerItemIds: items.map(getId),
    legacySlots,
    legacyPageSize: baselineLayout?.pageSize ?? Math.max(1, legacySlots.length),
    hasExplicitItems: baselineLayout?.scrollGroupItemsExplicit === true,
    defaultName: defaultScrollGroupName,
  })
  return { scope, scrollGroups: prependNewAiFoldersToFirstScrollGroup(scrollGroups, items, baselineLayout) }
}

/**
 * AI 重组后新建的文件夹应出现在布局最前面。normalizeScrollGroups 的恢复逻辑会把
 * 旧槽位/旧分组里没有的 id 追加到最后一个网格（也就是「整理结果跑到最后一页」的
 * 滚动模式版本），这里把本次新建的文件夹统一前置到第一个网格开头，与分页模式的
 * 「新文件夹在前」一致；用户已有的文件夹不在本次新建集合里，保持原位。
 */
const prependNewAiFoldersToFirstScrollGroup = (
  scrollGroups: ScrollGroupMeta[],
  items: GridItem[],
  baselineLayout: PersistedLayout | null
): ScrollGroupMeta[] => {
  const baselineFolderIds = new Set(
    (baselineLayout?.items ?? [])
      .filter(item => item.type === 'folder')
      .map(item => item.id)
  )
  const newFolderIds = items
    .filter(item => item.kind === 'folder' && !baselineFolderIds.has(item.id))
    .map(getId)
  if (newFolderIds.length === 0 || scrollGroups.length === 0) return scrollGroups

  const newFolderIdSet = new Set(newFolderIds)
  const stripped = scrollGroups.map(group => ({
    ...group,
    itemIds: group.itemIds.filter(itemId => !newFolderIdSet.has(itemId)),
  }))
  stripped[0] = {
    ...stripped[0],
    itemIds: [...newFolderIds, ...stripped[0].itemIds],
  }
  return stripped
}

export const writeAiOrganizeLayout = async ({
  viewMode,
  items,
  baselineLayout,
  defaultScrollGroupName,
}: BuildAiOrganizeLayoutWriteOptions) => {
  await writeAiOrganizeLayoutState({
    viewMode,
    items,
    baselineLayout,
    defaultScrollGroupName,
  })
}

export const writeAiOrganizeLayoutState = async ({
  viewMode,
  items,
  baselineLayout,
  defaultScrollGroupName,
  slots,
  dockKeys,
}: WriteAiOrganizeLayoutStateOptions) => {
  const { writeLayout }: Pick<LayoutStore, 'writeLayout'> =
    await import('../icon-grid/services/layoutStore')
  const { scope, scrollGroups } = buildAiOrganizeLayoutWrite({
    viewMode,
    items,
    baselineLayout,
    defaultScrollGroupName,
  })
  await writeLayout(
    items,
    // 分页模式刻意传空槽位：整理结果（新文件夹在前、未分组图标按原相对顺序在后）
    // 需要按 items 顺序重新铺页，与「重置布局」的水合路径一致。若回填旧槽位，
    // 新文件夹 id 不在旧槽位里会被追加到最后一页，被抽走图标的位置留下空洞，
    // 部分清空的旧文件夹也散在前面页——正是整理后布局凌乱的根源。
    // 滚动模式的槽位仅作 legacy 拖拽预览数据，保留基线值，分组的真实结构在
    // scrollGroups 里（新文件夹已前置到第一个网格）。
    slots ?? (scope === 'paged' ? [] : (baselineLayout?.slots ?? [])),
    dockKeys ?? baselineLayout?.dockKeys ?? [],
    undefined,
    undefined,
    undefined,
    scrollGroups,
    scope
  )
}
