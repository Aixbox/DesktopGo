import { getCurrentLanguage } from '../../../lib/i18n'
import type { FolderLayoutProfile } from './folderLayout'
import { resolveFolderDropCapacity } from './folderLayout'
import type { DragState } from '../state/types'
import type { GridItem } from '../model'

export const buildDragAnnouncement = ({
  dragState,
  itemById,
  folderLayoutProfile,
  pageSize,
}: {
  dragState: DragState | null
  itemById: ReadonlyMap<string, GridItem>
  folderLayoutProfile: FolderLayoutProfile
  pageSize: number
}): string => {
  if (!dragState) return ''
  const count = Math.max(1, dragState.draggingIds.length)
  const targetId = dragState.folderPreviewTargetId ?? dragState.hoverTargetId
  const target = targetId ? itemById.get(targetId) : null
  const language = getCurrentLanguage()

  if (target?.kind === 'folder') {
    const capacity = resolveFolderDropCapacity(target.children.length, count, folderLayoutProfile)
    if (!capacity.accepted && capacity.remaining !== null) {
      return language === 'zh'
        ? `文件夹还可放入 ${capacity.remaining} 项`
        : `Folder can accept ${capacity.remaining} more item(s)`
    }
    return language === 'zh'
      ? `松开以放入文件夹“${target.name}”中的 ${count} 项`
      : `Release to place ${count} item(s) in ${target.name}`
  }

  if (dragState.previewSlotIndex !== null) {
    const page = Math.floor(dragState.previewSlotIndex / Math.max(1, pageSize)) + 1
    return language === 'zh'
      ? `将 ${count} 项移动到第 ${page} 页`
      : `Move ${count} item(s) to page ${page}`
  }

  return language === 'zh' ? `正在拖动 ${count} 项` : `Dragging ${count} item(s)`
}
