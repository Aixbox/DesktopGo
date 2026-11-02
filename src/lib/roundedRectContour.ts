export interface ContourPoint {
  x: number
  y: number
}
export const ROUNDED_RECT_CORNER_STEPS = 64

/** The same superellipse contour can describe a CSS surface, an outline or a cutout. */
export function getRoundedRectContour({
  width,
  height,
  radius,
  exponent,
  inset = 0,
}: {
  width: number
  height: number
  radius: number
  exponent: number
  inset?: number
}): ContourPoint[] {
  const outerRadius = Math.min(Math.max(inset, radius), width / 2, height / 2)
  const centerRadius = Math.max(0, outerRadius - inset)
  const points: ContourPoint[] = []
  for (let corner = 0; corner < 4; corner += 1) {
    for (let step = 0; step <= ROUNDED_RECT_CORNER_STEPS; step += 1) {
      const angle = (step / ROUNDED_RECT_CORNER_STEPS) * (Math.PI / 2)
      const unitC = Math.pow(Math.max(0, Math.cos(angle)), 2 / exponent)
      const unitS = Math.pow(Math.max(0, Math.sin(angle)), 2 / exponent)
      let c = centerRadius * unitC
      let s = centerRadius * unitS
      if (inset > 0 && centerRadius > 0 && exponent > 2) {
        // A squircle's radius is not its surface normal. Offset along the normal
        // so the outside of an inset stroke reaches the original surface edge.
        const normalC = unitC ** (exponent - 1)
        const normalS = unitS ** (exponent - 1)
        const normalLength = Math.hypot(normalC, normalS)
        c = outerRadius * unitC - (inset * normalC) / normalLength
        s = outerRadius * unitS - (inset * normalS) / normalLength
      }
      if (corner === 0) points.push({ x: width - outerRadius + s, y: outerRadius - c })
      if (corner === 1) points.push({ x: width - outerRadius + c, y: height - outerRadius + s })
      if (corner === 2) points.push({ x: outerRadius - s, y: height - outerRadius + c })
      if (corner === 3) points.push({ x: outerRadius - c, y: outerRadius - s })
    }
  }
  return [...points, points[0]]
}
