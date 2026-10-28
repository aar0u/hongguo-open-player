const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const StreamService = require('../src/server/services/streamService').constructor;

test('range downloads handle tiny files and CDNs ignoring or truncating ranges', async t => {
  const body = Buffer.from('abcdefghi');
  let mode = 'ranges';
  const server = http.createServer((req, res) => {
    const range = req.headers.range;
    if (!range || (mode === 'ignore' && range !== 'bytes=0-0')) return res.end(body);
    const [, a, b] = range.match(/bytes=(\d+)-(\d+)/);
    const start = Number(a), end = Number(b);
    const chunk = body.subarray(start, end + 1);
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${body.length}` });
    res.end(mode === 'truncate' && end > start ? chunk.subarray(1) : chunk);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (mode of ['ranges', 'ignore', 'truncate']) {
    assert.deepEqual(await new StreamService().downloadWithParallelRanges(url), body);
  }
});
