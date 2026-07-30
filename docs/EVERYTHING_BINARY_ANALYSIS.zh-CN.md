# Everything 1.4.1.1028 安装包静态分析与 DesktopGo 搜索性能对比

分析日期：2026-07-30

分析对象：

- 原始安装包：`src-tauri/resources/everything-installer/Everything-Setup.exe`
- 用户解压目录：`src-tauri/resources/everything-installer/Everything-Setup/`
- 对照代码：DesktopGo 当前搜索前端、Tauri 命令、Everything SDK 调用与图标提取代码

## 1. 结论摘要

这次解压得到的内容不是 Everything 主程序源码。目录中没有 `.c`、`.cpp`、`.h`、PDB、MAP 或调试符号；`everything/.text`、`.rdata`、`.data`、`.rsrc` 等目录和文件，是 7-Zip 对同一个 `everything.exe` 的 PE 节和资源视图，不是额外源码。

不过，静态证据已经足以回答滚动性能问题：

1. Everything 的主界面使用原生 `SysListView32` 和 Win32 滚动、重绘、ImageList API。
2. Everything 的更新日志明确记录了“加载可见项的图标和文件信息缓存”，主程序中也存在图标加载线程优先级、图标缓存、文件信息缓存、滚动后刷新策略等配置和内部符号。
3. 因此，Everything 可以先依据已有的结果状态绘制目标位置的文本行，再异步加载或命中可见行的图标/文件信息缓存。这里“可见项缓存和独立图标线程”有直接证据；“文本结果状态的具体内存布局和完整调用顺序”仍属于根据原生架构作出的高可信推断。
4. DesktopGo 当前每个分页只有 50 条，跳转后要经过前端可见区调度、Tauri IPC、Everything IPC 分页查询，然后在 Rust 中同步为这 50 条结果逐一提取图标。图片文件还会被整文件读取、解码、Lanczos3 缩放、PNG 编码、Base64 编码。整个页面完成后才返回 WebView。
5. 此外，DesktopGo 原先还存在一个独立的 React 刷新缺陷：`virtualRows` 的 `useMemo` 不依赖分页数据，页面加载完成后可见范围没有变化就不会重新计算，只有下一次滚轮滚动改变范围后才从骨架切换为内容。当前工作区已经移除了这个错误的 memo。

所以，Everything “拖到中间立即看到内容”不是单纯因为索引查询更快。主要差别是渲染管线：Everything 把廉价的文本绘制与昂贵的图标/文件信息加载解耦；DesktopGo 把一页所有图标的同步生成放在文本结果返回之前。

## 2. 分析边界与证据等级

本次只做静态、只读分析，没有执行任何 EXE 或 DLL。

| 等级       | 含义                                                              | 本文中的例子                                                               |
| ---------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 已确认     | 可由文件内容、PE 头、导入表、签名、字符串、配置或更新日志直接验证 | `SysListView32`、`CreateThread` 导入、可见项 icon/file-info cache 更新日志 |
| 高可信推断 | 多项直接证据共同支持，但没有反汇编到完整控制流                    | Everything 先绘制文本行，再异步补充可见项图标                              |
| 未确认     | 当前文件不足以证明                                                | 是否使用 `LVS_OWNERDATA`、准确线程数量、队列结构、缓存淘汰算法             |

“完整分析”在本文中指对解压出的全部文件做文件级、容器级、PE/资源级静态分析，并对与问题有关的导入、字符串和日志做交叉验证；不等同于拥有 Everything 私有源码，也不等同于逐指令逆向整个 1.76 MB `.text` 代码节。

## 3. 解压目录总览

实际目录包含 **61 个文件**，不是先前粗略统计的 58 个：

- 31 个安装器或实际安装载荷文件。
- 30 个由 7-Zip 从 `everything.exe` 再次展开得到的 PE 节、签名和资源文件。

```text
Everything-Setup/
└─ $PLUGINSDIR/
   ├─ InstallOptions.dll
   ├─ InstallOptions.ini
   ├─ InstallOptions2.ini
   ├─ ioSpecial.ini
   ├─ LangDLL.dll
   ├─ modern-wizard.bmp
   ├─ System.dll
   └─ Everything/
      ├─ everything.exe
      ├─ Everything.lng
      ├─ Changes.txt
      ├─ License.txt, License_1.txt ... License_19.txt
      ├─ Uninstall.exe.nsis
      └─ everything/               # 7-Zip 生成的 PE 分解视图
         ├─ .text/.rdata/.data/.pdata/.reloc
         ├─ CERTIFICATE
         ├─ .rsrc_1
         └─ .rsrc/*
```

原始 NSIS 归档内 20 份许可证都叫 `License.txt`。解压工具为避免覆盖，将后 19 份重命名为 `License_1.txt` 至 `License_19.txt`；这些后缀不是上游原始文件名。

## 4. 原始安装包与 NSIS 层

### 4.1 原始安装包

| 属性       | 值                                                                 |
| ---------- | ------------------------------------------------------------------ |
| 文件大小   | 1,959,088 字节                                                     |
| SHA-256    | `874E87DC9DE6E99BCBF46400BF7ECED0DEDA402FC79DD13E0CAFABF2277C8149` |
| 安装器格式 | NSIS 3 Unicode，LZMA:23，solid                                     |
| 安装器 PE  | x86 Windows GUI                                                    |
| 版本       | 1.4.1.1028                                                         |
| 签名状态   | Valid                                                              |
| 签名者     | `voidtools PTY LTD`                                                |
| 时间戳机构 | DigiCert SHA256 RSA4096 Timestamp Responder 2025 1                 |

