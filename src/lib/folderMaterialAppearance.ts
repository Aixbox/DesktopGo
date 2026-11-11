import { isLaunchpadBackgroundImage } from './appearancePolicy'
import { syncFolderMaterialSurfaces } from './folderMaterialSurfaceSync'
import {
  DEFAULT_FOLDER_MATERIAL,
  getFolderBackdropTone,
  isFolderMaterial,
  type FolderMaterial,
} from './folderMaterialPolicy'

const SAMPLE_SIZE = 32
let sampledSource = ''
let cancelSampling: (() => void) | null = null
let stopSurfaceSync: (() => void) | null = null

/** One wallpaper decode per window/source, shared by all folder sizes and previews. */
export function applyFolderMaterial(material: FolderMaterial, backgroundImage: string): void {
  const root = document.documentElement
  root.dataset.folderMaterial = isFolderMaterial(material) ? material : DEFAULT_FOLDER_MATERIAL

  if (material !== 'coloros' || !isLaunchpadBackgroundImage(backgroundImage)) {
    cancelSampling?.()
    stopSurfaceSync?.()
    stopSurfaceSync = null
    sampledSource = ''
    delete root.dataset.folderBackdrop
    return
  }
  if (sampledSource === backgroundImage) return

  cancelSampling?.()
  stopSurfaceSync?.()
  stopSurfaceSync = null
  sampledSource = backgroundImage
  // A neutral light-theme fallback until this wallpaper has been decoded.
  delete root.dataset.folderBackdrop
  const image = new Image()
  let settled = false
  const finish = (tone: ReturnType<typeof getFolderBackdropTone>) => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    image.onload = null
    image.onerror = null
    cancelSampling = null
    if (tone) {
      root.dataset.folderBackdrop = tone
      stopSurfaceSync = syncFolderMaterialSurfaces(image, tone)
    } else sampledSource = '' // A later appearance sync may retry a failed decode.
  }
  const timeout = setTimeout(() => finish(null), 5000)
  cancelSampling = () => {
    finish(null)
    image.removeAttribute('src')
  }
  image.onerror = () => finish(null)
  image.onload = () => {
    if (settled) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE_SIZE
      canvas.height = SAMPLE_SIZE
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return finish(null)
      context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
      finish(getFolderBackdropTone(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data))
    } catch {
      finish(null)
    }
  }
  image.src = backgroundImage
}
