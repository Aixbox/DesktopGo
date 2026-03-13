import {
  useLayoutEffect,
  useEffect,
  useRef,
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
import { DOCK_GAP } from '../domain/dock'
import { FolderCreatePreview, FolderIconVisual } from './FolderVisuals'

interface DockBarProps {
  displaySlots: Array<string | null>
  itemById: Map<string, GridItem>
  dockPreviewIndex: number | null
  dragContext: 'outer' | 'folder' | 'dock' | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  iconImageSize: number
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
const DOCK_CONTAINER_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
const DOCK_CONTAINER_TRANSITION_MS = 220

export function DockBar({
  displaySlots,
  itemById,
  dockPreviewIndex,
  dragContext,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  iconImageSize,
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
  const panelRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const hasMountedRef = useRef(false)
  const clearWidthTimerRef = useRef<number | null>(null)
  const dockButtonSize = Math.max(iconImageSize + 12, 52)
  const showInsertionPreview =
    dragContext === 'dock' &&
    dockPreviewIndex !== null &&
    dragFolderPreviewTargetId === null &&
    folderPreviewFreezeTargetId === null

  const hasVisibleItems = displaySlots.some(slot => typeof slot === 'string')

  useLayoutEffect(() => {
    const panel = panelRef.current
    const grid = gridRef.current
    if (!panel || !grid) return

    const panelStyle = window.getComputedStyle(panel)
    const horizontalChrome =
      parseFloat(panelStyle.paddingLeft) +
      parseFloat(panelStyle.paddingRight) +
      parseFloat(panelStyle.borderLeftWidth) +
      parseFloat(panelStyle.borderRightWidth)
    const nextWidth = Math.ceil(grid.getBoundingClientRect().width + horizontalChrome)

    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      panel.style.width = ''
      return
    }

    const currentWidth = Math.ceil(panel.getBoundingClientRect().width)
    if (Math.abs(currentWidth - nextWidth) < 1) return

    if (clearWidthTimerRef.current !== null) {
      window.clearTimeout(clearWidthTimerRef.current)
      clearWidthTimerRef.current = null
    }

    panel.style.width = `${currentWidth}px`
    void panel.offsetWidth
    panel.style.width = `${nextWidth}px`

    clearWidthTimerRef.current = window.setTimeout(() => {
      const latestPanel = panelRef.current
      if (!latestPanel) return
      latestPanel.style.width = ''
      clearWidthTimerRef.current = null
    }, DOCK_CONTAINER_TRANSITION_MS + 40)
  }, [displaySlots.length, iconImageSize])

  useEffect(() => {
    return () => {
      if (clearWidthTimerRef.current !== null) {
        window.clearTimeout(clearWidthTimerRef.current)
        clearWidthTimerRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={bindDockContainerRef}
      data-dock
      className="pointer-events-auto absolute bottom-5 left-1/2 z-20 -translate-x-1/2"
    >
      <div
        ref={panelRef}
        className="overflow-hidden rounded-[28px] border border-white/16 bg-black/24 px-4 py-3 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl transition-[width] duration-[220ms]"
        style={{
          transitionTimingFunction: DOCK_CONTAINER_EASING,
        }}
      >
        <div
          ref={node => {
            gridRef.current = node
            bindDockGridRef(node)
          }}
          className="flex items-center"
          style={{ columnGap: `${DOCK_GAP}px` }}
        >
          {displaySlots.map((id, index) => {
            const item = id ? itemById.get(id) ?? null : null
            const folderPreview =
              Boolean(id) &&
              ((dragContext === 'dock' && dragFolderPreviewTargetId === id) ||
                folderPreviewFreezeTargetId === id ||
                folderCreateTransitionTargetId === id)

            return (
              <div
                key={id ?? `dock-empty-${index}`}
                ref={node => {
                  bindDockSlotRef(index, node)
                }}
                data-dock-slot
                className="relative flex items-center justify-center"
                style={{ width: dockButtonSize, height: dockButtonSize }}
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
                        className="group relative flex items-center justify-center"
                        style={{ width: dockButtonSize, height: dockButtonSize }}
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
                          className={`relative flex cursor-pointer items-center justify-center rounded-2xl border-none bg-transparent p-0 shadow-none transition ${
                            selectionMode
                              ? 'pointer-events-none'
                              : 'hover:-translate-y-0.5 active:translate-y-0'
                          }`}
                          style={{ width: dockButtonSize, height: dockButtonSize }}
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
                                    className="icon-image object-contain"
                                    style={{ width: iconImageSize, height: iconImageSize }}
                                    draggable={false}
                                  />
                                ) : (
                                  <div
                                    className="icon-image rounded-xl bg-white/12"
                                    style={{ width: iconImageSize, height: iconImageSize }}
                                    aria-hidden="true"
                                  />
                                )}
                              </div>
                              <FolderCreatePreview
                                active={folderPreview}
                                icon={item.icon}
                                imgSize={iconImageSize}
                                reorderAnimationMs={220}
                              />
                            </>
                          ) : (
                            <div
                              className="flex items-center justify-center transition-opacity duration-150"
                              style={{ width: dockButtonSize, height: dockButtonSize }}
                            >
                              <FolderIconVisual
                                icons={item.children.map(child => child.icon)}
                                imgSize={iconImageSize}
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
                ) : (
                  <div
                    className={`pointer-events-none flex items-center justify-center rounded-[18px] border border-dashed transition ${
                      hasVisibleItems
                        ? 'border-white/18 bg-white/[0.04]'
                        : 'border-white/24 bg-white/[0.06]'
                    } ${showInsertionPreview ? 'scale-100 opacity-100' : 'opacity-80'}`}
                    style={{ width: iconImageSize + 8, height: iconImageSize + 8 }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
