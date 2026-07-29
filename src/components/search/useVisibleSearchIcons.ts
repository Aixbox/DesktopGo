import { useEffect, useRef, useState } from 'react'
import { getSearchResultIcons } from '@/lib/search/api'

const VISIBLE_ICON_CACHE_CAPACITY = 512
const VISIBLE_ICON_BATCH_LIMIT = 64
const VISIBLE_ICON_SIZE = 32

const rememberRequestedIcons = (
  current: Map<string, string>,
  requestedPaths: string[],
  loadedIcons: Map<string, string>
) => {
  const next = new Map(current)
  for (const path of requestedPaths) {
    next.delete(path)
    next.set(path, loadedIcons.get(path) ?? '')
  }

  while (next.size > VISIBLE_ICON_CACHE_CAPACITY) {
    const oldestPath = next.keys().next().value
    if (typeof oldestPath !== 'string') break
    next.delete(oldestPath)
  }
  return next
}

export function useVisibleSearchIcons(paths: string[], enabled: boolean) {
  const [iconsByPath, setIconsByPath] = useState(() => new Map<string, string>())
  const pendingPathsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) return

    const requestedPaths = [...new Set(paths.map(path => path.trim()).filter(Boolean))]
      .filter(path => !iconsByPath.has(path) && !pendingPathsRef.current.has(path))
      .slice(0, VISIBLE_ICON_BATCH_LIMIT)
    if (requestedPaths.length === 0) return

    requestedPaths.forEach(path => pendingPathsRef.current.add(path))
    void getSearchResultIcons(requestedPaths, VISIBLE_ICON_SIZE)
      .then(results => {
        const loadedIcons = new Map(results.map(result => [result.path, result.iconBase64]))
        setIconsByPath(current => rememberRequestedIcons(current, requestedPaths, loadedIcons))
      })
      .catch(() => {
        setIconsByPath(current => rememberRequestedIcons(current, requestedPaths, new Map()))
      })
      .finally(() => {
        requestedPaths.forEach(path => pendingPathsRef.current.delete(path))
      })
  }, [enabled, iconsByPath, paths])

  return iconsByPath
}
