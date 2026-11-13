const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('TV error overlay captures directional and select keys for retry', () => {
  const source = fs.readFileSync(require.resolve('../../tv-app/tv-player.js'), 'utf8');
  const start = source.indexOf("window.addEventListener('keydown', function (e) {");
  const end = source.indexOf('\n  }, true);', start);
  assert.ok(start >= 0 && end > start);
  let handler, clicks = 0, focuses = 0;
  const retry = { click() { clicks++; }, focus() { focuses++; } };
  const document = { activeElement: null, getElementById() { return null; } };
  vm.runInNewContext(source.slice(start, end + '\n  }, true);'.length), {
    document, retryButton: () => retry,
    window: { addEventListener(_type, fn) { handler = fn; } }
  });
  function key(name, repeat = false) {
    const e = { key: name, repeat, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    handler(e);
    assert.equal(e.prevented, true);
    assert.equal(e.stopped, true);
  }
  key('ArrowRight');
  key('ArrowUp');
  key('Enter');
  key('Enter', true);
  assert.equal(clicks, 1);
  assert.equal(focuses, 4);
});
