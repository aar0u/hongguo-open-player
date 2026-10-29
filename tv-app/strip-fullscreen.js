// Chrome 66 does not know :fullscreen, and one unknown selector invalidates the whole rule list, so the
// page's fullscreen rules (written as `.x:fullscreen, .x.is-fullscreen`) are dropped. Keep only the
// `.is-fullscreen` half. Usage: node strip-fullscreen.js <css file> (rewrites in place).
const fs = require('node:fs');

const file = process.argv[2];
const css = fs.readFileSync(file, 'utf8');
const out = css.replace(/([^{}]+)\{/g, (match, selectors) => {
  if (selectors.trim().startsWith('@')) return match;
  const kept = selectors.split(',').filter(s => !s.includes(':fullscreen'));
  return kept.length === 0 ? match : kept.join(',') + '{';
});
fs.writeFileSync(file, out);

const left = (out.match(/:fullscreen/g) || []).length;
if (left > 0) throw new Error(`${left} :fullscreen selectors left in ${file}`);
