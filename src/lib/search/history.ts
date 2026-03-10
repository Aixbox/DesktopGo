import { invoke } from '@tauri-apps/api/core'
import type { SearchDefaultFilter } from './settings'
import type { SearchSort } from './types'

const SEARCH_HISTORY_KEY = 'search.history.v1'
const MAX_SEARCH_HISTORY_ENTRIES = 24

export interface SearchHistoryEntry {
  id: string
  keyword: string
  filter: SearchDefaultFilter
  matchPath: boolean
  matchCase: boolean
  regex: boolean
  wholeWord: boolean
  sort: SearchSort
  usedAt: number
}

interface SearchHistorySnapshot {
  entries: SearchHistoryEntry[]
}

const createHistoryId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const readRawHistory = async (): Promise<SearchHistorySnapshot> => {
  const raw = await invoke<string | null>('get_layout_payload', {
    key: SEARCH_HISTORY_KEY,
  })
  if (!raw) {
    return { entries: [] }
  }

  try {
    const parsed = JSON.parse(raw) as SearchHistorySnapshot
    if (!Array.isArray(parsed.entries)) {
      return { entries: [] }
    }
    return {
      entries: parsed.entries
        .filter(entry => typeof entry.keyword === 'string' && entry.keyword.trim().length > 0)
        .slice(0, MAX_SEARCH_HISTORY_ENTRIES),
    }
  } catch {
    return { entries: [] }
  }
}

const writeRawHistory = async (entries: SearchHistoryEntry[]) => {
  await invoke('set_layout_payload', {
    key: SEARCH_HISTORY_KEY,
    payload: JSON.stringify({
      entries,
    }),
  })
}

export const loadSearchHistory = async () => {
  const snapshot = await readRawHistory()
  return snapshot.entries
}

export const addSearchHistoryEntry = async (entry: Omit<SearchHistoryEntry, 'id' | 'usedAt'>) => {
  const normalizedKeyword = entry.keyword.trim()
  if (!normalizedKeyword) {
    return loadSearchHistory()
  }

  const currentEntries = await loadSearchHistory()
  const nextEntry: SearchHistoryEntry = {
    ...entry,
    keyword: normalizedKeyword,
    id: createHistoryId(),
    usedAt: Date.now(),
  }

  const dedupedEntries = currentEntries.filter(currentEntry => {
    return !(
      currentEntry.keyword === nextEntry.keyword &&
      currentEntry.filter === nextEntry.filter &&
      currentEntry.matchPath === nextEntry.matchPath &&
      currentEntry.matchCase === nextEntry.matchCase &&
      currentEntry.regex === nextEntry.regex &&
      currentEntry.wholeWord === nextEntry.wholeWord &&
      currentEntry.sort === nextEntry.sort
    )
  })

  const nextEntries = [nextEntry, ...dedupedEntries].slice(0, MAX_SEARCH_HISTORY_ENTRIES)
  await writeRawHistory(nextEntries)
  return nextEntries
}

export const removeSearchHistoryEntry = async (id: string) => {
  const currentEntries = await loadSearchHistory()
  const nextEntries = currentEntries.filter(entry => entry.id !== id)
  await writeRawHistory(nextEntries)
  return nextEntries
}

export const clearSearchHistory = async () => {
  await writeRawHistory([])
  return []
}
