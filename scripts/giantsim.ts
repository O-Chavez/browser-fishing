// The Abyss giants' fights on the reel bots, as the fight director stages them (`src/game/legendfight.ts`,
// `LEGEND_FIGHT`): for each reference hand and Deep Sea Rod, the landed giants' fight lengths and surges, how long each
// act lasts and how many surges fall in it, how many fights get a last stand (by exhaustion, or failing that by a
// surge starting with the line nearly in), the seconds from the last stand to the landing, and how often the reel
// still surges after it. The giants are rolled as the game rolls them (Brutish at 1.5 times, `Zone.legendTag`).
// Run: npx tsx scripts/giantsim.ts [n giants a cell, default 200]
// RODS='[[7,0,1],[6,0,1]]': the cells, as [rod step, Abyss level, marker]. HANDS=careful,skilled.
import { ABYSS, ZONES } from '../src/data/dive';
import { RATING_NAMES, seaGaps, seaRating, type SeaRod } from '../src/game/dive';
import { mulberry } from '../src/game/env';
import { FightDirector } from '../src/game/legendfight';
import { rollFishGaps } from '../src/game/progression';
import { FIGHT_DT, GOOD_MAX, Reel, type Gaps } from '../src/game/reel';
import { HANDS, type BotStyle, type Hand } from '../src/game/reelbot';

const n = Number(process.argv[2] ?? 200);

interface Run {
  landed: boolean;
  t: number;
  surges: number;
  /** Seconds each act lasted, and the surges that started in it. */
  actSecs: [number, number, number];
  actSurges: [number, number, number];
  moves: number;
  /** The last stand: when it came (-1: never), by what, and the surges that started after it. */
  standT: number;
  by: 'exhausted' | 'surge' | null;
  after: number;
}

/** One fight by a bot (`botRun`'s rules, stepped here so the director sees every step, as the game's frame loop shows it). */
function run(d: Gaps, react: number, style: BotStyle, seed: number): Run {
  const r = new Reel(d, mulberry(seed));
  const brng = mulberry(seed ^ 0x5bd1e995);
  const dir = new FightDirector('kraken', mulberry(seed ^ 0x2545f491));
  let holding = true, desired = true, t = 0, surges = 0;
  const queue: { at: number; v: boolean }[] = [];
  const out: Run = { landed: false, t: 0, surges: 0, actSecs: [0, 0, 0], actSurges: [0, 0, 0], moves: 0, standT: -1, by: null, after: 0 };
  while (r.status === 'reeling' && t < 600) {
    const take = r.surging ? Math.min(r.need + style.lo, GOOD_MAX - Math.max(0, style.hi) - 0.03) : 0.6;
    const spent = style.push !== undefined && r.tension > GOOD_MAX && r.strain * 2 - r.wear.frays > style.push;
    const want: boolean = desired ? r.tension <= GOOD_MAX - style.hi && !spent : r.tension < take;
    if (want !== desired) {
      desired = want;
      queue.push({ at: t + react * (0.75 + 0.5 * brng()), v: want });
    }
    while (queue.length && queue[0].at <= t) holding = queue.shift()!.v;
    r.update(FIGHT_DT, holding);
    t += FIGHT_DT;
    const surge = r.surgeCount !== surges;
    surges = r.surgeCount;
    const c = dir.step(FIGHT_DT, { progress: r.progress, fightLeft: r.fightLeft, surge, exhausted: r.exhausted, free: true });
    out.actSecs[c.act - 1] += FIGHT_DT;
    if (surge) out.actSurges[c.act - 1]++;
    if (c.move) out.moves++;
    if (c.last) {
      out.standT = t;
      out.by = r.exhausted ? 'exhausted' : 'surge';
    } else if (surge && out.standT >= 0) out.after++;
  }
  out.landed = r.status === 'caught';
  out.t = t;
  out.surges = surges;
  return out;
}

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '–');
const three = (a: number[]) => `${f1(q(a, 0.1))}/${f1(q(a, 0.5))}/${f1(q(a, 0.9))}`;
const pct = (k: number, of: number) => `${of ? Math.round((100 * k) / of) : 0}%`;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

const cells = JSON.parse(process.env.RODS ?? '[[10,0,1],[9,0,1],[8,0,1],[7,0,1],[7,0,3],[7,0,5],[6,0,1]]') as [number, number, number][];
for (const hand of (process.env.HANDS ?? 'careful,skilled').split(',') as Hand[]) {
  console.log(`\n${hand} (${HANDS[hand].react} s), ${n} giants a cell; p10/p50/p90 where three numbers are given`);
  for (const [steps, levels, marker] of cells) {
    const rod: SeaRod = { steps, levels };
    // The hand's best style here: least fight time per landed giant (as `seafights.ts`).
    let best: { runs: Run[]; secs: number } | null = null;
    for (const st of HANDS[hand].styles) {
      const rng = mulberry(ABYSS * 7919 + marker * 31 + 13);
      const runs: Run[] = [];
      for (let i = 0; i < n; i++) {
        const d = rollFishGaps(seaGaps(ABYSS, marker, rod), rng, ZONES[ABYSS].legendTag).d;
        runs.push(run(d, HANDS[hand].react, st, Math.floor(rng() * 2 ** 31)));
      }
      const landed = runs.filter((f) => f.landed).length;
      const secs = runs.reduce((s, f) => s + f.t, 0) / Math.max(1, landed);
      if (!best || (landed > 0 && (best.runs.every((f) => !f.landed) || secs < best.secs))) best = { runs, secs };
    }
    const L = best!.runs.filter((f) => f.landed);
    const S = L.filter((f) => f.standT >= 0);
    const lead = S.map((f) => f.t - f.standT);
    console.log(`rod step ${steps}${levels ? ` level ${levels}` : ''}, marker ${marker} (${RATING_NAMES[seaRating(ABYSS, marker, rod)]}): landed ${pct(L.length, n)}; fight ${three(L.map((f) => f.t))} s, ${f1(q(L.map((f) => f.surges), 0.5))} surges, ${f1(mean(L.map((f) => f.moves)))} moves`);
    if (!L.length) continue;
    console.log(`  acts 1/2/3: ${[0, 1, 2].map((a) => f1(mean(L.map((f) => f.actSecs[a])))).join(' / ')} s, ${[0, 1, 2].map((a) => f1(mean(L.map((f) => f.actSurges[a])))).join(' / ')} surges`);
    console.log(`  last stand: ${pct(S.length, L.length)} of landed fights (exhausted ${pct(S.filter((f) => f.by === 'exhausted').length, L.length)}, a surge with the line nearly in ${pct(S.filter((f) => f.by === 'surge').length, L.length)}); ${three(lead)} s before the landing (under 2 s: ${pct(lead.filter((x) => x < 2).length, S.length)}); a surge after it ${pct(S.filter((f) => f.after > 0).length, S.length)}`);
  }
}
