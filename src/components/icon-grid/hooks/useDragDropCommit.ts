import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react'
import type { GridItem, IconItem } from '../model'
import { getId } from '../model'
import { DRAG_HOLE_ID, normalizeOuterSlots } from '../domain/slots'
import { moveDragHoleToIndex } from '../domain/evasionPolicy'
import {
  finalizeFolderExtractionInOuterLayout,
  getFolderChildrenById,
  replaceFolderChildren,
} from '../domain/folderPolicy'
import {
  applyAddToFolderFromSession,
  applyFolderCreateFromSession,
  applyOuterDropFromSession,
} from '../domain/dropPolicy'
import { applyDockDrop } from '../domain/dock'
import type { DragState, FolderDropFlight } from '../state/types'
import { OUTER_DRAG_RULES } from '../constants'
import {
  FOLDER_PREVIEW_GAP,
  FOLDER_PREVIEW_OUTER_EXPAND,
  FOLDER_PREVIEW_PADDING,
  FOLDER_PREVIEW_TOP_OFFSET,
  getFolderPreviewFrameSize,
  getFolderPreviewSlotSize,
} from '../views/FolderVisuals'

interface IconConfigLike {
  imgSize: number
}

interface UseDragDropCommitParams {
  reorderAnimationMs: number
  iconConfig: IconConfigLike
  columns: number
  pageSizeRef: MutableRefObject<number>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  dockKeysRef: MutableRefObject<string[]>
  setItems: Dispatch<SetStateAction<GridItem[]>>
  setOuterSlots: Dispatch<SetStateAction<Array<string | null>>>
  setDockKeys: Dispatch<SetStateAction<string[]>>
  dockCapacity: number
  dragRef: MutableRefObject<DragState | null>
  setDragState: Dispatch<SetStateAction<DragState | null>>
  clearEdgeSwitchTimer: () => void
  resolveNearestDropOrderByContext: (state: DragState) => Array<string | null>
  resolveNearestSlotIndexByContext: (state: DragState) => number | null
}

interface UseDragDropCommitResult {
  folderDropFlight: FolderDropFlight | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  frozenOuterOrder: Array<string | null> | null
  resetDropVisuals: () => void
  finishDrag: (pointerId: number) => boolean
}

