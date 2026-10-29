import type {
  PersistedGridCoordinate,
  PersistedItem,
  PersistedLayout,
  PersistedPlacement,
  PersistedPlacementContainer,
} from '../model'
import { getFolderLayoutProfile, getFolderPlacement } from './folderLayout'

const getPersistedItemId = (item: PersistedItem): string => {
  if (item.type === 'icon') return item.key
  return `${item.type}:${item.id}`
}

const getPersistedItemSpan = (item: PersistedItem): { spanX: number; spanY: number } => {
  if (item.type === 'icon') return { spanX: 1, spanY: 1 }
  if (item.type === 'widget') {
    return {
      spanX: Math.max(1, Math.floor(item.spanX)),
      spanY: Math.max(1, Math.floor(item.spanY)),
    }
  }
  switch (item.size) {
    case '1x2':
      return { spanX: 1, spanY: 2 }
    case '2x1':
      return { spanX: 2, spanY: 1 }
    case '2x2':
      return { spanX: 2, spanY: 2 }
    default:
      return { spanX: 1, spanY: 1 }
  }
}

const comparePlacementOrder = (left: PersistedPlacement, right: PersistedPlacement): number => {
  if (left.rank !== right.rank) return left.rank - right.rank
  if (left.page !== right.page) return left.page - right.page
  if (left.row !== right.row) return left.row - right.row
  return left.col - right.col
}

const getWorkspaceMetrics = (
  layout: PersistedLayout,
  placements: PersistedPlacement[]
): { pageSize: number; columns: number } => {
  const workspace = placements.filter(placement => placement.container === 'workspace')
  const columns = Math.max(
    1,
    layout.columns ??
      workspace.reduce(
        (maximum, placement) => Math.max(maximum, placement.col + placement.spanX),
        1
      )
  )
  const rows = Math.max(
    1,
    workspace.reduce((maximum, placement) => Math.max(maximum, placement.row + placement.spanY), 1)
  )
  return {
    columns,
    pageSize: Math.max(1, layout.pageSize ?? columns * rows),
  }
}

const getPlacementAnchorIndex = (
  placement: PersistedPlacement,
  pageSize: number,
  columns: number
): number => pageSize * placement.page + columns * placement.row + placement.col

const getPlacementCells = (
  placement: PersistedPlacement,
  pageSize: number,
  columns: number
): PersistedGridCoordinate[] => {
  const cells: PersistedGridCoordinate[] = []
  for (let row = 0; row < placement.spanY; row += 1) {
    for (let col = 0; col < placement.spanX; col += 1) {
      const localIndex = (placement.row + row) * columns + placement.col + col
      if (localIndex >= pageSize) continue
      cells.push({
        page: placement.page,
        row: placement.row + row,
        col: placement.col + col,
      })
    }
  }
  return cells
}

const buildWorkspaceSlots = (
  layout: PersistedLayout,
  placements: PersistedPlacement[],
  pageSize: number,
  columns: number
): Array<string | null> => {
  const workspace = placements
    .filter(placement => placement.container === 'workspace')
    .sort(comparePlacementOrder)
  if (workspace.length === 0) return layout.slots ?? []

  const highestPage = workspace.reduce((maximum, placement) => Math.max(maximum, placement.page), 0)
  const slots: Array<string | null> = Array.from(
    { length: Math.max(layout.slots?.length ?? 0, (highestPage + 1) * pageSize) },
    () => null
  )
  workspace.forEach(placement => {
    const anchorIndex = getPlacementAnchorIndex(placement, pageSize, columns)
    if (anchorIndex < 0 || anchorIndex >= slots.length || slots[anchorIndex] !== null) return
    slots[anchorIndex] = placement.id
    getPlacementCells(placement, pageSize, columns).forEach(cell => {
      const index = cell.page * pageSize + cell.row * columns + cell.col
      if (index !== anchorIndex && index < slots.length) slots[index] = null
    })
  })
  return slots
}

const buildDockKeys = (
  layout: PersistedLayout,
  placements: PersistedPlacement[]
): Array<string | null> => {
  const dock = placements
    .filter(placement => placement.container === 'dock')
    .sort((left, right) => left.col - right.col || comparePlacementOrder(left, right))
  if (dock.length === 0) return layout.dockKeys
  const dockKeys: Array<string | null> = Array.from(
    { length: Math.max(layout.dockKeys.length, dock[dock.length - 1].col + 1) },
    () => null
  )
  dock.forEach(placement => {
    dockKeys[placement.col] = placement.id
  })
  return dockKeys
}

