import {
  applyAiGroupsToLayout,
  buildAiIconInputs,
  inferAiFolderSize,
  normalizeAiFolderSize,
} from './aiOrganize.ts'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const makeIcon = (id, name, opts = {}) => ({
  id,
  name,
  path: opts.path ?? `C:/Users/me/Desktop/${name}.lnk`,
  target_path: opts.target_path ?? `C:/Program Files/${name}/${name}.exe`,
  icon_base64: '',
  item_type: opts.item_type ?? 'shortcut',
})

// --- buildAiIconInputs ---
{
  const icons = [makeIcon('1', 'Chrome'), makeIcon('2', 'VSCode')]
  const inputs = buildAiIconInputs(icons, { 'C:/Users/me/Desktop/Chrome.lnk': '谷歌浏览器' })
  assert(inputs.length === 2, '应为每个图标生成一条输入')
  assert(inputs[0].key === '1', 'key 应为图标库 id')
  assert(inputs[0].name === '谷歌浏览器', '自定义名应覆盖原名')
  assert(inputs[1].name === 'VSCode', '无自定义名时使用原名')
  assert(inputs[0].target_leaf === 'Chrome.exe', 'target_leaf 应取目标路径叶子')
  assert(inputs[0].item_type === 'shortcut', '应携带 item_type')
}

// --- applyAiGroupsToLayout: 基本分组 ---
{
  const items = [
    { kind: 'icon', key: '1', icon: makeIcon('1', 'Chrome') },
    { kind: 'icon', key: '2', icon: makeIcon('2', 'Edge') },
    { kind: 'icon', key: '3', icon: makeIcon('3', 'Notepad') },
  ]
  const groups = [{ folder_name: '浏览器', icon_keys: ['1', '2'] }]
  const result = applyAiGroupsToLayout(items, groups)

  assert(result.length === 2, '应生成 1 个文件夹 + 1 个未分组图标')
  const folder = result.find(item => item.kind === 'folder')
  assert(folder && folder.name === '浏览器', '文件夹名应来自分组')
  assert(folder.children.length === 2, '文件夹应包含 2 个图标')
  assert(folder.size === '1x1', '2 个图标的 AI 文件夹应保持小尺寸')
  assert(result[0].kind === 'folder', '新文件夹应排在最前')
  const leftover = result.find(item => item.kind === 'icon')
  assert(leftover && leftover.key === '3', '未分组图标应保留')
}

// --- inferAiFolderSize: 根据分组数量适配文件夹尺寸 ---
{
  assert(inferAiFolderSize(2) === '1x1', '2 个图标应使用小文件夹')
  assert(inferAiFolderSize(4) === '2x1', '4-6 个图标应使用横向大文件夹')
  assert(inferAiFolderSize(6) === '2x1', '4-6 个图标应保持横向大文件夹')
  assert(inferAiFolderSize(7) === '2x2', '7 个及以上图标应使用大文件夹')
  assert(normalizeAiFolderSize('1x2', 4) === '1x2', 'AI 指定的合法尺寸应优先保留')
  assert(normalizeAiFolderSize('bad', 7) === '2x2', '非法尺寸应回退到本地兜底')
}

// --- applyAiGroupsToLayout: 优先使用 AI 返回的文件夹尺寸 ---
{
  const items = Array.from({ length: 7 }, (_, index) => {
    const id = String(index + 1)
    return { kind: 'icon', key: id, icon: makeIcon(id, `App${id}`) }
  })
  const result = applyAiGroupsToLayout(items, [
    {
      folder_name: '中型组',
      icon_keys: items.slice(0, 4).map(item => item.key),
      folder_size: '1x2',
    },
  ])
  const mediumFolder = result.find(item => item.kind === 'folder' && item.name === '中型组')

  assert(mediumFolder && mediumFolder.size === '1x2', '应使用 AI 指定的 1x2 尺寸')

  const largeItems = items.map(item => ({ ...item }))
  const largeResult = applyAiGroupsToLayout(largeItems, [
    {
      folder_name: '大型组',
      icon_keys: largeItems.map(item => item.key),
      folder_size: '2x2',
    },
  ])
  const onlyLargeFolder = largeResult.find(item => item.kind === 'folder')
  assert(onlyLargeFolder && onlyLargeFolder.size === '2x2', '应使用 AI 指定的 2x2 尺寸')
}

// --- applyAiGroupsToLayout: 旧模型未返回尺寸时使用兜底规则 ---
{
  const items = Array.from({ length: 4 }, (_, index) => {
    const id = String(index + 1)
    return { kind: 'icon', key: id, icon: makeIcon(id, `Legacy${id}`) }
  })
  const result = applyAiGroupsToLayout(items, [
    { folder_name: '旧模型组', icon_keys: items.map(item => item.key) },
  ])
  const folder = result.find(item => item.kind === 'folder')
  assert(folder && folder.size === '2x1', '缺少 AI 尺寸时才按数量兜底')
}

// --- applyAiGroupsToLayout: 忽略非法 key 与不足 2 项的分组 ---
{
  const items = [
    { kind: 'icon', key: '1', icon: makeIcon('1', 'A') },
    { kind: 'icon', key: '2', icon: makeIcon('2', 'B') },
  ]
  const groups = [
    { folder_name: '幽灵组', icon_keys: ['ghost', '1'] }, // 只有 1 个有效 -> 解散
  ]
  const result = applyAiGroupsToLayout(items, groups)
  assert(result.length === 2, '解散后两个图标都应保留在顶层')
  assert(
    result.every(item => item.kind === 'icon'),
    '不应生成任何文件夹'
  )
}

// --- applyAiGroupsToLayout: 从旧文件夹中重新分组 ---
{
  const items = [
    {
      kind: 'folder',
      id: 'old',
      name: '旧文件夹',
      size: '1x1',
      children: [
        { kind: 'icon', key: '1', icon: makeIcon('1', 'A') },
        { kind: 'icon', key: '2', icon: makeIcon('2', 'B') },
        { kind: 'icon', key: '3', icon: makeIcon('3', 'C') },
      ],
    },
  ]
  // 把旧文件夹里的两个图标重新分到新组，剩下 1 个应展开为顶层图标
  const groups = [{ folder_name: '新组', icon_keys: ['1', '2'] }]
  const result = applyAiGroupsToLayout(items, groups)
  assert(result.length === 2, '应得到新文件夹 + 1 个展开的图标')
  const newFolder = result.find(item => item.kind === 'folder')
  assert(newFolder && newFolder.name === '新组', '应生成新组文件夹')
  assert(newFolder.children.length === 2, '新组应有 2 个图标')
  const expanded = result.find(item => item.kind === 'icon')
  assert(expanded && expanded.key === '3', '旧文件夹剩余单图标应展开到顶层')
}

console.log('aiOrganize.test.ts passed')
