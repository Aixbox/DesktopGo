import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'

import { cn } from '@/lib/utils'

export interface NativeScrollAreaProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean
}

const NativeScrollArea = React.forwardRef<HTMLElement, NativeScrollAreaProps>(
  ({ className, asChild = false, ...props }, ref) => {
    if (asChild) {
      return <Slot ref={ref} className={cn('native-scroll-area', className)} {...props} />
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn('native-scroll-area', className)}
        {...props}
      />
    )
  }
)
NativeScrollArea.displayName = 'NativeScrollArea'

export { NativeScrollArea }
