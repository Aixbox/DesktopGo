import {
  AppWindow,
  Bell,
  BookOpen,
  Bookmark,
  Bot,
  Box,
  Brain,
  Briefcase,
  Bug,
  Building2,
  CalendarDays,
  Camera,
  Car,
  Check,
  CircleDollarSign,
  Clapperboard,
  ClipboardList,
  Clock,
  Cloud,
  Coffee,
  Code2,
  Cpu,
  Database,
  Download,
  Dumbbell,
  FileText,
  Film,
  FlaskConical,
  Folder as FolderIcon,
  Gamepad2,
  Gift,
  Grid2X2,
  GripVertical,
  Globe2,
  GraduationCap,
  Headphones,
  HeartPulse,
  House,
  Image,
  KeyRound,
  Laptop,
  Leaf,
  Library,
  Lightbulb,
  Mail,
  Map as MapIcon,
  MessageCircle,
  Monitor,
  Moon,
  Music2,
  Newspaper,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PawPrint,
  Phone,
  Plane,
  Plus,
  Printer,
  Radio,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  SquareTerminal,
  Star,
  Sun,
  Tag,
  Trophy,
  Truck,
  Tv,
  Users,
  Utensils,
  Wallet,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { translate } from '../../../lib/i18n'
import type { GridItem, ScrollGroupIcon, ScrollGroupMeta } from '../model'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'
import { Input } from '../../ui/input'
import type { ScrollGridSection } from './scrollableOuterGridTypes'

const GROUP_ICON_OPTIONS: Array<{
  value: ScrollGroupIcon
  label: string
  preset: string
  icon: LucideIcon
}> = [
  { value: 'briefcase', label: '工作', preset: '工作', icon: Briefcase },
  { value: 'code', label: '开发', preset: '开发', icon: Code2 },
  { value: 'gamepad', label: '游戏', preset: '游戏', icon: Gamepad2 },
  { value: 'palette', label: '设计', preset: '设计', icon: Palette },
  { value: 'book', label: '学习', preset: '学习', icon: BookOpen },
  { value: 'music', label: '影音', preset: '影音', icon: Music2 },
  { value: 'star', label: '收藏', preset: '收藏', icon: Star },
  { value: 'house', label: '生活', preset: '生活', icon: House },
  { value: 'globe', label: '网络', preset: '网络', icon: Globe2 },
  { value: 'message', label: '社交', preset: '社交', icon: MessageCircle },
  { value: 'camera', label: '照片', preset: '照片', icon: Camera },
  { value: 'video', label: '视频', preset: '视频', icon: Clapperboard },
  { value: 'shopping', label: '购物', preset: '购物', icon: ShoppingBag },
  { value: 'wallet', label: '财务', preset: '财务', icon: Wallet },
  { value: 'tools', label: '工具', preset: '工具', icon: Wrench },
  { value: 'cloud', label: '云端', preset: '云端', icon: Cloud },
  { value: 'mail', label: '邮件', preset: '邮件', icon: Mail },
  { value: 'calendar', label: '日程', preset: '日程', icon: CalendarDays },
  { value: 'health', label: '健康', preset: '健康', icon: HeartPulse },
  { value: 'travel', label: '旅行', preset: '旅行', icon: Plane },
  { value: 'food', label: '美食', preset: '美食', icon: Utensils },
  { value: 'fitness', label: '健身', preset: '健身', icon: Dumbbell },
  { value: 'archive', label: '归档', preset: '归档', icon: Package },
  { value: 'terminal', label: '终端', preset: '终端', icon: SquareTerminal },
  { value: 'database', label: '数据', preset: '数据', icon: Database },
  { value: 'security', label: '安全', preset: '安全', icon: ShieldCheck },
  { value: 'ideas', label: '灵感', preset: '灵感', icon: Lightbulb },
  { value: 'team', label: '团队', preset: '团队', icon: Users },
  { value: 'office', label: '办公', preset: '办公', icon: Building2 },
  { value: 'lab', label: '实验', preset: '实验', icon: FlaskConical },
  { value: 'projects', label: '项目', preset: '项目', icon: Rocket },
  { value: 'notifications', label: '通知', preset: '通知', icon: Bell },
  { value: 'bookmarks', label: '书签', preset: '书签', icon: Bookmark },
  { value: 'ai', label: 'AI', preset: 'AI', icon: Bot },
  { value: 'storage', label: '收纳', preset: '收纳', icon: Box },
  { value: 'thinking', label: '思考', preset: '思考', icon: Brain },
  { value: 'testing', label: '测试', preset: '测试', icon: Bug },
  { value: 'vehicles', label: '汽车', preset: '汽车', icon: Car },
  { value: 'budget', label: '收支', preset: '收支', icon: CircleDollarSign },
  { value: 'lists', label: '清单', preset: '清单', icon: ClipboardList },
  { value: 'time', label: '时间', preset: '时间', icon: Clock },
  { value: 'coffee', label: '咖啡', preset: '咖啡', icon: Coffee },
  { value: 'hardware', label: '硬件', preset: '硬件', icon: Cpu },
  { value: 'downloads', label: '下载', preset: '下载', icon: Download },
  { value: 'documents', label: '文档', preset: '文档', icon: FileText },
  { value: 'movies', label: '电影', preset: '电影', icon: Film },
  { value: 'gifts', label: '礼物', preset: '礼物', icon: Gift },
  { value: 'education', label: '教育', preset: '教育', icon: GraduationCap },
  { value: 'headphones', label: '耳机', preset: '耳机', icon: Headphones },
  { value: 'images', label: '图片', preset: '图片', icon: Image },
  { value: 'keys', label: '密钥', preset: '密钥', icon: KeyRound },
  { value: 'computers', label: '电脑', preset: '电脑', icon: Laptop },
  { value: 'resources', label: '资料', preset: '资料', icon: Library },
  { value: 'maps', label: '地图', preset: '地图', icon: MapIcon },
  { value: 'displays', label: '显示器', preset: '显示器', icon: Monitor },
  { value: 'night', label: '夜间', preset: '夜间', icon: Moon },
  { value: 'news', label: '新闻', preset: '新闻', icon: Newspaper },
  { value: 'pets', label: '宠物', preset: '宠物', icon: PawPrint },
  { value: 'phone', label: '电话', preset: '电话', icon: Phone },
  { value: 'printing', label: '打印', preset: '打印', icon: Printer },
  { value: 'radio', label: '广播', preset: '广播', icon: Radio },
  { value: 'search', label: '搜索', preset: '搜索', icon: Search },
  { value: 'settings', label: '设置', preset: '设置', icon: Settings },
  { value: 'mobile', label: '移动设备', preset: '移动设备', icon: Smartphone },
  { value: 'daytime', label: '白天', preset: '白天', icon: Sun },
  { value: 'tags', label: '标签', preset: '标签', icon: Tag },
  { value: 'achievements', label: '成就', preset: '成就', icon: Trophy },
  { value: 'logistics', label: '物流', preset: '物流', icon: Truck },
  { value: 'television', label: '电视', preset: '电视', icon: Tv },
  { value: 'productivity', label: '效率', preset: '效率', icon: Zap },
  { value: 'nature', label: '自然', preset: '自然', icon: Leaf },
  { value: 'grid', label: '其他', preset: '其他', icon: Grid2X2 },
]

const GROUP_ICON_COMPONENTS: Record<ScrollGroupIcon, LucideIcon> = Object.fromEntries(
  GROUP_ICON_OPTIONS.map(option => [option.value, option.icon])
) as Record<ScrollGroupIcon, LucideIcon>

function CustomGroupIcon({ icon }: { icon: ScrollGroupIcon }) {
  const Glyph = GROUP_ICON_COMPONENTS[icon]
  return (
    <span className="scroll-grid-custom-group-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
      <Glyph className="h-3.5 w-3.5" />
    </span>
  )
}

function GroupPreviewGlyph({ item, compact = false }: { item: GridItem; compact?: boolean }) {
  const iconClassName = compact ? 'h-2.5 w-2.5' : 'h-4 w-4'
  const imageClassName = compact ? 'h-3 w-3 object-contain' : 'h-5 w-5 object-contain'

  if (item.kind === 'folder') {
    return (
      <span className="accent-foreground flex h-full w-full items-center justify-center">
        <FolderIcon className={iconClassName} />
      </span>
    )
  }
  if (item.icon.icon_base64) {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <img
          src={item.icon.icon_base64}
          alt=""
          className={`launchpad-icon-artwork ${imageClassName}`}
          draggable={false}
        />
      </span>
    )
  }
  return (
    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
      <AppWindow className={iconClassName} />
    </span>
  )
}

