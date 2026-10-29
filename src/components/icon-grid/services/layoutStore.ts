import { invoke } from '@tauri-apps/api/core'
import { translate } from '../../../lib/i18n'
import { normalizeDockKeys } from '../domain/dock'
import { buildPersistedItemCoordinates } from '../domain/topLevelLayout'
import { formatLayoutValidationIssues, validatePersistedLayout } from '../domain/layoutValidation'
import {
  createCanonicalLayoutSnapshot,
  materializeLayoutFromCanonicalPlacements,
} from '../domain/canonicalLayout'
import type {
  GridItem,
  IconItem,
  WidgetItem,
  PersistedGridCoordinate,
  PersistedItem,
  PersistedItemCoordinates,
  PersistedLayout,
  FolderLayoutProfileId,
  PersistedPlacement,
  PersistedPlacementContainer,
  ScrollGroupIcon,
  ScrollGroupMeta,
} from '../model'
import { makeFolderId, SCROLL_GROUP_ICONS } from '../model'
import type { DesktopIcon } from '../../../types'
import { buildIconSelectionKey } from '../../../lib/iconKey'
import { recordAutoLayoutSnapshot } from '../../layout-library/layoutLibrary'

export const LAYOUT_KEY = 'desktopgo.launchpad.layout.v1'
export const SCROLL_LAYOUT_KEY = 'desktopgo.launchpad.layout.scroll.v1'
export const LAUNCHPAD_LAYOUT_RESET_EVENT = 'launchpad:layout-reset'

export interface LaunchpadLayoutResetPayload {
  placeNewIcons?: boolean
}

export type LaunchpadLayoutScope = 'paged' | 'scroll'

export interface LayoutHydrationDiagnostic {
  scope: LaunchpadLayoutScope
  key: string
  rawPayload: string | null
  error: string | null
  lastValidRevision: number | null
}

export interface LayoutWriteDiagnostic {
  scope: LaunchpadLayoutScope
  key: string
  payload: string
  attempts: number
  error: string
}

const getLayoutKey = (scope: LaunchpadLayoutScope) =>
  scope === 'scroll' ? SCROLL_LAYOUT_KEY : LAYOUT_KEY

const hydrationDiagnosticsByKey = new Map<string, LayoutHydrationDiagnostic>()
const writeDiagnosticsByKey = new Map<string, LayoutWriteDiagnostic>()

export const getLayoutHydrationDiagnostic = (
  scope: LaunchpadLayoutScope = 'paged'
): LayoutHydrationDiagnostic | null => {
  const diagnostic = hydrationDiagnosticsByKey.get(getLayoutKey(scope))
  return diagnostic ? { ...diagnostic } : null
}

export const getLayoutWriteDiagnostic = (
  scope: LaunchpadLayoutScope = 'paged'
): LayoutWriteDiagnostic | null => {
  const diagnostic = writeDiagnosticsByKey.get(getLayoutKey(scope))
  return diagnostic ? { ...diagnostic } : null
}

export const serializeItems = (items: GridItem[]): PersistedItem[] =>
  items.map<PersistedItem>(item =>
    item.kind === 'icon'
      ? { type: 'icon', key: item.key }
      : item.kind === 'folder'
        ? {
          type: 'folder',
          id: item.id,
          name: item.name,
          size: item.size,
          children: item.children.map(child => child.key),
          }
        : {
            type: 'widget',
            id: item.id,
            provider: item.provider,
            label: item.label,
            spanX: item.spanX,
            spanY: item.spanY,
            minSpanX: item.minSpanX,
            minSpanY: item.minSpanY,
            maxSpanX: item.maxSpanX,
            maxSpanY: item.maxSpanY,
            ...(item.appWidgetId === undefined ? {} : { appWidgetId: item.appWidgetId }),
          }
  )

