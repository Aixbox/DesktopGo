export type IconSource = 'desktop' | 'customapp'

export interface DesktopIcon {
  id: string
  name: string
  path: string
  target_path: string
  icon_base64: string
  item_type: 'shortcut' | 'folder' | 'file' | 'executable' | 'special'
  source: IconSource
}

export interface IconMutationTarget {
  id: string
  source: IconSource
}

export type IconSize = 'large' | 'medium' | 'small'

export const ICON_SIZE_CONFIG = {
  large: { logicalSize: 72, columnWidth: 100, imgSize: 72, containerWidth: 100 },
  medium: { logicalSize: 48, columnWidth: 76, imgSize: 48, containerWidth: 76 },
  small: { logicalSize: 32, columnWidth: 60, imgSize: 32, containerWidth: 60 },
} as const

export type WindowMode = 'fullscreen' | 'large' | 'medium' | 'small'

export const WINDOW_SIZE_CONFIG: Record<Exclude<WindowMode, 'fullscreen'>, { width: number; height: number }> = {
  large: { width: 1600, height: 900 },
  medium: { width: 1280, height: 720 },
  small: { width: 800, height: 600 },
}

export type TitleLineCount = 'one' | 'two'

export type ThemeMode = 'system' | 'dark' | 'light'
