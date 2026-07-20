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
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  type SortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useReducedMotion } from 'framer-motion'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../Icon'
import { translate } from '../../../lib/i18n'
import { useIconStore } from '../../../stores/iconStore'
import {
  getIconGridTitleMetrics,
  ICON_GRID_TILE_PADDING_Y,
  ICON_GRID_TITLE_GAP,
} from '../../../types'
import type { FolderSize, GridItem, ScrollGroupIcon, ScrollGroupMeta } from '../model'
import { getGridItemSpan } from '../model'
import type { PageAnchorEntry } from '../domain/topLevelLayout'
import {
  buildScrollGroupEntries,
  moveScrollItemRelative,
  resolveScrollDropPosition,
  type ScrollDropPosition,
} from '../scroll/scrollGroupLayout'
import { FolderCreatePreview } from './FolderVisuals'
import { OuterFolderTile } from './OuterFolderTile'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../../ui/context-menu'

interface IconConfigLike {
  imgSize: number
}

const EMPTY_PAGE_ANCHOR_ENTRIES: PageAnchorEntry[] = []

interface LogicalGridHit {
  entry: PageAnchorEntry
  rect: { left: number; top: number; width: number; height: number }
}

interface GridItemPosition {
  left: number
  top: number
}

interface PointerDragSession {
  pointerId: number
  pointerType: string
  activeId: string
  sourceNode: HTMLDivElement
  sourceRect: DOMRect | null
  overlayNode: HTMLDivElement | null
  started: boolean
  startPoint: { x: number; y: number }
  latestPoint: { x: number; y: number }
  activationTime: number
  gridRect: DOMRect | null
  containerRect: DOMRect | null
  startScrollTop: number
}

const POINTER_DRAG_DISTANCE = 4
const TOUCH_DRAG_DELAY_MS = 200
const POINTER_COLLISION_INTERVAL_MS = 40
const PREVIEW_REORDER_DWELL_MS = 100
const PREVIEW_REORDER_LOCK_MS = 200
const EDGE_SCROLL_THRESHOLD_PX = 72
const EDGE_SCROLL_MAX_SPEED_PX = 12
const NOOP = () => {}

export interface ScrollGridSection {
  index: number
  groupId: string
  entries: PageAnchorEntry[]
  itemCount: number
  previewItems: GridItem[]
  meta?: ScrollGroupMeta
}