const orderFolderChildren = (
  layout: PersistedLayout,
  placements: PersistedPlacement[]
): PersistedItem[] => {
  const placementsByFolder = new Map<string, PersistedPlacement[]>()
  placements.forEach(placement => {
    if (!placement.container || typeof placement.container !== 'object') return
    const current = placementsByFolder.get(placement.container.folderId) ?? []
    current.push(placement)
    placementsByFolder.set(placement.container.folderId, current)
  })

  return layout.items.map(item => {
    if (item.type !== 'folder') return item
    const folderPlacements = placementsByFolder.get(`folder:${item.id}`)
    if (!folderPlacements || folderPlacements.length === 0) return item
    const orderedIds = folderPlacements.sort(comparePlacementOrder).map(placement => placement.id)
    const orderedSet = new Set(orderedIds)
    return {
      ...item,
      children: [...orderedIds, ...item.children.filter(childId => !orderedSet.has(childId))],
    }
  })
}

const buildWorkspaceCoordinates = (
  placements: PersistedPlacement[],
  pageSize: number,
  columns: number
): PersistedLayout['coordinates'] => {
  const coordinates = placements
    .filter(placement => placement.container === 'workspace')
    .sort(comparePlacementOrder)
    .map(placement => ({
      id: placement.id,
      cells: getPlacementCells(placement, pageSize, columns),
    }))
    .filter(entry => entry.cells.length > 0)
  return coordinates.length > 0 ? coordinates : undefined
}

