import type { RefObject } from 'react'
import { History, Maximize2, Minimize2, Plus, X } from 'lucide-react'

interface AiOrganizePanelHeaderActionsProps {
  historyButtonRef: RefObject<HTMLButtonElement | null>
  historyExpanded: boolean
  isBusy: boolean
  isExpanded: boolean
  closeDisabled: boolean
  historyLabel: string
  newChatLabel: string
  expandLabel: string
  restoreLabel: string
  closeLabel: string
  onToggleHistory: () => void
  onNewSession: () => void
  onToggleExpanded: () => void
  onClose: () => void
}

export const AiOrganizePanelHeaderActions = ({
  historyButtonRef,
  historyExpanded,
  isBusy,
  isExpanded,
  closeDisabled,
  historyLabel,
  newChatLabel,
  expandLabel,
  restoreLabel,
  closeLabel,
  onToggleHistory,
  onNewSession,
  onToggleExpanded,
  onClose,
}: AiOrganizePanelHeaderActionsProps) => {
  const expandActionLabel = isExpanded ? restoreLabel : expandLabel

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        ref={historyButtonRef}
        type="button"
        aria-label={historyLabel}
        title={historyLabel}
        onClick={onToggleHistory}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
          historyExpanded
            ? 'bg-primary/10 accent-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <History className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={newChatLabel}
        title={newChatLabel}
        onClick={onNewSession}
        disabled={isBusy}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={expandActionLabel}
        aria-pressed={isExpanded}
        title={expandActionLabel}
        onClick={onToggleExpanded}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </button>
      <button
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
        disabled={closeDisabled}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
