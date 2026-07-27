import {
  Check,
  Pipette,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { translate } from '@/lib/i18n'
import { ICON_COLOR_PRESETS, type IconColorId } from '@/lib/textIcon'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export const ICON_TRANSPARENT_CHECKERBOARD =
  'conic-gradient(#94a3b8 25%, #cbd5e1 0 50%, #94a3b8 0 75%, #cbd5e1 0)'

type IconCropImageToolsProps = {
  cornerRadiiLinked: boolean
  imageOptimized: boolean
  optimizing: boolean
  disabled: boolean
  optimizeDisabled: boolean
  onToggleCornerRadiiLinked: () => void
  onToggleImageOptimization: () => void
}

function CornerRadiusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 3H6a3 3 0 0 0-3 3v2" />
      <path d="M16 3h2a3 3 0 0 1 3 3v2" />
      <path d="M21 16v2a3 3 0 0 1-3 3h-2" />
      <path d="M8 21H6a3 3 0 0 1-3-3v-2" />
    </svg>
  )
}

export function IconCropImageTools({
  cornerRadiiLinked,
  imageOptimized,
  optimizing,
  disabled,
  optimizeDisabled,
  onToggleCornerRadiiLinked,
  onToggleImageOptimization,
}: IconCropImageToolsProps) {
  const cornerRadiusLabel = cornerRadiiLinked
    ? translate('四角圆角同步调整')
    : translate('四角圆角独立调整')
  const optimizationLabel = imageOptimized ? translate('取消清晰优化') : translate('清晰优化')

  return (
    <div
      role="group"
      aria-label={translate('图像工具')}
      className="absolute right-2 top-2 z-40 flex flex-col gap-2 sm:left-full sm:right-auto sm:top-0 sm:ml-3"
    >
      <Button
        type="button"
        variant={cornerRadiiLinked ? 'secondary' : 'outline'}
        size="icon"
        aria-label={cornerRadiusLabel}
        aria-pressed={cornerRadiiLinked}
        title={cornerRadiusLabel}
        onClick={onToggleCornerRadiiLinked}
        disabled={disabled}
        className="h-9 w-9"
      >
        <CornerRadiusIcon className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={imageOptimized ? 'secondary' : 'outline'}
        size="icon"
        aria-label={optimizationLabel}
        aria-pressed={imageOptimized}
        title={optimizationLabel}
        onClick={onToggleImageOptimization}
        disabled={disabled || optimizeDisabled}
        className="h-9 w-9"
      >
        {optimizing ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

type IconCropTransformControlsProps = {
  zoom: number
  minZoom: number
  maxZoom: number
  disabled: boolean
  onRotate: (amount: number) => void
  onReset: () => void
  onZoom: (amount: number) => void
}

export function IconCropTransformControls({
  zoom,
  minZoom,
  maxZoom,
  disabled,
  onRotate,
  onReset,
  onZoom,
}: IconCropTransformControlsProps) {
  return (
    <div className="mt-[18px] flex items-center justify-between text-muted-foreground">
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={translate('向右旋转')}
          title={translate('向右旋转')}
          onClick={() => onRotate(90)}
          disabled={disabled}
          className="h-8 w-8 hover:text-foreground"
        >
          <RotateCw className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={translate('向左旋转')}
          title={translate('向左旋转')}
          onClick={() => onRotate(-90)}
          disabled={disabled}
          className="h-8 w-8 hover:text-foreground"
        >
          <RotateCcw className="h-5 w-5" />
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={translate('复位')}
        title={translate('复位')}
        onClick={onReset}
        disabled={disabled}
        className="h-8 w-8 hover:text-foreground"
      >
        <RefreshCw className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={translate('缩小')}
          title={translate('缩小')}
          onClick={() => onZoom(-0.1)}
          disabled={disabled || zoom <= minZoom}
          className="h-8 w-8 hover:text-foreground"
        >
          <ZoomOut className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={translate('放大')}
          title={translate('放大')}
          onClick={() => onZoom(0.1)}
          disabled={disabled || zoom >= maxZoom}
          className="h-8 w-8 hover:text-foreground"
        >
          <ZoomIn className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

type IconCropBackgroundControlsProps = {
  colorId: IconColorId
  customColor: string | null
  usingCustomColor: boolean
  extractingColor: boolean
  samplingColor: boolean
  disabled: boolean
  extractionDisabled: boolean
  onToggleExtraction: () => void
  onSelectPreset: (colorId: IconColorId) => void
  onSelectCustomColor: () => void
}

export function IconCropBackgroundControls({
  colorId,
  customColor,
  usingCustomColor,
  extractingColor,
  samplingColor,
  disabled,
  extractionDisabled,
  onToggleExtraction,
  onSelectPreset,
  onSelectCustomColor,
}: IconCropBackgroundControlsProps) {
  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{translate('图标背景')}</span>
        <Button
          type="button"
          variant={extractingColor ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={extractingColor}
          onClick={onToggleExtraction}
          disabled={disabled || extractionDisabled}
          className="h-8 gap-1.5 px-2.5 text-xs"
        >
          {samplingColor ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pipette className="h-3.5 w-3.5" />
          )}
          {translate('提取颜色')}
        </Button>
      </div>

      <div
        role="radiogroup"
        aria-label={translate('图标背景')}
        className="mt-3 grid grid-cols-6 justify-items-center gap-x-2 gap-y-2"
      >
        {ICON_COLOR_PRESETS.map(preset => {
          const selected = !usingCustomColor && preset.id === colorId
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={translate(preset.id === 'none' ? '透明背景' : '选择图标背景')}
              title={translate(preset.id === 'none' ? '透明背景' : '选择图标背景')}
              onClick={() => onSelectPreset(preset.id)}
              disabled={disabled}
              className={cn(
                'relative flex h-7 w-7 items-center justify-center rounded-full border transition-[border-color,box-shadow,transform] duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transform-none',
                selected
                  ? 'border-foreground ring-2 ring-foreground/15'
                  : 'border-border hover:border-foreground/40'
              )}
              style={
                preset.id === 'none'
                  ? {
                      backgroundColor: '#cbd5e1',
                      backgroundImage: ICON_TRANSPARENT_CHECKERBOARD,
                      backgroundSize: '8px 8px',
                    }
                  : { backgroundColor: preset.color }
              }
            >
              {preset.id === 'none' ? (
                <X className="h-3.5 w-3.5 text-slate-600 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)]" />
              ) : selected ? (
                <Check className="h-3.5 w-3.5 text-white" />
              ) : null}
            </button>
          )
        })}
        {customColor ? (
          <button
            type="button"
            role="radio"
            aria-checked={usingCustomColor}
            aria-label={translate('选择提取的颜色')}
            title={`${translate('选择提取的颜色')} ${customColor}`}
            onClick={onSelectCustomColor}
            disabled={disabled}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-full border transition-[border-color,box-shadow,transform] duration-150 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transform-none',
              usingCustomColor
                ? 'border-foreground ring-2 ring-foreground/15'
                : 'border-border hover:border-foreground/40'
            )}
            style={{ backgroundColor: customColor }}
          >
            {usingCustomColor ? (
              <Check className="h-3.5 w-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" />
            ) : null}
          </button>
        ) : null}
      </div>
    </>
  )
}
