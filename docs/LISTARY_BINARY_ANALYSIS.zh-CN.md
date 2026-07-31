# Listary 6 静态分析与 DesktopGo 搜索排序对比

分析日期：2026-07-31

分析对象：

- 安装目录：`C:\Program Files\Listary\`（`listary-core.exe`、`Listary.exe`、`Listary.*.dll`）
- 用户配置：`C:\Users\<user>\AppData\Roaming\Listary\UserProfile\`
- 对照物：`D:\Program\Everything\Everything.ini`（用户实际在用的 Everything 配置）
- 对照代码：DesktopGo 当前搜索链路（`src/lib/search/`、`src-tauri/src/everything/`）

起因：搜索 `vscode` 在 DesktopGo 的文件列表里搜不到 `Visual Studio Code`，而 Listary 能；
搜索 `vs` 时一条 `…\gradle-8.12\docs\kotlin-dsl\…\-flavor` 反而排在第一。前者是能力缺失，
后者是缺陷（已另行修复，见第 10 节）。本文回答的是：Listary 凭什么排得准。

## 1. 结论摘要

1. **Listary 有显式的目录优先级机制，是一等公民，不是副作用。**
   `FolderPriorityRule { priority, folder }` 是它索引层的数据结构，配置项在
   `Preferences.json` 的 `/DiskSearch/FolderPriority`。
2. **优先级分两条独立的轴**：`search_*_priority` 决定「是否进入结果集」，
   `sort_*_priority` 决定「排在哪里」。低优先级的文件**默认不返回**，而不是返回后排到后面。
3. **优先级是预计算写进索引的**，不是查询时算的（`update_files_priority_for_folder`、
   `src/db/priority.rs`）。所以它既准又不花查询时间。
4. **匹配器是可插拔的一族**，包含字面（Boyer-Moore）、关键词、模糊（位图并行）、
   **拼音**、**模糊拼音** 五种。拼音搜索对中文用户是 DesktopGo 目前最大的单点缺失。
5. **打分分两层**：`MatchScore`（字符串匹配质量）与 `CombinedScore`（合成分），
   `score_by` 可选 `MatchScore` 或 `Combined`。
6. **Listary 自己也是跨进程架构**：.NET UI ↔ `listary-core.exe`（Rust）走 gRPC/HTTP2，
   而且**同样分页**（`max_results`、`Pagination`）。它和 DesktopGo 的关键差别不是
   「有没有 IPC 边界」，而是**打分发生在索引侧**，分页取的是已排好序的前 N 条。
7. Listary 的查询 API 是**会话式**的：`OpenSession` → `Search` → `GetSearchResults(分页)`
   → `ReleaseSession`。这正是 DesktopGo 用 `SearchResultSnapshot` 读 SDK 活缓冲
   所试图模拟、但缺少显式所有权标识的那个东西。
8. **Everything 侧没有任何目录加权能力。** 740 行 `Everything.ini` 中不存在任何
   relevance/boost/rank/weight/priority 语义的排序键；`folders=`、`exclude_folders=`、
   `include_only_files=` 在该机器上全为空。它唯一接近相关性的信号是 `run_count` /
   `date_run`。用户观察到的「关键目录被优化」，实际来自 `sort=Run Count` 降序。

## 2. 分析边界与证据等级

本次为静态、只读分析。没有执行 Listary 的任何二进制，没有附加调试器，没有读取
RocksDB 索引内容，没有抓取 gRPC 流量。字符串通过 ASCII 与 UTF-16LE 双向提取获得。

| 等级 | 含义 | 本文中的例子 |
| --- | --- | --- |
| 已确认 | 可由配置文件内容或二进制中逐字提取的字符串直接验证 | `FolderPriorityRule`、`FilePriority` 枚举值、`src/pinyin/mod.rs`、`sort=Run Count` |
| 高可信推断 | 多项字符串证据共同支持，但没有反汇编到控制流 | 优先级预计算写入索引、低优先级默认不返回、`CombinedScore` 的构成 |
| 未确认 | 当前证据不足以证明 | 内置默认规则表的具体内容、各档权重数值、`MatchScore` 公式 |

Listary 闭源。下文出现的所有 `snake_case` 字段名、`PascalCase` 类型名和 `src/**.rs`
路径都是从二进制中逐字提取的原文（Rust 的 serde 字段名表与 `panic!` 位置信息会保留在
可执行文件里）；**对这些名字含义的解读属于推断**，本文会逐处标注。

## 3. 进程与文件布局

该机器上同时运行 Listary 与 Everything，两者**完全独立**：

| 进程 | 内存 | 角色（推断） |
| --- | --- | --- |
| `listary-core.exe` | 474 MB | Rust 写的索引与搜索核心 |
| `Listary.exe` | 390 MB | .NET/WPF 界面 |
| `Listary.Service.exe` | 19 MB | 服务（提权任务） |
| `ListaryHookHost32/64.exe` | 5 MB | 进程注入宿主（文件对话框增强） |
| `Everything.exe` ×2 | 701 MB + 7 MB | 用户自己的 Everything（DesktopGo 也用它） |

Listary 自建索引，**不依赖 Everything**：

```
%APPDATA%\Listary\UserProfile\Cache\<机器名>\Index\    378 MB   RocksDB（*.sst / CURRENT / IDENTITY / LOCK / LOG）
%APPDATA%\Listary\UserProfile\Settings\PathHistory.json   84 KB
%APPDATA%\Listary\UserProfile\Settings\SearchHistory.json 14 KB
%APPDATA%\Listary\UserProfile\Settings\Preferences.json  1.9 KB
```

对照：Everything 的索引是 `Everything.db`，327 MB。两者规模同量级。

`Preferences.json` 采用「相对默认值的差异」格式，每节都是
`{ Deletions, Moves, Insertions, Updates }` 四个列表。该机器上
`FolderPriority` / `FileNamePriority` / `SearchFilter` 的四个列表**全为空** ——
即用户从未改过优先级配置，Listary 用的是**内置默认规则**。这一点很重要：
用户感知到的「关键目录被特殊优化」是开箱即有的，不需要任何配置。

## 4. 优先级模型（本文核心发现）

### 4.1 优先级分档

从 `listary-core.exe` 提取的原文：

```
IgnoredLowNormalInternalHighHighFilePriority…
```

即 `enum FilePriority { Ignored, Low, Normal, Internal, High }`。`Internal` 一档
（推断）用于 Listary 自己的条目；`Ignored` 一档意味着**存在完全不参与搜索的文件**。

### 4.2 两条独立的轴

紧随其后的字段名原文：

```
search_priority   search_path_priority   search_attribute_priority   search_name_priority
sort_priority     sort_path_priority     sort_attribute_priority     sort_name_priority
```

同一个文件因此携带**两组**优先级：一组决定它能否被搜到，一组决定它排在哪。
DesktopGo 目前没有任何等价概念 —— 所有命中一律进入结果集，排序只在客户端做。

### 4.3 四类规则

`PriorityRules` 结构的原文字段名：

```
PriorityRules
  search_folder_path_rules          sort_folder_path_rules
  search_attribute_rules            sort_attribute_rules
  search_name_regex_rules           sort_name_regex_rules
  search_file_name_extension_rules  sort_file_name_extension_rules

FolderPriorityRule      { priority, folder }
FileAttributePriorityRule { attribute }
FileNameRegexPriorityRule { regex, apply_to_folders, apply_to_files }
FileExtensionPriorityRule { extension }
```

四个维度：**目录路径**、**文件属性**（隐藏/系统/临时等，参见 4.5 的属性表）、
**文件名正则**、**扩展名**。每条规则都能独立作用于 search 轴或 sort 轴。

用户猜测的「针对 Start Menu、Desktop 这些关键目录做了特殊优化」——
机制层面完全成立，`FolderPriorityRule` 就是干这个的。

### 4.4 优先级是预计算写进索引的（高可信推断）

证据：

- 模块路径 `listary-core\src\db\priority.rs` —— priority 属于 **db** 层，不属于查询层
- 函数名 `update_files_priority_for_folder`，以及它的错误分支
  `update_files_priority_for_folder: File not found in file_db:`

推断：每个文件在索引里自带 priority 字段；修改一条目录规则会触发对该目录下文件的
**批量回写**。查询时不需要重新计算任何优先级，匹配完直接按现成字段排序。

这解释了为什么它「又快又准」—— 准确性的成本被移到了索引更新期。

### 4.5 低优先级默认不进结果集（高可信推断）

`IndexedSearchSearchParams` 的原文字段名：

```
query  string_matcher_type  max_results  only_search_in_paths
search_for_folders  search_for_files  file_extensions  only_match_base_name
score_by  search_for_low_priority_files  folder_parts
date_modified_start  date_modified_end
```

`search_for_low_priority_files` 是一个**开关**。结合 `FilePriority::Ignored` 一档，
推断：低优先级文件默认**不返回**，需要显式请求才会出现。

这是 Listary 体验好的很大一部分原因 —— 用户从未见过被过滤掉的噪音。也正是
DesktopGo 目前最缺的一层：`node_modules`、包管理器缓存、生成的 API 文档全都
和真正想找的文件平等竞争。

引申的文件属性表（原文，供规则参考）：

```
READONLY HIDDEN SYSTEM DIRECTORY ARCHIVE DEVICE NORMAL TEMPORARY SPARSE_FILE
REPARSE_POINT COMPRESSED OFFLINE NOT_CONTENT_INDEXED ENCRYPTED INTEGRITY_STREAM
```

注意 `NOT_CONTENT_INDEXED` 与 `TEMPORARY` —— 这两个 NTFS 属性本身就是「不重要」的
系统级信号，DesktopGo 也能免费拿到。

## 5. 索引架构

### 5.1 直接解析 NTFS MFT

原文中存在完整的 MFT 记录结构定义：

```
FILE_RECORD_HEADER_WITH_ID
magic usa_offset usa_count usn sequence_number link_count
attributes_offset bytes_in_use bytes_allocated base_file_record next_attribute_number
AttributeStandardInformation AttributeFileName AttributeIndexRoot AttributeIndexAllocation
AttributeReparsePoint AttributeData AttributeBitmap …

NtfsVolumeIndex { force_rebuild_index, volume_name, volume_handle,
                  async_volume_handle, volume_mft_data_handle }
```

与 Everything 同路线：绕过 Win32 目录遍历，直读 `$MFT`。

### 5.2 USN 日志增量更新，且有硬链接语义

变更类型枚举原文：

```
FileCreation  FileCreationWithPath  FileDeletion  FileDeletionWithPath
HardLinkCreationOrDeletion  FileMove  FileNameChange  FileMoveOrNameChange
FileMoveOrNameChangeWithPath  HardLinkMoveOrNameChange
FileLastWriteTimeChange  HardLinkLastWriteTimeChange
FileAttributesChange  HardLinkAttributesChange  MetaDataChange  LogError
```

硬链接是一等公民（另有 `src/db/hard_link.rs`、`HardLinkNotFoundInDB`、
`NoHardLinkSlotAvailable`）—— 同一份数据的多个路径被显式建模，而不是当成两个文件。

### 5.3 索引里存的是真正的目录树

```
FolderTreeNode { first_child, next_sibling }
错误分支：BrokenFolderTreeNode  ParentNotFoundInFolderTree
         FileNotFoundInFolderTree  MoveFolderToSubfolder  DeleteRootCf
```

first-child / next-sibling 链式树，不是扁平路径字符串表。两个直接好处（推断）：
路径还原不用存全路径，以及 4.4 的「按目录批量更新优先级」只需遍历一棵子树。

### 5.4 存储引擎是 RocksDB

大量 rocksdb 原文（`block_cache`、`blob_cache`、`LRUCache`、`ChargedCache`、
`bottommost_temperature`、`Compacting %s, score %.2f`），加上 `DeleteRootCf`
中的 `Cf` = column family。持久化、增量、支持列族分区，不需要每次重建。

### 5.5 非 NTFS 路径有独立的调度式索引

```
CustomFolderIndex { update_type, update_interval, update_time_of_day,
                    update_day_of_week, watch }
```

网络盘、非 NTFS 卷走定时重扫 + 监听。Everything 有对应的 `folders=` 配置，
DesktopGo 无（也不需要，它只是 Everything 的消费者）。

## 6. 字符串匹配器家族

`src/string_matcher/` 下的模块（原文路径）：

| 模块 | 作用（推断） |
| --- | --- |
| `bm_searcher.rs` | Boyer-Moore 字面子串搜索，最快路径 |
| `keyword_string_matcher.rs` | 多关键词（空格分隔）匹配 |
| `fuzzy_string_matcher.rs` | 模糊匹配 |
| `pinyin_searcher.rs` | **拼音搜索** |
| `fuzzy_pinyin_searcher.rs` | **模糊拼音搜索** |

另有 `src/fuzzy/position_bitmap.rs` 与枚举值 `KeywordFuzzy`、`FuzzyStringMatcher`。
`position_bitmap` 说明模糊匹配用**位并行**实现（Bitap 家族，与 fzf 同族），
不是朴素双指针 —— 这是能对全索引跑模糊匹配还不卡的前提。

`string_matcher_type` 是查询参数（见 4.5），所以匹配器在**每次查询时可切换**。

### 6.1 拼音搜索（对中文用户最关键的一项）

`src/pinyin/mod.rs` 独立成模块，二进制里还嵌了完整的拼音音节表，例如：

```
…encaoduyingpengzuiheicengsaicarangnangtuankundebenhuaizhuiche…
…kuaisonggangtalouchouqiongxinyanjingqingshanyezhuojuewenzhengyin…
```

以及一张按码点排列的汉字→拼音映射（推断，未逐字验证映射关系）。
配合 `fuzzy_pinyin_searcher.rs`，推断支持全拼与首字母缩写两类输入
（如 `wenjian` / `wjj` 匹配「文件夹」）—— 具体规则未确认。

DesktopGo 完全没有拼音能力。对一个中文用户的桌面启动器来说，这大概是
比子序列匹配更值钱的一项。代价是要引入拼音表（体积与首次加载成本）。

### 6.2 变音符号归一化

`Listary.Common.dll` 中有 `RemoveDiacritics` —— `é` → `e` 之类的归一化。
Everything 有对应的 `match_diacritics` 开关（该机器上 `home_match_diacritics=0`，即关闭）。

### 6.3 路径分段匹配

搜索参数里有 `folder_parts`，配合枚举 `StringMatch | OrderedFolderParts`。
推断：支持「按路径层级有序匹配」，即 `proj\vscode` 这类查询按目录段依次匹配，
而不是把整条路径当一个字符串。DesktopGo 的 `matchPath` 只是把整条路径当字符串。

## 7. 打分与排序

### 7.1 两层分数

Rust 侧原文：

```
src/indexed_search/score_based_searcher.rs
SearchParams … MatchScore  Combined      ← enum ScoreBy
"Invalid score by: "                     ← 解析错误信息
"] max score %.2f"
```

.NET 侧原文（`Listary.Common.dll`）：

```
StringMatchScoreRules   MatchScore   CombinedScore   UseMatchScore   BadMatchScore
```

推断的模型：

1. `MatchScore` —— 纯字符串匹配质量（哪些位置命中、是否在词首、是否连续）
2. `CombinedScore` —— `MatchScore` 与 priority（以及可能的使用历史）合成
3. `score_by` 让调用方选择按哪个排；`BadMatchScore` 是「未命中」哨兵值
4. `StringMatchScoreRules` 说明**打分规则本身是配置化的**，不是硬编码常量

具体权重与公式**未确认**。

### 7.2 使用历史

`PathHistory.json`（84 KB，远大于其他配置）与 `SearchHistory.json`（14 KB）
存在于 .NET 侧配置目录。推断：Listary 记录用户实际打开过的路径并用于加权
（frecency）。未确认它是否参与 `CombinedScore`，也未解析文件内部结构
（含用户个人路径，本次刻意未导出内容）。

对照：Everything 侧的同类信号是 `run_count` / `date_run`，存在 `Everything.db` 里，
而用户的 Everything GUI 正是 `sort=Run Count` + `sort_ascending=0`（降序）。

## 8. 会话式查询 API

gRPC 侧原文（`src/grpc/mod.rs`）：

```
OpenSessionParams { session_id }
IndexedSearchSearchParams { … }
IndexedSearchGetSearchResultsParams { sort_by, sort_descending, pagination_params }
PaginationParams { length }
ReleaseSessionParams
错误信息："Session not found"、"Session  already exists"
```

配合 .NET 侧引用的 `Grpc.Net.Client` / `Google.Protobuf` / h2 (HTTP/2) 栈，
可以确认：**UI 与核心是两个进程，走 gRPC 通信，并且结果集分页拉取。**

这一点值得单独强调，因为它推翻了一个直觉上的解释：

> Listary 排得准，不是因为它「没有前后端分离」。

它同样有 IPC 边界、同样有 `max_results`、同样分页。真正的差别只有一个：
**打分发生在持有数据的那一侧**，分页取的是「已排好序的前 N 条」，
而不是「先把全量搬过边界再排」。

会话模型还顺手解决了所有权问题：结果集由 `session_id` 显式标识，
`OpenSession` / `ReleaseSession` 界定生命周期，不存在「这批结果属于哪次查询」的歧义。

## 9. Everything 侧的对照结论

在 `D:\Program\Everything\Everything.ini`（740 行）中检索
`relevance|boost|rank|weight|priority|score|favorite`，唯一命中的是
`load_icon_priority`、`load_thumbnail_priority`、`load_fileinfo_priority`、
`db_update_thread_priority` —— **全是线程/加载优先级，与排序无关。**

目录相关配置在该机器上全为空：

```
folders=
exclude_folders=
include_only_files=
exclude_files=
exclude_list_enabled=1        （启用了排除表，但表是空的）
```

Everything 唯一接近相关性的能力：

```
sort=Run Count        ← 用户当前的排序方式
sort_ascending=0      ← 降序
run_count / date_run 列、view_sort_by_run_count_keys、
result_list_focus_highest_run_count_result_keys（专门的跳转到最高运行次数结果的快捷键）
```

**结论：Everything 的数据模型里不存在「目录重要性」这个概念。**
用户观察到的「Start Menu、Desktop 的东西总在前面」，机制是运行次数降序 ——
那些目录里的条目正是用户会去启动的，所以运行次数天然高。目录与排序位置是
相关关系，不是因果。

## 10. 三方对比

| 能力 | Listary | Everything | DesktopGo（当前） |
| --- | --- | --- | --- |
| 自建索引 | 有（RocksDB 378 MB） | 有（`Everything.db` 327 MB） | 无，消费 Everything |
| 目录优先级 | `FolderPriorityRule` | **无** | **无** |
| 扩展名/属性/正则优先级 | 有（三类规则） | 无 | 无 |
| 低优先级过滤 | 有（默认开启） | 无 | 无 |
| 字面子串匹配 | Boyer-Moore | 有 | 转发给 Everything |
| 模糊/子序列匹配 | 位并行（`position_bitmap`） | **无** | 仅快捷方式（Fuse.js） |
| 拼音搜索 | 有（全拼 + 模糊） | 无 | **无** |
| 路径分段匹配 | `OrderedFolderParts` | 整串 `match_path` | 整串 `matchPath` |
| 使用历史加权 | `PathHistory`（84 KB） | `run_count` / `date_run` | 仅快捷方式（`shortcutUsage.ts`） |
| 打分位置 | 索引侧 | 无打分 | **客户端（JS）** |
| 分页 | 会话 + `Pagination` | `SetOffset/SetMax` | 有，但相关性需要全量 |
| 结果集所有权标识 | `session_id` | 仅 reply id | 曾复用常量 reply id（已修） |

### 10.1 已在本轮修掉的三处（与本文分析同一条链路）

1. `query.rs` —— reply id 由常量改为每次查询递增。原先所有 `offset=0` 的搜索共用
   `REPLY_ID_COUNT = 1`，被取消的旧查询的回复无法与当前查询区分，会被认领进 SDK
   结果缓冲并交给当前请求。这就是搜 `vs` 出现 `-flavor` 的机制。
2. `worker.rs` —— `CompleteSnapshot` 走大结果集分支时未取消在飞请求，会丢掉
   上一个请求的 `Sender`，调用方收到 `Disconnected`。
3. `relevance.ts` —— rank 4（完全未匹配）不再按名称长度排序。原先「名称最短者」
   会被顶到第一位，正是 `-flavor`（7 字符、以 `-` 开头）排第一的直接原因。

## 11. DesktopGo 能复刻什么，不能复刻什么

### 11.1 能低成本复刻

**目录 / 扩展名优先级表。** priority 的输入是**路径**，而每条命中的完整路径
DesktopGo 本来就有（`SearchHit.path`）。所以第 4 节整套机制可以在我们这一侧重建：

- 高：Start Menu、Desktop、用户文档、Program Files、`.lnk` / `.exe`
- 低/忽略：`node_modules`、`.git`、`target`、`dist`、`AppData\Local\Temp`、
  `.m2`、`.gradle`、`wrapper\dists`、`.html` / `.js` / `.map` / `.class` / `.d.ts`

规则表建议做成可配置（对齐 `FolderPriorityRule` 的形状：`{ priority, folder }`），
默认内置一套 —— 与 Listary 一致，用户不配置也有效果。

**run count 接进相关性。** DesktopGo 已经在写运行次数
（`record_search_result_run` → `Everything_IncRunCountFromFileNameW`，`runtime.rs:284`），
但 `relevance` 被映射成 `SORT_NAME_ASCENDING`（`api.rs:160`），把这个信号整个扔掉。
现成的信号，只差读取。快捷方式侧已有同思路的 `compareShortcutUsage`（`shortcutUsage.ts:97`）。

**fzf 式打分器。** 词首加分、连续加分、间隔扣分、长度扣分。纯函数，易测。
可以先接到快捷方式搜索（解决 `vscode` → Visual Studio Code），再考虑文件搜索。

### 11.2 复刻不了 / 有硬约束

**低优先级过滤会破坏当前的虚拟列表契约。** Listary 在索引侧过滤，返回的
`max_results` 与总数自然一致。DesktopGo 只能在拿到结果**之后**过滤，而
`SearchResultsList` 的高度和索引是按 Everything 返回的 `totalResults` 撑起来的
（`getItemAt(index)` 取不到就画占位骨架）。客户端过滤会让 `totalResults`
与实际可显示条数脱节、索引错位。

可行的替代：**降权而非过滤**（低优先级排到末尾），或者**分组折叠**
（「其他结果 (N)」可展开）。若要真过滤，必须先让分页层以「已过滤后的序号」为准，
这与 11.3 是同一件事。

**预计算进索引做不到。** 我们不拥有索引。每次查询都得对当前页/当前结果集重算
priority。好在这是纯字符串前缀判断，成本可以忽略。

**拼音表要自己带。** Listary 把音节表编进了二进制。DesktopGo 若要支持，
需要引入拼音数据（体积、首次加载、以及多音字处理）。

### 11.3 真正对的高度：排序下沉到 Rust，只传可见窗口

Listary 的会话式 API 指出了正解。DesktopGo 当前为了在 JS 里排序，必须先把
全量结果搬过 IPC（`get_complete_search_snapshot`），由此产生：
`set_max` 的 50000 下限、`MAX_COMPLETE_SEARCH_RESULTS = 100_000` 上限、
只存元数据却读 SDK 活缓冲的 `SearchResultSnapshot`、以及跨页排序不一致。

若改为在 Rust 侧对 SDK 结果集算分（只读文件名即可）、排好序、只序列化可见窗口：

- 上述整套脚手架可以删除
- 相关性变成全局的，不再是「每页内部」的
- 结果集数量与传输量解耦，100 万条也只传几十条
- 顺带获得会话语义：结果集由一个显式 id 拥有，不再有归属歧义

代价：`useSearch.ts` 的分页缓存与 `resultCache.ts` 需要重写，改动跨整条链路。

## 12. 落地进度

以下条目建议合并进 `SEARCH_OPTIMIZATION_ROADMAP.zh-CN.md`（现有 S-06「搜索容错和别名」
与 S-11 重叠，可合并）。S-09 ~ S-11 已在本轮实现。

| 编号 | 优先级 | 状态 | 事项 | 验收标准 |
| --- | --- | --- | --- | --- |
| S-09 | P0 | 已完成 | 路径与扩展名优先级表 | 内置默认规则；包管理器缓存、生成文档、`node_modules` 降权到普通结果之后；规则表可由调用方替换；只降权不过滤，`totalResults` 契约不变 |
| S-10 | P0 | 已完成 | 运行次数接入相关性 | `relevance` 读取 Everything 的 run count 并封顶加权；匹配质量相同时常用文件靠前 |
| S-11 | P1 | 已完成（仅快捷方式） | fzf 式打分器 + 词首缩写匹配 | `vscode` 命中 `Visual Studio Code`、`idea` 命中 `IntelliJ IDEA`、`et` 命中 `Everything`；词首/camelCase/连续/间隔四类加权有单测；文件搜索尚未接入 |
| S-12 | P1 | 待开发 | 拼音搜索（快捷方式优先） | 全拼与首字母均可命中；拼音数据体积与首次加载有明确预算 |
| S-13 | P2 | 待开发 | 排序下沉 Rust，只传可见窗口 | 删除完整快照链路；相关性全局一致；百万级结果集下传输量与结果数无关 |

### 12.1 本轮改动清单

| 文件 | 改动 |
| --- | --- |
| `src-tauri/src/everything/ipc/api.rs` | 可选加载 `Everything_GetResultRunCount`（旧 DLL 上退化为 0） |
| `src-tauri/src/everything/ipc/query.rs` | 请求标志加 `EVERYTHING_REQUEST_RUN_COUNT`，逐条提取运行次数 |
| `src-tauri/src/everything/models.rs` | `SearchHit.run_count` |
| `src/lib/search/types.ts` | `SearchHit.runCount` |
| `src/lib/search/priority.ts`（新） | 对齐 `FolderPriorityRule` / `FileExtensionPriorityRule` 的规则表与解析 |
| `src/lib/search/fuzzyScore.ts`（新） | O(名称长度 × 关键词长度) 的子序列打分 DP |
| `src/lib/search/bestMatch.ts`（新） | 「最佳匹配」的统一条目模型与混排打分 |
| `src/lib/search/relevance.ts` | 分档排序改为 Listary 式 `CombinedScore` |
| `src/lib/search/iconSearch.ts` | 以 `fuzzyScore` 取代 Fuse.js 的弱模糊兜底 |
| `src/lib/search/useSearch.ts` | 暴露 `bestMatchCandidates`（相关性头部 200 条） |
| `src/lib/search/useShortcutSearchResults.ts` | 「全部」模式下合并快捷方式、Everything 高优先级命中与目录表 |
| `src/lib/search/useLauncherCatalog.ts`（新） | 目录表的会话级获取与丢弃 |
| `src-tauri/src/launcher_catalog.rs`（新） | 枚举开始菜单/桌面/快速启动，返回完整条目表 |
| `src-tauri/src/commands/search.rs` | 新增 `get_launcher_catalog` 命令 |
| `src/components/search/ShortcutSearchResults.tsx` | 渲染 `BestMatchItem`，标题改为「最佳匹配」 |
| `src/components/search/FileResultContextMenu.tsx`（新） | 文件条目的右键菜单（打开／打开所在文件夹／复制路径／原生菜单） |

### 12.2 最佳匹配的合并规则

「最佳匹配」（原「最佳快捷入口」）现在同时收两类候选，按同一套分数混排：

| 候选 | 准入条件 | 分数构成 |
| --- | --- | --- |
| 启动台图标 | fzf 子序列命中名称/目标路径/路径 | fzf 分 + 250（高优先级）+ 40（用户亲手摆放）+ 启动次数加权 |
| Everything 高优先级命中 | `resolveSearchPriority` 为 `high`，且 fzf 命中 | fzf 分 + 250（高优先级）+ 运行次数加权 |
| 高优先级目录条目表 | 同上（目录表按构造全部落在高优先级目录里） | fzf 分 + 250（高优先级） |

第三类是绕过 Everything 的关键。Everything 只做**字面子串匹配**，`Visual Studio Code`
里有空格，所以 `vscode` 永远召回不到它 —— 优先级和 fzf 只能对已召回的结果重排，
没法让它多召回。所以 Rust 侧直接枚举高优先级目录（`launcher_catalog.rs`，走
`SHGetKnownFolderPath` 拿开始菜单/桌面/快速启动的真实位置，桌面被 OneDrive
重定向也能拿对），把几百条条目整体交给前端，由前端用同一套 fzf 打分在内存里匹配。
对齐 Listary 的 `only_search_in_paths`（第 4 节）与它独立的应用索引。

目录表**只在一次面板会话内有效**：面板打开时拉取，关闭时在 effect 清理函数里丢弃，
下次进面板重新读。开始菜单和桌面随时可能增删，刻意不做跨会话缓存。

两类都按「高优先级」计入同一项 `HIGH_PRIORITY_BONUS`：文件命中要通过优先级表判定为
high 才准入，启动台图标是用户亲手摆上去的、本身等同于 high。这一项对排序没有净影响，
写出来是为了让加权在代码里对称可见。使用历史加权用同一套步长与封顶（每次 +8，
上限 +160），所以量纲可比。同一条路径同时来自两侧时按路径去重，保留分数更高的那条。

候选池由相关性排序在打分时**顺带收集**（`RankedSearchPage.highPriorityItems`）——
优先级本来就要为每条结果算一次，所以收集本身零成本，且**不做任何数量截断**：
当前已加载结果里的全部高优先级命中都会参与打分，拿到完整快照时就是整个结果集。
分页加载时新出现的高优先级命中按路径去重并入。

代价在打分那一步：`collectBestMatches` 要对每个候选跑一遍 fzf DP。因为高优先级
只由目录决定（`/start menu/`、`/desktop/`、`/quick launch/`），候选池的天花板就是
这几个目录里的条目数 —— 通常几百条，对应下表最上面一行，无感。

| 候选数 | 优化前 | 优化后 |
| --- | --- | --- |
| 200 | 2.8 ms | 1.4 ms |
| 1 000 | 9.8 ms | 3.1 ms |
| 5 000 | 47.2 ms | 16.9 ms |
| 20 000 | 188.3 ms | 67.4 ms |
| 100 000 | 959.5 ms | 375.3 ms |

下面几行是为「万一把 high 放宽到扩展名或更大的目录」留的参照。曾经按扩展名给
`.lnk` / `.exe` 判 high，那会把全盘可执行文件都拉进候选池，正是落到表格右下角的原因；
现已移除，扩展名规则只用于降权生成物。

打分器本身也按热路径重写过：整串一次性小写化（原先每个字符都调
`toLocaleLowerCase`）、码点存进复用的 `Uint32Array` / `Float64Array` 而不是每步新建
数组、DP 之前先做 O(n) 子序列快速排除、名称命中后不再对长路径跑 DP。

只有「全部」模式混入文件命中；「快捷入口」标签页仍然只有启动台图标。
文件条目的图标走结果列表同一套 Shell 图标管线（`useVisibleSearchIcons`）。

### 12.3 已知遗留

1. **相关性仍然是每页内部的。** 完整快照拿不到时（结果数超过
   `MAX_COMPLETE_SEARCH_RESULTS`），优先级与运行次数只在当前页内重排，
   第二页仍可能整页都是低优先级内容。根治在 S-13。
2. **`fuse.js` 已无引用。** 移除依赖需要单独确认，本轮未动 `package.json`。
3. **默认规则表是按经验写的**，不是 Listary 的原表（见第 13 节第 1 条）。
   目录规则用的是路径子串匹配，理论上可能误伤名字里含 `dist`、`.git` 等片段的
   正常目录。
4. **最佳匹配的文件候选来自已加载的结果**，数量不截断但覆盖范围受限：
   拿不到完整快照（结果数超过 `MAX_COMPLETE_SEARCH_RESULTS`）时只能覆盖已翻过的
   分页，没加载到的分页里若有高优先级命中就进不了最佳匹配。S-13 之后才能彻底解决。
5. **非相关性排序下最佳匹配只有启动台图标**。高优先级命中是相关性打分的副产物，
   用户显式选了「名称升序」等排序时不再收集。

## 13. 未确认事项

1. **内置默认优先级规则表的具体内容。** `Preferences.json` 只记录用户改动，
   默认表未出现在 `listary-core.exe` / `Listary.exe` 的明文字符串中，
   可能位于 .NET 托管资源或由代码按 `Environment.SpecialFolder` 生成。
   因此「Start Menu 被标为 High」仍属推测。
2. 各优先级档的权重数值、`MatchScore` 与 `CombinedScore` 的公式。
3. 拼音匹配的具体规则（全拼 / 首字母 / 多音字策略）。
4. `PathHistory.json` 是否参与 `CombinedScore`（未解析其内部结构）。
5. 二进制中存在完整的 UAX #29 词边界属性表（`ALetter`、`MidNumLet`、
   `Hebrew_Letter`、`WSegSpace` 等），但这也可能只是 Rust `regex` crate 的
   Unicode 依赖带入的，**不能据此断定它用词边界做打分加权**。
6. `FilePriority::Internal` 一档的用途。

## 14. 复现方法

```bash
# 1. 确认进程与索引规模
tasklist | grep -iE "listary|everything"
du -sh "$APPDATA/Listary/UserProfile/Cache"

# 2. 优先级配置节（该机器上四个 diff 列表均为空）
python -c "import json;print(json.load(open(r'…/Preferences.json',encoding='utf-8-sig'))['DiskSearch'])"

# 3. 从二进制提取 ASCII + UTF-16LE 字符串后检索
#    关键词：FolderPriority / FilePriority / string_matcher / score_by / pinyin / Session
#    （本文所有 snake_case 与 src/**.rs 原文均来自此步）

# 4. Everything 侧对照
grep -inE "relevance|boost|rank|weight|priority|score" "D:/Program/Everything/Everything.ini"
grep -nE "^sort" "D:/Program/Everything/Everything.ini"
```

