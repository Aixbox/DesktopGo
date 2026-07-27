import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
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
} from './folderVisualPolicy'
import { Input } from '@/components/ui/input'
import { translate, useI18n } from '@/lib/i18n'

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
  onActivateIcon: (icon: IconItem) => void
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
  onActivateIcon,
  onFolderTilePointerDown,
  onTileClickCapture,
  maxModalWidth,
  maxModalHeight,
}: FolderModalViewProps) {
  useI18n()

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
  const modalRootRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const openFolderIdRef = useRef<string | undefined>(undefined)
  const openFolderId = openFolder?.id
  openFolderIdRef.current = openFolderId

  const restorePreviousFocus = useCallback(() => {
    if (previousFocusRef.current?.isConnected) {
      previousFocusRef.current.focus({ preventScroll: true })
    }
    previousFocusRef.current = null
  }, [])

  useEffect(() => {
    if (!openFolderId) return

    previousFocusRef.current ??= document.activeElement as HTMLElement | null
    const focusFrame = window.requestAnimationFrame(() => {
      modalRootRef.current?.focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
    }
  }, [folderPanelRef, openFolderId])

  useEffect(
    () => () => {
      restorePreviousFocus()
    },
    [restorePreviousFocus]
  )

  const handleModalKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return

    const focusable = modalRootRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
    if (!focusable?.length) {
      event.preventDefault()
      modalRootRef.current?.focus({ preventScroll: true })
      return
    }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeElement = document.activeElement
    const focusIsOutsideSequence =
      !(activeElement instanceof HTMLElement) || !Array.from(focusable).includes(activeElement)

    if (event.shiftKey && (activeElement === first || focusIsOutsideSequence)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (activeElement === last || focusIsOutsideSequence)) {
      event.preventDefault()
      first.focus()
    }
  }

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
    <AnimatePresence
      initial={false}
      onExitComplete={() => {
        if (!openFolderIdRef.current) restorePreviousFocus()
      }}
    >
      {openFolder ? (
        <motion.div
          key={openFolder.id}
          data-folder-modal="true"
          className="launchpad-overlay-backdrop absolute inset-0 z-40 flex items-center justify-center backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={backdropTransition}
          onPointerDown={onBackdropClose}
          onClick={event => {
            event.stopPropagation()
          }}
          onKeyDown={handleModalKeyDown}
        >
          {/* Wrapper for title + close + panel */}
          <div
            ref={modalRootRef}
            role="dialog"
            aria-modal="true"
            aria-label={openFolder.name}
            tabIndex={-1}
            className="relative flex flex-col items-center focus:outline-none"
          >
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
              <div className="w-8" />
              {/* Folder name - centered */}
              <div className="flex flex-1 justify-center">
                {editing ? (
                  <Input
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    maxLength={64}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setEditing(false)
                    }}
                    className="h-auto w-auto border-border/55 bg-background/78 py-1 text-center font-medium text-foreground shadow-sm backdrop-blur-sm focus-visible:border-ring/70 focus-visible:ring-ring/20 dark:border-white/25 dark:bg-black/50 dark:text-white/90 dark:focus-visible:border-white/40 dark:focus-visible:ring-white/10"
                    style={{ minWidth: '80px', maxWidth: '240px' }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={translate('重命名文件夹 {name}', { name: openFolder.name })}
                    className="truncate rounded-md px-3 py-1 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 dark:text-white/90 dark:hover:bg-white/10"
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
                aria-label={translate('关闭文件夹')}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-background/72 text-foreground/75 transition-colors hover:bg-background/92 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 dark:bg-white/15 dark:text-white/80 dark:hover:bg-white/25 dark:hover:text-white"
                onClick={e => {
                  e.stopPropagation()
                  onClose()
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  className="h-3 w-3"
                >
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </motion.div>

            <motion.div
              layoutId={sharedLayoutId}
              transition={prefersReducedMotion ? { duration: 0 } : FOLDER_SHARED_LAYOUT_TRANSITION}
              data-icon
              ref={folderPanelRef}
              className="launchpad-glass-panel-strong relative overflow-hidden rounded-2xl p-5 will-change-[transform,border-radius]"
              style={{
                width: `${panelWidth}px`,
                maxHeight: `min(80vh, ${maxModalHeight}px)`,
              }}
              onPointerDown={onPanelPointerDown}
              onClick={onPanelClick}
            >
              <motion.div
                initial={
                  prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.985 }
                }
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
                                ? 'border border-border/60 bg-background/35 dark:border-white/20 dark:bg-white/8'
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
                            onActivate={() => onActivateIcon(item)}
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
