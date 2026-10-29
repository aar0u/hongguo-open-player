// SPDX-License-Identifier: GPL-3.0-only
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { catalogCover, extractEpisodeCount, fetchActorRankings, fetchActorDetail, fetchActorWorks } = require('../../src/server/native/hongguo-actor');
const { startServer } = require('../../src/server/index');

test('catalogCover converts HEIC to JPEG compatible variants and preserves JPEG', () => {
  assert.equal(catalogCover(''), '');
  assert.equal(catalogCover(null), '');

  // JPEG url preserves
  const jpegUrl = 'https://p3-reading-sign.fqnovelpic.com/novel-pic/abc.jpeg?x=1';
  assert.equal(catalogCover(jpegUrl), jpegUrl);

  // HEIC url converts to public JPEG image
  const heicUrl = 'https://p3-reading-sign.fqnovelpic.com/novel-pic/f46efa4c55e9b146f7d4906fd88ceb4e~tplv-81nmtwyey9.heic?x-expires=123';
  const converted = catalogCover(heicUrl);
  assert.ok(converted.includes('p3-novel.byteimg.com'));
  assert.ok(converted.includes('/novel-pic/f46efa4c55e9b146f7d4906fd88ceb4e~tplv-shrink:640:0.image'));
});

test('extractEpisodeCount parses various subtitle formats', () => {
  assert.equal(extractEpisodeCount('都市脑洞·86集'), 86);
  assert.equal(extractEpisodeCount('全 100 集'), 100);
  assert.equal(extractEpisodeCount('暂无'), 0);
  assert.equal(extractEpisodeCount(null), 0);
});

test('actor ranking, homepage, and works live API end-to-end integration', async () => {
  // 1. Fetch ranking page 1
  const rankRes = await fetchActorRankings({ page: 1, limit: 10 });
  assert.equal(rankRes.success, true);
  assert.ok(Array.isArray(rankRes.actors));
  assert.ok(rankRes.actors.length > 0);

  const topActor = rankRes.actors[0];
  assert.equal(topActor.rank, 1);
  assert.ok(typeof topActor.actor_id === 'string' && topActor.actor_id.length > 5);
  assert.ok(typeof topActor.name === 'string' && topActor.name.length > 0);
  assert.ok(topActor.score.includes('人气') || topActor.score.length > 0);
  assert.ok(topActor.avatar.startsWith('http'));

  // 2. Fetch actor detail
  const detailRes = await fetchActorDetail(topActor.actor_id);
  assert.equal(detailRes.success, true);
  assert.ok(detailRes.actor);
  assert.equal(detailRes.actor.actor_id, topActor.actor_id);
  assert.equal(detailRes.actor.name, topActor.name);

  // 3. Fetch actor works
  const worksRes = await fetchActorWorks(topActor.actor_id, { count: 10 });
  assert.equal(worksRes.success, true);
  assert.ok(Array.isArray(worksRes.works));
  if (worksRes.works.length > 0) {
    const work = worksRes.works[0];
    assert.ok(typeof work.series_id === 'string' && work.series_id.length > 5);
    assert.ok(typeof work.series_title === 'string' && work.series_title.length > 0);
    assert.ok(work.cover.startsWith('http'));
  }

  // 4. Input validation
  await assert.rejects(fetchActorDetail('invalid-id!'), /无效的演员 ID/);
  await assert.rejects(fetchActorWorks(''), /无效的演员 ID/);
});

test('actor REST API endpoints return JSON and handle invalid parameters', async () => {
  const { server, port } = await startServer(0);
  try {
    // 1. Establish player session cookie
    const cookie = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, res => {
        const rawCookie = res.headers['set-cookie']?.[0]?.split(';')[0] || '';
        resolve(rawCookie);
      }).on('error', reject);
    });

    const get = (path) => new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${path}`, {
        headers: { Cookie: cookie }
      }, res => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw) }));
      }).on('error', reject);
    });

    // 2. GET /api/actors/ranking
    const rankRes = await get('/api/actors/ranking?page=1&limit=5');
    assert.equal(rankRes.status, 200);
    assert.equal(rankRes.data.success, true);
    assert.ok(Array.isArray(rankRes.data.actors));
    assert.ok(rankRes.data.actors.length > 0);
    const actorId = rankRes.data.actors[0].actor_id;

    // 2. GET /api/actors/:actorId
    const detailRes = await get(`/api/actors/${actorId}`);
    assert.equal(detailRes.status, 200);
    assert.equal(detailRes.data.success, true);
    assert.equal(detailRes.data.actor.actor_id, actorId);

    // 3. GET /api/actors/:actorId/works
    const worksRes = await get(`/api/actors/${actorId}/works?count=5`);
    assert.equal(worksRes.status, 200);
    assert.equal(worksRes.data.success, true);
    assert.ok(Array.isArray(worksRes.data.works));

    // 4. Invalid ID
    const badRes = await get('/api/actors/not-a-number');
    assert.equal(badRes.status, 400);
    assert.ok(badRes.data.error.includes('无效的演员 ID'));
  } finally {
    server.close();
  }
});
