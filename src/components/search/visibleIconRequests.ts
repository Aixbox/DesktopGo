/**
 * Which visible rows still need an icon, and what stays in the cache.
 *
 * Kept separate from the hook so the batching, retry and retention rules can be
 * exercised without a renderer. The rule that matters: a row that came back
 * without an icon is *not* recorded as "has no icon". Storing that verdict is
 * what previously froze a placeholder in place for the rest of the session.
 */

import type { SearchIconRequest } from '@/lib/search/types'

export type { SearchIconRequest }

/** Windows paths are case-insensitive, so one file is one cache entry. */
export const toIconCacheKey = (path: string) => path.trim().toLowerCase()

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
