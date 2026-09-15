import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { translate, useI18n } from '@/lib/i18n'
import {
  loadAiIconCategoryState,
  loadBuiltinIconCategories,
  mergeIconCategoryRows,
  saveAiIconCategoryState,
  type AiIconCategoryEntry,
  type AiIconCategoryRow,
} from '@/lib/aiIconCategories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface CategoryGroup {
  category: string
  items: AiIconCategoryRow[]
  /** 未删除且已命名的条目数（空草稿不计入）。 */
  liveCount: number
}

const iconBtn =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-button text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'

const rowInputClass =
  'h-7 border-transparent bg-transparent px-2 text-xs hover:border-input'

function SourceBadge({ row }: { row: AiIconCategoryRow }) {
  if (row.deleted) {
    return (
      <span className="shrink-0 rounded-full border border-red-500/40 bg-red-500/8 px-1.5 text-[10px] leading-4 text-red-600 dark:text-red-300">
        {translate('已删除')}
      </span>
    )
  }
  if (row.origin === 'custom') {
    return (
      <span className="shrink-0 rounded-full border border-blue-500/40 bg-blue-500/8 px-1.5 text-[10px] leading-4 text-blue-600 dark:text-blue-300">
        {translate('自定义')}
      </span>
    )
  }
  if (row.modified) {
    return (
      <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/8 px-1.5 text-[10px] leading-4 text-amber-600 dark:text-amber-300">
        {translate('已修改')}
      </span>
    )
  }
  return (
    <span className="shrink-0 rounded-full border border-border/70 px-1.5 text-[10px] leading-4 text-muted-foreground">
      {translate('内置')}
    </span>
  )
}

interface CategoryRowProps {
  row: AiIconCategoryRow
  onNameChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onDelete: () => void
  onRestore: () => void
}

/** 分类输入共用的 datalist id（datalist 渲染在组件根部）。 */
const CATEGORY_DATALIST_ID = 'icon-category-options'