interface ScrollableOuterGridViewProps {
  containerRef: MutableRefObject<HTMLDivElement | null>
  dockEnabled: boolean
  sidebarCompact: boolean
  onToggleSidebarCompact: () => void
  gridWidth: number
  columns: number
  itemWidth: number
  itemHeight: number
  gridGap: number
  sections: ScrollGridSection[]
  activeSection: ScrollGridSection | null
  currentPage: number
  dragContext: 'outer' | 'folder' | null
  dragFolderPreviewTargetId: string | null
  folderPreviewFreezeTargetId: string | null
  folderCreateTransitionTargetId: string | null
  hiddenOuterItemIds: string[]
  highlightedOuterItemIds: string[]
  iconConfig: IconConfigLike
  selectionMode: boolean
  selectedSet: Set<string>
  openFolderId: string | null
  activeFolderSharedLayoutId: string | null
  onActivePageChange: (page: number) => void
  onAddGroup: (meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => void
  onEditGroup: (page: number, meta: Pick<ScrollGroupMeta, 'name' | 'icon'>) => void
  onReorderGroup: (sourcePage: number, targetPage: number) => void
  onCommitItemOrder: (groupId: string, itemIds: string[]) => void
  onMoveItemToGroup: (itemId: string, targetGroupId: string) => void
  onMoveItemToDock: (itemId: string, targetIndex: number) => void
  onMergeItems: (sourceId: string, targetId: string) => void
  addIconDisabled: boolean
  onAddIcon?: () => void
  onDeleteGroup: (page: number) => void
  onToggleSelectIcon: (key: string) => void
  onTileClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void
  onOpenFolder: (folderId: string) => void
  onLaunchIcon: (path: string) => void
  onResizeFolder: (folderId: string, size: FolderSize) => void
  bindTileRef: (id: string, node: HTMLDivElement | null) => void
  bindGridPageRef: (page: number, node: HTMLDivElement | null) => void
  reorderAnimationMs: number
}

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

const noSortableTransform: SortingStrategy = () => null

function CustomGroupIcon({ icon, compact = false }: { icon: ScrollGroupIcon; compact?: boolean }) {
  const Glyph = GROUP_ICON_COMPONENTS[icon]
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-blue-700 dark:bg-blue-400/12 dark:text-blue-200 ${
        compact ? 'h-7 w-7' : 'h-8 w-8'
      }`}
    >
      <Glyph className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </span>
  )
}

function GroupPreviewGlyph({ item, compact = false }: { item: GridItem; compact?: boolean }) {
  const iconClassName = compact ? 'h-2.5 w-2.5' : 'h-4 w-4'
  const imageClassName = compact ? 'h-3 w-3 object-contain' : 'h-5 w-5 object-contain'

  if (item.kind === 'folder') {
    return (
      <span className="flex h-full w-full items-center justify-center text-blue-600 dark:text-blue-200">
        <FolderIcon className={iconClassName} />
      </span>
    )
  }

  if (item.icon.icon_base64) {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <img src={item.icon.icon_base64} alt="" className={imageClassName} draggable={false} />
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

type SortableGroupBindings = {
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
    style: {
      transform: CSS.Transform.toString(transform),
      transition,
    },
    isDragging,
  })
}

type SortableGridItemBindings = {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
  isDragging: boolean
}

function SortableGridItem({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (bindings: SortableGridItemBindings) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id,
    disabled,
    animateLayoutChanges: () => false,
  })
  return children({
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  })
}

export function ScrollableOuterGridView({
  containerRef,
  dockEnabled,
  sidebarCompact,
  onToggleSidebarCompact,
  gridWidth,
  columns,
  itemWidth,
  itemHeight,
  gridGap,
  sections,
  activeSection,
  currentPage,
  dragContext,
  dragFolderPreviewTargetId,
  folderPreviewFreezeTargetId,
  folderCreateTransitionTargetId,
  hiddenOuterItemIds,
  highlightedOuterItemIds,
  iconConfig,
  selectionMode,
  selectedSet,
  openFolderId,
  activeFolderSharedLayoutId,
  onActivePageChange,
  onAddGroup,
  onEditGroup,
  onReorderGroup,
  onCommitItemOrder,
  onMoveItemToGroup,
  onMoveItemToDock,
  onMergeItems,
  addIconDisabled,
  onAddIcon,
  onDeleteGroup,
  onToggleSelectIcon,
  onTileClickCapture,
  onOpenFolder,
  onLaunchIcon,
  onResizeFolder,
  bindTileRef,
  bindGridPageRef,
  reorderAnimationMs,
}: ScrollableOuterGridViewProps) {
  const groupItemRefs = useRef(new Map<number, HTMLDivElement>())
  const highlightedOuterItemIdSet = useMemo(
    () => new Set(highlightedOuterItemIds),
    [highlightedOuterItemIds]
  )
  const titleLineCount = useIconStore(state => state.titleLineCount)
  const addIconTitleMetrics = getIconGridTitleMetrics(titleLineCount)
  const addIconLabel = translate('\u6dfb\u52a0\u56fe\u6807')
  const [groupComposerOpen, setGroupComposerOpen] = useState(false)
  const [editingGroupIndex, setEditingGroupIndex] = useState<number | null>(null)
  const [selectedGroupIcon, setSelectedGroupIcon] = useState<ScrollGroupIcon>('briefcase')
  const [groupName, setGroupName] = useState(() => translate('工作'))
  const [activeDraggedGroupIndex, setActiveDraggedGroupIndex] = useState<number | null>(null)
  const groupDragDidMoveRef = useRef(false)
  const itemDragDidMoveRef = useRef(false)
  const mergeHoverRef = useRef<{ targetId: string } | null>(null)
  const mergeTimerRef = useRef<number | null>(null)
  const layoutSettleTimerRef = useRef<number | null>(null)
  const previewOrderRef = useRef<string[] | null>(null)
  const lastOverIdRef = useRef<string | null>(null)
  const lastDropPositionRef = useRef<ScrollDropPosition | null>(null)
  const previewShiftLockUntilRef = useRef(0)
  const previewShiftTimerRef = useRef<number | null>(null)
  const pendingPreviewShiftRef = useRef<{
    activeId: string
    overId: string
    position: Exclude<ScrollDropPosition, 'middle'>
  } | null>(null)
  const lastGridHitPointRef = useRef<{ x: number; y: number } | null>(null)
  const lastGridHitIdRef = useRef<string | null>(null)
  const gridElementRef = useRef<HTMLDivElement | null>(null)
  const gridItemRefs = useRef(new Map<string, HTMLDivElement>())
  const pendingGridFlipRef = useRef<Map<string, GridItemPosition> | null>(null)
  const gridFlipAnimationsRef = useRef(new Map<string, Animation>())
  const pointerDragSessionRef = useRef<PointerDragSession | null>(null)
  const pointerOverlayFrameRef = useRef<number | null>(null)
  const pointerCollisionTimerRef = useRef<number | null>(null)
  const pointerLastCollisionAtRef = useRef(0)
  const edgeScrollFrameRef = useRef<number | null>(null)
  const edgeScrollSpeedRef = useRef(0)
  const cancelPointerDragRef = useRef<() => void>(NOOP)
  const [hoveredGroupId, setHoveredGroupId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [activeDraggedItemId, setActiveDraggedItemId] = useState<string | null>(null)
  const [keyboardDraggedItemId, setKeyboardDraggedItemId] = useState<string | null>(null)
  const [previewItemIds, setPreviewItemIds] = useState<string[] | null>(null)
  const [layoutMotionActive, setLayoutMotionActive] = useState(false)
  const reducedMotion = useReducedMotion()
  const groupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const itemSensors = useSensors(
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const groupSortIds = useMemo(() => sections.map(section => section.groupId), [sections])
  const committedEntries = useMemo(
    () => activeSection?.entries ?? EMPTY_PAGE_ANCHOR_ENTRIES,
    [activeSection?.entries]
  )
  const activeItemById = useMemo(
    () => new Map(committedEntries.map(entry => [entry.id, entry.item])),
    [committedEntries]
  )
  const committedItemIds = activeSection?.meta?.itemIds ?? committedEntries.map(entry => entry.id)
  const layoutColumns = committedEntries.reduce(
    (maximum, entry) => Math.max(maximum, entry.span.cols),
    Math.max(1, columns)
  )
  const entries = useMemo(() => {
    if (!previewItemIds) return committedEntries
    const previewEntries = buildScrollGroupEntries(previewItemIds, activeItemById, layoutColumns)
    const activePlaceholder = activeDraggedItemId
      ? previewEntries.filter(entry => entry.id === activeDraggedItemId)
      : []
    return activePlaceholder.length > 0
      ? buildScrollGroupEntries(previewItemIds, activeItemById, layoutColumns, activePlaceholder)
      : previewEntries
  }, [activeDraggedItemId, activeItemById, committedEntries, layoutColumns, previewItemIds])
  const entriesRef = useRef(entries)
  useLayoutEffect(() => {
    entriesRef.current = entries
  }, [entries])
  const keyboardDraggedItem = keyboardDraggedItemId
    ? (activeItemById.get(keyboardDraggedItemId) ?? null)
    : null
  const keyboardDraggedSpan = keyboardDraggedItem ? getGridItemSpan(keyboardDraggedItem) : null
  const hasAddIconSlot = activeSection !== null
  const addIconVisible = hasAddIconSlot && !layoutMotionActive
  const addIconSlotIndex = entries.reduce((lastIndex, entry) => {
    const footprintEnd =
      (entry.row + entry.span.rows - 1) * layoutColumns + entry.col + entry.span.cols
    return Math.max(lastIndex, footprintEnd)
  }, 0)
  const addIconRow = Math.floor(addIconSlotIndex / layoutColumns)
  const addIconCol = addIconSlotIndex % layoutColumns
  const committedGridRows = committedEntries.reduce(
    (maxRow, entry) => Math.max(maxRow, entry.row + entry.span.rows),
    1
  )
  const gridRows = Math.max(
    1,
    layoutMotionActive ? committedGridRows : 1,
    entries.reduce((maxRow, entry) => Math.max(maxRow, entry.row + entry.span.rows), 1),
    hasAddIconSlot ? addIconRow + 1 : 1
  )
  const gridHeight = gridRows * itemHeight + Math.max(0, gridRows - 1) * gridGap

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
    if (editingGroupIndex === null) {
      onAddGroup(meta)
    } else {
      onEditGroup(editingGroupIndex, meta)
    }
    closeGroupComposer()
    setSelectedGroupIcon('briefcase')
    setGroupName(translate('工作'))
  }

  const handleDeleteGroup = (sectionIndex: number) => {
    onDeleteGroup(sectionIndex)
  }

  const handleGroupDragStart = (event: DragStartEvent) => {
    const sourceIndex = groupSortIds.indexOf(String(event.active.id))
    if (sourceIndex < 0) return
    groupDragDidMoveRef.current = true
    setActiveDraggedGroupIndex(sourceIndex)
  }

  const finishGroupDrag = () => {
    setActiveDraggedGroupIndex(null)
    window.setTimeout(() => {
      groupDragDidMoveRef.current = false
    }, 0)
  }

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const sourceIndex = groupSortIds.indexOf(String(event.active.id))
    const targetIndex = groupSortIds.indexOf(String(event.over?.id))
    finishGroupDrag()
    if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
      onReorderGroup(sourceIndex, targetIndex)
    }
  }

  const handleGroupDragCancel = (_event: DragCancelEvent) => {
    finishGroupDrag()
  }

  // Resolve sortable targets from the logical grid instead of the rendered DOM. During a
  // FLIP animation the DOM element under a stationary pointer can change while its item is
  // moving out of the way, which otherwise causes an unintended A/B reorder loop. The small
  // point cache mirrors iTab's 10px nearest-target hysteresis.
  const resolveGridEntryAtPoint = (
    point: { x: number; y: number },
    dragRect: { left: number; top: number; width: number; height: number } | null,
    activeId: string,
    cachedGridRect?: { left: number; top: number }
  ): LogicalGridHit | null => {
    const grid = gridElementRef.current
    if (!grid) return null

    const rect = cachedGridRect ?? grid.getBoundingClientRect()
    const currentEntries = entriesRef.current
    const strideX = itemWidth + gridGap
    const strideY = itemHeight + gridGap

    const getEntryRect = (entry: PageAnchorEntry) => ({
      left: rect.left + entry.col * strideX,
      top: rect.top + entry.row * strideY,
      width: entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap,
      height: entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap,
    })
    const overlapRate = (
      first: { left: number; top: number; width: number; height: number },
      second: { left: number; top: number; width: number; height: number }
    ) => {
      const overlapWidth = Math.max(
        0,
        Math.min(first.left + first.width, second.left + second.width) -
          Math.max(first.left, second.left)
      )
      const overlapHeight = Math.max(
        0,
        Math.min(first.top + first.height, second.top + second.height) -
          Math.max(first.top, second.top)
      )
      const overlapArea = overlapWidth * overlapHeight
      if (overlapArea <= 0) return 0
      return Math.max(
        overlapArea / Math.max(1, first.width * first.height),
        overlapArea / Math.max(1, second.width * second.height)
      )
    }
    const cachedPoint = lastGridHitPointRef.current
    const cachedId = lastGridHitIdRef.current
    if (cachedPoint && cachedId) {
      const movedX = point.x - cachedPoint.x
      const movedY = point.y - cachedPoint.y
      if (movedX * movedX + movedY * movedY < 10 * 10) {
        const cachedEntry = currentEntries.find(entry => entry.id === cachedId)
        if (cachedEntry) return { entry: cachedEntry, rect: getEntryRect(cachedEntry) }
      }
    }

    const localX = point.x - rect.left
    const localY = point.y - rect.top
    if (localX < 0 || localY < 0) return null

    const col = Math.floor(localX / strideX)
    const row = Math.floor(localY / strideY)
    const withinX = localX % strideX
    const withinY = localY % strideY
    if (col < 0 || col >= layoutColumns) return null
    const pointInsideCell = withinX <= itemWidth && withinY <= itemHeight

    const cellEntry = pointInsideCell
      ? currentEntries.find(
          item =>
            row >= item.row &&
            row < item.row + item.span.rows &&
            col >= item.col &&
            col < item.col + item.span.cols
        )
      : null
    // The placeholder owns its entire logical footprint. Do not let overlap with a
    // neighboring item steal the target while the pointer is still inside the active
    // footprint; that is what makes large/tall items visibly reverse mid-flight.
    if (cellEntry?.id === activeId) {
      lastGridHitPointRef.current = point
      lastGridHitIdRef.current = activeId
      return { entry: cellEntry, rect: getEntryRect(cellEntry) }
    }
    // Between two mixed-size footprints there may be no logical cell under the pointer,
    // while the dragged rectangle still overlaps both neighbors. Keep the current target
    // as long as it still has iTab's 10% overlap; only then may a new neighbor win.
    const stickyId = lastGridHitIdRef.current
    if (!cellEntry && dragRect && stickyId && stickyId !== activeId) {
      const stickyEntry = currentEntries.find(entry => entry.id === stickyId)
      if (stickyEntry && overlapRate(dragRect, getEntryRect(stickyEntry)) > 0.1) {
        lastGridHitPointRef.current = point
        return { entry: stickyEntry, rect: getEntryRect(stickyEntry) }
      }
    }

    let resolvedEntry: PageAnchorEntry | null = null
    if (dragRect) {
      const dragCenterX = dragRect.left + dragRect.width / 2
      const dragCenterY = dragRect.top + dragRect.height / 2
      const nearest = currentEntries
        .filter(entry => entry.id !== activeId)
        .reduce<{ entry: PageAnchorEntry; distance: number } | null>((best, entry) => {
          const entryRect = getEntryRect(entry)
          const entryCenterX = entryRect.left + entryRect.width / 2
          const entryCenterY = entryRect.top + entryRect.height / 2
          const distance = Math.hypot(dragCenterX - entryCenterX, dragCenterY - entryCenterY)
          return best === null || distance < best.distance ? { entry, distance } : best
        }, null)
      if (nearest && overlapRate(dragRect, getEntryRect(nearest.entry)) > 0.1) {
        resolvedEntry = nearest.entry
      }
    }

    if (!resolvedEntry && cellEntry) {
      if (
        cellEntry.id === activeId ||
        !dragRect ||
        overlapRate(dragRect, getEntryRect(cellEntry)) > 0.1
      ) {
        resolvedEntry = cellEntry
      }
    }
    if (!resolvedEntry) return null

    lastGridHitPointRef.current = point
    lastGridHitIdRef.current = resolvedEntry.id
    return { entry: resolvedEntry, rect: getEntryRect(resolvedEntry) }
  }

  const clearMergeIntent = () => {
    if (mergeTimerRef.current !== null) {
      window.clearTimeout(mergeTimerRef.current)
      mergeTimerRef.current = null
    }
    mergeHoverRef.current = null
    setMergeTargetId(null)
  }

  const scheduleMergeIntent = (targetId: string) => {
    if (mergeHoverRef.current?.targetId === targetId) return
    clearMergeIntent()
    mergeHoverRef.current = { targetId }
    mergeTimerRef.current = window.setTimeout(() => {
      if (mergeHoverRef.current?.targetId === targetId) {
        setMergeTargetId(targetId)
      }
      mergeTimerRef.current = null
    }, 520)
  }

  const clearPreviewShiftTimer = () => {
    if (previewShiftTimerRef.current !== null) {
      window.clearTimeout(previewShiftTimerRef.current)
      previewShiftTimerRef.current = null
    }
    pendingPreviewShiftRef.current = null
  }

  const captureGridItemPositions = () => {
    const previousPositions = new Map<string, GridItemPosition>()
    gridItemRefs.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect()
      previousPositions.set(id, { left: rect.left, top: rect.top })
    })
    gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
    gridFlipAnimationsRef.current.clear()
    pendingGridFlipRef.current = previousPositions
  }

  const commitPreviewOrder = (
    activeId: string,
    overId: string,
    position: Exclude<ScrollDropPosition, 'middle'>,
    lockDuration = PREVIEW_REORDER_LOCK_MS
  ) => {
    if (
      activeId === overId ||
      (lastOverIdRef.current === overId && lastDropPositionRef.current === position)
    ) {
      return
    }
    if (lockDuration > 0 && performance.now() < previewShiftLockUntilRef.current) return
    const currentOrder = previewOrderRef.current
    if (!currentOrder) return
    const nextOrder = moveScrollItemRelative(currentOrder, activeId, overId, position)
    lastOverIdRef.current = overId
    lastDropPositionRef.current = position
    if (nextOrder === currentOrder) return

    captureGridItemPositions()
    previewOrderRef.current = nextOrder
    previewShiftLockUntilRef.current = performance.now() + lockDuration
    setPreviewItemIds(nextOrder)
  }

  const schedulePreviewOrder = (
    activeId: string,
    overId: string,
    position: Exclude<ScrollDropPosition, 'middle'>
  ) => {
    if (
      activeId === overId ||
      (lastOverIdRef.current === overId && lastDropPositionRef.current === position)
    ) {
      clearPreviewShiftTimer()
      return
    }
    const pending = pendingPreviewShiftRef.current
    if (
      pending?.activeId === activeId &&
      pending.overId === overId &&
      pending.position === position
    ) {
      return
    }

    clearPreviewShiftTimer()
    pendingPreviewShiftRef.current = { activeId, overId, position }
    previewShiftTimerRef.current = window.setTimeout(() => {
      const queued = pendingPreviewShiftRef.current
      previewShiftTimerRef.current = null
      pendingPreviewShiftRef.current = null
      if (queued) commitPreviewOrder(queued.activeId, queued.overId, queued.position)
    }, PREVIEW_REORDER_DWELL_MS)
  }

  useLayoutEffect(() => {
    const previousPositions = pendingGridFlipRef.current
    pendingGridFlipRef.current = null
    if (!previousPositions || reducedMotion) return

    const movedItems: Array<{
      id: string
      node: HTMLDivElement
      deltaX: number
      deltaY: number
    }> = []
    previousPositions.forEach((previous, id) => {
      if (id === activeDraggedItemId) return
      const node = gridItemRefs.current.get(id)
      if (!node) return
      const next = node.getBoundingClientRect()
      const deltaX = previous.left - next.left
      const deltaY = previous.top - next.top
      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return
      movedItems.push({ id, node, deltaX, deltaY })
    })

    movedItems.forEach(({ id, node, deltaX, deltaY }) => {
      const animation = node.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: reorderAnimationMs,
          easing: 'ease',
        }
      )
      const clearAnimation = () => {
        if (gridFlipAnimationsRef.current.get(id) === animation) {
          gridFlipAnimationsRef.current.delete(id)
        }
      }
      animation.onfinish = clearAnimation
      animation.oncancel = clearAnimation
      gridFlipAnimationsRef.current.set(id, animation)
    })
  }, [activeDraggedItemId, entries, reducedMotion, reorderAnimationMs])

  const startItemDrag = (activeId: string) => {
    const initialOrder = committedItemIds.filter(id => activeItemById.has(id))
    itemDragDidMoveRef.current = true
    if (layoutSettleTimerRef.current !== null) {
      window.clearTimeout(layoutSettleTimerRef.current)
      layoutSettleTimerRef.current = null
    }
    previewOrderRef.current = initialOrder
    lastOverIdRef.current = activeId
    lastDropPositionRef.current = null
    previewShiftLockUntilRef.current = 0
    lastGridHitPointRef.current = null
    lastGridHitIdRef.current = null
    setActiveDraggedItemId(activeId)
    setPreviewItemIds(initialOrder)
    setLayoutMotionActive(true)
    clearMergeIntent()
  }

  const finishItemDrag = () => {
    clearPreviewShiftTimer()
    setHoveredGroupId(null)
    clearMergeIntent()
    previewOrderRef.current = null
    lastOverIdRef.current = null
    lastDropPositionRef.current = null
    previewShiftLockUntilRef.current = 0
    lastGridHitPointRef.current = null
    lastGridHitIdRef.current = null
    setPreviewItemIds(null)
    setActiveDraggedItemId(null)
    layoutSettleTimerRef.current = window.setTimeout(() => {
      setLayoutMotionActive(false)
      layoutSettleTimerRef.current = null
    }, 280)
    window.setTimeout(() => {
      itemDragDidMoveRef.current = false
    }, 0)
  }

  const getPointerDragRect = (session: PointerDragSession) => {
    const sourceRect = session.sourceRect
    if (!sourceRect) return null
    const deltaX = session.latestPoint.x - session.startPoint.x
    const deltaY = session.latestPoint.y - session.startPoint.y
    return {
      left: sourceRect.left + deltaX,
      top: sourceRect.top + deltaY,
      width: sourceRect.width,
      height: sourceRect.height,
    }
  }

  const getPointerGridRect = (session: PointerDragSession) => {
    const gridRect = session.gridRect
    if (!gridRect) return undefined
    const scrollDelta =
      (containerRef.current?.scrollTop ?? session.startScrollTop) - session.startScrollTop
    return { left: gridRect.left, top: gridRect.top - scrollDelta }
  }

  const getPointerGridHitPoint = (
    session: PointerDragSession,
    dragRect: { left: number; top: number; width: number; height: number } | null
  ) => {
    const activeItem = activeItemById.get(session.activeId)
    const activeSpan = activeItem ? getGridItemSpan(activeItem) : null
    if (dragRect && activeSpan?.cols === 1 && activeSpan.rows === 1) {
      return {
        x: dragRect.left + dragRect.width / 2,
        y: dragRect.top + dragRect.height / 2,
      }
    }
    return session.latestPoint
  }

  const resetDragTargetTracking = () => {
    clearPreviewShiftTimer()
    lastOverIdRef.current = null
    lastDropPositionRef.current = null
    lastGridHitPointRef.current = null
    lastGridHitIdRef.current = null
    clearMergeIntent()
  }

  const getVisibleGridHitRect = (hit: LogicalGridHit) => {
    const node = gridItemRefs.current.get(hit.entry.id)
    if (!node) return hit.rect
    const rect = node.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }

  const processPointerDragMove = (session: PointerDragSession) => {
    const { activeId, latestPoint: point } = session
    const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null
    const groupId = target?.closest<HTMLElement>('[data-scroll-group-id]')?.dataset.scrollGroupId
    setHoveredGroupId(current => (current === (groupId ?? null) ? current : (groupId ?? null)))
    if (groupId || target?.closest('[data-dock-slot]')) {
      resetDragTargetTracking()
      return
    }

    const dragRect = getPointerDragRect(session)
    const gridHitPoint = getPointerGridHitPoint(session, dragRect)
    const logicalHit = resolveGridEntryAtPoint(
      gridHitPoint,
      dragRect,
      activeId,
      getPointerGridRect(session)
    )
    const overId = logicalHit?.entry.id ?? null
    if (!logicalHit || !overId || overId === activeId) {
      clearPreviewShiftTimer()
      clearMergeIntent()
      return
    }

    const sourceItem = activeItemById.get(activeId)
    const targetItem = activeItemById.get(overId)
    const overRect = getVisibleGridHitRect(logicalHit)
    const mergePoint = dragRect
      ? { x: dragRect.left + dragRect.width / 2, y: dragRect.top + dragRect.height / 2 }
      : point
    const mergeAllowed =
      sourceItem?.kind === 'icon' &&
      Boolean(targetItem && (targetItem.kind === 'icon' || targetItem.kind === 'folder'))
    const dropPosition = resolveScrollDropPosition(mergePoint, overRect, mergeAllowed)
    if (dropPosition === 'middle') {
      clearPreviewShiftTimer()
      scheduleMergeIntent(overId)
    } else {
      clearMergeIntent()
      schedulePreviewOrder(activeId, overId, dropPosition)
    }
  }

  const queuePointerCollision = () => {
    const session = pointerDragSessionRef.current
    if (!session?.started || pointerCollisionTimerRef.current !== null) return
    const elapsed = performance.now() - pointerLastCollisionAtRef.current
    const delay = Math.max(0, POINTER_COLLISION_INTERVAL_MS - elapsed)
    pointerCollisionTimerRef.current = window.setTimeout(() => {
      pointerCollisionTimerRef.current = null
      pointerLastCollisionAtRef.current = performance.now()
      const currentSession = pointerDragSessionRef.current
      if (currentSession?.started) processPointerDragMove(currentSession)
    }, delay)
  }

  const schedulePointerOverlayUpdate = () => {
    if (pointerOverlayFrameRef.current !== null) return
    pointerOverlayFrameRef.current = window.requestAnimationFrame(() => {
      pointerOverlayFrameRef.current = null
      const session = pointerDragSessionRef.current
      if (!session?.started || !session.overlayNode) return
      const deltaX = session.latestPoint.x - session.startPoint.x
      const deltaY = session.latestPoint.y - session.startPoint.y
      session.overlayNode.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`
    })
  }

  const stopEdgeScroll = () => {
    edgeScrollSpeedRef.current = 0
    if (edgeScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(edgeScrollFrameRef.current)
      edgeScrollFrameRef.current = null
    }
  }

  const ensureEdgeScrollFrame = () => {
    if (edgeScrollFrameRef.current !== null || edgeScrollSpeedRef.current === 0) return
    const step = () => {
      edgeScrollFrameRef.current = null
      const session = pointerDragSessionRef.current
      const container = containerRef.current
      const speed = edgeScrollSpeedRef.current
      if (!session?.started || !container || speed === 0) return
      const previousScrollTop = container.scrollTop
      container.scrollTop += speed
      if (container.scrollTop !== previousScrollTop) queuePointerCollision()
      if (
        container.scrollTop === previousScrollTop ||
        (speed < 0 && container.scrollTop <= 0) ||
        (speed > 0 && container.scrollTop + container.clientHeight >= container.scrollHeight)
      ) {
        stopEdgeScroll()
        return
      }
      edgeScrollFrameRef.current = window.requestAnimationFrame(step)
    }
    edgeScrollFrameRef.current = window.requestAnimationFrame(step)
  }

  const updateEdgeScroll = (session: PointerDragSession) => {
    const container = containerRef.current
    const rect = session.containerRect
    if (!container || !rect || container.scrollHeight <= container.clientHeight) {
      stopEdgeScroll()
      return
    }
    const { y } = session.latestPoint
    let speed = 0
    if (y < rect.top + EDGE_SCROLL_THRESHOLD_PX) {
      const ratio = Math.min(
        1,
        (rect.top + EDGE_SCROLL_THRESHOLD_PX - y) / EDGE_SCROLL_THRESHOLD_PX
      )
      speed = -Math.max(1, Math.round(EDGE_SCROLL_MAX_SPEED_PX * ratio))
    } else if (y > rect.bottom - EDGE_SCROLL_THRESHOLD_PX) {
      const ratio = Math.min(
        1,
        (y - (rect.bottom - EDGE_SCROLL_THRESHOLD_PX)) / EDGE_SCROLL_THRESHOLD_PX
      )
      speed = Math.max(1, Math.round(EDGE_SCROLL_MAX_SPEED_PX * ratio))
    }
    edgeScrollSpeedRef.current = speed
    if (speed === 0) stopEdgeScroll()
    else ensureEdgeScrollFrame()
  }

  const activatePointerDrag = (session: PointerDragSession) => {
    const sourceRect = session.sourceNode.getBoundingClientRect()
    const gridRect = gridElementRef.current?.getBoundingClientRect() ?? null
    const containerRect = containerRef.current?.getBoundingClientRect() ?? null
    const overlayNode = session.sourceNode.cloneNode(true) as HTMLDivElement
    overlayNode.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'))
    overlayNode.setAttribute('aria-hidden', 'true')
    overlayNode.setAttribute('data-scroll-dragging', 'true')
    overlayNode.classList.add('cursor-grabbing')
    Object.assign(overlayNode.style, {
      position: 'fixed',
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      margin: '0',
      opacity: '1',
      pointerEvents: 'none',
      transform: 'translate3d(0, 0, 0)',
      transition: 'none',
      willChange: 'transform',
      zIndex: '240',
    })
    document.body.appendChild(overlayNode)
    session.sourceRect = sourceRect
    session.gridRect = gridRect
    session.containerRect = containerRect
    session.startScrollTop = containerRef.current?.scrollTop ?? 0
    session.overlayNode = overlayNode
    session.started = true
    session.sourceNode.style.opacity = '0'
    pointerLastCollisionAtRef.current = 0
    startItemDrag(session.activeId)
    schedulePointerOverlayUpdate()
    queuePointerCollision()
  }

  const cleanupPointerDrag = () => {
    const session = pointerDragSessionRef.current
    pointerDragSessionRef.current = null
    if (pointerOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerOverlayFrameRef.current)
      pointerOverlayFrameRef.current = null
    }
    if (pointerCollisionTimerRef.current !== null) {
      window.clearTimeout(pointerCollisionTimerRef.current)
      pointerCollisionTimerRef.current = null
    }
    stopEdgeScroll()
    session?.overlayNode?.remove()
    if (session?.sourceNode) session.sourceNode.style.opacity = ''
    const grid = gridElementRef.current
    if (session && grid?.hasPointerCapture(session.pointerId)) {
      grid.releasePointerCapture(session.pointerId)
    }
  }

  const completePointerDrag = (session: PointerDragSession) => {
    const { activeId, latestPoint: point } = session
    const dragRect = getPointerDragRect(session)
    const gridHitPoint = getPointerGridHitPoint(session, dragRect)
    const logicalDrop = resolveGridEntryAtPoint(
      gridHitPoint,
      dragRect,
      activeId,
      getPointerGridRect(session)
    )
    const logicalDropItem = logicalDrop ? activeItemById.get(logicalDrop.entry.id) : null
    const mergePoint = dragRect
      ? { x: dragRect.left + dragRect.width / 2, y: dragRect.top + dragRect.height / 2 }
      : point
    const logicalDropMergeAllowed =
      logicalDrop !== null &&
      activeItemById.get(activeId)?.kind === 'icon' &&
      Boolean(
        logicalDropItem && (logicalDropItem.kind === 'icon' || logicalDropItem.kind === 'folder')
      )
    const logicalDropPosition = logicalDrop
      ? resolveScrollDropPosition(
          mergePoint,
          getVisibleGridHitRect(logicalDrop),
          logicalDropMergeAllowed
        )
      : null
    const target = document.elementFromPoint(point.x, point.y) as HTMLElement | null
    const targetGroupId =
      target?.closest<HTMLElement>('[data-scroll-group-id]')?.dataset.scrollGroupId
    const dockSlot = target?.closest<HTMLElement>('[data-dock-slot]')
    const droppedOnGrid = Boolean(target?.closest('[data-scroll-grid-inner]'))
    const mergeTargetId = logicalDropPosition === 'middle' ? (logicalDrop?.entry.id ?? null) : null
    const shouldMerge = mergeTargetId !== null && mergeTargetId !== activeId
    let finalPreviewOrder = previewOrderRef.current
    if (
      droppedOnGrid &&
      !shouldMerge &&
      logicalDrop &&
      logicalDrop.entry.id !== activeId &&
      logicalDropPosition !== null &&
      logicalDropPosition !== 'middle' &&
      (lastOverIdRef.current !== logicalDrop.entry.id ||
        lastDropPositionRef.current !== logicalDropPosition) &&
      finalPreviewOrder
    ) {
      finalPreviewOrder = moveScrollItemRelative(
        finalPreviewOrder,
        activeId,
        logicalDrop.entry.id,
        logicalDropPosition
      )
      previewOrderRef.current = finalPreviewOrder
    }

    captureGridItemPositions()
    cleanupPointerDrag()
    finishItemDrag()
    if (targetGroupId) {
      if (targetGroupId !== activeSection?.groupId) {
        onMoveItemToGroup(activeId, targetGroupId)
      }
      return
    }
    if (dockSlot) {
      const dockSlots = Array.from(document.querySelectorAll<HTMLElement>('[data-dock-slot]'))
      onMoveItemToDock(activeId, Math.max(0, dockSlots.indexOf(dockSlot)))
      return
    }
    if (shouldMerge && mergeTargetId) {
      onMergeItems(activeId, mergeTargetId)
      return
    }
    if (droppedOnGrid && activeSection && finalPreviewOrder) {
      onCommitItemOrder(activeSection.groupId, finalPreviewOrder)
    }
  }

  const handleGridPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectionMode || event.button !== 0 || !event.isPrimary || pointerDragSessionRef.current) {
      return
    }
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"], [data-no-drag]')) return
    const sourceNode = target.closest<HTMLDivElement>('[data-scroll-sortable-id]')
    if (!sourceNode || !event.currentTarget.contains(sourceNode)) return
    const activeId = sourceNode.dataset.scrollSortableId
    if (!activeId || !activeItemById.has(activeId)) return

    pointerDragSessionRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      activeId,
      sourceNode,
      sourceRect: null,
      overlayNode: null,
      started: false,
      startPoint: { x: event.clientX, y: event.clientY },
      latestPoint: { x: event.clientX, y: event.clientY },
      activationTime: performance.now() + (event.pointerType === 'touch' ? TOUCH_DRAG_DELAY_MS : 0),
      gridRect: null,
      containerRect: null,
      startScrollTop: containerRef.current?.scrollTop ?? 0,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleGridPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    session.latestPoint = { x: event.clientX, y: event.clientY }
    if (!session.started) {
      const distance = Math.max(
        Math.abs(session.latestPoint.x - session.startPoint.x),
        Math.abs(session.latestPoint.y - session.startPoint.y)
      )
      if (distance <= POINTER_DRAG_DISTANCE) return
      if (session.pointerType === 'touch' && performance.now() < session.activationTime) {
        cleanupPointerDrag()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
        return
      }
      activatePointerDrag(session)
    }
    event.preventDefault()
    schedulePointerOverlayUpdate()
    updateEdgeScroll(session)
    queuePointerCollision()
  }

  const handleGridPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    session.latestPoint = { x: event.clientX, y: event.clientY }
    if (session.started) {
      event.preventDefault()
      completePointerDrag(session)
    } else {
      cleanupPointerDrag()
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const cancelPointerDrag = () => {
    const session = pointerDragSessionRef.current
    if (!session) return
    if (session.started) {
      captureGridItemPositions()
      cleanupPointerDrag()
      finishItemDrag()
    } else {
      cleanupPointerDrag()
    }
  }

  const handleGridPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerDragSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    cancelPointerDrag()
  }

  const handleKeyboardItemDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id)
    setKeyboardDraggedItemId(activeId)
    startItemDrag(activeId)
  }

  const handleKeyboardItemDragMove = (event: DragMoveEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over ? String(event.over.id) : null
    if (!overId || overId === activeId) return
    const currentOrder = previewOrderRef.current
    if (!currentOrder) return
    const sourceIndex = currentOrder.indexOf(activeId)
    const targetIndex = currentOrder.indexOf(overId)
    if (sourceIndex < 0 || targetIndex < 0) return
    commitPreviewOrder(activeId, overId, sourceIndex < targetIndex ? 'after' : 'before', 0)
  }

  const handleKeyboardItemDragEnd = (_event: DragEndEvent) => {
    const finalPreviewOrder = previewOrderRef.current
    captureGridItemPositions()
    setKeyboardDraggedItemId(null)
    finishItemDrag()
    if (activeSection && finalPreviewOrder) {
      onCommitItemOrder(activeSection.groupId, finalPreviewOrder)
    }
  }

  const handleKeyboardItemDragCancel = (_event: DragCancelEvent) => {
    captureGridItemPositions()
    setKeyboardDraggedItemId(null)
    finishItemDrag()
  }

  useLayoutEffect(() => {
    cancelPointerDragRef.current = cancelPointerDrag
  })

  useEffect(() => {
    const cancelActivePointerDrag = () => cancelPointerDragRef.current()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelActivePointerDrag()
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelActivePointerDrag()
    }

    window.addEventListener('blur', cancelActivePointerDrag)
    window.addEventListener('keydown', handleKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', cancelActivePointerDrag)
      window.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(
    () => () => {
      if (mergeTimerRef.current !== null) {
        window.clearTimeout(mergeTimerRef.current)
      }
      if (layoutSettleTimerRef.current !== null) {
        window.clearTimeout(layoutSettleTimerRef.current)
      }
      if (previewShiftTimerRef.current !== null) {
        window.clearTimeout(previewShiftTimerRef.current)
      }
      if (pointerOverlayFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerOverlayFrameRef.current)
      }
      if (pointerCollisionTimerRef.current !== null) {
        window.clearTimeout(pointerCollisionTimerRef.current)
      }
      if (edgeScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(edgeScrollFrameRef.current)
      }
      const pointerSession = pointerDragSessionRef.current
      pointerSession?.overlayNode?.remove()
      if (pointerSession?.sourceNode) pointerSession.sourceNode.style.opacity = ''
      pointerDragSessionRef.current = null
      gridFlipAnimationsRef.current.forEach(animation => animation.cancel())
      gridFlipAnimationsRef.current.clear()
    },
    []
  )

  const handleGridClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (itemDragDidMoveRef.current) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onTileClickCapture(event)
  }

  const activeDraggedSection =
    activeDraggedGroupIndex === null
      ? null
      : (sections.find(section => section.index === activeDraggedGroupIndex) ?? null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      groupItemRefs.current.get(currentPage)?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [currentPage])

  useEffect(() => {
    if (!groupComposerOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGroupComposerOpen(false)
        setEditingGroupIndex(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [groupComposerOpen])

  return (
    <div className="scroll-grid-layout grid h-full w-full min-w-0 grid-cols-[var(--scroll-grid-sidebar-width)_minmax(0,1fr)] overflow-hidden">
      <aside
        data-grid-mode-nav
        data-no-window-drag="true"
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
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
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
                                hoveredGroupId === section.groupId
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
                                  'scroll-grid-group-button relative block h-full w-full min-w-0 max-w-full touch-none overflow-hidden rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45',
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
                                    <CustomGroupIcon icon={section.meta.icon} compact />
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
                              onSelect={() => handleDeleteGroup(section.index)}
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
                    dropAnimation={{
                      duration: 180,
                      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
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
                          <CustomGroupIcon icon={activeDraggedSection.meta.icon} compact />
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
                              {translate('{count} 项', {
                                count: activeDraggedSection.itemCount,
                              })}
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
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
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

      <DndContext
        sensors={itemSensors}
        collisionDetection={closestCenter}
        onDragStart={handleKeyboardItemDragStart}
        onDragMove={handleKeyboardItemDragMove}
        onDragEnd={handleKeyboardItemDragEnd}
        onDragCancel={handleKeyboardItemDragCancel}
      >
        <div
          ref={containerRef}
          className={`scroll-grid-content-scroll min-h-0 min-w-0 overflow-x-hidden overflow-y-auto px-6 pt-24 ${
            dockEnabled ? 'pb-32' : 'pb-12'
          }`}
        >
          <div className="flex min-h-full justify-center">
            <div
              data-scroll-grid-page={currentPage}
              data-scroll-grid-inner={currentPage}
              ref={node => {
                gridElementRef.current = node
                bindGridPageRef(currentPage, node)
              }}
              className="relative grid max-w-full content-start"
              onPointerDown={handleGridPointerDown}
              onPointerMove={handleGridPointerMove}
              onPointerUp={handleGridPointerUp}
              onPointerCancel={handleGridPointerCancel}
              onLostPointerCapture={handleGridPointerCancel}
              style={{
                width: `${Math.max(
                  gridWidth,
                  layoutColumns * itemWidth + Math.max(0, layoutColumns - 1) * gridGap
                )}px`,
                height: `${gridHeight}px`,
                gridTemplateColumns: `repeat(${layoutColumns}, ${itemWidth}px)`,
                gridTemplateRows: `repeat(${gridRows}, ${itemHeight}px)`,
                gap: `${gridGap}px`,
              }}
            >
              <SortableContext
                items={entries.map(entry => entry.id)}
                strategy={noSortableTransform}
              >
                {entries.map(entry => {
                  const activeItem = activeDraggedItemId === entry.id
                  const hideItem = hiddenOuterItemIds.includes(entry.id) || activeItem
                  const highlightedItem = highlightedOuterItemIdSet.has(entry.id)
                  const folderPreview =
                    (dragContext === 'outer' && dragFolderPreviewTargetId === entry.id) ||
                    mergeTargetId === entry.id ||
                    folderPreviewFreezeTargetId === entry.id ||
                    folderCreateTransitionTargetId === entry.id

                  return (
                    <SortableGridItem key={entry.id} id={entry.id} disabled={selectionMode}>
                      {sortable => (
                        <div
                          ref={node => {
                            sortable.setNodeRef(node)
                            bindTileRef(entry.id, node)
                            if (node) gridItemRefs.current.set(entry.id, node)
                            else gridItemRefs.current.delete(entry.id)
                          }}
                          data-scroll-sortable-id={entry.id}
                          className={`relative touch-pan-y justify-self-center self-start ${
                            activeItem
                              ? 'pointer-events-none opacity-0'
                              : `transition-opacity duration-[220ms] ${hideItem ? 'opacity-0' : 'opacity-100'}`
                          } ${sortable.isDragging ? 'z-20 cursor-grabbing' : 'z-10'}`}
                          style={{
                            gridColumn: `${entry.col + 1} / span ${entry.span.cols}`,
                            gridRow: `${entry.row + 1} / span ${entry.span.rows}`,
                            width: `${entry.span.cols * itemWidth + Math.max(0, entry.span.cols - 1) * gridGap}px`,
                            height: `${entry.span.rows * itemHeight + Math.max(0, entry.span.rows - 1) * gridGap}px`,
                          }}
                          {...sortable.attributes}
                          {...sortable.listeners}
                          onClickCapture={handleGridClickCapture}
                        >
                          {entry.item.kind === 'icon' ? (
                            <div className="relative">
                              <div
                                className={`transition-opacity duration-[220ms] ${
                                  folderPreview ? 'opacity-0' : 'opacity-100'
                                }`}
                              >
                                <Icon
                                  icon={entry.item.icon}
                                  selectionKey={entry.item.key}
                                  selectionMode={selectionMode}
                                  selected={selectedSet.has(entry.item.key)}
                                  onToggleSelect={onToggleSelectIcon}
                                  highlighted={highlightedItem}
                                  motionProfile="scroll"
                                />
                              </div>
                              <FolderCreatePreview
                                active={folderPreview}
                                icon={entry.item.icon}
                                imgSize={iconConfig.imgSize}
                                reorderAnimationMs={reorderAnimationMs}
                                tileWidth={itemWidth}
                                tileHeight={itemHeight}
                              />
                            </div>
                          ) : (
                            <OuterFolderTile
                              folder={entry.item}
                              span={entry.span}
                              slotWidth={itemWidth}
                              slotHeight={itemHeight}
                              gridGap={gridGap}
                              folderPreview={folderPreview}
                              folderOpen={openFolderId === entry.item.id}
                              sharedLayoutActive={activeFolderSharedLayoutId === entry.item.id}
                              selectionMode={selectionMode}
                              onPointerDown={NOOP}
                              onClickCapture={NOOP}
                              onOpenFolder={onOpenFolder}
                              onLaunchIcon={onLaunchIcon}
                              onResizeFolder={onResizeFolder}
                            />
                          )}
                        </div>
                      )}
                    </SortableGridItem>
                  )
                })}
              </SortableContext>
              <DragOverlay adjustScale={false} dropAnimation={null} zIndex={240}>
                {keyboardDraggedItem ? (
                  <div
                    data-scroll-dragging="true"
                    className="pointer-events-none relative cursor-grabbing"
                    style={{
                      width: `${(keyboardDraggedSpan?.cols ?? 1) * itemWidth + Math.max(0, (keyboardDraggedSpan?.cols ?? 1) - 1) * gridGap}px`,
                      height: `${(keyboardDraggedSpan?.rows ?? 1) * itemHeight + Math.max(0, (keyboardDraggedSpan?.rows ?? 1) - 1) * gridGap}px`,
                    }}
                  >
                    {keyboardDraggedItem.kind === 'icon' ? (
                      <Icon
                        icon={keyboardDraggedItem.icon}
                        selectionKey={keyboardDraggedItem.key}
                        selectionMode={false}
                        selected={false}
                        onToggleSelect={NOOP}
                        motionProfile="scroll"
                      />
                    ) : (
                      <OuterFolderTile
                        folder={keyboardDraggedItem}
                        span={keyboardDraggedSpan ?? { cols: 1, rows: 1 }}
                        slotWidth={itemWidth}
                        slotHeight={itemHeight}
                        gridGap={gridGap}
                        folderPreview={false}
                        folderOpen={false}
                        sharedLayoutActive={false}
                        selectionMode={false}
                        onPointerDown={NOOP}
                        onClickCapture={NOOP}
                        onOpenFolder={NOOP}
                        onLaunchIcon={NOOP}
                        onResizeFolder={NOOP}
                      />
                    )}
                  </div>
                ) : null}
              </DragOverlay>
              {hasAddIconSlot ? (
                <button
                  type="button"
                  data-no-window-drag="true"
                  aria-label={addIconLabel}
                  title={addIconLabel}
                  disabled={addIconDisabled || !onAddIcon}
                  className="icon-item group relative flex flex-col items-center justify-start justify-self-center self-start rounded-2xl border-none px-3 text-muted-foreground shadow-none transition-opacity duration-200 hover:bg-foreground/6 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 active:bg-foreground/10 disabled:pointer-events-none disabled:opacity-45 dark:hover:bg-white/10 dark:active:bg-white/20"
                  style={{
                    gridColumn: addIconCol + 1,
                    gridRow: addIconRow + 1,
                    width: `${itemWidth}px`,
                    height: `${itemHeight}px`,
                    paddingTop: ICON_GRID_TILE_PADDING_Y,
                    paddingBottom: ICON_GRID_TILE_PADDING_Y,
                    rowGap: ICON_GRID_TITLE_GAP,
                    opacity: addIconVisible ? undefined : 0,
                    pointerEvents: addIconVisible ? undefined : 'none',
                  }}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={onAddIcon}
                >
                  <span
                    className="icon-image flex flex-1 items-center justify-center overflow-hidden"
                    style={{ width: iconConfig.imgSize, height: iconConfig.imgSize }}
                  >
                    <span
                      className="flex shrink-0 items-center justify-center rounded-md border border-dashed border-border/80 bg-foreground/3 transition-colors group-hover:border-foreground/35 group-hover:bg-accent dark:border-white/18 dark:bg-white/4"
                      style={{
                        width: iconConfig.imgSize,
                        height: iconConfig.imgSize,
                      }}
                    >
                      <Plus className="h-5 w-5" />
                    </span>
                  </span>
                  <span
                    className="icon-label text-center text-[11px] leading-[13px] text-foreground drop-shadow-md"
                    style={{
                      maxWidth: itemWidth - 10,
                      height: addIconTitleMetrics.height,
                      display: addIconTitleMetrics.singleLine ? 'block' : '-webkit-box',
                      WebkitLineClamp: addIconTitleMetrics.lineClamp,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: addIconTitleMetrics.singleLine ? 'nowrap' : 'normal',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {addIconLabel}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </DndContext>
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
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
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
                          className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 ${
                            selected
                              ? 'text-blue-700 dark:text-blue-200'
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
                              className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-600 dark:bg-blue-300"
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
                  <input
                    autoFocus
                    value={groupName}
                    maxLength={24}
                    placeholder={translate('填写分组名称')}
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-blue-500/60 focus:ring-2 focus:ring-blue-500/15"
                    onChange={event => setGroupName(event.target.value)}
                  />
                </label>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-lg px-4 text-sm text-foreground/75 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45"
                    onClick={closeGroupComposer}
                  >
                    {translate('取消')}
                  </button>
                  <button
                    type="submit"
                    disabled={!groupName.trim()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/45 disabled:pointer-events-none disabled:opacity-40 dark:bg-blue-500 dark:text-blue-950"
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
    </div>
  )
}
