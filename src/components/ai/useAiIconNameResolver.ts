import { useCallback, useMemo } from 'react'
import type { DesktopIcon } from '@/types'

/** 图标 ID → 显示名（含自定义名）解析，供 AI 会话的预览与整理结果使用。 */
export function useAiIconNameResolver(icons: DesktopIcon[], customNames: Record<string, string>) {
  const iconByKey = useMemo(() => {
    const map = new Map<string, DesktopIcon>()
    icons.forEach(icon => {
      map.set(icon.id, icon)
    })
    return map
  }, [icons])

  const resolveIconName = useCallback(
    (key: string): string => {
      const icon = iconByKey.get(key)
      if (!icon) return key
      const custom = customNames[icon.path]
      return (custom && custom.trim()) || icon.name
    },
    [customNames, iconByKey]
  )

  return { iconByKey, resolveIconName }
}
