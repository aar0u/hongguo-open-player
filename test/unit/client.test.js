const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function client(fetch) {
  let state;
  vm.runInNewContext(fs.readFileSync(require.resolve('../../src/client/js/app.js'), 'utf8'), {
    Vue: { ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
      nextTick: async fn => { if (fn) fn(); }, onMounted() {}, onUnmounted() {},
      createApp: options => ({ mount() { state = options.setup(); } }) },
    navigator: { userAgent: '' }, document: { documentElement: { classList: { add() {} } } },
    fetch, console, alert() {}, window: { addEventListener() {}, removeEventListener() {} }
  });
  return state;
}
const response = data => ({ ok: true, json: async () => data });

test('late catalog responses cannot replace the active tab; search pagination keeps keyword', async () => {
  const requests = [];
  const state = client(url => new Promise(resolve => requests.push({ url, resolve })));
  const first = state.loadCatalog();
  state.switchTab('favorites');
  requests[1].resolve(response([{ series_id: '2' }]));
  await new Promise(resolve => setImmediate(resolve));
  requests[0].resolve(response({ results: [{ series_id: '1' }] }));
  await first;
  assert.equal(state.currentDramas.value[0].series_id, '2');
  state.searchKeyword.value = '离婚';
  const search = state.handleSearch();
  requests[2].resolve(response({ results: [], hasMore: true }));
  await search;
  state.changePage(1);
  assert.match(requests[3].url, /keyword=.*&page=2$/);
  requests[3].resolve(response({ results: [], hasMore: false }));
});

module.exports = { client, response };

test('switching series and episodes resets progress and canplay preserves a user pause', async () => {
  const saved = [];
  const series = id => ({ series_id: id, episodes: [{ vid: `${id}1`, vid_index: 1 }, { vid: `${id}2`, vid_index: 2 }] });
  const state = client(async (url, options) => {
    if (url === '/api/progress') { saved.push(JSON.parse(options.body)); return response({}); }
    return response(series(url.split('/').pop()));
  });
  await state.openTheater({ series_id: '1' });
  let plays = 0;
  const video = { duration: 100, currentTime: 42, buffered: { length: 0 }, paused: true,
    pause() {}, play() { plays++; return Promise.resolve(); } };
  state.videoEl.value = video;
  state.onLoadedMetadata();
  state.onTimeUpdate();
  state.switchEpisode({ vid_index: 2 });
  assert.equal(saved[0].episode_index, 1);
  assert.equal(saved[0].position_sec, 42);
  state.onPause(); // metadata is not ready for the new episode
  assert.equal(saved.length, 1);
  assert.equal(state.duration.value, 0);
  const before = plays;
  state.onCanPlay();
  assert.equal(plays, before);
  await state.openTheater({ series_id: '2' });
  assert.equal(state.currentTime.value, 0);
  assert.equal(saved.length, 1);
});

test('a pending drama detail cannot reopen theater after navigating away', async () => {
  let resolveDetail;
  const state = client(url => url.startsWith('/api/series/')
    ? new Promise(resolve => { resolveDetail = resolve; }) : Promise.resolve(response([])));
  const opening = state.openTheater({ series_id: '1' });
  state.switchTab('history');
  resolveDetail(response({ series_id: '1', episodes: [{ vid: '1', vid_index: 1 }] }));
  await opening;
  assert.equal(state.viewMode.value, 'catalog');
});

test('favoriting a long series sends metadata without its full episode list', async () => {
  let body;
  const state = client(async (url, options) => { body = JSON.parse(options.body); return response({ is_favorite: true }); });
  state.activeSeries.value = { series_id: '123', total: 1000, episodes: Array(1000).fill({ title: 'x'.repeat(1000) }) };
  await state.toggleFavCurrent();
  assert.equal(body.episode_count, 1000);
  assert.equal(body.episodes, undefined);
  assert.ok(JSON.stringify(body).length < 1024);
});
