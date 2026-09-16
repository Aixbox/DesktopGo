import { invoke } from '@tauri-apps/api/core'
import { BUILTIN_WALLPAPERS } from '@/lib/builtinWallpapers'

export type WallpaperSourceId = 'builtin' | 'bing' | 'commons' | 'wallhaven' | 'pexels'

export interface WallpaperItem {
  source: WallpaperSourceId
  /** 全局唯一标识，同时作为 `launchpadBackgroundSource` 的来源键。 */
  key: string
  title: string
  subtitle?: string
  thumbUrl: string
  /** 缩略图加载失败时的降级地址（通常是原图）。 */
  thumbFallbackUrl?: string
  /** 预览大图地址（中等尺寸）；缺省时回退到 fullUrl。 */
  previewUrl?: string
  fullUrl: string
  /** fullUrl 下载失败时的备用地址。 */
  fallbackUrl?: string
}

export interface WallpaperPage {
  items: WallpaperItem[]
  hasMore: boolean
}

export interface WallpaperCategory {
  id: string
  /** 展示名（中文键，走 i18n）。 */
  label: string
  /** 请求图源时使用的值：Commons/Pexels 为搜索词，Wallhaven 为分类标识。 */
  value: string
}

export interface WallpaperSourceMeta {
  id: WallpaperSourceId
  label: string
  description: string
  offline: boolean
  /** 支持分类浏览的源提供分类列表。 */
  categories?: WallpaperCategory[]
}

/** Pexels 使用的主题分类（以搜索词实现）。 */
const TOPIC_CATEGORIES: WallpaperCategory[] = [
  { id: 'nature', label: '自然', value: 'nature' },
  { id: 'city', label: '城市', value: 'city' },
  { id: 'portrait', label: '人像', value: 'portrait' },
  { id: 'architecture', label: '建筑', value: 'architecture' },
  { id: 'travel', label: '旅行', value: 'travel' },
  { id: 'food', label: '美食', value: 'food' },
  { id: 'technology', label: '科技', value: 'technology' },
  { id: 'abstract', label: '抽象', value: 'abstract' },
]

export const WALLPAPER_SOURCES: WallpaperSourceMeta[] = [
  { id: 'builtin', label: '内置', description: '精选内置壁纸，离线可用。', offline: true },
  {
    id: 'bing',
    label: '必应',
    description: '必应每日壁纸开源存档，2016 年至今，需要联网加载。',
    offline: false,
  },
  {
    id: 'commons',
    label: 'Wikimedia Commons',
    description: 'Wikimedia Commons 自由版权图库，需要联网加载。',
    offline: false,
    categories: [
      { id: 'landscape', label: '风景', value: 'landscape' },
      { id: 'city', label: '城市', value: 'city' },
      { id: 'mountain', label: '山脉', value: 'mountain' },
      { id: 'ocean', label: '海洋', value: 'ocean' },
      { id: 'wildlife', label: '动物', value: 'wildlife' },
      { id: 'flowers', label: '花卉', value: 'flower' },
      { id: 'architecture', label: '建筑', value: 'architecture' },
      { id: 'night-sky', label: '夜空', value: 'night sky' },
    ],
  },
  {
    id: 'wallhaven',
    label: 'Wallhaven',
    description: 'Wallhaven 高质量壁纸社区，需要联网加载。',
    offline: false,
    categories: [
      { id: 'all', label: '全部', value: '' },
      { id: 'landscape', label: '风景', value: 'landscape' },
      { id: 'nature', label: '自然', value: 'nature' },
      { id: 'anime', label: '动漫', value: 'anime' },
      { id: 'people', label: '人物', value: 'people' },
    ],
  },
  {
    id: 'pexels',
    label: 'Pexels',
    description: 'Pexels 免费摄影图库，需要联网加载。',
    offline: false,
    categories: TOPIC_CATEGORIES,
  },
]

const PAGE_SIZE = 30