function CategoryRow({ row, onNameChange, onCategoryChange, onDelete, onRestore }: CategoryRowProps) {
  const nameReadonly = row.origin === 'builtin' || row.deleted

  return (
    <div className={cn('group flex items-center gap-1.5 rounded-button px-1.5 py-0.5', row.deleted && 'opacity-60')}>
      <Input
        value={row.name}
        readOnly={nameReadonly}
        onChange={e => onNameChange(e.target.value)}
        placeholder={translate('应用或网站名称')}
        title={
          row.origin === 'builtin'
            ? translate('名称是匹配键，不可修改；可修改其分类，或删除后新建条目。')
            : undefined
        }
        spellCheck={false}
        autoFocus={row.name === ''}
        className={cn(rowInputClass, 'min-w-0 flex-1', row.deleted && 'line-through decoration-muted-foreground')}
      />
      <span aria-hidden="true" className="shrink-0 text-[10px] text-muted-foreground">
        →
      </span>
      <Input
        value={row.category}
        readOnly={row.deleted}
        list={CATEGORY_DATALIST_ID}
        onChange={e => onCategoryChange(e.target.value)}
        placeholder={translate('分类')}
        spellCheck={false}
        className={cn(rowInputClass, 'w-28 shrink-0')}
      />
      <SourceBadge row={row} />
      {row.deleted ? (
        <button
          type="button"
          onClick={onRestore}
          className="shrink-0 rounded-button px-1.5 py-1 text-xs text-blue-600 transition-colors hover:bg-blue-500/10 dark:text-blue-300"
        >
          {translate('恢复')}
        </button>
      ) : (
        <>
          {row.origin === 'builtin' && row.modified ? (
            <button
              type="button"
              onClick={onRestore}
              title={translate('恢复内置分类')}
              className={iconBtn}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onDelete}
            title={translate('删除')}
            className={cn(iconBtn, 'hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}

/**
 * 「图标分类知识库」管理器：左侧分类导航 + 右侧条目表。
 * 内置条目可改分类（同名覆盖）、可删除（墓碑，可恢复）；自定义条目自由增删改。
 * 所有变更即改即存，与「保存配置」按钮相互独立。
 */
export function IconCategoryManager() {
  useI18n()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [builtins, setBuiltins] = useState<AiIconCategoryEntry[]>([])
  const [userEntries, setUserEntries] = useState<AiIconCategoryEntry[]>([])
  const [deletedNames, setDeletedNames] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmCat, setConfirmCat] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [newCat, setNewCat] = useState('')
  const confirmTimer = useRef<number | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const [builtinTable, state] = await Promise.all([
          loadBuiltinIconCategories(),
          loadAiIconCategoryState(),
        ])
        setBuiltins(builtinTable)
        setUserEntries(state.entries)
        setDeletedNames(state.deletedBuiltinNames)
      } catch (e) {
        console.error('Failed to load AI icon categories:', e)
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current)
    }
  }, [])

  const rows = useMemo(() => mergeIconCategoryRows(builtins, { entries: userEntries, deletedBuiltinNames: deletedNames }), [builtins, userEntries, deletedNames])

  const groups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, AiIconCategoryRow[]>()
    for (const row of rows) {
      const key = row.category.trim() || '—'
      const list = map.get(key)
      if (list) list.push(row)
      else map.set(key, [row])
    }
    return [...map.entries()].map(([category, items]) => ({
      category,
      items,
      liveCount: items.filter(item => !item.deleted && item.name.trim()).length,
    }))
  }, [rows])

  // 当前选中的分类被删空后，展示与操作回落到第一个分类（派生值，不写回状态）。
  const effectiveCat =
    groups.find(group => group.category === activeCat)?.category ?? groups[0]?.category ?? ''

  /** 更新本地状态并持久化（空条目只在本地，不入库）。 */
  const apply = (nextEntries: AiIconCategoryEntry[], nextDeleted: string[]) => {
    setUserEntries(nextEntries)
    setDeletedNames(nextDeleted)
    void saveAiIconCategoryState({ entries: nextEntries, deletedBuiltinNames: nextDeleted }).catch(
      (e: unknown) => {
        console.error('Failed to save AI icon categories:', e)
        toast.error(translate('保存图标分类失败：{error}', { error: String(e) }), {
          key: 'icon-category-mgr',
          title: translate('图标分类知识库'),
        })
      }
    )
  }

  /** 破坏性操作的统一入口：执行变更并提供「撤销」。 */
  const withUndo = (
    nextEntries: AiIconCategoryEntry[],
    nextDeleted: string[],
    message: string
  ) => {
    const prevEntries = userEntries
    const prevDeleted = deletedNames
    apply(nextEntries, nextDeleted)
    toast.info(message, {
      key: 'icon-category-mgr',
      title: translate('图标分类知识库'),
      duration: 6000,
      action: {
        label: translate('撤销'),
        onClick: () => apply(prevEntries, prevDeleted),
      },
    })
  }

  const upsertOverride = (name: string, category: string, base: AiIconCategoryEntry[]) => {
    const key = name.toLowerCase()
    const exists = base.some(entry => entry.name.toLowerCase() === key)
    return exists
      ? base.map(entry => (entry.name.toLowerCase() === key ? { name, category } : entry))
      : [...base, { name, category }]
  }

  const armConfirm = () => {
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current)
    confirmTimer.current = window.setTimeout(() => {
      setConfirmCat(null)
      setConfirmReset(false)
    }, 3500)
  }

  const handleNameChange = (row: AiIconCategoryRow, value: string) => {
    if (row.origin !== 'custom') return
    apply(
      userEntries.map(entry =>
        entry.name.toLowerCase() === row.name.toLowerCase() && entry.name === row.name
          ? { ...entry, name: value }
          : entry
      ),
      deletedNames
    )
  }

  const handleCategoryChange = (row: AiIconCategoryRow, value: string) => {
    if (row.origin === 'builtin') {
      apply(upsertOverride(row.name, value, userEntries), deletedNames)
      return
    }
    apply(
      userEntries.map(entry =>
        entry.name.toLowerCase() === row.name.toLowerCase() && entry.name === row.name
          ? { ...entry, category: value }
          : entry
      ),
      deletedNames
    )
  }

  const handleDelete = (row: AiIconCategoryRow) => {
    const sameName = (entry: AiIconCategoryEntry) => entry.name.toLowerCase() === row.name.toLowerCase()
    if (row.origin === 'builtin') {
      withUndo(
        userEntries.filter(entry => !sameName(entry)),
        [...deletedNames, row.name],
        translate('已删除内置条目「{name}」（可恢复）', { name: row.name })
      )
      return
    }
    withUndo(
      userEntries.filter(entry => !sameName(entry)),
      deletedNames,
      translate('已删除「{name}」', { name: row.name })
    )
  }

  const handleRestore = (row: AiIconCategoryRow) => {
    const sameName = (entry: AiIconCategoryEntry) => entry.name.toLowerCase() === row.name.toLowerCase()
    if (row.deleted) {
      apply(
        userEntries.filter(entry => !sameName(entry)),
        deletedNames.filter(name => name.toLowerCase() !== row.name.toLowerCase())
      )
      toast.success(translate('已恢复内置条目「{name}」', { name: row.name }), {
        key: 'icon-category-mgr',
        title: translate('图标分类知识库'),
      })
      return
    }
    // 恢复被修改的内置条目：移除同名覆盖即可回到内置值。
    apply(userEntries.filter(entry => !sameName(entry)), deletedNames)
    toast.success(translate('已恢复内置分类'), {
      key: 'icon-category-mgr',
      title: translate('图标分类知识库'),
    })
  }

  const addDraft = (category: string) => {
    apply([...userEntries, { name: '', category }], deletedNames)
  }

  const createCategory = () => {
    const name = newCat.trim()
    if (!name) return
    if (groups.some(group => group.category.toLowerCase() === name.toLowerCase())) {
      toast.error(translate('分类「{name}」已存在', { name }), {
        key: 'icon-category-mgr',
        title: translate('图标分类知识库'),
      })
      return
    }
    apply([...userEntries, { name: '', category: name }], deletedNames)
    setActiveCat(name)
    setNewCat('')
    setSearch('')
    toast.success(translate('已创建分类「{name}」，添加条目后生效', { name }), {
      key: 'icon-category-mgr',
      title: translate('图标分类知识库'),
    })
  }

  const startRename = () => {
    setRenaming(effectiveCat)
    setRenameValue(effectiveCat)
  }

  const commitRename = () => {
    const oldCat = renaming
    setRenaming(null)
    if (!oldCat) return
    const nextCat = renameValue.trim()
    if (!nextCat || nextCat === oldCat) return
    if (groups.some(group => group.category.toLowerCase() === nextCat.toLowerCase())) {
      toast.error(translate('分类「{name}」已存在', { name: nextCat }), {
        key: 'icon-category-mgr',
        title: translate('图标分类知识库'),
      })
      setRenaming(oldCat)
      setRenameValue(oldCat)
      return
    }
    // 内置条目逐个落覆盖；自定义/草稿与既有覆盖直接改分类字段。
    const overridden = new Set(
      userEntries
        .filter(entry => entry.category === oldCat)
        .map(entry => entry.name.toLowerCase())
    )
    let next = userEntries.map(entry =>
      entry.category === oldCat ? { ...entry, category: nextCat } : entry
    )
    for (const row of rows) {
      if (row.origin !== 'builtin' || row.category !== oldCat || row.deleted) continue
      if (overridden.has(row.name.toLowerCase())) continue
      next = upsertOverride(row.name, nextCat, next)
    }
    apply(next, deletedNames)
    setActiveCat(nextCat)
    toast.success(translate('分类已重命名为「{name}」', { name: nextCat }), {
      key: 'icon-category-mgr',
      title: translate('图标分类知识库'),
    })
  }

  const handleDeleteCategory = () => {
    const cat = effectiveCat
    if (!cat) return
    if (confirmCat !== cat) {
      setConfirmCat(cat)
      armConfirm()
      return
    }
    setConfirmCat(null)
    const group = groups.find(item => item.category === cat)
    const builtinNames = (group?.items ?? [])
      .filter(row => row.origin === 'builtin')
      .map(row => row.name)
    const nextDeleted = [...deletedNames]
    for (const name of builtinNames) {
      if (!nextDeleted.some(existing => existing.toLowerCase() === name.toLowerCase())) {
        nextDeleted.push(name)
      }
    }
    withUndo(
      userEntries.filter(entry => entry.category !== cat),
      nextDeleted,
      translate('已删除分类「{name}」（内置条目可恢复）', { name: cat })
    )
  }

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true)
      armConfirm()
      return
    }
    setConfirmReset(false)
    withUndo([], [], translate('已恢复默认知识库'))
  }

  if (loading) {
    return <p className="text-xs text-muted-foreground">{translate('加载中...')}</p>
  }

  const searching = search.trim().length > 0
  const query = search.trim().toLowerCase()
  const activeGroup = groups.find(group => group.category === effectiveCat)
  const detailItems = searching
    ? rows.filter(
        row =>
          row.name.trim().length > 0 &&
          (row.name.toLowerCase().includes(query) || row.category.toLowerCase().includes(query))
      )
    : (activeGroup?.items ?? [])
  const liveTotal = rows.filter(row => !row.deleted && row.name.trim()).length
  const deletedTotal = rows.filter(row => row.deleted).length
  const categoryOptions = groups.map(group => group.category)

  return (
    <div className="space-y-3">
      <datalist id={CATEGORY_DATALIST_ID}>
        {categoryOptions.map(category => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={translate('搜索应用或分类...')}
            spellCheck={false}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className={cn(confirmReset && 'border-red-500/40 text-red-600 dark:text-red-300')}
          onClick={handleReset}
        >
          {confirmReset ? translate('确认清空？') : translate('恢复默认')}
        </Button>
      </div>

      <div className="grid h-[400px] grid-cols-[184px_minmax(0,1fr)] overflow-hidden rounded-card border border-border/70">
        {/* 左侧：分类导航 */}
        <div className="flex min-h-0 flex-col border-r border-border/70 bg-muted/30">
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {groups.map(group => {
              const active = !searching && group.category === effectiveCat
              return (
                <button
                  key={group.category}
                  type="button"
                  onClick={() => {
                    setActiveCat(group.category)
                    setSearch('')
                    setConfirmCat(null)
                    setRenaming(null)
                  }}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-button px-2.5 py-1.5 text-left text-xs transition-colors',
                    active
                      ? 'bg-primary font-medium text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{group.category}</span>
                  <span className={cn('shrink-0 text-[10px]', active ? 'opacity-70' : 'opacity-60')}>
                    {group.liveCount}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="border-t border-border/70 p-2">
            <Input
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') createCategory()
              }}
              placeholder={translate('新建分类，回车创建')}
              spellCheck={false}
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* 右侧：条目表 */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            {searching ? (
              <>
                <span className="text-xs font-medium">
                  {translate('搜索结果：{count} 条', { count: detailItems.length })}
                </span>
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {translate('清除')}
                </button>
              </>
            ) : renaming === effectiveCat ? (
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') {
                    setRenaming(null)
                  }
                }}
                onBlur={commitRename}
                autoFocus
                spellCheck={false}
                className="h-7 w-44 rounded-field border border-input bg-background px-2 text-xs font-medium outline-none focus-visible:border-ring/45 focus-visible:ring-2 focus-visible:ring-ring/45"
              />
            ) : (
              <>
                <span className="min-w-0 truncate text-xs font-medium">{effectiveCat}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {translate('{count} 条', { count: activeGroup?.liveCount ?? 0 })}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => addDraft(effectiveCat)}
                    title={translate('添加分类条目')}
                    className={iconBtn}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={startRename} title={translate('重命名分类')} className={iconBtn}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCategory}
                    title={confirmCat === effectiveCat ? translate('再次点击确认删除') : translate('删除分类')}
                    className={cn(iconBtn, confirmCat === effectiveCat && 'bg-red-500/10 text-red-600 dark:text-red-300')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {detailItems.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {translate('此分类暂无条目')}
              </p>
            ) : (
              <div className="space-y-0.5">
                {detailItems.map(row => (
                  <CategoryRow
                    key={row.uid}
                    row={row}
                    onNameChange={value => handleNameChange(row, value)}
                    onCategoryChange={value => handleCategoryChange(row, value)}
                    onDelete={() => handleDelete(row)}
                    onRestore={() => handleRestore(row)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-4 text-muted-foreground">
        {translate('共 {count} 个分类 · {total} 条生效 · {deleted} 条已删除', {
          count: groups.length,
          total: liveTotal,
          deleted: deletedTotal,
        })}
      </p>
    </div>
  )
}
