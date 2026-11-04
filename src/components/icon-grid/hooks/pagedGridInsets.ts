import { getPagedGridInsets } from '../domain/pagedGridMetrics'
import type { IconSize } from '../../../types'

export function getPagedGridChrome(container: HTMLElement) {
  const viewport = container.closest?.<HTMLElement>('[data-edge-paging-viewport]')
  return {
    viewport,
    search: viewport?.closest('.launchpad-bg')?.querySelector('[data-search-placeholder]'),
    panel: viewport?.querySelector('[data-dock-panel]'),
  }
}

/** Read untransformed chrome, never animated grid bounds, before measuring the usable grid. */
export function syncPagedGridInsets(container: HTMLElement, iconSize: IconSize, dock: boolean) {
  const { viewport, search, panel } = getPagedGridChrome(container)
  if (!viewport) return
  const bounds = viewport.getBoundingClientRect()
  const searchRect = search?.getBoundingClientRect()
  const panelRect = panel?.getBoundingClientRect()
  const insets = getPagedGridInsets(iconSize, dock, {
    searchBottom: searchRect?.height ? searchRect.bottom - bounds.top : undefined,
    dockTopInset: panelRect?.height ? bounds.bottom - panelRect.top : undefined,
  })
  viewport.style.setProperty('--paged-grid-top', `${insets.top}px`)
  viewport.style.setProperty('--paged-grid-bottom', `${insets.bottom}px`)
  viewport.style.setProperty('--paged-pagination-bottom', `${insets.paginationBottom}px`)
}
