import { invoke } from '@tauri-apps/api/core'
import type { SearchRuntimeState, SearchSort } from './types'
import { translate } from '@/lib/i18n'

export type SearchDefaultFilter =
  | 'all'
  | 'files'
  | 'folders'
  | 'audio'
  | 'compressed'
  | 'documents'
  | 'executables'
  | 'pictures'
  | 'videos'

export interface SearchSettings {
  liveOnType: boolean
  debounceMs: number
  autoSelectFirst: boolean
  openOnEnter: boolean
  openOnDoubleClick: boolean
  defaultFilter: SearchDefaultFilter
  maxResultsPerPage: number
  matchPath: boolean
  matchCase: boolean
  regex: boolean
  matchWholeWord: boolean
  sortBy: SearchSort
  rememberLastFilter: boolean
  autoStartRuntime: boolean
}

const SEARCH_PROFILE_VERSION = 5
const SEARCH_PROFILE_VERSION_KEY = 'search.profileVersion'

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  liveOnType: true,
  debounceMs: 120,
  autoSelectFirst: true,
  openOnEnter: true,
  openOnDoubleClick: true,
  defaultFilter: 'all',
  maxResultsPerPage: 50,
  matchPath: false,
  matchCase: false,
  regex: false,
  matchWholeWord: false,
  sortBy: 'path_asc',
  rememberLastFilter: true,
  autoStartRuntime: true,
}

const LEGACY_SEARCH_DEFAULTS = {
  maxResultsPerPage: 50,
  sortBy: 'name_asc' as SearchSort,
}

const SEARCH_SETTING_KEYS: { [K in keyof SearchSettings]: string } = {
  liveOnType: 'search.liveOnType',
  debounceMs: 'search.debounceMs',
  autoSelectFirst: 'search.autoSelectFirst',
  openOnEnter: 'search.openOnEnter',
  openOnDoubleClick: 'search.openOnDoubleClick',
  defaultFilter: 'search.defaultFilter',
  maxResultsPerPage: 'search.maxResultsPerPage',
  matchPath: 'search.matchPath',
  matchCase: 'search.matchCase',
  regex: 'search.regex',
  matchWholeWord: 'search.matchWholeWord',
  sortBy: 'search.sortBy',
  rememberLastFilter: 'search.rememberLastFilter',
  autoStartRuntime: 'search.autoStartRuntime',
}

const LAST_FILTER_KEY = 'search.lastFilter'

const BOOLEAN_KEYS: Array<keyof SearchSettings> = [
  'liveOnType',
  'autoSelectFirst',
  'openOnEnter',
  'openOnDoubleClick',
  'matchPath',
  'matchCase',
  'regex',
  'matchWholeWord',
  'rememberLastFilter',
  'autoStartRuntime',
]

interface LayoutPayloadRecord {
  key: string
  payload: string | null
}

interface LayoutPayloadWrite {
  key: string
  payload: string
}

const asErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(error)
}

const clampNumber = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

const normalizeFilter = (value: unknown, fallback: SearchDefaultFilter): SearchDefaultFilter => {
  if (value === 'all' || value === 'files' || value === 'folders') return value
  if (
    value === 'audio' ||
    value === 'compressed' ||
    value === 'documents' ||
    value === 'executables' ||
    value === 'pictures' ||
    value === 'videos'
  ) {
    return value
  }
  return fallback
}

const normalizeSort = (value: unknown, fallback: SearchSort): SearchSort => {
  if (
    value === 'name_asc' ||
    value === 'name_desc' ||
    value === 'path_asc' ||
    value === 'path_desc' ||
    value === 'size_asc' ||
    value === 'size_desc' ||
    value === 'extension_asc' ||
    value === 'extension_desc' ||
    value === 'type_name_asc' ||
    value === 'type_name_desc' ||
    value === 'date_created_asc' ||
    value === 'date_created_desc' ||
    value === 'date_modified_asc' ||
    value === 'date_modified_desc' ||
    value === 'attributes_asc' ||
    value === 'attributes_desc' ||
    value === 'file_list_filename_asc' ||
    value === 'file_list_filename_desc' ||
    value === 'run_count_asc' ||
    value === 'run_count_desc' ||
    value === 'date_recently_changed_asc' ||
    value === 'date_recently_changed_desc' ||
    value === 'date_accessed_asc' ||
    value === 'date_accessed_desc' ||
    value === 'date_run_asc' ||
    value === 'date_run_desc'
  ) {
    return value
  }
  return fallback
}