/** Wallhaven 匿名请求的每页上限：请求更大的值也会被服务端压回 24（实测）。 */
const WALLHAVEN_PAGE_SIZE = 24

export interface LoadWallpaperPageOptions {
  categoryId?: string
}

/**
 * 旧版来源键归一化：必应每日/必应历史合并前的 `bing-daily:`/`bing-history:` 前缀
 * 映射到 `bing:`；已下线的 Unsplash/Pixabay/Picsum/NASA 前缀清空（退化为未标记来源）。
 */
export function normalizeWallpaperSourceKey(key: string): string {
  if (key.startsWith('bing-daily:')) return `bing:${key.slice('bing-daily:'.length)}`
  if (key.startsWith('bing-history:')) return `bing:${key.slice('bing-history:'.length)}`
  if (
    key.startsWith('unsplash:') ||
    key.startsWith('pixabay:') ||
    key.startsWith('picsum:') ||
    key.startsWith('nasa:')
  ) {
    return ''
  }
  return key
}

/** 通过 Rust 白名单代理拉取 JSON 列表（绕过 WebView CORS）。 */
async function fetchFeedJson<T>(url: string): Promise<T> {
  const text = await invoke<string>('fetch_wallpaper_feed', { url })
  return JSON.parse(text) as T
}

/**
 * 必应壁纸存档（开源项目 Zhu-junwei/bing-wallpaper-archive，GitHub Actions 每日更新）：
 * jsDelivr 为主、raw.githubusercontent.com 兜底。全量 JSON 约 1.6MB，进程内缓存。
 */
const BING_ARCHIVE_JSON_SOURCES = [
  'https://cdn.jsdelivr.net/gh/Zhu-junwei/bing-wallpaper-archive/Bing_zh-CN_all.json',
  'https://raw.githubusercontent.com/Zhu-junwei/bing-wallpaper-archive/master/Bing_zh-CN_all.json',
]

interface BingArchiveImage {
  enddate: string
  url: string
  urlbase: string
  copyright: string
  title: string
}

let bingArchiveCache: Promise<BingArchiveImage[]> | null = null