const normalizePersistedGridCoordinate = (value: unknown): PersistedGridCoordinate | null => {
  if (!value || typeof value !== 'object') return null

  const { page, row, col } = value as {
    page?: unknown
    row?: unknown
    col?: unknown
  }
  const safePage = typeof page === 'number' ? page : Number.NaN
  const safeRow = typeof row === 'number' ? row : Number.NaN
  const safeCol = typeof col === 'number' ? col : Number.NaN

  if (
    !Number.isInteger(safePage) ||
    !Number.isInteger(safeRow) ||
    !Number.isInteger(safeCol) ||
    safePage < 0 ||
    safeRow < 0 ||
    safeCol < 0
  ) {
    return null
  }

  return { page: safePage, row: safeRow, col: safeCol }
}

const normalizePersistedItemCoordinates = (
  value: unknown
): PersistedItemCoordinates[] | undefined => {
  if (!Array.isArray(value)) return undefined

  const result: PersistedItemCoordinates[] = []
  value.forEach(entry => {
    if (!entry || typeof entry !== 'object') return

    const { id, cells } = entry as { id?: unknown; cells?: unknown }
    if (typeof id !== 'string' || !Array.isArray(cells)) return

    const normalizedCells = cells
      .map(cell => normalizePersistedGridCoordinate(cell))
      .filter((cell): cell is PersistedGridCoordinate => cell !== null)

    if (normalizedCells.length === 0) return

    result.push({
      id,
      cells: normalizedCells,
    })
  })

  return result.length > 0 ? result : undefined
}

const normalizePersistedReferences = (value: unknown): Array<string | null> | null => {
  if (!Array.isArray(value)) return null
  if (value.some(entry => entry !== null && typeof entry !== 'string')) return null
  return value.map(entry => (typeof entry === 'string' ? entry : null))
}

const normalizePersistedPlacements = (value: unknown): PersistedPlacement[] | undefined | null => {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) return null
  const result: PersistedPlacement[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null
    const candidate = entry as {
      id?: unknown
      container?: unknown
      page?: unknown
      row?: unknown
      col?: unknown
      spanX?: unknown
      spanY?: unknown
      rank?: unknown
    }
    const page = candidate.page
    const row = candidate.row
    const col = candidate.col
    const spanX = candidate.spanX
    const spanY = candidate.spanY
    const rank = candidate.rank
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof page !== 'number' ||
      !Number.isInteger(page) ||
      page < 0 ||
      typeof row !== 'number' ||
      !Number.isInteger(row) ||
      row < 0 ||
      typeof col !== 'number' ||
      !Number.isInteger(col) ||
      col < 0 ||
      typeof spanX !== 'number' ||
      !Number.isInteger(spanX) ||
      spanX <= 0 ||
      typeof spanY !== 'number' ||
      !Number.isInteger(spanY) ||
      spanY <= 0 ||
      typeof rank !== 'number' ||
      !Number.isInteger(rank) ||
      rank < 0
    ) {
      return null
    }
    const container = candidate.container
    const validContainer =
      container === 'workspace' ||
      container === 'dock' ||
      (container &&
        typeof container === 'object' &&
        typeof (container as { folderId?: unknown }).folderId === 'string' &&
        (container as { folderId: string }).folderId.trim().length > 0)
    if (!validContainer) return null
    result.push({
      id: candidate.id,
      container: container as PersistedPlacementContainer,
      page,
      row,
      col,
      spanX,
      spanY,
      rank,
    })
  }
  return result
}

const hasValidRawCoordinates = (value: unknown): boolean => {
  if (value === undefined || value === null) return true
  if (!Array.isArray(value)) return false
  return value.every(entry => {
    if (!entry || typeof entry !== 'object') return false
    const candidate = entry as { id?: unknown; cells?: unknown }
    if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) return false
    if (!Array.isArray(candidate.cells) || candidate.cells.length === 0) return false
    return candidate.cells.every(cell => {
      if (!cell || typeof cell !== 'object') return false
      const coordinate = cell as { page?: unknown; row?: unknown; col?: unknown }
      return (
        typeof coordinate.page === 'number' &&
        Number.isInteger(coordinate.page) &&
        coordinate.page >= 0 &&
        typeof coordinate.row === 'number' &&
        Number.isInteger(coordinate.row) &&
        coordinate.row >= 0 &&
        typeof coordinate.col === 'number' &&
        Number.isInteger(coordinate.col) &&
        coordinate.col >= 0
      )
    })
  })
}

