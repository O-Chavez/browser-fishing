// The foundation (REELING.md), headless: the fight (`Reel`, a fish as its two gaps over the gear, fixed timing, no
// random spread), with the reference hands (`HANDS` in reelbot.ts). Prints:
// 1. each axis alone from -2 to +3: land %, mean seconds, losses (s snapped, r ran off, T still going at 10 minutes);
// 2. the grid 0..+3 on both axes, diagonals included;
// 3. each hand's frontier: at each weight gap, the largest strength gap it still lands half of (to 0.05), and the sum.
// Run: npx tsx scripts/gaugesim.ts [n fights per style, default 20] [lever=value ...]
//   e.g. tireDrop=0 (the threshold stays put as the fish tires), win=0.06, 'giveBy=[[0,1],[3,8]]'
// Env: HANDS=careful,skilled,best,anticipating,ceiling (the default); SKIP=axes,grid,frontier to leave parts out.
import type { Gaps, ReelTune } from '../src/game/reel';
import { HANDS, handCell, type BotCell, type Hand } from '../src/game/reelbot';

const [nArg, ...rest] = process.argv.slice(2);
const n = Number(nArg ?? 20);
const tune: ReelTune = {};
for (const kv of rest) {
  const [k, v] = kv.split('=');
  (tune as Record<string, unknown>)[k] = v === 'true' ? true : v === 'false' ? false : v.startsWith('[') ? JSON.parse(v) : Number(v);
}
const hands = (process.env.HANDS ?? 'careful,skilled,best,anticipating,ceiling').split(',') as Hand[];
const skip = new Set((process.env.SKIP ?? '').split(','));

const cell = (fish: Gaps, h: Hand): BotCell => handCell(fish, h, n, tune);
const show = (c: BotCell) => {
  const ran = Math.round((1 - c.land - c.snaps - c.timeouts) * n), sn = Math.round(c.snaps * n), to = Math.round(c.timeouts * n);
  return `${Math.round(c.land * 100)}% ${Math.round(c.t)}s${sn ? ` s${sn}` : ''}${ran ? ` r${ran}` : ''}${to ? ` T${to}` : ''}`;
};
const sign = (x: number) => (x > 0 ? `+${x}` : `${x}`);

console.log(`n ${n} per style${rest.length ? `, ${rest.join(' ')}` : ''}`);

if (!skip.has('axes')) {
  const steps = [-2, -1, 0, 0.5, 1, 1.5, 2, 2.5, 3];
  for (const axis of ['weight', 'strength'] as const) {
    console.log(`\n**${axis} alone** (the other gap 0)`);
    console.log(`| Hand | ${steps.map(sign).join(' | ')} |\n|---|${steps.map(() => '---|').join('')}`);
    for (const h of hands) console.log(`| ${h} | ${steps.map((x) => show(cell({ strength: axis === 'strength' ? x : 0, weight: axis === 'weight' ? x : 0 }, h))).join(' | ')} |`);
  }
}

if (!skip.has('grid')) {
  for (const h of hands) {
    console.log(`\n**${h}** (${HANDS[h].react} s): strength gap down, weight gap across`);
    console.log('| | +0 | +1 | +2 | +3 |\n|---|---|---|---|---|');
    for (const s of [0, 1, 2, 3]) console.log(`| +${s} | ${[0, 1, 2, 3].map((w) => show(cell({ strength: s, weight: w }, h))).join(' | ')} |`);
  }
}

if (!skip.has('frontier')) {
  // Bisection on the strength gap, assuming the land rate falls as it grows; -2 means not even a fish 2 under the line.
  const frontier = (w: number, h: Hand) => {
    let lo = -2, hi = 4;
    if (cell({ strength: lo, weight: w }, h).land < 0.5) return lo;
    while (hi - lo > 0.05) {
      const mid = (lo + hi) / 2;
      if (cell({ strength: mid, weight: w }, h).land >= 0.5) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const ws = [-1, 0, 0.5, 1, 1.5, 2, 2.5, 3];
  console.log('\n**Frontier**: the largest strength gap landed half the time, at each weight gap (strength + weight in brackets)');
  console.log(`| Hand | ${ws.map((w) => `w ${sign(w)}`).join(' | ')} |\n|---|${ws.map(() => '---|').join('')}`);
  for (const h of hands)
    console.log(`| ${h} | ${ws.map((w) => { const s = frontier(w, h); return s <= -2 ? '–' : `${s.toFixed(2)} (${(s + w).toFixed(2)})`; }).join(' | ')} |`);
}
