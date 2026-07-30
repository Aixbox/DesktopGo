import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSearchResultIcons } from '@/lib/search/api'
import {
  buildIconRequestSignature,
  mergeLoadedIcons,
  mergeTypeIcons,
  recordIconAttempts,
  selectIconRequests,
  selectIconTypeKeys,
  toIconCacheKey,
  toIconTypeKey,
  toIconTypeRequest,
  type SearchIconRequest,
} from './visibleIconRequests'

const VISIBLE_ICON_CACHE_CAPACITY = 2048
const VISIBLE_ICON_BATCH_LIMIT = 128
const ICON_TYPE_BATCH_LIMIT = 32
/**
 * Rows are drawn at 28 CSS pixels, so 32 was already upscaled at 125% display
 * scaling. 48 is the next shared system image list, which downsamples cleanly.
 */
const VISIBLE_ICON_SIZE = 48
const VISIBLE_ICON_MAX_ATTEMPTS = 3

/**
 * Resolves icons for the rows near the viewport.
 *
 * Two passes run independently. The *type* pass resolves one real shell icon per
 * extension (and one for folders), which is a few dozen entries for any result
 * set and lets every row paint an icon on its first frame. The *exact* pass then
 * upgrades the rows whose icon lives inside the file itself — executables,
 * shortcuts and cached picture thumbnails.
 *
 * Batches are scheduled on an animation frame, so dragging the scrollbar
 * collapses into one request per frame instead of one per render.
 */
export function useVisibleSearchIcons(requests: SearchIconRequest[], enabled: boolean) {
  const [iconsByPath, setIconsByPath] = useState(() => new Map<string, string>())
  const [typeIcons, setTypeIcons] = useState(() => new Map<string, string>())
  const iconsRef = useRef(iconsByPath)
  const typeIconsRef = useRef(typeIcons)
  const requestsRef = useRef(requests)
  const pendingKeysRef = useRef(new Set<string>())
  const pendingTypeKeysRef = useRef(new Set<string>())
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

  const storeTypeIcons = useCallback((icons: Map<string, string>) => {
    typeIconsRef.current = icons
    setTypeIcons(icons)
  }, [])

  /** One real shell icon per extension, so no row has to paint without one. */
  const loadTypeIcons = useCallback(() => {
    const typeKeys = selectIconTypeKeys({
      requests: requestsRef.current,
      typeIcons: typeIconsRef.current,
      pendingTypeKeys: pendingTypeKeysRef.current,
      batchLimit: ICON_TYPE_BATCH_LIMIT,
    })
    if (typeKeys.length === 0) return

    typeKeys.forEach(typeKey => pendingTypeKeysRef.current.add(typeKey))

    void getSearchResultIcons(typeKeys.map(toIconTypeRequest), VISIBLE_ICON_SIZE)
      .then(loaded => {
        storeTypeIcons(
          mergeTypeIcons({
            typeIcons: typeIconsRef.current,
            requestedTypeKeys: typeKeys,
            loaded,
          })
        )
      })
      .catch(() => {
        // A failed batch stays absent so the next visible pass retries it.
      })
      .finally(() => {
        typeKeys.forEach(typeKey => pendingTypeKeysRef.current.delete(typeKey))
      })
  }, [storeTypeIcons])

  const loadNextBatch = useCallback(() => {
    frameRef.current = null
    loadTypeIcons()

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
  }, [loadTypeIcons, storeIcons, visibleKeys])

  useEffect(() => {
    if (!enabled) return

    frameRef.current = window.requestAnimationFrame(loadNextBatch)
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [enabled, iconsByPath, loadNextBatch, signature, typeIcons])

  /**
   * A row's own icon when it is known, otherwise the icon its type already
   * resolved to. Both are real shell icons, so there is nothing to draw in
   * between.
   */
  return useCallback(
    (path: string, isFolder: boolean) =>
      iconsByPath.get(toIconCacheKey(path)) ?? typeIcons.get(toIconTypeKey(path, isFolder)) ?? '',
    [iconsByPath, typeIcons]
  )
}
