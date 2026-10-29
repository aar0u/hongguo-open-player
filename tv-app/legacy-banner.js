// Prepended to app.js for old WebViews (Chrome 66).
// fetch() defaulted to credentials 'omit' before Chrome 68, which drops the session cookie.
// keepalive requests with a JSON body need a preflight, which Chrome 66 rejects, so drop the flag.
(function () {
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    var opts = Object.assign({ credentials: 'same-origin' }, init);
    delete opts.keepalive;
    return nativeFetch.call(window, input, opts);
  };
})();

// The server answers with Referrer-Policy: no-referrer, and Chrome 66 then sends `Origin: null` on
// same-origin POSTs, which the server's origin check rejects (progress saves, favorites).
(function () {
  var m = document.createElement('meta');
  m.name = 'referrer';
  m.content = 'same-origin';
  document.head.appendChild(m);
})();

// Chrome 66 only has the prefixed Fullscreen API; emulate the standard one. The shell window is
// already full screen, so this only needs to drive the page's own fullscreen layout.
(function () {
  if ('fullscreenElement' in document) return;
  var fs = null;
  function change() { document.dispatchEvent(new Event('fullscreenchange')); }
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: function () { return fs; } });
  Element.prototype.requestFullscreen = function () { fs = this; change(); return Promise.resolve(); };
  document.exitFullscreen = function () { fs = null; change(); return Promise.resolve(); };
})();

// Vue compiles the in-DOM template at runtime and keeps `?.` as written, which Chrome 66 cannot parse.
(function () {
  var root = document.getElementById('app');
  if (!root) return;
  var simple = /([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\?\.([\w$]+)/;
  var grouped = /(\([^()]*\))\?\.([\w$]+)/;
  var html = root.innerHTML;
  for (var i = 0; i < 100 && html.indexOf('?.') !== -1; i++) {
    var next = html.replace(simple, '($1 && $1.$2)');
    if (next === html) next = html.replace(grouped, '($1 && $1.$2)');
    if (next === html) break;
    html = next;
  }
  root.innerHTML = html;
})();
