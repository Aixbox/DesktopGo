import {
  DEFAULT_FOLDER_MATERIAL,
  isFolderMaterial,
  type FolderMaterial,
} from './folderMaterialPolicy'

/** CSS owns the live backdrop; changing material only selects the shared surface style. */
export function applyFolderMaterial(material: FolderMaterial): void {
  document.documentElement.dataset.folderMaterial = isFolderMaterial(material)
    ? material
    : DEFAULT_FOLDER_MATERIAL
}
