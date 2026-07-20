# WeTab 图标网格与拖拽系统研究

研究日期：2026-07-20  
目标站点：`https://web.wetab.link/`  
线上版本：`2.2.46`

## 1. 研究范围与证据等级

本报告基于以下材料：

- 线上实际下发的 HTML、CSS、Webpack runtime 和当前主页功能 chunk。
- 格式化后的 Vue 3 运行时、Pinia store、RxJS 拖拽管线及主页组件模块。
- 浏览器中真实 DOM 的元素尺寸、网格占位、dataset 和节点层级。

线上没有公开 source map，`f855201f.js.map` 返回 404。因此本文区分：

- **源码确认**：可以直接在部署代码中定位到的行为。
- **运行时确认**：在真实 DOM 中测量到的行为。
- **实现推断**：由多个源码分支共同推出，但没有原始 TypeScript/Vue 文件名佐证的行为。

研究材料保存在 `.codex/wetab-research/`，不应作为产品源码提交或复制进项目。

## 2. 核心结论

WeTab 顺滑的主要原因不是避免所有布局读取，而是把工作拆成三条不同频率的链路：

1. 拖动副本跟手：每个动画帧只移动一个克隆 DOM，不修改业务数组。
2. 命中检测：桌面端约每 40ms 执行一次，触屏约每 50ms 执行一次。
3. 数据重排：进入新排序区后等待 100ms，再锁定 200ms，避免连续反复提交。

真正发生数组变化时，Vue `TransitionGroup` 才批量读取旧/新 DOMRect，并执行标准 FLIP。其移动样式为：

```css
.list-enter-active,
.list-leave-active,
.list-move {
  transition: transform 0.3s ease;
}
```

与 DesktopGo 当前实现相比，最大的架构差异是 WeTab 没有在每个鼠标移动事件里让所有可排序图标组件订阅拖拽上下文并重新渲染。

## 3. 技术组成

- Vue 3 keyed render 和 `TransitionGroup`。
- Pinia 风格 store，图标数据写入 IndexedDB；Web 扩展环境另有 `chrome.storage.local` 分支。
- RxJS 事件流负责鼠标和触屏拖动。
- BetterScroll 风格实例负责文件夹内部滚动。
- CSS Grid `grid-auto-flow: row dense` 负责混合尺寸紧密填充。

入口运行时和持久化实现见：

- `.codex/wetab-research/hitab-54807b7f.js`
- `.codex/wetab-research/chunks/179-f855201f.js:53545`

## 4. 图标尺寸与占位模型

### 4.1 全局图标视觉尺寸

全局提供三档图标尺寸：

| 模式        | 图标边长 | 圆角 | 默认水平槽宽 |
| ----------- | -------: | ---: | -----------: |
| 大 `icon-l` |     88px | 24px |        148px |
| 中 `icon-m` |     72px | 20px |        132px |
| 小 `icon-s` |     60px | 16px |        120px |

默认水平槽宽等于 `--icon-size + 60px`。移动端会减少或取消水平 gap。

尺寸 CSS 见 `.codex/wetab-research/css/5550-c956af08.css:1474`，主页变量见 `.codex/wetab-research/css/main-ad67f8e8.css:683`。

### 4.2 响应式选择

自动尺寸断点：

- 宽度至少 1440px：`icon-l`。
- 宽度不超过 1024px：`icon-s`。
- 中间宽度：`icon-m`。
- 不超过 720px：内部标记为 `icon-xs`，视觉回退到 `icon-s`。

