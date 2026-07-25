import { AppWindow, Folder } from 'lucide-react'
import { translate } from '@/lib/i18n'
import { IconContextMenu } from '@/components/icons/IconContextMenu'
import { useIconStore } from '@/stores/iconStore'
import { ICON_SIZE_CONFIG, type DesktopIcon } from '@/types'

interface ShortcutSearchResultsProps {
  icons: DesktopIcon[]
  selectedIndex: number
  onSelect: (index: number) => void
  onActivate: (icon: DesktopIcon) => void
  mode: 'compact' | 'grid'
  heading?: string
}

function ShortcutIcon({ icon, size }: { icon: DesktopIcon; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    >
      {icon.icon_base64 ? (
        <img
          src={icon.icon_base64}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
      ) : icon.item_type === 'folder' ? (
        <Folder className="h-5 w-5 text-muted-foreground" />
      ) : (
        <AppWindow className="h-5 w-5 text-muted-foreground" />
      )}
    </span>
  )
}

export function ShortcutSearchResults({
  icons,
  selectedIndex,
  onSelect,
  onActivate,
  mode,
  heading,
}: ShortcutSearchResultsProps) {
  const { iconSize, titleLineCount } = useIconStore()
  const config = ICON_SIZE_CONFIG[iconSize]
  const singleLineTitle = titleLineCount === 'one'

  if (icons.length === 0) return null

  if (mode === 'compact') {
    return (
      <section className="shrink-0 border-b border-border/70 px-3 pb-3 pt-2">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            {translate(heading ?? '快捷入口')}
          </h3>
          <span className="text-[11px] text-muted-foreground/75">{icons.length}</span>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {icons.map((icon, index) => (
            <IconContextMenu key={icon.id} icon={icon} onOpen={() => onActivate(icon)}>
              <button
                type="button"
                className={`flex h-12 min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left transition-colors ${
                  selectedIndex === index
                    ? 'bg-accent/90 ring-1 ring-border/70'
                    : 'hover:bg-accent/55'
                }`}
                title={icon.name}
                onMouseEnter={() => onSelect(index)}
                onClick={() => onSelect(index)}
                onDoubleClick={() => onActivate(icon)}
              >
                <ShortcutIcon icon={icon} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{icon.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {icon.target_path || icon.path}
                  </span>
                </span>
              </button>
            </IconContextMenu>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="max-h-[56vh] overflow-auto px-4 py-4">
      <div
        className="grid justify-center gap-x-4 gap-y-5"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(${config.containerWidth}px, ${config.containerWidth}px))`,
        }}
      >
        {icons.map((icon, index) => (
          <IconContextMenu key={icon.id} icon={icon} onOpen={() => onActivate(icon)}>
            <button
              type="button"
              className={`group relative flex cursor-pointer flex-col items-center gap-2 rounded-md border-none p-3 shadow-none transition-colors duration-150 ${
                selectedIndex === index
                  ? 'bg-blue-500/12 ring-1 ring-blue-500/40 dark:bg-blue-400/18 dark:ring-blue-400/45'
                  : 'bg-transparent hover:bg-accent/60 active:bg-accent'
              }`}
              style={{ width: config.containerWidth }}
              title={icon.name}
              onMouseEnter={() => onSelect(index)}
              onClick={() => onSelect(index)}
              onDoubleClick={() => onActivate(icon)}
            >
              <ShortcutIcon icon={icon} size={config.imgSize} />
              <span
                className={`text-center text-[11px] leading-tight ${
                  selectedIndex === index ? 'text-blue-700 dark:text-blue-200' : 'text-foreground'
                }`}
                style={{
                  maxWidth: config.containerWidth - 10,
                  display: singleLineTitle ? 'block' : '-webkit-box',
                  WebkitLineClamp: singleLineTitle ? 1 : 2,
                  WebkitBoxOrient: singleLineTitle ? undefined : 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: singleLineTitle ? 'nowrap' : 'normal',
                  overflowWrap: 'anywhere',
                }}
              >
                {icon.name}
              </span>
            </button>
          </IconContextMenu>
        ))}
      </div>
    </div>
  )
}