PE 末节结束于偏移 80,896，后面 1,878,192 字节是 NSIS overlay，约占文件的 95.87%。这符合“较小安装器 stub + 大型压缩载荷”的 NSIS 结构，不是异常附加数据。

### 4.2 NSIS 支持文件

| 文件                  |   大小 | 分析                                                        |
| --------------------- | -----: | ----------------------------------------------------------- |
| `InstallOptions.dll`  | 15,872 | x86、未签名的 NSIS 安装页插件；不是搜索实现                 |
| `System.dll`          | 12,288 | x86、未签名的 NSIS 系统调用插件；不是搜索实现               |
| `LangDLL.dll`         |  5,632 | x86、未签名的 NSIS 语言选择插件；不是 Everything 语言包本体 |
| `modern-wizard.bmp`   | 26,494 | 164 x 314、4 位索引色的安装向导位图                         |
| `ioSpecial.ini`       |    211 | 定义位图和两个标签的向导页面布局                            |
| `InstallOptions.ini`  |    754 | 定义设置目录与 NTFS 索引模式                                |
| `InstallOptions2.ini` |  1,017 | 定义启动、快捷方式、协议、文件关联和自动索引选项            |

三个插件 DLL 都是 NSIS 3 构建产物，带重定位、NX、NoSEH 和 TerminalServerAware 标记，没有 Everything 产品版本信息，也没有 Authenticode 签名。它们只服务于安装/卸载流程。

`InstallOptions.ini` 明确提供：

- `%APPDATA%\Everything` 或安装目录保存设置和数据；
- 安装 Everything service；
- 以管理员运行；
- 不启用 NTFS 索引。

`InstallOptions2.ini` 明确提供：

- 启动时检查更新、随系统启动；
- 文件夹上下文菜单；
- 开始菜单、桌面、Quick Launch 快捷方式；
- `ES:` URL 协议、EFU 文件关联；
- 自动索引固定 NTFS 卷。

### 4.3 卸载包

`Uninstall.exe.nsis` 大小为 60,693 字节，SHA-256 为：

`419939765B3938923E080EA1A7B99747785A76D0263C51CA9A110A549495B2E8`

7-Zip 将其识别为 `NSIS-3 Unicode (Uninstall)`、LZMA:23 solid。它内部引用同一组 NSIS 插件和向导资源，不包含另一份 Everything 搜索引擎。

## 5. Everything 主程序 PE 分析

### 5.1 身份与安全属性

| 属性      | 值                                                                 |
| --------- | ------------------------------------------------------------------ |
| 文件      | `$PLUGINSDIR/Everything/everything.exe`                            |
| 文件大小  | 2,266,280 字节                                                     |
| SHA-256   | `CAFC5DB967DBC728372D3ABB1AA1E5FC5A58BA3E35E80C309A51F3E112CCCE6F` |
| 架构      | x64 Windows GUI                                                    |
| 版本      | 1.4.1.1028                                                         |
| PE 时间戳 | 2025-06-20 13:06:58                                                |
| 签名状态  | Valid                                                              |
| 签名者    | `voidtools PTY LTD`                                                |
| 清单权限  | `asInvoker`，`uiAccess=false`                                      |
| UI 清单   | Common Controls v6、DPI aware                                      |
| PE 防护   | Relocatable、NX-compatible、TerminalServerAware                    |

链接器版本显示为 8.0。这个数值只表示 PE 链接器版本字段，不能据此推断完整编译器或源代码年代。

### 5.2 PE 节

| 节            |  原始大小 |  虚拟大小 | 权限/用途                |
| ------------- | --------: | --------: | ------------------------ |
| `.text`       | 1,764,864 | 1,764,414 | 可执行、只读代码         |
| `.rdata`      |   310,272 |   309,902 | 只读数据、导入、字符串等 |
| `.data`       |    73,216 |    79,400 | 可读写数据               |
| `.pdata`      |    52,224 |    51,780 | x64 异常处理/展开信息    |
| `.reloc`      |    12,800 |    12,728 | 基址重定位               |
| `CERTIFICATE` |    10,408 |    10,408 | Authenticode 证书数据    |

解压目录内同名节文件是 7-Zip 的导出表示。部分导出大小采用虚拟长度或经过解析的有效长度，例如目录中的 `.reloc` 为 7,144 字节，不能把这些文件当作原 PE 原始区段的逐字节副本，也不能简单相加还原 EXE。

### 5.3 资源

主程序资源全部在 7-Zip 生成的 `everything/.rsrc/` 下：

- `version.txt`：UTF-16LE 版本资源，包含公司 `voidtools`、产品 `Everything` 和版本 `1.4.1.1028`。
- `MANIFEST/1`：939 字节 XML 清单，确认 `asInvoker`、Common Controls v6 和 DPI aware。
- `BITMAP/102.bmp`：378 x 89 位图。
- `GROUP_ICON/101`：一个包含 11 个图标变体的组图标。
- `ICON/1` 至 `ICON/11`：16/24/32/48/256 像素，4/8/32 位的应用图标变体；`ICON/7` 是 256 x 256、32 位资源，7-Zip 没有给它加 `.ico` 后缀。
- `RCDATA/103`：1,597 字节 CSS 文本。
- `RCDATA/104`：170 x 32 GIF。
- `RCDATA/105`、`106`、`109`：16 x 16 GIF。
- `RCDATA/107`、`108`：7 x 4 GIF。
- `RCDATA/110`：16 x 16、32 位 ICO。
- `.rsrc_1`：29 字节的 `PPADDING...` 填充标记，不是业务数据。

