import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  /** 半选态：父级只有部分子项被勾选时显示短横线。 */
  indeterminate?: boolean
  onToggle: () => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

/**
 * HeroUI 风格的自定义复选框：方角圆框、选中填充主色并显示粗勾，
 * 用 button[role=checkbox] 实现以便完全控制配色与聚焦环。
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onToggle,
  disabled,
  ariaLabel,
  className,
}: CheckboxProps) {
  const active = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-2 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-transparent text-transparent hover:border-primary/60',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      {indeterminate ? (
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      ) : (
        <Check
          className={cn('h-3.5 w-3.5 transition-opacity', checked ? 'opacity-100' : 'opacity-0')}
          strokeWidth={3}
        />
      )}
    </button>
  )
}