async function fetchBingArchive(): Promise<BingArchiveImage[]> {
  let lastError: unknown = null
  for (const source of BING_ARCHIVE_JSON_SOURCES) {
    try {
      const response = await fetch(source)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = (await response.json()) as { images?: BingArchiveImage[] }
      if (!Array.isArray(payload.images)) throw new Error('unexpected archive format')
      return payload.images
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function loadBingArchive(): Promise<BingArchiveImage[]> {
  if (!bingArchiveCache) {
    const promise = fetchBingArchive().catch(error => {
      // 失败后清空缓存，允许下次重试。
      bingArchiveCache = null
      throw error
    })
    bingArchiveCache = promise
  }
  return bingArchiveCache
}

function formatBingDate(date: string): string {
  return date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}` : date
}

/**
 * 存档条目转壁纸项：url 为相对路径（约 2019-05-10 起，实测官方可下载）时派生
 * 官方 1920x1080/1280x720/640x360 地址；更早的条目 url 是存档 CDN（cdn.bimg.cc）
 * 绝对地址，官方已 404。两者互为 fallback，缩略图失败再降级到原图。
 */
function bingItem(image: BingArchiveImage): WallpaperItem | null {
  const urlbase = image.urlbase || ''
  if (!urlbase.startsWith('/th?id=OHR.')) return null
  const id = urlbase.slice('/th?id='.length)
  if (!id) return null
  const officialImage = image.url.startsWith('/')
  const bingFull = `https://cn.bing.com${urlbase}_1920x1080.jpg`
  const bimgFull = `https://cdn.bimg.cc/bing/${image.enddate.slice(0, 4)}/${id}_1920x1080.jpg`
  const fullUrl = officialImage ? bingFull : image.url || bimgFull
  const fallbackUrl = officialImage ? bimgFull : bingFull
  return {
    source: 'bing',
    key: `bing:${id}`,
    title: image.title || id,
    subtitle: formatBingDate(image.enddate),
    thumbUrl: `https://cn.bing.com${urlbase}_640x360.jpg`,
    thumbFallbackUrl: fullUrl,
    previewUrl: officialImage ? `https://cn.bing.com${urlbase}_1280x720.jpg` : undefined,
    fullUrl,
    fallbackUrl,
  }
}

async function loadBingPage(page: number): Promise<WallpaperPage> {
  const archive = await loadBingArchive()
  const start = (page - 1) * PAGE_SIZE
  const items = archive
    .slice(start, start + PAGE_SIZE)
    .map(bingItem)
    .filter((item): item is WallpaperItem => item !== null)
  return { items, hasMore: start + PAGE_SIZE < archive.length }
}

interface CommonsSearchPage {
  title: string
  imageinfo?: { thumburl?: string; url: string; width: number; height: number }[]
}

interface CommonsSearchResponse {
  query?: { pages?: CommonsSearchPage[] }
}

function commonsItem(page: CommonsSearchPage): WallpaperItem | null {
  const info = page.imageinfo?.[0]
  if (!info?.url) return null
  const thumb = info.thumburl || info.url
  return {
    source: 'commons',
    key: `commons:${page.title}`,
    title: page.title.replace(/^File:/, ''),
    subtitle: `${info.width}×${info.height}`,
    thumbUrl: thumb,
    thumbFallbackUrl: info.url,
    fullUrl: thumb,
    fallbackUrl: info.url,
  }
}

/** Wikimedia Commons：免 Key，用全文搜索实现分类，1600px 缩略图同时作为原图（原图体积不可控）。 */
async function loadCommonsPage(page: number, categoryValue: string): Promise<WallpaperPage> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrsearch: `filetype:bitmap ${categoryValue || 'landscape'}`,
    gsrlimit: String(PAGE_SIZE),
    gsroffset: String((page - 1) * PAGE_SIZE),
    prop: 'imageinfo',
    iiprop: 'url|size',
    iiurlwidth: '1600',
  })
  const payload = await fetchFeedJson<CommonsSearchResponse>(
    `https://commons.wikimedia.org/w/api.php?${params}`
  )
  const pages = payload.query?.pages ?? []
  const items = pages.map(commonsItem).filter((item): item is WallpaperItem => item !== null)
  return { items, hasMore: pages.length === PAGE_SIZE }
}

interface WallhavenSearchResponse {
  data?: WallhavenWallpaper[]
  meta?: { last_page?: number }
}

interface WallhavenWallpaper {
  id: string
  path: string
  resolution: string
  thumbs: { large: string; small: string }
}

/**
 * Wallhaven 免 Key 分类映射：全部/动漫/人物走原生 categories 参数；
 * 风景/自然在泛用类下按关键词搜索（带 q 时使用默认相关度排序）。
 * 注意：无 q 时不能用 sorting=top+topRange（实测返回空列表），统一用 hot。
 */
function wallhavenSearchParams(categoryValue: string): URLSearchParams {
  const params = new URLSearchParams({
    purity: '100',
    per_page: String(WALLHAVEN_PAGE_SIZE),
    page: '1',
  })
  if (categoryValue === 'anime') {
    params.set('categories', '010')
    params.set('sorting', 'hot')
  } else if (categoryValue === 'people') {
    params.set('categories', '001')
    params.set('sorting', 'hot')
  } else if (categoryValue === 'landscape' || categoryValue === 'nature') {
    params.set('categories', '100')
    params.set('q', categoryValue)
  } else {
    params.set('categories', '111')
    params.set('sorting', 'hot')
  }
  return params
}

function wallhavenItem(wallpaper: WallhavenWallpaper): WallpaperItem {
  return {
    source: 'wallhaven',
    key: `wallhaven:${wallpaper.id}`,
    title: `Wallhaven ${wallpaper.id}`,
    subtitle: wallpaper.resolution,
    thumbUrl: wallpaper.thumbs.large,
    thumbFallbackUrl: wallpaper.path,
    previewUrl: wallpaper.thumbs.large,
    fullUrl: wallpaper.path,
  }
}

