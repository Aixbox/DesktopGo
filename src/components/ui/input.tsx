import * as React from 'react'

import { cn } from '@/lib/utils'
import { inputBaseClassName } from './inputStyles'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type = 'text', ...props }, ref) => {
    return <input ref={ref} type={type} className={cn(inputBaseClassName, className)} {...props} />
  }
)

Input.displayName = 'Input'

export { Input }