const normalizeValue = <K extends keyof SearchSettings>(
  key: K,
  value: unknown,
  fallback: SearchSettings[K]
): SearchSettings[K] => {
  if (BOOLEAN_KEYS.includes(key)) {
    return (typeof value === 'boolean' ? value : fallback) as SearchSettings[K]
  }

  if (key === 'debounceMs') {
    return clampNumber(Number(value), 50, 500, fallback as number) as SearchSettings[K]
  }
  if (key === 'maxResultsPerPage') {
    return clampNumber(Number(value), 10, 200, fallback as number) as SearchSettings[K]
  }
  if (key === 'defaultFilter') {
    return normalizeFilter(value, fallback as SearchDefaultFilter) as SearchSettings[K]
  }
  if (key === 'sortBy') {
    return normalizeSort(value, fallback as SearchSort) as SearchSettings[K]
  }

  return fallback
}

const parsePayload = (payload: string | null): unknown | null => {
  if (!payload) return null
  try {
    return JSON.parse(payload) as unknown
  } catch {
    return null
  }
}

const readRawSettings = async (keys: string[]): Promise<Map<string, unknown | null>> => {
  const records = await invoke<LayoutPayloadRecord[]>('get_layout_payloads', { keys })
  const values = new Map<string, unknown | null>()
  records.forEach(record => {
    values.set(record.key, parsePayload(record.payload))
  })
  return values
}

const dedupeWrites = (writes: Array<[string, unknown]>) => {
  const deduped = new Map<string, unknown>()
  writes.forEach(([key, value]) => {
    deduped.set(key, value)
  })
  return Array.from(deduped.entries())
}

const writeRawSettings = async (writes: Array<[string, unknown]>): Promise<void> => {
  const deduped = dedupeWrites(writes)
  if (deduped.length === 0) {
    return
  }

  await invoke('set_layout_payloads', {
    entries: deduped.map<LayoutPayloadWrite>(([key, value]) => ({
      key,
      payload: JSON.stringify(value),
    })),
  })
}

const readRawSetting = async (key: string): Promise<unknown | null> => {
  const values = await readRawSettings([key])
  return values.get(key) ?? null
}

const writeRawSetting = async (key: string, value: unknown): Promise<void> => {
  await writeRawSettings([[key, value]])
}

const shouldMigrateToToolbarDefaults = (settings: SearchSettings) =>
  settings.maxResultsPerPage === LEGACY_SEARCH_DEFAULTS.maxResultsPerPage &&
  settings.sortBy === LEGACY_SEARCH_DEFAULTS.sortBy

const shouldRewriteNormalizedValue = (raw: unknown | null, normalized: unknown) => {
  if (raw === null) return true
  return JSON.stringify(raw) !== JSON.stringify(normalized)
}

