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
import { compactEmptyPages, DRAG_HOLE_ID } from '../domain/slots'
import { moveDragHoleToIndex } from '../domain/evasionPolicy'
import {
  finalizeFolderExtractionInTopLevelLayout,
  findFolderIdContainingChild,
  getFolderChildSelectionsByIds,
  getFolderChildrenById,
  replaceFolderChildren,
} from '../domain/folderPolicy'
import {
  applyMultiOuterDropFromSession,
  applyAddToFolderFromSession,
  applyFolderCreateFromSession,
  applyOuterDropFromSession,
} from './scrollDropPolicy'
import { normalizeDockKeys, resolveOuterItemIds } from '../domain/dock'
import type { DragState, FolderDropFlight, MultiDropFlightItem } from '../state/types'
import { OUTER_DRAG_RULES } from '../constants'
import {
  FOLDER_PREVIEW_GAP,
  FOLDER_PREVIEW_OUTER_EXPAND,
  FOLDER_PREVIEW_PADDING,
  FOLDER_PREVIEW_TOP_OFFSET,
  getFolderPreviewFrameSize,
  getFolderPreviewSlotSize,
} from '../views/FolderVisuals'
import { normalizeOuterSlots } from '../domain/topLevelLayout'
import {
  compactOuterSlotsWithinPages,
  preserveCompactPreviewOrderForCommit,
} from './scrollTopLevelLayout'

interface IconConfigLike {
  imgSize: number
}

interface UseDragDropCommitParams {
  reorderAnimationMs: number
  iconConfig: IconConfigLike
  columns: number
  outerDropMode?: 'paged' | 'compact-page'
  getOuterMinPageCount?: () => number
  pageSizeRef: MutableRefObject<number>
  tileRefs: MutableRefObject<Map<string, HTMLDivElement>>
  itemsRef: MutableRefObject<GridItem[]>
  outerSlotsRef: MutableRefObject<Array<string | null>>
  dockKeysRef: MutableRefObject<Array<string | null>>
  setItems: Dispatch<SetStateAction<GridItem[]>>
  setOuterSlots: Dispatch<SetStateAction<Array<string | null>>>
  setDockKeys: Dispatch<SetStateAction<Array<string | null>>>
  dragRef: MutableRefObject<DragState | null>
  setDragState: Dispatch<SetStateAction<DragState | null>>
  clearEdgeSwitchTimer: () => void
  resolveNearestDropOrderByContext: (state: DragState) => Array<string | null>
  resolveNearestSlotIndexByContext: (state: DragState) => number | null
  onFolderCreateCommitted?: (session: DragState, createdFolderId: string, targetId: string) => void
}

interface UseDragDropCommitResult {
  folderDropFlight: FolderDropFlight | null
  multiDropFlight: MultiDropFlightItem[] | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  frozenOuterOrder: Array<string | null> | null
  resetDropVisuals: () => void
  commitIntoExistingFolderForAutoOpen: (
    session: DragState,
    targetFolderId: string
  ) => IconItem[] | null
  finishDrag: (pointerId: number) => boolean
}

