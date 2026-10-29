<p><img src="build/icon.png" alt="红果开源播放器图标" width="96" height="96"></p>

# 红果开源播放器 (Hongguo Open Player)

[![CI](https://github.com/zfdang/hongguo-open-player/actions/workflows/ci.yml/badge.svg)](https://github.com/zfdang/hongguo-open-player/actions/workflows/ci.yml)
[![Release](https://github.com/zfdang/hongguo-open-player/actions/workflows/build-release.yml/badge.svg)](https://github.com/zfdang/hongguo-open-player/actions/workflows/build-release.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)

一款轻量、极速的红果短剧跨平台原生桌面播放客户端（支持 macOS 与 Windows）。无需安装安卓模拟器，内置高效流媒体解密与并发代理，提供智能画幅自适应、沉浸式影院视效与全集无缝畅播。

---

## 📸 界面预览 (Screenshots)

### 沉浸式影院播放（智能自适应画幅 & 选集列表）
![沉浸式影院播放](docs/screenshots/theater-playback.png)

### 热门短剧目录与分类检索
![热门短剧目录](docs/screenshots/catalog-overview.png)

### 快捷键操作与播放控制反馈
![播放控制与暂停状态](docs/screenshots/player-controls.png)

---

## ✨ 核心特性

* **🚀 免模拟器极速播放**：直接在桌面端原生直连播放，告别笨重的安卓模拟器；
* **🎬 实时流式解密代理**：内置基于 Spade-A 派生算法的 CENC-MP4 流式解密中间件，动态重写 MP4 容器（消除 `sinf` 还原为 `avc1`/`hvc1`），支持标准 HTTP Range 分片请求与 Seek 拖拽；
* **🔓 全集畅播**：突破网页端试看限制，结合匿名协议仿真获取整部剧（80~100+ 集）全部剧集；
* **⚡ 8路并发分块加速与无感预加载**：突破单连接速度瓶颈，分块下载秒级起播；播放当前集时后台预解密下一集，连播切集 0 毫秒等待；
* **📱 沉浸式影院视效**：智能画幅自适应（横屏 16:9 / 竖屏 9:16 均按最大视口等比铺满），支持一键全屏、双击全屏、铺满模式与选集侧栏收展；
* **⌨️ 快捷键对齐移动端**：
  * `空格` / `K`：播放 / 暂停
  * `↑` / `PageUp`：上一集
  * `↓` / `PageDown`：下一集
  * `←` / `→`：快退 / 快进 5 秒
  * `F` 或 `双击画面`：全屏切换
* **🕒 本地进度记忆与收藏**：本地持久化保存每部短剧的观看历史、当前集数及精确秒数，支持继续播放与书架收藏；
* **🖥️ 跨平台原生桌面支持**：同时支持 macOS（Apple Silicon 与 Intel 架构）及 Windows（x64），提供原生安装包及免安装便携版。

---

## 🏗️ 架构设计与文档

关于系统的详细设计、产品架构与运行指南，请参阅 `docs/` 目录：

* [🚀 快速开始与安装指南](docs/快速开始.md)
* [📐 产品设计与技术架构](docs/产品设计与技术架构.md)
* [🔍 参考项目架构解析：hongguo-player](docs/hongguo-player-architecture.md)
* [🔍 参考项目架构解析：hongguo-drama](docs/hongguo-drama-architecture.md)
* [🧪 真机接口验证与方案报告](docs/验证与实现方案.md)

---

## 💡 参考项目与致敬 (Acknowledgements & References)

在本项目的设计与开发过程中，参考了社区中相关优秀开源项目的实践与研究：

### 🔐 视频流解密与核心算法参考
* [`zhangbaio/hongguo`](https://github.com/zhangbaio/hongguo)：红果短剧协议解析与媒体解密研究项目，提供了 CENC 解密与 Android 接口分析参考；
* [`N3urda/hongguoTV`](https://github.com/N3urda/hongguoTV) / [`woshishiq1/drpys`](https://github.com/hjdhnx/drpy-node)：开源短剧爬虫与算法派生实践，提供了基于 Spade-A 派生 AES 密钥的计算逻辑参考；
* [`jackotom/hongguo-drama`](https://github.com/jackotom/hongguo-drama)：提供了 MP4 CENC 容器格式重写（消除 `sinf` 还原为 `avc1`/`hvc1`）及媒体处理参考。

### 🖥️ 客户端产品与交互设计参考
* [`yangbin1322/hongguo-player`](https://github.com/yangbin1322/hongguo-player)：原第三方 macOS 客户端，提供了 9:16 沉浸式竖屏观影体验与原型交互参考。

---

## ⚖️ 免责声明

本项目仅供个人学习、多媒体流处理与跨平台桌面应用开发技术交流研究。所有短剧音视频数据与元信息均源自公开网络服务。请支持正版内容。
