// Charter fight sim (REELING.md, "The sea mapping"): the reference hands (`HANDS`) fight sea fish depth by depth on
// the given levels, each with the style that costs the least spool there, and report spool per marker, long fights,
// snaps, and how far one spool lasts from each start marker (every fish fought until one lands, never heading home).
// Run: npx tsx scripts/seafights.ts [n fish a depth, default 200] [last depth, default 55] [rod level] [line level]
import { DIVE } from '../src/data/dive';
import { lineWorn, rollSeaFish, seaGaps } from '../src/game/dive';
import { mulberry } from '../src/game/env';
import { rollFishGaps, rollSize } from '../src/game/progression';
import { P } from '../src/game/reel';
import { botFight, HANDS, type BotStyle, type Hand } from '../src/game/reelbot';

const n = Number(process.argv[2] ?? 200);
const last = Number(process.argv[3] ?? 55);
const gear = { rod: Number(process.argv[4] ?? 0), line: Number(process.argv[5] ?? 0) };
// START sets where a sea fight starts on the line (P.start), MPL the spool metres per fight length (DIVE.metresPerLine).
if (process.env.START) P.start = Number(process.env.START);
if (process.env.MPL) DIVE.metresPerLine = Number(process.env.MPL);

interface Row {
  land: number;
  snaps: number;
  /** Metres of spool per landed fish, the failed fights included. */
  metres: number;
  /** Share of fights over 60 s, and the 90th-percentile fight. */
  long: number;
  p90: number;
  mean: number;
  /** Share of fights that got the fish tired, and exhausted. */
  tired: number;
  exhausted: number;
  /** Mean surges while tired, over the fights that got the fish exhausted. */
  tiredSurges: number;
}

/** One player at one depth: `n` rolled fish, the same fish for every style. */
function play(depth: number, react: number, style: BotStyle): Row {
  const rng = mulberry(depth * 7919 + 13);
  const fights: { t: number; m: number; land: boolean; snap: boolean; tired: boolean; exhausted: boolean; tiredSurges: number }[] = [];
  for (let i = 0; i < n; i++) {
    const bite = rollSeaFish(depth, rng);
    const size = rollSize(bite.fish, rng);
    // Each fish with its modifiers (tag and spread, `rollFishGaps`); PLAIN=1 fights the bare gaps.
    const d = process.env.PLAIN ? seaGaps(depth, gear) : rollFishGaps(seaGaps(depth, gear), rng).d;
    const seed = Math.floor(rng() * 2 ** 31);
    const f = botFight(d, react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
    const land = f.status === 'caught';
    fights.push({ t: f.t, land, snap: f.status === 'snapped', tired: f.tired, exhausted: f.exhausted, tiredSurges: f.tiredSurges, m: lineWorn({ lineOut: f.lineOut, frays: f.frays, snapped: f.status === 'snapped' }, land) });
  }
  const landed = fights.filter((f) => f.land).length;
  const ts = fights.map((f) => f.t).sort((a, b) => a - b);
  return {
    land: landed / n,
    snaps: fights.filter((f) => f.snap).length / n,
    metres: fights.reduce((s, f) => s + f.m, 0) / Math.max(1, landed),
    long: fights.filter((f) => f.t > 60).length / n,
    p90: ts[Math.floor(0.9 * n)],
    mean: ts.reduce((s, t) => s + t, 0) / n,
    tired: fights.filter((f) => f.tired).length / n,
    exhausted: fights.filter((f) => f.exhausted).length / n,
    tiredSurges: fights.filter((f) => f.exhausted).reduce((s, f) => s + f.tiredSurges, 0) / Math.max(1, fights.filter((f) => f.exhausted).length),
  };
}

const players = (process.env.HANDS ?? 'careful,skilled').split(',').map((h) => ({ name: `${h} (${HANDS[h as Hand].react} s)`, ...HANDS[h as Hand] }));

const pct = (x: number) => `${Math.round(100 * x)}%`;
for (const p of players) {
  console.log(`\n${p.name}, rod +${gear.rod} line +${gear.line}, ${n} fish a depth`);
  console.log('depth  land  snaps  m/fish  >60s   p90    mean  tired  exhausted  tired surges');
  const rows: Row[] = [];
  for (let depth = 0; depth <= last; depth++) {
    // The best style here: least spool per landed fish.
    let best: Row | null = null;
    for (const st of p.styles) {
      const r = play(depth, p.react, st);
      if (!best || (r.land > 0 && (best.land === 0 || r.metres < best.metres))) best = r;
    }
    const r = rows[depth] = best!;
    if (depth % 5 === 0 || depth === last)
      console.log(
        `${String(depth).padStart(5)}  ${pct(r.land).padStart(4)}  ${pct(r.snaps).padStart(5)}  ${(r.land ? r.metres.toFixed(1) : '–').padStart(6)}  ${pct(r.long).padStart(4)}  ${r.p90.toFixed(0).padStart(4)}s  ${r.mean.toFixed(0).padStart(4)}s  ${pct(r.tired).padStart(5)}  ${pct(r.exhausted).padStart(9)}  ${r.tiredSurges.toFixed(1).padStart(12)}`,
      );
  }
  // One spool from each start marker: each depth costs its spool per landed fish until the line runs out, or the
  // fights stop it first (no fish landed there).
  const reach: string[] = [];
  for (let start = 0; start <= last; start += DIVE.ledgeEvery) {
    let spool = 0, depth = start;
    while (depth <= last && rows[depth].land > 0 && spool + rows[depth].metres <= DIVE.spool) spool += rows[depth++].metres;
    const why = depth > last ? `past ${last}` : rows[depth].land === 0 ? `fights stop it at ${depth}` : `out of line at ${depth}`;
    reach.push(`from ${start}: ${depth - start} fish, ${why}`);
    if (rows[start].land === 0) break;
  }
  console.log(`One spool (${DIVE.spool} m), every fish fought until one lands:\n  ${reach.join('\n  ')}`);
}