export function useScrollableDragDropCommit({
  reorderAnimationMs,
  iconConfig,
  columns,
  outerDropMode = 'paged',
  getOuterMinPageCount,
  pageSizeRef,
  tileRefs,
  itemsRef,
  outerSlotsRef,
  dockKeysRef,
  setItems,
  setOuterSlots,
  setDockKeys,
  dragRef,
  setDragState,
  clearEdgeSwitchTimer,
  resolveNearestDropOrderByContext,
  resolveNearestSlotIndexByContext,
  onFolderCreateCommitted,
}: UseDragDropCommitParams): UseDragDropCommitResult {
  const folderDropFlightTimerRef = useRef<number | null>(null)
  const multiDropFlightTimerRef = useRef<number | null>(null)
  const multiDropFlightRafRef = useRef<number | null>(null)
  const folderCreateTransitionTimerRef = useRef<number | null>(null)
  const folderDropFlightIdRef = useRef(0)
  const [folderDropFlight, setFolderDropFlight] = useState<FolderDropFlight | null>(null)
  const [multiDropFlight, setMultiDropFlight] = useState<MultiDropFlightItem[] | null>(null)
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

  const hasIconRepresentation = (items: GridItem[], iconKey: string): boolean => {
    return items.some(
      item =>
        (item.kind === 'icon' && item.key === iconKey) ||
        (item.kind === 'folder' && item.children.some(child => child.key === iconKey))
    )
  }

  const resolveSourceTopLevelContext = (session: DragState): 'outer' | 'dock' | null => {
    if (findFolderIdContainingChild(itemsRef.current, session.draggingId)) return null
    return dockKeysRef.current.includes(session.draggingId) ? 'dock' : 'outer'
  }

  const filterItemsByIds = (items: GridItem[], ids: string[]) => {
    const idSet = new Set(ids)
    return items.filter(item => idSet.has(getId(item)))
  }

  const extractDraggedIconsFromSourceFolders = (
    base: GridItem[],
    session: DragState
  ): GridItem[] => {
    const draggedIds = session.draggingIds.length > 0 ? session.draggingIds : [session.draggingId]
    const selectedChildrenByFolderId = getFolderChildSelectionsByIds(base, draggedIds)
    if (selectedChildrenByFolderId.size === 0) return base

    let nextBase = base
    const extractedById = new Map<string, IconItem>()
    selectedChildrenByFolderId.forEach((children, folderId) => {
      children.forEach(child => {
        extractedById.set(child.key, child)
      })
      const draggedIdSet = new Set(children.map(child => child.key))
      const nextChildren = getFolderChildrenById(nextBase, folderId).filter(
        child => !draggedIdSet.has(child.key)
      )
      nextBase = replaceFolderChildren(nextBase, folderId, nextChildren, {
        collapseSingleChild: false,
      })
    })

    const existingIds = new Set(nextBase.map(getId))
    const extractedItems = Array.from(extractedById.values()).filter(
      child => !existingIds.has(child.key)
    )
    if (extractedItems.length === 0) {
      return nextBase
    }

    return [...nextBase, ...extractedItems]
  }

  const commitLayouts = (
    nextItems: GridItem[],
    nextOuterSlotsInput: Array<string | null>,
    nextDockKeysInput: Array<string | null>
  ) => {
    const nextItemIds = nextItems.map(getId)
    const normalizedDockKeys = normalizeDockKeys(nextDockKeysInput, nextItemIds)
    const nextOuterItemIds = resolveOuterItemIds(nextItemIds, normalizedDockKeys)
    const normalizedOuterSlots = normalizeOuterSlots(
      nextOuterSlotsInput,
      filterItemsByIds(nextItems, nextOuterItemIds),
      pageSizeRef.current,
      Math.max(1, columns)
    )
    const compactedOuterSlots =
      outerDropMode === 'compact-page'
        ? compactOuterSlotsWithinPages(
            normalizedOuterSlots,
            filterItemsByIds(nextItems, nextOuterItemIds),
            pageSizeRef.current,
            Math.max(1, columns),
            getOuterMinPageCount?.()
          )
        : compactEmptyPages(normalizedOuterSlots, pageSizeRef.current)
    itemsRef.current = nextItems
    outerSlotsRef.current = compactedOuterSlots
    dockKeysRef.current = normalizedDockKeys
    setItems(nextItems)
    setOuterSlots(compactedOuterSlots)
    setDockKeys(normalizedDockKeys)
  }

  const commitTopLevelSessionResult = (
    session: DragState,
    originalItems: GridItem[],
    originalOuterSlots: Array<string | null>,
    originalDockKeys: Array<string | null>,
    targetContext: 'outer' | 'dock',
    result: { items: GridItem[]; slots: Array<string | null> }
  ) => {
    if (
      session.sourceFolderId &&
      session.draggingItem.kind === 'icon' &&
      !hasIconRepresentation(result.items, session.draggingItem.key)
    ) {
      commitLayouts(originalItems, originalOuterSlots, originalDockKeys)
      return
    }

    const draggedDockIdSet = new Set(
      session.draggingIds.filter(id => originalDockKeys.includes(id))
    )
    const nextOuterSlots = targetContext === 'outer' ? result.slots : originalOuterSlots
    let nextDockKeys = targetContext === 'dock' ? [...result.slots] : [...originalDockKeys]
    if (targetContext !== 'dock' && draggedDockIdSet.size > 0) {
      nextDockKeys = nextDockKeys.map(key =>
        typeof key === 'string' && draggedDockIdSet.has(key) ? null : key
      )
    }

    const draggedFolderIds: string[] = Array.from(
      getFolderChildSelectionsByIds(
        originalItems,
        session.draggingIds.length > 0 ? session.draggingIds : [session.draggingId]
      ).keys()
    )
    let finalized = {
      items: result.items,
      outerSlots: nextOuterSlots,
      dockKeys: nextDockKeys,
    }
    draggedFolderIds.forEach(folderId => {
      finalized = finalizeFolderExtractionInTopLevelLayout(
        finalized.items,
        finalized.outerSlots,
        finalized.dockKeys,
        folderId
      )
    })
    commitLayouts(finalized.items, finalized.outerSlots, finalized.dockKeys)
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

  const getMultiDragStackOffset = (index: number) => {
    if (index <= 0) {
      return { x: 0, y: 0 }
    }

    return {
      x: Math.min(14, index * 3),
      y: 10 + (index - 1) * 10,
    }
  }

  const getMultiDragStackScale = (index: number) => {
    if (index <= 0) return 1
    return Math.max(0.72, 0.94 - (index - 1) * 0.06)
  }

  const getMultiDragStackOpacity = (index: number) => {
    if (index <= 0) return 1
    return Math.max(0.38, 0.8 - (index - 1) * 0.12)
  }

  const resolveElementTranslate = (node: HTMLElement): { x: number; y: number } => {
    const transform = window.getComputedStyle(node).transform
    if (!transform || transform === 'none') {
      return { x: 0, y: 0 }
    }

    try {
      const matrix = new DOMMatrixReadOnly(transform)
      return { x: matrix.m41, y: matrix.m42 }
    } catch {
      return { x: 0, y: 0 }
    }
  }

  const resolveIconFlightTarget = (id: string): { left: number; top: number } | null => {
    const tileNode = tileRefs.current.get(id)
    if (!tileNode) return null

    const imageNode = tileNode.querySelector<HTMLElement>('.icon-image')
    const rect = (imageNode ?? tileNode).getBoundingClientRect()
    const translate = resolveElementTranslate(tileNode)
    return {
      left: rect.left - translate.x + (rect.width - iconConfig.imgSize) / 2,
      top: rect.top - translate.y + (rect.height - iconConfig.imgSize) / 2,
    }
  }

  const scheduleMultiDropFlight = (session: DragState) => {
    if (multiDropFlightTimerRef.current !== null) {
      window.clearTimeout(multiDropFlightTimerRef.current)
      multiDropFlightTimerRef.current = null
    }
    if (multiDropFlightRafRef.current !== null) {
      cancelAnimationFrame(multiDropFlightRafRef.current)
      multiDropFlightRafRef.current = null
    }

    multiDropFlightRafRef.current = requestAnimationFrame(() => {
      const itemMap = new Map<string, GridItem>()
      itemsRef.current.forEach(item => itemMap.set(getId(item), item))

      const flights = session.draggingIds.flatMap((id, index) => {
        const item = id === session.draggingId ? session.draggingItem : itemMap.get(id)
        if (!item || item.kind !== 'icon') {
          return []
        }

        const target = resolveIconFlightTarget(id)
        if (!target) {
          return []
        }

        const offset = getMultiDragStackOffset(index)
        return [
          {
            id,
            icon: item.icon,
            startLeft: session.pointerX - iconConfig.imgSize / 2 + offset.x,
            startTop: session.pointerY - iconConfig.imgSize / 2 + offset.y,
            endLeft: target.left,
            endTop: target.top,
            startScale: getMultiDragStackScale(index),
            endScale: 1,
            startOpacity: getMultiDragStackOpacity(index),
            endOpacity: 1,
            animate: false,
            zIndex: 50 - index,
          },
        ]
      })

      multiDropFlightRafRef.current = null
      if (flights.length === 0) {
        setHiddenOuterItemIds([])
        return
      }

      setMultiDropFlight(flights)
      multiDropFlightTimerRef.current = window.setTimeout(() => {
        setMultiDropFlight(null)
        setHiddenOuterItemIds(prev => prev.filter(id => !session.draggingIds.includes(id)))
        multiDropFlightTimerRef.current = null
      }, reorderAnimationMs + 60)
    })
  }

  const resetDropVisuals = () => {
    if (folderDropFlightTimerRef.current !== null) {
      window.clearTimeout(folderDropFlightTimerRef.current)
      folderDropFlightTimerRef.current = null
    }
    if (multiDropFlightTimerRef.current !== null) {
      window.clearTimeout(multiDropFlightTimerRef.current)
      multiDropFlightTimerRef.current = null
    }
    if (multiDropFlightRafRef.current !== null) {
      cancelAnimationFrame(multiDropFlightRafRef.current)
      multiDropFlightRafRef.current = null
    }
    if (folderCreateTransitionTimerRef.current !== null) {
      window.clearTimeout(folderCreateTransitionTimerRef.current)
      folderCreateTransitionTimerRef.current = null
    }
    setFolderDropFlight(null)
    setMultiDropFlight(null)
    setFolderPreviewFreezeTargetId(null)
    setFolderCreateTransitionTargetId(null)
    setHiddenOuterItemIds([])
    setFrozenOuterOrder(null)
  }

  const resolveCompactPreviewResult = (
    base: GridItem[],
    session: DragState
  ): { items: GridItem[]; slots: Array<string | null> } | null => {
    if (outerDropMode !== 'compact-page' || session.previewSlotIndex === null) return null
    const draggingIds = session.draggingIds.length > 0 ? session.draggingIds : [session.draggingId]
    if (!draggingIds.every(id => session.workingOrder.includes(id))) return null

    const previewSlots = preserveCompactPreviewOrderForCommit(session.workingOrder, base)
    if (!previewSlots) return null

    return {
      items: base,
      slots: previewSlots,
    }
  }

  const commitIntoExistingFolderForAutoOpen = (
    session: DragState,
    targetFolderId: string
  ): IconItem[] | null => {
    if (session.context === 'folder' || session.draggingItem.kind !== 'icon') return null

    const originalItems = itemsRef.current
    const targetFolder = originalItems.find(
      item => item.kind === 'folder' && getId(item) === targetFolderId
    )
    if (!targetFolder || targetFolder.kind !== 'folder') return null

    const originalOuterSlots = outerSlotsRef.current
    const originalDockKeys = dockKeysRef.current
    const baseForDrop = extractDraggedIconsFromSourceFolders(originalItems, session)
    const result = applyAddToFolderFromSession(baseForDrop, session, targetFolderId)
    const nextTargetFolder = result.items.find(
      item => item.kind === 'folder' && getId(item) === targetFolderId
    )
    if (
      !nextTargetFolder ||
      nextTargetFolder.kind !== 'folder' ||
      !nextTargetFolder.children.some(child => child.key === session.draggingId)
    ) {
      return null
    }

    resetDropVisuals()
    commitTopLevelSessionResult(
      session,
      originalItems,
      originalOuterSlots,
      originalDockKeys,
      session.context,
      result
    )
    return nextTargetFolder.children
  }

  const finishDrag = (pointerId: number): boolean => {
    const current = dragRef.current
    if (!current || current.pointerId !== pointerId) return false
    clearEdgeSwitchTimer()

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
      const isMultiTopLevelDrag = current.draggingIds.length > 1
      const targetContext: 'outer' | 'dock' = current.context
      const topLevelMap = new Map<string, GridItem>()
      itemsRef.current.forEach(item => topLevelMap.set(getId(item), item))
      const source = current.draggingItem
      const sourceTopLevelContext = resolveSourceTopLevelContext(current)
      const switchingContainers =
        sourceTopLevelContext !== null && sourceTopLevelContext !== current.context
      const hasExplicitDropTarget =
        current.previewSlotIndex !== null ||
        current.folderPreviewTargetId !== null ||
        current.hoverTargetId !== null
      if ((current.sourceFolderId || switchingContainers) && !hasExplicitDropTarget) {
        resetDropVisuals()
        dragRef.current = null
        setDragState(null)
        return true
      }

      const addToFolderTargetId =
        current.folderPreviewTargetId ??
        (current.hoverTargetId &&
        current.hoverZone === 'center' &&
        current.hoverIou >= OUTER_DRAG_RULES.folderOverlapThreshold
          ? current.hoverTargetId
          : null)
      const existingFolderTarget = addToFolderTargetId ? topLevelMap.get(addToFolderTargetId) : null
      const canAddToExistingFolder =
        source.kind === 'icon' &&
        existingFolderTarget?.kind === 'folder' &&
        addToFolderTargetId !== null
      const folderTarget =
        current.folderPreviewTargetId !== null
          ? topLevelMap.get(current.folderPreviewTargetId)
          : null
      const canCreateFolder =
        current.folderPreviewTargetId !== null &&
        source.kind === 'icon' &&
        folderTarget?.kind === 'icon'
      const originalItems = itemsRef.current
      const originalOuterSlots = outerSlotsRef.current
      const originalDockKeys = dockKeysRef.current
      const baseForDrop = extractDraggedIconsFromSourceFolders(originalItems, current)
      const compactPreviewResult =
        targetContext === 'outer' ? resolveCompactPreviewResult(baseForDrop, current) : null

      if (canAddToExistingFolder) {
        setFolderPreviewFreezeTargetId(null)
        scheduleFolderCreateTransition(null)
        setHiddenOuterItemIds([])
        setFrozenOuterOrder(null)
        const result = applyAddToFolderFromSession(
          baseForDrop,
          current,
          addToFolderTargetId as string
        )
        commitTopLevelSessionResult(
          current,
          originalItems,
          originalOuterSlots,
          originalDockKeys,
          targetContext,
          result
        )
      } else if (isMultiTopLevelDrag) {
        setFolderPreviewFreezeTargetId(null)
        scheduleFolderCreateTransition(null)
        setFrozenOuterOrder(null)
        if (targetContext === 'outer') {
          setHiddenOuterItemIds(current.draggingIds)
        } else {
          setHiddenOuterItemIds([])
        }
        const result =
          compactPreviewResult ??
          applyMultiOuterDropFromSession({
            base: baseForDrop,
            session: current,
            pageSize: pageSizeRef.current,
            columns,
            resolveNearestSlotIndexByContext,
            mode: targetContext === 'dock' ? 'linear' : outerDropMode,
            sourceSlots: targetContext === 'dock' ? originalDockKeys : originalOuterSlots,
            minPageCount: targetContext === 'outer' ? getOuterMinPageCount?.() : undefined,
          })
        commitTopLevelSessionResult(
          current,
          originalItems,
          originalOuterSlots,
          originalDockKeys,
          targetContext,
          result
        )
        if (targetContext === 'outer') {
          scheduleMultiDropFlight(current)
        }
      } else if (canCreateFolder) {
        const targetId = current.folderPreviewTargetId as string
        const sourceItem = source.kind === 'icon' ? source : null
        const slotCenter =
          targetContext === 'outer' ? resolveFolderSecondSlotCenter(targetId) : null
        if (targetContext === 'outer' && sourceItem && slotCenter) {
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
            const result = applyFolderCreateFromSession(baseForDrop, current)
            const createdFolderId = resolveCreatedFolderId(current, result)
            commitTopLevelSessionResult(
              current,
              originalItems,
              originalOuterSlots,
              originalDockKeys,
              targetContext,
              result
            )
            if (createdFolderId) {
              onFolderCreateCommitted?.(current, createdFolderId, targetId)
            }
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
          const result = applyFolderCreateFromSession(baseForDrop, current)
          const createdFolderId = resolveCreatedFolderId(current, result)
          commitTopLevelSessionResult(
            current,
            originalItems,
            originalOuterSlots,
            originalDockKeys,
            targetContext,
            result
          )
          if (createdFolderId) {
            onFolderCreateCommitted?.(current, createdFolderId, targetId)
          }
          scheduleFolderCreateTransition(createdFolderId)
        }
      } else {
        setFolderPreviewFreezeTargetId(null)
        scheduleFolderCreateTransition(null)
        setHiddenOuterItemIds([])
        setFrozenOuterOrder(null)
        const result =
          compactPreviewResult ??
          applyOuterDropFromSession({
            base: baseForDrop,
            session: current,
            pageSize: pageSizeRef.current,
            columns,
            resolveNearestSlotIndexByContext,
            mode: targetContext === 'dock' ? 'linear' : outerDropMode,
            sourceSlots: targetContext === 'dock' ? originalDockKeys : originalOuterSlots,
            minPageCount: targetContext === 'outer' ? getOuterMinPageCount?.() : undefined,
          })
        commitTopLevelSessionResult(
          current,
          originalItems,
          originalOuterSlots,
          originalDockKeys,
          targetContext,
          result
        )
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

  useEffect(() => {
    if (!multiDropFlight || multiDropFlight.every(item => item.animate)) return
    const raf = requestAnimationFrame(() => {
      setMultiDropFlight(prev => (prev ? prev.map(item => ({ ...item, animate: true })) : prev))
    })
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [multiDropFlight])

  useEffect(
    () => () => {
      if (folderDropFlightTimerRef.current !== null) {
        window.clearTimeout(folderDropFlightTimerRef.current)
        folderDropFlightTimerRef.current = null
      }
      if (multiDropFlightTimerRef.current !== null) {
        window.clearTimeout(multiDropFlightTimerRef.current)
        multiDropFlightTimerRef.current = null
      }
      if (multiDropFlightRafRef.current !== null) {
        cancelAnimationFrame(multiDropFlightRafRef.current)
        multiDropFlightRafRef.current = null
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
    multiDropFlight,
    folderPreviewFreezeTargetId,
    folderCreateTransitionTargetId,
    hiddenOuterItemIds,
    frozenOuterOrder,
    resetDropVisuals,
    commitIntoExistingFolderForAutoOpen,
    finishDrag,
  }
}
