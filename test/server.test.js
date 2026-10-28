const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../src/server');

test('loopback API blocks foreign origins and hosts and returns JSON errors', async t => {
  const { server, port } = await startServer(0);
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(`${base}/api/history`)).status, 200);
  assert.equal((await fetch(`${base}/api/history`, { headers: { Origin: base } })).status, 200);
  for (const headers of [{ Origin: 'https://evil.example' }, { Host: `evil.example:${port}` }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await fetch(`${base}/api/history`, { headers })).status, 403);
  }
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.equal(typeof (await missing.json()).error, 'string');
  assert.equal((await fetch(`${base}/api/progress`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
});