这些资源显示 Everything 内置了原生窗口图标、位图和少量用于 HTML/富文本内容的 CSS/GIF，但不包含可读业务源码。

## 6. Everything.lng 语言包

| 属性       | 值                                                                 |
| ---------- | ------------------------------------------------------------------ |
| 文件大小   | 999,878 字节                                                       |
| SHA-256    | `4E78EFBCB31C08BAD74FA016BCBEEC05CD86F504E1753271DBD4F78595E6D44B` |
| 文件头     | 8 字节自定义头：`67 04 00 00 01 00 00 00`                          |
| 压缩格式   | 从偏移 8 开始为连续 BZip2 数据                                     |
| 流/块数量  | 48 / 48                                                            |
| 解压总大小 | 4,669,152 字节                                                     |

第一个解压流是 1,132 字节的语言目录，开头的 `uint32` 值为 47；后续记录包含 Windows LCID、压缩数据偏移、压缩大小和 UTF-8 语言名称。其余 47 个 BZip2 流分别是语言数据。因此“48 个流”不是 48 种语言，而是 1 个目录流加 47 个语言流。

47 种语言为：

```text
Afrikaans, Bosanski, Dansk, Deutsch, English (AU), English (UK),
Español (Venezuela), Español (Tradicional), Eesti keel, Français,
Hrvatski, Italiano, kurdî (Soranî), Kûrdî (کوردی), Magyar,
Nederlands, Norsk bokmål, Oʻzbekcha, Polski, Português (Brasil),
Română, Shqip, Slovenčina, Slovenščina, Srpski, Suomi, Svenska,
Tiếng Việt, Türkçe, Čeština, Ελληνικά, Македонски, Русский, Српски,
Українська, עברית, ئۇيغۇرچە, عربي, فارسی, বাংলা, தமிழ் (India),
ภาษาไทย, བོད་ཡིག, 日本語, 简体中文, 繁體中文, 한국어
```

这证明 `Everything.lng` 是编译后的多语言资源容器，而不是可直接阅读的源码或单一语言文本。

## 7. 更新日志与许可证

### 7.1 Changes.txt

`Changes.txt` 大小为 19,902 字节，记录从 0.102 到 1.4.1.1028 的版本变化。与本次问题直接相关的原文位置包括：

|              行号 | 原文要点                                                                    | 能证明什么                                  |
| ----------------: | --------------------------------------------------------------------------- | ------------------------------------------- |
|                82 | fixed rendering negative visible result items                               | 渲染逻辑显式计算可见结果范围                |
|               163 | fixed a crash when accessing file information cache                         | 存在文件信息缓存                            |
|           225-226 | monitoring fileinfo/icon cache；canceling/restarting file information cache | 缓存有监控、取消和重启生命周期              |
| 298、307-308、414 | improved rendering/text rendering performance                               | 长期优化过列表/文本渲染                     |
|               309 | clearing icon and file info cache when database is unloaded                 | 缓存生命周期与数据库状态关联                |
|               360 | added optional icon cache size                                              | 图标缓存容量可配置                          |
|           369-370 | improved file info cache / icon cache                                       | 两类缓存相互独立                            |
|               376 | listview first draw                                                         | 界面使用 ListView 绘制路径                  |
|           377-378 | loading icon and file information cache of visible items                    | **直接证明只为可见项加载图标/文件信息缓存** |
|               379 | listview was not getting drawn                                              | 进一步确认 ListView                         |
|               407 | added file information columns                                              | 文件信息作为额外列数据                      |
|               428 | fixed a scroll bug                                                          | 列表有独立滚动处理                          |

其中 377-378 行是回答本次问题最关键的直接证据。

### 7.2 License 文件

`License.txt` 到 `License_19.txt` 是 20 份 Everything MIT 许可证的语言版本，不是 20 个第三方依赖许可证：

| 文件             |  大小 | 语言/用途                                   |
| ---------------- | ----: | ------------------------------------------- |
| `License.txt`    | 2,611 | 英文主许可证，Copyright 2025 voidtools，MIT |
| `License_1.txt`  | 1,624 | 丹麦语                                      |
| `License_2.txt`  | 1,162 | 德语                                        |
| `License_3.txt`  | 2,879 | 西班牙语                                    |
| `License_4.txt`  | 2,609 | 英文版本                                    |
| `License_5.txt`  | 1,053 | 英文简版                                    |
| `License_6.txt`  | 2,769 | 克罗地亚语                                  |
| `License_7.txt`  | 2,813 | 意大利语                                    |
| `License_8.txt`  | 2,330 | 匈牙利语                                    |
| `License_9.txt`  | 2,831 | 乌兹别克语翻译                              |
| `License_10.txt` | 2,129 | 波兰语                                      |
| `License_11.txt` | 2,858 | 葡萄牙语                                    |
| `License_12.txt` | 2,595 | 斯洛文尼亚语                                |
| `License_13.txt` | 1,230 | 芬兰语                                      |
| `License_14.txt` | 3,116 | 土耳其语                                    |
| `License_15.txt` | 5,699 | 希腊语                                      |
| `License_16.txt` | 1,964 | 俄语                                        |
| `License_17.txt` | 4,918 | 乌克兰语                                    |
| `License_18.txt` | 2,137 | 波斯语                                      |
| `License_19.txt` | 4,255 | 韩语，含“翻译仅供参考”说明                  |

许可证内容不提供搜索、滚动或缓存实现信息。

## 8. Everything 列表、滚动和图标实现证据

### 8.1 PE 导入表直接证据

从 `everything.exe` 的 PE 导入目录解析得到：

