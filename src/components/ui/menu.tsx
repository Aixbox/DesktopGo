import * as React from 'react'
import * as MenuPrimitive from '@radix-ui/react-menu'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  menuContentClass,
  menuItemClass,
  menuLabelClass,
  menuRadioItemClass,
  menuSeparatorClass,
  menuShortcutClass,
} from './menu-styles'
import { NativeScrollArea } from './native-scroll-area'

export const Menu = MenuPrimitive.Root
export const MenuAnchor = MenuPrimitive.Anchor
export const MenuRadioGroup = MenuPrimitive.RadioGroup

export const MenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Portal>
    <NativeScrollArea asChild gutter="auto">
      <MenuPrimitive.Content
        ref={ref}
        className={cn(menuContentClass, 'z-50 overflow-y-auto overflow-x-hidden p-1', className)}
        {...props}
      />
    </NativeScrollArea>
  </MenuPrimitive.Portal>
))
MenuContent.displayName = 'MenuContent'

export const MenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Item ref={ref} className={cn(menuItemClass, className)} {...props} />
))
MenuItem.displayName = 'MenuItem'

export const MenuRadioItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <MenuPrimitive.RadioItem ref={ref} className={cn(menuRadioItemClass, className)} {...props}>
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <MenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </MenuPrimitive.ItemIndicator>
    </span>
    {children}
  </MenuPrimitive.RadioItem>
))
MenuRadioItem.displayName = 'MenuRadioItem'

export const MenuLabel = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Label ref={ref} className={cn(menuLabelClass, className)} {...props} />
))
MenuLabel.displayName = 'MenuLabel'

export const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <MenuPrimitive.Separator ref={ref} className={cn(menuSeparatorClass, className)} {...props} />
))
MenuSeparator.displayName = 'MenuSeparator'

export function MenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(menuShortcutClass, className)} {...props} />
}
