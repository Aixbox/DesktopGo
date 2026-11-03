import { OUTER_DRAG_RULES } from '../constants'
import type { GridItem } from '../model'
import type { OuterOverlapHit } from '../state/types'

/** Folder creation uses overlap, independently of the center-only auto-open area. */
export function canPreviewFolderOnOverlap(
  source: GridItem,
  target: GridItem,
  hit: OuterOverlapHit,
  multiDrag: boolean
): boolean {
  const canCreate = !multiDrag && source.kind === 'icon' && target.kind === 'icon'
  const canAdd = source.kind === 'icon' && target.kind === 'folder'
  return (canCreate || canAdd) && hit.iou >= OUTER_DRAG_RULES.folderOverlapThreshold
}

/** An existing folder's opening region also accepts a larger icon whose overlap ratio is small. */
export function canPreviewOuterFolder(
  source: GridItem,
  target: GridItem,
  hit: OuterOverlapHit,
  multiDrag: boolean
): boolean {
  return (
    canPreviewFolderOnOverlap(source, target, hit, multiDrag) ||
    (!multiDrag && source.kind === 'icon' && target.kind === 'folder' && hit.zone === 'center')
  )
}
