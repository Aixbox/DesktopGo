import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { DesktopIcon } from '../../../types'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'
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
  onDockItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, key: string) => void
  onDockItemClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onLaunchIcon: (icon: DesktopIcon) => void
  onRemoveIcon: (key: string) => void
}

const SLOT_SIZE = 64
const MENU_OPEN_LABEL = '\u6253\u5f00'
const MENU_REMOVE_LABEL = '\u79fb\u51fa Dock'

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
  onDockItemPointerDown,
  onDockItemClickCapture,
  onLaunchIcon,
  onRemoveIcon,
}: DockBarProps) {
  const fallbackPreviewIndex =
    draggingKey && dockKeys.includes(draggingKey) ? dockKeys.indexOf(draggingKey) : null
  const resolvedPreviewIndex = dockPreviewIndex ?? fallbackPreviewIndex
  const previewKeys = getDockPreviewKeys(dockKeys, draggingKey, resolvedPreviewIndex, dockCapacity)
  const isPreviewVisible = draggingKey !== null && resolvedPreviewIndex !== null

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
                {icon && key ? (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        data-dock-item
                        data-dock-key={key}
                        className="group relative flex h-[56px] w-[56px] items-center justify-center"
                        onPointerDown={event => {
                          onDockItemPointerDown(event, key)
                        }}
                        onClickCapture={onDockItemClickCapture}
                        onContextMenu={event => {
                          event.stopPropagation()
                        }}
                      >
                        <button
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
                      </div>
                    </ContextMenuTrigger>

                    {!selectionMode && !isPreviewGhost ? (
                      <ContextMenuContent
                        data-dock-menu="true"
                        className="w-44 rounded-2xl border-white/15 bg-black/90 p-1.5 text-white shadow-2xl backdrop-blur-xl"
                      >
                        <ContextMenuItem
                          className="rounded-xl px-3 py-2 text-white/85 focus:bg-white/12 focus:text-white"
                          onSelect={() => {
                            onLaunchIcon(icon)
                          }}
                        >
                          {MENU_OPEN_LABEL}
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="rounded-xl px-3 py-2 text-red-200 focus:bg-red-500/20 focus:text-red-100"
                          onSelect={() => {
                            onRemoveIcon(key)
                          }}
                        >
                          {MENU_REMOVE_LABEL}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    ) : null}
                  </ContextMenu>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
