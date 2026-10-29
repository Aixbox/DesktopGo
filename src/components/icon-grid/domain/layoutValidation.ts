import type { PersistedItem, PersistedLayout, PersistedPlacement, ScrollGroupMeta } from '../model'

export type LayoutValidationSeverity = 'error' | 'warning'

export interface LayoutValidationIssue {
  path: string
  message: string
  severity: LayoutValidationSeverity
}

export interface LayoutValidationResult {
  valid: boolean
  issues: LayoutValidationIssue[]
}

const issue = (
  path: string,
  message: string,
  severity: LayoutValidationSeverity = 'error'
): LayoutValidationIssue => ({ path, message, severity })

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const itemId = (item: PersistedItem): string =>
  item.type === 'icon' ? item.key : `folder:${item.id}`

const isPersistedItem = (value: unknown): value is PersistedItem => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown }
  return candidate.type === 'icon' || candidate.type === 'folder'
}

const isFolderSize = (value: unknown): boolean =>
  value === undefined || value === '1x1' || value === '1x2' || value === '2x1' || value === '2x2'

const validateItemShape = (item: PersistedItem, index: number): LayoutValidationIssue[] => {
  if (!item || typeof item !== 'object') {
    return [issue(`items[${index}]`, '项目必须是对象')]
  }
  if (item.type === 'icon') {
    return isNonEmptyString(item.key) ? [] : [issue(`items[${index}].key`, '图标 key 不能为空')]
  }
  if (item.type !== 'folder') {
    return [issue(`items[${index}].type`, '项目 type 必须是 icon 或 folder')]
  }
  const issues: LayoutValidationIssue[] = []
  if (!isNonEmptyString(item.id)) issues.push(issue(`items[${index}].id`, '文件夹 id 不能为空'))
  if (!isNonEmptyString(item.name)) issues.push(issue(`items[${index}].name`, '文件夹名称不能为空'))
  if (!isFolderSize(item.size)) issues.push(issue(`items[${index}].size`, '文件夹 size 无效'))
  if (!Array.isArray(item.children) || item.children.some(child => !isNonEmptyString(child))) {
    issues.push(issue(`items[${index}].children`, '文件夹 children 必须是非空字符串数组'))
  }
  return issues
}

