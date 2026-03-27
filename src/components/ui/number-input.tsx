import * as React from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { cn } from '@/lib/utils'
import { inputBaseClassName } from '@/components/ui/input'

interface NumberInputProps
  extends Omit<React.ComponentProps<'input'>, 'defaultValue' | 'onChange' | 'type' | 'value'> {
  value: number
  onValueChange: (value: number) => void
  step?: number
  inputClassName?: string
}

const resolveNumericProp = (value?: number | string) => {
  if (value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const resolvePrecision = (value: number) => {
  const normalized = value.toString().toLowerCase()
  if (normalized.includes('e-')) {
    const [, exponent = '0'] = normalized.split('e-')
    return Number(exponent)
  }

  const [, decimals = ''] = normalized.split('.')
  return decimals.length
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      className,
      disabled,
      inputClassName,
      max,
      min,
      onValueChange,
      step = 1,
      value,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null)

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement, [])

    const minValue = resolveNumericProp(min)
    const maxValue = resolveNumericProp(max)
    const stepValue = Number.isFinite(step) && step > 0 ? step : 1
    const precision = resolvePrecision(stepValue)

    const clampValue = React.useCallback(
      (nextValue: number) => {
        let normalized = Number(nextValue.toFixed(precision))

        if (minValue !== null) normalized = Math.max(minValue, normalized)
        if (maxValue !== null) normalized = Math.min(maxValue, normalized)

        return normalized
      },
      [maxValue, minValue, precision]
    )

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = Number(event.target.value)
      if (!Number.isFinite(nextValue)) return
      onValueChange(clampValue(nextValue))
    }

    const adjustValue = (direction: 1 | -1) => {
      const nextValue = clampValue(value + direction * stepValue)
      if (nextValue === value) return
      onValueChange(nextValue)
      inputRef.current?.focus()
    }

    const canDecrease = !disabled && (minValue === null || value > minValue)
    const canIncrease = !disabled && (maxValue === null || value < maxValue)

    return (
      <div className={cn('relative inline-flex w-full', className)}>
        <input
          {...props}
          ref={inputRef}
          type="number"
          value={value}
          min={min}
          max={max}
          step={stepValue}
          disabled={disabled}
          onChange={handleInputChange}
          className={cn(
            inputBaseClassName,
            'number-input pr-11 tabular-nums [appearance:textfield]',
            inputClassName
          )}
        />

        <div className="absolute inset-y-1 right-1 flex w-8 flex-col overflow-hidden rounded-[calc(var(--radius)-4px)] border border-border/80 bg-muted shadow-sm">
          {/* 不直接定制原生 spinner：WebKit 伪元素是非标准实现，这里统一隐藏后用项目按钮替代。 */}
          <button
            type="button"
            aria-label="增加数值"
            onClick={() => adjustValue(1)}
            disabled={!canIncrease}
            className="flex h-1/2 items-center justify-center border-b border-border/75 text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="减少数值"
            onClick={() => adjustValue(-1)}
            disabled={!canDecrease}
            className="flex h-1/2 items-center justify-center text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }
)

NumberInput.displayName = 'NumberInput'
