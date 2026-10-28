// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = require('path');

class StoreService {
  constructor() {
    this.dataDir = path.join(__dirname, '../../../data');
    this.dataFile = path.join(this.dataDir, 'user_data.json');
    this.state = {
      history: {}, // series_id -> { series_id, series_title, cover, episode_index, vid, position_sec, duration_sec, updated_at }
      favorites: {} // series_id -> { series_id, series_title, cover, updated_at }
    };
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      if (fs.existsSync(this.dataFile)) {
        const raw = fs.readFileSync(this.dataFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.state.history = parsed.history || {};
          this.state.favorites = parsed.favorites || {};
        }
      }
    } catch (e) {
      console.warn('[StoreService] 读取用户本地数据失败，将初始化新数据:', e.message);
    }
  }

  save() {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.dataFile, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (e) {
      console.error('[StoreService] 写入用户数据失败:', e.message);
    }
  }

  /**
   * 记录/更新播放进度
   */
  updateProgress(item) {
    if (!item || !item.series_id) return;
    const sid = String(item.series_id);
    this.state.history[sid] = {
      series_id: sid,
      series_title: item.series_title || '',
      cover: item.cover || '',
      episode_index: Number(item.episode_index) || 1,
      vid: String(item.vid || ''),
      position_sec: Number(item.position_sec) || 0,
      duration_sec: Number(item.duration_sec) || 0,
      updated_at: Date.now()
    };
    this.save();
    return this.state.history[sid];
  }

  /**
   * 获取观影历史（按更新时间倒序）
   */
  getHistory() {
    return Object.values(this.state.history).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  /**
   * 获取单部剧集存储的历史进度
   */
  getSeriesProgress(seriesId) {
    if (!seriesId) return null;
    return this.state.history[String(seriesId)] || null;
  }

  /**
   * 切换收藏状态
   */
  toggleFavorite(series) {
    if (!series || !series.series_id) return false;
    const sid = String(series.series_id);
    if (this.state.favorites[sid]) {
      delete this.state.favorites[sid];
      this.save();
      return false; // 取消收藏
    } else {
      this.state.favorites[sid] = {
        series_id: sid,
        series_title: series.series_title || '',
        cover: series.cover || '',
        episode_count: series.episode_count || series.total || 0,
        updated_at: Date.now()
      };
      this.save();
      return true; // 已收藏
    }
  }

  /**
   * 获取所有收藏
   */
  getFavorites() {
    return Object.values(this.state.favorites).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0));
  }

  /**
   * 判断单剧是否已收藏
   */
  isFavorite(seriesId) {
    return !!this.state.favorites[String(seriesId)];
  }
}

module.exports = new StoreService();
