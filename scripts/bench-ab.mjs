// A/B benchmark of two commits, alternating runs (A B A B ...) so GPU clock and thermal drift hit
// both sides equally. A render-time difference only counts when the two sets of runs don't overlap.
//
//   npm run bench:ab -- <revA> <revB> [runs=4]
//
// Writes bench-results/ab-<A>-vs-<B>.json with every run's numbers.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [revA, revB, n = '4'] = process.argv.slice(2);
if (!revA || !revB) {
  console.error('usage: npm run bench:ab -- <revA> <revB> [runs=4]');
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
  for (const s of sides) {
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

const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const [A, B] = sides;
const rows = [];
for (const scene of Object.keys(A.runs[0].scenes)) {
  const a = A.runs.map((r) => r.scenes[scene].renderMs);
  const b = B.runs.map((r) => r.scenes[scene].renderMs);
  const d = med(b) - med(a);
  const clear = Math.max(...b) < Math.min(...a) ? 'faster' : Math.min(...b) > Math.max(...a) ? 'slower' : 'no clear change';
  rows.push([`${scene} render ms`, med(a).toFixed(2), med(b).toFixed(2), `${d >= 0 ? '+' : ''}${((100 * d) / med(a)).toFixed(0)}%`, clear, `A ${a.map((x) => x.toFixed(1)).join('/')}  B ${b.map((x) => x.toFixed(1)).join('/')}`]);
  for (const k of ['drawCalls', 'visibleLights']) {
    const x = A.runs[0].scenes[scene][k];
    const y = B.runs[0].scenes[scene][k];
    // Draw calls wobble by one or two as clouds drift in and out of view.
    if (Math.abs(x - y) > 2) rows.push([`${scene} ${k}`, String(x), String(y), `${((100 * (y - x)) / x).toFixed(0)}%`, 'exact', '']);
  }
}
for (const k of Object.keys(A.runs[0].loops)) {
  const x = A.runs[0].loops[k];
  const y = B.runs[0].loops[k];
  if (x !== y) rows.push([`render loops ${k}`, String(x), String(y), '', 'exact', '']);
}
for (const k of Object.keys(A.runs[0].mapChange)) {
  const a = A.runs.map((r) => r.mapChange[k]);
  const b = B.runs.map((r) => r.mapChange[k]);
  const d = med(b) - med(a);
  if (Math.abs(d) < 1e-9 && Math.max(...a) === Math.min(...a)) continue;
  const clear = Math.max(...b) < Math.min(...a) ? 'lower' : Math.min(...b) > Math.max(...a) ? 'higher' : 'no clear change';
  rows.push([`map ${k}`, med(a).toFixed(1), med(b).toFixed(1), med(a) ? `${d >= 0 ? '+' : ''}${((100 * d) / med(a)).toFixed(0)}%` : '', clear, `A ${a.map((x) => x.toFixed(1)).join('/')}  B ${b.map((x) => x.toFixed(1)).join('/')}`]);
}

const head = ['metric', `A ${A.rev}`, `B ${B.rev}`, 'Δ', 'verdict', 'all runs'];
const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
const fmt = (r) => r.map((c, i) => (i === 0 || i >= 4 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  ');
console.log(`\n${A.runs[0].gpu}, ${RUNS} alternating runs per side (medians shown)\n`);
console.log(fmt(head));
console.log(w.map((x) => '-'.repeat(x)).join('  '));
rows.forEach((r) => console.log(fmt(r)));

const safe = (s) => s.replace(/[^\w.-]+/g, '_');
const out = path.resolve('bench-results', `ab-${safe(revA)}-vs-${safe(revB)}.json`);
fs.writeFileSync(out, JSON.stringify({ A: { rev: A.rev, sha: A.sha, runs: A.runs }, B: { rev: B.rev, sha: B.sha, runs: B.runs }, rows }, null, 2) + '\n');
console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
