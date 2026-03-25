import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
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
  hiddenItemIds: Set<string>
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
  onRenameFolder: (folderId: string, name: string) => void
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
  hiddenItemIds,
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
  onRenameFolder,
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

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const commitRename = () => {
    if (!openFolder) return
    const trimmed = editName.trim()
    if (trimmed && trimmed !== openFolder.name) {
      onRenameFolder(openFolder.id, trimmed)
    }
    setEditing(false)
  }

  const GRID_GAP = 8 // gap-2
  const PANEL_PADDING = 20 // p-5
  const fittedGridWidth = folderColumns * folderItemWidth + (folderColumns - 1) * GRID_GAP
  const fittedPanelWidth = fittedGridWidth + PANEL_PADDING * 2
  const panelWidth = Math.min(fittedPanelWidth, maxModalWidth, window.innerWidth * 0.92)

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
          {/* Wrapper for title + close + panel */}
          <div className="relative flex flex-col items-center">
            {/* Title bar - name centered, X button right-aligned, same width as panel */}
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              transition={contentTransition}
              className="mb-2 flex items-center"
              style={{ width: `${panelWidth}px` }}
              onPointerDown={e => e.stopPropagation()}
            >
              {/* Spacer to balance the X button */}
              <div className="w-6" />
              {/* Folder name - centered */}
              <div className="flex flex-1 justify-center">
                {editing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditing(false)
                    }}
                    className="rounded-md border border-white/25 bg-black/50 px-3 py-1 text-center text-sm font-medium text-white/90 outline-none backdrop-blur-sm focus:border-white/40"
                    style={{ minWidth: '80px', maxWidth: '240px' }}
                  />
                ) : (
                  <button
                    type="button"
                    className="truncate rounded-md px-3 py-1 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
                    style={{ maxWidth: '240px' }}
                    title={openFolder.name}
                    onClick={() => {
                      setEditName(openFolder.name)
                      setEditing(true)
                    }}
                  >
                    {openFolder.name}
                  </button>
                )}
              </div>
              {/* Close X button */}
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white/80 transition-colors hover:bg-white/25 hover:text-white"
                onClick={e => {
                  e.stopPropagation()
                  onClose()
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </motion.div>

            <motion.div
              layoutId={sharedLayoutId}
              transition={prefersReducedMotion ? { duration: 0 } : FOLDER_SHARED_LAYOUT_TRANSITION}
              data-icon
              ref={folderPanelRef}
              className="relative overflow-hidden rounded-3xl border border-white/15 bg-black/55 p-5 shadow-[0_24px_56px_rgba(0,0,0,0.5)] backdrop-blur-xl will-change-[transform,border-radius]"
              style={{
                width: `${panelWidth}px`,
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

              <div
                ref={folderGridContainerRef}
                className="-mr-5 overflow-auto pr-5"
                style={{ maxHeight: `calc(min(80vh, ${maxModalHeight}px) - 48px)` }}
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
                    const hiddenItem = hiddenItemIds.has(entry)

                    return (
                      <div
                        key={entry}
                        ref={node => {
                          bindFolderTileRef(entry, node)
                        }}
                        data-folder-grid-item
                        className={`relative touch-none transition-opacity duration-150 ${
                          hiddenItem ? 'pointer-events-none opacity-0' : 'opacity-100'
                        }`}
                        onPointerDown={event =>
                          onFolderTilePointerDown(event, openFolder.id, entry)
                        }
                        onClickCapture={onTileClickCapture}
                        onClick={e => e.stopPropagation()}
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
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
