// SPDX-License-Identifier: GPL-3.0-only
const { signedMetadataRequest, requestJson } = require('./app-source');
const { cleanTitle, appCover } = require('./hongguo-app-search');
const logger = require('../services/logger');

const RANK_CELL_ID = '7470092475068071998';
const RANK_SELECTED = 'ranklist_celebrity';
const RANK_SUB_SELECTED = 'ranklist_series_actor';
const CACHE_TTL_MS = 180000; // 3分钟会话缓存
const TIMEOUT_MS = 15000;

let activeSession = null;

function actorError(message, code = 'ACTOR_SCHEMA', status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function clearActorSession() {
  activeSession = null;
}

function catalogCover(value) {
  const compatible = appCover(value);
  try {
    if (!value) return '';
    const url = new URL(value);
    if (!/\.heic$/i.test(url.pathname)) return compatible;
    if (!['http:', 'https:'].includes(url.protocol) ||
        !/(^|\.)(fqnovelpic\.com|byteimg\.com)$/i.test(url.hostname) ||
        !url.pathname.startsWith('/novel-pic/') || !url.pathname.includes('~')) {
      return '';
    }
    // 经各版本客户端验证的公开 JPEG 变体，彻底规避 Chromium 对 HEIC 不支持的问题
    return `https://p3-novel.byteimg.com${url.pathname.split('~', 1)[0]}~tplv-shrink:640:0.image`;
  } catch (_) {
    return compatible;
  }
}

function extractEpisodeCount(subTitle) {
  if (!subTitle || typeof subTitle !== 'string') return 0;
  const match = subTitle.match(/(\d+)\s*集/);
  return match ? parseInt(match[1], 10) : 0;
}

async function defaultRequest(signed, deadline) {
  return requestJson(signed.url, { method: 'GET', headers: signed.headers }, deadline);
}

function parseRankingPayload(payload, { pageNum = 1, pageLimit = 20, activeSession = null } = {}) {
  if (!payload || payload.code !== 0) {
    throw actorError(payload?.message || '获取剧星榜失败', 'ACTOR_UPSTREAM_ERROR', 502);
  }

  const cellView = payload.data?.cell_view;
  if (!cellView || !Array.isArray(cellView.cell_data)) {
    logger.error('HongguoActor', `剧星榜结构异常 raw=${JSON.stringify(payload).slice(0, 500)}`);
    throw actorError('剧星榜返回结构异常', 'ACTOR_SCHEMA_ERROR', 502);
  }

  // 严格校验选择器：确认服务端确实返回了剧星榜 (ranklist_series_actor)
  const outerSelected = cellView.cell_selector?.outer_row?.items?.find(i => i.is_selected);
  const subSelected = outerSelected?.sub_cell_selector?.outer_row?.items?.find(i => i.is_selected);
  if (outerSelected && outerSelected.selector_item_id && outerSelected.selector_item_id !== RANK_SELECTED) {
    throw actorError(`服务端未选中演员榜: ${outerSelected.selector_item_id}`, 'ACTOR_SELECTOR_MISMATCH', 502);
  }
  if (subSelected && subSelected.selector_item_id && subSelected.selector_item_id !== RANK_SUB_SELECTED) {
    throw actorError(`服务端未选中剧星榜 (当前: ${subSelected.selector_item_id})，不可用星光榜冒充`, 'ACTOR_SUB_SELECTOR_MISMATCH', 502);
  }

  // 解析统计日期
  let rankDate = '';
  if (cellView.cell_data_json) {
    try {
      const parsedJson = JSON.parse(cellView.cell_data_json);
      rankDate = parsedJson.rank_list_date || '';
    } catch (_) {}
  }
  if (!rankDate && activeSession?.rankDate) {
    rankDate = activeSession.rankDate;
  }

  // 解析 ugc_user_data
  const rawList = cellView.cell_data.flatMap(cell => cell.ugc_user_data || []);
  const actors = rawList.map((item, idx) => {
    const baseInfo = item.user_info?.base_info || {};
    const actorIdStr = String(baseInfo.actor_id_str || '');
    const userIdStr = String(item.user_info?.user_id || '');
    const name = cleanTitle(baseInfo.user_name || '');
    const avatar = catalogCover(baseInfo.user_avatar);
    const score = item.rec_text_item?.RecommendText || '';
    const intro = cleanTitle(item.intro || '');
    const subTitles = (item.sub_title_list || []).map(s => cleanTitle(s.content)).filter(Boolean);
    const changeData = item.rank_change_data || {};

    return {
      rank: (pageNum - 1) * pageLimit + idx + 1,
      actor_id: actorIdStr,
      user_id: userIdStr,
      name,
      avatar,
      score,
      intro,
      sub_titles: subTitles,
      rank_change: {
        type: changeData.rank_change_type || 3, // 1: 升, 2: 降, 3: 平/新上榜
        num: changeData.ChangeNum || 0
      }
    };
  }).filter(a => a.actor_id && a.name);

  const hasMore = !!payload.data?.has_more;
  const nextOffset = payload.data?.next_offset;
  const sessionId = payload.data?.session_id || '';

  return {
    actors,
    rankDate,
    hasMore,
    nextOffset,
    sessionId
  };
}

function parseDetailPayload(payload, cleanId) {
  if (!payload || payload.code !== 0) {
    throw actorError(payload?.message || '获取演员主页失败', 'ACTOR_UPSTREAM_ERROR', 502);
  }

  const info = payload.data?.celebrity_info;
  if (!info) {
    throw actorError('未查询到该演员信息', 'ACTOR_NOT_FOUND', 404);
  }

  const related = (info.related_celebrities || []).map(r => ({
    actor_id: String(r.celebrity_id || ''),
    name: cleanTitle(r.nickname || ''),
    avatar: catalogCover(r.avatar),
    intro: cleanTitle(r.intro || '')
  })).filter(r => r.actor_id && r.name);

  return {
    success: true,
    actor: {
      actor_id: cleanId,
      name: cleanTitle(info.nickname || ''),
      avatar: catalogCover(info.avatar),
      intro: cleanTitle(info.intro || ''),
      celebrity_type: info.celebrity_type || 1,
      related_celebrities: related
    }
  };
}

function parseWorksPayload(payload, cleanId, { reqOffset = 0, reqCount = 20 } = {}) {
  if (!payload || payload.code !== 0) {
    throw actorError(payload?.message || '获取演员作品失败', 'ACTOR_UPSTREAM_ERROR', 502);
  }

  const worksMap = payload.data?.works || {};
  const actorWorkData = worksMap[cleanId] || {};
  const rawVideos = Array.isArray(actorWorkData.video_list) ? actorWorkData.video_list : [];

  const works = rawVideos.map(v => {
    const seriesId = String(v.series_id || '');
    const title = cleanTitle(v.title || '');
    const cover = catalogCover(v.cover);
    const episodeCount = Number(v.episode_cnt) || extractEpisodeCount(v.sub_title);
    const subTitle = cleanTitle(v.sub_title || '');
    const recText = v.rec_text || '';
    const score = v.score || '';
    const desc = cleanTitle(v.video_desc || '');
    const duration = Number(v.duration) || 0;

    return {
      series_id: seriesId,
      series_title: title,
      cover,
      episode_count: episodeCount,
      sub_title: subTitle,
      rec_text: recText,
      score,
      description: desc,
      duration,
      source: 'hongguo'
    };
  }).filter(w => w.series_id && w.series_title);

  return {
    success: true,
    actor_id: cleanId,
    works,
    total_count: Number(actorWorkData.total_count) || works.length,
    has_more: !!actorWorkData.has_more,
    offset: reqOffset,
    count: reqCount
  };
}

/**
 * 获取剧星榜（演员排行榜）
 * @param {Object} [options]
 * @param {number} [options.page=1] - 页码 (1..20)
 * @param {number} [options.limit=20] - 每页条数
 * @param {Function} [options.request] - 自定义请求处理函数
 * @returns {Promise<Object>}
 */
async function fetchActorRankings({ page = 1, limit = 20, request = defaultRequest } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const pageLimit = Math.max(1, Math.min(50, parseInt(limit, 10) || 20));

  // 检查是否可以使用现有会话缓存
  const now = Date.now();
  if (activeSession && activeSession.expiresAt > now && activeSession.pages.has(pageNum)) {
    const cached = activeSession.pages.get(pageNum);
    logger.debug('HongguoActor', `命中剧星榜内存缓存: page=${pageNum}`);
    return {
      success: true,
      actors: cached.actors,
      rank_date: cached.rankDate,
      page: pageNum,
      limit: pageLimit,
      has_more: cached.hasMore,
      total: cached.actors.length,
      from_cache: true
    };
  }

  // 若需要请求第 2 页及以上，但无有效会话，需先拉取第 1 页建立会话
  if (pageNum > 1 && (!activeSession || activeSession.expiresAt <= now)) {
    logger.info('HongguoActor', `剧星榜会话未就绪，先拉取第 1 页建立分页会话`);
    await fetchActorRankings({ page: 1, limit: pageLimit, request });
  }

  let values;
  if (pageNum === 1 || !activeSession) {
    values = {
      tab_type: '26',
      client_req_type: '2',
      client_template: '2',
      cell_id: RANK_CELL_ID,
      cell_sub_id: '0',
      selected_items: RANK_SELECTED,
      sub_selected_items: RANK_SUB_SELECTED,
      category_id: '0',
      gender: '2',
      limit: String(pageLimit),
      offset: '0',
      session_id: '',
      background_selected_items: '',
      panel_selected_items: '',
      filter_ids: '',
      unlimited_selector_change_type: '0'
    };
  } else {
    values = {
      tab_type: '18',
      client_req_type: '2',
      client_template: '2',
      cell_id: RANK_CELL_ID,
      cell_sub_id: '0',
      selected_items: RANK_SELECTED,
      sub_selected_items: RANK_SUB_SELECTED,
      category_id: '0',
      gender: '2',
      limit: String(pageLimit),
      offset: String(activeSession.nextOffset || (pageNum - 1) * pageLimit),
      session_id: activeSession.sessionId || '',
      background_selected_items: '',
      panel_selected_items: '',
      filter_ids: '',
      unlimited_selector_change_type: '0'
    };
  }

  const signed = signedMetadataRequest('/reading/bookapi/bookmall/cell/change/v', values);
  const payload = await request(signed, Date.now() + TIMEOUT_MS);

  const parsed = parseRankingPayload(payload, { pageNum, pageLimit, activeSession });
  const { actors, rankDate, hasMore, nextOffset, sessionId } = parsed;

  // 更新会话存储
  if (!activeSession || pageNum === 1) {
    activeSession = {
      sessionId,
      nextOffset,
      rankDate,
      expiresAt: Date.now() + CACHE_TTL_MS,
      pages: new Map()
    };
  } else {
    activeSession.nextOffset = nextOffset;
    if (sessionId) activeSession.sessionId = sessionId;
  }
  activeSession.pages.set(pageNum, { actors, rankDate, hasMore });

  logger.info('HongguoActor', `成功获取剧星榜: 第 ${pageNum} 页, 共 ${actors.length} 位演员, 统计截至=${rankDate || '最新'}`);
  return {
    success: true,
    actors,
    rank_date: rankDate,
    page: pageNum,
    limit: pageLimit,
    has_more: hasMore,
    total: actors.length
  };
}

/**
 * 获取演员个人主页信息
 * @param {string} actorId - 演员 ID 字符串
 * @param {Object} [options]
 * @param {Function} [options.request] - 自定义请求处理函数
 * @returns {Promise<Object>}
 */
async function fetchActorDetail(actorId, { request = defaultRequest } = {}) {
  const cleanId = String(actorId || '').trim();
  if (!/^\d{1,30}$/.test(cleanId)) {
    throw actorError('无效的演员 ID', 'ACTOR_ID_INVALID', 400);
  }

  const signed = signedMetadataRequest('/reading/user/celebrity/homepage/v1/', {
    encrypted_celebrity_id: cleanId
  });

  const payload = await request(signed, Date.now() + TIMEOUT_MS);
  return parseDetailPayload(payload, cleanId);
}

/**
 * 获取演员参演短剧作品列表
 * @param {string} actorId - 演员 ID 字符串
 * @param {Object} [options]
 * @param {number} [options.count=20] - 单次拉取数量
 * @param {number} [options.offset=0] - 偏移量
 * @param {Function} [options.request] - 自定义请求处理函数
 * @returns {Promise<Object>}
 */
async function fetchActorWorks(actorId, { count = 20, offset = 0, request = defaultRequest } = {}) {
  const cleanId = String(actorId || '').trim();
  if (!/^\d{1,30}$/.test(cleanId)) {
    throw actorError('无效的演员 ID', 'ACTOR_ID_INVALID', 400);
  }

  const reqCount = Math.max(1, Math.min(50, parseInt(count, 10) || 20));
  const reqOffset = Math.max(0, parseInt(offset, 10) || 0);

  const signed = signedMetadataRequest('/reading/user/celebrity/works/v1/', {
    encrypted_celebrity_ids: cleanId,
    offset: String(reqOffset),
    count: String(reqCount),
    req_scene: '0'
  });

  const payload = await request(signed, Date.now() + TIMEOUT_MS);
  return parseWorksPayload(payload, cleanId, { reqOffset, reqCount });
}

module.exports = {
  fetchActorRankings,
  fetchActorDetail,
  fetchActorWorks,
  parseRankingPayload,
  parseDetailPayload,
  parseWorksPayload,
  clearActorSession,
  catalogCover,
  extractEpisodeCount
};