const collectReferenceIssues = (layout: PersistedLayout): LayoutValidationIssue[] => {
  const issues: LayoutValidationIssue[] = []
  const topLevelIds = new Set(layout.items.filter(isPersistedItem).map(item => itemId(item)))
  const seenTopLevelIds = new Set<string>()
  const iconIds = new Set<string>()
  const folderChildOwners = new Map<string, string>()

  layout.items.forEach((item, index) => {
    if (!isPersistedItem(item)) return
    const id = itemId(item)
    if (seenTopLevelIds.has(id)) issues.push(issue(`items[${index}]`, `重复项目 id: ${id}`))
    seenTopLevelIds.add(id)
    if (item.type === 'icon' || !Array.isArray(item.children)) return
    item.children.forEach((child, childIndex) => {
      if (iconIds.has(child)) {
        issues.push(issue(`items[${index}].children[${childIndex}]`, `重复文件夹成员: ${child}`))
        return
      }
      iconIds.add(child)
      if (topLevelIds.has(child)) {
        issues.push(
          issue(`items[${index}].children[${childIndex}]`, `成员同时作为顶层项目引用: ${child}`)
        )
      }
      const owner = folderChildOwners.get(child)
      if (owner) {
        issues.push(issue(`items[${index}].children[${childIndex}]`, `图标已属于文件夹 ${owner}`))
      } else {
        folderChildOwners.set(child, item.id)
      }
    })
  })

  const slotIds = new Set<string>()
  layout.slots?.forEach((id, index) => {
    if (id === null) return
    if (id === '__drag_hole__')
      issues.push(issue(`slots[${index}]`, '持久化布局不能保存拖动占位符'))
    if (slotIds.has(id)) issues.push(issue(`slots[${index}]`, `slots 中重复引用 ${id}`))
    slotIds.add(id)
    if (!topLevelIds.has(id)) issues.push(issue(`slots[${index}]`, `未知项目引用 ${id}`, 'warning'))
  })

  const dockIds = new Set<string>()
  layout.dockKeys.forEach((id, index) => {
    if (id === null) return
    if (dockIds.has(id)) issues.push(issue(`dockKeys[${index}]`, `dockKeys 中重复引用 ${id}`))
    if (slotIds.has(id))
      issues.push(issue(`dockKeys[${index}]`, `项目同时存在于 workspace 和 Dock: ${id}`))
    dockIds.add(id)
    if (!topLevelIds.has(id))
      issues.push(issue(`dockKeys[${index}]`, `未知项目引用 ${id}`, 'warning'))
  })

  const coordinateIds = new Set<string>()
  const coordinateCells = new Set<string>()
  layout.coordinates?.forEach((entry, index) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      !isNonEmptyString(entry.id) ||
      !Array.isArray(entry.cells)
    ) {
      issues.push(issue(`coordinates[${index}]`, '坐标条目必须包含 id 和 cells 数组'))
      return
    }
    if (coordinateIds.has(entry.id)) {
      issues.push(issue(`coordinates[${index}].id`, `重复坐标项目 ${entry.id}`))
    }
    coordinateIds.add(entry.id)
    if (!topLevelIds.has(entry.id)) {
      issues.push(issue(`coordinates[${index}].id`, `未知坐标项目 ${entry.id}`, 'warning'))
    }
    if (entry.cells.length === 0)
      issues.push(issue(`coordinates[${index}].cells`, '坐标 cells 不能为空'))
    entry.cells.forEach((cell, cellIndex) => {
      if (
        !cell ||
        typeof cell !== 'object' ||
        !Number.isInteger(cell.page) ||
        !Number.isInteger(cell.row) ||
        !Number.isInteger(cell.col) ||
        cell.page < 0 ||
        cell.row < 0 ||
        cell.col < 0
      ) {
        issues.push(issue(`coordinates[${index}].cells[${cellIndex}]`, '坐标单元格无效'))
        return
      }
      const cellKey = `${cell.page}:${cell.row}:${cell.col}`
      if (coordinateCells.has(cellKey)) {
        issues.push(
          issue(`coordinates[${index}].cells[${cellIndex}]`, `坐标单元格重复引用 ${cellKey}`)
        )
      }
      coordinateCells.add(cellKey)
      if (layout.columns && cell.col >= layout.columns) {
        issues.push(issue(`coordinates[${index}].cells[${cellIndex}].col`, '坐标列超出 columns'))
      }
      if (layout.pageSize && layout.columns) {
        const rows = Math.ceil(layout.pageSize / layout.columns)
        if (cell.row >= rows) {
          issues.push(issue(`coordinates[${index}].cells[${cellIndex}].row`, '坐标行超出 pageSize'))
        }
      }
    })
  })

  validateScrollGroups(layout.scrollGroups, topLevelIds, issues)
  return issues
}

