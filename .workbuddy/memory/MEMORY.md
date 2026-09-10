# DesktopGo 项目长期备忘

## WebView2 透明窗口 + backdrop-filter = 整窗撕裂（已修复，勿回退）

- 根因：透明窗口（`WS_EX_NOREDIRECTIONBITMAP` + DWM 重定向）上，每个 `backdrop-filter` 元素都是一个 backdrop root，合成器需做"背景读回"；侧栏玻璃 + 搜索输入玻璃 + 搜索面板同时在场时读回链路损坏 WebView2 合成状态 → 随机整窗撕裂（侧栏消失、灰条、样式崩坏）。GPU 与软件合成路径均复现，与显卡/驱动无关。
- 修复（2026-09-10）：`.launchpad-scroll-layout` 子树内一刀切禁用 `backdrop-filter`（`globals.css`，`!important` 压过所有主题变体）；另清理了常驻合成层来源（图标表面 will-change/drop-shadow、folder-drop idle 态 blur(0)、搜索面板与 Dock 滚动条 will-change）。
- 约定：**给 scroll 布局新增玻璃/毛玻璃元素时不要再加 backdrop-filter**；分页布局与设置窗口不受此限制，可正常用毛玻璃。若要恢复玻璃感，方向是预模糊背景伪造，而不是直接加回 backdrop-filter。
