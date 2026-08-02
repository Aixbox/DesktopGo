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
  return {
    scope,
    scrollGroups: normalizeScrollGroups({
      groups: baselineLayout?.scrollGroups,
      outerItemIds: items.map(getId),
      legacySlots,
      legacyPageSize: baselineLayout?.pageSize ?? Math.max(1, legacySlots.length),
      hasExplicitItems: baselineLayout?.scrollGroupItemsExplicit === true,
      defaultName: defaultScrollGroupName,
    }),
  }
}

export const writeAiOrganizeLayout = async ({
  viewMode,
  items,
  baselineLayout,
  defaultScrollGroupName,
}: BuildAiOrganizeLayoutWriteOptions) => {
  const { writeLayout }: Pick<LayoutStore, 'writeLayout'> =
    await import('../icon-grid/services/layoutStore')
  const { scope, scrollGroups } = buildAiOrganizeLayoutWrite({
    viewMode,
    items,
    baselineLayout,
    defaultScrollGroupName,
  })
  await writeLayout(items, [], [], undefined, undefined, undefined, scrollGroups, scope)
}