const validateScrollGroups = (
  groups: ScrollGroupMeta[] | undefined,
  knownIds: Set<string>,
  issues: LayoutValidationIssue[]
) => {
  if (!groups) return
  const groupIds = new Set<string>()
  const memberOwners = new Map<string, string>()
  groups.forEach((group, index) => {
    if (!group || typeof group !== 'object') {
      issues.push(issue(`scrollGroups[${index}]`, '分组必须是对象'))
      return
    }
    if (!isNonEmptyString(group.id) || !isNonEmptyString(group.name)) {
      issues.push(issue(`scrollGroups[${index}]`, '分组 id/name 不能为空'))
    }
    if (!Array.isArray(group.itemIds)) {
      issues.push(issue(`scrollGroups[${index}].itemIds`, '分组成员必须是数组'))
      return
    }
    if (groupIds.has(group.id))
      issues.push(issue(`scrollGroups[${index}].id`, `重复分组 id: ${group.id}`))
    groupIds.add(group.id)
    const memberIds = new Set<string>()
    group.itemIds.forEach((id, memberIndex) => {
      if (!isNonEmptyString(id)) {
        issues.push(issue(`scrollGroups[${index}].itemIds[${memberIndex}]`, '分组成员 id 不能为空'))
        return
      }
      if (memberIds.has(id)) {
        issues.push(issue(`scrollGroups[${index}].itemIds[${memberIndex}]`, `分组内重复引用 ${id}`))
        return
      }
      memberIds.add(id)
      if (!knownIds.has(id)) {
        issues.push(
          issue(`scrollGroups[${index}].itemIds[${memberIndex}]`, `未知分组成员 ${id}`, 'warning')
        )
      }
      const owner = memberOwners.get(id)
      if (owner && owner !== group.id) {
        issues.push(
          issue(`scrollGroups[${index}].itemIds[${memberIndex}]`, `成员已属于分组 ${owner}`)
        )
      } else {
        memberOwners.set(id, group.id)
      }
    })
  })
}

