import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

interface SettingGroupProps {
  title?: string
  children: ReactNode
}

const SettingGroupContext = createContext(false)

export function SettingGroup({ title, children }: SettingGroupProps) {
  return (
    <div className="space-y-2.5">
      {title ? <h3 className="text-sm font-medium text-muted-foreground">{title}</h3> : null}
      <SettingGroupContext.Provider value={true}>
        <div className="divide-y divide-border/70 overflow-hidden rounded-md border border-border/80 bg-card">
          {children}
        </div>
      </SettingGroupContext.Provider>
    </div>
  )
}

interface SettingCardProps {
  label: string
  desc?: string
  children: ReactNode
}

export function SettingCard({ label, desc, children }: SettingCardProps) {
  const grouped = useContext(SettingGroupContext)

  return (
    <div
      className={
        grouped
          ? 'space-y-3 px-4 py-3.5'
          : 'space-y-3 rounded-md border border-border/80 bg-card p-4'
      }
    >
      <div className="space-y-1">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        {desc ? <p className="text-xs leading-5 text-muted-foreground">{desc}</p> : null}
      </div>
      {children}
    </div>
  )
}

interface SwitchButtonProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}

export function SwitchButton({ checked, onChange, disabled = false }: SwitchButtonProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (disabled) return
        onChange(!checked)
      }}
      className={`relative inline-flex h-7 w-12 shrink-0 rounded-full border transition-colors duration-200 ${
        checked ? 'border-primary bg-primary' : 'border-border bg-zinc-500/30'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
        disabled ? '' : 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35'
      }`}
    >
      <span
        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-transform duration-200 ${
          checked ? 'bg-primary-foreground' : 'bg-white'
        } ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

interface ToggleRowProps {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: ToggleRowProps) {
  const grouped = useContext(SettingGroupContext)

  return (
    <div
      className={`flex min-h-20 items-center justify-between gap-4 px-4 py-3.5 ${
        grouped ? '' : 'rounded-md border border-border/80 bg-card'
      }`}
    >
      <div className="min-w-0 space-y-1">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">
        <SwitchButton checked={checked} onChange={onChange} disabled={disabled} />
      </div>
    </div>
  )
}

interface OptionButtonProps {
  label: string
  selected: boolean
  onClick: () => void
}

export function OptionButton({ label, selected, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-md border px-3 py-2 text-sm transition-all duration-150 cursor-pointer ${
        selected ? 'setting-option-selected' : 'setting-option-default'
      }`}
    >
      {label}
    </button>
  )
}

interface RangeControlProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  valueLabel: string
  disabled?: boolean
  onChange: (value: number) => void
}

export function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  valueLabel,
  disabled = false,
  onChange,
}: RangeControlProps) {
  return (
    <Scrubber
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      valueLabel={valueLabel}
      disabled={disabled}
      onChange={onChange}
    />
  )
}

interface ScrubberProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  valueLabel: string
  disabled: boolean
  onChange: (value: number) => void
}

function Scrubber({ label, value, min, max, step, valueLabel, disabled, onChange }: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const rangeSpan = max - min
  const normalizedValue = alignRangeValue(value, min, max, step)
  const progress = getRangeProgress(normalizedValue, min, max)

  const commitPointerValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current
      if (!track || !Number.isFinite(rangeSpan) || rangeSpan <= 0) return
      const bounds = track.getBoundingClientRect()
      if (bounds.width <= 0) return
      const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
      onChange(alignRangeValue(min + ratio * rangeSpan, min, max, step))
    },
    [max, min, onChange, rangeSpan, step]
  )

  const commitKeyboardValue = useCallback(
    (nextValue: number) => onChange(alignRangeValue(nextValue, min, max, step)),
    [max, min, onChange, step]
  )

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    const safeStep = Number.isFinite(step) && step > 0 ? step : 1
    const pageStep = Math.max(safeStep, rangeSpan / 10)
    let nextValue: number | null = null
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown')
      nextValue = normalizedValue - safeStep
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp')
      nextValue = normalizedValue + safeStep
    if (event.key === 'PageDown') nextValue = normalizedValue - pageStep
    if (event.key === 'PageUp') nextValue = normalizedValue + pageStep
    if (event.key === 'Home') nextValue = min
    if (event.key === 'End') nextValue = max
    if (nextValue === null) return
    event.preventDefault()
    commitKeyboardValue(nextValue)
  }

  return (
    <div className={`scrubber ${disabled ? 'opacity-50' : ''}`}>
      <div
        ref={trackRef}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={normalizedValue}
        aria-valuetext={valueLabel}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        data-dragging={isDragging}
        data-disabled={disabled}
        data-active={isDragging}
        className="scrubber-track"
        onKeyDown={handleKeyDown}
        onPointerDown={event => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          setIsDragging(true)
          commitPointerValue(event.clientX)
        }}
        onPointerMove={event => {
          if (isDragging) commitPointerValue(event.clientX)
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          setIsDragging(false)
        }}
        onPointerCancel={() => setIsDragging(false)}
      >
        <div className="scrubber-fill" style={{ width: `${progress}%` }} />
        <div className="scrubber-ticks" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={index} className="scrubber-tick" style={{ left: `${(index + 1) * 10}%` }} />
          ))}
        </div>
        <div className="scrubber-thumb-wrapper" style={{ left: `${progress}%` }}>
          <div className="scrubber-thumb" />
        </div>
        <div className="scrubber-label">{label}</div>
        <div className="scrubber-value">{valueLabel}</div>
      </div>
    </div>
  )
}

function getRangeProgress(value: number, min: number, max: number) {
  const rangeSpan = max - min
  if (!Number.isFinite(value) || !Number.isFinite(rangeSpan) || rangeSpan <= 0) return 0
  return Math.min(100, Math.max(0, ((value - min) / rangeSpan) * 100))
}

function alignRangeValue(value: number, min: number, max: number, step: number) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1
  const stepped = min + Math.round((value - min) / safeStep) * safeStep
  const clamped = Math.min(max, Math.max(min, stepped))
  return Number.isFinite(clamped) ? Number(clamped.toFixed(10)) : min
}
