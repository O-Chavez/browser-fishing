// Charter fight sim (REELING.md, "Oscar's first charters"): the reel bots fight rolled sea fish depth by depth on a
// fresh spool and base gear, and report spool per marker, long fights, snaps and where each player runs out of line.
// Run: npx tsx scripts/seafights.ts [n fish a depth, default 200] [last depth, default 55] [rod level] [line level]
import { DIVE } from '../src/data/dive';
import { SEA_TUNE, fightTune, lineWorn, rollSeaFish, seaDifficulty } from '../src/game/dive';
import { mulberry } from '../src/game/env';
import { rollSize, sizeDifficulty } from '../src/game/progression';
import { botFight, STYLES, type BotStyle } from '../src/game/reelbot';

const n = Number(process.argv[2] ?? 200);
const last = Number(process.argv[3] ?? 55);
const gear = { rod: Number(process.argv[4] ?? 0), line: Number(process.argv[5] ?? 0) };
// TIRE="k,w0,min,slack,burst,exhaustedWeight,tiredAt,tiredGap,tiredPull,tiredSurge,calm" tries other fight-left levers (P.tire);
// TIRE=0 plays without tiring.
// START sets where a sea fight starts on the line (P.start), MPL the spool metres per fight length (DIVE.metresPerLine).
if (process.env.START) SEA_TUNE.start = Number(process.env.START);
if (process.env.MPL) DIVE.metresPerLine = Number(process.env.MPL);
if (process.env.TIRE === '0') delete SEA_TUNE.powerJitter;
if (process.env.TIRE) SEA_TUNE.tire = process.env.TIRE === '0' ? [0, 1, 0.5, 0.25, 1, 1, 0.5, 2, 0.5, 0, 0] : process.env.TIRE.split(',').map(Number);

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
    const d = seaDifficulty(depth, gear, bite.fish, bite.pull, sizeDifficulty(bite.fish, size));
    const seed = Math.floor(rng() * 2 ** 31);
    const f = botFight(d, react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995), fightTune(bite.behaviour, bite.fish.id));
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

const players: { name: string; react: number; styles: BotStyle[] }[] = [
  { name: 'Fast (0.25 s, best style)', react: 0.25, styles: STYLES },
  { name: 'Careful (0.3 s, eases off 0.2 short)', react: 0.3, styles: [{ lo: 0.05, hi: 0.2 }] },
];

const pct = (x: number) => `${Math.round(100 * x)}%`;
for (const p of players) {
  console.log(`\n${p.name}, rod +${gear.rod} line +${gear.line}, ${n} fish a depth`);
  console.log('depth  land  snaps  m/fish  >60s   p90    mean  tired  exhausted  tired surges');
  let spool = 0;
  let outAt: number | null = null;
  for (let depth = 0; depth <= last; depth++) {
    // The best style here: least spool per landed fish.
    let best: Row | null = null;
    for (const st of p.styles) {
      const r = play(depth, p.react, st);
      if (!best || r.metres < best.metres) best = r;
    }
    const r = best!;
    spool += r.metres;
    if (outAt === null && spool > DIVE.spool) outAt = depth;
    if (depth % 5 === 0 || depth === last)
      console.log(
        `${String(depth).padStart(5)}  ${pct(r.land).padStart(4)}  ${pct(r.snaps).padStart(5)}  ${r.metres.toFixed(1).padStart(6)}  ${pct(r.long).padStart(4)}  ${r.p90.toFixed(0).padStart(4)}s  ${r.mean.toFixed(0).padStart(4)}s  ${pct(r.tired).padStart(5)}  ${pct(r.exhausted).padStart(9)}  ${r.tiredSurges.toFixed(1).padStart(12)}`,
      );
  }
  console.log(`Out of line from the harbour: ${outAt === null ? `past fish ${last}` : `fish ${outAt}`} (${spool.toFixed(0)} m to depth ${last})`);
}
