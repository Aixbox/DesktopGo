export interface DesktopIcon {
  id: string
  name: string
  path: string
  target_path: string
  icon_base64: string
  item_type: 'shortcut' | 'folder' | 'file' | 'executable' | 'special'
}