export const loadSearchSettings = async (): Promise<SearchSettings> => {
  const settings: SearchSettings = { ...DEFAULT_SEARCH_SETTINGS }
  const storageKeys = [
    ...(Object.values(SEARCH_SETTING_KEYS) as string[]),
    SEARCH_PROFILE_VERSION_KEY,
  ]
  const rawValues = await readRawSettings(storageKeys)
  const pendingWrites: Array<[string, unknown]> = []

  for (const key of Object.keys(SEARCH_SETTING_KEYS) as Array<keyof SearchSettings>) {
    const storageKey = SEARCH_SETTING_KEYS[key]
    const raw = rawValues.get(storageKey) ?? null
    const fallback = DEFAULT_SEARCH_SETTINGS[key]
    const normalized = normalizeValue(key, raw, fallback)
    ;(settings as unknown as Record<string, unknown>)[key] = normalized
    if (shouldRewriteNormalizedValue(raw, normalized)) {
      pendingWrites.push([storageKey, normalized])
    }
  }

  const profileVersionRaw = rawValues.get(SEARCH_PROFILE_VERSION_KEY) ?? null
  const profileVersion =
    typeof profileVersionRaw === 'number' && Number.isFinite(profileVersionRaw)
      ? profileVersionRaw
      : 0

  if (profileVersion < SEARCH_PROFILE_VERSION) {
    if (shouldMigrateToToolbarDefaults(settings)) {
      settings.maxResultsPerPage = DEFAULT_SEARCH_SETTINGS.maxResultsPerPage
      settings.sortBy = DEFAULT_SEARCH_SETTINGS.sortBy
      pendingWrites.push(
        [SEARCH_SETTING_KEYS.maxResultsPerPage, settings.maxResultsPerPage],
        [SEARCH_SETTING_KEYS.sortBy, settings.sortBy]
      )
    }


    if (profileVersion < 5 && settings.maxResultsPerPage !== 50) {
      settings.maxResultsPerPage = 50
      pendingWrites.push([SEARCH_SETTING_KEYS.maxResultsPerPage, settings.maxResultsPerPage])
    }
    pendingWrites.push([SEARCH_PROFILE_VERSION_KEY, SEARCH_PROFILE_VERSION])
  }

  if (pendingWrites.length > 0) {
    await writeRawSettings(pendingWrites)
  }

  return settings
}

export const saveSearchSetting = async <K extends keyof SearchSettings>(
  key: K,
  value: SearchSettings[K]
): Promise<SearchSettings[K]> => {
  const normalized = normalizeValue(key, value, DEFAULT_SEARCH_SETTINGS[key])
  await writeRawSetting(SEARCH_SETTING_KEYS[key], normalized)
  return normalized
}

export const loadLastFilter = async (): Promise<SearchDefaultFilter | null> => {
  try {
    const raw = await readRawSetting(LAST_FILTER_KEY)
    return normalizeFilter(raw, DEFAULT_SEARCH_SETTINGS.defaultFilter)
  } catch {
    return null
  }
}

export const saveLastFilter = async (filter: SearchDefaultFilter): Promise<void> => {
  await writeRawSetting(LAST_FILTER_KEY, filter)
}

export const describeSearchRuntimeError = (message: string) => {
  if (message.startsWith('EverythingInitializing')) {
    return translate('Everything 正在启动或建立索引，搜索结果可能暂不完整，请稍后重试。')
  }
  if (message.startsWith('EverythingNotFound')) {
    return translate('未找到已安装的 Everything。请通过 DesktopGo 安装程序完成安装。')
  }
  if (message.startsWith('EverythingIpcUnavailable')) {
    return translate(
      'DesktopGo 无法连接正在运行的 Everything。请确认 Everything 已启动，并且两个应用使用相同的权限级别。'
    )
  }
  if (message.startsWith('EverythingBusy')) {
    return translate('DesktopGo 正在等待上一个 Everything IPC 请求完成。')
  }
  if (message === 'Everything runtime startup timed out.') {
    return translate('DesktopGo 在准备 Everything 时超时，请重试搜索。')
  }
  return message
}

export const getSearchRuntimeStateFromError = (message: string): SearchRuntimeState => {
  if (message.startsWith('EverythingNotFound')) {
    return 'not_installed'
  }
  if (message.startsWith('EverythingInitializing')) {
    return 'initializing'
  }
  if (message.startsWith('EverythingIpcUnavailable')) {
    return 'unavailable'
  }
  return 'unknown'
}

export const getSearchSettingsErrorMessage = (error: unknown) =>
  describeSearchRuntimeError(asErrorMessage(error))
