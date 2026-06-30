import { applyAiGroupsToLayout, buildAiIconInputs } from './aiOrganize.ts'

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
  source: opts.source ?? 'desktop',
})

// --- buildAiIconInputs ---
{
  const icons = [makeIcon('1', 'Chrome'), makeIcon('2', 'VSCode')]
  const inputs = buildAiIconInputs(icons, { 'C:/Users/me/Desktop/Chrome.lnk': '谷歌浏览器' })
  assert(inputs.length === 2, '应为每个图标生成一条输入')
  assert(inputs[0].key === 'desktop:1', 'key 应为 source:id')
  assert(inputs[0].name === '谷歌浏览器', '自定义名应覆盖原名')
  assert(inputs[1].name === 'VSCode', '无自定义名时使用原名')
  assert(inputs[0].target_leaf === 'Chrome.exe', 'target_leaf 应取目标路径叶子')
  assert(inputs[0].item_type === 'shortcut', '应携带 item_type')
}

// --- applyAiGroupsToLayout: 基本分组 ---
{
  const items = [
    { kind: 'icon', key: 'desktop:1', icon: makeIcon('1', 'Chrome') },
    { kind: 'icon', key: 'desktop:2', icon: makeIcon('2', 'Edge') },
    { kind: 'icon', key: 'desktop:3', icon: makeIcon('3', 'Notepad') },
  ]
  const groups = [{ folder_name: '浏览器', icon_keys: ['desktop:1', 'desktop:2'] }]
  const result = applyAiGroupsToLayout(items, groups)

  assert(result.length === 2, '应生成 1 个文件夹 + 1 个未分组图标')
  const folder = result.find(item => item.kind === 'folder')
  assert(folder && folder.name === '浏览器', '文件夹名应来自分组')
  assert(folder.children.length === 2, '文件夹应包含 2 个图标')
  assert(result[0].kind === 'folder', '新文件夹应排在最前')
  const leftover = result.find(item => item.kind === 'icon')
  assert(leftover && leftover.key === 'desktop:3', '未分组图标应保留')
}

// --- applyAiGroupsToLayout: 忽略非法 key 与不足 2 项的分组 ---
{
  const items = [
    { kind: 'icon', key: 'desktop:1', icon: makeIcon('1', 'A') },
    { kind: 'icon', key: 'desktop:2', icon: makeIcon('2', 'B') },
  ]
  const groups = [
    { folder_name: '幽灵组', icon_keys: ['ghost', 'desktop:1'] }, // 只有 1 个有效 -> 解散
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
        { kind: 'icon', key: 'desktop:1', icon: makeIcon('1', 'A') },
        { kind: 'icon', key: 'desktop:2', icon: makeIcon('2', 'B') },
        { kind: 'icon', key: 'desktop:3', icon: makeIcon('3', 'C') },
      ],
    },
  ]
  // 把旧文件夹里的两个图标重新分到新组，剩下 1 个应展开为顶层图标
  const groups = [{ folder_name: '新组', icon_keys: ['desktop:1', 'desktop:2'] }]
  const result = applyAiGroupsToLayout(items, groups)
  assert(result.length === 2, '应得到新文件夹 + 1 个展开的图标')
  const newFolder = result.find(item => item.kind === 'folder')
  assert(newFolder && newFolder.name === '新组', '应生成新组文件夹')
  assert(newFolder.children.length === 2, '新组应有 2 个图标')
  const expanded = result.find(item => item.kind === 'icon')
  assert(expanded && expanded.key === 'desktop:3', '旧文件夹剩余单图标应展开到顶层')
}

console.log('aiOrganize.test.ts passed')
