import * as React from 'react'
import * as MenuPrimitive from '@radix-ui/react-menu'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { menuContentClass, menuItemClass } from './menu-styles'
import { NativeScrollArea } from './native-scroll-area'

export function MenuSub({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Sub>) {
  // The low-level Menu.Sub is controlled-only; hover/click merely request a state change.
  const [internalOpen, setInternalOpen] = React.useState(false)
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange]
  )
  return (
    <MenuPrimitive.Sub {...props} open={open ?? internalOpen} onOpenChange={handleOpenChange} />
  )
}

export const MenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.SubTrigger
    ref={ref}
    className={cn(menuItemClass, 'gap-2 data-[state=open]:bg-accent', className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
  </MenuPrimitive.SubTrigger>
))
MenuSubTrigger.displayName = 'MenuSubTrigger'

export const MenuSubContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <NativeScrollArea asChild gutter="auto">
      <MenuPrimitive.SubContent
        ref={ref}
        className={cn(
          menuContentClass,
          'z-50 max-h-[var(--radix-menu-content-available-height)] overflow-y-auto overflow-x-hidden p-1',
          className
        )}
        {...props}
      />
    </NativeScrollArea>
  </MenuPrimitive.Portal>
))
MenuSubContent.displayName = 'MenuSubContent'
