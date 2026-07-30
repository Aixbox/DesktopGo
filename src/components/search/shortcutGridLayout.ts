/**
 * 快捷入口网格布局规则。
 *
 * 网格使用 `repeat(auto-fill, <tileWidth>px)` 铺排，实际列数由容器宽度决定，
 * 键盘的上下行移动需要同一份列数规则，因此在此集中维护。
 */

export const SHORTCUT_GRID_COLUMN_GAP = 16

export function resolveShortcutGridColumnCount({
  availableWidth,
  tileWidth,
  columnGap = SHORTCUT_GRID_COLUMN_GAP,
}: {
  availableWidth: number
  tileWidth: number
  columnGap?: number
}): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1
  if (!Number.isFinite(tileWidth) || tileWidth <= 0) return 1

  const trackSpan = tileWidth + Math.max(columnGap, 0)
  return Math.max(1, Math.floor((availableWidth + Math.max(columnGap, 0)) / trackSpan))
}