用户也可以关闭自动模式，固定选择大、中、小。默认设置为 `icon-s`。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:57757` 和 `:54953`。

### 4.3 业务元素占位

WeTab 将所有主页元素映射到统一基础网格：

| 类型     | 业务尺寸 | 占用列 x 行 |
| -------- | -------- | ----------- |
| 网站图标 | `mini`   | 1 x 1       |
| 文件夹   | `mini`   | 1 x 1       |
| 文件夹   | `medium` | 2 x 2       |
| 小组件   | `s`      | 2 x 1       |
| 小组件   | `m`      | 2 x 2       |
| 小组件   | `l`      | 4 x 2       |

映射见 `.codex/wetab-research/chunks/179-f855201f.js:41636`。

运行时在当前 `icon-s` 模式下确认：基础单元为 120 x 120px；`s` 小组件为 240 x 120px，`m` 小组件和大文件夹为 240 x 240px，`l` 小组件为 480 x 240px。

### 4.4 图标避让与空洞填充

主页使用：

```css
display: grid;
grid-auto-flow: row dense;
grid-template-columns: repeat(auto-fill, var(--icon-width-full));
```

每个节点通过 `grid-column-start: span n` 和 `grid-row-start: span n` 表达尺寸。浏览器原生 dense grid 会把后续小图标填进大组件留下的空洞。

这意味着：

- 数据数组顺序不一定等于屏幕从左到右、从上到下的视觉顺序。
- 一个元素变化可能让多个后续元素重新选择空洞。
- 不能只用数组索引推导跨行位移，必须以最终网格坐标或真实 DOMRect 为准。

组件结构见 `.codex/wetab-research/chunks/179-f855201f.js:44382`。

### 4.5 布局宽度

用户可以：

- 调整图标区域百分比，动态改变左右 padding。
- 锁定布局宽度，使用 `min(savedWidth, 100vw - 200px)`。
- 开启或关闭页面滚动切换。

相关计算见 `.codex/wetab-research/chunks/179-f855201f.js:57815`。

## 5. 桌面端拖动管线

### 5.1 激活

- 在容器上事件委托监听 `mousedown`。
- 只接受鼠标左键。
- 从 `composedPath()` 向上寻找 `.icon-drag`。
- 初始读取一次被拖节点 DOMRect，记录指针在元素内部的 offset。
- 移动距离超过 4px 后才进入真实拖动状态。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:61315`。

### 5.2 拖动副本

拖动开始时：

- `cloneNode(true)` 创建视觉副本。
- 副本使用 `position: fixed`、`pointer-events: none`、`z-index: 999`。
- 保留原元素宽高和指针 offset。
- 原元素通过 `dragIconId` 对应的 `opacity-0` 隐藏，但仍占据网格位置。
- 副本只更新 `left/top`，不触发 Vue 业务状态重排。
- `transform 0.2s` 只用于副本缩放，例如进入 Dock、分类或合并结束。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:45195`。

### 5.3 更新频率拆分

RxJS 将同一拖动拆成两个分支：

- `forMove`：通过 animation-frame scheduler 采样，负责副本跟手。
- `forDrop`：桌面每 40ms 采样一次，负责 `elementFromPoint` 和 drop 事件。

因此复杂命中计算不会以鼠标硬件事件的原始频率运行。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:61365`。

## 6. 触屏拖动

- 默认长按 200ms 激活。
- 长按期间累计超过 2 次 touchmove 会取消激活。
- 激活后的位移阈值为 1px。
- 副本跟手仍按动画帧采样。
- drop 命中每 50ms 采样一次。
- 触屏使用 `touchend` 的 changedTouches 完成结束坐标。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:61548`。

## 7. 命中与排序区域

每个可放置节点具有：

- `data-dropid`
- `data-icontype`
- `data-iconsize`
- `data-droptype`

### 7.1 小图标与大元素的命中差异

- 拖动 `mini` 元素时，使用拖动矩形中心点做 `elementFromPoint`。
- 拖动中/大元素时，使用指针路径命中 drop 元素。
- 无论哪种情况，目标内部的 before/after/middle 判定使用拖动矩形中心。

这避免大组件中心距离指针很远时，目标突然切换到不符合用户预期的位置。

### 7.2 普通排序区

对于不能合并的组合，目标以水平中心一分为二：

- 左半区：`before`
- 右半区：`after`

### 7.3 文件夹合并区

只有以下组合允许进入 `middle`：

- 网站图标 -> 网站图标
- 网站图标 -> 文件夹

目标中心 50% 宽高区域为 middle；外围根据左右、上下方向变成 before 或 after。

相同目标和相同 drop 区域会直接返回，不重复启动 timer。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:44998`。

## 8. 重排和 FLIP 动画

### 8.1 重排节流

- 进入 before/after 后等待 100ms 才修改数组。
- 成功修改后设置 `flipping = true`，200ms 内忽略新的重排。
- 拖动到新目标时会取消上一目标的 timer。

这使业务数组最多约每 200ms 发生一次有效重排，视觉上由 300ms FLIP 连续补间。

### 8.2 数组操作

同分类排序时：

- `after` 插入目标索引 + 1。
- `before` 插入目标索引。
- 根据源索引与目标索引关系修正删除位置。

跨分类移动时：

