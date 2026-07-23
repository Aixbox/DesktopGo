import type { PageAnchorEntry } from '../domain/topLevelLayout'
import {
  buildFolderAutoOpenOrder,
  canExitFolderThroughMask,
  FOLDER_AUTO_OPEN_DWELL_MS,
  FOLDER_EXIT_DWELL_MS,
  isPointOutsideFolderContent,
} from '../domain/folderPolicy'
import type { GridItem, ScrollGroupIcon, ScrollGroupMeta } from '../model'
import { getGridItemSpan } from '../model'

const LEGACY_GROUP_ID_PREFIX = 'scroll-group-migrated'
export const SCROLL_PREVIEW_REORDER_DWELL_MS = 100
export const SCROLL_PREVIEW_REORDER_LOCK_MS = 200
export const SCROLL_FOLDER_PREVIEW_DWELL_MS = 350
export const SCROLL_FOLDER_AUTO_OPEN_DWELL_MS = FOLDER_AUTO_OPEN_DWELL_MS
export const SCROLL_FOLDER_EXIT_DWELL_MS = FOLDER_EXIT_DWELL_MS
export const WETAB_SIDEBAR_DROP_TARGET_SIZE = 36
export const WETAB_SIDEBAR_GHOST_SIZE = 30

export const resolveScrollSidebarGhostSize = (targetHeight: number) =>
  Math.round(
    Math.max(1, targetHeight) * (WETAB_SIDEBAR_GHOST_SIZE / WETAB_SIDEBAR_DROP_TARGET_SIZE)
  )

export const buildScrollFolderAutoOpenOrder = buildFolderAutoOpenOrder

export const canExitScrollFolderThroughMask = canExitFolderThroughMask

export const hasScrollEvasionRearmed = (
  point: { x: number; y: number },
  previousTriggerPoint: { x: number; y: number } | null,
  minimumDistance: number
) =>
  previousTriggerPoint === null ||
  Math.hypot(point.x - previousTriggerPoint.x, point.y - previousTriggerPoint.y) >= minimumDistance

export interface NormalizeScrollGroupsOptions {
  groups: ScrollGroupMeta[] | null | undefined
  outerItemIds: string[]
  legacySlots?: Array<string | null> | null
  legacyPageSize?: number
  hasExplicitItems: boolean
  defaultName: (index: number) => string
  preferredGroupId?: string | null
}

const createUniqueGroupId = (requestedId: string, index: number, usedIds: Set<string>) => {
  const base = requestedId.trim() || `${LEGACY_GROUP_ID_PREFIX}-${index + 1}`
  let candidate = base
  let suffix = 2
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  usedIds.add(candidate)
  return candidate
}

const createDefaultGroup = (
  index: number,
  defaultName: (index: number) => string
): ScrollGroupMeta => ({
  id: `${LEGACY_GROUP_ID_PREFIX}-${index + 1}`,
  name: defaultName(index),
  icon: 'grid',
  itemIds: [],
})

export const normalizeScrollGroups = ({
  groups,
  outerItemIds,
  legacySlots = [],
  legacyPageSize = 1,
  hasExplicitItems,
  defaultName,
  preferredGroupId = null,
}: NormalizeScrollGroupsOptions): ScrollGroupMeta[] => {
  const validItemIds = new Set(outerItemIds)
  const safeLegacySlots = legacySlots ?? []
  const sourceGroups = groups && groups.length > 0 ? groups : [createDefaultGroup(0, defaultName)]
  const usedGroupIds = new Set<string>()
  const normalized = sourceGroups.map((group, index) => ({
    id: createUniqueGroupId(group.id ?? '', index, usedGroupIds),
    name: group.name.trim() || defaultName(index),
    icon: group.icon,
    itemIds: [] as string[],
  }))
  const consumed = new Set<string>()

  const appendUnique = (groupIndex: number, itemId: string | null | undefined) => {
    if (!itemId || !validItemIds.has(itemId) || consumed.has(itemId)) return
    consumed.add(itemId)
    normalized[groupIndex].itemIds.push(itemId)
  }

  if (hasExplicitItems) {
    sourceGroups.forEach((group, groupIndex) => {
      group.itemIds.forEach(itemId => appendUnique(groupIndex, itemId))
    })
  } else {
    const safePageSize = Math.max(1, Math.floor(legacyPageSize))
    normalized.forEach((_, groupIndex) => {
      const start = groupIndex * safePageSize
      safeLegacySlots.slice(start, start + safePageSize).forEach(itemId => {
        appendUnique(groupIndex, itemId)
      })
    })
    safeLegacySlots.slice(normalized.length * safePageSize).forEach(itemId => {
      appendUnique(normalized.length - 1, itemId)
    })
  }

  const preferredIndex = preferredGroupId
    ? normalized.findIndex(group => group.id === preferredGroupId)
    : -1
  const recoveryIndex = preferredIndex >= 0 ? preferredIndex : normalized.length - 1
  outerItemIds.forEach(itemId => appendUnique(recoveryIndex, itemId))
  return normalized
}