| DLL            | 相关导入                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMCTL32.dll` | `ImageList_GetIconSize`, `ImageList_DrawEx`                                                                                                              |
| `KERNEL32.dll` | `CreateThread`                                                                                                                                           |
| `USER32.dll`   | `SetScrollInfo`, `ScrollWindowEx`, `GetScrollInfo`, `InvalidateRect`, `CreateWindowExW`, `GetClientRect`, `RedrawWindow`, `PostMessageW`, `SendMessageW` |
| `SHELL32.dll`  | `SHGetFileInfoW`                                                                                                                                         |

这些是实际导入表项，不只是碰巧存在于字符串区。它们直接支持“原生窗口 + 原生滚动/局部重绘 + ImageList + Shell 文件图标 + 工作线程/消息回传”的实现轮廓，但仅靠导入表不能确定每个 API 的准确调用关系。

### 8.2 主程序静态字符串直接证据

主程序中可提取到以下相关字符串：

```text
SysListView32
ScrollBar
lvm_scroll
GetScrollInfo
SetScrollInfo
ScrollWindowEx
ImageList_DrawEx
ImageList_GetIconSize
SHGetFileInfoW
load_icon_priority
The priority of the thread to load icons.
Load &icon priority:
update_display_after_scroll
Update the display after scrolling. Enabling this can decrease scrolling performance.
&Update display immediately after scrolling
db_get_cached_result_file_info
_db_query_fileinfo_cache_changed_proc
cached icons only %d
load icon
load_thumbnail_priority
thumbnail_load_size
reset_vscroll_on_search
auto_scroll_view
sticky_vscroll_bottom
listview_item_high
show_detailed_listview_tooltips
```

由这些字符串可以直接确认：

- UI 使用 `SysListView32`，而非浏览器 DOM 列表。
- 有独立的图标加载线程优先级设置。
- 图标、缩略图和文件信息存在缓存/加载概念。
- 有“滚动后立即刷新显示”的可选策略，而且说明文字明确提示开启后可能降低滚动性能。
- 垂直滚动重置、自动滚动、底部粘连、行高和详细 tooltip 都是独立配置。

### 8.3 可以还原出的高可信执行模型

结合导入表、字符串和更新日志，可以得到以下高可信模型：

```text
拖动原生滚动条
→ ListView 改变可见索引并立即重绘已有的文本结果
→ 查询/命中“可见项”的 icon cache 和 file-info cache
→ 缺失图标由具有独立优先级的加载线程处理
→ 通过窗口消息/重绘请求更新已完成的可见项
→ 是否在滚动期间立即刷新昂贵信息受 update_display_after_scroll 策略影响
```

其中“可见项缓存”“图标加载线程优先级”“滚动后显示策略”是直接证据。“立即重绘已有文本结果”和消息回传的完整顺序是根据原生 ListView、相关导入和用户可观察行为作出的高可信推断。

### 8.4 不能从当前文件确认的事项

- 没有直接证据确认 ListView 是否设置 `LVS_OWNERDATA`；不能把虚拟列表样式当作已证明事实。
- 无法确认缓存使用 LRU、哈希表还是其他淘汰算法。
- 无法确认每类后台任务的准确线程数量。
- 无法从字符串还原函数级调用图和锁粒度。
- 不能把 7-Zip 导出的 `.text` 称为“源码”。它仍是机器码。

## 9. DesktopGo 当前搜索链路

### 9.1 前端虚拟列表和分页调度

直接代码证据：

- `src/lib/search/settings.ts:43`：默认 `maxResultsPerPage` 为 50。
- `src/components/search/SearchPanel.tsx:29`：滚动可见范围通知防抖为 80 ms。
- `SearchPanel.tsx:218-225`：按 `scrollTop / ROW_HEIGHT` 计算可见索引，并向前后各预取至少一页。
- `SearchPanel.tsx:246-261`：一般滚动事件经过 80 ms 防抖。
- `SearchPanel.tsx:447-457`：鼠标或指针松开时会立即 flush，所以拖动结束不必再固定等待完整 80 ms。
- `SearchPanel.tsx:555-560`：滚动事件更新虚拟列表位置并调度可见范围。
- `src/lib/search/useSearch.ts:326-438`：分页请求通过一个 `rangeRequestRef` 串行执行。
- `useSearch.ts:355-374`：选择缺失页，但已有 `requestedOffsets` 优先于当前 `visibleCandidates`。
- `useSearch.ts:455-468`：已有活动请求时不会启动新的请求，也没有取消偏离当前可见区的旧请求。

因此，拖动到远处时如果旧页还在查询/生成图标，目标页要等旧请求结束；队列中已有偏移还可能先于当前可见页被处理。

### 9.2 Tauri 与 Everything SDK 查询

- `src/lib/search/api.ts:33` 调用 `invoke<SearchPage>('search_files', { query })`。
- `src-tauri/src/everything/ipc/query.rs:338-351` 把关键词、匹配选项、排序、`offset` 和 `limit` 设置到 Everything SDK。
- `query.rs:343-348` 请求文件名、路径和两项高亮文本。
- 本地附带的 Everything SDK 源码显示查询通过 `WM_COPYDATA`/Everything IPC 把 `offset`、`max_results` 和请求标志发送给正在运行的 Everything 实例。

这意味着 DesktopGo 每个缺失页都要走一次 WebView → Tauri → SDK DLL → Everything 进程的边界，而 Everything 自己的主窗口不需要通过 DesktopGo 的这些边界来绘制自己的列表。

### 9.3 Rust 同步图标处理是主要阻塞点

`src-tauri/src/everything/ipc/query.rs:127-190` 在收到 Everything 返回结果后同步遍历整页。每一项在 `query.rs:165` 调用：

```rust
icons::get_path_icon_base64(&path, SEARCH_RESULT_ICON_SIZE)
```

`SEARCH_RESULT_ICON_SIZE` 为 32。当前搜索返回结构要求每条 `SearchHit` 在返回前已经带有 `icon_base64`。

`src-tauri/src/icons/catalog_windows/image.rs:59-86` 没有搜索结果专用的内存缓存。对存在的图片文件，`image.rs:46-56` 会同步执行：

```text
读取完整文件
→ 从内存解码图片
→ Lanczos3 缩放到 32 x 32
→ 重新编码为 PNG
→ Base64 编码并拼成 data URI
```

对非图片文件、文件夹、EXE 和 LNK，也要进行路径检查、快捷方式解析或 Windows Shell 图标提取。即使 Everything IPC 很快，DesktopGo 也要等 50 个图标全部处理完，才能序列化整个 `SearchPage` 并交给 WebView。

### 9.4 骨架“等到再滚一下才消失”的独立缺陷

原实现用 `useMemo` 计算 `virtualRows`，依赖只有：

```text
endIndex, getItemAt, isEverything, startIndex
```

但 `getItemAt` 是稳定回调，真正的分页内容保存在 `pagesRef` 中。当目标页异步写入后，如果 `startIndex/endIndex` 没变，memo 不会重新执行，`item` 仍保留旧的 `null`，所以列表继续显示骨架。再次滚轮滚动改变索引范围后，memo 才重新计算并显示内容。

当前工作区中的修复是直接在每次渲染时构造当前可见的少量 `virtualRows`，使分页状态更新触发的渲染能立即读取 `pagesRef`。这修复的是“数据已到但 UI 不刷新”，不消除分页查询和同步图标生成本身的等待时间。

## 10. 为什么 Everything 比 DesktopGo 立即

| 阶段       | Everything 主窗口                                    | DesktopGo 搜索面板                                 |
| ---------- | ---------------------------------------------------- | -------------------------------------------------- |
| 列表技术   | 原生 `SysListView32`                                 | React + WebView 虚拟 DOM                           |
| 目标位置   | 直接改变原生列表可见范围                             | 计算索引、通知 hook、查缺失分页                    |
| 结果来源   | 高可信推断为主进程已有结果/数据库状态                | 每个缺页重新发起 Everything SDK `offset/limit` IPC |
| 文本与图标 | 直接证据支持可见项 icon/file-info 缓存和独立图标线程 | 同一页所有文本和 Base64 图标绑定在一个响应中       |
| 图片图标   | 缓存/异步加载模型                                    | 整文件读取、解码、缩放、PNG、Base64                |
| 请求调度   | 原生列表内部调度                                     | 50 条/页、串行、旧请求不可取消、旧队列可能优先     |
| 渲染刷新   | 原生局部重绘 API                                     | 还要经过 Tauri 序列化和 React 渲染                 |
| 已发现缺陷 | 当前静态材料未发现同类问题                           | 旧 `useMemo` 会让已到达数据继续显示骨架，已修复    |

DesktopGo 当前实际路径是：

```text
拖动滚动条
→ pointerup flush 可见范围
→ 等待当前旧页请求（如有）
→ Tauri invoke
→ Everything SDK offset/limit IPC
→ 等待 Everything 回复
→ Rust 同步处理最多 50 个路径和图标
→ PNG/Base64 数据随整页序列化
→ WebView 收到页面
→ React 读取页面并绘制行
```

Everything 的证据支持如下路径：

```text
拖动原生滚动条
→ 立即绘制目标位置已有的廉价文本状态
→ 只对可见项查询图标/文件信息缓存
→ 缺失的昂贵信息由独立优先级线程补齐
→ 局部重绘相应行
```

这就是相同搜索词、相同索引服务下仍有明显体验差异的原因。瓶颈主要不在 Everything 的名称索引，而在 DesktopGo 自己追加的跨进程分页、串行调度和同步图标编码阶段。

## 11. DesktopGo 推荐改造顺序

### P0：文本结果与图标彻底解耦

`search_files` 首先只返回路径、名称、父目录、类型和高亮文本。图标字段应允许为空，前端先显示稳定的类型占位图标；再用独立命令按“当前可见路径”批量请求图标并增量回填。

这是最接近 Everything 已确认行为的改造，也是让远距离滚动立即出现文本的关键。

### P0：增加搜索结果图标缓存

建议按类别分层：

- 图片缩略图：按规范化路径 + 修改时间 + 尺寸缓存。
- EXE/LNK：按目标路径 + 修改时间 + 尺寸缓存。
- 普通扩展名：优先复用扩展名/文件类型图标。
- 文件夹和特殊 Shell 项：使用稳定键缓存。
- 对并发相同 key 做请求合并，避免重复提取。

缓存应有明确容量和淘汰策略，搜索结果缓存不能与图标库持久化职责混在一起。

### P0：当前目标页优先并允许丢弃过时工作

当可见范围从旧位置跳到远处时：

- 新目标页优先于旧的预取偏移。
- 清除不再靠近当前可见范围的等待队列。
- 无法取消的 Everything IPC 可以让其完成，但结果后的图标工作应检查请求代次并尽早停止。
- 图标队列使用“可见项 > 相邻预取项 > 历史项”的优先级。

### P1：避免为 32 像素列表图标解码任意大图片

图片缩略图应走独立、可取消、受限的缩略图通道。首屏文本不应依赖缩略图；可以优先使用 Shell 文件类型图标，空闲时再升级为缩略图。

### P1：增加分阶段耗时日志

至少分别记录：

```text
visible-range scheduling
Everything IPC round trip
result text extraction
icon extraction total / per type / cache hit rate
Tauri serialization
frontend page commit
```

当前 `query.rs` 已记录整页提取耗时，但仍需要把文本提取与图标阶段拆开，否则无法持续验证优化是否命中真正瓶颈。

## 12. 全部 61 个文件清单

### 12.1 安装器与实际载荷：31 个

| 文件                                        |      字节 | 分类              |
| ------------------------------------------- | --------: | ----------------- |
| `$PLUGINSDIR/System.dll`                    |    12,288 | NSIS 插件         |
| `$PLUGINSDIR/LangDLL.dll`                   |     5,632 | NSIS 插件         |
| `$PLUGINSDIR/InstallOptions.dll`            |    15,872 | NSIS 插件         |
| `$PLUGINSDIR/InstallOptions.ini`            |       754 | 安装页配置        |
| `$PLUGINSDIR/InstallOptions2.ini`           |     1,017 | 安装页配置        |
| `$PLUGINSDIR/ioSpecial.ini`                 |       211 | 向导布局          |
| `$PLUGINSDIR/modern-wizard.bmp`             |    26,494 | 向导位图          |
| `$PLUGINSDIR/Everything/everything.exe`     | 2,266,280 | Everything 主程序 |
| `$PLUGINSDIR/Everything/Everything.lng`     |   999,878 | 编译语言包        |
| `$PLUGINSDIR/Everything/Changes.txt`        |    19,902 | 更新日志          |
| `$PLUGINSDIR/Everything/Uninstall.exe.nsis` |    60,693 | NSIS 卸载包       |
| `$PLUGINSDIR/Everything/License.txt`        |     2,611 | 许可证            |
| `$PLUGINSDIR/Everything/License_1.txt`      |     1,624 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_2.txt`      |     1,162 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_3.txt`      |     2,879 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_4.txt`      |     2,609 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_5.txt`      |     1,053 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_6.txt`      |     2,769 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_7.txt`      |     2,813 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_8.txt`      |     2,330 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_9.txt`      |     2,831 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_10.txt`     |     2,129 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_11.txt`     |     2,858 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_12.txt`     |     2,595 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_13.txt`     |     1,230 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_14.txt`     |     3,116 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_15.txt`     |     5,699 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_16.txt`     |     1,964 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_17.txt`     |     4,918 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_18.txt`     |     2,137 | 许可证翻译        |
| `$PLUGINSDIR/Everything/License_19.txt`     |     4,255 | 许可证翻译        |

