// Compares two bench runs: npm run bench:compare -- baseline after-change
import fs from 'node:fs';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('usage: npm run bench:compare -- <before-label> <after-label>');
  process.exit(1);
}
const load = (l) => JSON.parse(fs.readFileSync(`bench-results/${l}.json`, 'utf8'));
const A = load(a);
const B = load(b);

const rows = [];
const row = (name, x, y, lowerIsBetter = true, digits = 2) => {
  const d = y - x;
  const pct = x ? (100 * d) / x : 0;
  const better = lowerIsBetter ? d < 0 : d > 0;
  const mark = Math.abs(d) < 1e-9 ? '' : better ? '✓' : '✗';
  rows.push([name, x.toFixed(digits), y.toFixed(digits), `${d >= 0 ? '+' : ''}${d.toFixed(digits)}`, x ? `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%` : '', mark]);
};

for (const k of Object.keys(A.scenes)) {
  const s = A.scenes[k];
  const t = B.scenes[k];
  if (!t) continue;
  row(`${k} render ms`, s.renderMs, t.renderMs);
  // A change is only "real" if it clears the interquartile spread of both runs.
  const noise = Math.max(s.renderMsP75 - s.renderMsP25, t.renderMsP75 - t.renderMsP25);
  rows[rows.length - 1][5] += Math.abs(t.renderMs - s.renderMs) < noise ? ' (within noise)' : '';
  row(`${k} draw calls`, s.drawCalls, t.drawCalls, true, 0);
  row(`${k} lights`, s.visibleLights, t.visibleLights, true, 0);
}
for (const k of Object.keys(A.loops)) row(`render loops ${k}`, A.loops[k], B.loops[k], true, 0);
for (const k of Object.keys(A.mapChange)) row(`map ${k}`, A.mapChange[k], B.mapChange[k], true, 1);

const head = ['metric', a, b, 'Δ', 'Δ%', ''];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
const fmt = (r) => r.map((c, i) => (i === 0 ? String(c).padEnd(w[i]) : String(c).padStart(w[i]))).join('  ');
console.log(fmt(head));
console.log(w.map((n) => '-'.repeat(n)).join('  '));
rows.forEach((r) => console.log(fmt(r)));
