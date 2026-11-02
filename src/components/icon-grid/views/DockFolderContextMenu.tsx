import type { ReactElement } from 'react'
import { translate } from '../../../lib/i18n'
import { FocusedItemMenu } from '../../icons/FocusedItemMenu'
import { MenuItem } from '../../ui/menu'

export function DockFolderContextMenu({
  name,
  onOpen,
  onRemove,
  children,
}: {
  name: string
  onOpen: () => void
  onRemove: () => void
  children: ReactElement
}) {
  return (
    <FocusedItemMenu trigger={children} width={176} label={name}>
      <MenuItem className="px-3 py-2 text-foreground/85" onSelect={onOpen}>
        {translate('打开')}
      </MenuItem>
      <MenuItem
        className="px-3 py-2 text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/20 dark:focus:text-red-100"
        onSelect={onRemove}
      >
        {translate('移出 Dock')}
      </MenuItem>
    </FocusedItemMenu>
  )
}
