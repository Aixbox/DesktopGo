/** Most prevalent visible color, without blending unrelated hues or discarding neutral artwork. */
export function extractIconDominantColor(pixels: Uint8ClampedArray): string | null {
  const buckets = new Map<number, { weight: number; red: number; green: number; blue: number }>()
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const alpha = pixels[index + 3]
    // Fully transparent RGB is undefined; faint antialiasing must not dominate the fill.
    if (alpha < 32) continue
    const [red, green, blue] = [pixels[index], pixels[index + 1], pixels[index + 2]]
    const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4)
    const bucket = buckets.get(key) ?? { weight: 0, red: 0, green: 0, blue: 0 }
    bucket.weight += alpha
    bucket.red += red * alpha
    bucket.green += green * alpha
    bucket.blue += blue * alpha
    buckets.set(key, bucket)
  }
  let best: ReturnType<typeof buckets.get>
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket
  }
  if (!best) return null
  const { weight, red, green, blue } = best
  return (
    '#' +
    [red, green, blue]
      .map(value =>
        Math.round(value / weight)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}
