import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react'
import type { FolderItem } from '../model'
import { DRAG_HOLE_ID } from '../domain/slots'
import { DOCK_GAP } from '../domain/dock'
import { GRID_GAP, MOTION_SPRING_EASING, REORDER_ANIMATION_MS } from '../constants'
import { readCurrentTranslate } from '../hooks/reorderMotion'
import type { DropImpactEvent } from '../state/types'
import { animateDropImpactNodes } from '../views/dropImpactMotion'

const REORDER_EASING = MOTION_SPRING_EASING

interface UseScrollableGridReorderAnimationsParams {
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  folderTileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  dockItemRefs: MutableRefObject<Map<string, HTMLDivElement>>
  pageItems: Array<string | null>
  currentPage: number
  columns: number
  itemWidth: number
  itemHeight: number
  launchpadGridViewMode: 'paged' | 'scroll'
  openFolder: FolderItem | null
  folderRenderOrder: Array<string | null>
  folderColumns: number
  folderItemWidth: number
  folderItemHeight: number
  dockRenderSlots: Array<string | null>
  dockIconImageSize: number
  dropImpact: DropImpactEvent | null
}

export function useScrollableGridReorderAnimations({
  tileRefs,
  folderTileRefs,
  dockItemRefs,
  pageItems,
  currentPage,
  columns,
  itemWidth,
  itemHeight,
  launchpadGridViewMode,
  openFolder,
  folderRenderOrder,
  folderColumns,
  folderItemWidth,
  folderItemHeight,
  dockRenderSlots,
  dockIconImageSize,
  dropImpact,
}: UseScrollableGridReorderAnimationsParams) {
  const previousPageEntriesRef = useRef<Array<string | null>>([])
  const previousPageRef = useRef(0)
  const previousFolderEntriesRef = useRef<Array<string | null>>([])
  const previousDockEntriesRef = useRef<Array<string | null>>([])
  const tileAnimationTimersRef = useRef(new Map<string, number>())
  const tileImpactAnimationsRef = useRef(new Map<string, Animation>())
  const folderAnimationTimersRef = useRef(new Map<string, number>())
  const dockAnimationTimersRef = useRef(new Map<string, number>())
  const lastDropImpactSequenceRef = useRef(0)

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isNewDropImpact =
      dropImpact !== null && dropImpact.sequence !== lastDropImpactSequenceRef.current
    if (isNewDropImpact && dropImpact) {
      lastDropImpactSequenceRef.current = dropImpact.sequence
    }

    if (launchpadGridViewMode === 'scroll') {
      previousPageRef.current = currentPage
      if (!isNewDropImpact) {
        previousPageEntriesRef.current = pageItems
        return
      }
    } else if (previousPageRef.current !== currentPage) {
      previousPageRef.current = currentPage
      previousPageEntriesRef.current = pageItems
      return
    }

    if (reducedMotion) {
      previousPageEntriesRef.current = pageItems
      return
    }
    const previousIndexById = new Map<string, number>()
    previousPageEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      previousIndexById.set(entry, index)
    })
    const stepX = itemWidth + GRID_GAP
    const stepY = itemHeight + GRID_GAP
    if (isNewDropImpact && dropImpact) {
      const previousPositions = new Map<string, { left: number; top: number }>()
      pageItems.forEach((entry, nextIndex) => {
        if (entry === null || entry === DRAG_HOLE_ID) return
        const previousIndex = previousIndexById.get(entry)
        const node = tileRefs.current.get(entry)
        if (previousIndex === undefined || !node) return
        const next = node.getBoundingClientRect()
        previousPositions.set(entry, {
          left: next.left + ((previousIndex % columns) - (nextIndex % columns)) * stepX,
          top:
            next.top +
            (Math.floor(previousIndex / columns) - Math.floor(nextIndex / columns)) * stepY,
        })
      })
      animateDropImpactNodes({
        nodes: tileRefs.current,
        animations: tileImpactAnimationsRef.current,
        previousPositions,
        impact: dropImpact,
        itemWidth,
        itemHeight,
        gridGap: GRID_GAP,
        reducedMotion: false,
      })
      previousPageEntriesRef.current = pageItems
      return
    }
    pageItems.forEach((entry, nextIndex) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const previousIndex = previousIndexById.get(entry)
      if (previousIndex === undefined || previousIndex === nextIndex) return
      const deltaX = ((previousIndex % columns) - (nextIndex % columns)) * stepX
      const deltaY = (Math.floor(previousIndex / columns) - Math.floor(nextIndex / columns)) * stepY
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      const node = tileRefs.current.get(entry)
      if (!node) return
      const currentTranslate = readCurrentTranslate(node)
      animateWithTransformTimer(
        node,
        entry,
        `translate3d(${deltaX + currentTranslate.x}px, ${deltaY + currentTranslate.y}px, 0px)`,
        tileAnimationTimersRef
      )
    })
    previousPageEntriesRef.current = pageItems
  }, [
    columns,
    currentPage,
    dropImpact,
    itemHeight,
    itemWidth,
    launchpadGridViewMode,
    pageItems,
    tileRefs,
  ])

  useLayoutEffect(() => {
    if (!openFolder) {
      previousFolderEntriesRef.current = []
      return
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const previousIndexById = new Map<string, number>()
    previousFolderEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      previousIndexById.set(entry, index)
    })
    const stepX = folderItemWidth + GRID_GAP
    const stepY = folderItemHeight + GRID_GAP
    if (!reducedMotion)
      folderRenderOrder.forEach((entry, nextIndex) => {
        if (entry === null || entry === DRAG_HOLE_ID) return
        const previousIndex = previousIndexById.get(entry)
        if (previousIndex === undefined || previousIndex === nextIndex) return
        const deltaX = ((previousIndex % folderColumns) - (nextIndex % folderColumns)) * stepX
        const deltaY =
          (Math.floor(previousIndex / folderColumns) - Math.floor(nextIndex / folderColumns)) *
          stepY
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
        const currentTranslate = readCurrentTranslate(folderTileRefs.current.get(entry))
        animateWithTransformTimer(
          folderTileRefs.current.get(entry),
          entry,
          `translate3d(${deltaX + currentTranslate.x}px, ${deltaY + currentTranslate.y}px, 0px)`,
          folderAnimationTimersRef
        )
      })
    previousFolderEntriesRef.current = folderRenderOrder
  }, [
    folderColumns,
    folderItemHeight,
    folderItemWidth,
    folderRenderOrder,
    folderTileRefs,
    openFolder,
  ])

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const previousIndexById = new Map<string, number>()
    previousDockEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      previousIndexById.set(entry, index)
    })
    const stepX = Math.max(dockIconImageSize + 12, 52) + DOCK_GAP
    if (!reducedMotion)
      dockRenderSlots.forEach((entry, nextIndex) => {
        if (entry === null || entry === DRAG_HOLE_ID) return
        const previousIndex = previousIndexById.get(entry)
        if (previousIndex === undefined || previousIndex === nextIndex) return
        const deltaX = (previousIndex - nextIndex) * stepX
        if (Math.abs(deltaX) < 0.5) return
        const currentTranslate = readCurrentTranslate(dockItemRefs.current.get(entry))
        animateWithTransformTimer(
          dockItemRefs.current.get(entry),
          entry,
          `translate3d(${deltaX + currentTranslate.x}px, ${currentTranslate.y}px, 0px)`,
          dockAnimationTimersRef
        )
      })
    previousDockEntriesRef.current = dockRenderSlots
  }, [dockIconImageSize, dockItemRefs, dockRenderSlots])

  useEffect(() => {
    const tileTimers = tileAnimationTimersRef.current
    const tileImpactAnimations = tileImpactAnimationsRef.current
    const folderTimers = folderAnimationTimersRef.current
    const dockTimers = dockAnimationTimersRef.current
    return () => {
      tileTimers.forEach(timer => window.clearTimeout(timer))
      tileTimers.clear()
      tileImpactAnimations.forEach(animation => animation.cancel())
      tileImpactAnimations.clear()
      folderTimers.forEach(timer => window.clearTimeout(timer))
      folderTimers.clear()
      dockTimers.forEach(timer => window.clearTimeout(timer))
      dockTimers.clear()
    }
  }, [])
}

function animateWithTransformTimer(
  node: HTMLDivElement | undefined,
  itemId: string,
  initialTransform: string,
  timersRef: MutableRefObject<Map<string, number>>
) {
  if (!node) return
  const existingTimer = timersRef.current.get(itemId)
  if (existingTimer !== undefined) window.clearTimeout(existingTimer)
  node.style.transition = 'none'
  node.style.willChange = 'transform'
  node.style.transform = initialTransform
  void node.offsetWidth
  node.style.transition = `transform ${REORDER_ANIMATION_MS}ms ${REORDER_EASING}`
  node.style.transform = 'translate3d(0px, 0px, 0px)'
  const timer = window.setTimeout(() => {
    node.style.transition = ''
    node.style.transform = ''
    node.style.willChange = ''
    timersRef.current.delete(itemId)
  }, REORDER_ANIMATION_MS + 40)
  timersRef.current.set(itemId, timer)
}
