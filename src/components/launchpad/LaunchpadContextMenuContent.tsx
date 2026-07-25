import { translate } from '@/lib/i18n'
import { useIconStore } from '@/stores/iconStore'
import type { IconSize, LaunchpadGridViewMode, TitleLineCount, WindowMode } from '@/types'
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu'

type MenuOption<T extends string> = {
  label: string
  value: T
}

const ICON_SIZE_OPTIONS: MenuOption<IconSize>[] = [
  { label: '大图标', value: 'large' },
  { label: '中图标', value: 'medium' },
  { label: '小图标', value: 'small' },
]

const WINDOW_MODE_OPTIONS: MenuOption<WindowMode>[] = [
  { label: '全屏', value: 'fullscreen' },
  { label: '大窗口', value: 'large' },
  { label: '中窗口', value: 'medium' },
  { label: '小窗口', value: 'small' },
]

const TITLE_LINE_OPTIONS: MenuOption<TitleLineCount>[] = [
  { label: '单行标题', value: 'one' },
  { label: '双行标题', value: 'two' },
]

const GRID_VIEW_MODE_OPTIONS: MenuOption<LaunchpadGridViewMode>[] = [
  { label: '分页网格', value: 'paged' },
  { label: '侧栏滚动', value: 'scroll' },
]

interface MenuRadioSubProps<T extends string> {
  label: string
  value: T
  options: MenuOption<T>[]
  onValueChange: (value: T) => void
}

function MenuRadioSub<T extends string>({
  label,
  value,
  options,
  onValueChange,
}: MenuRadioSubProps<T>) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>{translate(label)}</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-44">
        <ContextMenuRadioGroup
          value={value}
          onValueChange={nextValue => onValueChange(nextValue as T)}
        >
          {options.map(option => (
            <ContextMenuRadioItem key={option.value} value={option.value}>
              {translate(option.label)}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}

interface LaunchpadContextMenuContentProps {
  addIconDisabled: boolean
  onAddIcon: () => void
  onSelectIcons: () => void
  onAiOrganize: () => void
  onOpenSettings: () => void
}

export function LaunchpadContextMenuContent({
  addIconDisabled,
  onAddIcon,
  onSelectIcons,
  onAiOrganize,
  onOpenSettings,
}: LaunchpadContextMenuContentProps) {
  const {
    iconSize,
    setIconSize,
    windowMode,
    setWindowMode,
    titleLineCount,
    setTitleLineCount,
    launchpadGridViewMode,
    setLaunchpadGridViewMode,
    iconContextMenuMode,
    setIconContextMenuMode,
  } = useIconStore()

  return (
    <ContextMenuContent className="w-44">
      <MenuRadioSub
        label="图标大小"
        value={iconSize}
        options={ICON_SIZE_OPTIONS}
        onValueChange={setIconSize}
      />
      <MenuRadioSub
        label="窗口大小"
        value={windowMode}
        options={WINDOW_MODE_OPTIONS}
        onValueChange={setWindowMode}
      />
      <MenuRadioSub
        label="标题行数"
        value={titleLineCount}
        options={TITLE_LINE_OPTIONS}
        onValueChange={setTitleLineCount}
      />
      <MenuRadioSub
        label="网格模式"
        value={launchpadGridViewMode}
        options={GRID_VIEW_MODE_OPTIONS}
        onValueChange={setLaunchpadGridViewMode}
      />

      <ContextMenuSeparator />
      <ContextMenuItem disabled={addIconDisabled} onSelect={onAddIcon}>
        {translate('添加快捷入口')}
      </ContextMenuItem>
      <ContextMenuItem onSelect={onSelectIcons}>{translate('批量选择图标')}</ContextMenuItem>
      <ContextMenuItem onSelect={onAiOrganize}>{translate('AI 智能整理')}</ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuCheckboxItem
        checked={iconContextMenuMode === 'system'}
        onCheckedChange={checked => {
          setIconContextMenuMode(checked ? 'system' : 'custom')
        }}
      >
        {translate('图标使用 Windows 原生菜单')}
      </ContextMenuCheckboxItem>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={onOpenSettings}>{translate('设置')}</ContextMenuItem>
    </ContextMenuContent>
  )
}
