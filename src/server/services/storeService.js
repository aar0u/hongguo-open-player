// SPDX-License-Identifier: GPL-3.0-only
const fs = require('fs');
const path = require('path');

class StoreService {
  constructor(dataDir = process.env.HONGGUO_DATA_DIR || path.join(__dirname, '../../../data')) {
    this.dataDir = dataDir;
    this.dataFile = path.join(this.dataDir, 'user_data.json');
    this.state = {
      history: Object.create(null), // series_id -> { series_id, series_title, cover, episode_index, vid, position_sec, duration_sec, updated_at }
      favorites: Object.create(null) // series_id -> { series_id, series_title, cover, updated_at }
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
          for (const field of ['history', 'favorites']) {
            const entries = parsed[field];
            if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
              this.state[field] = Object.assign(Object.create(null), entries);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[StoreService] 读取用户本地数据失败，将初始化新数据:', e.message);
    }
  }

  save(nextState) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const tempFile = `${this.dataFile}.tmp`;
    try {
      fs.writeFileSync(tempFile, JSON.stringify(nextState, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempFile, this.dataFile);
      this.state = nextState;
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }

  validateSeries(item) {
    if (!item || typeof item.series_id !== 'string' || !/^\d{1,30}$/.test(item.series_id)) {
      throw Object.assign(new Error('无效的 series_id'), { status: 400 });
    }
  }

  /**
   * 记录/更新播放进度
   */
  updateProgress(item) {
    this.validateSeries(item);
    for (const field of ['episode_index', 'position_sec', 'duration_sec']) {
      const value = item[field];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || (field === 'episode_index' && (!Number.isInteger(value) || value < 1)))) {
        throw Object.assign(new Error(`无效的 ${field}`), { status: 400 });
      }
    }
    const sid = String(item.series_id);
    const progress = {
      series_id: sid,
      series_title: item.series_title || '',
      cover: item.cover || '',
      episode_index: Number(item.episode_index) || 1,
      vid: String(item.vid || ''),
      position_sec: Number(item.position_sec) || 0,
      duration_sec: Number(item.duration_sec) || 0,
      updated_at: Date.now()
    };
    this.save({ ...this.state, history: { ...this.state.history, [sid]: progress } });
    return progress;
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
    return Object.hasOwn(this.state.history, String(seriesId)) ? this.state.history[String(seriesId)] : null;
  }

  /**
   * 切换收藏状态
   */
  toggleFavorite(series) {
    this.validateSeries(series);
    const sid = String(series.series_id);
    const favorites = { ...this.state.favorites };
    if (Object.hasOwn(favorites, sid)) {
      delete favorites[sid];
      this.save({ ...this.state, favorites });
      return false; // 取消收藏
    } else {
      favorites[sid] = {
        series_id: sid,
        series_title: series.series_title || '',
        cover: series.cover || '',
        episode_count: series.episode_count || series.total || 0,
        updated_at: Date.now()
      };
      this.save({ ...this.state, favorites });
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
    return Object.hasOwn(this.state.favorites, String(seriesId));
  }
}

module.exports = new StoreService();