const hasValidRawScrollGroups = (value: unknown, allowLegacyIds = false): boolean => {
  if (value === undefined || value === null) return true
  if (!Array.isArray(value)) return false
  const validIcons = new Set<string>(SCROLL_GROUP_ICONS)
  return value.every(entry => {
    if (!entry || typeof entry !== 'object') return false
    const group = entry as { id?: unknown; name?: unknown; icon?: unknown; itemIds?: unknown }
    return (
      (allowLegacyIds || (typeof group.id === 'string' && group.id.trim().length > 0)) &&
      typeof group.name === 'string' &&
      group.name.trim().length > 0 &&
      typeof group.icon === 'string' &&
      validIcons.has(group.icon) &&
      Array.isArray(group.itemIds) &&
      group.itemIds.every(itemId => typeof itemId === 'string' && itemId.trim().length > 0)
    )
  })
}

type PersistedLayoutPayload =
  | { version: 1; items: PersistedItem[] }
  | { version: 2; items: PersistedItem[]; slots: unknown[] }
  | { version: 3; items: PersistedItem[]; slots: unknown[]; dockKeys: unknown[] }
  | { version: 4; items: PersistedItem[]; slots: unknown[]; dockKeys: unknown[] }
  | {
      version: 5
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
    }
  | {
      version: 6
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
    }
  | {
      version: 7
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
    }
  | {
      version: 8
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
      scrollGroups?: unknown
    }
  | {
      version: 9
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
      scrollGroups?: unknown
    }
  | {
      version: 10
      items: PersistedItem[]
      slots: unknown[]
      dockKeys: unknown[]
      pageSize?: number
      columns?: number
      coordinates?: unknown
      geometryKey?: unknown
      scrollGroups?: unknown
      revision?: unknown
      checksum?: unknown
      placements?: unknown
      folderProfileId?: unknown
    }

const isFolderLayoutProfileId = (value: unknown): value is FolderLayoutProfileId =>
  value === 'standard' || value === 'simple' || value === 'big'

const hashLayoutString = (value: string): string => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const buildIntegrityPayload = (layout: PersistedLayout) => ({
  version: 10,
  items: layout.items,
  slots: layout.slots ?? [],
  dockKeys: layout.dockKeys ?? [],
  pageSize: layout.pageSize,
  columns: layout.columns,
  coordinates: layout.coordinates,
  geometryKey: layout.geometryKey,
  scrollGroups: layout.scrollGroups,
  placements: layout.placements,
  folderProfileId: layout.folderProfileId,
})

export const serializeLayoutForIntegrity = (layout: PersistedLayout): string =>
  JSON.stringify(buildIntegrityPayload(layout))

export const calculateLayoutChecksum = (layout: PersistedLayout): string =>
  hashLayoutString(serializeLayoutForIntegrity(layout))

