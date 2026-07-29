import type { ReactNode } from 'react'
import { Bot, Minus, Pin, X } from 'lucide-react'
import { translate } from '@/lib/i18n'

interface WindowControlButtonProps {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  active?: boolean
  children: ReactNode
}

function WindowControlButton({
  label,
  onClick,
  tone = 'default',
  active = false,
  children,
}: WindowControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-no-window-drag="true"
      onPointerDown={event => event.stopPropagation()}
      onDoubleClick={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-transparent text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
        active
          ? 'accent-tonal'
          : tone === 'danger'
            ? 'text-muted-foreground hover:bg-red-500/12 hover:text-red-500 dark:hover:text-red-300'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center">{children}</span>
    </button>
  )
}

interface LaunchpadWindowControlsProps {
  aiOrganizeMode: boolean
  aiSidebarOpen: boolean
  windowPersistentEnabled: boolean
  alwaysOnTopEnabled: boolean
  onToggleAi: () => void
  onToggleAlwaysOnTop: () => void
  onMinimize: () => void
  onClose: () => void
}

export function LaunchpadWindowControls({
  aiOrganizeMode,
  aiSidebarOpen,
  windowPersistentEnabled,
  alwaysOnTopEnabled,
  onToggleAi,
  onToggleAlwaysOnTop,
  onMinimize,
  onClose,
}: LaunchpadWindowControlsProps) {
  return (
    <div data-no-window-drag="true" className="absolute right-5 top-5 z-40 flex items-center gap-2">
      <div className="launchpad-glass-panel-strong flex items-center rounded-lg border border-border/80 px-1.5 py-1">
        <WindowControlButton
          label={
            aiOrganizeMode && aiSidebarOpen ? translate('收起 AI 整理') : translate('打开 AI 整理')
          }
          active={aiOrganizeMode}
          onClick={onToggleAi}
        >
          <Bot className="h-4 w-4" />
        </WindowControlButton>
      </div>
      {windowPersistentEnabled ? (
        <>
          <div className="launchpad-glass-panel-strong flex items-center rounded-lg border border-border/80 px-1.5 py-1">
            <WindowControlButton
              label={alwaysOnTopEnabled ? translate('取消置顶') : translate('置顶窗口')}
              onClick={onToggleAlwaysOnTop}
            >
              <Pin className={`h-4 w-4 ${alwaysOnTopEnabled ? 'accent-foreground' : ''}`} />
            </WindowControlButton>
          </div>
          <div className="launchpad-glass-panel-strong flex items-center gap-1 rounded-lg border border-border/80 px-1.5 py-1">
            <WindowControlButton label={translate('最小化')} onClick={onMinimize}>
              <Minus className="h-4 w-4" />
            </WindowControlButton>
            <WindowControlButton label={translate('关闭窗口')} tone="danger" onClick={onClose}>
              <X className="h-4 w-4" />
            </WindowControlButton>
          </div>
        </>
      ) : null}
    </div>
  )
}