const validatePlacements = (
  placements: PersistedPlacement[] | undefined,
  layout: PersistedLayout,
  topLevelIds: Set<string>,
  issues: LayoutValidationIssue[]
) => {
  if (!placements) return
  const placementIds = new Set<string>()
  const folderIds = new Set(
    layout.items
      .filter(item => isPersistedItem(item) && item.type === 'folder')
      .map(item => `folder:${item.id}`)
  )
  const folderChildren = new Map(
    layout.items
      .filter(item => isPersistedItem(item) && item.type === 'folder')
      .map(
        item =>
          [`folder:${item.id}`, new Set(Array.isArray(item.children) ? item.children : [])] as const
      )
  )
  const placedTopLevelIds = new Set<string>()
  const placedFolderChildIds = new Set<string>()
  const occupiedCellsByContainer = new Map<string, Set<string>>()
  const rankByContainer = new Map<string, Set<number>>()
  const pageByContainer = new Map<string, Map<number, Set<number>>>()
  const placementKey = (container: PersistedPlacement['container']): string =>
    typeof container === 'string' ? container : `folder:${container.folderId}`
  const registerRank = (container: string, rank: number, index: number) => {
    const ranks = rankByContainer.get(container) ?? new Set<number>()
    if (ranks.has(rank)) {
      issues.push(issue(`placements[${index}].rank`, `容器 ${container} 内 rank 重复: ${rank}`))
    }
    ranks.add(rank)
    rankByContainer.set(container, ranks)
  }
  const registerPage = (container: string, page: number, rank: number) => {
    const pages = pageByContainer.get(container) ?? new Map<number, Set<number>>()
    const ranks = pages.get(page) ?? new Set<number>()
    ranks.add(rank)
    pages.set(page, ranks)
    pageByContainer.set(container, pages)
  }
  placements.forEach((placement, index) => {
    if (!placement || typeof placement !== 'object') {
      issues.push(issue(`placements[${index}]`, 'placement 必须是对象'))
      return
    }
    if (!isNonEmptyString(placement.id)) {
      issues.push(issue(`placements[${index}].id`, 'placement id 不能为空'))
    }
    if (placementIds.has(placement.id)) {
      issues.push(issue(`placements[${index}].id`, `重复 placement id: ${placement.id}`))
    }
    placementIds.add(placement.id)
    if (
      !Number.isInteger(placement.page) ||
      placement.page < 0 ||
      !Number.isInteger(placement.row) ||
      placement.row < 0 ||
      !Number.isInteger(placement.col) ||
      placement.col < 0 ||
      !isPositiveInteger(placement.spanX) ||
      !isPositiveInteger(placement.spanY) ||
      !Number.isInteger(placement.rank) ||
      placement.rank < 0
    ) {
      issues.push(issue(`placements[${index}]`, 'placement 几何或 rank 无效'))
    }
    const container = placement.container
    if (container === 'workspace' || container === 'dock') {
      if (placedTopLevelIds.has(placement.id)) {
        issues.push(issue(`placements[${index}].id`, `顶层 placement ${placement.id} 被重复放置`))
      }
      placedTopLevelIds.add(placement.id)
      if (!topLevelIds.has(placement.id)) {
        issues.push(
          issue(`placements[${index}].id`, `未知顶层 placement ${placement.id}`, 'warning')
        )
      }
      if (layout.columns && placement.col + placement.spanX > layout.columns) {
        issues.push(issue(`placements[${index}].col`, 'placement 横向跨度超出 columns'))
      }
      if (container === 'dock' && placement.spanY !== 1) {
        issues.push(issue(`placements[${index}].spanY`, 'Dock placement 必须保持单行'))
      }
      if (container === 'workspace' && layout.pageSize && layout.columns) {
        const rows = Math.ceil(layout.pageSize / layout.columns)
        if (placement.row + placement.spanY > rows) {
          issues.push(issue(`placements[${index}].row`, 'placement 纵向跨度超出 pageSize'))
        }
      }
      const key = placementKey(container)
      registerRank(key, placement.rank, index)
      registerPage(key, placement.page, placement.rank)
      if (container === 'workspace') {
        const occupied = occupiedCellsByContainer.get(key) ?? new Set<string>()
        for (let rowOffset = 0; rowOffset < placement.spanY; rowOffset += 1) {
          for (let colOffset = 0; colOffset < placement.spanX; colOffset += 1) {
            const cellKey = `${placement.page}:${placement.row + rowOffset}:${placement.col + colOffset}`
            if (occupied.has(cellKey)) {
              issues.push(issue(`placements[${index}]`, `workspace footprint 与 ${cellKey} 重叠`))
            }
            occupied.add(cellKey)
          }
        }
        occupiedCellsByContainer.set(key, occupied)
      }
    } else if (
      !container ||
      typeof container !== 'object' ||
      !isNonEmptyString(container.folderId) ||
      !folderIds.has(container.folderId)
    ) {
      issues.push(issue(`placements[${index}].container`, 'placement container 无效'))
    } else {
      const expectedChildren = folderChildren.get(container.folderId as `folder:${string}`)
      if (!expectedChildren) {
        issues.push(issue(`placements[${index}].container`, 'placement folder 不存在'))
      } else if (!expectedChildren.has(placement.id)) {
        issues.push(
          issue(`placements[${index}].id`, `placement 不属于 folder ${container.folderId}`)
        )
      }
      if (placedFolderChildIds.has(placement.id)) {
        issues.push(issue(`placements[${index}].id`, `folder child ${placement.id} 被重复放置`))
      }
      placedFolderChildIds.add(placement.id)
      if (placement.spanX !== 1 || placement.spanY !== 1) {
        issues.push(issue(`placements[${index}]`, 'folder child 当前只支持 1×1 span'))
      }
      const key = placementKey(container)
      registerRank(key, placement.rank, index)
      registerPage(key, placement.page, placement.rank)
      const occupied = occupiedCellsByContainer.get(key) ?? new Set<string>()
      const cellKey = `${placement.page}:${placement.row}:${placement.col}`
      if (occupied.has(cellKey)) {
        issues.push(issue(`placements[${index}]`, `folder footprint 与 ${cellKey} 重叠`))
      }
      occupied.add(cellKey)
      occupiedCellsByContainer.set(key, occupied)
    }
  })

  rankByContainer.forEach((ranks, container) => {
    const orderedRanks = [...ranks].sort((left, right) => left - right)
    orderedRanks.forEach((rank, index) => {
      if (rank !== index) {
        issues.push(issue(`placements.${container}.rank`, '容器内 rank 必须从 0 连续递增'))
        return
      }
    })
  })
  pageByContainer.forEach((pages, container) => {
    const pageRanks = [...pages.entries()].sort(([left], [right]) => left - right)
    pageRanks.forEach(([page], index) => {
      if (page !== index) {
        issues.push(issue(`placements.${container}.page`, '容器内 page 必须从 0 连续递增'))
      }
    })
  })

  topLevelIds.forEach(id => {
    if (!placedTopLevelIds.has(id)) {
      issues.push(issue('placements', `顶层项目缺少 canonical placement: ${id}`))
    }
  })
  folderChildren.forEach((children, folderId) => {
    children.forEach(id => {
      if (!placedFolderChildIds.has(id)) {
        issues.push(issue('placements', `folder ${folderId} 缺少 child placement: ${id}`))
      }
    })
  })
}

