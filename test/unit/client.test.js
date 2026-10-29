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

test('scrubbing clamps positions and ignores playback time updates while dragging', () => {
  const state = client(async () => response([]));
  state.duration.value = 100;
  state.videoEl.value = { currentTime: 10 };
  state.startScrubbing({ target: {} });
  state.seekFromSlider({ target: { value: 150 } });
  assert.equal(state.videoEl.value.currentTime, 100);
  state.videoEl.value.currentTime = 30;
  state.onTimeUpdate();
  assert.equal(state.currentTime.value, 100);
  state.finishScrubbing();
  assert.equal(state.isScrubbing.value, false);
});

test('shortcuts work when focus is on buttons and range inputs, and ignore text inputs', () => {
  const listeners = {};
  let paused = true;
  let blurred = 0;
  let prevented = 0;
  const prevent = () => { prevented++; };
  const blur = () => { blurred++; };
  const video = {
    get paused() { return paused; },
    play: async () => { paused = false; },
    pause: () => { paused = true; },
    currentTime: 20
  };
  const state = client(async () => response([]), { window: { addEventListener: (name, fn) => { listeners[name] = fn; } } });
  state.mountForTest();
  state.viewMode.value = 'theater';
  state.videoEl.value = video;
  state.duration.value = 100;
  state.activeEpisodeIndex.value = 1;
  state.activeEpisodes.value = [{ vid_index: 1 }, { vid_index: 2 }, { vid_index: 3 }];

  // 1. When focus is on a button (e.g. Pause, Fullscreen), Space toggles play and prevents button activation
  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'Space', key: ' ', preventDefault: prevent });
  assert.equal(paused, false);
  assert.equal(prevented, 1);
  assert.equal(blurred, 1);

  // 2. ArrowDown / PageDown switches episode even if button is focused
  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'ArrowDown', key: 'ArrowDown', preventDefault: prevent });
  assert.equal(state.activeEpisodeIndex.value, 2);

  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'PageDown', key: 'PageDown', preventDefault: prevent });
  assert.equal(state.activeEpisodeIndex.value, 3);

  // 3. ArrowUp / PageUp switches to previous episode
  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'PageUp', key: 'PageUp', preventDefault: prevent });
  assert.equal(state.activeEpisodeIndex.value, 2);

  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'ArrowUp', key: 'ArrowUp', preventDefault: prevent });
  assert.equal(state.activeEpisodeIndex.value, 1);

  // 4. ArrowLeft / ArrowRight seeks video (+5s from 0 after episode switch)
  state.duration.value = 100;
  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'ArrowRight', key: 'ArrowRight', preventDefault: prevent });
  assert.equal(video.currentTime, 5);

  listeners.keydown({ target: { tagName: 'BUTTON', blur }, code: 'ArrowLeft', key: 'ArrowLeft', preventDefault: prevent });
  assert.equal(video.currentTime, 0);

  // 5. When focus is on a range slider (progress bar), Space toggles play
  listeners.keydown({ target: { tagName: 'INPUT', type: 'range', blur }, code: 'Space', key: ' ', preventDefault: prevent });
  assert.equal(paused, true);

  // 6. When typing in a text input (e.g. search box), shortcuts are ignored
  listeners.keydown({ target: { tagName: 'INPUT', type: 'text' }, code: 'Space', key: ' ', preventDefault: prevent });
  assert.equal(paused, true); // not toggled
});

test('clicking controls blurs them and maintains focus on .player-container', () => {
  let focused = null;
  const container = {
    focus() { focused = container; }
  };
  const docListeners = {};
  const doc = {
    documentElement: { classList: { add() {} } },
    querySelector(selector) {
      if (selector === '.player-container') return container;
      return null;
    },
    addEventListener(name, fn) { docListeners[name] = fn; },
    removeEventListener() {}
  };
  const state = client(async () => response([]), {
    document: doc,
    window: { addEventListener() {}, removeEventListener() {} }
  });
  state.mountForTest();
  state.viewMode.value = 'theater';

  // Initially keep focus on player container
  state.keepPlayerFocus();
  assert.equal(focused, container);

  // When a button gets focusin, it should blur and restore container focus
  let buttonBlurred = false;
  const button = {
    tagName: 'BUTTON',
    blur() { buttonBlurred = true; },
    closest(sel) { return sel === 'button' ? button : null; }
  };
  focused = null;
  docListeners.focusin?.({ target: button });
  assert.equal(buttonBlurred, true);
  assert.equal(focused, container);

  // When a range slider gets focusin, it should blur and restore container focus
  let rangeBlurred = false;
  const range = {
    tagName: 'INPUT',
    type: 'range',
    blur() { rangeBlurred = true; }
  };
  focused = null;
  docListeners.focusin?.({ target: range });
  assert.equal(rangeBlurred, true);
  assert.equal(focused, container);
});


