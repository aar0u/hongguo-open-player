// SPDX-License-Identifier: GPL-3.0-only
const express = require('express');
const path = require('path');
const dramaService = require('./services/dramaService');
const streamService = require('./services/streamService');
const storeService = require('./services/storeService');

const app = express();
const PORT = process.env.PORT || 8899;

// 中间件配置
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 跨域支持 (方便本地及各类客户端嵌入)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 静态前端资源目录
const clientDir = path.join(__dirname, '../client');
app.use(express.static(clientDir));

// ================= API 路由 =================

/**
 * 1. 剧场精选/分类列表
 */
app.get('/api/catalog', async (req, res) => {
  try {
    const { page, category, genre } = req.query;
    const data = await dramaService.catalog({ page, category, genre });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2. 搜索短剧
 */
app.get('/api/search', async (req, res) => {
  try {
    const { keyword, page } = req.query;
    const data = await dramaService.search(keyword, page);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3. 获取剧集详情及全部分集列表
 */
app.get('/api/series/:seriesId', async (req, res) => {
  try {
    const { seriesId } = req.params;
    const detail = await dramaService.getSeriesDetail(seriesId);
    // 注入用户本地观看历史及收藏状态
    const savedProgress = storeService.getSeriesProgress(seriesId);
    const isFav = storeService.isFavorite(seriesId);
    res.json({
      ...detail,
      saved_progress: savedProgress,
      is_favorite: isFav
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4. 解析单集播放元信息
 */
app.get('/api/play/:vid', async (req, res) => {
  try {
    const { vid } = req.params;
    const { quality } = req.query;
    const playInfo = await dramaService.getPlayInfo(vid, quality);
    res.json(playInfo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5. 本地流媒体解密播放代理 (核心)
 * 支持 Range 请求，边下边解边播，支持预加载
 */
app.get('/api/stream/:vid', (req, res) => {
  const { vid } = req.params;
  const { next_vid } = req.query;
  // 延迟 4 秒执行下一集预加载，优先保障当前集起播带宽
  if (next_vid) {
    setTimeout(() => {
      streamService.prefetch(next_vid);
    }, 4000);
  }
  streamService.handleStream(req, res, vid);
});

/**
 * 6. 播放进度与历史
 */
app.get('/api/history', (req, res) => {
  res.json(storeService.getHistory());
});

app.post('/api/progress', (req, res) => {
  try {
    const item = req.body;
    const updated = storeService.updateProgress(item);
    res.json({ success: true, progress: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * 7. 收藏夹管理
 */
app.get('/api/favorites', (req, res) => {
  res.json(storeService.getFavorites());
});

app.post('/api/favorites/toggle', (req, res) => {
  try {
    const isFav = storeService.toggleFavorite(req.body);
    res.json({ success: true, is_favorite: isFav });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 前端 SPA 页面兜底
app.use((req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// 启动服务函数封装
function startServer(preferredPort = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(preferredPort, '127.0.0.1', () => {
      const actualPort = server.address().port;
      console.log(`====================================================`);
      console.log(`🚀 红果开放播放器服务已启动!`);
      console.log(`📍 本地访问地址: http://127.0.0.1:${actualPort}`);
      console.log(`🎬 具备 MP4 CENC 实时流式解密代理与全集无感预加载功能`);
      console.log(`====================================================`);
      resolve({ app, server, port: actualPort });
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`端口 ${preferredPort} 已被占用，尝试使用动态空闲端口...`);
        const fallbackServer = app.listen(0, '127.0.0.1', () => {
          const actualPort = fallbackServer.address().port;
          console.log(`🚀 服务已启动在空闲端口: http://127.0.0.1:${actualPort}`);
          resolve({ app, server: fallbackServer, port: actualPort });
        });
        fallbackServer.on('error', reject);
      } else {
        reject(err);
      }
    });
  });
}

// CLI 直接运行模式
if (require.main === module) {
  startServer().catch((err) => {
    console.error('启动服务失败:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
