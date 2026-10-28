const { test } = require('node:test');
const assert = require('node:assert/strict');
const StreamService = require('../../src/server/services/streamService').constructor;

test('HTTP ranges support suffix/open end and reject malformed or unsafe offsets', async () => {
  const service = new StreamService();
  service.getStreamingPlan = async () => null;
  service.getDecryptedBuffer = async () => Buffer.from('0123456789');
  for (const [range, status, data] of [
    ['bytes=2-4', 206, '234'], ['bytes=7-', 206, '789'], ['bytes=-3', 206, '789'],
    ['bytes=-20', 206, '0123456789'], ['bytes=8-99', 206, '89'],
    ['bytes=-0', 416], ['bytes=10-', 416], ['bytes=4-2', 416],
    ['bytes=0-1,4-5', 416], ['cats=0-1', 416], ['bytes=2junk-4', 416],
    ['bytes=9007199254740992-', 416], ['bytes=-', 416]
  ]) {
    const res = { writeHead(code, headers) { this.status = code; this.headers = headers; }, end(body) { this.body = body; } };
    await service.handleStream({ headers: { range } }, res, '1');
    assert.equal(res.status, status, range);
    if (data) assert.equal(res.body.toString(), data, range);
    else assert.equal(res.headers['Content-Range'], 'bytes */10');
  }
});
