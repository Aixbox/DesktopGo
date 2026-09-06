import { type ReactElement, type MouseEvent as ReactMouseEvent } from 'react'
import { EyeOff, FolderCog, Pencil, Play, Trash2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { shouldOpenCustomIconContextMenu } from '@/lib/iconContextMenu'
import { useIconStore } from '@/stores/iconStore'
import type { DesktopIcon } from '@/types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface IconContextMenuProps {
  icon: DesktopIcon
  children: ReactElement
  disabled?: boolean
  onOpen?: () => void
}

export function IconContextMenu({
  icon,
  children,
  disabled = false,
  onOpen,
}: IconContextMenuProps) {
  const {
    iconContextMenuMode,
    deleteIcon,
    hideIcon,
    launchApp,
    requestIconEdit,
    showShellContextMenu,
  } = useIconStore()

  const openSystemMenu = () => {
    void showShellContextMenu(icon)
  }

  const handleDelete = () => {
    const confirmed = window.confirm(
      translate('确定要删除“{name}”吗？此操作无法撤销。', { name: icon.name })
    )
    if (!confirmed) return
    void deleteIcon(icon)
  }

  const handleContextMenuCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault()
      event.stopPropagation()
      return
    }

    const shouldOpenCustomMenu = shouldOpenCustomIconContextMenu(
      iconContextMenuMode,
      event.shiftKey
    )

    if (shouldOpenCustomMenu) return

    event.preventDefault()
    event.stopPropagation()
    openSystemMenu()
  }

  const handleOpen = () => {
    if (onOpen) {
      onOpen()
      return
    }
    void launchApp(icon.path)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenuCapture={handleContextMenuCapture}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 rounded-xl p-1 shadow-xl">
        <ContextMenuItem className="gap-2 rounded-lg px-2.5 py-2" onSelect={handleOpen}>
          <Play className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('打开')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onSelect={() => requestIconEdit(icon)}
        >
          <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('编辑图标信息')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onSelect={() => {
            void hideIcon(icon)
          }}
        >
          <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('从启动台隐藏')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/25 dark:focus:text-red-100"
          onSelect={handleDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>{translate('删除')}</span>
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
