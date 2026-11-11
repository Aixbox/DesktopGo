import { getFolderTexturePlacement, type FolderBackdropTone } from './folderMaterialPolicy'
import { renderFolderMaterialTexture, type FolderTextureOptions } from './folderMaterialTexture'

const SURFACE_SELECTOR = '.folder-icon-surface'
const PLACEMENT_PROPERTIES = ['background-position', 'background-size', 'background-image']

/** Paint-only adapter. Covers React surfaces, drag portals and focused-item DOM mirrors alike. */
class FolderMaterialSurfaceSync {
  private image: HTMLImageElement
  private tone: FolderBackdropTone
  private root = document.documentElement
  private surfaces = new Set<HTMLElement>()
  private ownStyles = new WeakMap<HTMLElement, string>()
  private moving = new Map<Element, Set<string>>()
  private frame = 0
  private stopped = false
  private textureKey = ''
  private wallpaper: HTMLElement | null = null
  private resize = new ResizeObserver(() => this.schedule())
  private mutations = new MutationObserver(records => {
    if (
      records.some(
        record =>
          record.type !== 'attributes' ||
          record.attributeName !== 'style' ||
          this.ownStyles.get(record.target as HTMLElement) !==
            (record.target as HTMLElement).getAttribute('style')
      )
    )
      this.schedule()
  })

  constructor(image: HTMLImageElement, tone: FolderBackdropTone) {
    this.image = image
    this.tone = tone
    this.mutations.observe(this.root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    })
    window.addEventListener('resize', this.schedule)
    document.addEventListener('scroll', this.schedule, true)
    for (const event of [
      'transitionrun',
      'transitionend',
      'transitioncancel',
      'animationstart',
      'animationend',
      'animationcancel',
    ]) {
      document.addEventListener(event, this.onMotion, true)
    }
    this.schedule()
  }

  private schedule = () => {
    if (!this.stopped && !this.frame) this.frame = requestAnimationFrame(this.update)
  }

  private onMotion = (event: Event) => {
    const target = event.target as Element | null
    if (!target || ![...this.surfaces].some(surface => target.contains(surface))) return
    const key = event.type.startsWith('transition')
      ? (event as TransitionEvent).propertyName
      : (event as AnimationEvent).animationName
    if (event.type === 'transitionrun' || event.type === 'animationstart') {
      const properties = this.moving.get(target) ?? new Set<string>()
      properties.add(key)
      this.moving.set(target, properties)
    } else {
      this.moving.get(target)?.delete(key)
      if (!this.moving.get(target)?.size) this.moving.delete(target)
    }
    this.schedule()
  }

  private discover() {
    const nextWallpaper = document.querySelector<HTMLElement>('.launchpad-background-layer')
    if (nextWallpaper !== this.wallpaper) {
      if (this.wallpaper) this.resize.unobserve(this.wallpaper)
      this.wallpaper = nextWallpaper
      if (this.wallpaper) this.resize.observe(this.wallpaper)
    }
    for (const surface of this.surfaces) {
      if (!surface.isConnected || !surface.matches(SURFACE_SELECTOR)) {
        this.resize.unobserve(surface)
        this.surfaces.delete(surface)
      }
    }
    document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR).forEach(surface => {
      if (!this.surfaces.has(surface)) {
        this.surfaces.add(surface)
        this.resize.observe(surface)
      }
    })
  }

  private update = () => {
    this.frame = 0
    this.discover()
    if (!this.wallpaper || !this.surfaces.size) return
    const bounds = this.wallpaper.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const style = getComputedStyle(this.root)
    const options: FolderTextureOptions = {
      width: bounds.width,
      height: bounds.height,
      dark: this.root.classList.contains('dark'),
      tone: this.tone,
      overlay: Number.parseFloat(style.getPropertyValue('--launchpad-background-overlay')) || 0,
      backgroundBlur: Number.parseFloat(style.getPropertyValue('--launchpad-background-blur')) || 0,
      scrim: style.getPropertyValue('--launchpad-background-scrim-rgb').trim() || '240 240 245',
    }
    const key = JSON.stringify(options)
    if (key !== this.textureKey) {
      this.textureKey = key
      try {
        this.root.style.setProperty(
          '--folder-material-texture',
          `url("${renderFolderMaterialTexture(this.image, options)}")`
        )
      } catch {
        this.root.style.removeProperty('--folder-material-texture')
      }
      this.ownStyles.set(this.root, this.root.getAttribute('style') ?? '')
    }
    // Batch every layout read before writes; never poll an idle grid with a permanent RAF.
    const placements = [...this.surfaces].map(surface => ({
      surface,
      placement: getFolderTexturePlacement(bounds, surface.getBoundingClientRect(), {
        width: surface.offsetWidth,
        height: surface.offsetHeight,
      }),
    }))
    for (const { surface, placement } of placements) {
      if (!placement) continue
      // Focus mirrors copy computed paint as !important: replace those frozen values too.
      const pixels = (a: number, b: number) => `${a.toFixed(3)}px ${b.toFixed(3)}px`
      const values = [
        pixels(placement.x, placement.y),
        pixels(placement.width, placement.height),
        'var(--folder-material-texture, none)',
      ]
      surface.style.removeProperty('--folder-material-texture')
      PLACEMENT_PROPERTIES.forEach((name, index) => {
        const value = values[index]
        if (surface.style.getPropertyValue(name) !== value)
          surface.style.setProperty(name, value, 'important')
      })
      this.ownStyles.set(surface, surface.getAttribute('style') ?? '')
    }
    for (const target of this.moving.keys()) if (!target.isConnected) this.moving.delete(target)
    if (this.moving.size) this.schedule()
  }

  stop = () => {
    this.stopped = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.mutations.disconnect()
    this.resize.disconnect()
    window.removeEventListener('resize', this.schedule)
    document.removeEventListener('scroll', this.schedule, true)
    for (const event of [
      'transitionrun',
      'transitionend',
      'transitioncancel',
      'animationstart',
      'animationend',
      'animationcancel',
    ]) {
      document.removeEventListener(event, this.onMotion, true)
    }
    this.root.style.removeProperty('--folder-material-texture')
    for (const surface of this.surfaces) {
      for (const name of PLACEMENT_PROPERTIES) surface.style.removeProperty(name)
    }
    this.surfaces.clear()
    this.moving.clear()
  }
}

export function syncFolderMaterialSurfaces(
  image: HTMLImageElement,
  tone: FolderBackdropTone
): () => void {
  return new FolderMaterialSurfaceSync(image, tone).stop
}
