const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Store = require('../src/server/services/storeService').constructor;

test('store persists atomically, rejects invalid progress, and propagates write failures', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'player-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  const item = { series_id: '123', position_sec: 12, episode_index: 2 };
  store.updateProgress(item);
  store.toggleFavorite(item);
  const reloaded = new Store(dir);
  assert.equal(reloaded.getSeriesProgress('123').position_sec, 12);
  assert.equal(reloaded.isFavorite('123'), true);
  assert.equal(reloaded.isFavorite('toString'), false);
  for (const bad of [{ series_id: '__proto__' }, { ...item, position_sec: -1 }, { ...item, duration_sec: Infinity }]) {
    assert.throws(() => store.updateProgress(bad));
  }
  const original = fs.readFileSync(store.dataFile, 'utf8');
  // An existing directory at the staging path forces a deterministic disk failure.
  fs.mkdirSync(`${store.dataFile}.tmp`);
  assert.throws(() => store.updateProgress({ ...item, position_sec: 33 }));
  assert.equal(store.getSeriesProgress('123').position_sec, 12);
  assert.equal(fs.readFileSync(store.dataFile, 'utf8'), original);
});
