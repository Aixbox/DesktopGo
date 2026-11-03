import { translate } from '../../../lib/i18n'
import { asFolderChild, getId, makeFolderId } from '../model'
import type { FolderItem, GridItem, IconItem } from '../model'
import type { DragState } from '../state/types'
import { DRAG_HOLE_ID } from './slots'

/** Replace the target in place, preserving its workspace footprint. */
export const createFolderFromIcons = (target: IconItem, source: IconItem): FolderItem => ({
  kind: 'folder',
  id: makeFolderId(),
  name: translate('New Folder'),
  size: target.size ?? '1x1',
  children: [target, source].map(asFolderChild),
})

export const applyFolderCreateFromSession = (
  base: GridItem[],
  session: DragState
): { items: GridItem[]; slots: Array<string | null> } => {
  const slots = session.workingOrder.map(slot => (slot === DRAG_HOLE_ID ? null : slot))
  const source = session.draggingItem
  const targetId = session.folderPreviewTargetId
  const target = base.find(item => getId(item) === targetId)
  const targetIndex = targetId ? slots.indexOf(targetId) : -1
  if (
    source.kind !== 'icon' ||
    target?.kind !== 'icon' ||
    targetId === session.draggingId ||
    targetIndex < 0
  ) {
    return { items: base, slots }
  }

  const folder = createFolderFromIcons(target, source)
  const sourceIndex = slots.indexOf(session.draggingId)
  if (sourceIndex >= 0) slots[sourceIndex] = null
  slots[targetIndex] = getId(folder)
  const items = base.flatMap(item => {
    const id = getId(item)
    if (id === session.draggingId) return []
    return [id === targetId ? folder : item]
  })
  return { items, slots }
}
