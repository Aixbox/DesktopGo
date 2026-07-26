export const EN_SEARCH_MESSAGES: Record<string, string> = {
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
  '搜索设置会持久保存，并在后续搜索中生效。':
    'Search settings are saved and applied to subsequent searches.',
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
  快捷入口排序: 'Shortcut ranking',
  使用启动记录优化排序: 'Use launch history to improve ranking',
  '记录从搜索结果打开快捷入口的次数和最近启动时间；数据仅保存在本机。':
    'Record launch counts and recent launch times for shortcuts opened from search results. Data stays on this device.',
  快捷入口使用数据: 'Shortcut usage data',
  '关闭后会停止记录并忽略已有数据，重新开启后可以继续使用。':
    'When disabled, recording stops and existing data is ignored. Re-enable it to continue using that data.',
  '已记录 {count} 个快捷入口。': '{count} shortcuts recorded.',
  清空使用数据: 'Clear usage data',
  '清空中...': 'Clearing...',
  '加载快捷入口使用数据失败，请重试。': 'Could not load shortcut usage data. Please try again.',
  '快捷入口排序偏好已保存。': 'Shortcut ranking preference saved.',
  '保存快捷入口排序偏好失败，请重试。':
    'Could not save the shortcut ranking preference. Please try again.',
  '快捷入口使用数据已清空。': 'Shortcut usage data cleared.',
  '清空快捷入口使用数据失败，请重试。': 'Could not clear shortcut usage data. Please try again.',
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
}