- 插入目标分类目标位置。
- 从源分类删除。
- 重新赋值最外层 `icons = [...icons]` 触发响应式更新。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:53935`。

### 8.3 Vue TransitionGroup 的实际 FLIP

WeTab 使用 Vue 内置算法：

1. 更新前读取所有 keyed 子节点 DOMRect。
2. 更新后再次读取 DOMRect。
3. 计算旧位置减新位置的 x/y。
4. 给移动节点写入 `translate(x,y)` 和 `transition-duration: 0s`。
5. 读取 `document.body.offsetHeight` 强制提交起始帧。
6. 添加 `.list-move`，清除 transform，让 CSS 在 300ms 内补间到新位置。
7. transform transitionend 后清理 move class。

算法见 `.codex/wetab-research/chunks/179-f855201f.js:9624`，样式见 `.codex/wetab-research/css/5550-c956af08.css:13882`。

关键点不是“绝不读取全网格”，而是只在低频的真实重排提交中批量读写，并保证 read/write 阶段严格分离。

## 9. 文件夹完整状态机

### 9.1 创建文件夹

网站图标停留在另一个网站图标中心区：

1. 350ms 后显示扩张/可合并状态。
2. 再等待 500ms，创建新文件夹并自动打开。
3. 新文件夹固定为 `mini`，children 顺序为 `[目标图标, 拖动图标]`。
4. 新文件夹替换目标位置，源图标从原位置删除。

### 9.2 放入已有文件夹

- 只允许网站图标放入文件夹。
- 防止 children 中出现相同 id。
- 新图标追加到 children 末尾。
- 同样支持停留后自动打开文件夹。

### 9.3 文件夹内部排序

- 文件夹内容使用独立的 7 列 dense grid，移动端为 3 列。
- 同样使用 `TransitionGroup name="list"`。
- before/after 通过数组 splice 调整 children。

### 9.4 从文件夹拖出

- 拖动来源记录为 `folder` 或 `home`。
- 拖动经过 folder-content 时设置 `isIconMoveToFolder`。
- 指针进入 folder-mask 后等待 200ms，再把当前拖动图标移到主页分类末尾。
- 文件夹关闭。
- 如果移出后文件夹只剩一个图标，文件夹自动解散，并由剩余图标替代原文件夹位置。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:54173` 和 `:57708`。

### 9.5 删除与释放

- 文件夹内删除后只剩一个元素时，也会自动解散。
- “释放”操作删除文件夹，将第一个 child 放回文件夹原位置，其余 children 追加到当前分类末尾。
- 文件夹只有 `mini` 和 `medium` 两档：1x1 与 2x2。

## 10. Dock、分类和跨页

### 10.1 Dock

- 拖到 Dock 目标时生成临时预览项。
- 如果图标已经在 Dock，临时 id 使用 `temp-<id>`，防止与原项 key 冲突。
- Dock 最多提交 12 个有效项。
- 拖出 Dock 范围会取消临时插入。
- Dock 左右边缘有独立自动滚动传感区。

### 10.2 分类切换

- 拖到分类图标会缩小副本并切换 active category。
- 目标分类为空时记录 `dropPageIndex`，随后在 icon-page 区域完成插入。

### 10.3 页面上下滚动

