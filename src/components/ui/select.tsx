import * as React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { createPortal } from 'react-dom'

import { translate, useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

const MENU_GAP = 8
const MENU_MARGIN = 12
const MENU_MIN_WIDTH = 180
const MENU_MAX_HEIGHT = 280

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getMenuStyle(
  triggerElement: HTMLButtonElement,
  menuElement: HTMLDivElement
): React.CSSProperties {
  const triggerRect = triggerElement.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = Math.max(triggerRect.width, MENU_MIN_WIDTH)
  const cappedWidth = Math.min(menuWidth, viewportWidth - MENU_MARGIN * 2)
  const naturalLeft = triggerRect.left
  const left = clamp(
    naturalLeft,
    MENU_MARGIN,
    Math.max(MENU_MARGIN, viewportWidth - cappedWidth - MENU_MARGIN)
  )
  const menuHeight = Math.min(menuElement.scrollHeight, MENU_MAX_HEIGHT)
  const spaceBelow = viewportHeight - triggerRect.bottom - MENU_MARGIN
  const spaceAbove = triggerRect.top - MENU_MARGIN
  const openUpward = spaceBelow < menuHeight + MENU_GAP && spaceAbove > spaceBelow
  const maxHeight = Math.max(
    120,
    openUpward
      ? triggerRect.top - MENU_GAP - MENU_MARGIN
      : viewportHeight - triggerRect.bottom - MENU_GAP - MENU_MARGIN
  )

  return {
    position: 'fixed',
    left,
    width: cappedWidth,
    maxHeight,
    zIndex: 100,
    top: openUpward ? undefined : triggerRect.bottom + MENU_GAP,
    bottom: openUpward ? viewportHeight - triggerRect.top + MENU_GAP : undefined,
  }
}

function getViewportMaxHeight(maxHeight: React.CSSProperties['maxHeight'], verticalInset: string) {
  if (typeof maxHeight === 'number') {
    return `calc(${maxHeight}px - ${verticalInset})`
  }

  if (typeof maxHeight === 'string' && maxHeight.length > 0) {
    return `calc(${maxHeight} - ${verticalInset})`
  }

  return undefined
}

function findEnabledIndex(options: readonly SelectOption[], startIndex: number, direction: 1 | -1) {
  if (options.length === 0) return -1

  let index = startIndex

  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length
    if (!options[index]?.disabled) {
      return index
    }
  }

  return -1
}

function getFirstEnabledIndex(options: readonly SelectOption[]) {
  return options.findIndex(option => !option.disabled)
}

function getLastEnabledIndex(options: readonly SelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) {
      return index
    }
  }

  return -1
}

export interface SelectOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface SelectProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onChange' | 'value'
> {
  value: string
  onValueChange: (value: string) => void
  options: readonly SelectOption[]
  placeholder?: string
  contentClassName?: string
  optionClassName?: string
  emptyText?: React.ReactNode
}

