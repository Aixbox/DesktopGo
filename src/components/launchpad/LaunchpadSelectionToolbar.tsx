import { translate } from '@/lib/i18n'

interface LaunchpadSelectionToolbarProps {
  /** 当前已选图标数量。 */
  count: number
  onHide: () => void
  onDelete: () => void
  onCancel: () => void
}

/** 多选模式下的悬浮工具条：展示已选数量，并提供隐藏/删除/取消操作。 */
export function LaunchpadSelectionToolbar({
  count,
  onHide,
  onDelete,
  onCancel,
}: LaunchpadSelectionToolbarProps) {
  return (
    <div
      data-selection-toolbar
      className="launchpad-glass-panel-strong mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-full px-3 py-2 text-sm text-foreground/90"
    >
      <span className="px-2">{translate('已选择：{count}', { count })}</span>
      <button
        type="button"
        onClick={onHide}
        className="launchpad-glass-button rounded-full px-3 py-1 text-xs transition-colors"
      >
        {translate('隐藏')}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-full border border-red-500/30 px-3 py-1 text-xs text-red-700 transition-colors hover:bg-red-500/12 hover:text-red-800 dark:text-red-200 dark:hover:bg-red-500/25 dark:hover:text-red-100"
      >
        {translate('删除')}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="launchpad-glass-button rounded-full px-3 py-1 text-xs transition-colors"
      >
        {translate('取消')}
      </button>
    </div>
  )
}
