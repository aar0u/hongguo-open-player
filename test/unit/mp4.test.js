const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decryptMp4Buffer } = require('../../src/server/native/hongguo');
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

test('faststart places moov before media and relocates chunk offsets', () => {
  function moov(offset) {
    const table = Buffer.alloc(12);
    table.writeUInt32BE(1, 4);
    table.writeUInt32BE(offset, 8);
    return box('moov', box('trak', box('mdia', box('minf', box('stbl',
      Buffer.concat([box('stco', table), box('senc')]))))));
  }
  for (const mediaFirst of [true, false]) {
    const media = box('mdat', Buffer.alloc(100));
    const originalMoov = moov(0);
    const offset = mediaFirst ? 8 : originalMoov.length + 8;
    const input = mediaFirst ? Buffer.concat([media, moov(offset)]) : Buffer.concat([moov(offset), media]);
    const output = decryptMp4Buffer(input);
    const tablePosition = output.indexOf(Buffer.from('stco')) - 4;
    assert.equal(output.readUInt32BE(tablePosition + 16), originalMoov.length);
    assert.ok(output.indexOf(Buffer.from('moov')) < output.indexOf(Buffer.from('mdat')));
  }
});

test('native CTR decrypts complete and partial AES blocks including binary data', () => {
  const { encryptedMp4 } = require('../helpers/mp4');
  const crypto = require('node:crypto');
  const key = crypto.randomBytes(16), nonce = crypto.randomBytes(8);
  for (const length of [1, 15, 16, 17, 1024 * 1024 + 3]) {
    const plain = crypto.randomBytes(length);
    const output = decryptMp4Buffer(encryptedMp4(plain, key, nonce), key);
    assert.deepEqual(output.subarray(output.indexOf(Buffer.from('mdat')) + 4), plain);
  }
});
