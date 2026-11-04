import { ICON_SIZE_CONFIG, type IconSize, type TitleLineCount } from '../../../types/index'
import { PAGINATION_DOT_SIZE } from '../constants'
import { getDockButtonSize } from './dock'
import { getPagedLayoutConfigurationKey } from './gridGeometry'

/** Version the capacity policy, so saved row counts migrate once when spacing changes. */
export const getPagedGridGeometrySuffix = (titles: TitleLineCount = 'two') =>
  `cells-v3:titles-${titles}`

/** Keep stored coordinates for the layout hook to migrate; never stamp them with new dimensions. */
export const canMigratePagedGridCapacity = (savedKey: string | null, currentKey: string) => {
  const capacitySuffix = /:cells-v[23]:titles-(?:one|two)$/
  if (!savedKey || !capacitySuffix.test(currentKey)) return false
  return (
    getPagedLayoutConfigurationKey(savedKey).replace(capacitySuffix, '') ===
    getPagedLayoutConfigurationKey(currentKey).replace(capacitySuffix, '')
  )
}

const GRID_CONTENT_GAP = 8
const PAGINATION_HEIGHT = PAGINATION_DOT_SIZE + 12 // py-1.5
const DOCK_PAGINATION_GAP = 8

/** All distances are CSS pixels from the main content boundary, excluding the window shadow. */
export function getPagedGridInsets(
  iconSize: IconSize,
  dockEnabled: boolean,
  measured?: { searchBottom?: number; dockTopInset?: number }
) {
  const dockTopInset = dockEnabled
    ? (measured?.dockTopInset ??
      getDockButtonSize(ICON_SIZE_CONFIG[iconSize].imgSize) + 24 + 2 + 20)
    : 0
  const paginationBottom = dockEnabled ? dockTopInset + DOCK_PAGINATION_GAP : 20
  return {
    top: (measured?.searchBottom ?? 68) + 12,
    bottom: paginationBottom + PAGINATION_HEIGHT + GRID_CONTENT_GAP,
    horizontal: 64,
    paginationBottom,
  }
}