### 12.2 `everything.exe` 的 7-Zip 派生视图：30 个

下表路径均以 `$PLUGINSDIR/Everything/everything/` 为基准。

| 文件                   |      字节 | 分类                     |
| ---------------------- | --------: | ------------------------ |
| `.text`                | 1,764,414 | 代码节导出               |
| `.rdata`               |   309,902 | 只读数据节导出           |
| `.data`                |    73,216 | 数据节导出               |
| `.pdata`               |    51,780 | x64 展开信息导出         |
| `.reloc`               |     7,144 | 7-Zip 解析后的重定位导出 |
| `CERTIFICATE`          |    10,408 | Authenticode 证书        |
| `.rsrc_1`              |        29 | PE 资源区填充            |
| `.rsrc/version.txt`    |     1,464 | UTF-16LE 版本资源        |
| `.rsrc/BITMAP/102.bmp` |     4,396 | 位图资源                 |
| `.rsrc/GROUP_ICON/101` |       160 | 11 项组图标目录          |
| `.rsrc/ICON/1.ico`     |       766 | 32 x 32，4 位图标        |
| `.rsrc/ICON/2.ico`     |       510 | 24 x 24，4 位图标        |
| `.rsrc/ICON/3.ico`     |       318 | 16 x 16，4 位图标        |
| `.rsrc/ICON/4.ico`     |     2,238 | 32 x 32，8 位图标        |
| `.rsrc/ICON/5.ico`     |     1,758 | 24 x 24，8 位图标        |
| `.rsrc/ICON/6.ico`     |     1,406 | 16 x 16，8 位图标        |
| `.rsrc/ICON/7`         |     4,117 | 256 x 256，32 位图标     |
| `.rsrc/ICON/8.ico`     |     9,662 | 48 x 48，32 位图标       |
| `.rsrc/ICON/9.ico`     |     4,286 | 32 x 32，32 位图标       |
| `.rsrc/ICON/10.ico`    |     2,462 | 24 x 24，32 位图标       |
| `.rsrc/ICON/11.ico`    |     1,150 | 16 x 16，32 位图标       |
| `.rsrc/MANIFEST/1`     |       939 | XML 应用清单             |
| `.rsrc/RCDATA/103`     |     1,597 | CSS 文本                 |
| `.rsrc/RCDATA/104`     |       708 | GIF                      |
| `.rsrc/RCDATA/105`     |       131 | GIF                      |
| `.rsrc/RCDATA/106`     |       125 | GIF                      |
| `.rsrc/RCDATA/107`     |       819 | GIF                      |
| `.rsrc/RCDATA/108`     |       822 | GIF                      |
| `.rsrc/RCDATA/109`     |       145 | GIF                      |
| `.rsrc/RCDATA/110`     |     1,150 | ICO                      |

