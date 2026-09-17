export interface BuiltinWallpaper {
  id: string
  name: string
  /** 应用内静态资源路径（public/wallpapers 下）。 */
  src: string
}

/** 内置精选壁纸清单：图片随应用打包，离线可用。 */
export const BUILTIN_WALLPAPERS: BuiltinWallpaper[] = [
  { id: 'sunny-clouds', name: '晴空云海', src: '/wallpapers/cloud.png' },
  { id: 'starry-sky', name: '星夜营地', src: '/wallpapers/starry-sky.png' },
  { id: 'cartoon-apple', name: '青苹果星球', src: '/wallpapers/Cartoon-Apple.jpg' },
  { id: 'anime-girl', name: '二次元少女', src: '/wallpapers/Two-dimensional.jpg' },
  { id: 'grassland-tree', name: '草原暮色', src: '/wallpapers/Grassland-trees.jpg' },
  { id: 'ocean-highway', name: '海滨列车', src: '/wallpapers/Ocean-Highway.jpg' },
]
