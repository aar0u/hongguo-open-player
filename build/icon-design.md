# 应用图标

全新设计采用展开的红果轮廓与播放三角形，搭配珊瑚红渐变和深酒红圆角底座。外缘保留透明留白，不包含文字、电影场记板或原图标元素。

## 文件

- `icon.png`：1024×1024、透明 RGBA 主图。
- `icon.icns`：macOS 应用图标，含 16px 至 1024px 的标准分辨率。
- `icon.ico`：Windows 图标，含 16、24、32、48、64、128、256px。
- `../src/client/assets/app-icon.png`：256px 应用内标识及 Linux 窗口图标。
- `../src/client/assets/favicon-32.png`：32px 网页标签图标。

修改主图后，在装有 ImageMagick 的 macOS 环境运行 `./scripts/build-icons.sh`，重新生成平台及客户端资源。保持透明通道和四周留白，不要拉伸或添加额外的外框。

## 设计提示词

Use case: logo-brand. Asset type: a single finished 1024x1024 desktop application icon master for 红果开放播放器, an independent short-drama video player for macOS and Windows. Create an entirely new identity without using or referencing any existing icon. Design a premium, restrained, instantly legible icon: a bold warm coral-red fruit-inspired sculptural loop, like two rounded folded segments opening around a crisp ivory right-pointing play triangle in the center. A subtle tiny leaf-shaped notch integrated in the top curve suggests a red fruit without a literal fruit illustration. Place the emblem inside a deep burgundy-to-near-black rounded-square app tile with beautiful subtle depth, smooth large corner radii, precise optical centering. The red form is bold and tactile, the white play triangle large and simple enough to read at 16px. Soft controlled lighting from upper left; rich red/coral gradients, no excessive highlights. Clean geometric silhouette, no delicate details, no movie clapperboard, no film reel, no lettering, no letters, no Chinese characters, no numbers, no watermark, no extra decorative objects. Straight-on orthographic icon, no perspective, no display mockup. Composition: tile centered, occupies about 84 percent of square canvas width with even fully transparent margins; exterior rounded corners and margins must be genuinely transparent alpha, not white or checkerboard. One icon only. Ready for production desktop use.
