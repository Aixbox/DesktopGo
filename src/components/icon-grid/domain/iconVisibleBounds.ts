/** Ignore fully transparent padding when locating the artwork to round. */
export function getIconVisibleBounds(data: Uint8ClampedArray, width: number, height: number) {
  if (width <= 0 || height <= 0 || data.length !== width * height * 4) return null
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  return right < left
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 }
}
