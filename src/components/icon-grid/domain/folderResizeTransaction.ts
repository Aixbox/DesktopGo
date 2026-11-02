import type { FolderSize } from '../model'
import {
  planItemResize,
  type ItemResizePlan,
  type ItemResizePlanInput,
} from './itemResizeTransaction'

export type FolderResizePlanInput = Omit<ItemResizePlanInput, 'itemId'> & { folderId: string }
export type FolderResizePlan = Omit<ItemResizePlan, 'itemId'> & {
  folderId: string
  size: FolderSize
}

/** Folder callers share the same atomic resize/reflow transaction as ordinary icons. */
export const planFolderResize = ({
  folderId,
  ...input
}: FolderResizePlanInput): FolderResizePlan | null => {
  const plan = planItemResize({ ...input, itemId: `folder:${folderId}` })
  if (!plan) return null
  return { ...plan, folderId }
}