## 13. 关键文件哈希

| 文件                   | SHA-256                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `Everything-Setup.exe` | `874E87DC9DE6E99BCBF46400BF7ECED0DEDA402FC79DD13E0CAFABF2277C8149` |
| `everything.exe`       | `CAFC5DB967DBC728372D3ABB1AA1E5FC5A58BA3E35E80C309A51F3E112CCCE6F` |
| `Everything.lng`       | `4E78EFBCB31C08BAD74FA016BCBEEC05CD86F504E1753271DBD4F78595E6D44B` |
| `Uninstall.exe.nsis`   | `419939765B3938923E080EA1A7B99747785A76D0263C51CA9A110A549495B2E8` |
| `System.dll`           | `8DC562CDA7217A3A52DB898243DE3E2ED68B80E62DDCB8619545ED0B4E7F65A8` |
| `LangDLL.dll`          | `18E8B40BA22C7A1687BD16E8D585380BC2773FFF5002D7D67E9485FCC0C51026` |
| `InstallOptions.dll`   | `C7FEF6457989D97FECC0616A69947927DA9D8C493F7905DC8475C748F044F3CF` |

## 14. 最终回答

是的，这次不是凭训练知识猜测。解压后的 `everything.exe`、其 PE 导入表、静态字符串和同包 `Changes.txt` 提供了直接证据：Everything 使用原生 ListView，维护图标/文件信息缓存，只加载可见项的这两类缓存，并给图标加载线程提供独立优先级；它还允许控制滚动后是否立即更新昂贵显示信息。

