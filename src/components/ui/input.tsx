import * as React from 'react'

import { cn } from '@/lib/utils'

const inputBaseClassName =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', ...props }, ref) => {
    return <input ref={ref} type={type} className={cn(inputBaseClassName, className)} {...props} />
  }
)

Input.displayName = 'Input'

export { Input, inputBaseClassName }