const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      onValueChange,
      options,
      placeholder = translate('请选择'),
      className,
      contentClassName,
      optionClassName,
      emptyText = translate('暂无可选项'),
      disabled,
      id,
      onClick,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    useI18n()

    const triggerRef = React.useRef<HTMLButtonElement | null>(null)
    const menuRef = React.useRef<HTMLDivElement | null>(null)
    const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([])
    const [open, setOpen] = React.useState(false)
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1)
    const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties | null>(null)
    const reactId = React.useId()
    const triggerId = id ?? `select-trigger-${reactId}`
    const listboxId = `${triggerId}-listbox`
    const selectedIndex = options.findIndex(option => option.value === value)
    const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined
    const hasValue = selectedOption !== undefined
    const resolvedMenuStyle =
      menuStyle ?? {
        position: 'fixed',
        top: MENU_MARGIN,
        left: MENU_MARGIN,
        width: MENU_MIN_WIDTH,
        visibility: 'hidden',
        zIndex: 100,
      }
    const viewportMaxHeight = getViewportMaxHeight(resolvedMenuStyle.maxHeight, '0.5rem')

    const setTriggerRef = React.useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node

        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref]
    )

    const updateMenuPosition = React.useCallback(() => {
      const triggerElement = triggerRef.current
      const menuElement = menuRef.current

      if (!triggerElement || !menuElement) return

      setMenuStyle(getMenuStyle(triggerElement, menuElement))
    }, [])

    const closeMenu = React.useCallback((restoreFocus = false) => {
      setOpen(false)
      setHighlightedIndex(-1)

      if (restoreFocus) {
        requestAnimationFrame(() => {
          triggerRef.current?.focus()
        })
      }
    }, [])

    const openMenu = React.useCallback(
      (preferredIndex?: number) => {
        if (disabled) return

        const firstEnabledIndex = getFirstEnabledIndex(options)
        if (firstEnabledIndex < 0) return

        let nextIndex = preferredIndex ?? selectedIndex
        if (nextIndex == null || nextIndex < 0 || options[nextIndex]?.disabled) {
          nextIndex = firstEnabledIndex
        }

        setHighlightedIndex(nextIndex)
        setOpen(true)
      },
      [disabled, options, selectedIndex]
    )

    React.useLayoutEffect(() => {
      if (!open) {
        setMenuStyle(null)
        return
      }

      updateMenuPosition()

      const handleViewportChange = () => {
        updateMenuPosition()
      }

      window.addEventListener('resize', handleViewportChange)
      window.addEventListener('scroll', handleViewportChange, true)

      return () => {
        window.removeEventListener('resize', handleViewportChange)
        window.removeEventListener('scroll', handleViewportChange, true)
      }
    }, [open, updateMenuPosition])

    React.useEffect(() => {
      if (!open) return

      const handlePointerDown = (event: PointerEvent) => {
        const target = event.target as Node
        const clickedTrigger = triggerRef.current?.contains(target) ?? false
        const clickedMenu = menuRef.current?.contains(target) ?? false

        if (!clickedTrigger && !clickedMenu) {
          closeMenu()
        }
      }

      const handleWindowBlur = () => {
        closeMenu()
      }

      document.addEventListener('pointerdown', handlePointerDown)
      window.addEventListener('blur', handleWindowBlur)

      return () => {
        document.removeEventListener('pointerdown', handlePointerDown)
        window.removeEventListener('blur', handleWindowBlur)
      }
    }, [closeMenu, open])

    React.useEffect(() => {
      if (!open || highlightedIndex < 0) return

      const target = optionRefs.current[highlightedIndex]
      if (!target) return

      requestAnimationFrame(() => {
        target.focus()
        target.scrollIntoView({ block: 'nearest' })
      })
    }, [highlightedIndex, open])

    const commitValue = React.useCallback(
      (nextValue: string) => {
        if (nextValue !== value) {
          onValueChange(nextValue)
        }
        closeMenu(true)
      },
      [closeMenu, onValueChange, value]
    )

    const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(event)
      if (event.defaultPrevented || disabled) return

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (open) {
            const nextIndex = findEnabledIndex(options, highlightedIndex, 1)
            if (nextIndex >= 0) setHighlightedIndex(nextIndex)
          } else {
            openMenu(selectedIndex >= 0 ? selectedIndex : getFirstEnabledIndex(options))
          }
          break
        case 'ArrowUp':
          event.preventDefault()
          if (open) {
            const nextIndex = findEnabledIndex(options, highlightedIndex, -1)
            if (nextIndex >= 0) setHighlightedIndex(nextIndex)
          } else {
            openMenu(selectedIndex >= 0 ? selectedIndex : getLastEnabledIndex(options))
          }
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          if (open) {
            if (highlightedIndex >= 0 && !options[highlightedIndex]?.disabled) {
              commitValue(options[highlightedIndex].value)
            }
          } else {
            openMenu()
          }
          break
        case 'Home':
          if (open) {
            event.preventDefault()
            setHighlightedIndex(getFirstEnabledIndex(options))
          }
          break
        case 'End':
          if (open) {
            event.preventDefault()
            setHighlightedIndex(getLastEnabledIndex(options))
          }
          break
        case 'Escape':
          if (open) {
            event.preventDefault()
            closeMenu()
          }
          break
      }
    }

    return (
      <>
        <button
          {...props}
          id={triggerId}
          ref={setTriggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-controls={open ? listboxId : undefined}
          aria-expanded={open}
          data-state={open ? 'open' : 'closed'}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 disabled:pointer-events-none disabled:opacity-50',
            !hasValue && 'text-muted-foreground',
            open && 'border-blue-500 ring-2 ring-blue-500/10',
            className
          )}
          onClick={event => {
            onClick?.(event)
            if (event.defaultPrevented) return

            if (open) {
              closeMenu()
            } else {
              openMenu()
            }
          }}
          onKeyDown={handleTriggerKeyDown}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </button>

        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={menuRef}
                id={listboxId}
                role="listbox"
                aria-labelledby={triggerId}
                className={cn(
                  'overflow-hidden rounded-xl border border-border bg-background/95 shadow-xl backdrop-blur-sm',
                  contentClassName
                )}
                style={{
                  ...resolvedMenuStyle,
                  ['--select-menu-viewport-max-height' as string]: viewportMaxHeight,
                }}
              >
                <div className="max-h-[var(--select-menu-viewport-max-height)] overflow-y-auto overflow-x-hidden">
                  <div className="p-1">
                    {options.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>
                    ) : (
                      <div className="space-y-1">
                        {options.map((option, index) => {
                          const selected = option.value === value
                          return (
                            <button
                              key={option.value}
                              ref={element => {
                                optionRefs.current[index] = element
                              }}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              disabled={option.disabled}
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50',
                                selected
                                  ? 'bg-accent text-accent-foreground'
                                  : 'text-foreground hover:bg-accent/70 hover:text-accent-foreground',
                                highlightedIndex === index && !selected && 'bg-accent/55',
                                optionClassName
                              )}
                              onMouseEnter={() => {
                                if (!option.disabled) {
                                  setHighlightedIndex(index)
                                }
                              }}
                              onFocus={() => {
                                if (!option.disabled) {
                                  setHighlightedIndex(index)
                                }
                              }}
                              onClick={() => {
                                if (!option.disabled) {
                                  commitValue(option.value)
                                }
                              }}
                              onKeyDown={event => {
                                switch (event.key) {
                                  case 'ArrowDown': {
                                    event.preventDefault()
                                    const nextIndex = findEnabledIndex(options, index, 1)
                                    if (nextIndex >= 0) {
                                      setHighlightedIndex(nextIndex)
                                    }
                                    break
                                  }
                                  case 'ArrowUp': {
                                    event.preventDefault()
                                    const nextIndex = findEnabledIndex(options, index, -1)
                                    if (nextIndex >= 0) {
                                      setHighlightedIndex(nextIndex)
                                    }
                                    break
                                  }
                                  case 'Home':
                                    event.preventDefault()
                                    setHighlightedIndex(getFirstEnabledIndex(options))
                                    break
                                  case 'End':
                                    event.preventDefault()
                                    setHighlightedIndex(getLastEnabledIndex(options))
                                    break
                                  case 'Escape':
                                    event.preventDefault()
                                    closeMenu(true)
                                    break
                                }
                              }}
                            >
                              <span className="min-w-0 truncate">{option.label}</span>
                              <span className="ml-3 flex h-4 w-4 items-center justify-center">
                                {selected ? <Check className="h-4 w-4 text-blue-500" /> : null}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body
            )
          : null}
      </>
    )
  }
)

Select.displayName = 'Select'

export { Select }
