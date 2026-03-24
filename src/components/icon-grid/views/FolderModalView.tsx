import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react'
import { Icon } from '../../Icon'
import { DRAG_HOLE_ID } from '../domain/slots'
import type { FolderItem, IconItem } from '../model'
import {
  FOLDER_MODAL_TRANSITION_EASING,
  FOLDER_SHARED_LAYOUT_TRANSITION,
  getFolderSharedLayoutId,
} from './FolderVisuals'

interface FolderModalViewProps {
  openFolder: FolderItem | null
  activeFolderSharedLayoutId: string | null
  dragContext: 'outer' | 'folder' | null
  selectionMode: boolean
  selectedSet: Set<string>
  onToggleSelectIcon: (key: string) => void
  folderPanelRef: RefObject<HTMLDivElement | null>
  folderGridContainerRef: RefObject<HTMLDivElement | null>
  folderGridRef: RefObject<HTMLDivElement | null>
  folderColumns: number
  folderItemWidth: number
  folderItemHeight: number
  folderRenderOrder: Array<string | null>
  folderItemById: Map<string, IconItem>
  bindFolderTileRef: (id: string, node: HTMLDivElement | null) => void
  onBackdropClose: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPanelPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPanelClick: (event: ReactMouseEvent<HTMLDivElement>) => void
  onClose: () => void
  onFolderTilePointerDown: (
    event: ReactPointerEvent<HTMLDivElement>,
    folderId: string,
    itemId: string
  ) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  maxModalWidth: number
  maxModalHeight: number
}

export function FolderModalView({
  openFolder,
  activeFolderSharedLayoutId,
  dragContext,
  selectionMode,
  selectedSet,
  onToggleSelectIcon,
  folderPanelRef,
  folderGridContainerRef,
  folderGridRef,
  folderColumns,
  folderItemWidth,
  folderItemHeight,
  folderRenderOrder,
  folderItemById,
  bindFolderTileRef,
  onBackdropClose,
  onPanelPointerDown,
  onPanelClick,
  onClose,
  onFolderTilePointerDown,
  onTileClickCapture,
  maxModalWidth,
  maxModalHeight,
}: FolderModalViewProps) {
  const prefersReducedMotion = useReducedMotion()
  const backdropTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: FOLDER_MODAL_TRANSITION_EASING }
  const contentTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.24, ease: FOLDER_MODAL_TRANSITION_EASING, delay: 0.06 }
  const sharedLayoutId =
    openFolder && activeFolderSharedLayoutId === openFolder.id
      ? getFolderSharedLayoutId(openFolder.id)
      : undefined

  return (
    <AnimatePresence initial={false}>
      {openFolder ? (
        <motion.div
          key={openFolder.id}
          data-folder-modal="true"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
          onPointerDown={onBackdropClose}
          onClick={event => {
            event.stopPropagation()
          }}
        >
          <motion.div
            layoutId={sharedLayoutId}
            transition={prefersReducedMotion ? { duration: 0 } : FOLDER_SHARED_LAYOUT_TRANSITION}
            data-icon
            ref={folderPanelRef}
            className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/55 p-5 shadow-[0_24px_56px_rgba(0,0,0,0.5)] backdrop-blur-xl will-change-[transform,border-radius]"
            style={{
              width: `min(92vw, ${maxModalWidth}px)`,
              maxHeight: `min(80vh, ${maxModalHeight}px)`,
            }}
            onPointerDown={onPanelPointerDown}
            onClick={onPanelClick}
          >
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.99 }}
              transition={contentTransition}
              className="flex max-h-full flex-col"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="truncate text-sm font-medium text-white/90" title={openFolder.name}>
                  {openFolder.name}
                </h3>
                <button
                  type="button"
                  className="rounded-full border border-white/25 px-3 py-1 text-xs text-white/85 transition-colors hover:bg-white/15"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>

              <div
                ref={folderGridContainerRef}
                className="overflow-auto"
                style={{ maxHeight: `calc(min(80vh, ${maxModalHeight}px) - 88px)` }}
              >
                <div
                  ref={folderGridRef}
                  className="grid content-start justify-items-center gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(1, folderColumns)}, ${folderItemWidth}px)`,
                  }}
                >
                  {folderRenderOrder.map((entry, index) => {
                    if (entry === null || entry === DRAG_HOLE_ID) {
                      const showDropSlot = entry === DRAG_HOLE_ID && dragContext === 'folder'
                      return (
                        <div
                          key={`folder-${showDropSlot ? 'drop' : 'empty'}-${index}`}
                          data-folder-grid-item
                          className={`h-full w-full rounded-2xl ${
                            showDropSlot
                              ? 'border border-white/20 bg-white/8'
                              : 'border border-transparent bg-transparent'
                          }`}
                          style={{ minHeight: `${folderItemHeight}px` }}
                          aria-hidden="true"
                        />
                      )
                    }

                    const item = folderItemById.get(entry)
                    if (!item) return null

                    return (
                      <div
                        key={entry}
                        ref={node => {
                          bindFolderTileRef(entry, node)
                        }}
                        data-folder-grid-item
                        className="relative touch-none"
                        onPointerDown={event =>
                          onFolderTilePointerDown(event, openFolder.id, entry)
                        }
                        onClickCapture={onTileClickCapture}
                      >
                        <Icon
                          icon={item.icon}
                          selectionKey={item.key}
                          selectionMode={selectionMode}
                          selected={selectedSet.has(item.key)}
                          onToggleSelect={onToggleSelectIcon}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