DesktopGo 当前慢在自己的结果包装层：每次远距离跳转要重新请求 50 条分页，并在 Rust 返回前同步把 50 个图标全部生成成 Base64。图片路径甚至会读取并解码整张图片。再加上串行旧页请求和此前错误的 `useMemo`，就会出现“拖到中间先看到骨架，等一下也不刷新，再滚一下才出现”的现象。

要达到 Everything 的体验，关键不是继续缩短骨架动画或只调防抖时间，而是让文本页先返回、立即绘制；图标按当前可见项异步批量加载并缓存，同时让最新目标页抢占旧预取工作。

## 15. 2026-07-30 实施结果

基于本文证据完成了第一阶段搜索管线改造：

- `search_files` 不再同步提取分页内所有图标，只返回路径、名称、类型和高亮文本。
- 新增 `get_search_result_icons` 批量命令，在阻塞线程池中处理当前可见行的图标。
- Rust 和前端分别维护容量为 512 的有界图标缓存；Rust 缓存按最近使用时间淘汰，前端缓存按写入顺序淘汰。
- 当前可见页优先于之前排队的显式/预取偏移，远距离跳转不再先处理旧等待队列。
- 新目标可见行可以发起独立图标批次，不需要等待旧图标批次返回；旧结果仍可进入缓存，避免重复工作。
- 只有受支持的图片扩展名才进入整文件读取和图片解码流程，普通文件、压缩包和可执行文件直接走 Shell 图标提取。
- 图标加载失败时保留稳定的文件或文件夹占位图标，不阻塞文本，也不把图标错误升级为搜索失败。

这一阶段没有改变 Everything SDK 的单查询约束，正在执行的旧分页 IPC 仍不能被强制取消；不过分页已经变为纯文本提取，旧请求的尾部成本显著降低。Shell 图标提取本身也无法可靠中止，所以快速滚动产生的已启动图标任务可能继续完成，但不会阻止新可见项批次开始。

用户运行验证后确认，第一阶段仍会在远距离拖动时显示缺页骨架。进一步检查发现文本页本身仍受 80 ms 可见范围防抖和 50 条默认窗口限制。第二阶段因此继续调整：

- 可见范围改为 `requestAnimationFrame` 逐帧提交最新滚动位置，取消固定 80 ms 等待。
- 默认文本窗口从 50 条扩大到后端允许的 200 条，并迁移仍使用旧默认值的配置。
- 未返回的稀疏行不再显示脉冲骨架；目标页查询会在下一动画帧开始，返回后直接绘制文本。

用户运行验证后确认，移除骨架只把“骨架”变成了“空白”，持续拖动时文本分页仍追不上视口。读取实际 `search-debug.log` 后得到明确数据：搜索词 `vs` 返回 21,085 条结果，每个 200 条分页的 IPC 往返需要约 103–130 ms，而提取 200 条文本只需要 1–2 ms。滚动位置约每 16 ms 更新一帧，因此瓶颈不是 React 绘制或文本提取，而是每个目标页都重新执行 Everything IPC。

第三阶段改为复用 Everything SDK 自己的结果缓冲区：

- 初次查询让 SDK 保留最多 50,000 条结果，但只向 WebView 返回当前 200 条文本。
- 后续页如果位于该 SDK 结果窗口内，直接在 Everything IPC 工作线程读取对应下标，不再调用 `Everything_QueryW`。
- 搜索条件变化或跳出 50,000 条窗口时才建立新的 SDK 结果窗口，避免对百万级结果无上限占用内存。
- 原有首页缓存只复制最多 200 条可见文本，不复制整个 SDK 大窗口。
- WebView 异步范围读取偶尔落后一帧时，虚拟列表继续绘制上一帧有效行；这些保留行禁用点击、选择和打开，精确页返回后立即替换。

这使 50,000 条以内的常见查询在首次结果返回后具备与 Everything 相同的关键滚动属性：拖动过程读取进程内结果状态，不再逐页等待外部 IPC。超过窗口的超大结果集仍会在跨窗口时产生一次 IPC，这是为限制 SDK 结果缓冲内存而保留的边界。

## 16. Everything 的图标取法与第四阶段实施

用户运行验证后确认，文本已经跟得上视口，但左侧图标大量停留在占位线框上。重新针对图标路径做静态分析，得到的证据比第 8 节更具体。

### 16.1 直接证据

对 `everything.exe` 做 ASCII/UTF-16 字符串与导入表提取，图标相关证据集中在三处：

