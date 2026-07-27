import type { DesktopIcon } from '@/types'
import type { AiOrganizePanelRunState } from './useAiOrganizeRunState'

export interface AiOrganizePanelProps {
  open?: boolean
  visible?: boolean
  icons: DesktopIcon[]
  customNames: Record<string, string>
  onRunStateChange?: (state: AiOrganizePanelRunState) => void
  onCollapse?: () => void
  onClose: () => void
  onPreviewed?: () => void | Promise<void>
  onApplied: () => void | Promise<void>
}

export interface AiOrganizePanelHandle {
  applyPreview: () => void
}
