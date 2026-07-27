import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { FolderItem } from '../model'
import { DRAG_HOLE_ID } from '../domain/slots'
import { DOCK_GAP } from '../domain/dock'
import { GRID_GAP, REORDER_ANIMATION_MS } from '../constants'

const REORDER_EASING = 'ease'

export function usePagedGridReorderAnimationRefs() {
  const tileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const folderTileRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dockItemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingGridFlipPositionsRef = useRef<Map<string, { left: number; top: number }> | null>(
    null
  )
  const gridFlipAnimationsRef = useRef<Map<string, Animation>>(new Map())
  const previousFolderEntriesRef = useRef<Array<string | null>>([])
  const previousDockEntriesRef = useRef<Array<string | null>>([])
  const folderAnimationTimersRef = useRef<Map<string, number>>(new Map())
  const dockAnimationTimersRef = useRef<Map<string, number>>(new Map())

  const capturePagedGridItemPositions = useCallback(() => {
    const positions = new Map<string, { left: number; top: number }>()
    tileRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      positions.set(id, { left: rect.left, top: rect.top })
    })
    pendingGridFlipPositionsRef.current = positions
    gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
    gridFlipAnimationsRef.current.clear()
  }, [])

  return {
    tileRefs,
    folderTileRefs,
    dockItemRefs,
    pendingGridFlipPositionsRef,
    gridFlipAnimationsRef,
    previousFolderEntriesRef,
    previousDockEntriesRef,
    folderAnimationTimersRef,
    dockAnimationTimersRef,
    capturePagedGridItemPositions,
  }
}

type PagedGridReorderAnimationRefs = ReturnType<typeof usePagedGridReorderAnimationRefs>

interface UsePagedGridReorderAnimationsParams {
  animationRefs: PagedGridReorderAnimationRefs
  activeDragIdSet: Set<string>
  pageItems: Array<string | null>
  openFolder: FolderItem | null
  folderRenderOrder: Array<string | null>
  folderColumns: number
  folderItemWidth: number
  folderItemHeight: number
  dockRenderSlots: Array<string | null>
  dockIconImageSize: number
}

export function usePagedGridReorderAnimations({
  animationRefs,
  activeDragIdSet,
  pageItems,
  openFolder,
  folderRenderOrder,
  folderColumns,
  folderItemWidth,
  folderItemHeight,
  dockRenderSlots,
  dockIconImageSize,
}: UsePagedGridReorderAnimationsParams) {
  const {
    tileRefs,
    folderTileRefs,
    dockItemRefs,
    pendingGridFlipPositionsRef,
    gridFlipAnimationsRef,
    previousFolderEntriesRef,
    previousDockEntriesRef,
    folderAnimationTimersRef,
    dockAnimationTimersRef,
  } = animationRefs

  useLayoutEffect(() => {
    const previousPositions = pendingGridFlipPositionsRef.current
    pendingGridFlipPositionsRef.current = null
    if (!previousPositions || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const movedItems: Array<{
      id: string
      node: HTMLDivElement
      deltaX: number
      deltaY: number
    }> = []
    previousPositions.forEach((previous, id) => {
      if (activeDragIdSet.has(id)) return
      const node = tileRefs.current.get(id)
      if (!node) return
      const next = node.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      movedItems.push({ id, node, deltaX, deltaY })
    })

    movedItems.forEach(({ id, node, deltaX, deltaY }) => {
      node.style.willChange = 'transform'
      const animation = node.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: REORDER_ANIMATION_MS, easing: REORDER_EASING }
      )
      const clearAnimation = () => {
        if (gridFlipAnimationsRef.current.get(id) !== animation) return
        gridFlipAnimationsRef.current.delete(id)
        node.style.willChange = ''
      }
      animation.onfinish = clearAnimation
      animation.oncancel = clearAnimation
      gridFlipAnimationsRef.current.set(id, animation)
    })
  }, [activeDragIdSet, gridFlipAnimationsRef, pageItems, pendingGridFlipPositionsRef, tileRefs])

  useLayoutEffect(() => {
    if (!openFolder) {
      previousFolderEntriesRef.current = []
      return
    }

    const previousIndexById = new Map<string, number>()
    previousFolderEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      previousIndexById.set(entry, index)
    })
    const stepX = folderItemWidth + GRID_GAP
    const stepY = folderItemHeight + GRID_GAP

    folderRenderOrder.forEach((entry, newIndex) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const previousIndex = previousIndexById.get(entry)
      if (previousIndex === undefined || previousIndex === newIndex) return
      const deltaX = ((previousIndex % folderColumns) - (newIndex % folderColumns)) * stepX
      const deltaY =
        (Math.floor(previousIndex / folderColumns) - Math.floor(newIndex / folderColumns)) * stepY
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      animateWithTransformTimer(
        folderTileRefs.current.get(entry),
        entry,
        `translate3d(${deltaX}px, ${deltaY}px, 0px)`,
        folderAnimationTimersRef
      )
    })
    previousFolderEntriesRef.current = folderRenderOrder
  }, [
    folderAnimationTimersRef,
    folderColumns,
    folderItemHeight,
    folderItemWidth,
    folderRenderOrder,
    folderTileRefs,
    openFolder,
    previousFolderEntriesRef,
  ])

  useLayoutEffect(() => {
    const previousIndexById = new Map<string, number>()
    previousDockEntriesRef.current.forEach((entry, index) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      previousIndexById.set(entry, index)
    })
    const stepX = Math.max(dockIconImageSize + 12, 52) + DOCK_GAP

    dockRenderSlots.forEach((entry, newIndex) => {
      if (entry === null || entry === DRAG_HOLE_ID) return
      const previousIndex = previousIndexById.get(entry)
      if (previousIndex === undefined || previousIndex === newIndex) return
      const deltaX = (previousIndex - newIndex) * stepX
      if (Math.abs(deltaX) < 0.5) return
      animateWithTransformTimer(
        dockItemRefs.current.get(entry),
        entry,
        `translate3d(${deltaX}px, 0px, 0px)`,
        dockAnimationTimersRef
      )
    })
    previousDockEntriesRef.current = dockRenderSlots
  }, [
    dockAnimationTimersRef,
    dockIconImageSize,
    dockItemRefs,
    dockRenderSlots,
    previousDockEntriesRef,
  ])

  useEffect(() => {
    const gridAnimations = gridFlipAnimationsRef.current
    const folderTimers = folderAnimationTimersRef.current
    const dockTimers = dockAnimationTimersRef.current
    return () => {
      gridAnimations.forEach(animation => animation.cancel())
      gridAnimations.clear()
      folderTimers.forEach(timer => window.clearTimeout(timer))
      folderTimers.clear()
      dockTimers.forEach(timer => window.clearTimeout(timer))
      dockTimers.clear()
    }
  }, [dockAnimationTimersRef, folderAnimationTimersRef, gridFlipAnimationsRef])
}

function animateWithTransformTimer(
  node: HTMLDivElement | undefined,
  itemId: string,
  initialTransform: string,
  timersRef: RefObject<Map<string, number>>
) {
  if (!node) return
  const existingTimer = timersRef.current.get(itemId)
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer)
    timersRef.current.delete(itemId)
  }

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
