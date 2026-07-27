import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react'
import { translate } from '../../../lib/i18n'
import type { DragState } from '../state/types'
import type { FolderItem, GridItem, ScrollGroupMeta } from '../model'
import { getId, makeFolderId } from '../model'
import { clampNumber } from '../domain/geometry'
import {
  commitScrollGroupItemOrder,
  createScrollGroup,
  deleteScrollGroup,
  moveScrollGroupItem,
} from './scrollGroupLayout'

interface ExternalScrollPreviewSnapshot {
  groupId: string
  itemIds: string[]
  draggingIds: string[]
}

interface UseScrollGroupControllerParams {
  launchpadGridViewMode: 'paged' | 'scroll'
  dragState: DragState | null
  dragPointerRef: MutableRefObject<{ pointerX: number; pointerY: number } | null>
  containerRef: MutableRefObject<HTMLDivElement | null>
  pageCount: number
  currentPageRef: MutableRefObject<number>
  setCurrentPage: (page: number) => void
  scrollGroupsRef: MutableRefObject<ScrollGroupMeta[]>
  setScrollGroups: (groups: ScrollGroupMeta[]) => void
  itemsRef: MutableRefObject<GridItem[]>
  setItems: (items: GridItem[]) => void
  dockKeysRef: MutableRefObject<Array<string | null>>
  setDockKeys: (keys: Array<string | null>) => void
  externalScrollPreviewSnapshotRef: MutableRefObject<ExternalScrollPreviewSnapshot | null>
  retargetOuterDragToScrollGroup: (targetItemIds: string[]) => void
  syncOuterDragPreview: () => void
}

