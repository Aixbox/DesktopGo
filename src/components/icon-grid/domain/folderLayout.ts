import type { FolderLayoutProfileId } from '../model'

export type { FolderLayoutProfileId } from '../model'

/**
 * ColorOS folder layout profiles.
 *
 * Folder children are ordered by rank. A rank is converted to a page and a
 * local cell through one profile so persistence, preview and the modal do not
 * need to repeat the page-capacity arithmetic.
 */
export interface FolderLayoutProfile {
  id: FolderLayoutProfileId
  columns: number
  rows: number
  previewCount: number
  stackedPreviewCount: number
  /** Undefined means that pages grow as needed, matching the APK's rank model. */
  maxPages?: number
}

export const FOLDER_LAYOUT_PROFILES: Readonly<Record<FolderLayoutProfileId, FolderLayoutProfile>> =
  {
    standard: {
      id: 'standard',
      columns: 3,
      rows: 4,
      previewCount: 3,
      stackedPreviewCount: 4,
    },
    simple: {
      id: 'simple',
      columns: 2,
      rows: 3,
      previewCount: 2,
      stackedPreviewCount: 3,
    },
    big: {
      id: 'big',
      columns: 4,
      rows: 4,
      previewCount: 3,
      stackedPreviewCount: 4,
    },
  }

export const DEFAULT_FOLDER_LAYOUT_PROFILE = FOLDER_LAYOUT_PROFILES.standard

const normalizeNonNegativeInteger = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback

const normalizePositiveInteger = (value: number, fallback = 1): number =>
  Number.isFinite(value) ? Math.max(1, Math.floor(value)) : fallback

const normalizeProfile = (profile: FolderLayoutProfile): FolderLayoutProfile => ({
  ...profile,
  columns: normalizePositiveInteger(profile.columns),
  rows: normalizePositiveInteger(profile.rows),
  previewCount: normalizeNonNegativeInteger(profile.previewCount),
  stackedPreviewCount: normalizeNonNegativeInteger(profile.stackedPreviewCount),
  maxPages: profile.maxPages === undefined ? undefined : normalizePositiveInteger(profile.maxPages),
})

export const getFolderLayoutProfile = (
  profileId: FolderLayoutProfileId = DEFAULT_FOLDER_LAYOUT_PROFILE.id
): FolderLayoutProfile => FOLDER_LAYOUT_PROFILES[profileId] ?? DEFAULT_FOLDER_LAYOUT_PROFILE

export const getFolderPageCapacity = (profile: FolderLayoutProfile): number => {
  const normalized = normalizeProfile(profile)
  return normalized.columns * normalized.rows
}

export const getFolderPageCount = (
  itemCount: number,
  profile: FolderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE
): number => {
  const capacity = getFolderPageCapacity(profile)
  return Math.max(1, Math.ceil(normalizeNonNegativeInteger(itemCount) / capacity))
}

export interface FolderPlacement {
  page: number
  row: number
  col: number
  rank: number
}

export const getFolderPlacement = (
  rank: number,
  profile: FolderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE
): FolderPlacement => {
  const normalized = normalizeProfile(profile)
  const safeRank = normalizeNonNegativeInteger(rank)
  const pageCapacity = normalized.columns * normalized.rows
  const localRank = safeRank % pageCapacity
  return {
    page: Math.floor(safeRank / pageCapacity),
    row: Math.floor(localRank / normalized.columns),
    col: localRank % normalized.columns,
    rank: safeRank,
  }
}

export interface FolderPage<T> {
  page: number
  startRank: number
  entries: Array<T | null>
}

/**
 * Materialize fixed-size pages while preserving null/drop-hole entries. The
 * padding makes a page's cell coordinates stable during drag previews.
 */
export const computeFolderPages = <T>(
  entries: readonly (T | null)[],
  profile: FolderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE
): FolderPage<T>[] => {
  const pageCapacity = getFolderPageCapacity(profile)
  const pageCount = getFolderPageCount(entries.length, profile)
  return Array.from({ length: pageCount }, (_, page) => {
    const startRank = page * pageCapacity
    const pageEntries = entries.slice(startRank, startRank + pageCapacity)
    while (pageEntries.length < pageCapacity) pageEntries.push(null)
    return { page, startRank, entries: pageEntries }
  })
}

export const getFolderPreviewItems = <T>(
  entries: readonly T[],
  profile: FolderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE
): T[] => entries.slice(0, normalizeProfile(profile).previewCount)

export const getFolderStackedItems = <T>(
  entries: readonly T[],
  profile: FolderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE
): T[] => {
  const normalized = normalizeProfile(profile)
  return entries.slice(
    normalized.previewCount,
    normalized.previewCount + normalized.stackedPreviewCount
  )
}

export interface FolderDropCapacity {
  accepted: boolean
  capacityPerPage: number
  currentPageCount: number
  nextPageCount: number
  maxItems: number | null
  remaining: number | null
  reason: 'ok' | 'capacity-exceeded' | 'invalid-count'
}

/**
 * Resolve a drop without mutating the folder. A profile with no maxPages can
 * spill into additional pages; a bounded profile gets an explicit rejection
 * reason for UI/aria-live feedback.
 */
export const resolveFolderDropCapacity = (
  currentCount: number,
  incomingCount: number,
  profile: FolderLayoutProfile = DEFAULT_FOLDER_LAYOUT_PROFILE
): FolderDropCapacity => {
  const normalized = normalizeProfile(profile)
  const capacityPerPage = getFolderPageCapacity(normalized)
  if (!Number.isFinite(currentCount) || !Number.isFinite(incomingCount)) {
    return {
      accepted: false,
      capacityPerPage,
      currentPageCount: 1,
      nextPageCount: 1,
      maxItems: null,
      remaining: null,
      reason: 'invalid-count',
    }
  }

  const safeCurrentCount = Math.max(0, Math.floor(currentCount))
  const safeIncomingCount = Math.max(0, Math.floor(incomingCount))
  const currentPageCount = getFolderPageCount(safeCurrentCount, normalized)
  const nextCount = safeCurrentCount + safeIncomingCount
  const nextPageCount = getFolderPageCount(nextCount, normalized)
  const maxItems = normalized.maxPages === undefined ? null : capacityPerPage * normalized.maxPages
  const accepted = maxItems === null || nextCount <= maxItems
  const remaining = maxItems === null ? null : Math.max(0, maxItems - safeCurrentCount)

  return {
    accepted,
    capacityPerPage,
    currentPageCount,
    nextPageCount,
    maxItems,
    remaining,
    reason: accepted ? 'ok' : 'capacity-exceeded',
  }
}
