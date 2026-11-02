# ColorOS 大图标灰度底图

这三张 PNG 原样提取自本机 `OplusLauncher.apk` 17.3.12，作为普通大图标的底图，按目标表面尺寸拉伸，再叠加 alpha 为 `0xB2` 的图标主色。没有修改、旋转或重新编码资源；资源来源为 OPPO / ColorOS。

- APK：`D:/Project/other/ColorOS-AVD/work/rom-root/system_ext/priv-app/OplusLauncher/OplusLauncher.apk`
- APK SHA-256：`4a91e6e1e25efd0486095a658ca71ecf8e5cd50422232e02d35ee93f3decf828`
- ZIP 目录：`res/drawable-xxxhdpi-v4/`
- 研究记录：[大图标颜色分析](../../../docs/coloros-opluslauncher-large-icon-color-analysis.md)

| 文件                     | 原始尺寸 | SHA-256                                                          |
| ------------------------ | -------- | ---------------------------------------------------------------- |
| ux_icon_mt_layer_1x2.png | 240×820  | 60e6dacc74a7bba70ce404f3d71113fbdb869b4f5b87d79fc58f1e96d32cea32 |
| ux_icon_mt_layer_2x1.png | 820×240  | a2783fe013876cbdaa5cf1b9377a67ca5ae088b5caaaec6c842d5c9bf854a908 |
| ux_icon_mt_layer_2x2.png | 704×704  | 9b6f64432e7ae29df81548a62839023714cd0145c165b1ddec05370b701f7dd8 |

三张都是不透明 8-bit 灰度图。合成结果本身不透明；`--launchpad-icon-opacity` 是合成后的独立用户设置。这里的 `linear-gradient(同色, 同色)` 只承载均匀的半透明主色，所有二维明暗变化来自 PNG。
