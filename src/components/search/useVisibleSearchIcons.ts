import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSearchResultIcons } from '@/lib/search/api'
import {
  buildIconRequestSignature,
  mergeLoadedIcons,
  recordIconAttempts,
  selectIconRequests,
  toIconCacheKey,
  type SearchIconRequest,
} from './visibleIconRequests'

const VISIBLE_ICON_CACHE_CAPACITY = 2048
const VISIBLE_ICON_BATCH_LIMIT = 128
/**
 * Rows are drawn at 28 CSS pixels, so 32 was already upscaled at 125% display
 * scaling. 48 is the next shared system image list, which downsamples cleanly.
 */
const VISIBLE_ICON_SIZE = 48
const VISIBLE_ICON_MAX_ATTEMPTS = 3

/**
 * Loads icons for the rows currently on screen.
 *
 * Batches are scheduled on an animation frame, so dragging the scrollbar
 * collapses into one request per frame instead of one per render.
 */
export function useVisibleSearchIcons(requests: SearchIconRequest[], enabled: boolean) {
  const [iconsByPath, setIconsByPath] = useState(() => new Map<string, string>())
  const iconsRef = useRef(iconsByPath)
  const requestsRef = useRef(requests)
  const pendingKeysRef = useRef(new Set<string>())
  const attemptsRef = useRef(new Map<string, number>())
  const frameRef = useRef<number | null>(null)
  const signature = useMemo(() => buildIconRequestSignature(requests), [requests])

  useEffect(() => {
    requestsRef.current = requests
  })

  const visibleKeys = useCallback(
    () => new Set(requestsRef.current.map(request => toIconCacheKey(request.path))),
    []
  )

  const storeIcons = useCallback((icons: Map<string, string>) => {
    iconsRef.current = icons
    setIconsByPath(icons)
  }, [])

  const loadNextBatch = useCallback(() => {
    frameRef.current = null

    attemptsRef.current = recordIconAttempts({
      attemptsByKey: attemptsRef.current,
      requestedKeys: [],
      visibleKeys: visibleKeys(),
    })

    const selected = selectIconRequests({
      requests: requestsRef.current,
      icons: iconsRef.current,
      pendingKeys: pendingKeysRef.current,
      attemptsByKey: attemptsRef.current,
      maxAttempts: VISIBLE_ICON_MAX_ATTEMPTS,
      batchLimit: VISIBLE_ICON_BATCH_LIMIT,
    })
    if (selected.length === 0) return

    const requestedKeys = selected.map(request => toIconCacheKey(request.path))
    requestedKeys.forEach(key => pendingKeysRef.current.add(key))
    attemptsRef.current = recordIconAttempts({
      attemptsByKey: attemptsRef.current,
      requestedKeys,
      visibleKeys: visibleKeys(),
    })

    void getSearchResultIcons(selected, VISIBLE_ICON_SIZE)
      .then(loaded => {
        storeIcons(
          mergeLoadedIcons({
            icons: iconsRef.current,
            loaded,
            visibleKeys: visibleKeys(),
            capacity: VISIBLE_ICON_CACHE_CAPACITY,
          })
        )
      })
      .catch(() => {
        // A failed batch stays absent from the cache so the next pass retries it.
      })
      .finally(() => {
        requestedKeys.forEach(key => pendingKeysRef.current.delete(key))
      })
  }, [storeIcons, visibleKeys])

  useEffect(() => {
    if (!enabled) return

    frameRef.current = window.requestAnimationFrame(loadNextBatch)
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [enabled, iconsByPath, loadNextBatch, signature])

  return iconsByPath
}