| 证据                                                             | 位置                     | 含义                                                       |
| ---------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------- |
| `SHGetFileInfoW`                                                 | SHELL32 导入表           | 唯一的 Shell 图标查询入口，没有 `ExtractIcon` 系列导入     |
| `ImageList_DrawEx`、`ImageList_GetIconSize`                      | COMCTL32 导入表（仅两项） | 图标直接从系统共享图像列表绘制，不逐个文件生成位图         |
| `SHGetFileInfo exception %08x`                                   | 调试字符串               | `SHGetFileInfoW` 是被单独包裹异常处理的独立步骤            |
| `add ext icon %s`                                                | 调试字符串               | **按扩展名登记图标**，不是按文件路径                       |
| `icon_shell_extensions`、`load_icon_priority`、`cached icons only %d` | 配置键                   | 图标线程优先级、shell 扩展开关、仅使用缓存图标三个可调项   |
| `fixed an issue with gathering icons for files with paths longer than 260 characters` | Changes.txt:79 | 长路径取图标曾是缺陷，说明图标查询确实以路径为输入并需要专门处理 |
| `added optional icon cache size`、`improved icon cache`          | Changes.txt:360/370      | 图标缓存容量可配置，且被专门优化过                         |

结论：Everything 没有为每一行生成一张图片。它用 `SHGetFileInfoW` + `SHGFI_SYSICONINDEX` 拿到系统共享图像列表中的**槽位下标**，然后用 `ImageList_DrawEx` 直接画那个槽位。昂贵的成本单位不是"每个文件"，而是"每个不同的图标"；而 `add ext icon %s` 表明绝大多数普通文件共用同一个按扩展名登记的图标。

### 16.2 DesktopGo 的差距

对照修改前的代码，同一批可见行要做的事完全不同：`get_path_icon_base64_windows` 对每个路径先 `exists()`，再 `SHCreateItemFromParsingName` + `IShellItemImageFactory::GetImage`，然后 GDI 取位图、转 RGBA、PNG 编码、Base64 编码。128 行不同扩展名的普通文件就是 128 次完整的 COM + 编码流程，而 Everything 只需要为其中出现过的扩展名各做一次。

更关键的是三处会让占位图标**永久留下**的行为：

- `exists()` 早退：Everything 索引里已删除的文件、超过 260 字符的长路径、无读取权限的目录，全部直接返回空串——而 Shell 关联表本来能给出图标。
- 空结果进缓存：Rust 与前端都把空串当作有效结果写入，此后该路径在整个进程生命周期内不再重试。
- 超时污染：10 秒超时后前端同样写入空串；快速拖动时每帧都可能发出一批 64 路径请求，堆积后极易超时。

### 16.3 第四阶段实施

按 Everything 的成本模型重建图标管线：

- 新增 `icons/shell_icon_windows.rs`：`SHGetFileInfoW` + `SHGFI_SYSICONINDEX` 取共享图像列表槽位，`SHGetImageList` + `IImageList::GetIcon` 渲染该槽位；按请求尺寸选择 `SHIL_SMALL/LARGE/EXTRALARGE/JUMBO`，避免自己重采样。
- 新增 `icons/search_icon_plan.rs`：把路径归类为 shell 命名空间项、缩略图、按扩展名共享、按路径独占四种来源。可执行文件、快捷方式、`.url`、`.ico`、文件夹按路径缓存；其余普通文件按扩展名缓存，对应 `add ext icon %s`。
- 重写 `icons/search_cache.rs`：三级有界 LRU——图标身份 → 槽位下标（4096）、槽位 → PNG（256）、无法用共享列表描述的项 → PNG（256）。**任何失败都不写入缓存**，因此下一次可见行扫描会重试。
- 普通文件的关联查询改用 `file.<ext>` 这样的合成短名，配合 `SHGFI_USEFILEATTRIBUTES`：不读磁盘、不触发第三方图标处理器，也顺带绕开 `MAX_PATH`（Changes.txt:79 记录的正是同一类问题）。
- 图片改用 `SIIGBF_THUMBNAILONLY | SIIGBF_INCACHEONLY`：只在 Windows 缩略图缓存已有图片时使用，取不到就退回扩展名图标，滚动过程中不再解码整张图片。
- `is_folder` 由前端从 Everything 结果携带过来，Rust 侧不再 `is_dir()` 探测磁盘。
- 前端 `visibleIconRequests.ts` 承载纯策略（选批、合并、重试计数），`useVisibleSearchIcons.ts` 只做调度：每动画帧一批、单批在飞、失败不入缓存、每行最多 3 次尝试、滚出视口即重置计数。
- 列表图标尺寸从 32 提升到 48，匹配 28 CSS 像素在 125%/150% 缩放下的实际需求。

同机实测（`SystemRoot` 混合样本，debug 构建）：

| 场景                             | 修改前            | 修改后    |
| -------------------------------- | ----------------- | --------- |
| 9 条混合样本（首次）             | —                 | 92.9 ms   |
| 同一批重复请求（全缓存命中）     | —                 | 1.3 ms    |
| 40 个互不相同的扩展名            | —                 | 60.9 ms   |
| 128 行同扩展名（`.txt`）         | 128 次完整提取    | 0.32 ms   |
| 超过 260 字符的路径              | 返回空串          | 2418 字节 |
| 无读取权限目录下的文件           | 返回空串          | 3778 字节 |
| 不存在的文件                     | 返回空串          | 750 字节  |

128 行同扩展名从"每行一次 COM + PNG 编码"变成一次查询加一次渲染，这正是 `add ext icon %s` 所描述的成本结构。
