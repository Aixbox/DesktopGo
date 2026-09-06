import { PromptSuggestion, type PromptSuggestionItem } from '@/components/chat/PromptSuggestion'
import { translate } from '@/lib/i18n'
import { PROMPT_PRESETS } from './aiOrganizePanelModel'

interface AiOrganizeSuggestionsProps {
  onSelectPreset: (prompt: string, label: string) => void
}

/** 空会话的 PromptSuggestion：预设即建议，点击以「整理」指令直接执行。 */
export function AiOrganizeSuggestions({ onSelectPreset }: AiOrganizeSuggestionsProps) {
  const items: PromptSuggestionItem[] = PROMPT_PRESETS.map(preset => ({
    key: preset.id,
    title: translate(preset.label),
    description: translate(preset.description),
  }))

  return (
    <PromptSuggestion
      items={items}
      onSelect={item => {
        const preset = PROMPT_PRESETS.find(entry => entry.id === item.key)
        if (preset) {
          onSelectPreset(preset.prompt, item.title)
        }
      }}
    />
  )
}
