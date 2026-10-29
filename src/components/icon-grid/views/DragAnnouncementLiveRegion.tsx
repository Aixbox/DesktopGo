import { useMemo } from 'react'
import type { FolderLayoutProfile } from '../domain/folderLayout'
import { buildDragAnnouncement } from '../domain/dragAnnouncement'
import type { DragState } from '../state/types'
import type { GridItem } from '../model'

export function DragAnnouncementLiveRegion({
  dragState,
  itemById,
  folderLayoutProfile,
  pageSize,
}: {
  dragState: DragState | null
  itemById: ReadonlyMap<string, GridItem>
  folderLayoutProfile: FolderLayoutProfile
  pageSize: number
}) {
  const message = useMemo(
    () => buildDragAnnouncement({ dragState, itemById, folderLayoutProfile, pageSize }),
    [dragState, folderLayoutProfile, itemById, pageSize]
  )

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  )
}
