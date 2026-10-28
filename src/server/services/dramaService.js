// SPDX-License-Identifier: GPL-3.0-only
const hg = require('../native/hongguo');
const hgSearch = require('../native/hongguo-search');
const hgAppSearch = require('../native/hongguo-app-search');
const hgCatalog = require('../native/hongguo-app-catalog');
const appSource = require('../native/app-source');

class DramaService {
  constructor() {
    this.searchSessions = new Map();
  }

  /**
   * 搜索短剧
   */
  async search(keyword, page = 1) {
    if (keyword === undefined || keyword === '') {
      return { results: [], total: 0, page: 1, hasMore: false };
    }
    if (typeof keyword !== 'string' || keyword.trim().length > 80) {
      throw Object.assign(new Error('搜索词需为 1 至 80 字的文本'), { status: 400 });
    }
    page = Number(page);
    if (!Number.isInteger(page) || page < 1 || page > 50) {
      throw Object.assign(new Error('页码需为 1 至 50 的整数'), { status: 400 });
    }
    const cleanKw = keyword.trim();
    if (!cleanKw) return { results: [], total: 0, page, hasMore: false };
    try {
      const res = await hgSearch.searchHongguo(cleanKw, { page });
      if (res && Array.isArray(res.results) && res.success !== false) {
        return res;
      }
    } catch (e) {
      console.warn('[DramaService] Web search failed, trying App search:', e.message);
    }

    // 回退到 App 端搜索
    try {
      let session = this.searchSessions.get(cleanKw);
      if (page === 1 || !session || session.expires <= Date.now()) {
        session = { expires: Date.now() + 120000, cursors: new Map() };
        this.searchSessions.delete(cleanKw);
        this.searchSessions.set(cleanKw, session);
        if (this.searchSessions.size > 30) this.searchSessions.delete(this.searchSessions.keys().next().value);
      }
      const appRes = await hgAppSearch.searchApp(cleanKw, { page, cursor: session.cursors.get(page) });
      if (appRes?.hasMore && appRes.cursor) session.cursors.set(page + 1, appRes.cursor);
      return appRes || { results: [], total: 0, page: 1, hasMore: false };
    } catch (e) {
      console.error('[DramaService] App search failed:', e.message);
      return { results: [], total: 0, page: 1, hasMore: false, error: e.message };
    }
  }

  /**
   * 浏览剧场列表/分类
   */
  async catalog(options = {}) {
    const page = Number(options.page) || 1;
    const category = options.category || 'hot-drama';
    const genre = options.genre || '';
    try {
      const res = await hgCatalog.browseList({ page, category, genre });
      if (res && Array.isArray(res.results) && res.results.length > 0) {
        return res;
      }
    } catch (e) {
      console.warn('[DramaService] Catalog browse failed, trying fallback:', e.message);
    }

    // 上游接口超时或无数据时，自动降级回退到全网热播搜索，保障高可用
    try {
      const fallback = await this.search('热播', page);
      if (fallback && Array.isArray(fallback.results) && fallback.results.length > 0) {
        return {
          results: fallback.results,
          page,
          total: fallback.total || fallback.results.length,
          hasMore: fallback.hasMore || false,
          fallback: true
        };
      }
    } catch (e) {
      console.error('[DramaService] Fallback catalog search failed:', e.message);
    }

    return { results: [], page: 1, total: 0, hasMore: false };
  }

  /**
   * 获取剧集详情及全部分集列表
   */
  async getSeriesDetail(seriesId) {
    if (!seriesId) throw new Error('缺少 series_id 参数');
    const sid = String(seriesId).trim();
    const data = await hg.fetchEpisodeList(sid);
    if (!data || !Array.isArray(data.episodes) || data.episodes.length === 0) {
      throw new Error('未获取到该短剧的分集列表');
    }
    return {
      series_id: sid,
      series_title: data.series_title || '',
      cover: data.cover || '',
      total: data.total || data.episodes.length,
      episodes: data.episodes.map(ep => ({
        vid: String(ep.vid),
        vid_index: Number(ep.vid_index),
        title: ep.title ? String(ep.title) : `第 ${ep.vid_index} 集`,
        series_id: sid,
        series_title: ep.series_title || data.series_title,
        cover: ep.cover || data.cover
      }))
    };
  }

  /**
   * 解析单集视频播放源和加密信息
   */
  async getPlayInfo(vid, quality = '1080p') {
    if (!vid) throw new Error('缺少 vid 参数');
    const playInfo = await appSource.fetchAppPlayUrl(String(vid), { quality });
    if (!playInfo || !playInfo.url) {
      throw new Error('未能解析到有效的播放地址');
    }
    return {
      vid: String(vid),
      url: playInfo.url,
      codec: playInfo.codec || 'hevc',
      quality: playInfo.quality || quality,
      contentKeyHex: playInfo.contentKey ? (Buffer.isBuffer(playInfo.contentKey) ? playInfo.contentKey.toString('hex') : String(playInfo.contentKey)) : null,
      variants: Array.isArray(playInfo.variants) ? playInfo.variants.map(v => ({
        quality: v.quality,
        codec: v.codec,
        url: v.url
      })) : []
    };
  }
}

module.exports = new DramaService();
