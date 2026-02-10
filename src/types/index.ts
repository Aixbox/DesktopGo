export interface DesktopIcon {
  id: string
  name: string
  path: string
  target_path: string
  icon_base64: string
  item_type: 'shortcut' | 'folder' | 'file' | 'executable' | 'special'
}

export type IconSize = 'large' | 'medium' | 'small'

export const ICON_SIZE_CONFIG = {
  large:  { logicalSize: 72, columnWidth: 100, imgSize: 72, containerWidth: 100 },
  medium: { logicalSize: 48, columnWidth: 76,  imgSize: 48, containerWidth: 76 },
  small:  { logicalSize: 32, columnWidth: 60,  imgSize: 32, containerWidth: 60 },
} as const