function GroupPreviewIcon({ items }: { items: GridItem[] }) {
  if (items.length === 0) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-foreground/6 text-muted-foreground dark:bg-white/8">
        <AppWindow className="h-3.5 w-3.5" />
      </span>
    )
  }
  if (items.length === 1) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/6 dark:bg-white/8">
        <GroupPreviewGlyph item={items[0]} />
      </span>
    )
  }
  return (
    <span className="grid h-7 w-7 shrink-0 grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-md bg-foreground/6 p-1 dark:bg-white/8">
      {items.map(item => (
        <span key={item.kind === 'folder' ? item.id : item.key} className="overflow-hidden">
          <GroupPreviewGlyph item={item} compact />
        </span>
      ))}
    </span>
  )
}

interface SortableGroupBindings {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
  style: CSSProperties
  isDragging: boolean
}

function SortableScrollGroup({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (bindings: SortableGroupBindings) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  })
  return children({
    attributes,
    listeners,
    setNodeRef,
    style: { transform: CSS.Transform.toString(transform), transition },
    isDragging,
  })
}

interface ScrollableGroupNavigationProps {
  containerRef: MutableRefObject<HTMLDivElement | null>
  sidebarCompact: boolean
  sections: ScrollGridSection[]
  currentPage: number
  dragHoveredGroupId: string | null
  itemDragHoveredGroupId: string | null
  onToggleSidebarCompact: () => void
  onActivePageChange: (page: number) => void
  onAddGroup: (meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => void
  onEditGroup: (page: number, meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => void
  onReorderGroup: (sourcePage: number, targetPage: number) => void
  onDeleteGroup: (page: number) => void
}

export function ScrollableGroupNavigation({
  containerRef,
  sidebarCompact,
  sections,
  currentPage,
  dragHoveredGroupId,
  itemDragHoveredGroupId,
  onToggleSidebarCompact,
  onActivePageChange,
  onAddGroup,
  onEditGroup,
  onReorderGroup,
  onDeleteGroup,
}: ScrollableGroupNavigationProps) {
  const groupItemRefs = useRef(new Map<number, HTMLDivElement>())
  const groupDragDidMoveRef = useRef(false)
  const [groupComposerOpen, setGroupComposerOpen] = useState(false)
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null)
  const [selectedGroupIcon, setSelectedGroupIcon] = useState<ScrollGroupIcon>('briefcase')
  const [groupName, setGroupName] = useState(() => translate('工作'))
  const [activeDraggedGroupIndex, setActiveDraggedGroupIndex] = useState<number | null>(null)
  const groupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const groupSortIds = useMemo(() => sections.map(section => section.groupId), [sections])
  const activeDraggedSection =
    activeDraggedGroupIndex === null
      ? null
      : (sections.find(section => section.index === activeDraggedGroupIndex) ?? null)

  const selectSection = (index: number) => {
    onActivePageChange(index)
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const openGroupComposer = () => {
    setEditingGroupIndex(null)
    setSelectedGroupIcon('briefcase')
    setGroupName(translate('工作'))
    setGroupComposerOpen(true)
  }
  const openGroupEditor = (section: ScrollGridSection) => {
    setEditingGroupIndex(section.index)
    setSelectedGroupIcon(section.meta?.icon ?? 'grid')
    setGroupName(section.meta?.name ?? translate('网格 {index}', { index: section.index + 1 }))
    setGroupComposerOpen(true)
  }
  const closeGroupComposer = () => {
    setGroupComposerOpen(false)
    setEditingGroupIndex(null)
  }
  const selectGroupIcon = (option: (typeof GROUP_ICON_OPTIONS)[number]) => {
    const previousPreset = GROUP_ICON_OPTIONS.find(item => item.value === selectedGroupIcon)?.preset
    setSelectedGroupIcon(option.value)
    setGroupName(current =>
      !current.trim() || current === translate(previousPreset ?? '')
        ? translate(option.preset)
        : current
    )
  }
  const submitGroup = () => {
    const name = groupName.trim()
    if (!name) return
    const meta = { name, icon: selectedGroupIcon }
    if (editingGroupIndex === null) onAddGroup(meta)
    else onEditGroup(editingGroupIndex, meta)
    closeGroupComposer()
    setSelectedGroupIcon('briefcase')
    setGroupName(translate('工作'))
  }
  const finishGroupDrag = () => {
    setActiveDraggedGroupIndex(null)
    window.setTimeout(() => {
      groupDragDidMoveRef.current = false
    }, 0)
  }
  const handleGroupDragStart = (event: DragStartEvent) => {
    const sourceIndex = groupSortIds.indexOf(String(event.active.id))
    if (sourceIndex < 0) return
    groupDragDidMoveRef.current = true
    setActiveDraggedGroupIndex(sourceIndex)
  }
  const handleGroupDragEnd = (event: DragEndEvent) => {
    const sourceIndex = groupSortIds.indexOf(String(event.active.id))
    const targetIndex = groupSortIds.indexOf(String(event.over?.id))
    finishGroupDrag()
    if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
      onReorderGroup(sourceIndex, targetIndex)
    }
  }
  const handleGroupDragCancel = (_event: DragCancelEvent) => finishGroupDrag()

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      groupItemRefs.current.get(currentPage)?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentPage])

  useEffect(() => {
    if (!groupComposerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeGroupComposer()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [groupComposerOpen])

  return (
    <>
      <aside
        data-grid-mode-nav
        data-no-window-drag="true"
        data-scroll-group-sidebar
        className="scroll-grid-sidebar relative z-30 flex h-full min-h-0 min-w-0 flex-col border-r"
      >
        <div
          className={[
            'scroll-grid-sidebar-header flex h-12 shrink-0 items-center border-b',
            sidebarCompact ? 'justify-center px-1' : 'justify-between px-3',
          ].join(' ')}
        >
          <span
            className={
              sidebarCompact ? 'sr-only' : 'truncate text-[13px] font-semibold text-foreground/82'
            }
          >
            {translate('网格分组')}
          </span>
          <button
            type="button"
            data-grid-mode-nav
            data-no-window-drag="true"
            aria-label={translate('添加分组')}
            title={translate('添加分组')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
            onClick={event => {
              event.stopPropagation()
              openGroupComposer()
            }}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div
          className={[
            'scroll-grid-sidebar-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto py-1.5',
            sidebarCompact ? 'px-1.5' : 'px-2',
          ].join(' ')}
        >
          <DndContext
            sensors={groupSensors}
            collisionDetection={closestCenter}
            onDragStart={handleGroupDragStart}
            onDragEnd={handleGroupDragEnd}
            onDragCancel={handleGroupDragCancel}
          >
            <SortableContext items={groupSortIds} strategy={verticalListSortingStrategy}>
              <div className={sidebarCompact ? 'grid min-w-0 gap-0.5' : 'grid min-w-0 gap-1'}>
                {sections.map(section => {
                  const active = currentPage === section.index
                  const sortId = groupSortIds[section.index]
                  if (!sortId) return null
                  return (
                    <SortableScrollGroup key={sortId} id={sortId} disabled={sections.length <= 1}>
                      {sortable => (
                        <ContextMenu>
                          <ContextMenuTrigger asChild>
                            <div
                              ref={node => {
                                sortable.setNodeRef(node)
                                if (node) groupItemRefs.current.set(section.index, node)
                                else groupItemRefs.current.delete(section.index)
                              }}
                              style={sortable.style}
                              data-grid-mode-nav
                              data-scroll-group-target={section.index}
                              data-scroll-group-id={section.groupId}
                              className={[
                                'scroll-grid-group-item relative min-w-0 max-w-full overflow-hidden rounded-md',
                                sidebarCompact ? 'scroll-grid-group-item-compact' : '',
                                sortable.isDragging ? 'opacity-0' : '',
                                (dragHoveredGroupId ?? itemDragHoveredGroupId) === section.groupId
                                  ? 'scroll-grid-group-drop-target'
                                  : '',
                                active
                                  ? 'scroll-grid-group-active'
                                  : 'text-foreground/72 hover:bg-accent/85 hover:text-foreground',
                              ].join(' ')}
                            >
                              <button
                                type="button"
                                data-grid-mode-nav
                                aria-current={active ? 'page' : undefined}
                                className={[
                                  'scroll-grid-group-button relative block h-full w-full min-w-0 max-w-full touch-none overflow-hidden rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45',
                                  sections.length > 1
                                    ? 'cursor-grab active:cursor-grabbing'
                                    : 'cursor-default',
                                ].join(' ')}
                                {...sortable.attributes}
                                {...sortable.listeners}
                                onClick={event => {
                                  if (groupDragDidMoveRef.current) {
                                    event.preventDefault()
                                    return
                                  }
                                  selectSection(section.index)
                                }}
                              >
                                <span className="scroll-grid-group-icon absolute">
                                  {section.meta ? (
                                    <CustomGroupIcon icon={section.meta.icon} />
                                  ) : (
                                    <GroupPreviewIcon items={section.previewItems} />
                                  )}
                                </span>
                                <span className="scroll-grid-group-copy absolute min-w-0 overflow-hidden">
                                  <span
                                    title={
                                      section.meta?.name ??
                                      translate('网格 {index}', { index: section.index + 1 })
                                    }
                                    className="scroll-grid-group-title block w-full truncate font-medium"
                                  >
                                    {section.meta?.name ??
                                      translate('网格 {index}', { index: section.index + 1 })}
                                  </span>
                                  <span
                                    data-scroll-group-count
                                    className="scroll-grid-group-count mt-0.5 block text-[11px] leading-3.5 text-muted-foreground"
                                  >
                                    {translate('{count} 项', { count: section.itemCount })}
                                  </span>
                                </span>
                                <GripVertical
                                  aria-hidden="true"
                                  className="scroll-grid-group-grip absolute h-4 w-4 text-muted-foreground/55"
                                />
                              </button>
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-40">
                            <ContextMenuItem
                              className="rounded-md"
                              onSelect={() => openGroupEditor(section)}
                            >
                              {translate('编辑分组')}
                            </ContextMenuItem>
                            <ContextMenuItem
                              disabled={sections.length <= 1}
                              className="rounded-md text-red-700 focus:bg-red-500/12 focus:text-red-800 dark:text-red-200 dark:focus:bg-red-500/20 dark:focus:text-red-100"
                              onSelect={() => onDeleteGroup(section.index)}
                            >
                              {translate('删除分组')}
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                      )}
                    </SortableScrollGroup>
                  )
                })}
              </div>
            </SortableContext>
            {typeof document !== 'undefined'
              ? createPortal(
                  <DragOverlay
                    zIndex={250}
                    dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
                  >
                    {activeDraggedSection ? (
                      <div
                        data-grid-mode-nav
                        className={[
                          'flex h-full w-full min-w-0 cursor-grabbing items-center overflow-hidden rounded-md bg-background/96 text-foreground shadow-[0_14px_36px_rgba(15,23,42,0.24)] ring-1 ring-border/80 dark:shadow-[0_16px_42px_rgba(0,0,0,0.5)]',
                          sidebarCompact
                            ? 'flex-col justify-center gap-1 px-1 py-1.5 text-center'
                            : 'gap-2 px-2.5 py-1.5 text-left',
                        ].join(' ')}
                      >
                        {activeDraggedSection.meta ? (
                          <CustomGroupIcon icon={activeDraggedSection.meta.icon} />
                        ) : (
                          <GroupPreviewIcon items={activeDraggedSection.previewItems} />
                        )}
                        <span
                          className={
                            sidebarCompact
                              ? 'w-full min-w-0 overflow-hidden'
                              : 'min-w-0 flex-1 overflow-hidden'
                          }
                        >
                          <span
                            className={[
                              'block w-full truncate font-medium',
                              sidebarCompact ? 'text-[11px] leading-3.5' : 'text-[13px] leading-4',
                            ].join(' ')}
                          >
                            {activeDraggedSection.meta?.name ??
                              translate('网格 {index}', {
                                index: activeDraggedSection.index + 1,
                              })}
                          </span>
                          {!sidebarCompact ? (
                            <span className="mt-0.5 block text-[11px] leading-3.5 text-muted-foreground">
                              {translate('{count} 项', { count: activeDraggedSection.itemCount })}
                            </span>
                          ) : null}
                        </span>
                        {!sidebarCompact ? (
                          <GripVertical
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-muted-foreground/65"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body
                )
              : null}
          </DndContext>
        </div>

        <div
          className={[
            'scroll-grid-sidebar-footer flex h-12 shrink-0 items-center border-t',
            sidebarCompact ? 'justify-center px-1' : 'justify-end px-3',
          ].join(' ')}
        >
          <button
            type="button"
            data-grid-mode-nav
            aria-label={translate(sidebarCompact ? '展开侧栏' : '收起侧栏')}
            title={translate(sidebarCompact ? '展开侧栏' : '收起侧栏')}
            aria-pressed={sidebarCompact}
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
            onClick={onToggleSidebarCompact}
          >
            {sidebarCompact ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>

      {groupComposerOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-grid-mode-nav
              data-no-window-drag="true"
              className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/25 px-6 backdrop-blur-[2px] dark:bg-black/50"
              onMouseDown={event => {
                if (event.target === event.currentTarget) closeGroupComposer()
              }}
            >
              <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="scroll-group-editor-title"
                className="w-full max-w-[520px] rounded-xl border border-border/90 bg-background p-5 text-foreground shadow-[0_24px_70px_rgba(15,23,42,0.28)] dark:shadow-[0_28px_80px_rgba(0,0,0,0.58)]"
                onSubmit={event => {
                  event.preventDefault()
                  submitGroup()
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 id="scroll-group-editor-title" className="text-base font-semibold">
                      {translate(editingGroupIndex === null ? '创建分组' : '编辑分组')}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {translate('选择图标后会自动填入名称，也可以自行修改。')}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={translate('关闭')}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                    onClick={closeGroupComposer}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <fieldset className="mt-5">
                  <legend className="mb-2 text-xs font-medium text-foreground/80">
                    {translate('分组图标')}
                  </legend>
                  <div className="grid grid-cols-8 gap-1 sm:grid-cols-12">
                    {GROUP_ICON_OPTIONS.map(option => {
                      const Glyph = option.icon
                      const selected = option.value === selectedGroupIcon
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-label={translate(option.label)}
                          aria-pressed={selected}
                          title={translate(option.label)}
                          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 ${
                            selected
                              ? 'accent-foreground'
                              : 'text-foreground/58 hover:bg-foreground/6 hover:text-foreground dark:hover:bg-white/8'
                          }`}
                          onClick={() => selectGroupIcon(option)}
                        >
                          <Glyph
                            className="h-[18px] w-[18px]"
                            strokeWidth={selected ? 2.25 : 1.8}
                          />
                          {selected ? (
                            <span
                              aria-hidden="true"
                              className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary"
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-medium text-foreground/80">
                    {translate('分组名称')}
                  </span>
                  <Input
                    autoFocus
                    value={groupName}
                    maxLength={24}
                    placeholder={translate('填写分组名称')}
                    className="h-10 rounded-lg"
                    onChange={event => setGroupName(event.target.value)}
                  />
                </label>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-lg px-4 text-sm text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
                    onClick={closeGroupComposer}
                  >
                    {translate('取消')}
                  </button>
                  <button
                    type="submit"
                    disabled={!groupName.trim()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <Check className="h-4 w-4" />
                    {translate(editingGroupIndex === null ? '创建' : '保存')}
                  </button>
                </div>
              </form>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
