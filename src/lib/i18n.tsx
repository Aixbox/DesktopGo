import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import type { AppLanguage } from '@/types'
import { getSetting, setSetting } from './settingsStore'

type TranslationParams = Record<string, string | number | null | undefined>

type I18nContextValue = {
  language: AppLanguage
  locale: string
  ready: boolean
  setLanguage: (language: AppLanguage) => Promise<void>
  t: (message: string, params?: TranslationParams) => string
}

const ZH_MESSAGES: Record<string, string> = {
  'Loading...': '加载中...',
  'No desktop shortcuts found': '没有找到桌面快捷方式',
  'Identifier: {identifier}': '标识符：{identifier}',
  'Runtime: Tauri {version}': '运行时：Tauri {version}',
  'Search dependency: Installed Everything': '搜索依赖：已安装 Everything',
  'Update channel: GitHub Releases latest.json': '更新通道：GitHub Releases latest.json',
  'Installed Everything only': '仅支持已安装的 Everything',
  'GitHub Releases latest.json': 'GitHub Releases latest.json',
  DesktopGo: 'DesktopGo',
  English: 'English',
  B: 'B',
  KB: 'KB',
  MB: 'MB',
  GB: 'GB',
  'New Folder': '新文件夹',
}

const EN_MESSAGES: Record<string, string> = {
  关闭提示: 'Dismiss notification',
  请选择: 'Please select',
  暂无可选项: 'No options available',
  增加数值: 'Increase value',
  减少数值: 'Decrease value',
  大图标: 'Large icons',
  中图标: 'Medium icons',
  小图标: 'Small icons',
  全屏: 'Fullscreen',
  大窗口: 'Large window',
  中窗口: 'Medium window',
  小窗口: 'Small window',
  单行标题: 'Single-line titles',
  双行标题: 'Two-line titles',
  设置: 'Settings',
  搜索: 'Search',
  图标管理: 'Icon Manager',
  更新: 'Updates',
  关于: 'About',
  '显示 Dock 栏': 'Show Dock',
  '当前已开启，Dock 会在启动台底部显示。':
    'Dock is on and will appear at the bottom of the launchpad.',
  '当前已关闭，Dock 中的图标会回到图标网格。':
    'Dock is off and its icons will return to the icon grid.',
  开机自启: 'Launch on startup',
  '当前已开启，登录 Windows 后会自动启动 DesktopGo 并保持后台待命。':
    'DesktopGo will start automatically after Windows sign-in and stay ready in the background.',
  '当前已关闭，登录 Windows 后需要手动启动 DesktopGo。':
    'DesktopGo will not start automatically after Windows sign-in.',
  主题模式: 'Theme',
  主题风格: 'Theme style',
  图标大小: 'Icon size',
  窗口大小: 'Window size',
  标题行数: 'Title lines',
  界面语言: 'Language',
  跟随系统: 'System',
  深色模式: 'Dark',
  浅色模式: 'Light',
  柔光玻璃: 'Soft Glass',
  亚克力: 'Acrylic',
  'DesktopGo 自带的柔和玻璃层次，观感更稳定。':
    "DesktopGo's built-in soft glass layering with a more stable appearance.",
  '更接近 Windows 原生磨砂亚克力，背景更透，仅主启动台窗口生效。':
    'Closer to native Windows acrylic with a more translucent backdrop. Applies to the main launchpad window only.',
  '保存主题风格失败：{error}': 'Failed to save theme style: {error}',
  '应用主题风格失败：{error}': 'Failed to apply theme style: {error}',
  简体中文: 'Simplified Chinese',
  打开启动台快捷键: 'Launchpad shortcut',
  打开启动台时默认焦点: 'Default focus when opening Launchpad',
  '选择唤起启动台后，默认把输入焦点放到搜索栏，还是仅显示主界面。':
    'Choose whether Launchpad should focus the search box by default or just open the main surface.',
  搜索栏: 'Search box',
  直接打开: 'Open surface',
  '每次打开启动台后，搜索栏会立即获得焦点，可以直接输入关键词。':
    'Each time Launchpad opens, the search box is focused immediately so you can start typing.',
  '每次打开启动台后，不自动激活搜索栏，只显示当前启动台界面。':
    'Each time Launchpad opens, the search box stays inactive and only the current Launchpad surface is shown.',
  '保存启动台默认焦点失败：{error}': 'Failed to save the default Launchpad focus target: {error}',
  '修改唤起启动台的全局快捷键。录制支持 Ctrl、Alt、Shift；像 Ctrl+Space 这种可能被系统或输入法拦截的组合，可以直接手动输入。':
    'Change the global shortcut used to open the launchpad. Recording supports Ctrl, Alt, and Shift. Shortcuts like Ctrl+Space that may be intercepted by the system or IME can be entered manually.',
  '当前生效：{shortcut}': 'Current: {shortcut}',
  '待保存：{shortcut}': 'Pending: {shortcut}',
  录制中: 'Recording',
  启动台快捷键: 'Launchpad shortcut',
  '可手动输入，例如 Ctrl+Space': 'You can type it manually, for example Ctrl+Space',
  取消录制: 'Cancel recording',
  录制快捷键: 'Record shortcut',
  '保存中...': 'Saving...',
  保存快捷键: 'Save shortcut',
  恢复默认: 'Restore default',
  导入新增项: 'Import new items',
  全量对账: 'Full reconciliation',
  '{source}{mode}完成：扫描 {scanned} 项，新增 {added} 项，删除 {removed} 项，当前快照共 {total} 项。':
    '{source} {mode} completed: scanned {scanned}, added {added}, removed {removed}, total snapshot {total}.',
  '{source}{mode}失败：{error}': '{source} {mode} failed: {error}',
  '{action}完成：{source} 图标影响 {count} 项。':
    '{action} completed: {count} {source} icon item(s) affected.',
  '已选择文件夹，请点击“保存路径”后生效。': 'Folder selected. Click "Save path" to apply it.',
  自定义图标文件夹: 'Custom app folder',
  '选择文件夹失败：{error}': 'Failed to choose folder: {error}',
  '没有可打开的目录，请先选择或输入自定义应用目录。':
    'There is no folder to open. Choose or enter a custom app directory first.',
  '已打开目录：{dir}': 'Opened folder: {dir}',
  '打开目录失败：{error}': 'Failed to open folder: {error}',
  '路径已保存，后续自定义应用同步将使用该目录。':
    'Path saved. Future custom app sync will use this directory.',
  '已恢复使用默认自定义应用目录。': 'Reverted to the default custom app directory.',
  '保存失败：{error}': 'Save failed: {error}',
  '已恢复默认自定义应用目录。': 'Default custom app directory restored.',
  '恢复默认失败：{error}': 'Failed to restore defaults: {error}',
  图标布局重置: 'Reset icon layout',
  '确定要重置图标吗？这会先全量同步桌面和自定义应用，移除已不存在的图标记录，再清空当前宫格排序、文件夹和 Dock 排布。':
    'Reset icons? This first performs a full desktop and custom app sync, removes records for missing icons, then clears the current grid order, folders, and Dock arrangement.',
  '图标布局已重置，主窗口已刷新。': 'Icon layout reset. The main window has been refreshed.',
  '图标布局已重置，主窗口下次同步时会应用。':
    'Icon layout reset. It will apply the next time the main window syncs.',
  '图标已重置并同步，主窗口已刷新。':
    'Icons were reset and synced. The main window has been refreshed.',
  '图标已重置并同步，主窗口下次显示时会应用。':
    'Icons were reset and synced. The next time the main window is shown, the changes will apply.',
  '重置图标失败：{error}': 'Failed to reset icons: {error}',
  确认隐藏图标: 'Confirm hide icon',
  '将隐藏图标”{name}”。隐藏后不会在主页面显示。':
    'Hide icon "{name}". It will no longer appear on the main page.',
  确认隐藏: 'Confirm hide',
  确认取消隐藏图标: 'Confirm unhide icon',
  '将取消隐藏图标”{name}”。取消后图标会重新显示。':
    'Unhide icon "{name}". It will appear on the main page again.',
  确认取消隐藏: 'Confirm unhide',
  确认删除图标记录: 'Confirm delete icon record',
  '将删除图标”{name}”在应用内的记录，不会删除磁盘文件。':
    'Delete the in-app record for icon "{name}". Disk files will not be deleted.',
  确认删除: 'Confirm delete',
  '首次进入主页面会自动建立桌面和自定义应用快照，后续由你在这里手动同步和整理。':
    'The first visit to the main page creates desktop and custom app snapshots automatically. After that, you can sync and organize them here.',
  '日常优先使用“导入新增项”；只有需要清理失效记录时，再执行“全量对账”。':
    'Use "Import new items" for routine work. Use "Full reconciliation" only when invalid records need to be cleaned up.',
  '默认目录：{path}': 'Default path: {path}',
  '加载中...': 'Loading...',
  '当前生效目录：{path}': 'Active path: {path}',
  输入自定义应用文件夹绝对路径: 'Enter the absolute path to the custom app folder',
  选择文件夹: 'Choose folder',
  打开文件夹: 'Open folder',
  保存路径: 'Save path',
  恢复默认路径: 'Restore default path',
  桌面来源: 'Desktop source',
  目录来源: 'Directory source',
  处理中: 'Processing',
  直接执行: 'Run directly',
  需确认: 'Needs confirmation',
  '{label}中...': '{label}...',
  '重置中...': 'Resetting...',
  重置图标: 'Reset icons',
  搜索图标名称或路径: 'Search icon name or path',
  '图标总数 {total} 项，当前筛选结果 {filtered} 项，当前为{viewMode}展示。':
    '{total} icons in total, {filtered} match the current filters, shown in {viewMode} view.',
  列表: 'List',
  宫格: 'Grid',
  '图标列表加载中...': 'Loading icon list...',
  '当前筛选条件下没有图标。': 'No icons match the current filters.',
  桌面: 'Desktop',
  自定义应用: 'Custom apps',
  '路径：{path}': 'Path: {path}',
  '目标：{path}': 'Target: {path}',
  无图标: 'No icon',
  未隐藏: 'Visible',
  未命名: 'Untitled',
  显示: 'Show',
  取消隐藏: 'Unhide',
  桌面图标: 'Desktop icons',
  自定义应用目录: 'Custom app directory',
  '适合把桌面新增或整理后的图标状态同步回应用快照。':
    'Use this to sync newly added or reorganized desktop icon state back into the app snapshot.',
  '适合维护当前配置的自定义应用目录中的图标快照。':
    'Use this to maintain icon snapshots from the currently configured custom app directory.',
  推荐: 'Recommended',
  谨慎: 'Caution',
  '扫描桌面，只补进新增图标，不改动已有快照记录。':
    'Scan the desktop and only import newly added icons without changing existing snapshot records.',
  '适合日常维护，风险最低，可直接执行。':
    'Best for daily maintenance with the lowest risk. Safe to run directly.',
  '重新对照当前桌面状态，补齐缺失项并清理失效记录。':
    'Reconcile with the current desktop state, add missing items, and clean invalid records.',
  '适合批量整理后执行，会更新快照结果，需要二次确认。':
    'Best after a batch cleanup. It updates the snapshot and requires confirmation.',
  确认执行桌面全量对账: 'Confirm full desktop reconciliation',
  '该操作会重新扫描整个桌面，补齐缺失项并清理快照中的失效记录，不会删除磁盘文件。':
    'This rescans the entire desktop, adds missing items, and cleans invalid snapshot records without deleting disk files.',
  确认对账: 'Confirm reconciliation',
  '扫描当前生效目录，只补进新增图标，不改动已有快照记录。':
    'Scan the current active directory and only import new icons without changing existing snapshot records.',
  '适合新增应用后执行，风险最低，可直接执行。':
    'Best after adding new apps with the lowest risk. Safe to run directly.',
  '重新对照当前目录内容，补齐缺失项并清理失效记录。':
    'Reconcile with the current directory contents, add missing items, and clean invalid records.',
  '适合整理目录后执行，会更新快照结果，需要二次确认。':
    'Best after cleaning the directory. It updates the snapshot and requires confirmation.',
  确认执行自定义应用全量对账: 'Confirm full custom app reconciliation',
  '该操作会扫描当前自定义应用目录（仅一级目录），补齐缺失项并清理快照中的失效记录，不会删除磁盘文件。':
    'This scans the current custom app directory (top-level folders only), adds missing items, and cleans invalid snapshot records without deleting disk files.',
  '支持手动输入 `Ctrl+Space`、`Ctrl+Alt+K`、`Alt+Shift+P`。录制模式只识别 `Ctrl / Alt / Shift`。':
    'Manual input supports `Ctrl+Space`, `Ctrl+Alt+K`, and `Alt+Shift+P`. Recording mode only recognizes `Ctrl / Alt / Shift`.',
  '读取系统开机自启状态失败，已回退到本地设置。':
    'Failed to read the system startup setting. Fell back to the local setting.',
  '加载设置失败：{error}': 'Failed to load settings: {error}',
  '已开启开机自启，Windows 登录后会自动启动 DesktopGo。':
    'Launch on startup is enabled. DesktopGo will start automatically after Windows sign-in.',
  '已关闭开机自启，Windows 登录后不会自动启动 DesktopGo。':
    'Launch on startup is disabled. DesktopGo will not start automatically after Windows sign-in.',
  '更新开机自启失败：{error}': 'Failed to update launch on startup: {error}',
  '开始录制快捷键，请按下新的组合键。':
    'Shortcut recording started. Press the new key combination.',
  '未能识别该快捷键。': 'Could not recognize that shortcut.',
  '已捕获 {shortcut}，点击“保存快捷键”后生效。':
    'Captured {shortcut}. Click "Save shortcut" to apply it.',
  '当前已经是默认快捷键：{shortcut}。': 'The current shortcut is already the default: {shortcut}.',
  '已恢复默认值 {shortcut}，点击“保存快捷键”后生效。':
    'Restored the default value {shortcut}. Click "Save shortcut" to apply it.',
  '请输入快捷键，例如 Ctrl+Space 或 Ctrl+Alt+K。':
    'Enter a shortcut such as Ctrl+Space or Ctrl+Alt+K.',
  '启动台快捷键已更新为 {shortcut}。': 'Launchpad shortcut updated to {shortcut}.',
  '保存快捷键失败：{error}': 'Failed to save shortcut: {error}',
  请按下新的组合键: 'Press a new key combination',
  未设置: 'Not set',
  '快捷键至少需要一个修饰键，例如 Ctrl + Space。':
    'A shortcut needs at least one modifier key, such as Ctrl + Space.',
  '请在按住修饰键后，再按一个主键，例如 Space、K 或 F1。':
    'Hold a modifier key, then press a main key such as Space, K, or F1.',
  '读取应用信息失败：{error}': 'Failed to load app information: {error}',
  '部分应用信息未能读取，已使用当前项目的回退值。':
    'Some app information could not be read. Fallback values are being used.',
  '全局快捷键 {shortcut}': 'Global shortcut {shortcut}',
  全局快捷键可自定义: 'Global shortcut can be customized',
  '已打开{label}。': 'Opened {label}.',
  '打开{label}失败：{error}': 'Failed to open {label}: {error}',
  '当前环境不支持复制诊断信息。':
    'Copying diagnostic information is not supported in the current environment.',
  '已复制版本与诊断信息。': 'Version and diagnostic information copied.',
  '复制诊断信息失败：{error}': 'Failed to copy diagnostic information: {error}',
  启动台: 'Launchpad',
  '用统一入口承接桌面常用应用，适合键盘优先和快速唤起场景。':
    'A unified entry point for frequently used desktop apps, designed for keyboard-first and quick-launch workflows.',
  文件搜索: 'File Search',
  '搜索能力依赖已安装的 Everything，状态异常时会在设置页明确提示。':
    'Search depends on an installed Everything runtime and shows clear status feedback in Settings when something is wrong.',
  '支持桌面与自定义应用两套来源的增量与全量同步，并保留隐藏与整理能力。':
    'Supports both incremental and full sync for desktop and custom app sources, while preserving hide and organization capabilities.',
  '桌面 + 自定义应用': 'Desktop + custom apps',
  应用更新: 'App Updates',
  '更新页读取 GitHub Releases 的 updater 清单，下载与安装过程可见。':
    'The update page reads the updater manifest from GitHub Releases, with visible download and install progress.',
  '桌面启动、搜索与整理工具': 'Desktop launching, search, and organization tool',
  'DesktopGo 把桌面启动、文件搜索、图标整理和应用更新收进一个统一入口里。关于页现在直接暴露版本、运行时和项目入口，方便你确认当前构建、提交反馈，或跳转查看发布记录。':
    'DesktopGo brings desktop launching, file search, icon organization, and app updates into one entry point. The About page now exposes the version, runtime, and project links directly so you can verify the current build, send feedback, or jump to release notes.',
  本地优先: 'Local-first',
  '没有账号系统；主要设置、布局和搜索配置都保存在本地环境。':
    'There is no account system. Core settings, layout, and search configuration stay on the local machine.',
  支持入口: 'Support',
  反馈直达项目: 'Direct project feedback',
  '仓库、Issue 和 Release 入口都放在这里，定位问题时不需要再找路径。':
    'Repository, issues, and release links are collected here so you do not need to hunt for them while troubleshooting.',
  功能概览: 'Feature overview',
  当前构建包含的核心能力: 'Core capabilities in the current build',
  项目入口: 'Project links',
  '仓库、发布和反馈入口': 'Repository, release, and feedback links',
  'GitHub 仓库': 'GitHub repository',
  问题反馈: 'Issue tracker',
  提交问题: 'Submit issue',
  发布说明: 'Release notes',
  已复制: 'Copied',
  复制诊断: 'Copy diagnostics',
  更新通道: 'Update channel',
  '当前 updater 设计为从 GitHub Releases 读取 latest.json 并完成签名校验与安装流程。':
    'The updater is currently designed to read `latest.json` from GitHub Releases and complete signature verification and installation.',
  诊断建议: 'Diagnostic guidance',
  '提交问题前先复制上面的诊断信息，至少带上版本号、应用标识符和 Tauri 运行时版本。':
    'Before reporting an issue, copy the diagnostic information above and include at least the version, app identifier, and Tauri runtime version.',
  项目主页: 'Project homepage',
  最小化: 'Minimize',
  还原窗口: 'Restore window',
  最大化: 'Maximize',
  关闭: 'Close',
  '设置 / {label}': 'Settings / {label}',
  图标: 'Icons',
  系统文件: 'System files',
  常用排序: 'Common',
  元数据: 'Metadata',
  历史记录: 'History',
  开: 'On',
  关: 'Off',
  搜索排序: 'Search sorting',
  搜索选项: 'Search options',
  匹配选项: 'Match options',
  区分大小写: 'Case sensitive',
  全字匹配: 'Whole word',
  匹配路径: 'Match path',
  正则表达式: 'Regular expression',
  隐藏预览: 'Hide preview',
  显示预览: 'Show preview',
  '开始输入即可搜索，最近搜索会显示在这里。':
    'Start typing to search. Recent searches will appear here.',
  最近搜索: 'Recent searches',
  '可恢复之前搜索的关键词、筛选器、匹配选项和排序方式。':
    'Restore a previous keyword, filter, match options, and sorting mode.',
  清空: 'Clear',
  正则: 'Regex',
  删除: 'Delete',
  文件夹: 'Folder',
  不可用: 'Unavailable',
  '选择一个结果后，可在这里查看预览。': 'Select a result to preview it here.',
  '正在加载预览...': 'Loading preview...',
  '大小：{value}': 'Size: {value}',
  '修改时间：{value}': 'Modified: {value}',
  '类型：{value}': 'Type: {value}',
  未知: 'Unknown',
  文本预览: 'Text preview',
  '没有可用的文本预览。': 'No text preview available.',
  '为保证加载速度，预览内容已截断。': 'Preview content has been truncated to keep loading fast.',
  文件夹预览: 'Folder preview',
  暂无内联预览: 'No inline preview available',
  '没有匹配的图标。': 'No matching icons.',
  '输入关键词以搜索桌面图标。': 'Enter a keyword to search desktop icons.',
  '搜索中...': 'Searching...',
  没有结果: 'No results',
  '正在加载更多...': 'Loading more...',
  调整预览宽度: 'Resize preview',
  '搜索文件、文件夹和应用...': 'Search files, folders, and apps...',
  '搜索桌面图标...': 'Search desktop icons...',
  搜索文件: 'Search files',
  搜索桌面图标: 'Search desktop icons',
  '拖入导入失败：{error}': 'Failed to import dropped items: {error}',
  '导入完成：新增 {imported} 项，重复 {duplicate} 项，无效 {invalid} 项。':
    'Import completed: added {imported}, duplicates {duplicate}, invalid {invalid}.',
  '正在导入...': 'Importing...',
  松开即可导入: 'Release to import',
  '支持拖入快捷方式、程序、文件夹和普通文件，内容会保存到当前自定义应用目录。':
    'Shortcuts, apps, folders, and files are supported. Imported items are saved to the current custom app directory.',
  '已选择：{count}': 'Selected: {count}',
  隐藏: 'Hide',
  取消: 'Cancel',
  编辑图标: 'Edit icons',
  '确定要删除已选中的 {count} 个图标吗？此操作无法撤销。':
    'Delete the {count} selected icons? This action cannot be undone.',
  打开: 'Open',
  '移出 Dock': 'Remove from Dock',
  全部: 'All',
  文件: 'Files',
  音频: 'Audio',
  压缩包: 'Compressed',
  文档: 'Documents',
  程序: 'Executables',
  图片: 'Pictures',
  视频: 'Videos',
  '名称 升序': 'Name ascending',
  '名称 降序': 'Name descending',
  '路径 升序': 'Path ascending',
  '路径 降序': 'Path descending',
  '大小 升序': 'Size ascending',
  '大小 降序': 'Size descending',
  '扩展名 升序': 'Extension ascending',
  '扩展名 降序': 'Extension descending',
  '类型 升序': 'Type ascending',
  '类型 降序': 'Type descending',
  '创建时间 升序': 'Created ascending',
  '创建时间 降序': 'Created descending',
  '修改时间 升序': 'Modified ascending',
  '修改时间 降序': 'Modified descending',
  '属性 升序': 'Attributes ascending',
  '属性 降序': 'Attributes descending',
  '列表文件名 升序': 'List filename ascending',
  '列表文件名 降序': 'List filename descending',
  '运行次数 升序': 'Run count ascending',
  '运行次数 降序': 'Run count descending',
  '最近变更时间 升序': 'Recently changed ascending',
  '最近变更时间 降序': 'Recently changed descending',
  '访问时间 升序': 'Accessed ascending',
  '访问时间 降序': 'Accessed descending',
  '运行时间 升序': 'Run time ascending',
  '运行时间 降序': 'Run time descending',
  '未找到已安装的 Everything。请通过 DesktopGo 安装程序完成安装。':
    'Installed Everything was not found. Please install it through the DesktopGo installer.',
  'DesktopGo 的 Everything 组件不可用。请重新安装 DesktopGo。':
    'DesktopGo Everything components are unavailable. Please reinstall DesktopGo.',
  'DesktopGo 无法连接正在运行的 Everything。请确认 Everything 已启动，并且两个应用使用相同的权限级别。':
    'DesktopGo cannot connect to the running Everything instance. Make sure Everything is running and both apps use the same privilege level.',
  'DesktopGo 正在等待上一个 Everything IPC 请求完成。':
    'DesktopGo is waiting for the previous Everything IPC request to finish.',
  'DesktopGo 在准备 Everything 时超时，请重试搜索。':
    'DesktopGo timed out while preparing Everything. Please try the search again.',
  '加载搜索设置失败：{error}': 'Failed to load search settings: {error}',
  搜索设置: 'Search settings',
  '搜索设置已保存。': 'Search settings saved.',
  '保存设置失败：{error}': 'Failed to save settings: {error}',
  '默认设置已恢复。': 'Default settings restored.',
  '恢复默认设置失败：{error}': 'Failed to restore default settings: {error}',
  '正在加载搜索设置...': 'Loading search settings...',
  '设置会保存到 SQLite，并在下次搜索时生效。':
    'Settings are saved to SQLite and will take effect in the next search.',
  '恢复中...': 'Restoring...',
  基础交互: 'Basic interaction',
  实时搜索: 'Live search',
  '输入时立即搜索。关闭后仅在按下 Enter 时触发搜索。':
    'Search while typing. If disabled, search only runs when you press Enter.',
  自动选中首个结果: 'Auto-select first result',
  '返回新结果页时，自动聚焦到第一个结果。':
    'Automatically focus the first result when a new result page arrives.',
  回车打开结果: 'Press Enter to open',
  '允许按 Enter 打开当前选中的结果。': 'Allow Enter to open the currently selected result.',
  双击打开结果: 'Double-click to open',
  '允许通过鼠标双击打开结果项。': 'Allow mouse double-click to open a result item.',
  防抖时间: 'Debounce',
  '允许范围：50 - 500 毫秒。': 'Allowed range: 50 - 500 ms.',
  搜索策略: 'Search strategy',
  默认筛选器: 'Default filter',
  默认排序: 'Default sort',
  每页最大结果数: 'Max results per page',
  '允许范围：10 - 200。': 'Allowed range: 10 - 200.',
  记住上次筛选器: 'Remember last filter',
  '保存最近一次使用的筛选器，并在下次启动时恢复。':
    'Save the last used filter and restore it on the next launch.',
  匹配与筛选: 'Matching and filtering',
  '让关键字匹配包含完整路径片段。': 'Allow keywords to match parts of the full path.',
  '使用区分大小写的匹配方式。': 'Use case-sensitive matching.',
  '将关键字按正则表达式语法处理。': 'Treat the keyword as a regular expression.',
  '只匹配完整单词。': 'Match whole words only.',
  运行时: 'Runtime',
  自动连接运行时: 'Auto-connect runtime',
  '自动检测并连接已安装的 Everything 运行时。':
    'Automatically detect and connect to an installed Everything runtime.',
  '仅支持已安装的 Everything': 'Installed Everything only',
  'DesktopGo 的文件搜索目前仅支持已安装的 Everything 应用。':
    'DesktopGo file search currently supports installed Everything only.',
  '如果搜索不可用，请重新安装 DesktopGo，并勾选 Everything 安装选项。':
    'If search is unavailable, reinstall DesktopGo and enable the Everything install option.',
  未知大小: 'Unknown size',
  '更新配置已刷新。': 'Updater configuration refreshed.',
  '读取更新配置失败：{error}': 'Failed to read updater configuration: {error}',
  '安装程序即将接管，应用会自动退出。':
    'The installer will take over shortly and the app will exit automatically.',
  '更新安装流程已完成。请重新打开应用确认版本。':
    'The update installation flow is complete. Reopen the app to confirm the version.',
  '更新安装失败。': 'Update installation failed.',
  '发现新版本 v{version}，可以开始下载安装。':
    'A new version v{version} is available and ready to download and install.',
  '当前已是最新版本。': 'You are already on the latest version.',
  '检查更新失败：{error}': 'Failed to check for updates: {error}',
  '下载安装更新失败：{error}': 'Failed to download and install the update: {error}',
  '当前版本 v{version}，当前目标 {target}': 'Current version v{version}, target {target}',
  更新已接入: 'Updater ready',
  等待配置: 'Awaiting configuration',
  检查更新: 'Check for updates',
  下载并安装: 'Download and install',
  刷新配置: 'Refresh config',
  当前状态: 'Current status',
  '更新能力已接入。检查结果会显示在右下角，下载安装时会在下方展示进度。':
    'Updater support is configured. Check results appear at the bottom right, and download and install progress appears below.',
  '当前尚未接入 updater 配置，检查更新与安装功能暂时不可用。':
    'Updater configuration is not ready yet, so update checking and installation are temporarily unavailable.',
  '还缺少 updater 配置。请在 src-tauri/tauri.conf.json 中设置 plugins.updater.pubkey 和 plugins.updater.endpoints。正式发布时还需要 TAURI_SIGNING_PRIVATE_KEY 用于生成签名更新包。':
    'Updater configuration is still missing. Set `plugins.updater.pubkey` and `plugins.updater.endpoints` in `src-tauri/tauri.conf.json`. For production releases you also need `TAURI_SIGNING_PRIVATE_KEY` to generate signed update packages.',
  安装进度: 'Install progress',
  正在下载更新包: 'Downloading update package',
  正在启动安装程序: 'Launching installer',
  更新安装流程已完成: 'Update installation flow completed',
  '已准备下载 {size}': 'Ready to download {size}',
  '正在等待安装程序返回下载信息...': 'Waiting for the installer to report download information...',
  '已下载 {downloaded} / {total} ({percent}%)': 'Downloaded {downloaded} / {total} ({percent}%)',
  '检测到新版本 v{version}': 'Detected new version v{version}',
  '基于目标 {target}{dateSuffix}': 'Target {target}{dateSuffix}',
  '，发布时间 {date}': ', released {date}',
  '当前更新没有附带发布说明。': 'This update does not include release notes.',
  'AI 助手': 'AI Assistant',
  'AI 智能整理': 'AI Smart Organize',
  '打开 AI 整理': 'Open AI organize',
  '收起 AI 整理': 'Collapse AI organize',
  'AI 整理模式': 'AI organize mode',
  '正在生成整理预览，右侧侧栏可查看过程。':
    'Generating an organization preview. Watch the process in the sidebar.',
  '从右侧选择预设或输入要求开始整理。':
    'Choose a preset or type a request in the sidebar to start organizing.',
  '预览已生成，可保存或不保存退出。': 'Preview is ready. Save it or exit without saving.',
  '正在保存 AI 预览...': 'Saving AI preview...',
  展开侧栏: 'Expand sidebar',
  收起侧栏: 'Collapse sidebar',
  保存预览: 'Save preview',
  不保存退出: 'Exit without saving',
  '由 AI 按用途分组，预览确认后再应用。':
    'AI groups icons by purpose. Preview and confirm before applying.',
  'AI 正在分析图标...': 'AI is analyzing icons...',
  'AI Agent 正在准备图标清单': 'AI Agent is preparing the icon list',
  已读取历史整理偏好: 'Loaded previous organization preferences',
  正在请求模型生成草稿: 'Asking the model to draft groups',
  模型正在流式生成草稿: 'Model is streaming the draft',
  模型输出正在写入预览: 'Writing model output into the preview',
  模型正在规划整理策略: 'Model is planning the organization strategy',
  模型请求已发出: 'Model request sent',
  正在校验整理结果: 'Validating organization results',
  工具调用已完成: 'Tool call completed',
  模型用量已返回: 'Model usage returned',
  整理草稿已生成: 'Organization draft generated',
  整理草稿已保存: 'Organization draft saved',
  流式请求已降级重试: 'Streaming request fell back to a normal retry',
  '请求失败，正在降级重试': 'Request failed; retrying with a fallback',
  运行过程中出现问题: 'A problem occurred during the run',
  'AI Agent 请求失败': 'AI Agent request failed',
  'AI Agent 请求失败。': 'AI Agent request failed.',
  '模型请求失败。': 'Model request failed.',
  '严格 JSON 请求失败，正在去掉 response_format 重试。':
    'Strict JSON request failed; retrying without response_format.',
  '严格 JSON 流式请求失败，正在使用宽松 JSON 流式请求重试。':
    'Strict JSON streaming request failed; retrying with relaxed JSON streaming.',
  'Responses API 流式请求失败，正在降级为 Chat Completions 流式请求。':
    'Responses API streaming failed; falling back to Chat Completions streaming.',
  'AI 配置校验失败。': 'AI configuration validation failed.',
  '读取 AI 上下文失败。': 'Failed to load AI context.',
  '构建 AI 请求内容失败。': 'Failed to build the AI request payload.',
  'AI 返回格式无法解析。': 'Could not parse the AI response format.',
  上下文记录遇到问题: 'Context recording hit a problem',
  'AI Agent 已完成分析': 'AI Agent finished analysis',
  失败: 'Failed',
  成功: 'Succeeded',
  待配置: 'Needs config',
  无可用分组: 'No usable groups',
  应用中: 'Applying',
  进行中: 'Running',
  '耗时 {time}': 'Elapsed {time}',
  '正在准备 AI 请求': 'Preparing AI request',
  请求成功: 'Request succeeded',
  请求失败: 'Request failed',
  'AI 配置不完整': 'AI config incomplete',
  没有可用分组: 'No usable groups',
  正在应用整理结果: 'Applying organization result',
  等待开始: 'Waiting to start',
  '请求正在进行，窗口保持打开即可继续接收状态。':
    'The request is running; keep this window open to receive status updates.',
  '模型输出正在实时写入下方预览。':
    'Model output is being written to the preview below in real time.',
  '正在接收模型的原始 JSON 流，分组预览会在解析成功后出现。':
    'Receiving the model raw JSON stream. The group preview appears after parsing succeeds.',
  '请求成功，已生成 {count} 个可预览分组。':
    'Request succeeded. Generated {count} group(s) for preview.',
  '请求没有完成，请检查模型配置或网关日志。':
    'The request did not finish. Check the model configuration or gateway logs.',
  '请求完成，但没有生成可用分组。': 'The request completed, but produced no usable groups.',
  '正在写入桌面布局并刷新启动台。': 'Writing the desktop layout and refreshing the launchpad.',
  '等待 AI Agent 开始处理。': 'Waiting for the AI Agent to start.',
  'Agent 处理过程': 'Agent trace',
  '等待 Agent 开始处理...': 'Waiting for Agent to start...',
  模型输出: 'Model output',
  '等待模型输出...': 'Waiting for model output...',
  模型输出片段: 'Model output excerpt',
  '输入 {input} / 输出 {output}': 'Input {input} / output {output}',
  原始模型输出: 'Raw model output',
  '等待原始模型输出...': 'Waiting for raw model output...',
  接收中: 'Receiving',
  '正在等待首段模型输出...': 'Waiting for the first model output chunk...',
  按用途整理: 'Organize by use',
  '生成稳定、克制的常用分类。': 'Create stable, restrained common categories.',
  工作优先: 'Work first',
  '先收拢开发、办公、设计和系统工具。':
    'Group development, office, design, and system tools first.',
  精简分组: 'Compact groups',
  '只保留确定的大类，避免过度整理。': 'Keep only confident broad groups and avoid over-organizing.',
  调整当前预览: 'Refine preview',
  '参考已有预览继续优化。': 'Continue improving from the current preview.',
  新的整理对话: 'New organize chat',
  '正在根据你的要求生成新的整理预览...':
    'Generating a new organization preview from your request...',
  'AI 配置不完整，请先到设置页填写接口地址、密钥和模型。':
    'AI config is incomplete. Fill in the endpoint, API key, and model in Settings first.',
  '没有生成可用分组。': 'No usable groups were generated.',
  '没有可整理的图标。': 'There are no icons to organize.',
  '当前没有可整理的图标。': 'There are currently no icons to organize.',
  '这次没有生成可用分组，可以换一个要求继续调整。':
    'This run did not generate usable groups. Try a different request.',
  '已生成 {count} 个分组，可在下方预览并继续调整。':
    'Generated {count} group(s). Preview them below or continue refining.',
  '这次请求失败了，可以调整要求后重试。': 'This request failed. Adjust your request and try again.',
  '会话保存失败：{error}': 'Failed to save the conversation: {error}',
  会话历史: 'Conversation history',
  新对话: 'New chat',
  '正在加载会话...': 'Loading conversations...',
  '还没有保存的整理对话。': 'No saved organization chats yet.',
  '{count} 版': '{count} version(s)',
  选择预设或输入要求开始整理: 'Choose a preset or type a request to start',
  '你可以先生成一版布局，再继续对话要求 AI 调整。':
    'Generate a first layout, then keep chatting to refine it.',
  '第 {index} 版': 'Version {index}',
  布局预览: 'Layout preview',
  '正在等待新的布局预览...': 'Waiting for the new layout preview...',
  '发送一个要求，AI 会生成可保存的布局预览。':
    'Send a request and AI will generate a saveable layout preview.',
  '输入整理要求，Ctrl+Enter 发送': 'Type an organization request, Ctrl+Enter to send',
  输入整理要求: 'Organization request',
  发送: 'Send',
  运行诊断: 'Run diagnostics',
  '输入 {count}': 'Input {count}',
  '输出 {count}': 'Output {count}',
  '缓存 {count}': 'Cached {count}',
  '尚未配置 AI 模型。': 'No AI model configured yet.',
  '请先到「设置 → AI 助手」填写接口地址、密钥和模型。':
    'Go to Settings → AI Assistant to set the endpoint, API key, and model first.',
  重试: 'Retry',
  'AI 没有给出可用的分组建议。': 'AI did not return any usable grouping suggestions.',
  分组名称: 'Group name',
  解散: 'Disband',
  移出分组: 'Remove from group',
  '不足 2 个图标，应用时会被忽略。': 'Fewer than 2 icons; this group will be ignored when applied.',
  '将新建 {count} 个分组文件夹。': 'Will create {count} group folder(s).',
  '应用中...': 'Applying...',
  应用整理: 'Apply organization',
  '没有可应用的分组。': 'No groups available to apply.',
  '已应用 AI 整理：新建 {count} 个分组文件夹。':
    'AI organization applied: {count} group folder(s) created.',
  '配置一个兼容 OpenAI 接口的模型，之后可在启动台右键菜单使用「AI 智能整理」，让 AI 按用途把图标归类到文件夹。':
    'Configure an OpenAI-compatible model, then use "AI Smart Organize" from the launchpad right-click menu to let AI sort icons into folders by purpose.',
  模型接入配置: 'Model connection',
  '支持任意兼容 OpenAI Chat Completions 的服务，例如 OpenAI、DeepSeek、Moonshot 或本地 Ollama。':
    'Works with any OpenAI Chat Completions-compatible service such as OpenAI, DeepSeek, Moonshot, or local Ollama.',
  '接口地址（Base URL）': 'Endpoint (Base URL)',
  模型名称: 'Model name',
  '自定义分类提示词（可选）': 'Custom classification prompt (optional)',
  '例如：把所有游戏单独归到「游戏」文件夹。':
    'For example: put all games into a dedicated "Games" folder.',
  保存配置: 'Save config',
  测试连接: 'Test connection',
  '测试中...': 'Testing...',
  'AI 配置已保存。': 'AI config saved.',
  '加载 AI 配置失败：{error}': 'Failed to load AI config: {error}',
  '保存 AI 配置失败：{error}': 'Failed to save AI config: {error}',
  '请先填写接口地址、API Key 和模型名称。': 'Fill in the endpoint, API key, and model name first.',
  '连接成功，AI 配置可用。': 'Connected. The AI config is working.',
  '连接失败：{error}': 'Connection failed: {error}',
  安全提示: 'Security notice',
  'API Key 以明文保存在本地配置文件中，请勿在不信任的设备上填写。整理时仅向模型发送图标名称、目标程序名和类型，不会上传完整文件路径。':
    'The API key is stored in plain text in a local config file; do not enter it on untrusted devices. Only icon names, target program names, and types are sent to the model—never full file paths.',
  '调用已配置的 AI 模型，按用途把图标归类到文件夹。会先弹出预览，确认后再写入主窗口布局。':
    'Use the configured AI model to sort icons into folders by purpose. A preview appears first; the main window layout is updated only after you confirm.',
  '开始 AI 整理': 'Start AI organize',
}

