import type { IconContextMenuMode } from '@/types'

export const shouldOpenCustomIconContextMenu = (mode: IconContextMenuMode, shiftKey: boolean) =>
  mode === 'custom' ? !shiftKey : shiftKey
