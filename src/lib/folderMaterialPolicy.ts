/** Shared by appearance settings, persistence validation and the folder renderer. */
export type FolderMaterial = 'glass' | 'coloros'

export const DEFAULT_FOLDER_MATERIAL: FolderMaterial = 'glass'

export function isFolderMaterial(value: unknown): value is FolderMaterial {
  return value === 'glass' || value === 'coloros'
}