async function loadWallhavenPage(page: number, categoryValue: string): Promise<WallpaperPage> {
  const params = wallhavenSearchParams(categoryValue)
  params.set('page', String(page))
  const payload = await fetchFeedJson<WallhavenSearchResponse>(
    `https://wallhaven.cc/api/v1/search?${params}`
  )
  const list = payload.data ?? []
  const lastPage = payload.meta?.last_page
  return {
    items: list.map(wallhavenItem),
    // 匿名请求每页实际返回 24 条，不能用请求页大小（30）判断是否到底；
    // 以 meta.last_page 为准，缺失时退化为「本页有数据就继续尝试翻页」。
    hasMore: lastPage !== undefined ? page < lastPage : list.length > 0,
  }
}

interface PexelsSearchResponse {
  photos?: PexelsPhoto[]
}

interface PexelsPhoto {
  id: number
  alt?: string
  photographer?: string
  src: { medium: string; large: string; large2x: string; original: string }
}

function pexelsItem(photo: PexelsPhoto): WallpaperItem {
  return {
    source: 'pexels',
    key: `pexels:${photo.id}`,
    title: photo.alt || photo.photographer || `Pexels ${photo.id}`,
    subtitle: photo.photographer,
    thumbUrl: photo.src.medium,
    thumbFallbackUrl: photo.src.large2x,
    previewUrl: photo.src.large,
    fullUrl: photo.src.large2x,
    fallbackUrl: photo.src.original,
  }
}

/** Pexels：免 Key（访客配额）直接可用。 */
async function loadPexelsPage(page: number, categoryValue: string): Promise<WallpaperPage> {
  const params = new URLSearchParams({
    query: categoryValue || 'nature',
    per_page: String(PAGE_SIZE),
    page: String(page),
  })
  const payload = await fetchFeedJson<PexelsSearchResponse>(
    `https://api.pexels.com/v1/search?${params}`
  )
  const photos = payload.photos ?? []
  return { items: photos.map(pexelsItem), hasMore: photos.length === PAGE_SIZE }
}

/** 按源分页加载壁纸；各源内部自带缓存与降级策略。 */
export async function loadWallpaperPage(
  source: WallpaperSourceId,
  page: number,
  options: LoadWallpaperPageOptions = {}
): Promise<WallpaperPage> {
  const meta = WALLPAPER_SOURCES.find(item => item.id === source)
  const categoryValue =
    meta?.categories?.find(category => category.id === options.categoryId)?.value ?? ''

  switch (source) {
    case 'builtin':
      return {
        items: BUILTIN_WALLPAPERS.map(wallpaper => ({
          source,
          key: `builtin:${wallpaper.id}`,
          title: wallpaper.name,
          thumbUrl: wallpaper.src,
          fullUrl: wallpaper.src,
        })),
        hasMore: false,
      }
    case 'bing':
      return loadBingPage(page)
    case 'commons':
      return loadCommonsPage(page, categoryValue)
    case 'wallhaven':
      return loadWallhavenPage(page, categoryValue)
    case 'pexels':
      return loadPexelsPage(page, categoryValue)
  }
}

/** 取壁纸原始图片 Blob：内置直接取应用资源，其余走 Rust 白名单下载（失败自动试备用地址）。 */
export async function downloadWallpaperBlob(item: WallpaperItem): Promise<Blob> {
  if (item.source === 'builtin') {
    const response = await fetch(item.fullUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.blob()
  }

  let dataUri: string
  try {
    dataUri = await invoke<string>('fetch_wallpaper_image', { url: item.fullUrl })
  } catch (error) {
    if (!item.fallbackUrl) throw error
    dataUri = await invoke<string>('fetch_wallpaper_image', { url: item.fallbackUrl })
  }
  const response = await fetch(dataUri)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}
