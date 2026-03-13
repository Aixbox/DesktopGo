import type { DesktopIcon } from '../../../types'
import { getDockPreviewKeys } from '../domain/dock'

interface DockBarProps {
  dockKeys: string[]
  iconByKey: Map<string, DesktopIcon>
  dockCapacity: number
  dockPreviewIndex: number | null
  draggingKey: string | null
  draggingIcon: DesktopIcon | null
  selectionMode: boolean
  bindDockContainerRef: (node: HTMLDivElement | null) => void
  bindDockSlotRef: (index: number, node: HTMLDivElement | null) => void
  onLaunchIcon: (icon: DesktopIcon) => void
  onRemoveIcon: (key: string) => void
}

const SLOT_SIZE = 64

export function DockBar({
  dockKeys,
  iconByKey,
  dockCapacity,
  dockPreviewIndex,
  draggingKey,
  draggingIcon,
  selectionMode,
  bindDockContainerRef,
  bindDockSlotRef,
  onLaunchIcon,
  onRemoveIcon,
}: DockBarProps) {
  const previewKeys = getDockPreviewKeys(dockKeys, draggingKey, dockPreviewIndex, dockCapacity)
  const isPreviewVisible = dockPreviewIndex !== null && draggingKey !== null

  return (
    <div
      ref={bindDockContainerRef}
      data-dock
      className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
    >
      <div
        className={`rounded-[28px] border border-white/18 bg-black/22 px-3 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-2xl transition ${
          isPreviewVisible ? 'ring-1 ring-white/30' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          {Array.from({ length: dockCapacity }, (_, index) => {
            const key = previewKeys[index] ?? null
            const icon = key
              ? (iconByKey.get(key) ?? (key === draggingKey ? draggingIcon : null))
              : null
            const isPreviewGhost = isPreviewVisible && key === draggingKey

            return (
              <div
                key={index}
                ref={node => {
                  bindDockSlotRef(index, node)
                }}
                data-dock-slot
                className={`relative flex items-center justify-center rounded-2xl border transition ${
                  icon ? 'border-white/14 bg-white/10' : 'border-white/10 border-dashed bg-white/4'
                }`}
                style={{ width: SLOT_SIZE, height: SLOT_SIZE }}
              >
                {icon ? (
                  <div className="group relative flex h-[56px] w-[56px] items-center justify-center">
                    <button
                      data-dock-item
                      data-dock-key={key ?? undefined}
                      type="button"
                      title={icon.name}
                      className={`flex h-[56px] w-[56px] cursor-pointer items-center justify-center rounded-2xl border-none bg-transparent p-0 shadow-none transition ${
                        selectionMode || isPreviewGhost
                          ? 'pointer-events-none'
                          : 'hover:bg-white/10 active:scale-95'
                      } ${isPreviewGhost ? 'scale-[0.96] opacity-70' : 'opacity-100'}`}
                      onClick={event => {
                        event.stopPropagation()
                        if (selectionMode || !icon) return
                        onLaunchIcon(icon)
                      }}
                    >
                      {icon.icon_base64 ? (
                        <img
                          src={icon.icon_base64}
                          alt={icon.name}
                          className="h-10 w-10 object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-white/12" aria-hidden="true" />
                      )}
                    </button>

                    {!selectionMode && !isPreviewGhost ? (
                      <button
                        data-dock-remove
                        type="button"
                        aria-label={`Remove ${icon.name} from dock`}
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-black/70 p-0 text-[10px] leading-none text-white/75 opacity-0 shadow-none transition group-hover:opacity-100 hover:bg-black/85 hover:text-white"
                        onClick={event => {
                          event.stopPropagation()
                          if (!key) return
                          onRemoveIcon(key)
                        }}
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
