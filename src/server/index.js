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
  // 如果客户端传入了下一集的 vid，后台执行无感预加载
  if (next_vid) {
    streamService.prefetch(next_vid);
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

// 启动本地服务
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`====================================================`);
  console.log(`🚀 红果短剧桌面播放器服务已启动!`);
  console.log(`📍 本地访问地址: http://127.0.0.1:${PORT}`);
  console.log(`🎬 具备 MP4 CENC 实时流式解密代理与全集无感预加载功能`);
  console.log(`====================================================`);
});

module.exports = { app, server };
