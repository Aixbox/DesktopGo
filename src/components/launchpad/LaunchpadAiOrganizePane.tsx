import { lazy, Suspense, type RefObject } from 'react'
import type { LaunchpadGridViewMode, DesktopIcon } from '@/types'
import type {
  AiOrganizePanelHandle,
  AiOrganizePanelRunState,
} from '@/components/ai/AiOrganizePanel'
import { AI_ORGANIZE_PANEL_WIDTH } from './useLaunchpadWindowController'

const AiOrganizePanel = lazy(() =>
  import('@/components/ai/AiOrganizePanel').then(module => ({ default: module.AiOrganizePanel }))
)

interface LaunchpadAiOrganizePaneProps {
  reserved: boolean
  open: boolean
  panelRef: RefObject<AiOrganizePanelHandle | null>
  layoutViewMode: LaunchpadGridViewMode
  icons: DesktopIcon[]
  customNames: Record<string, string>
  onRunStateChange: (state: AiOrganizePanelRunState) => void
  onCollapse: () => void
  onClose: () => void
  onPreviewed: () => void | Promise<void>
  onApplied: () => void | Promise<void>
}

export function LaunchpadAiOrganizePane({
  reserved,
  open,
  panelRef,
  layoutViewMode,
  icons,
  customNames,
  onRunStateChange,
  onCollapse,
  onClose,
  onPreviewed,
  onApplied,
}: LaunchpadAiOrganizePaneProps) {
  return (
    <div
      className={reserved ? 'relative z-30 h-full shrink-0 bg-background/10 p-[5px]' : 'hidden'}
      style={{ width: `${AI_ORGANIZE_PANEL_WIDTH}px` }}
    >
      {open ? (
        <Suspense fallback={null}>
          <AiOrganizePanel
            ref={panelRef}
            visible={open}
            layoutViewMode={layoutViewMode}
            icons={icons}
            customNames={customNames}
            onRunStateChange={onRunStateChange}
            onCollapse={onCollapse}
            onClose={onClose}
            onPreviewed={onPreviewed}
            onApplied={onApplied}
          />
        </Suspense>
      ) : null}
    </div>
  )
}
