/**
 * Which visible rows still need an icon, and what stays in the cache.
 *
 * Kept separate from the hook so the batching, retry and retention rules can be
 * exercised without a renderer. Two rules matter:
 *
 * - A row that came back without an icon is *not* recorded as "has no icon".
 *   Storing that verdict is what previously froze a placeholder in place for the
 *   rest of the session.
 * - Icons are resolved per *type* as well as per path, so a row can paint a real
 *   shell icon before its own icon is known.
 */

import type { SearchIconRequest } from '@/lib/search/types'

export type { SearchIconRequest }

/** Windows paths are case-insensitive, so one file is one cache entry. */
export const toIconCacheKey = (path: string) => path.trim().toLowerCase()

/**
 * The *type* a row's icon can be borrowed from while its own icon is unknown.
 *
 * Everything's debug build logs `add ext icon %s`: ordinary rows share one icon
 * per extension, so the number of distinct identities in a 20,000 row result set
 * is a few dozen. Resolving those up front is what lets every row paint a real
 * shell icon on its first frame instead of a placeholder.
 */
export const toIconTypeKey = (path: string, isFolder: boolean) => {
  if (isFolder) return 'folder'

  const normalized = path.trim().toLowerCase()
  const lastDot = normalized.lastIndexOf('.')
  const lastSeparator = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'))
  const extension = lastDot > lastSeparator + 1 ? normalized.slice(lastDot + 1) : ''
  return `ext:${extension}`
}

/**
 * A synthetic entry that asks the shell about a *type* rather than a file.
 *
 * Mirrors `extension_lookup_name` on the Rust side: the association lookup only
 * reads the extension, so a made-up name resolves the same icon without touching
 * the disk and without a real path to be missing or over-long.
 *
 * The stems must be distinct per type and implausible as real relative paths.
 * Rust deduplicates a batch by path alone, so a folder and an extensionless file
 * sharing one stem would collapse into a single answer and cross-assign icons.
 */
const ICON_TYPE_FOLDER_STEM = 'desktopgo-icon-folder'
const ICON_TYPE_FILE_STEM = 'desktopgo-icon-file'

export const toIconTypeRequest = (typeKey: string): SearchIconRequest => {
  if (typeKey === 'folder') return { path: ICON_TYPE_FOLDER_STEM, isFolder: true }

  const extension = typeKey.slice('ext:'.length)
  return {
    path: extension ? `${ICON_TYPE_FILE_STEM}.${extension}` : ICON_TYPE_FILE_STEM,
    isFolder: false,
  }
}

/** Type keys present in the given rows that have no icon resolved yet. */
export const selectIconTypeKeys = ({
  requests,
  typeIcons,
  pendingTypeKeys,
  batchLimit,
}: {
  requests: SearchIconRequest[]
  typeIcons: Map<string, string>
  pendingTypeKeys: Set<string>
  batchLimit: number
}) => {
  const selected: string[] = []

  for (const request of requests) {
    if (selected.length >= batchLimit) break

    const typeKey = toIconTypeKey(request.path, request.isFolder)
    if (typeIcons.has(typeKey) || pendingTypeKeys.has(typeKey)) continue
    if (selected.includes(typeKey)) continue

    selected.push(typeKey)
  }

  return selected
}

/**
 * Folds resolved type icons in, pairing each answer back to the key that asked.
 *
 * Returns the same map when nothing usable came back, so a batch of misses
 * cannot trigger a re-render that immediately asks again.
 */
export const mergeTypeIcons = ({
  typeIcons,
  requestedTypeKeys,
  loaded,
}: {
  typeIcons: Map<string, string>
  requestedTypeKeys: string[]
  loaded: Array<{ path: string; iconBase64: string }>
}) => {
  const iconByPath = new Map(
    loaded
      .filter(entry => entry.iconBase64)
      .map(entry => [toIconCacheKey(entry.path), entry.iconBase64])
  )

  const resolved = requestedTypeKeys.flatMap(typeKey => {
    const icon = iconByPath.get(toIconCacheKey(toIconTypeRequest(typeKey).path))
    return icon ? [[typeKey, icon] as const] : []
  })
  if (resolved.length === 0) return typeIcons

  const next = new Map(typeIcons)
  for (const [typeKey, icon] of resolved) next.set(typeKey, icon)
  return next
}

export const buildIconRequestSignature = (requests: SearchIconRequest[]) =>
  requests.map(request => toIconCacheKey(request.path)).join('\n')

/**
 * Visible rows that have no icon yet, are not already in flight, and have not
 * exhausted their attempts. Order follows the viewport so the rows a user is
 * looking at are resolved first.
 */
export const selectIconRequests = ({
  requests,
  icons,
  pendingKeys,
  attemptsByKey,
  maxAttempts,
  batchLimit,
}: {
  requests: SearchIconRequest[]
  icons: Map<string, string>
  pendingKeys: Set<string>
  attemptsByKey: Map<string, number>
  maxAttempts: number
  batchLimit: number
}) => {
  const selected: SearchIconRequest[] = []
  const seen = new Set<string>()

  for (const request of requests) {
    if (selected.length >= batchLimit) break

    const key = toIconCacheKey(request.path)
    if (!key || seen.has(key)) continue
    if (icons.has(key) || pendingKeys.has(key)) continue
    if ((attemptsByKey.get(key) ?? 0) >= maxAttempts) continue

    seen.add(key)
    selected.push(request)
  }

  return selected
}

/**
 * Folds a finished batch into the cache.
 *
 * Returns the same map instance when a batch produced nothing usable, so a batch
 * of misses cannot trigger a re-render that immediately asks again.
 */
export const mergeLoadedIcons = ({
  icons,
  loaded,
  visibleKeys,
  capacity,
}: {
  icons: Map<string, string>
  loaded: Array<{ path: string; iconBase64: string }>
  visibleKeys: Set<string>
  capacity: number
}) => {
  const usable = loaded.filter(entry => entry.iconBase64)
  if (usable.length === 0) return icons

  const next = new Map(icons)
  for (const entry of usable) {
    const key = toIconCacheKey(entry.path)
    if (!key) continue
    next.delete(key)
    next.set(key, entry.iconBase64)
  }

  for (const key of next.keys()) {
    if (next.size <= capacity) break
    if (visibleKeys.has(key)) continue
    next.delete(key)
  }

  return next
}

/**
 * Counts one attempt per requested row and forgets rows that scrolled away, so
 * returning to a row is itself a retry.
 */
export const recordIconAttempts = ({
  attemptsByKey,
  requestedKeys,
  visibleKeys,
}: {
  attemptsByKey: Map<string, number>
  requestedKeys: string[]
  visibleKeys: Set<string>
}) => {
  const next = new Map<string, number>()

  for (const [key, attempts] of attemptsByKey) {
    if (visibleKeys.has(key)) next.set(key, attempts)
  }
  for (const key of requestedKeys) {
    next.set(key, (next.get(key) ?? 0) + 1)
  }

  return next
}