export const placeItemsInScrollGroup = (
  groups: ScrollGroupMeta[],
  targetGroupId: string | null | undefined,
  itemIds: string[]
): ScrollGroupMeta[] => {
  if (!targetGroupId || itemIds.length === 0) return groups
  const targetIndex = groups.findIndex(group => group.id === targetGroupId)
  if (targetIndex < 0) return groups

  const movedIds = Array.from(new Set(itemIds))
  const movedIdSet = new Set(movedIds)
  const nextGroups = groups.map(group => ({
    ...group,
    itemIds: group.itemIds.filter(itemId => !movedIdSet.has(itemId)),
  }))
  nextGroups[targetIndex] = {
    ...nextGroups[targetIndex],
    itemIds: [...nextGroups[targetIndex].itemIds, ...movedIds],
  }

  const changed = nextGroups.some(
    (group, index) =>
      group.itemIds.length !== groups[index].itemIds.length ||
      group.itemIds.some((itemId, itemIndex) => itemId !== groups[index].itemIds[itemIndex])
  )
  return changed ? nextGroups : groups
}

export const commitScrollGroupItemOrder = (
  groups: ScrollGroupMeta[],
  groupId: string,
  requestedItemIds: string[]
): ScrollGroupMeta[] => {
  const groupIndex = groups.findIndex(group => group.id === groupId)
  if (groupIndex < 0) return groups
  const currentIds = groups[groupIndex].itemIds
  const currentIdSet = new Set(currentIds)
  const nextIds = Array.from(new Set(requestedItemIds)).filter(id => currentIdSet.has(id))
  if (nextIds.length !== currentIds.length) return groups
  if (nextIds.every((id, index) => id === currentIds[index])) return groups
  return groups.map((group, index) =>
    index === groupIndex ? { ...group, itemIds: nextIds } : group
  )
}

export const buildScrollGroupEntries = (
  itemIds: string[],
  itemById: ReadonlyMap<string, GridItem>,
  columns: number,
  reservedEntries: PageAnchorEntry[] = []
): PageAnchorEntry[] => {
  const minimumColumns = itemIds.reduce((maximum, id) => {
    const item = itemById.get(id)
    return item ? Math.max(maximum, getGridItemSpan(item).cols) : maximum
  }, 1)
  const safeColumns = Math.max(minimumColumns, Math.floor(columns))
  const occupiedCells = new Set<number>()
  const reservedIds = new Set<string>()
  const entries: PageAnchorEntry[] = []

  reservedEntries.forEach(entry => {
    if (reservedIds.has(entry.id)) return
    reservedIds.add(entry.id)
    entries.push(entry)
    for (let rowOffset = 0; rowOffset < entry.span.rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < entry.span.cols; colOffset += 1) {
        occupiedCells.add((entry.row + rowOffset) * safeColumns + entry.col + colOffset)
      }
    }
  })

  itemIds.forEach(id => {
    if (reservedIds.has(id)) return
    const item = itemById.get(id)
    if (!item) return
    const rawSpan = getGridItemSpan(item)
    const span = {
      cols: Math.max(1, rawSpan.cols),
      rows: Math.max(1, rawSpan.rows),
    }
    let anchorIndex = 0

    while (true) {
      const row = Math.floor(anchorIndex / safeColumns)
      const col = anchorIndex % safeColumns
      if (col + span.cols > safeColumns) {
        anchorIndex += safeColumns - col
        continue
      }

      const footprint: number[] = []
      for (let rowOffset = 0; rowOffset < span.rows; rowOffset += 1) {
        for (let colOffset = 0; colOffset < span.cols; colOffset += 1) {
          footprint.push((row + rowOffset) * safeColumns + col + colOffset)
        }
      }
      if (footprint.every(cell => !occupiedCells.has(cell))) {
        footprint.forEach(cell => occupiedCells.add(cell))
        entries.push({
          id,
          item,
          globalIndex: anchorIndex,
          localIndex: anchorIndex,
          row,
          col,
          span,
        })
        break
      }
      anchorIndex += 1
    }
  })

  return entries.sort((a, b) => a.row - b.row || a.col - b.col)
}

export const isPointInScrollMergeZone = (
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  centerRatio = 0.6
) => {
  const halfWidth = (rect.width * centerRatio) / 2
  const halfHeight = (rect.height * centerRatio) / 2
  return (
    Math.abs(point.x - (rect.left + rect.width / 2)) <= halfWidth &&
    Math.abs(point.y - (rect.top + rect.height / 2)) <= halfHeight
  )
}

