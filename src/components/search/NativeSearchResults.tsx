import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { SearchHit, SearchQuery } from '@/lib/search/types'
import {
  hideNativeSearchList,
  prepareNativeSearchList,
  readNativeSearchPalette,
  selectNativeSearchListItem,
  showNativeSearchList,
} from '@/lib/search/nativeList'

const NATIVE_SELECT_EVENT = 'desktopgo://native-search-select'
const NATIVE_ACTIVATE_EVENT = 'desktopgo://native-search-activate'
const NATIVE_CONTEXT_MENU_EVENT = 'desktopgo://native-search-context-menu'

interface NativeSearchEvent {
  index: number
  item: SearchHit
}

interface NativeSearchResultsProps {
  children: ReactNode
  visible: boolean
  query: SearchQuery | null
  totalResults: number
  selectedIndex: number
  allowDoubleClickOpen: boolean
  onSelect: (index: number, item: SearchHit) => void
  onActivate: (item: SearchHit) => void
}

export function NativeSearchResults({
  children,
  visible,
  query,
  totalResults,
  selectedIndex,
  allowDoubleClickOpen,
  onSelect,
  onActivate,
}: NativeSearchResultsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const generationRef = useRef(0)
  const [readyState, setReadyState] = useState<{
    generation: number
    query: SearchQuery
  } | null>(null)
  const readyGeneration = readyState?.query === query ? readyState.generation : null
  const handleSelect = useEffectEvent((event: NativeSearchEvent) => {
    onSelect(event.index, event.item)
  })
  const handleActivate = useEffectEvent((event: NativeSearchEvent) => {
    if (allowDoubleClickOpen) onActivate(event.item)
  })

  useEffect(() => {
    const unlisteners = [
      listen<NativeSearchEvent>(NATIVE_SELECT_EVENT, event => {
        handleSelect(event.payload)
      }),
      listen<NativeSearchEvent>(NATIVE_ACTIVATE_EVENT, event => {
        handleActivate(event.payload)
      }),
      listen<NativeSearchEvent>(NATIVE_CONTEXT_MENU_EVENT, event => {
        void invoke('show_shell_context_menu', { path: event.payload.item.path })
      }),
    ]

    return () => {
      void Promise.all(unlisteners).then(items => items.forEach(unlisten => unlisten()))
    }
  }, [])

  useEffect(() => {
    const generation = generationRef.current + 1
    generationRef.current = generation
    void hideNativeSearchList()
    if (!visible || !query || totalResults <= 0) return

    let cancelled = false
    void prepareNativeSearchList(generation, query)
      .then(count => {
        if (!cancelled && generationRef.current === generation && count === totalResults) {
          setReadyState({ generation, query })
        }
      })
      .catch(error => {
        if (import.meta.env.DEV) console.debug('Native search list fallback:', error)
      })

    return () => {
      cancelled = true
    }
  }, [query, totalResults, visible])

  useLayoutEffect(() => {
    if (readyGeneration === null || !visible) return
    const container = containerRef.current
    if (!container) return
    let frame: number | null = null

    const sync = () => {
      frame = null
      const rect = container.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      void showNativeSearchList(
        readyGeneration,
        { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
        readNativeSearchPalette()
      ).catch(error => {
        if (import.meta.env.DEV) console.debug('Native search list layout fallback:', error)
      })
    }
    const scheduleSync = () => {
      if (frame !== null) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    }
    const resizeObserver = new ResizeObserver(scheduleSync)
    const themeObserver = new MutationObserver(scheduleSync)
    resizeObserver.observe(container)
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    window.addEventListener('resize', scheduleSync)
    scheduleSync()

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      window.removeEventListener('resize', scheduleSync)
      void hideNativeSearchList()
    }
  }, [readyGeneration, visible])

  useEffect(() => {
    if (readyGeneration === null) return
    void selectNativeSearchListItem(selectedIndex)
  }, [readyGeneration, selectedIndex])

  return (
    <div ref={containerRef} className="h-full min-w-0">
      {children}
    </div>
  )
}
