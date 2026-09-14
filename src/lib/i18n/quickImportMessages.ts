/** 「快捷导入」界面与提示的英文文案。中文即键，见 i18n.tsx。 */
export const EN_QUICK_IMPORT_MESSAGES: Record<string, string> = {
  快捷导入: 'Quick import',
  快捷导入应用: 'Quick import apps',
  '还可以一键扫描已安装的应用，批量导入常用软件。':
    'You can also scan installed apps and import the ones you use in bulk.',
  '扫描桌面、开始菜单等位置的已安装应用，勾选后批量导入图标库。':
    'Scan installed apps from the desktop, Start menu, and more, then import them in bulk.',
  '正在扫描已安装的应用...': 'Scanning installed apps...',
  '扫描范围：桌面、开始菜单、快速启动和注册表。':
    'Sources: desktop, Start menu, Quick Launch, and the registry.',
  '扫描失败，请重试。': 'Scan failed. Please try again.',
  未发现可导入的应用: 'No importable apps found',
  '没有找到可用的应用快捷方式，可以手动添加图标。':
    'No usable app shortcuts were found. You can add icons manually.',
  重新扫描: 'Rescan',
  '共发现 {total} 个应用，已选择 {selected} 个。': 'Found {total} apps; {selected} selected.',
  新应用: 'New apps',
  可能重复: 'Possible duplicates',
  一定重复: 'Exact duplicates',
  已导入: 'Imported',
  '与图标库中的应用重名但目标不同，请确认后再导入。':
    'Same name as an existing icon but a different target. Double-check before importing.',
  '已在图标库中，默认不导入。': 'Already in the icon library; unchecked by default.',
  '导入失败，请检查应用是否仍可访问后重试。':
    'Import failed. Check that the apps are still accessible and try again.',
  开始菜单: 'Start menu',
  公共开始菜单: 'Common Start menu',
  公共桌面: 'Public desktop',
  快速启动: 'Quick Launch',
  注册表: 'Registry',
}
