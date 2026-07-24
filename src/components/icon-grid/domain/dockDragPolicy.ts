interface DockOverlapCandidateLike {
  targetId: string
  iou: number
  intersectionArea: number
  centerManhattanDistance: number
  targetIndex: number
}

export const buildDockLinearPreviewOrder = (
  order: Array<string | null>,
  targetId: string,
  placeAfter: boolean
): Array<string | null> => {
  if (!order.includes(null)) return order

  const compact = order.filter((slot): slot is string => typeof slot === 'string')
  const targetIndex = compact.indexOf(targetId)
  if (targetIndex < 0) return order

  const insertIndex = Math.max(
    0,
    Math.min(compact.length, placeAfter ? targetIndex + 1 : targetIndex)
  )
  const next: Array<string | null> = [...compact]
  next.splice(insertIndex, 0, null)
  return next
}

export interface DockOccupiedSlotEntry {
  displayIndex: number
  targetId: string
  targetIndex: number
}

export const buildDockOccupiedSlotEntries = (
  displaySlots: Array<string | null>
): DockOccupiedSlotEntry[] => {
  const occupied: DockOccupiedSlotEntry[] = []
  let compactIndex = 0

  displaySlots.forEach((targetId, displayIndex) => {
    if (typeof targetId !== 'string' || targetId.length === 0) return
    occupied.push({
      displayIndex,
      targetId,
      targetIndex: compactIndex,
    })
    compactIndex += 1
  })

  return occupied
}

export const resolveDockInsertIndexByDisplayIndex = (
  displaySlots: Array<string | null>,
  displayIndex: number
): number => {
  if (displayIndex <= 0) return 0
  return buildDockOccupiedSlotEntries(displaySlots).filter(
    entry => entry.displayIndex < displayIndex
  ).length
}

export const resolveDockInsertIndexFromCenters = (pointerX: number, centers: number[]): number => {
  if (centers.length === 0) return 0
  if (pointerX <= centers[0]) return 0

  for (let index = 0; index < centers.length - 1; index += 1) {
    const midpoint = (centers[index] + centers[index + 1]) / 2
    if (pointerX < midpoint) {
      return index + 1
    }
  }

  return centers.length
}

const pickBestDockOverlapCandidate = <T extends DockOverlapCandidateLike>(
  candidates: T[]
): T | null => {
  let best: T | null = null

  candidates.forEach(candidate => {
    if (!best) {
      best = candidate
      return
    }
    if (candidate.iou > best.iou) {
      best = candidate
      return
    }
    if (candidate.iou < best.iou) return
    if (candidate.intersectionArea > best.intersectionArea) {
      best = candidate
      return
    }
    if (candidate.intersectionArea < best.intersectionArea) return
    if (candidate.centerManhattanDistance < best.centerManhattanDistance) {
      best = candidate
      return
    }
    if (candidate.centerManhattanDistance > best.centerManhattanDistance) return
    if (candidate.targetIndex < best.targetIndex) {
      best = candidate
    }
  })

  return best
}

export const selectDockOverlapCandidate = <T extends DockOverlapCandidateLike>(
  candidates: T[],
  hoverTargetId: string | null,
  distanceBuffer: number
): T | null => {
  if (candidates.length === 0) return null

  const best = pickBestDockOverlapCandidate(candidates)
  if (!best || !hoverTargetId) return best

  const preferred = candidates.find(candidate => candidate.targetId === hoverTargetId) ?? null
  if (!preferred || preferred.targetId === best.targetId) return best

  // Dock 需要优先保持当前悬停目标，避免插位动画过程中在相邻目标之间抖动切换。
  const iouCloseEnough = preferred.iou >= best.iou - 0.08
  const areaCloseEnough = preferred.intersectionArea >= best.intersectionArea * 0.78
  const distanceCloseEnough =
    preferred.centerManhattanDistance <= best.centerManhattanDistance + Math.max(1, distanceBuffer)

  return iouCloseEnough && areaCloseEnough && distanceCloseEnough ? preferred : best
}
