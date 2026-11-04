// 与大图标一致：宽范围的左上高光和底部暗部，不添加纹理。
const HIGHLIGHT_X = 0.2
const HIGHLIGHT_OPACITY = 0.14
const HIGHLIGHT_END = 0.7
const SHADOW_START = 0.35
const SHADOW_OPACITY = 0.09

export const ICON_COLOR_SHADING =
  `radial-gradient(ellipse at ${HIGHLIGHT_X * 100}% 0%, rgb(255 255 255 / ${Math.round(HIGHLIGHT_OPACITY * 100)}%), rgb(255 255 255 / 0%) ${HIGHLIGHT_END * 100}%), ` +
  `linear-gradient(180deg, rgb(0 0 0 / 0%) ${SHADOW_START * 100}%, rgb(0 0 0 / ${SHADOW_OPACITY * 100}%) 100%)`

export function getIconBackgroundStyle(color: string | undefined) {
  return {
    backgroundColor: color,
    backgroundImage: color && color !== 'transparent' ? ICON_COLOR_SHADING : undefined,
    backgroundSize: '100% 100%',
    backgroundRepeat: 'no-repeat',
  }
}

/** 沿当前圆角路径填色；光影只作用于背景，随后绘制的文字和图像不受影响。 */
export function fillIconBackground(context: CanvasRenderingContext2D, color: string, size: number) {
  if (!color || color === 'transparent' || size <= 0) return
  context.save()
  context.clip()
  context.fillStyle = color
  context.fillRect(0, 0, size, size)

  const shadow = context.createLinearGradient(0, 0, 0, size)
  shadow.addColorStop(SHADOW_START, 'rgba(0, 0, 0, 0)')
  shadow.addColorStop(1, `rgba(0, 0, 0, ${SHADOW_OPACITY})`)
  context.fillStyle = shadow
  context.fillRect(0, 0, size, size)

  // CSS ellipse 的 farthest-corner：按最远横/纵边缩放，再取 sqrt(2) 到达角点。
  const farthestX = 1 - HIGHLIGHT_X
  context.scale(size * farthestX, size)
  const centerX = HIGHLIGHT_X / farthestX
  const highlight = context.createRadialGradient(centerX, 0, 0, centerX, 0, Math.SQRT2)
  highlight.addColorStop(0, `rgba(255, 255, 255, ${HIGHLIGHT_OPACITY})`)
  highlight.addColorStop(HIGHLIGHT_END, 'rgba(255, 255, 255, 0)')
  context.fillStyle = highlight
  context.fillRect(0, 0, 1 / farthestX, 1)
  context.restore()
}
