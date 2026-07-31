import { type ReactElement, type MouseEvent as ReactMouseEvent } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import { Copy, FolderOpen, FolderCog, Play } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { shouldOpenCustomIconContextMenu } from '@/lib/iconContextMenu'
import { useIconStore } from '@/stores/iconStore'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface FileResultContextMenuProps {
  path: string
  children: ReactElement
  onOpen: () => void
}

/**
 * 最佳匹配里的文件条目不属于启动台，套用 `IconContextMenu` 会给出重命名、
 * 从启动台隐藏这类不适用的操作，所以单独给一套面向文件的菜单。
 * 右键手势与图标菜单保持一致（跟随 `iconContextMenuMode`，Shift 反转）。
 */
export function FileResultContextMenu({ path, children, onOpen }: FileResultContextMenuProps) {
  const { iconContextMenuMode } = useIconStore()

  const openSystemMenu = () => {
    void invoke('show_shell_context_menu', { path }).catch(error => {
      console.error('显示 Windows Shell 右键菜单失败：', error)
    })
  }

  const handleContextMenuCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (shouldOpenCustomIconContextMenu(iconContextMenuMode, event.shiftKey)) return
    event.preventDefault()
    event.stopPropagation()
    openSystemMenu()
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenuCapture={handleContextMenuCapture}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 rounded-xl p-1 shadow-xl">
        <ContextMenuItem className="gap-2 rounded-lg px-2.5 py-2" onSelect={onOpen}>
          <Play className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('打开')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onSelect={() => {
            void revealItemInDir(path).catch(error => {
              console.error('打开所在文件夹失败：', error)
            })
          }}
        >
          <FolderOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('打开所在文件夹')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onSelect={() => {
            void navigator.clipboard?.writeText(path).catch(error => {
              console.error('复制路径失败：', error)
            })
          }}
        >
          <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('复制路径')}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onSelect={() => {
            window.setTimeout(openSystemMenu, 0)
          }}
        >
          <FolderCog className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('Windows 原生菜单')}</span>
          <ContextMenuShortcut>
            {translate(iconContextMenuMode === 'custom' ? 'Shift + 右键' : '右键')}
          </ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
