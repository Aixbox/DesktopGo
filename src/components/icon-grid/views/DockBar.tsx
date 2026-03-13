import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import type { GridItem } from '../model'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'
import {
  DOCK_GAP,
  DOCK_SLOT_SIZE,
  getDockPreviewSlots,
} from '../domain/dock'
import { FolderCreatePreview, FolderIconVisual } from './FolderVisuals'

interface DockBarProps {
  dockKeys: Array<string | null>
  itemById: Map<string, GridItem>
  dockCapacity: number
  dockPreviewIndex: number | null
  dragContext: 'outer' | 'folder' | 'dock' | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  draggingId: string | null
  selectionMode: boolean
  bindDockContainerRef: (node: HTMLDivElement | null) => void
  bindDockGridRef: (node: HTMLDivElement | null) => void
  bindDockSlotRef: (index: number, node: HTMLDivElement | null) => void
  bindDockItemRef: (id: string, node: HTMLDivElement | null) => void
  onDockItemPointerDown: (event: ReactPointerEvent<HTMLDivElement>, id: string) => void
  onDockItemClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onLaunchIcon: (path: string) => void
  onOpenFolder: (folderId: string) => void
  onRemoveItem: (id: string) => void
}

const MENU_OPEN_LABEL = '\u6253\u5f00'
const MENU_REMOVE_LABEL = '\u79fb\u51fa Dock'
const DOCK_ICON_SIZE = 40
const DOCK_BUTTON_SIZE = 56
const DOCK_FOLDER_SIZE = 48

export function DockBar({
  dockKeys,
  itemById,
  dockCapacity,
  dockPreviewIndex,
  dragContext,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  draggingId,
  selectionMode,
  bindDockContainerRef,
  bindDockGridRef,
  bindDockSlotRef,
  bindDockItemRef,
  onDockItemPointerDown,
  onDockItemClickCapture,
  onLaunchIcon,
  onOpenFolder,
  onRemoveItem,
}: DockBarProps) {
  const displayDockSlots = getDockPreviewSlots(
    dockKeys,
    dragContext === 'dock' ? draggingId : null
  )
  const isPreviewVisible = dragContext === 'dock' && dockPreviewIndex !== null

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
        <div
          ref={bindDockGridRef}
          className="flex items-center"
          style={{ columnGap: `${DOCK_GAP}px` }}
        >
          {Array.from({ length: dockCapacity }, (_, index) => {
            const id = displayDockSlots[index] ?? null
            const item = id ? itemById.get(id) ?? null : null
            const isDropSlot = isPreviewVisible && dockPreviewIndex === index
            const folderPreview =
              Boolean(id) &&
              ((dragContext === 'dock' && dragFolderPreviewTargetId === id) ||
                folderPreviewFreezeTargetId === id ||
                folderCreateTransitionTargetId === id)

            return (
              <div
                key={index}
                ref={node => {
                  bindDockSlotRef(index, node)
                }}
                data-dock-slot
                className={`relative flex items-center justify-center rounded-2xl border transition ${
                  item ? 'border-white/14 bg-white/10' : 'border-white/10 border-dashed bg-white/4'
                } ${isDropSlot ? 'ring-1 ring-white/35 bg-white/8' : ''}`}
                style={{ width: DOCK_SLOT_SIZE, height: DOCK_SLOT_SIZE }}
              >
                {item && id ? (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        ref={node => {
                          bindDockItemRef(id, node)
                        }}
                        data-dock-item
                        data-dock-key={id}
                        className="group relative flex h-[56px] w-[56px] items-center justify-center"
                        onPointerDown={event => {
                          onDockItemPointerDown(event, id)
                        }}
                        onClickCapture={onDockItemClickCapture}
                        onContextMenu={event => {
                          event.stopPropagation()
                        }}
                      >
                        <button
                          type="button"
                          title={item.kind === 'icon' ? item.icon.name : item.name}
                          className={`relative flex h-[56px] w-[56px] cursor-pointer items-center justify-center rounded-2xl border-none bg-transparent p-0 shadow-none transition ${
                            selectionMode ? 'pointer-events-none' : 'hover:bg-white/10 active:scale-95'
                          }`}
                          onClick={event => {
                            event.stopPropagation()
                            if (selectionMode) return
                            if (item.kind === 'icon') {
                              onLaunchIcon(item.icon.path)
                              return
                            }
                            onOpenFolder(item.id)
                          }}
                        >
                          {item.kind === 'icon' ? (
                            <>
                              <div
                                className={`transition-opacity duration-150 ${
                                  folderPreview ? 'opacity-0' : 'opacity-100'
                                }`}
                              >
                                {item.icon.icon_base64 ? (
                                  <img
                                    src={item.icon.icon_base64}
                                    alt={item.icon.name}
                                    className="object-contain"
                                    style={{ width: DOCK_ICON_SIZE, height: DOCK_ICON_SIZE }}
                                    draggable={false}
                                  />
                                ) : (
                                  <div
                                    className="rounded-xl bg-white/12"
                                    style={{ width: DOCK_ICON_SIZE, height: DOCK_ICON_SIZE }}
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              <FolderCreatePreview
                                active={folderPreview}
                                icon={item.icon}
                                imgSize={DOCK_ICON_SIZE}
                                reorderAnimationMs={220}
                              />
                            </>
                          ) : (
                            <div
                              className="flex h-full w-full items-center justify-center transition-opacity duration-150"
                              style={{ width: DOCK_BUTTON_SIZE, height: DOCK_BUTTON_SIZE }}
                            >
                              <FolderIconVisual
                                icons={item.children.map(child => child.icon)}
                                imgSize={DOCK_FOLDER_SIZE}
                                expanded={folderPreview}
                              />
                            </div>
                          )}
                        </button>
                      </div>
                    </ContextMenuTrigger>

                    {!selectionMode ? (
                      <ContextMenuContent
                        data-dock-menu="true"
                        className="w-44 rounded-2xl border-white/15 bg-black/90 p-1.5 text-white shadow-2xl backdrop-blur-xl"
                      >
                        <ContextMenuItem
                          className="rounded-xl px-3 py-2 text-white/85 focus:bg-white/12 focus:text-white"
                          onSelect={() => {
                            if (item.kind === 'icon') {
                              onLaunchIcon(item.icon.path)
                              return
                            }
                            onOpenFolder(item.id)
                          }}
                        >
                          {MENU_OPEN_LABEL}
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="rounded-xl px-3 py-2 text-red-200 focus:bg-red-500/20 focus:text-red-100"
                          onSelect={() => {
                            onRemoveItem(id)
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
