import { Bot } from 'lucide-react'
import { translate } from '@/lib/i18n'
import type { AiOrganizePanelRunState } from '@/components/ai/AiOrganizePanel'

interface LaunchpadAiOrganizeToolbarProps {
  sidebarOpen: boolean
  runState: AiOrganizePanelRunState
  onToggleSidebar: () => void
  onApplyPreview: () => void
  onExit: () => void
}

export function LaunchpadAiOrganizeToolbar({
  sidebarOpen,
  runState,
  onToggleSidebar,
  onApplyPreview,
  onExit,
}: LaunchpadAiOrganizeToolbarProps) {
  return (
    <div
      data-ai-organize-toolbar
      className="launchpad-glass-panel-strong mx-auto flex w-fit max-w-full flex-nowrap items-center justify-center gap-2 overflow-hidden rounded-full border border-primary/20 px-3 py-2 text-sm text-foreground/90"
    >
      <span className="flex shrink-0 items-center gap-2 px-1.5 font-medium">
        <Bot className="accent-foreground h-4 w-4" />
        {translate('AI 整理模式')}
      </span>
      <span className="hidden min-w-0 max-w-[240px] truncate text-xs text-muted-foreground md:inline">
        {runState.applying
          ? translate('正在保存 AI 预览...')
          : runState.hasPreview
            ? translate('预览已生成，可保存或不保存退出。')
            : translate('从右侧选择预设或输入要求开始整理。')}
      </span>
      <button
        type="button"
        onClick={onToggleSidebar}
        className="launchpad-glass-button shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors"
      >
        {sidebarOpen ? translate('收起侧栏') : translate('展开侧栏')}
      </button>
      <button
        type="button"
        onClick={onApplyPreview}
        disabled={!runState.canApply || runState.applying}
        className="accent-tonal shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-primary/18 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-primary/25"
      >
        {runState.applying ? translate('保存中...') : translate('保存预览')}
      </button>
      <button
        type="button"
        onClick={onExit}
        disabled={runState.applying}
        className="launchpad-glass-button shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-45"
      >
        {translate('不保存退出')}
      </button>
    </div>
  )
}
