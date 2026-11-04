import {
  cropImageViewportDataUri,
  type CropCornerRadii,
  type CropViewport,
} from '../../lib/imageCrop'
import type { IconColorId } from '../../lib/iconColors'

export type IconCropResult = {
  /** 保留透明像素；背景通过 colorId 独立传递，保存时才合成。 */
  dataUri: string
  colorId: IconColorId
  cornerRadii: CropCornerRadii
}

/** 预设色、吸管取色和自定义色都不写入图像层，避免后续取色读到新增背景。 */
export async function createIconCropResult(
  source: string,
  viewport: CropViewport,
  outputSize: number,
  colorId: IconColorId
): Promise<IconCropResult> {
  const dataUri = await cropImageViewportDataUri(source, viewport, outputSize)
  if (!dataUri) throw new Error('The cropped icon is empty')
  const scale = outputSize / Math.max(1, viewport.cropSize.width)
  const radii = viewport.cornerRadii ?? { nw: 0, ne: 0, se: 0, sw: 0 }
  return {
    dataUri,
    colorId,
    cornerRadii: {
      nw: radii.nw * scale,
      ne: radii.ne * scale,
      se: radii.se * scale,
      sw: radii.sw * scale,
    },
  }
}
