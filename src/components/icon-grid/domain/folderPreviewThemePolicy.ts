export interface FolderPreviewThemeState {
  isDefaultTheme: boolean
  isNightIcon: boolean
  isThemedIcon: boolean
}

/**
 * OplusLauncher only fills missing stacked preview slots with holder drawables
 * for the default theme when the icon is neither a night icon nor themed.
 */
export const shouldRenderFolderPreviewHolders = ({
  isDefaultTheme,
  isNightIcon,
  isThemedIcon,
}: FolderPreviewThemeState): boolean => isDefaultTheme && !isNightIcon && !isThemedIcon

export const DEFAULT_FOLDER_PREVIEW_THEME: FolderPreviewThemeState = {
  isDefaultTheme: true,
  isNightIcon: false,
  isThemedIcon: false,
}