export const parsePersistedLayout = (raw: string): PersistedLayout | null => {
  const parsed = JSON.parse(raw) as unknown
  if (!parsed || typeof parsed !== 'object') return null

  const payload = parsed as PersistedLayoutPayload
  if (!Array.isArray(payload.items)) return null
  if (payload.version === 1) return { items: payload.items, slots: null, dockKeys: [] }
  if (payload.version === 2 && Array.isArray(payload.slots)) {
    const slots = normalizePersistedReferences(payload.slots)
    if (!slots) return null
    return {
      items: payload.items,
      slots,
      dockKeys: [],
    }
  }
  if (
    (payload.version !== 3 &&
      payload.version !== 4 &&
      payload.version !== 5 &&
      payload.version !== 6 &&
      payload.version !== 7 &&
      payload.version !== 8 &&
      payload.version !== 9 &&
      payload.version !== 10) ||
    !Array.isArray(payload.slots) ||
    !Array.isArray(payload.dockKeys)
  ) {
    return null
  }
  const slots = normalizePersistedReferences(payload.slots)
  const dockKeys = normalizePersistedReferences(payload.dockKeys)
  if (!slots || !dockKeys) return null
  const result: PersistedLayout = { items: payload.items, slots, dockKeys }
  if (payload.version === 5) {
    if (typeof payload.pageSize === 'number' && payload.pageSize > 0)
      result.pageSize = payload.pageSize
    if (typeof payload.columns === 'number' && payload.columns > 0) result.columns = payload.columns
  }
  if (payload.version === 6) {
    if (typeof payload.pageSize === 'number' && payload.pageSize > 0)
      result.pageSize = payload.pageSize
    if (typeof payload.columns === 'number' && payload.columns > 0) result.columns = payload.columns
    result.coordinates = normalizePersistedItemCoordinates(payload.coordinates)
  }
  if (
    payload.version === 7 ||
    payload.version === 8 ||
    payload.version === 9 ||
    payload.version === 10
  ) {
    if (typeof payload.pageSize === 'number' && payload.pageSize > 0)
      result.pageSize = payload.pageSize
    if (typeof payload.columns === 'number' && payload.columns > 0) result.columns = payload.columns
    result.coordinates = normalizePersistedItemCoordinates(payload.coordinates)
    if (typeof payload.geometryKey === 'string' && payload.geometryKey.length > 0) {
      result.geometryKey = payload.geometryKey
    }
    if (
      (payload.version === 8 || payload.version === 9 || payload.version === 10) &&
      Array.isArray(payload.scrollGroups)
    ) {
      const validIcons = new Set<ScrollGroupIcon>(SCROLL_GROUP_ICONS)
      result.scrollGroups = payload.scrollGroups.flatMap((entry, index) => {
        if (!entry || typeof entry !== 'object') return []
        const name = 'name' in entry && typeof entry.name === 'string' ? entry.name.trim() : ''
        const icon = 'icon' in entry && typeof entry.icon === 'string' ? entry.icon : ''
        if (!name || !validIcons.has(icon as ScrollGroupIcon)) return []
        const id = 'id' in entry && typeof entry.id === 'string' ? entry.id.trim() : ''
        const itemIds =
          'itemIds' in entry && Array.isArray(entry.itemIds)
            ? entry.itemIds.filter(
                (itemId: unknown): itemId is string => typeof itemId === 'string'
              )
            : []
        return [
          {
            id: id || `scroll-group-migrated-${index + 1}`,
            name,
            icon: icon as ScrollGroupIcon,
            itemIds,
          } satisfies ScrollGroupMeta,
        ]
      })
      result.scrollGroupItemsExplicit = payload.version === 9 || payload.version === 10
    }
  }
  if (payload.version === 10) {
    result.revision =
      typeof payload.revision === 'number' && Number.isInteger(payload.revision)
        ? payload.revision
        : -1
    result.checksum = typeof payload.checksum === 'string' ? payload.checksum : ''
    const placements = normalizePersistedPlacements(payload.placements)
    if (placements === null) return null
    result.placements = placements
    if (payload.folderProfileId !== undefined) {
      if (!isFolderLayoutProfileId(payload.folderProfileId)) return null
      result.folderProfileId = payload.folderProfileId
    }
  }
  return result
}

export const parsePersistedLayoutStrict = (
  raw: string,
  scope: LaunchpadLayoutScope
): PersistedLayout => {
  const key = getLayoutKey(scope)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    throw new Error(
      `Unable to parse persisted layout payload for scope "${scope}" (key "${key}"): ${String(error)}`
    )
  }
  const rawRecord =
    parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  if (
    !rawRecord ||
    !hasValidRawCoordinates(rawRecord.coordinates) ||
    !hasValidRawScrollGroups(rawRecord.scrollGroups, rawRecord.version === 8)
  ) {
    throw new Error(`Invalid persisted layout payload for scope "${scope}" (key "${key}").`)
  }
  let layout: PersistedLayout | null
  try {
    layout = parsePersistedLayout(raw)
  } catch (error) {
    throw new Error(
      `Unable to parse persisted layout payload for scope "${scope}" (key "${key}"): ${String(error)}`
    )
  }
  if (!layout) {
    throw new Error(`Invalid persisted layout payload for scope "${scope}" (key "${key}").`)
  }
  const validation = validatePersistedLayout(layout)
  if (!validation.valid) {
    throw new Error(
      `Invalid persisted layout payload for scope "${scope}" (key "${key}"): ${formatLayoutValidationIssues(
        validation.issues
      )}`
    )
  }
  if (layout.checksum && layout.checksum !== calculateLayoutChecksum(layout)) {
    throw new Error(
      `Persisted layout checksum mismatch for scope "${scope}" (key "${key}") at revision ${layout.revision ?? 0}.`
    )
  }
  return layout
}

