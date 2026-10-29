import type { GridItem } from '../model'
import { getId } from '../model'

export type KeyboardDropAction =
  | {
      kind: 'merge'
      sourceId: string
      targetId: string
    }
  | {
      kind: 'reorder'
      sourceId: string
      targetId: string | null
    }

/**
 * KeyboardSensor uses Space/Enter to start and confirm a drag. Keep the
 * semantic decision in the domain layer so keyboard and pointer drops agree:
 * an icon dropped on another icon or folder is a merge, everything else is a
 * normal reorder (or a drop on the current grid when over is null).
 */
export const resolveKeyboardDropAction = ({
  source,
  target,
}: {
  source: GridItem | null | undefined
  target: GridItem | null | undefined
}): KeyboardDropAction | null => {
  if (!source) return null
  const sourceId = getId(source)
  const targetId = target ? getId(target) : null
  if (target && targetId !== sourceId && source.kind === 'icon') {
    if (target.kind === 'icon' || target.kind === 'folder') {
      return { kind: 'merge', sourceId, targetId: getId(target) }
    }
  }
  return { kind: 'reorder', sourceId, targetId }
}
