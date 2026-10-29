// Prepended to app.js for old WebViews: Vue compiles the in-DOM template at runtime and keeps `?.` as written.
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