export const readLayout = async (
  scope: LaunchpadLayoutScope = 'paged'
): Promise<PersistedLayout | null> => {
  try {
    const raw = await invoke<string | null>('get_layout_payload', { key: getLayoutKey(scope) })
    if (raw === null) return null
    return parsePersistedLayout(raw)
  } catch {
    return null
  }
}

export const readLayoutStrict = async (
  scope: LaunchpadLayoutScope = 'paged'
): Promise<PersistedLayout | null> => {
  const key = getLayoutKey(scope)
  let raw: string | null = null
  try {
    raw = await invoke<string | null>('get_layout_payload', { key })
    if (raw === null) {
      hydrationDiagnosticsByKey.delete(key)
      return null
    }
    const layout = parsePersistedLayoutStrict(raw, scope)
    rememberSuccessfulLayout(key, raw, layout)
    hydrationDiagnosticsByKey.delete(key)
    return layout
  } catch (error) {
    hydrationDiagnosticsByKey.set(key, {
      scope,
      key,
      rawPayload: raw,
      error: String(error),
      lastValidRevision: lastRevisionByKey.get(key) ?? null,
    })
    throw error
  }
}

// 内容未变化的布局重复写入会放大状态振荡（每次保存都触发下游刷新），按规范 payload 去重。
const lastWrittenPayloadByKey = new Map<string, string>()
const lastWrittenContentByKey = new Map<string, string>()
const lastRevisionByKey = new Map<string, number>()
const writeQueueByKey = new Map<string, Promise<void>>()

const rememberSuccessfulLayout = (key: string, serialized: string, layout?: PersistedLayout) => {
  lastWrittenPayloadByKey.set(key, serialized)
  if (!layout) return
  lastWrittenContentByKey.set(key, serializeLayoutForIntegrity(layout))
  lastRevisionByKey.set(key, Math.max(0, layout.revision ?? 0))
}

