// A/B benchmark of two commits. Runs alternate (A B, B A, A B, ...) and each A run is paired with
// the B run next to it, so machine-wide drift (GPU clocks, heat, other apps) cancels out within a
// pair even when it swamps the difference between runs. A change is only called when every pair
// agrees on its direction.
//
//   npm run bench:ab -- <revA> <revB> [runs=6]
//   npm run bench:ab -- --report bench-results/ab-<A>-vs-<B>.json   (re-print a saved comparison)
//
// Writes bench-results/ab-<A>-vs-<B>.json with every run's numbers.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--report') {
  const saved = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  report(saved.A, saved.B);
  process.exit(0);
}

const [revA, revB, n = '6'] = args;
if (!revA || !revB) {
  console.error('usage: npm run bench:ab -- <revA> <revB> [runs=6]');
  process.exit(1);
}
const RUNS = Number(n);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const work = path.resolve('.bench');
const sides = [revA, revB].map((rev) => {
  const sha = git('rev-parse', '--short', rev);
  const dir = path.join(work, `wt-${sha}`);
  if (!fs.existsSync(dir)) {
    git('worktree', 'add', '--detach', dir, sha);
    fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'));
  }
  return { rev, sha, dir, runs: [] };
});

for (let i = 0; i < RUNS; i++) {
  // Swap the order every other pair (A B, B A, ...): the second run of a pair tends to be slower.
  for (const s of i % 2 ? [...sides].reverse() : sides) {
    const label = `${s.sha}-${i}`;
    process.stdout.write(`run ${i + 1}/${RUNS} ${s.rev} (${s.sha})... `);
    // Always run the current bench script, so both sides are measured the same way.
    execFileSync('node', [path.resolve('scripts/bench.mjs'), label], {
      env: { ...process.env, BENCH_ROOT: s.dir, BENCH_OUT: path.join(work, 'runs'), BENCH_ROUNDS: '1' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    s.runs.push(JSON.parse(fs.readFileSync(path.join(work, 'runs', `${label}.json`), 'utf8')));
    console.log('done');
  }
}

const [A, B] = sides;
const safe = (s) => s.replace(/[^\w.-]+/g, '_');
const out = path.resolve('bench-results', `ab-${safe(revA)}-vs-${safe(revB)}.json`);
fs.writeFileSync(out, JSON.stringify({ A: { rev: A.rev, sha: A.sha, runs: A.runs }, B: { rev: B.rev, sha: B.sha, runs: B.runs } }, null, 2) + '\n');
report(A, B);
console.log(`\nWrote ${path.relative(process.cwd(), out)}`);

function report(A, B) {
  const median = (a) => {
    const s = [...a].sort((x, y) => x - y);
    const h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };
  const pct = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(0)}%`;
  const rows = [];
  // Per-pair % change of B against the A run just before it.
  const paired = (name, get, lower = 'faster', higher = 'slower') => {
    const a = A.runs.map(get);
    const b = B.runs.map(get);
    const n = Math.min(a.length, b.length);
    const ch = Array.from({ length: n }, (_, i) => (a[i] ? (100 * (b[i] - a[i])) / a[i] : 0));
    if (ch.every((c) => Math.abs(c) < 1e-9)) return;
    const down = ch.filter((c) => c < 0).length;
    const verdict = down === n ? `${lower} in ${n}/${n} pairs` : down === 0 ? `${higher} in ${n}/${n} pairs` : `mixed (${down}/${n} ${lower})`;
    rows.push([name, median(a).toFixed(2), median(b).toFixed(2), pct(median(ch)), verdict, ch.map(pct).join(' ')]);
  };
  // Counts should be identical on every run; report the most common value and flag any disagreement.
  const exact = (name, get, tolerance = 0) => {
    const mode = (side) => {
      const vals = side.runs.map(get);
      const c = new Map();
      vals.forEach((v) => c.set(v, (c.get(v) ?? 0) + 1));
      const [v, n] = [...c].sort((a, b) => b[1] - a[1])[0];
      return { v, varied: n < vals.length ? ` (${vals.length - n}/${vals.length} runs differ)` : '' };
    };
    const x = mode(A);
    const y = mode(B);
    if (Math.abs(x.v - y.v) <= tolerance) return;
    const fmtN = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    rows.push([name, fmtN(x.v), fmtN(y.v), x.v ? pct((100 * (y.v - x.v)) / x.v) : '', `exact count${x.varied}${y.varied}`, '']);
  };
  for (const scene of Object.keys(A.runs[0].scenes)) {
    paired(`${scene} render ms`, (r) => r.scenes[scene].renderMs);
    // Draw calls wobble by one or two as clouds drift in and out of view.
    exact(`${scene} draw calls`, (r) => r.scenes[scene].drawCalls, 2);
    exact(`${scene} lights`, (r) => r.scenes[scene].visibleLights);
  }
  for (const k of Object.keys(A.runs[0].loops)) exact(`render loops ${k}`, (r) => r.loops[k]);
  for (const k of Object.keys(A.runs[0].mapChange)) {
    if (/PerTrip$/.test(k)) exact(`map ${k}`, (r) => r.mapChange[k]);
    else paired(`map ${k}`, (r) => r.mapChange[k], 'lower', 'higher');
  }

  const head = ['metric', `A ${A.rev}`, `B ${B.rev}`, 'Δ (median pair)', 'verdict', 'each pair'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (r) => r.map((c, i) => (i === 0 || i >= 4 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ');
  console.log(`\n${A.runs[0].gpu}, ${Math.min(A.runs.length, B.runs.length)} alternating pairs\n`);
  console.log(fmt(head));
  console.log(w.map((x) => '-'.repeat(x)).join('  '));
  rows.forEach((r) => console.log(fmt(r)));
}
