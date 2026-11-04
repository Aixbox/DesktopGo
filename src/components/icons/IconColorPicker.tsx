import { Ban, Check, Palette } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { getIconBackgroundStyle } from '@/lib/iconBackground'
import {
  ICON_COLOR_PRESETS,
  isCustomIconColor,
  normalizeIconColor,
  resolveIconColor,
  type IconColorId,
  type IconPresetColorId,
} from '@/lib/iconColors'
import { cn } from '@/lib/utils'
import { IconColorExtractionButton } from './IconColorExtractionButton'

const COLOR_LABELS: Record<IconPresetColorId, string> = {
  none: '无色',
  ocean: '海蓝',
  cyan: '湖青',
  emerald: '翠绿',
  lime: '青柠',
  amber: '琥珀',
  coral: '珊瑚',
  pink: '莓红',
  plum: '梅紫',
  graphite: '石墨',
}

interface IconColorPickerProps {
  value: IconColorId
  onChange: (value: IconColorId) => void
  disabled?: boolean
  extractionSource?: string
  selectionKey?: string
}

function CustomIconColorPicker({ value, onChange, disabled }: IconColorPickerProps) {
  const selected = isCustomIconColor(value)
  const resolved = resolveIconColor(value)
  return (
    <label
      title={translate('选择自定义图标颜色')}
      className={cn(
        'relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-transform focus-within:outline-none focus-within:ring-2 focus-within:ring-ring motion-reduce:transform-none',
        selected ? 'border-foreground ring-2 ring-foreground/15' : 'border-border',
        disabled ? 'opacity-35' : 'cursor-pointer hover:scale-105'
      )}
      style={
        selected
          ? { ...getIconBackgroundStyle(resolved.color), color: resolved.foreground }
          : {
              background: 'conic-gradient(#638FD8, #9E80CC, #DA7D6C, #DDA44D, #52AA85, #638FD8)',
              color: '#263244',
            }
      }
    >
      {selected ? <Check className="h-3.5 w-3.5" /> : <Palette className="h-3.5 w-3.5" />}
      <input
        type="color"
        aria-label={translate('选择自定义图标颜色')}
        value={resolved.id === 'none' ? ICON_COLOR_PRESETS[1].color : resolved.color}
        disabled={disabled}
        onChange={event => {
          const next = normalizeIconColor(event.currentTarget.value)
          if (isCustomIconColor(next)) onChange(next)
        }}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
      />
    </label>
  )
}

/** 与设置页一样使用原生颜色选择器；所有图标背景选项共享同一份颜色解析。 */
export function IconColorPicker({
  value,
  onChange,
  disabled,
  extractionSource = '',
  selectionKey = '',
}: IconColorPickerProps) {
  const selectedValue = normalizeIconColor(value)
  const label = isCustomIconColor(selectedValue)
    ? `${translate('自定义颜色')} ${selectedValue.toUpperCase()}`
    : translate(COLOR_LABELS[selectedValue])
  return (
    <div
      role="group"
      aria-label={translate('图标颜色')}
      className="flex min-h-9 flex-wrap items-center gap-1.5"
    >
      {ICON_COLOR_PRESETS.map(preset => {
        const selected = selectedValue === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            aria-pressed={selected}
            aria-label={translate(COLOR_LABELS[preset.id])}
            title={translate(COLOR_LABELS[preset.id])}
            onClick={() => onChange(preset.id)}
            disabled={disabled}
            className={cn(
              'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-[border-color,box-shadow,transform] duration-200 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35 motion-reduce:transform-none motion-reduce:transition-none',
              selected
                ? 'border-foreground ring-2 ring-foreground/15'
                : 'border-border hover:border-foreground/40',
              preset.id === 'none' && 'bg-background text-muted-foreground'
            )}
            style={
              preset.id === 'none'
                ? undefined
                : { ...getIconBackgroundStyle(preset.color), color: preset.foreground }
            }
          >
            {preset.id === 'none' ? (
              <Ban className="h-3.5 w-3.5" />
            ) : selected ? (
              <Check className="h-3.5 w-3.5" />
            ) : null}
          </button>
        )
      })}
      <IconColorExtractionButton
        source={extractionSource}
        selectionKey={selectionKey}
        value={value}
        disabled={Boolean(disabled)}
        onChange={onChange}
      />
      <CustomIconColorPicker value={selectedValue} onChange={onChange} disabled={disabled} />
      <span className="ml-1 text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