const MESSAGES: Record<AppLanguage, Record<string, string>> = {
  zh: ZH_MESSAGES,
  en: EN_MESSAGES,
}

const I18nContext = createContext<I18nContextValue | null>(null)
const LANGUAGE_CHANGED_EVENT = 'desktopgo://language-changed'

let currentLanguage: AppLanguage = 'zh'

type LanguageChangedPayload = {
  language: AppLanguage
}

function setActiveLanguage(language: AppLanguage) {
  currentLanguage = language
}

function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'zh' || value === 'en'
}

function formatMessage(template: string, params?: TranslationParams) {
  if (!params) {
    return template
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key]
    return value === null || value === undefined ? '' : String(value)
  })
}

export function getIntlLocale(language: AppLanguage = currentLanguage) {
  return language === 'zh' ? 'zh-CN' : 'en-US'
}

export function getCurrentLanguage() {
  return currentLanguage
}

export function translate(
  message: string,
  params?: TranslationParams,
  language: AppLanguage = currentLanguage
) {
  const translated = MESSAGES[language][message] ?? message
  return formatMessage(translated, params)
}

function syncDocumentLanguage(language: AppLanguage) {
  setActiveLanguage(language)
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('zh')
  const [ready, setReady] = useState(false)

  const applyLanguageState = useCallback((nextLanguage: AppLanguage) => {
    setActiveLanguage(nextLanguage)
    setLanguageState(current => (current === nextLanguage ? current : nextLanguage))
  }, [])

  setActiveLanguage(language)

  useEffect(() => {
    let disposed = false

    void getSetting('language')
      .then(savedLanguage => {
        if (disposed) return
        applyLanguageState(savedLanguage)
      })
      .catch(error => {
        console.error('Failed to load app language:', error)
      })
      .finally(() => {
        if (!disposed) {
          setReady(true)
        }
      })

    return () => {
      disposed = true
    }
  }, [applyLanguageState])

  useEffect(() => {
    let disposed = false
    let detachLanguageListener: (() => void) | null = null

    const syncSavedLanguage = async () => {
      try {
        const savedLanguage = await getSetting('language')
        if (!disposed) {
          applyLanguageState(savedLanguage)
        }
      } catch (error) {
        console.error('Failed to sync app language:', error)
      }
    }

    void listen<LanguageChangedPayload>(LANGUAGE_CHANGED_EVENT, event => {
      if (disposed || !isAppLanguage(event.payload?.language)) {
        return
      }

      applyLanguageState(event.payload.language)
    })
      .then(unlisten => {
        if (disposed) {
          unlisten()
          return
        }

        detachLanguageListener = unlisten
      })
      .catch(error => {
        console.error('Failed to listen for language changes:', error)
      })

    const handleFocus = () => {
      void syncSavedLanguage()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      detachLanguageListener?.()
    }
  }, [applyLanguageState])

  useEffect(() => {
    syncDocumentLanguage(language)
  }, [language])

  const setLanguage = useCallback(
    async (nextLanguage: AppLanguage) => {
      applyLanguageState(nextLanguage)
      try {
        await setSetting('language', nextLanguage)
      } catch (error) {
        console.error('Failed to persist app language:', error)
      }

      try {
        await emit<LanguageChangedPayload>(LANGUAGE_CHANGED_EVENT, { language: nextLanguage })
      } catch (error) {
        console.error('Failed to broadcast app language change:', error)
      }
    },
    [applyLanguageState]
  )

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      locale: getIntlLocale(language),
      ready,
      setLanguage,
      t: (message, params) => translate(message, params, language),
    }),
    [language, ready, setLanguage]
  )

  return <I18nContext.Provider value={value}>{ready ? children : null}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }

  return context
}
