import { useId } from 'react'
import { translate } from '@/lib/i18n'
import { TEXT_ICON_COLORS, type TextIconColor } from '@/lib/textIconColor'

export function TextIconColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: TextIconColor
  onChange: (color: TextIconColor) => void
  disabled: boolean
}) {
  const name = useId()
  return (
    <fieldset disabled={disabled} className="flex shrink-0 items-center gap-2 disabled:opacity-50">
      <legend className="sr-only">{translate('文字颜色')}</legend>
      {(['black', 'white'] as const).map(color => (
        <label key={color} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={color}
            checked={value === color}
            onChange={() => onChange(color)}
            className="peer sr-only"
          />
          <span className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 text-xs transition-colors peer-checked:border-ring/60 peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:cursor-not-allowed">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 rounded-full border border-black/20"
              style={{ backgroundColor: TEXT_ICON_COLORS[color] }}
            />
            {translate(color === 'black' ? '黑色' : '白色')}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