export type ScrollDropPosition = 'before' | 'after' | 'middle'

export const isPointInsideScrollDropTarget = (
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number }
) =>
  point.x >= rect.left &&
  point.x <= rect.left + rect.width &&
  point.y >= rect.top &&
  point.y <= rect.top + rect.height

export const isPointOutsideScrollFolderContent = isPointOutsideFolderContent

export const resolveScrollDropPosition = (
  point: { x: number; y: number },
  rect: { left: number; top: number; width: number; height: number },
  mergeAllowed: boolean
): ScrollDropPosition => {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  if (!mergeAllowed) return point.x >= centerX ? 'after' : 'before'

  const centerHalfWidth = rect.width / 4
  const centerHalfHeight = rect.height / 4
  if (point.x >= centerX + centerHalfWidth) return 'after'
  if (point.x < centerX - centerHalfWidth) return 'before'
  if (point.y >= centerY + centerHalfHeight) return 'after'
  if (point.y < centerY - centerHalfHeight) return 'before'
  return 'middle'
}

export const moveScrollItemRelative = (
  itemIds: string[],
  activeId: string,
  overId: string,
  position: Exclude<ScrollDropPosition, 'middle'>
): string[] => {
  if (activeId === overId) return itemIds
  const sourceIndex = itemIds.indexOf(activeId)
  if (sourceIndex < 0 || !itemIds.includes(overId)) return itemIds

  const remainingIds = itemIds.filter(id => id !== activeId)
  const targetIndex = remainingIds.indexOf(overId)
  if (targetIndex < 0) return itemIds
  const insertIndex = targetIndex + (position === 'after' ? 1 : 0)
  const nextIds = [...remainingIds]
  nextIds.splice(insertIndex, 0, activeId)
  return nextIds.every((id, index) => id === itemIds[index]) ? itemIds : nextIds
}

export const buildScrollGroupDragPreviewOrder = ({
  groupItemIds,
  workingOrder,
  draggingIds,
  availableIds,
}: {
  groupItemIds: string[]
  workingOrder: Array<string | null>
  draggingIds: string[]
  availableIds: ReadonlySet<string>
}): string[] => {
  const draggingIdSet = new Set(draggingIds)
  const allowedIds = new Set([...groupItemIds, ...draggingIdSet])
  const consumed = new Set<string>()
  let previewIds: string[] = []
  const append = (id: string | null) => {
    if (!id || consumed.has(id) || !allowedIds.has(id) || !availableIds.has(id)) return
    consumed.add(id)
    previewIds.push(id)
  }

  workingOrder.forEach(append)

  // The legacy slot preview can omit scroll-group items (notably the source
  // folder). Restore them beside their original neighbors instead of at the end.
  const groupIdSet = new Set(groupItemIds)
  const acceptedGroupIds = new Set(
    previewIds.filter(id => groupIdSet.has(id) && availableIds.has(id))
  )
  const missingBeforeAnchor = new Map<string, string[]>()
  let pendingMissingIds: string[] = []
  groupItemIds.forEach(id => {
    if (!availableIds.has(id)) return
    if (!acceptedGroupIds.has(id) && !draggingIdSet.has(id)) {
      pendingMissingIds.push(id)
      consumed.add(id)
      return
    }
    if (!acceptedGroupIds.has(id)) return
    if (pendingMissingIds.length > 0) {
      missingBeforeAnchor.set(id, pendingMissingIds)
      pendingMissingIds = []
    }
  })

  const restoredIds = previewIds.flatMap(id => [...(missingBeforeAnchor.get(id) ?? []), id])
  if (pendingMissingIds.length > 0) {
    let lastGroupAnchorIndex = -1
    restoredIds.forEach((id, index) => {
      if (acceptedGroupIds.has(id)) lastGroupAnchorIndex = index
    })
    restoredIds.splice(lastGroupAnchorIndex + 1, 0, ...pendingMissingIds)
  }
  previewIds = restoredIds
  draggingIds.forEach(append)
  return previewIds
}

export const replaceScrollPreviewItemsWithFolder = ({
  itemIds,
  sourceIds,
  targetId,
  folderId,
}: {
  itemIds: string[]
  sourceIds: string[]
  targetId: string
  folderId: string
}): string[] => {
  const sourceIdSet = new Set(sourceIds)
  const consumed = new Set<string>()
  const nextIds: string[] = []
  itemIds.forEach(id => {
    const replacementId = id === targetId ? folderId : id
    if (sourceIdSet.has(id) || consumed.has(replacementId)) return
    consumed.add(replacementId)
    nextIds.push(replacementId)
  })
  return nextIds
}

