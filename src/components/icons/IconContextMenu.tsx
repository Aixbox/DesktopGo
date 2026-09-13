import { type ReactElement, type MouseEvent as ReactMouseEvent, useEffect, useState } from 'react'
import { EyeOff, FolderCog, Pencil, Play, Trash2 } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { shouldOpenCustomIconContextMenu } from '@/lib/iconContextMenu'
import { getSetting } from '@/lib/settingsStore'
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

  // 菜单打开时读取删除源文件的两个开关，用于刷新删除项文案。
  const [deleteSourceAll, setDeleteSourceAll] = useState(false)
  const [deleteSourceNew, setDeleteSourceNew] = useState(false)

  const refreshDeleteSourceSettings = () => {
    void Promise.all([
      getSetting('deleteIconSourceFile'),
      getSetting('deleteNewFileSource'),
    ])
      .then(([all, newOnly]) => {
        setDeleteSourceAll(all)
        setDeleteSourceNew(newOnly)
      })
      .catch(e => console.error('Failed to load delete source settings:', e))
  }

  useEffect(() => {
    refreshDeleteSourceSettings()
  }, [])

  const openSystemMenu = () => {
    void showShellContextMenu(icon)
  }

  // 该图标删除时是否会连同源文件：全局开关开启，或（仅新建开关开启且图标为新建创建）。
  const deleteSourceApplies =
    deleteSourceAll || (deleteSourceNew && icon.origin === 'new')

  const handleDelete = () => {
    const confirmed = window.confirm(
      deleteSourceApplies
        ? translate('确定要删除“{name}”吗？其源文件将被移入回收站。', { name: icon.name })
        : translate('确定要删除“{name}”吗？此操作无法撤销。', { name: icon.name })
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
    <ContextMenu onOpenChange={open => open && refreshDeleteSourceSettings()}>
      <ContextMenuTrigger asChild onContextMenuCapture={handleContextMenuCapture}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56 p-1 shadow-xl">
        <ContextMenuItem className="gap-2 px-2.5 py-2" onSelect={handleOpen}>
          <Play className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('打开')}</span>
        </ContextMenuItem>
        <ContextMenuItem className="gap-2 px-2.5 py-2" onSelect={() => requestIconEdit(icon)}>
          <Pencil className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('编辑图标信息')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 px-2.5 py-2"
          onSelect={() => {
            void hideIcon(icon)
          }}
        >
          <EyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span>{translate('从启动台隐藏')}</span>
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 px-2.5 py-2 text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/25 dark:focus:text-red-100"
          onSelect={handleDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>
            {deleteSourceApplies
              ? translate('删除（同时删除源文件）')
              : translate('删除')}
          </span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2 px-2.5 py-2"
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
