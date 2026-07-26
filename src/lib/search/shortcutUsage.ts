export const SHORTCUT_USAGE_VERSION = 1 as const
export const MAX_SHORTCUT_USAGE_ENTRIES = 500

export type ShortcutUsageEntry = {
  launchCount: number
  lastLaunchedAt: number
}

export type ShortcutUsageState = {
  version: typeof SHORTCUT_USAGE_VERSION
  enabled: boolean
  entries: Record<string, ShortcutUsageEntry>
}

export const createDefaultShortcutUsageState = (): ShortcutUsageState => ({
  version: SHORTCUT_USAGE_VERSION,
  enabled: true,
  entries: {},
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeEntry = (value: unknown): ShortcutUsageEntry | null => {
  if (!isRecord(value)) return null

  const launchCount = value.launchCount
  const lastLaunchedAt = value.lastLaunchedAt
  if (
    typeof launchCount !== 'number' ||
    !Number.isSafeInteger(launchCount) ||
    launchCount <= 0 ||
    typeof lastLaunchedAt !== 'number' ||
    !Number.isFinite(lastLaunchedAt) ||
    lastLaunchedAt <= 0
  ) {
    return null
  }

  return { launchCount, lastLaunchedAt: Math.floor(lastLaunchedAt) }
}

const limitEntries = (
  entries: Array<readonly [string, ShortcutUsageEntry]>
): Record<string, ShortcutUsageEntry> =>
  Object.fromEntries(
    entries
      .sort((left, right) => right[1].lastLaunchedAt - left[1].lastLaunchedAt)
      .slice(0, MAX_SHORTCUT_USAGE_ENTRIES)
  )

export function normalizeShortcutUsageState(value: unknown): ShortcutUsageState {
  if (!isRecord(value)) return createDefaultShortcutUsageState()

  const rawEntries = isRecord(value.entries) ? value.entries : {}
  const entries = Object.entries(rawEntries).flatMap(([id, entry]) => {
    const normalizedId = id.trim()
    const normalizedEntry = normalizeEntry(entry)
    return normalizedId && normalizedId.length <= 128 && normalizedEntry
      ? ([[normalizedId, normalizedEntry]] as const)
      : []
  })

  return {
    version: SHORTCUT_USAGE_VERSION,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    entries: limitEntries(entries),
  }
}

export function recordShortcutLaunch(
  state: ShortcutUsageState,
  shortcutId: string,
  launchedAt = Date.now()
): ShortcutUsageState {
  const id = shortcutId.trim()
  if (!state.enabled || !id || id.length > 128 || !Number.isFinite(launchedAt)) return state

  const previous = state.entries[id]
  const launchCount = Math.min((previous?.launchCount ?? 0) + 1, Number.MAX_SAFE_INTEGER)
  const entries = limitEntries([
    ...Object.entries(state.entries).filter(([entryId]) => entryId !== id),
    [id, { launchCount, lastLaunchedAt: Math.max(1, Math.floor(launchedAt)) }],
  ])

  return { ...state, entries }
}

export const setShortcutUsageEnabled = (
  state: ShortcutUsageState,
  enabled: boolean
): ShortcutUsageState => (state.enabled === enabled ? state : { ...state, enabled })

export const clearShortcutUsageEntries = (state: ShortcutUsageState): ShortcutUsageState =>
  Object.keys(state.entries).length === 0 ? state : { ...state, entries: {} }

export function compareShortcutUsage(
  state: ShortcutUsageState | undefined,
  leftId: string,
  rightId: string
): number {
  if (!state?.enabled) return 0

  const left = state.entries[leftId]
  const right = state.entries[rightId]
  return (
    (right?.launchCount ?? 0) - (left?.launchCount ?? 0) ||
    (right?.lastLaunchedAt ?? 0) - (left?.lastLaunchedAt ?? 0)
  )
}
