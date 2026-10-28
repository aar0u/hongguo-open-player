const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../../src/server');
const http = require('node:http');

test('loopback API blocks foreign origins and hosts and returns JSON errors', async t => {
  const { server, port } = await startServer(0);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${port}`;
  const home = await fetch(base);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/api/history`)).status, 401);
  const Cookie = home.headers.get('set-cookie').split(';')[0];
  const apiFetch = (url, options = {}) => fetch(url, { ...options, headers: { Cookie, ...options.headers } });
  assert.equal((await apiFetch(`${base}/api/history`)).status, 200);
  assert.equal((await apiFetch(`${base}/api/history`, { headers: { Origin: base } })).status, 200);
  for (const headers of [{ Origin: 'https://evil.example' }, { Host: `evil.example:${port}` }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const status = await new Promise((resolve, reject) => {
      http.get(`${base}/api/history`, { headers }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  const missing = await apiFetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.equal(typeof (await missing.json()).error, 'string');
  assert.equal((await apiFetch(`${base}/api/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
});
