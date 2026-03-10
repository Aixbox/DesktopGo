import { invoke } from '@tauri-apps/api/core'
import type { SearchSort } from './types'

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

const SEARCH_PROFILE_VERSION = 4
const SEARCH_PROFILE_VERSION_KEY = 'search.profileVersion'

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = {
  liveOnType: true,
  debounceMs: 120,
  autoSelectFirst: true,
  openOnEnter: true,
  openOnDoubleClick: true,
  defaultFilter: 'all',
  maxResultsPerPage: 200,
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

const readRawSetting = async (key: string): Promise<unknown | null> => {
  const raw = await invoke<string | null>('get_layout_payload', { key })
  if (!raw) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

const writeRawSetting = async (key: string, value: unknown): Promise<void> => {
  await invoke('set_layout_payload', {
    key,
    payload: JSON.stringify(value),
  })
}

const shouldMigrateToToolbarDefaults = (settings: SearchSettings) =>
  settings.maxResultsPerPage === LEGACY_SEARCH_DEFAULTS.maxResultsPerPage &&
  settings.sortBy === LEGACY_SEARCH_DEFAULTS.sortBy

export const loadSearchSettings = async (): Promise<SearchSettings> => {
  const entries = await Promise.all(
    (Object.keys(SEARCH_SETTING_KEYS) as Array<keyof SearchSettings>).map(async key => {
      const storageKey = SEARCH_SETTING_KEYS[key]
      const raw = await readRawSetting(storageKey)
      const fallback = DEFAULT_SEARCH_SETTINGS[key]
      const normalized = normalizeValue(key, raw, fallback)
      if (raw === null) {
        await writeRawSetting(storageKey, normalized)
      }
      return [key, normalized] as const
    })
  )

  const settings: SearchSettings = { ...DEFAULT_SEARCH_SETTINGS }
  for (const [key, value] of entries) {
    ;(settings as unknown as Record<string, unknown>)[key] = value
  }

  const profileVersionRaw = await readRawSetting(SEARCH_PROFILE_VERSION_KEY)
  const profileVersion =
    typeof profileVersionRaw === 'number' && Number.isFinite(profileVersionRaw)
      ? profileVersionRaw
      : 0

  if (profileVersion < SEARCH_PROFILE_VERSION) {
    if (shouldMigrateToToolbarDefaults(settings)) {
      settings.maxResultsPerPage = DEFAULT_SEARCH_SETTINGS.maxResultsPerPage
      settings.sortBy = DEFAULT_SEARCH_SETTINGS.sortBy

      await Promise.all([
        writeRawSetting(SEARCH_SETTING_KEYS.maxResultsPerPage, settings.maxResultsPerPage),
        writeRawSetting(SEARCH_SETTING_KEYS.sortBy, settings.sortBy),
      ])
    }

    await writeRawSetting(SEARCH_PROFILE_VERSION_KEY, SEARCH_PROFILE_VERSION)
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
  if (message.startsWith('EverythingNotFound')) {
    return 'Installed Everything was not found. Install it from the DesktopGo installer.'
  }
  if (message.startsWith('EverythingIpcUnavailable')) {
    return 'DesktopGo could not query the running Everything instance. Make sure Everything is already running and both apps use the same privilege level.'
  }
  if (message.startsWith('EverythingBusy')) {
    return 'DesktopGo is waiting for the previous Everything IPC request to finish.'
  }
  if (message === 'Everything runtime startup timed out.') {
    return 'DesktopGo timed out while preparing Everything. Retry the search.'
  }
  return message
}

export const getSearchSettingsErrorMessage = (error: unknown) =>
  describeSearchRuntimeError(asErrorMessage(error))
