import { useEffect } from 'react'

export interface AiOrganizePanelRunState {
  canApply: boolean
  applying: boolean
  hasPreview: boolean
}

type AiOrganizePhase = 'idle' | 'loading' | 'preview' | 'applying'

export function useAiOrganizeRunState(
  phase: AiOrganizePhase,
  applicableGroupCount: number,
  groupCount: number,
  onChange?: (state: AiOrganizePanelRunState) => void
) {
  useEffect(() => {
    onChange?.({
      canApply: phase === 'preview' && applicableGroupCount > 0,
      applying: phase === 'applying',
      hasPreview: phase === 'preview' && groupCount > 0,
    })
  }, [applicableGroupCount, groupCount, onChange, phase])
}
