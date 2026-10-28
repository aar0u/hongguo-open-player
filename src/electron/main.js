// SPDX-License-Identifier: GPL-3.0-only
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const { startServer } = require('../server/index.js');

// 必须在 app.whenReady 之前注入 Chromium 硬件解码与 macOS VideoToolbox HEVC (H.265) 解码开关
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,PlatformHEVCEncoderSupport');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;
let serverInstance = null;

async function createWindow() {
  // 1. 启动本地内嵌 Node Express 引擎
  const res = await startServer(8899);
  serverInstance = res.server;
  const port = res.port;

  // 2. 创建原生跨平台桌面窗口 (macOS / Windows / Linux)
  const isMac = process.platform === 'darwin';
  const windowOptions = {
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: '红果开放播放器',
    backgroundColor: '#0f1015',
    autoHideMenuBar: !isMac, // Windows 下默认隐藏传统菜单栏，保持纯粹现代深色观影质感 (按 Alt 唤出)
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      devTools: true
    },
    show: false // 待内容准备完毕后再优雅显示，避免白屏
  };

  if (isMac) {
    windowOptions.titleBarStyle = 'hiddenInset'; // 优雅的 macOS 胶囊红绿灯一体化标题栏
    windowOptions.trafficLightPosition = { x: 16, y: 16 };
  } else {
    // Windows 平台专属配置
    windowOptions.icon = path.join(__dirname, '../../build/icon.ico');
  }

  mainWindow = new BrowserWindow(windowOptions);

  // 3. 加载本地应用页面
  const appUrl = `http://127.0.0.1:${port}`;
  await mainWindow.loadURL(appUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 外部链接在系统默认浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 构建原生 macOS 菜单栏
function setupMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [
          {
            label: '红果开放播放器',
            submenu: [
              { role: 'about', label: '关于 红果开放播放器' },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 红果开放播放器' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 红果开放播放器' }
            ]
          }
        ]
      : []),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '切换全屏' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac
          ? [
              { type: 'separator' },
              { role: 'front', label: '前置全部窗口' },
              { type: 'separator' },
              { role: 'window', label: '窗口' }
            ]
          : [{ role: 'close', label: '关闭' }])
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: 'GitHub 项目主页',
          click: async () => {
            await shell.openExternal('https://github.com/zfdang/hongguo-open-player');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 单实例锁定 (Single Instance Lock)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupMenu();
    createWindow().catch((err) => {
      console.error('Failed to create window:', err);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  // 所有窗口关闭时退出应用
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', () => {
    if (serverInstance) {
      serverInstance.close();
    }
  });
}
