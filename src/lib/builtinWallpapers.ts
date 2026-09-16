export interface BuiltinWallpaper {
  id: string
  name: string
  /** 应用内静态资源路径（public/wallpapers 下）。 */
  src: string
}

/** 内置精选壁纸清单：图片随应用打包，离线可用。 */
export const BUILTIN_WALLPAPERS: BuiltinWallpaper[] = [
  { id: 'aurora', name: '极光夜空', src: '/wallpapers/aurora.webp' },
  { id: 'alpine-lake', name: '高山湖泊', src: '/wallpapers/alpine-lake.webp' },
  { id: 'dunes', name: '大漠落日', src: '/wallpapers/dunes.webp' },
  { id: 'misty-forest', name: '晨雾森林', src: '/wallpapers/misty-forest.webp' },
  { id: 'sea-cliffs', name: '碧海悬崖', src: '/wallpapers/sea-cliffs.webp' },
  { id: 'neon-city', name: '霓虹夜城', src: '/wallpapers/neon-city.webp' },
]
