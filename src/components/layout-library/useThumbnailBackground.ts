import { useEffect, useState } from 'react'
import { getSetting } from '@/lib/settingsStore'

export interface ThumbnailBackground {
  /** 壁纸地址：data URI 或内置资源 URL。 */
  image: string
  /** 蒙版浓度 0..1，和网格上的 --launchpad-background-overlay 对齐。 */
  overlay: number
}

const DEFAULT_OVERLAY = 0.2

/** 主窗口已经把壁纸写进 CSS 变量，抽屉里直接读，跟网格看到的是同一张图。 */
const readAppliedBackground = (): ThumbnailBackground | null => {
  if (typeof document === 'undefined') return null
  const root = document.documentElement
  if (root.dataset.launchpadBackground !== 'custom') return null

  const style = getComputedStyle(root)
  const raw = style.getPropertyValue('--launchpad-background-image').trim()
  const match = /^url\((['"]?)(.+)\1\)$/.exec(raw)
  if (!match) return null

  const overlay = Number.parseFloat(style.getPropertyValue('--launchpad-background-overlay'))
  return {
    image: match[2],
    overlay: Number.isFinite(overlay) ? overlay : DEFAULT_OVERLAY,
  }
}

let savedBackgroundPromise: Promise<ThumbnailBackground | null> | null = null

/** 设置页是独立窗口，没跑 applyAppearance，只能回头读一遍存下来的壁纸。 */
const loadSavedBackground = () => {
  if (!savedBackgroundPromise) {
    savedBackgroundPromise = Promise.all([
      getSetting('launchpadBackgroundImage'),
      getSetting('launchpadBackgroundOverlay'),
    ])
      .then(([image, overlay]) => (image ? { image, overlay: overlay / 100 } : null))
      .catch(() => {
        savedBackgroundPromise = null
        return null
      })
  }
  return savedBackgroundPromise
}

/**
 * 缩略图背后的壁纸：先看主窗口已经应用的 CSS 变量，读不到再退回设置里存的那张。
 * 没有自定义壁纸时返回 null，缩略图用主题底色。
 */
export function useThumbnailBackground(): ThumbnailBackground | null {
  const [background, setBackground] = useState<ThumbnailBackground | null>(readAppliedBackground)

  useEffect(() => {
    if (background) return
    let disposed = false
    void loadSavedBackground().then(saved => {
      if (!disposed && saved) setBackground(saved)
    })
    return () => {
      disposed = true
    }
  }, [background])

  return background
}