export function useDragDropCommit({
  reorderAnimationMs,
  iconConfig,
  columns,
  pageSizeRef,
  tileRefs,
  itemsRef,
  outerSlotsRef,
  dockKeysRef,
  setItems,
  setOuterSlots,
  setDockKeys,
  dockCapacity,
  dragRef,
  setDragState,
  clearEdgeSwitchTimer,
  resolveNearestDropOrderByContext,
  resolveNearestSlotIndexByContext,
}: UseDragDropCommitParams): UseDragDropCommitResult {
  const folderDropFlightTimerRef = useRef<number | null>(null)
  const folderCreateTransitionTimerRef = useRef<number | null>(null)
  const folderDropFlightIdRef = useRef(0)
  const [folderDropFlight, setFolderDropFlight] = useState<FolderDropFlight | null>(null)
  const [folderPreviewFreezeTargetId, setFolderPreviewFreezeTargetId] = useState<string | null>(
    null
  )
  const [folderCreateTransitionTargetId, setFolderCreateTransitionTargetId] = useState<
    string | null
  >(null)
  const [hiddenOuterItemIds, setHiddenOuterItemIds] = useState<string[]>([])
  const [frozenOuterOrder, setFrozenOuterOrder] = useState<Array<string | null> | null>(null)

  const getFolderMapById = (folderId: string | null, baseItems: GridItem[]) => {
    const map = new Map<string, IconItem>()
    if (!folderId) return map
    getFolderChildrenById(baseItems, folderId).forEach(child => {
      map.set(child.key, child)
    })
    return map
  }

  const hasIconRepresentation = (
    items: GridItem[],
    slots: Array<string | null>,
    iconKey: string
  ): boolean => {
    if (slots.includes(iconKey)) return true
    return items.some(
      item =>
        (item.kind === 'icon' && item.key === iconKey) ||
        (item.kind === 'folder' && item.children.some(child => child.key === iconKey))
    )
  }

  const extractDraggedIconFromSourceFolder = (base: GridItem[], session: DragState): GridItem[] => {
    if (!session.sourceFolderId || session.draggingItem.kind !== 'icon') return base
    const iconKey = session.draggingItem.key
    const children = getFolderChildrenById(base, session.sourceFolderId)
    if (children.length === 0 || !children.some(child => child.key === iconKey)) return base
    const nextChildren = children.filter(child => child.key !== iconKey)
    return replaceFolderChildren(base, session.sourceFolderId, nextChildren, {
      collapseSingleChild: false,
    })
  }

  const commitOuterSessionResult = (
    session: DragState,
    originalItems: GridItem[],
    originalSlots: Array<string | null>,
    result: { items: GridItem[]; slots: Array<string | null> }
  ) => {
    const normalizedResultSlots = normalizeOuterSlots(
      result.slots,
      result.items.map(getId),
      pageSizeRef.current
    )
    if (
      session.sourceFolderId &&
      session.draggingItem.kind === 'icon' &&
      !hasIconRepresentation(result.items, normalizedResultSlots, session.draggingItem.key)
    ) {
      commitOuterLayout(originalItems, originalSlots)
      return
    }

    const finalized = finalizeFolderExtractionInOuterLayout(
      result.items,
      normalizedResultSlots,
      session.sourceFolderId
    )
    commitOuterLayout(finalized.items, finalized.slots)
  }

  const resolveFolderSecondSlotCenter = (
    targetId: string
  ): { x: number; y: number; size: number } | null => {
    const targetNode = tileRefs.current.get(targetId)
    if (!targetNode) return null

    const rect = targetNode.getBoundingClientRect()
    const iconSize = iconConfig.imgSize
    const frameSize = getFolderPreviewFrameSize(iconSize)
    const slotSize = getFolderPreviewSlotSize(iconSize)
    const frameLeft = rect.left + (rect.width - frameSize) / 2
    const frameTop = rect.top + FOLDER_PREVIEW_TOP_OFFSET - FOLDER_PREVIEW_OUTER_EXPAND
    const slotLeft =
      frameLeft +
      FOLDER_PREVIEW_OUTER_EXPAND +
      FOLDER_PREVIEW_PADDING +
      slotSize +
      FOLDER_PREVIEW_GAP
    const slotTop = frameTop + FOLDER_PREVIEW_OUTER_EXPAND + FOLDER_PREVIEW_PADDING

    return {
      x: slotLeft + slotSize / 2,
      y: slotTop + slotSize / 2,
      size: slotSize,
    }
  }

  const commitOuterLayout = (nextItems: GridItem[], nextSlotsInput: Array<string | null>) => {
    const normalizedSlots = normalizeOuterSlots(
      nextSlotsInput,
      nextItems.map(getId),
      pageSizeRef.current
    )
    itemsRef.current = nextItems
    outerSlotsRef.current = normalizedSlots
    setItems(nextItems)
    setOuterSlots(normalizedSlots)
  }

  const commitDockLayout = (nextDockKeys: string[]) => {
    dockKeysRef.current = nextDockKeys
    setDockKeys(nextDockKeys)
  }

  const scheduleFolderCreateTransition = (folderId: string | null) => {
    if (folderCreateTransitionTimerRef.current !== null) {
      window.clearTimeout(folderCreateTransitionTimerRef.current)
      folderCreateTransitionTimerRef.current = null
    }
    setFolderCreateTransitionTargetId(folderId)
    if (!folderId) return
    folderCreateTransitionTimerRef.current = window.setTimeout(() => {
      setFolderCreateTransitionTargetId(prev => (prev === folderId ? null : prev))
      folderCreateTransitionTimerRef.current = null
    }, 34)
  }

  const resolveCreatedFolderId = (
    session: DragState,
    result: { items: GridItem[]; slots: Array<string | null> }
  ): string | null => {
    const targetId = session.folderPreviewTargetId
    if (!targetId) return null
    const targetSlotIndex = session.workingOrder.findIndex(slot => slot === targetId)
    if (targetSlotIndex < 0 || targetSlotIndex >= result.slots.length) return null
    const candidateId = result.slots[targetSlotIndex]
    if (!candidateId) return null
    const createdFolder = result.items.find(
      item => item.kind === 'folder' && getId(item) === candidateId
    )
    return createdFolder ? candidateId : null
  }

  const resetDropVisuals = () => {
    if (folderDropFlightTimerRef.current !== null) {
      window.clearTimeout(folderDropFlightTimerRef.current)
      folderDropFlightTimerRef.current = null
    }
    if (folderCreateTransitionTimerRef.current !== null) {
      window.clearTimeout(folderCreateTransitionTimerRef.current)
      folderCreateTransitionTimerRef.current = null
    }
    setFolderDropFlight(null)
    setFolderPreviewFreezeTargetId(null)
    setFolderCreateTransitionTargetId(null)
    setHiddenOuterItemIds([])
    setFrozenOuterOrder(null)
  }

  const finishDrag = (pointerId: number): boolean => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return false
    clearEdgeSwitchTimer()

    if (current.dockPreviewIndex !== null && current.draggingItem.kind === 'icon') {
      resetDropVisuals()
      const nextDockKeys = applyDockDrop(
        dockKeysRef.current,
        current.draggingItem.key,
        current.dockPreviewIndex,
        dockCapacity
      )
      commitDockLayout(nextDockKeys)
      dragRef.current = null
      setDragState(null)
      return true
    }

    if (current.context === 'folder') {
      const folderMap = getFolderMapById(current.sourceFolderId, itemsRef.current)
      const target = current.hoverTargetId ? folderMap.get(current.hoverTargetId) : null
      const hasValidHoverTarget = Boolean(current.hoverTargetId && target)
      const dropOrder =
        hasValidHoverTarget && current.hoverTargetId
          ? current.hoverZone === 'center' &&
            current.draggingItem.kind === 'icon' &&
            target?.kind === 'icon'
            ? (() => {
                const targetIndex = current.workingOrder.indexOf(current.hoverTargetId)
                if (targetIndex < 0) return current.workingOrder
                return moveDragHoleToIndex(current.workingOrder, targetIndex)
              })()
            : current.workingOrder
          : resolveNearestDropOrderByContext(current)

      setItems(base => {
        if (!current.sourceFolderId || current.draggingItem.kind !== 'icon') return base
        const children = getFolderChildrenById(base, current.sourceFolderId)
        if (children.length === 0) return base
        const map = new Map<string, IconItem>()
        children.forEach(child => map.set(child.key, child))
        map.set(current.draggingId, current.draggingItem)
        const nextOrder = [...dropOrder]
        const holeIndex = nextOrder.indexOf(DRAG_HOLE_ID)
        if (holeIndex < 0) return base
        nextOrder[holeIndex] = current.draggingId
        const normalized = nextOrder.filter((id): id is string => id !== null)
        const nextChildren = normalized
          .map(id => map.get(id))
          .filter((item): item is IconItem => Boolean(item))
        if (nextChildren.length !== children.length) return base
        return replaceFolderChildren(base, current.sourceFolderId, nextChildren)
      })
    } else {
      const outerMap = new Map<string, GridItem>()
      itemsRef.current.forEach(item => outerMap.set(getId(item), item))
      const source = current.draggingItem
      const existingFolderTarget = current.hoverTargetId
        ? outerMap.get(current.hoverTargetId)
        : null
      const canAddToExistingFolder =
        source.kind === 'icon' &&
        existingFolderTarget?.kind === 'folder' &&
        current.hoverIou >= OUTER_DRAG_RULES.folderOverlapThreshold
      const folderTarget =
        current.folderPreviewTargetId !== null ? outerMap.get(current.folderPreviewTargetId) : null
      const canCreateFolder =
        current.folderPreviewTargetId !== null &&
        source.kind === 'icon' &&
        folderTarget?.kind === 'icon'

      if (canAddToExistingFolder) {
        setFolderPreviewFreezeTargetId(null)
        scheduleFolderCreateTransition(null)
        setHiddenOuterItemIds([])
        setFrozenOuterOrder(null)
        const originalItems = itemsRef.current
        const originalSlots = outerSlotsRef.current
        const baseForDrop = extractDraggedIconFromSourceFolder(originalItems, current)
        const result = applyAddToFolderFromSession(
          baseForDrop,
          current,
          current.hoverTargetId as string
        )
        commitOuterSessionResult(current, originalItems, originalSlots, result)
      } else if (canCreateFolder) {
        const targetId = current.folderPreviewTargetId as string
        const sourceItem = source.kind === 'icon' ? source : null
        const slotCenter = resolveFolderSecondSlotCenter(targetId)
        if (sourceItem && slotCenter) {
          if (folderDropFlightTimerRef.current !== null) {
            window.clearTimeout(folderDropFlightTimerRef.current)
            folderDropFlightTimerRef.current = null
          }

          const flightId = folderDropFlightIdRef.current + 1
          folderDropFlightIdRef.current = flightId
          setFolderPreviewFreezeTargetId(targetId)
          setHiddenOuterItemIds([current.draggingId, targetId])
          setFrozenOuterOrder(
            current.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
          )
          setFolderDropFlight({
            id: flightId,
            icon: sourceItem.icon,
            startX: current.pointerX,
            startY: current.pointerY,
            startSize: iconConfig.imgSize,
            endX: slotCenter.x,
            endY: slotCenter.y,
            endSize: slotCenter.size,
            animate: false,
          })

          folderDropFlightTimerRef.current = window.setTimeout(() => {
            const originalItems = itemsRef.current
            const originalSlots = outerSlotsRef.current
            const baseForDrop = extractDraggedIconFromSourceFolder(originalItems, current)
            const result = applyFolderCreateFromSession(baseForDrop, current)
            const createdFolderId = resolveCreatedFolderId(current, result)
            commitOuterSessionResult(current, originalItems, originalSlots, result)
            scheduleFolderCreateTransition(createdFolderId)
            setFolderDropFlight(prev => (prev && prev.id === flightId ? null : prev))
            setFolderPreviewFreezeTargetId(prev => (prev === targetId ? null : prev))
            setHiddenOuterItemIds(prev =>
              prev.length === 2 && prev.includes(current.draggingId) && prev.includes(targetId)
                ? []
                : prev
            )
            setFrozenOuterOrder(prev =>
              prev && prev.some(slot => slot === current.draggingId || slot === targetId)
                ? null
                : prev
            )
            folderDropFlightTimerRef.current = null
          }, reorderAnimationMs + 30)
        } else {
          setFolderPreviewFreezeTargetId(null)
          scheduleFolderCreateTransition(null)
          setHiddenOuterItemIds([])
          setFrozenOuterOrder(null)
          const originalItems = itemsRef.current
          const originalSlots = outerSlotsRef.current
          const baseForDrop = extractDraggedIconFromSourceFolder(originalItems, current)
          const result = applyFolderCreateFromSession(baseForDrop, current)
          const createdFolderId = resolveCreatedFolderId(current, result)
          commitOuterSessionResult(current, originalItems, originalSlots, result)
          scheduleFolderCreateTransition(createdFolderId)
        }
      } else {
        setFolderPreviewFreezeTargetId(null)
        scheduleFolderCreateTransition(null)
        setHiddenOuterItemIds([])
        setFrozenOuterOrder(null)
        const originalItems = itemsRef.current
        const originalSlots = outerSlotsRef.current
        const baseForDrop = extractDraggedIconFromSourceFolder(originalItems, current)
        const result = applyOuterDropFromSession({
          base: baseForDrop,
          session: current,
          pageSize: pageSizeRef.current,
          columns,
          resolveNearestSlotIndexByContext,
        })
        commitOuterSessionResult(current, originalItems, originalSlots, result)
      }
    }

    dragRef.current = null
    setDragState(null)
    return true
  }

  useEffect(() => {
    if (!folderDropFlight || folderDropFlight.animate) return
    const raf = requestAnimationFrame(() => {
      setFolderDropFlight(prev => (prev ? { ...prev, animate: true } : prev))
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [folderDropFlight])

  useEffect(
    () => () => {
      if (folderDropFlightTimerRef.current !== null) {
        window.clearTimeout(folderDropFlightTimerRef.current)
        folderDropFlightTimerRef.current = null
      }
      if (folderCreateTransitionTimerRef.current !== null) {
        window.clearTimeout(folderCreateTransitionTimerRef.current)
        folderCreateTransitionTimerRef.current = null
      }
    },
    []
  )

  return {
    folderDropFlight,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    resetDropVisuals,
    finishDrag,
  }
}
