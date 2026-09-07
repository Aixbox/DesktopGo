import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// 与 corners.css 的圆角别名保持一致，让调用方仍能覆盖完整圆角或单独一角。
const mergeTailwindClasses = extendTailwindMerge({
  extend: {
    theme: {
      radius: [
        'field',
        'field-inner',
        'button',
        'menu-item',
        'card',
        'card-lg',
        'popover',
        'dock',
        'icon-tile',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs))
}
