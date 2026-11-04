import type { ComponentProps, CSSProperties } from 'react'
import { cn } from '@/lib/utils'

type IconPreviewButtonProps = Omit<ComponentProps<'button'>, 'className' | 'style' | 'type'> & {
  surfaceClassName?: string
  surfaceStyle?: CSSProperties
}

/** 点击区域保持不动，上浮的视觉层不参与命中，避免下边缘反复触发 hover。 */
export function IconPreviewButton({
  children,
  surfaceClassName,
  surfaceStyle,
  disabled,
  ...props
}: IconPreviewButtonProps) {
  return (
    <button
      {...props}
      type="button"
      disabled={disabled}
      className="group/icon-preview relative block h-16 w-16 shrink-0 rounded-xl p-0 focus-visible:outline-none disabled:opacity-50"
    >
      <span
        className={cn(
          'pointer-events-none relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit] border bg-background transition-[border-color,box-shadow,transform,translate,color,background-color] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] group-focus-visible/icon-preview:border-ring/45 group-focus-visible/icon-preview:ring-2 group-focus-visible/icon-preview:ring-ring/45 motion-reduce:transition-none',
          !disabled && 'motion-safe:group-hover/icon-preview:-translate-y-0.5',
          surfaceClassName
        )}
        style={surfaceStyle}
      >
        {children}
      </span>
    </button>
  )
}