export const validatePersistedLayout = (layout: PersistedLayout): LayoutValidationResult => {
  const issues: LayoutValidationIssue[] = []
  if (!Array.isArray(layout.items)) issues.push(issue('items', 'items 必须是数组'))
  if (!Array.isArray(layout.dockKeys)) issues.push(issue('dockKeys', 'dockKeys 必须是数组'))
  if (layout.slots !== null && !Array.isArray(layout.slots)) {
    issues.push(issue('slots', 'slots 必须是数组或 null'))
  }
  if (layout.pageSize !== undefined && !isPositiveInteger(layout.pageSize)) {
    issues.push(issue('pageSize', 'pageSize 必须是正整数'))
  }
  if (layout.columns !== undefined && !isPositiveInteger(layout.columns)) {
    issues.push(issue('columns', 'columns 必须是正整数'))
  }
  if (
    layout.revision !== undefined &&
    (!Number.isInteger(layout.revision) || layout.revision < 0)
  ) {
    issues.push(issue('revision', 'revision 必须是非负整数'))
  }
  if (layout.checksum !== undefined && !/^[0-9a-f]{8}$/i.test(layout.checksum)) {
    issues.push(issue('checksum', 'checksum 必须是 8 位十六进制字符串'))
  }
  if (layout.geometryKey !== undefined && !isNonEmptyString(layout.geometryKey)) {
    issues.push(issue('geometryKey', 'geometryKey 必须是非空字符串'))
  }
  if (layout.coordinates !== undefined && !Array.isArray(layout.coordinates)) {
    issues.push(issue('coordinates', 'coordinates 必须是数组'))
  }
  if (layout.scrollGroups !== undefined && !Array.isArray(layout.scrollGroups)) {
    issues.push(issue('scrollGroups', 'scrollGroups 必须是数组'))
  }
  if (layout.placements !== undefined && !Array.isArray(layout.placements)) {
    issues.push(issue('placements', 'placements 必须是数组'))
  }
  if (Array.isArray(layout.dockKeys)) {
    layout.dockKeys.forEach((id, index) => {
      if (id !== null && !isNonEmptyString(id)) {
        issues.push(issue(`dockKeys[${index}]`, 'Dock 项目引用必须是字符串或 null'))
      }
    })
  }
  if (Array.isArray(layout.slots)) {
    layout.slots.forEach((id, index) => {
      if (id !== null && !isNonEmptyString(id)) {
        issues.push(issue(`slots[${index}]`, 'slot 项目引用必须是字符串或 null'))
      }
    })
  }
  if (Array.isArray(layout.items)) {
    layout.items.forEach((item, index) => issues.push(...validateItemShape(item, index)))
    issues.push(...collectReferenceIssues(layout))
    const topLevelIds = new Set(layout.items.filter(isPersistedItem).map(item => itemId(item)))
    validatePlacements(layout.placements, layout, topLevelIds, issues)
  }
  return {
    valid: issues.every(current => current.severity !== 'error'),
    issues,
  }
}

export const formatLayoutValidationIssues = (issues: LayoutValidationIssue[]): string =>
  issues.map(current => `${current.path}: ${current.message}`).join('; ')
