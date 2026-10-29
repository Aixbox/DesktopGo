import type { FolderLayoutProfile } from './folderLayout'
import { resolveFolderDropCapacity } from './folderLayout'
import type { IconItem } from '../model'

export type FolderDropRejectionReason = 'ok' | 'capacity-exceeded' | 'invalid-count'

export interface FolderDropTransaction {
  accepted: boolean
  currentCount: number
  incomingCount: number
  addedCount: number
  nextCount: number
  currentPageCount: number
  nextPageCount: number
  maxItems: number | null
  remaining: number | null
  capacityPerPage: number
  reason: FolderDropRejectionReason
  nextChildren: IconItem[]
}

/**
 * Plan a folder mutation without changing either the source or target.
 *
 * The caller can commit `nextChildren` and keep its original snapshot when the
 * plan is rejected. Incoming children are de-duplicated by key so a multi-drag
 * cannot consume capacity twice or create duplicate icons across pages.
 */
export const planFolderDropTransaction = ({
  currentChildren,
  incomingChildren,
  profile,
}: {
  currentChildren: readonly IconItem[]
  incomingChildren: readonly IconItem[]
  profile?: FolderLayoutProfile
}): FolderDropTransaction => {
  const existingKeys = new Set(currentChildren.map(child => child.key))
  const uniqueIncoming = incomingChildren.filter(child => {
    if (existingKeys.has(child.key)) return false
    existingKeys.add(child.key)
    return true
  })
  const capacity = resolveFolderDropCapacity(currentChildren.length, uniqueIncoming.length, profile)

  return {
    accepted: capacity.accepted,
    currentCount: currentChildren.length,
    incomingCount: incomingChildren.length,
    addedCount: uniqueIncoming.length,
    nextCount: currentChildren.length + uniqueIncoming.length,
    currentPageCount: capacity.currentPageCount,
    nextPageCount: capacity.nextPageCount,
    maxItems: capacity.maxItems,
    remaining: capacity.remaining,
    capacityPerPage: capacity.capacityPerPage,
    reason: capacity.reason,
    nextChildren: capacity.accepted
      ? [...currentChildren, ...uniqueIncoming]
      : [...currentChildren],
  }
}
