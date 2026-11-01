// Rewrites the page's stylesheet for the TV's Chrome 66 WebView. Usage: node transform-css.js <css file>
// (rewrites in place).
//
// 1. Chrome 66 does not know :fullscreen, and one unknown selector invalidates the whole rule list, so the
//    page's fullscreen rules (written as `.x:fullscreen, .x.is-fullscreen`) are dropped. Keep only the
//    `.is-fullscreen` half.
// 2. A D-pad has no pointer, so give every `:hover` selector a `:focus` twin: the focused control looks the
//    way the page already styles a hovered one.
const fs = require('node:fs');

const file = process.argv[2];
const css = fs.readFileSync(file, 'utf8');

const out = '#app:not([data-v-app]){visibility:hidden}\n' + css.replace(/([^{}]+)\{/g, (match, selectors) => {
  if (selectors.trim().startsWith('@')) return match;
  const list = selectors.split(',').filter(s => !s.includes(':fullscreen'));
  if (list.length === 0) return match;
  const focusTwins = list.filter(s => s.includes(':hover')).map(s => s.replace(/:hover/g, ':focus'));
  return list.concat(focusTwins).join(',') + '{';
});
fs.writeFileSync(file, out);

const left = (out.match(/:fullscreen/g) || []).length;
if (left > 0) throw new Error(`${left} :fullscreen selectors left in ${file}`);
