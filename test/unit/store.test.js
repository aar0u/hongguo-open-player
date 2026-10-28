const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Store = require('../../src/server/services/storeService').constructor;

test('store persists atomically, rejects invalid progress, and propagates write failures', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'player-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  const item = { series_id: '123', position_sec: 12, episode_index: 2 };
  await store.updateProgress(item);
  await store.toggleFavorite(item);
  const reloaded = new Store(dir);
  assert.equal(reloaded.getSeriesProgress('123').position_sec, 12);
  assert.equal(reloaded.isFavorite('123'), true);
  assert.equal(reloaded.isFavorite('toString'), false);
  for (const bad of [{ series_id: '__proto__' }, { ...item, position_sec: -1 }, { ...item, duration_sec: Infinity }]) {
    assert.throws(() => store.updateProgress(bad));
  }
  const original = fs.readFileSync(store.dataFile, 'utf8');
  const rename = store.rename;
  store.rename = async () => { throw new Error('disk failed'); };
  await assert.rejects(store.updateProgress({ ...item, position_sec: 33 }), /disk failed/);
  store.rename = rename;
  assert.equal(store.getSeriesProgress('123').position_sec, 12);
  assert.equal(fs.readFileSync(store.dataFile, 'utf8'), original);
});

test('store serializes writes, retries Windows locks and recovers a corrupt primary from backup', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'player-backup-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  const originalRename = fs.promises.rename;
  let locks = 0;
  fs.promises.rename = async (...args) => {
    if (args[1] === store.dataFile && locks++ < 2) throw Object.assign(new Error('locked'), { code: 'EBUSY' });
    return originalRename(...args);
  };
  t.after(() => { fs.promises.rename = originalRename; });
  await Promise.all([store.updateProgress({ series_id: '1' }), store.updateProgress({ series_id: '2' })]);
  assert.ok(locks >= 3);
  assert.equal(store.getHistory().length, 2);
  fs.writeFileSync(store.dataFile, '{broken');
  const recovered = new Store(dir);
  assert.equal(recovered.getHistory().length, 1);
  await recovered.updateProgress({ series_id: '3' });
  assert.equal(new Store(dir).getHistory().length, 2);
});
