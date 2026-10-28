const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function client(fetch, overrides = {}) {
  let state;
  const mounted = [];
  vm.runInNewContext(fs.readFileSync(require.resolve('../../src/client/js/app.js'), 'utf8'), {
    Vue: { ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }),
      nextTick: async fn => { if (fn) fn(); }, onMounted(fn) { mounted.push(fn); }, onUnmounted() {},
      createApp: options => ({ mount() { state = options.setup(); } }) },
    navigator: { userAgent: '' }, document: { documentElement: { classList: { add() {} } } },
    fetch, console, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, window: { addEventListener() {}, removeEventListener() {} }, ...overrides
  });
  state.mountForTest = () => mounted.forEach(fn => fn());
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

test('fullscreen Escape preserves theater and select keys do not switch episodes', () => {
  const listeners = {};
  let exits = 0;
  const doc = { documentElement: { classList: { add() {} } }, fullscreenElement: {}, exitFullscreen: async () => { exits++; } };
  const state = client(async () => response([]), { document: doc, window: { addEventListener: (name, fn) => { listeners[name] = fn; } } });
  state.mountForTest(); state.viewMode.value = 'theater';
  listeners.keydown({ target: { tagName: 'DIV' }, code: 'Escape', key: 'Escape' });
  assert.equal(exits, 1); assert.equal(state.viewMode.value, 'theater');
  state.activeEpisodeIndex.value = 1;
  state.activeEpisodes.value = [{ vid_index: 1 }, { vid_index: 2 }];
  listeners.keydown({ target: { tagName: 'SELECT' }, code: 'ArrowDown', key: 'ArrowDown' });
  assert.equal(state.activeEpisodeIndex.value, 1);
});

test('volume adjustment clears mute and resume hydrates only recorded watched episodes', async () => {
  const state = client(async () => response({ series_id: '1', episodes: [{ vid: '1', vid_index: 1 }], saved_progress: { watched_indexes: [1, 3], episode_index: 1 } }));
  await state.openTheater({ series_id: '1' });
  assert.equal(state.isEpisodeWatched(1), true); assert.equal(state.isEpisodeWatched(2), false);
  state.videoEl.value = { volume: 0, muted: true };
  state.volume.value = 0.5;
  state.changeVolume();
  assert.equal(state.videoEl.value.muted, false);
  assert.equal(state.isMuted.value, false);
  assert.equal(state.isBuffering.value, true);
});