- 主页顶部传感区高度 94px。
- 底部传感区高度根据 Dock wrapper 动态计算。
- 自动滚动每约 16.66ms 执行一次，每次移动 8px，内部仍包在 requestAnimationFrame 中。
- 离开传感区或拖动结束立即停止。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:39690` 和 `:45380`。

## 11. 文件夹滚动

- 文件夹顶部和底部各有 40px drop sensor。
- 文件夹采用独立 scroll controller。
- 禁用 bounce 和 momentum，避免拖动时内容惯性继续移动。
- 到达边缘时按剩余距离计算滚动时长。
- children 数量变化后 nextTick refresh scroll 实例。

实现见 `.codex/wetab-research/chunks/179-f855201f.js:44600`。

## 12. 持久化与提交时机

- 图标分类、children、Dock id 列表属于 `store-icon`。
- Web 版使用 IndexedDB object store。
- 拖动过程中的 clone 坐标、drop 区域、timer、flipping、临时 Dock 目标均不持久化。
- 只有数组或业务属性真正变化时才进入 store watch 和持久化链路。
- 图标、Dock 和分类数据支持云同步分支，但页面瞬时拖动状态不参与同步。

这避免了拖动帧与 IndexedDB/同步逻辑相互影响。

## 13. WeTab 为什么跨行仍然顺滑

跨行时最难的是 dense grid 可能让边界元素从一行末尾跳到下一行开头。WeTab 的处理具有以下特征：

- 浏览器原生 grid 负责最终占位，不在 pointermove 中运行自定义排版器。
- stable key 保证节点不卸载。
- TransitionGroup 读取真实位置，因此大中小混排和空洞填充都不会算错。
- 一次跨行提交后 200ms 内禁止下一次数组重排。
- 300ms transform 动画在合成层运行。
- 拖动 clone 不依赖列表重渲染，邻居动画卡顿也不会拖慢指针跟手。

## 14. DesktopGo 当前差距

当前滚动网格仍有以下高成本路径：

1. 每个图标使用 `useSortable`，dnd-kit context 在拖动期间会让所有 sortable hook 响应状态变化。
2. `ScrollableOuterGridView` 在命中后更新 `previewItemIds`，整张图标 map 参与 React reconciliation。
3. `Icon` 没有 memo，并且无 selector 订阅整个 Zustand store，子树重渲染成本较高。
4. 逻辑命中目前每个 requestAnimationFrame 执行一次，仍高于 WeTab 的 40ms。
5. 每次命中读取网格 `getBoundingClientRect()`；跨行提交时会与 React 写布局和动画启动发生在相邻帧。
6. 自定义逻辑坐标 FLIP 必须完全复刻 dense mixed-span 的最终位置，否则跨行边界元素容易出现错误路径或瞬移。

对应代码：

- `src/components/icon-grid/views/ScrollableOuterGridView.tsx:416`
- `src/components/icon-grid/views/ScrollableOuterGridView.tsx:700`
- `src/components/icon-grid/views/ScrollableOuterGridView.tsx:844`
- `src/components/icon-grid/views/ScrollableOuterGridView.tsx:1018`
- `src/components/Icon.tsx:30`

## 15. 建议的 DesktopGo 改造顺序

### P0：拆掉每帧全列表响应

- 滚动网格图标拖动改为根节点事件委托，不再让每个 tile 使用 `useSortable`。
- 用单个命令式 overlay DOM 跟手；React 只维护 active id 和最终业务状态。
- move 通道使用 rAF，drop 通道独立限制到 40ms。

### P0：降低重排提交频率

- 新 drop 区域停留 80-100ms 后再更新 preview order。
- 每次有效重排后锁定约 180-200ms。
- drop id 和 before/after/middle 未变化时不重复处理。

### P0：恢复可靠的真实位置 FLIP

- stable keyed wrapper 保持挂载。
- 在低频重排提交前后批量读取真实 DOMRect。
- 批量写入起始 translate，统一强制一次 layout flush，再统一清除 transform。
- 动画只作用于外层占位 wrapper；内部 hover/scale 层保持独立。
- 不在每个 pointermove 中读取所有节点。

### P1：隔离 React 子树

- 抽出并 `memo` 图标/文件夹 tile content。
- `Icon` 对 Zustand 使用细粒度 selector，避免任意 store 字段变化都重渲染。
- 避免 map 中创建无意义的新回调和临时数组。

### P1：缓存布局基础数据

- dragStart 缓存 grid rect、列数、cell stride。
- 只在滚动、窗口 resize、侧栏宽度或图标尺寸变化时更新。
- pointermove 只做纯数字命中，不触发同步布局读取。

### P1：完整状态机

- 明确 `before / after / middle` 三态。
- 中心合并区只允许 icon -> icon/folder。
- 文件夹 hover、自动打开、拖出 mask、只剩一个自动解散均使用可取消 timer。
- Dock、分类、主页、文件夹分别定义 drop zone，不用一个泛化 collision 算法承担全部语义。

## 16. 必须覆盖的验证矩阵

- 1x1 图标跨一行、跨多行、快速往返。
- 1x1 穿过 2x1、1x2、2x2 元素。
- dense 空洞前后移动，确认视觉位置与数组提交一致。
- 大元素拖动时按指针命中，小元素按中心命中。
- icon -> icon 创建文件夹；icon -> folder 追加。
- folder/widget 不能错误进入 merge。
- 文件夹内排序、拖出、拖回、只剩一个自动解散。
- 拖入 Dock、Dock 已存在图标、Dock 满 12 个、拖出取消。
- 分类切换、空分类、顶部/底部边缘滚动。
- 触屏长按、长按前移动取消、双指触控。
- reduced motion、窗口缩放、侧栏展开/收起、不同图标尺寸。
- 拖动取消、窗口失焦、pointercancel、组件卸载时清理 clone 和 timer。

## 17. 结论

WeTab 的优势来自拖拽架构，而不是某个单独 easing 或 GPU 属性：

- 指针视觉层命令式更新。
- 命中与排序分频。
- 排序有 dwell 和 lock。
- 浏览器 grid 决定占位。
- keyed DOM + 标准 FLIP 负责跨行动画。
- 瞬时拖动状态不进入持久化和复杂组件树。

DesktopGo 若只继续调整 WAAPI 时长或 easing，无法根治跨行瞬间的丢帧。应优先替换滚动网格的 per-item dnd-kit 订阅和每帧 React 拖拽链路，再实现低频、批量、真实坐标的 FLIP。