export const commitScrollFolderCreation = ({
  groups,
  previewItemIds,
  sourceIds,
  targetId,
  folderId,
}: {
  groups: ScrollGroupMeta[]
  previewItemIds: string[] | null | undefined
  sourceIds: string[]
  targetId: string
  folderId: string
}): ScrollGroupMeta[] => {
  const targetGroup = groups.find(group => group.itemIds.includes(targetId))
  if (!targetGroup) return groups
  const sourceIdSet = new Set(sourceIds)
  const replace = (itemIds: string[]) =>
    replaceScrollPreviewItemsWithFolder({ itemIds, sourceIds, targetId, folderId })
  const previewOrder = replace(previewItemIds ?? targetGroup.itemIds)
  const committedFallback = replace(targetGroup.itemIds)
  const targetItemIds = Array.from(new Set([...previewOrder, ...committedFallback]))

  return groups.map(group => ({
    ...group,
    itemIds:
      group.id === targetGroup.id
        ? targetItemIds
        : group.itemIds.filter(id => !sourceIdSet.has(id) && id !== folderId),
  }))
}

export const commitScrollGroupDragResult = ({
  groups,
  targetGroupId,
  previewItemIds,
  availableItemIds,
  draggingIds,
  replacementById = {},
}: {
  groups: ScrollGroupMeta[]
  targetGroupId: string
  previewItemIds: string[]
  availableItemIds: string[]
  draggingIds: string[]
  replacementById?: Record<string, string | null | undefined>
}): ScrollGroupMeta[] => {
  const targetGroupIndex = groups.findIndex(group => group.id === targetGroupId)
  if (targetGroupIndex < 0) return groups

  const availableIdSet = new Set(availableItemIds)
  const draggingIdSet = new Set(draggingIds)
  const normalizeIds = (itemIds: string[], excludeDragging: boolean): string[] => {
    const consumed = new Set<string>()
    const normalized: string[] = []
    itemIds.forEach(id => {
      if (excludeDragging && draggingIdSet.has(id)) return
      const replacementId = Object.prototype.hasOwnProperty.call(replacementById, id)
        ? replacementById[id]
        : id
      if (!replacementId || !availableIdSet.has(replacementId) || consumed.has(replacementId))
        return
      consumed.add(replacementId)
      normalized.push(replacementId)
    })
    return normalized
  }

  const normalizedGroups = groups.map((group, index) => ({
    ...group,
    itemIds: normalizeIds(group.itemIds, index !== targetGroupIndex),
  }))
  const representedIds = new Set(normalizedGroups.flatMap(group => group.itemIds))
  const unassignedIds = availableItemIds.filter(id => !representedIds.has(id))
  const desiredTargetIds = Array.from(
    new Set([
      ...normalizeIds(previewItemIds, false),
      ...unassignedIds,
      ...normalizedGroups[targetGroupIndex].itemIds,
    ])
  )
  normalizedGroups[targetGroupIndex] = {
    ...normalizedGroups[targetGroupIndex],
    itemIds: desiredTargetIds,
  }

  return JSON.stringify(normalizedGroups) === JSON.stringify(groups) ? groups : normalizedGroups
}

export const moveScrollGroupItem = (
  groups: ScrollGroupMeta[],
  itemId: string,
  targetGroupId: string
): ScrollGroupMeta[] => {
  const targetIndex = groups.findIndex(group => group.id === targetGroupId)
  if (targetIndex < 0) return groups
  const sourceIndex = groups.findIndex(group => group.itemIds.includes(itemId))
  if (sourceIndex === targetIndex) return groups

  return groups.map((group, index) => {
    const itemIds = group.itemIds.filter(id => id !== itemId)
    return index === targetIndex
      ? { ...group, itemIds: [...itemIds, itemId] }
      : { ...group, itemIds }
  })
}

export const createScrollGroup = (
  name: string,
  icon: ScrollGroupIcon,
  existingGroups: ScrollGroupMeta[]
): ScrollGroupMeta => {
  const usedIds = new Set(existingGroups.map(group => group.id))
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `scroll-group-${crypto.randomUUID()}`
      : `scroll-group-${Date.now()}-${existingGroups.length + 1}`
  return {
    id: createUniqueGroupId(randomId, existingGroups.length, usedIds),
    name,
    icon,
    itemIds: [],
  }
}

export const deleteScrollGroup = (
  groups: ScrollGroupMeta[],
  groupId: string
): ScrollGroupMeta[] => {
  if (groups.length <= 1) return groups
  const removedIndex = groups.findIndex(group => group.id === groupId)
  if (removedIndex < 0) return groups
  const targetIndex = removedIndex > 0 ? removedIndex - 1 : 1
  const removedItemIds = groups[removedIndex].itemIds
  return groups
    .filter(group => group.id !== groupId)
    .map(group =>
      group.id === groups[targetIndex].id
        ? { ...group, itemIds: [...group.itemIds, ...removedItemIds] }
        : group
    )
}
