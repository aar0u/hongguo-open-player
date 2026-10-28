const { test } = require('node:test');
const assert = require('node:assert/strict');
const web = require('../src/server/native/hongguo-search');
const app = require('../src/server/native/hongguo-app-search');
const Service = require('../src/server/services/dramaService').constructor;

test('search forwards page options and preserves App pagination cursor', async t => {
  const originalWeb = web.searchHongguo, originalApp = app.searchApp;
  t.after(() => { web.searchHongguo = originalWeb; app.searchApp = originalApp; });
  const service = new Service();
  web.searchHongguo = async (_, options) => ({ success: true, results: [], page: options.page });
  assert.equal((await service.search('离婚', 3)).page, 3);
  web.searchHongguo = async () => { throw new Error('offline'); };
  const cursor = { search_id: 'abc', next_offset: 20 };
  app.searchApp = async (_, options) => {
    if (options.page === 2) assert.deepEqual(options.cursor, cursor);
    return { results: [{ series_id: '1' }], page: options.page, hasMore: true, cursor };
  };
  assert.equal((await service.search('离婚', 1)).page, 1);
  assert.equal((await service.search('离婚', 2)).page, 2);
  await assert.rejects(service.search(['bad']), /搜索词/);
  await assert.rejects(service.search('离婚', -1), /页码/);
});

test('catalog preserves terminal empty pages and never substitutes another category', async t => {
  const catalog = require('../src/server/native/hongguo-app-catalog');
  const original = catalog.browseList;
  t.after(() => { catalog.browseList = original; });
  const service = new Service();
  catalog.browseList = async () => ({ success: true, results: [], page: 2, hasMore: false });
  assert.equal((await service.catalog({ page: 2, category: 'comic-drama' })).page, 2);
  catalog.browseList = async () => ({ success: false, error: 'upstream unavailable' });
  await assert.rejects(service.catalog({ category: 'comic-drama' }), /所选分类/);
});