const enqueueLayoutWrite = (key: string, operation: () => Promise<void>): Promise<void> => {
  const previous = writeQueueByKey.get(key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  writeQueueByKey.set(key, next)
  return next.finally(() => {
    if (writeQueueByKey.get(key) === next) writeQueueByKey.delete(key)
  })
}

const buildPersistedLayout = (
  items: GridItem[],
  slots: Array<string | null>,
  dockKeys: Array<string | null>,
  pageSize?: number,
  columns?: number,
  geometryKey?: string,
  scrollGroups?: ScrollGroupMeta[],
  folderProfileId?: FolderLayoutProfileId
): PersistedLayout => ({
  items: serializeItems(items),
  slots,
  dockKeys,
  pageSize,
  columns,
  coordinates:
    typeof pageSize === 'number' && typeof columns === 'number' && pageSize > 0 && columns > 0
      ? buildPersistedItemCoordinates(slots, items, pageSize, columns)
      : undefined,
  geometryKey,
  scrollGroups,
  folderProfileId,
})

const writePersistedLayoutSnapshot = (
  layout: PersistedLayout,
  scope: LaunchpadLayoutScope,
  recordSnapshot: boolean
): Promise<void> => {
  const key = getLayoutKey(scope)
  return enqueueLayoutWrite(key, async () => {
    const canonicalLayout = createCanonicalLayoutSnapshot(layout)
    const basePayload = buildIntegrityPayload(canonicalLayout)
    const content = JSON.stringify(basePayload)
    if (lastWrittenContentByKey.get(key) === content) {
      writeDiagnosticsByKey.delete(key)
      return
    }

    const revision = (lastRevisionByKey.get(key) ?? 0) + 1
    const nextLayout: PersistedLayout = { ...canonicalLayout, revision }
    const serialized = JSON.stringify({
      ...basePayload,
      revision,
      checksum: calculateLayoutChecksum(nextLayout),
    })
    try {
      await invoke('set_layout_payload', { key, payload: serialized })
    } catch (error) {
      lastWrittenPayloadByKey.delete(key)
      const previousFailure = writeDiagnosticsByKey.get(key)
      writeDiagnosticsByKey.set(key, {
        scope,
        key,
        payload: serialized,
        attempts: (previousFailure?.attempts ?? 0) + 1,
        error: String(error),
      })
      throw error
    }
    writeDiagnosticsByKey.delete(key)
    rememberSuccessfulLayout(key, serialized, nextLayout)
    if (recordSnapshot) recordAutoLayoutSnapshot(serialized, scope)
  })
}

export const writeLayout = async (
  items: GridItem[],
  slots: Array<string | null>,
  dockKeys: Array<string | null>,
  pageSize?: number,
  columns?: number,
  geometryKey?: string,
  scrollGroups?: ScrollGroupMeta[],
  scope: LaunchpadLayoutScope = 'paged',
  folderProfileId?: FolderLayoutProfileId
) => {
  const layout = buildPersistedLayout(
    items,
    slots,
    dockKeys,
    pageSize,
    columns,
    geometryKey,
    scrollGroups,
    folderProfileId
  )
  return writePersistedLayoutSnapshot(layout, scope, true)
}

/** 读取当前布局的原始 payload，供恢复预览和诊断使用。 */
export const readLayoutPayload = async (
  scope: LaunchpadLayoutScope = 'paged'
): Promise<string | null> =>
  invoke<string | null>('get_layout_payload', { key: getLayoutKey(scope) })

/**
 * 校验并提交一份布局 payload。
 *
 * 与 `writeLayout` 的区别：不重算坐标、不记历史快照（预览与撤销都是瞬态），
 * 但仍通过统一的 v10 revision/checksum writer，避免恢复操作把旧版本或损坏数据重新写回。
 */
export const applyLayoutPayload = async (
  payload: string,
  scope: LaunchpadLayoutScope = 'paged'
): Promise<void> => {
  const layout = parsePersistedLayoutStrict(payload, scope)
  await writePersistedLayoutSnapshot(layout, scope, false)
}

export const writePersistedLayout = async (
  layout: PersistedLayout | null,
  scope: LaunchpadLayoutScope = 'paged'
) => {
  if (!layout) {
    await writeLayout([], [], [], undefined, undefined, undefined, undefined, scope)
    return
  }

  return writePersistedLayoutSnapshot(layout, scope, false)
}

export const resetLaunchpadLayout = async () => {
  await Promise.all([
    writeLayout([], [], []),
    writeLayout([], [], [], undefined, undefined, undefined, undefined, 'scroll'),
  ])
}

export const hydrateDockKeys = (
  itemIds: string[],
  persisted: Array<string | null> | null | undefined
): string[] =>
  normalizeDockKeys(
    persisted?.map(key => (key ? key.replace(/^(desktop|customapp):/, '') : null)),
    itemIds
  )

const hydrateItemsWithFolderAliases = (
  icons: DesktopIcon[],
  persisted: PersistedItem[] | null
): { items: GridItem[]; collapsedFolderAliases: Map<string, string> } => {
  const iconMap = new Map<string, IconItem>()
  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    iconMap.set(key, { kind: 'icon', key, icon })
  })

  const consumed = new Set<string>()
  const result: GridItem[] = []
  const collapsedFolderAliases = new Map<string, string>()
  const normalizeLegacyKey = (key: string) => key.replace(/^(desktop|customapp):/, '')

  if (persisted) {
    persisted.forEach(item => {
      if (item.type === 'icon') {
        const key = normalizeLegacyKey(item.key)
        if (consumed.has(key)) return
        const iconItem = iconMap.get(key)
        if (!iconItem) return
        consumed.add(key)
        result.push(iconItem)
        return
      }

      if (item.type === 'widget') {
        if (consumed.has(`widget:${item.id}`)) return
        const spanX = Number.isInteger(item.spanX) ? Math.max(1, item.spanX) : 1
        const spanY = Number.isInteger(item.spanY) ? Math.max(1, item.spanY) : 1
        const minSpanX = Number.isInteger(item.minSpanX) ? Math.max(1, item.minSpanX!) : 1
        const minSpanY = Number.isInteger(item.minSpanY) ? Math.max(1, item.minSpanY!) : 1
        const maxSpanX = Number.isInteger(item.maxSpanX)
          ? Math.max(minSpanX, item.maxSpanX!)
          : spanX
        const maxSpanY = Number.isInteger(item.maxSpanY)
          ? Math.max(minSpanY, item.maxSpanY!)
          : spanY
        consumed.add(`widget:${item.id}`)
        result.push({
          kind: 'widget',
          id: item.id,
          provider: item.provider,
          label: item.label,
          spanX,
          spanY,
          minSpanX,
          minSpanY,
          maxSpanX,
          maxSpanY,
          ...(item.appWidgetId === undefined ? {} : { appWidgetId: item.appWidgetId }),
        } satisfies WidgetItem)
        return
      }

      const children: IconItem[] = []
      item.children.forEach(persistedKey => {
        const key = normalizeLegacyKey(persistedKey)
        if (consumed.has(key)) return
        const iconItem = iconMap.get(key)
        if (!iconItem) return
        consumed.add(key)
        children.push(iconItem)
      })

      if (children.length >= 2) {
        result.push({
          kind: 'folder',
          id: item.id || makeFolderId(),
          name: item.name || translate('New Folder'),
          size: item.size ?? '1x1',
          children,
        })
      } else if (children.length === 1) {
        result.push(children[0])
        if (item.id) {
          collapsedFolderAliases.set('folder:' + item.id, children[0].key)
        }
      }
    })
  }

  icons.forEach(icon => {
    const key = buildIconSelectionKey(icon)
    if (!consumed.has(key)) {
      result.push({ kind: 'icon', key, icon })
    }
  })

  return { items: result, collapsedFolderAliases }
}

