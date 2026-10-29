// Prepended to app.js for old WebViews (Chrome 66).
// fetch() defaulted to credentials 'omit' before Chrome 68, which drops the session cookie.
(function () {
  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    return nativeFetch.call(window, input, Object.assign({ credentials: 'same-origin' }, init));
  };
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
