import type { PersistedLayout } from '../model'
import { buildCanonicalPlacements } from './canonicalLayout'
import { validatePersistedLayout } from './layoutValidation'

/**
 * Early v10 writers used the total slots length as one page's capacity.
 * Recover only that exact writer output, using the still-valid original slots.
 * The service must verify the original checksum before calling this migration.
 */
export function repairLegacyCanonicalPages(layout: PersistedLayout): PersistedLayout {
  const { slots, pageSize, columns, placements } = layout
  if (
    !slots ||
    !placements ||
    !pageSize ||
    !columns ||
    slots.length <= pageSize ||
    slots.length % pageSize !== 0
  )
    return layout

  const source = { ...layout, placements: undefined }
  if (!validatePersistedLayout(source).valid) return layout
  const legacyPlacements = buildCanonicalPlacements({ ...source, pageSize: slots.length })
  if (JSON.stringify(legacyPlacements) !== JSON.stringify(placements)) return layout

  const repaired = { ...layout, placements: buildCanonicalPlacements(source) }
  return validatePersistedLayout(repaired).valid ? repaired : layout
}
