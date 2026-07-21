export interface DesktopIcon {
  id: string
  name: string
  path: string
  target_path: string
  launch_arguments?: string
  working_directory?: string
  custom_icon_path?: string
  icon_base64: string
  icon_source?: 'target' | 'custom' | 'text'
  icon_color?: 'none' | 'ocean' | 'emerald' | 'amber' | 'coral' | 'plum'
  icon_text?: string
  item_type: 'shortcut' | 'folder' | 'file' | 'executable' | 'special' | 'website'
}

export interface IconManagerItem extends DesktopIcon {
  hidden: boolean
}

export interface InvalidIconEntry {
  id: string
  name: string
  path: string
  target_path: string
  reason: 'entry_missing' | 'target_unresolved' | 'target_missing'
}

export interface IconMutationTarget {
  id: string
}

export type IconSize = 'large' | 'medium' | 'small'
export type TitleLineCount = 'one' | 'two'
export type LaunchpadGridViewMode = 'paged' | 'scroll'
export type IconContextMenuMode = 'custom' | 'system'

export const ICON_CORNER_RADIUS_MIN = 0
export const ICON_CORNER_RADIUS_MAX = 50
export const DEFAULT_ICON_CORNER_RADIUS = 25
export const ICON_OPACITY_MIN = 30
export const ICON_OPACITY_MAX = 100
export const DEFAULT_ICON_OPACITY = 100

export const ICON_SIZE_CONFIG = {
  large: { logicalSize: 72, columnWidth: 100, imgSize: 72, containerWidth: 100 },
  medium: { logicalSize: 48, columnWidth: 76, imgSize: 48, containerWidth: 76 },
  small: { logicalSize: 32, columnWidth: 60, imgSize: 32, containerWidth: 60 },
} as const

export const ICON_GRID_LAYOUT_ROW_HEIGHT = {
  large: 130,
  medium: 112,
  small: 96,
} as const
export const ICON_GRID_TILE_PADDING_Y = 4
export const ICON_GRID_TITLE_GAP = 4
export const ICON_GRID_TITLE_LINE_HEIGHT = 13
export const ICON_GRID_TITLE_MAX_LINES = 2
export const ICON_GRID_TITLE_HEIGHT = ICON_GRID_TITLE_LINE_HEIGHT * ICON_GRID_TITLE_MAX_LINES

export const getIconGridTitleHeight = (titleLineCount: TitleLineCount): number =>
  titleLineCount === 'one' ? ICON_GRID_TITLE_LINE_HEIGHT : ICON_GRID_TITLE_HEIGHT

export const getIconGridTitleMetrics = (titleLineCount: TitleLineCount) => ({
  singleLine: titleLineCount === 'one',
  height: getIconGridTitleHeight(titleLineCount),
  lineHeight: ICON_GRID_TITLE_LINE_HEIGHT,
  lineClamp: titleLineCount === 'one' ? 1 : ICON_GRID_TITLE_MAX_LINES,
})

export const getIconGridLayoutRowHeight = (iconSize: IconSize): number =>
  ICON_GRID_LAYOUT_ROW_HEIGHT[iconSize]

export const getIconGridRowHeight = (iconSize: IconSize): number =>
  ICON_SIZE_CONFIG[iconSize].columnWidth +
  Math.ceil((ICON_GRID_TITLE_HEIGHT + ICON_GRID_TITLE_GAP) / 2)

export type WindowMode = 'fullscreen' | 'large' | 'medium' | 'small'

export type WindowStyle = 'default' | 'nativeAcrylic'

export type LaunchpadOpenFocusTarget = 'search' | 'launchpad'

export const WINDOW_SIZE_CONFIG: Record<
  Exclude<WindowMode, 'fullscreen'>,
  { width: number; height: number }
> = {
  large: { width: 1600, height: 900 },
  medium: { width: 1280, height: 720 },
  small: { width: 800, height: 600 },
}

export type ThemeMode = 'system' | 'dark' | 'light'

export type IconManagerViewMode = 'list' | 'grid'

export type AppLanguage = 'zh' | 'en'