/** Build the v10 canonical records from the legacy slots/items views. */
export const buildCanonicalPlacements = (layout: PersistedLayout): PersistedPlacement[] => {
  const placements: PersistedPlacement[] = []
  const placedIds = new Set<string>()
  const maximumSpan = layout.items.reduce(
    (maximum, item) => {
      const span = getPersistedItemSpan(item)
      return {
        cols: Math.max(maximum.cols, span.spanX),
        rows: Math.max(maximum.rows, span.spanY),
      }
    },
    { cols: 1, rows: 1 }
  )
  const safeColumns = Math.max(1, layout.columns ?? 1, maximumSpan.cols)
  const safePageSize = Math.max(
    1,
    layout.pageSize ?? 0,
    layout.slots?.length ?? 0,
    safeColumns * maximumSpan.rows
  )
  const itemById = new Map(layout.items.map(item => [getPersistedItemId(item), item]))
  const occupiedWorkspaceCells = new Set<string>()
  const addPlacement = (
    id: string,
    container: PersistedPlacementContainer,
    index: number,
    rank: number
  ): boolean => {
    if (placedIds.has(id)) return false
    const item = itemById.get(id)
    if (!item) return false
    const page = Math.floor(index / safePageSize)
    const localIndex = index - page * safePageSize
    const span = getPersistedItemSpan(item)
    const placement: PersistedPlacement = {
      id,
      container,
      page,
      row: Math.floor(localIndex / safeColumns),
      col: localIndex % safeColumns,
      ...span,
      rank,
    }
    if (container === 'workspace') {
      const cells = getPlacementCells(placement, safePageSize, safeColumns)
      const maxRows = Math.max(1, Math.ceil(safePageSize / safeColumns))
      if (
        placement.col + span.spanX > safeColumns ||
        placement.row + span.spanY > maxRows ||
        cells.length !== span.spanX * span.spanY ||
        cells.some(cell => occupiedWorkspaceCells.has(`${cell.page}:${cell.row}:${cell.col}`))
      ) {
        return false
      }
    }
    placements.push(placement)
    if (container === 'workspace') {
      getPlacementCells(placement, safePageSize, safeColumns).forEach(cell => {
        occupiedWorkspaceCells.add(`${cell.page}:${cell.row}:${cell.col}`)
      })
    }
    placedIds.add(id)
    return true
  }

  let workspaceRank = 0
  ;(layout.slots ?? []).forEach((id, index) => {
    if (typeof id !== 'string') return
    if (addPlacement(id, 'workspace', index, workspaceRank)) workspaceRank += 1
  })
  let dockRank = 0
  ;(layout.dockKeys ?? []).forEach((id, index) => {
    if (typeof id !== 'string') return
    if (placedIds.has(id)) return
    const item = itemById.get(id)
    if (!item) return
    const span = getPersistedItemSpan(item)
    placements.push({
      id,
      container: 'dock',
      page: 0,
      row: 0,
      col: index,
      ...span,
      rank: dockRank,
    })
    placedIds.add(id)
    dockRank += 1
  })

  const dockIds = new Set(
    (layout.dockKeys ?? []).filter((id): id is string => typeof id === 'string')
  )
  const appendStart = Math.max(0, layout.slots?.length ?? 0)
  let appendIndex = appendStart
  const folderProfile = getFolderLayoutProfile(layout.folderProfileId)
  layout.items.forEach(item => {
    const id = getPersistedItemId(item)
    if (placedIds.has(id) || dockIds.has(id)) return
    const span = getPersistedItemSpan(item)
    const maxRows = Math.max(1, Math.ceil(safePageSize / safeColumns))
    if (span.spanX > safeColumns || span.spanY > maxRows) return
    for (;;) {
      const localIndex = appendIndex % safePageSize
      const row = Math.floor(localIndex / safeColumns)
      const col = localIndex % safeColumns
      if (
        col + span.spanX <= safeColumns &&
        row + span.spanY <= maxRows &&
        (() => {
          const candidate: PersistedPlacement = {
            id,
            container: 'workspace',
            page: Math.floor(appendIndex / safePageSize),
            row,
            col,
            ...span,
            rank: workspaceRank,
          }
          const cells = getPlacementCells(candidate, safePageSize, safeColumns)
          return (
            cells.length === span.spanX * span.spanY &&
            cells.every(cell => !occupiedWorkspaceCells.has(`${cell.page}:${cell.row}:${cell.col}`))
          )
        })() &&
        addPlacement(id, 'workspace', appendIndex, workspaceRank)
      ) {
        workspaceRank += 1
        const page = Math.floor(appendIndex / safePageSize)
        const nextLocalIndex = (row + span.spanY - 1) * safeColumns + col + span.spanX
        appendIndex =
          nextLocalIndex >= safePageSize
            ? (page + 1) * safePageSize
            : page * safePageSize + nextLocalIndex
        break
      }
      appendIndex += 1
    }
  })

  layout.items.forEach(item => {
    if (item.type !== 'folder') return
    const folderId = `folder:${item.id}`
    item.children.forEach((childId, rank) => {
      const placement = getFolderPlacement(rank, folderProfile)
      placements.push({
        id: childId,
        container: { folderId },
        page: placement.page,
        row: placement.row,
        col: placement.col,
        spanX: 1,
        spanY: 1,
        rank,
      })
    })
  })

  return placements
}

/**
 * Materialize the migration views that the existing grid hooks consume from a
 * canonical placement list. Legacy payloads without placements are returned
 * unchanged, so v1-v9 remain readable during migration.
 */
export const materializeLayoutFromCanonicalPlacements = (
  layout: PersistedLayout
): PersistedLayout => {
  if (!layout.placements) return layout
  const { pageSize, columns } = getWorkspaceMetrics(layout, layout.placements)
  const workspacePlacements = layout.placements.filter(
    placement => placement.container === 'workspace'
  )
  return {
    ...layout,
    items: orderFolderChildren(layout, layout.placements),
    slots: buildWorkspaceSlots(layout, layout.placements, pageSize, columns),
    dockKeys: buildDockKeys(layout, layout.placements),
    pageSize: layout.pageSize ?? (workspacePlacements.length > 0 ? pageSize : layout.pageSize),
    columns: layout.columns ?? (workspacePlacements.length > 0 ? columns : layout.columns),
    coordinates:
      buildWorkspaceCoordinates(layout.placements, pageSize, columns) ?? layout.coordinates,
  }
}

/** Create one canonical snapshot while preserving v1-v9 migration input support. */
export const createCanonicalLayoutSnapshot = (layout: PersistedLayout): PersistedLayout => {
  const materializedLayout = materializeLayoutFromCanonicalPlacements(layout)
  return {
    ...materializedLayout,
    placements:
      layout.placements !== undefined
        ? layout.placements
        : buildCanonicalPlacements(materializedLayout),
  }
}
