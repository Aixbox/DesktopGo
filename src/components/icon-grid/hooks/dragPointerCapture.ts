export interface PointerCaptureTargetLike {
  setPointerCapture(pointerId: number): void
  hasPointerCapture(pointerId: number): boolean
  releasePointerCapture(pointerId: number): void
}

export function activateDragPointerCapture<T extends PointerCaptureTargetLike>(
  target: T | null | undefined,
  pointerId: number
): T | null {
  if (!target) return null
  try {
    target.setPointerCapture(pointerId)
  } catch {
    // 某些 Windows / WebView 状态下会拒绝 capture，拖拽仍然会回退到窗口级监听。
  }
  return target
}

export function releaseDragPointerCapture<T extends PointerCaptureTargetLike>(
  target: T | null | undefined,
  pointerId: number | null | undefined
): null {
  if (!target || pointerId == null) return null
  try {
    if (target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  } catch {
    // 元素卸载后或 capture 已经丢失时，释放失败应直接忽略。
  }
  return null
}
