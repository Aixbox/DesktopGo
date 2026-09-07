import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '@/lib/utils'

export interface NativeScrollAreaProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean
  /** auto 仅在溢出时占位；默认沿用样式表设置。 */
  gutter?: React.CSSProperties['scrollbarGutter']
}

const NativeScrollArea = React.forwardRef<HTMLElement, NativeScrollAreaProps>(
  ({ className, asChild = false, gutter, style, ...props }, ref) => {
    const scrollStyle = gutter ? { scrollbarGutter: gutter, ...style } : style

    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn('native-scroll-area', className)}
          style={scrollStyle}
          {...props}
        />
      )
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn('native-scroll-area', className)}
        style={scrollStyle}
        {...props}
      />
    )
  }
)
NativeScrollArea.displayName = 'NativeScrollArea'

export { NativeScrollArea }
