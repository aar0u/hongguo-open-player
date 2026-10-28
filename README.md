# 🎬 红果开放播放器 (Hongguo Open Player)

[![CI](https://github.com/zfdang/hongguo-open-player/actions/workflows/ci.yml/badge.svg)](https://github.com/zfdang/hongguo-open-player/actions/workflows/ci.yml)
[![Release](https://github.com/zfdang/hongguo-open-player/actions/workflows/build-release.yml/badge.svg)](https://github.com/zfdang/hongguo-open-player/actions/workflows/build-release.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)

一款轻量、极速的红果短剧跨平台原生桌面播放客户端（支持 macOS 与 Windows）。无需安装安卓模拟器，内置高效流媒体解密与并发代理，提供 9:16 沉浸式竖屏观影体验与全集无缝畅播。

---

## ✨ 核心特性

* **🚀 免模拟器极速播放**：直接在桌面端原生直连播放，告别笨重的安卓模拟器；
* **🎬 实时流式解密代理**：内置基于 Spade-A 派生算法的 CENC-MP4 流式解密中间件，动态重写 MP4 容器（消除 `sinf` 还原为 `avc1`/`hvc1`），支持标准 HTTP Range 分片请求与 Seek 拖拽；
* **🔓 全集畅播**：突破网页端试看限制，结合匿名协议仿真获取整部剧（80~100+ 集）全部剧集；
* **⚡ 8路并发分块加速与无感预加载**：突破单连接速度瓶颈，分块下载秒级起播；播放当前集时后台预解密下一集，连播切集 0 毫秒等待；
* **📱 沉浸式竖屏影院**：9:16 黄金比例竖屏短剧窗口，微光暗黑影院视效；
* **⌨️ 快捷键对齐移动端**：
  * `空格` / `K`：播放 / 暂停
  * `↑` / `PageUp`：上一集
  * `↓` / `PageDown`：下一集
  * `←` / `→`：快退 / 快进 5 秒
  * `F`：全屏切换
* **🕒 本地进度记忆与收藏**：本地持久化保存每部短剧的观看历史、当前集数及精确秒数，支持继续播放与书架收藏；
* **🤖 自动化全平台 CI/CD**：内置 GitHub Actions，每次合并至 `main` 自动运行端到端测试并打包发布 macOS 与 Windows 原生 Release。

---

## 🏗️ 架构设计与文档

系统设计与参考资料请参阅 `docs/` 目录：

* [产品设计与技术架构](docs/产品设计与技术架构.md)
* [参考项目架构解析：hongguo-player](docs/hongguo-player-architecture.md)
* [参考项目架构解析：hongguo-drama](docs/hongguo-drama-architecture.md)
* [真机接口验证与方案报告](docs/验证与实现方案.md)

---

## 🚀 快速开始

### 方式 1：直接下载桌面版安装包 (推荐，开箱即用)

前往 [GitHub Releases](https://github.com/zfdang/hongguo-open-player/releases) 下载最新构建好的原生客户端，**无需打开浏览器，双击即看**：

#### 🪟 Windows 平台 (x64)
* **安装版**：下载 `红果开放播放器 Setup *.exe`，双击根据向导安装，自动生成桌面与开始菜单快捷方式；
* **绿色便携版**：下载 `红果开放播放器-*-win.zip`，解压后双击 `红果开放播放器.exe` 即可直接运行。

#### 🍎 macOS 平台 (Apple Silicon & Intel)
* **Apple Silicon (M1/M2/M3/M4 芯片)**：下载 `红果开放播放器-*-arm64.dmg`，双击拖入 `Applications` 即可运行；
* **Intel 芯片**：下载 `红果开放播放器-*.dmg` (或包含 x64 字样)；
* **免安装 ZIP 绿色版**：下载 `*-mac.zip`，解压后直接双击 `红果开放播放器.app` 启动。

### 方式 2：本地运行原生桌面客户端 (开发/调试)

```bash
# 1. 克隆仓库并安装依赖
git clone https://github.com/zfdang/hongguo-open-player.git
cd hongguo-open-player
npm install

# 2. 启动原生桌面应用 (Electron 独立原生窗口，自动适配 Windows / macOS)
npm run app
```

### 方式 3：直接构建各平台原生安装包

```bash
# 构建 Windows 安装包 (生成 Setup .exe 及便携 zip)
npm run build:win

# 构建 macOS 双架构安装包 (.dmg 及 .zip)
npm run build:mac

# 一键全平台构建 (macOS + Windows)
npm run build:all
```
构建产物均保存在 `dist-electron/` 目录中。

### 方式 4：纯后台服务 / Web 浏览器模式

* **启动服务**：`npm start`，随后在浏览器访问 `http://127.0.0.1:8899`
* **一键启动脚本**：
  * **macOS / Linux**：终端执行 `./start.sh`（自动检测依赖并唤起本地服务）
  * **Windows**：双击运行 `start.bat`

---

## 🧪 自动化测试 (E2E Verification)

项目内置了包含 7 项核心用例的全链路端到端自动化测试套件：

```bash
npm test
```

测试覆盖内容包括：
1. 前端静态单页资源交付验证；
2. 热门短剧目录获取与高可用容灾；
3. 关键词搜索与剧集列表解析；
4. 全量分集（80+ 集）数据获取；
5. 分集视频解析与 Spade-A 密钥派生；
6. 本地流媒体解密代理服务（HTTP 200 HEAD / HTTP 206 Range 分片 / ftyp 容器校验）；
7. 播放进度与收藏夹本地持久化。

---

## 📦 持续集成与发布 (CI/CD)

项目在 `.github/workflows/` 中配置了完备的工作流：

* **CI 流水线 (`ci.yml`)**：在分支提交或发起 PR 时，在 Ubuntu、Windows 与 macOS 三端、Node.js 20.x 及 22.x 下自动运行全链路自动化测试；
* **自动发布流水线 (`build-release.yml`)**：每当有代码合并到 `main` 分支或推送版本标签（`v*`）时，自动触发跨平台矩阵构建节点：
  1. 运行全链路端到端测试与接口校验；
  2. 自动递增版本编号（基于 tag 或 run number）；
  3. 自动化并行构建 Windows 与 macOS 双平台原生安装包：
     * Windows：`红果开放播放器 Setup *.exe`、`红果开放播放器 *.exe` (Portable)、`*.zip`
     * macOS：`红果开放播放器-*-arm64.dmg`、`红果开放播放器-*.dmg`、`*-mac.zip`
  4. 自动生成 SHA256 校验和清单，并将所有安装包附挂在 GitHub Releases 供用户直接下载。

---

## 💡 参考项目与致敬 (Acknowledgements & References)

在本项目的设计与开发过程中，参考了社区中相关优秀开源项目的实践：
* [`yangbin1322/hongguo-player`](https://github.com/yangbin1322/hongguo-player)：原第三方 macOS 客户端，提供了桌面端交互体验与原型设计参考；
* [`jackotom/hongguo-drama`](https://github.com/jackotom/hongguo-drama)：跨平台短剧客户端，提供了多片源设计与媒体处理思路参考；
* [`woshishiq1/drpys`](https://github.com/hjdhnx/drpy-node)：开源爬虫与媒体算法派生实践参考。

---

## ⚖️ 免责声明

本项目仅供个人学习、多媒体流处理与跨平台桌面应用开发技术交流研究。所有短剧音视频数据与元信息均源自公开网络服务。请支持正版内容。