export const hydrateLayout = (
  icons: DesktopIcon[],
  persisted: PersistedLayout | null
): { items: GridItem[]; layout: PersistedLayout | null } => {
  const canonicalPersisted = persisted ? materializeLayoutFromCanonicalPlacements(persisted) : null
  const { items, collapsedFolderAliases } = hydrateItemsWithFolderAliases(
    icons,
    canonicalPersisted?.items ?? null
  )
  if (!canonicalPersisted || collapsedFolderAliases.size === 0) {
    return { items, layout: canonicalPersisted }
  }

  const replaceItemId = (id: string | null): string | null =>
    id === null ? null : (collapsedFolderAliases.get(id) ?? id)
  const replacePlacements = canonicalPersisted.placements?.flatMap(placement => {
    if (typeof placement.container === 'object') {
      if (collapsedFolderAliases.has(placement.container.folderId)) return []
      return [
        {
          ...placement,
          id: collapsedFolderAliases.get(placement.id) ?? placement.id,
        },
      ]
    }
    return [
      {
        ...placement,
        id: collapsedFolderAliases.get(placement.id) ?? placement.id,
      },
    ]
  })

  return {
    items,
    layout: {
      ...canonicalPersisted,
      slots: canonicalPersisted.slots?.map(replaceItemId) ?? null,
      dockKeys: canonicalPersisted.dockKeys.map(replaceItemId),
      coordinates: canonicalPersisted.coordinates?.map(coordinate => ({
        ...coordinate,
        id: collapsedFolderAliases.get(coordinate.id) ?? coordinate.id,
      })),
      placements: replacePlacements,
      scrollGroups: canonicalPersisted.scrollGroups?.map(group => ({
        ...group,
        itemIds: group.itemIds.map(id => collapsedFolderAliases.get(id) ?? id),
      })),
    },
  }
}

export const hydrateItems = (icons: DesktopIcon[], persisted: PersistedItem[] | null): GridItem[] =>
  hydrateItemsWithFolderAliases(icons, persisted).items