export function useScrollGroupController({
  launchpadGridViewMode,
  dragState,
  dragPointerRef,
  containerRef,
  pageCount,
  currentPageRef,
  setCurrentPage,
  scrollGroupsRef,
  setScrollGroups,
  itemsRef,
  setItems,
  dockKeysRef,
  setDockKeys,
  externalScrollPreviewSnapshotRef,
  retargetOuterDragToScrollGroup,
  syncOuterDragPreview,
}: UseScrollGroupControllerParams) {
  const [scrollSidebarDragActive, setScrollSidebarDragActive] = useState(false)
  const [scrollSidebarHoveredGroupId, setScrollSidebarHoveredGroupId] = useState<string | null>(
    null
  )
  const scrollSidebarDragActiveRef = useRef(false)
  const scrollSidebarHoveredGroupIdRef = useRef<string | null>(null)
  const retargetOuterDragToScrollGroupRef = useRef(retargetOuterDragToScrollGroup)
  const syncOuterDragPreviewRef = useRef(syncOuterDragPreview)

  useLayoutEffect(() => {
    retargetOuterDragToScrollGroupRef.current = retargetOuterDragToScrollGroup
    syncOuterDragPreviewRef.current = syncOuterDragPreview
  }, [retargetOuterDragToScrollGroup, syncOuterDragPreview])

  useEffect(() => {
    const publishSidebarFeedback = (active: boolean, groupId: string | null) => {
      const wasActive = scrollSidebarDragActiveRef.current
      if (scrollSidebarDragActiveRef.current !== active) {
        scrollSidebarDragActiveRef.current = active
        setScrollSidebarDragActive(active)
      }
      if (scrollSidebarHoveredGroupIdRef.current !== groupId) {
        scrollSidebarHoveredGroupIdRef.current = groupId
        setScrollSidebarHoveredGroupId(groupId)
      }
      if (wasActive && !active) syncOuterDragPreviewRef.current()
    }

    if (launchpadGridViewMode !== 'scroll' || dragState?.context !== 'outer') {
      publishSidebarFeedback(false, null)
      return
    }
    let frame = 0
    const detectSidebarTarget = () => {
      const pointer = dragPointerRef.current
      const target = pointer
        ? (document.elementFromPoint(pointer.pointerX, pointer.pointerY) as HTMLElement | null)
        : null
      const sidebar = target?.closest<HTMLElement>('[data-scroll-group-sidebar]') ?? null
      const groupTarget = sidebar
        ? (target?.closest<HTMLElement>('[data-scroll-group-id]') ?? null)
        : null
      const groupId = groupTarget?.dataset.scrollGroupId ?? null
      publishSidebarFeedback(Boolean(sidebar), groupId)
      if (groupId && groupId !== scrollGroupsRef.current[currentPageRef.current]?.id) {
        const targetPage = scrollGroupsRef.current.findIndex(group => group.id === groupId)
        const targetGroup = scrollGroupsRef.current[targetPage]
        if (targetPage >= 0 && targetGroup) {
          externalScrollPreviewSnapshotRef.current = null
          retargetOuterDragToScrollGroupRef.current(targetGroup.itemIds)
          currentPageRef.current = targetPage
          setCurrentPage(targetPage)
          containerRef.current?.scrollTo({ top: 0, behavior: 'auto' })
        }
      }
      frame = window.requestAnimationFrame(detectSidebarTarget)
    }
    detectSidebarTarget()
    return () => window.cancelAnimationFrame(frame)
  }, [
    containerRef,
    currentPageRef,
    dragPointerRef,
    dragState?.context,
    dragState?.dragStartedAt,
    externalScrollPreviewSnapshotRef,
    launchpadGridViewMode,
    scrollGroupsRef,
    setCurrentPage,
  ])

  const handleScrollGridActivePageChange = (page: number) => {
    const nextPage = clampNumber(page, 0, pageCount - 1)
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }
  const handleAddScrollGroup = (meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => {
    const group = createScrollGroup(meta.name, meta.icon, scrollGroupsRef.current)
    const nextGroups = [...scrollGroupsRef.current, group]
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
    const nextPage = nextGroups.length - 1
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }
  const handleEditScrollGroup = (page: number, meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => {
    const targetPage = clampNumber(page, 0, scrollGroupsRef.current.length - 1)
    const nextGroups = scrollGroupsRef.current.map((group, index) =>
      index === targetPage ? { ...group, ...meta } : group
    )
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }
  const handleReorderScrollGroup = (sourcePage: number, targetPage: number) => {
    const effectiveCount = Math.max(1, scrollGroupsRef.current.length)
    const safeSourcePage = clampNumber(sourcePage, 0, effectiveCount - 1)
    const safeTargetPage = clampNumber(targetPage, 0, effectiveCount - 1)
    if (safeSourcePage === safeTargetPage) return
    const nextGroups = [...scrollGroupsRef.current]
    const activeGroupId = nextGroups[currentPageRef.current]?.id
    const [movedGroup] = nextGroups.splice(safeSourcePage, 1)
    nextGroups.splice(safeTargetPage, 0, movedGroup)
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
    const nextPage = Math.max(
      0,
      nextGroups.findIndex(group => group.id === activeGroupId)
    )
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }
  const handleDeleteScrollGroup = (page: number) => {
    const targetPage = clampNumber(page, 0, scrollGroupsRef.current.length - 1)
    const targetId = scrollGroupsRef.current[targetPage]?.id
    if (!targetId) return
    const nextGroups = deleteScrollGroup(scrollGroupsRef.current, targetId)
    if (nextGroups === scrollGroupsRef.current) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
    const nextPage = clampNumber(
      currentPageRef.current >= targetPage ? targetPage - 1 : currentPageRef.current,
      0,
      nextGroups.length - 1
    )
    currentPageRef.current = nextPage
    setCurrentPage(nextPage)
  }
  const handleCommitScrollGroupItemOrder = (groupId: string, itemIds: string[]) => {
    const nextGroups = commitScrollGroupItemOrder(scrollGroupsRef.current, groupId, itemIds)
    if (nextGroups === scrollGroupsRef.current) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }
  const handleMoveScrollGroupItem = (itemId: string, targetGroupId: string) => {
    const nextGroups = moveScrollGroupItem(scrollGroupsRef.current, itemId, targetGroupId)
    if (nextGroups === scrollGroupsRef.current) return
    scrollGroupsRef.current = nextGroups
    setScrollGroups(nextGroups)
  }
  const handleMoveScrollGroupItemToDock = (itemId: string, targetIndex: number) => {
    const nextGroups = scrollGroupsRef.current.map(group => ({
      ...group,
      itemIds: group.itemIds.filter(id => id !== itemId),
    }))
    const compactDock = dockKeysRef.current.filter(
      (id): id is string => typeof id === 'string' && id !== itemId
    )
    compactDock.splice(clampNumber(targetIndex, 0, compactDock.length), 0, itemId)
    scrollGroupsRef.current = nextGroups
    dockKeysRef.current = compactDock
    setScrollGroups(nextGroups)
    setDockKeys(compactDock)
  }
  const handleMergeScrollGroupItems = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return
    const source = itemsRef.current.find(item => getId(item) === sourceId)
    const target = itemsRef.current.find(item => getId(item) === targetId)
    if (!source || source.kind !== 'icon' || !target) return
    let replacement: FolderItem
    if (target.kind === 'folder') {
      if (target.children.some(child => child.key === source.key)) return
      replacement = { ...target, children: [...target.children, source] }
    } else {
      replacement = {
        kind: 'folder',
        id: makeFolderId(),
        name: translate('New Folder'),
        size: '1x1',
        children: [target, source],
      }
    }
    const replacementId = getId(replacement)
    const nextItems = itemsRef.current.flatMap(item => {
      const id = getId(item)
      if (id === sourceId) return []
      if (id === targetId) return [replacement]
      return [item]
    })
    const nextGroups = scrollGroupsRef.current.map(group => ({
      ...group,
      itemIds: group.itemIds
        .filter(id => id !== sourceId)
        .map(id => (id === targetId ? replacementId : id)),
    }))
    itemsRef.current = nextItems
    scrollGroupsRef.current = nextGroups
    setItems(nextItems)
    setScrollGroups(nextGroups)
  }

  return {
    handleAddScrollGroup,
    handleCommitScrollGroupItemOrder,
    handleDeleteScrollGroup,
    handleEditScrollGroup,
    handleMergeScrollGroupItems,
    handleMoveScrollGroupItem,
    handleMoveScrollGroupItemToDock,
    handleReorderScrollGroup,
    handleScrollGridActivePageChange,
    scrollSidebarDragActive,
    scrollSidebarHoveredGroupId,
  }
}
