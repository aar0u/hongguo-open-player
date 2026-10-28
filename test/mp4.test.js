const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decryptMp4Buffer } = require('../src/server/native/hongguo');
function box(type, payload = Buffer.alloc(0)) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length);
  result.write(type, 4);
  payload.copy(result, 8);
  return result;
}
test('MP4 rejects nonadvancing, truncated and excessively nested boxes', () => {
  const extended = Buffer.alloc(16);
  extended.writeUInt32BE(1);
  extended.write('mdat', 4); // extended size zero would previously loop forever
  assert.throws(() => decryptMp4Buffer(Buffer.concat([box('moov'), extended])), /box size/);
  assert.throws(() => decryptMp4Buffer(Buffer.concat([box('moov'), Buffer.from([1])])), /Truncated/);
  const short = Buffer.from(extended.subarray(0, 8));
  assert.throws(() => decryptMp4Buffer(short), /header/);
  let nested = box('free');
  for (let i = 0; i < 35; i++) nested = box('moov', nested);
  assert.throws(() => decryptMp4Buffer(nested), /nesting/);
  const valid = Buffer.concat([box('ftyp'), box('moov'), box('mdat', Buffer.from('media'))]);
  assert.deepEqual(decryptMp4Buffer(Buffer.from(valid)), valid);
});
