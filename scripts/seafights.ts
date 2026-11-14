// Charter fight sim (REELING.md, "The sea mapping"): the reference hands (`HANDS`) fight sea fish in each zone (and
// the Abyss's first markers) on a given Deep Sea Rod, each with the style that takes the least time per landed fish
// there, and report the landed share, snaps, the fights a full hold takes (the hold at level 0, `holdFish(0)`, over
// the landed share), long fights, and how the fish tire.
// Run: npx tsx scripts/seafights.ts [n fish a cell, default 200] [rod step, default 0] [Abyss level, default 0]
import { ABYSS, ZONES } from '../src/data/dive';
import { holdFish, RATING_NAMES, rollSeaFish, seaGaps, seaRating, type SeaRod } from '../src/game/dive';
import { mulberry } from '../src/game/env';
import { rollFishGaps } from '../src/game/progression';
import { P } from '../src/game/reel';
import { botFight, HANDS, type BotStyle, type Hand } from '../src/game/reelbot';

const n = Number(process.argv[2] ?? 200);
const rod: SeaRod = { steps: Number(process.argv[3] ?? 0), levels: Number(process.argv[4] ?? 0) };
// START sets where a sea fight starts on the line (P.start).
if (process.env.START) P.start = Number(process.env.START);

interface Row {
  land: number;
  snaps: number;
  /** Seconds of fighting per landed fish, the lost fights included. */
  secs: number;
  /** Share of fights over 60 s, and the 90th-percentile fight. */
  long: number;
  p90: number;
  mean: number;
  /** Share of fights that got the fish tired, and exhausted. */
  tired: number;
  exhausted: number;
}

/** One player in one zone and marker: `n` rolled fish, the same fish for every style. */
function play(zone: number, marker: number, react: number, style: BotStyle): Row {
  const rng = mulberry(zone * 7919 + marker * 31 + 13);
  const fights: { t: number; land: boolean; snap: boolean; tired: boolean; exhausted: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    rollSeaFish(zone, rng);
    // Each fish with its modifiers (tag and spread, `rollFishGaps`); PLAIN=1 fights the bare gaps.
    const d = process.env.PLAIN ? seaGaps(zone, marker, rod) : rollFishGaps(seaGaps(zone, marker, rod), rng).d;
    const seed = Math.floor(rng() * 2 ** 31);
    const f = botFight(d, react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
    const land = f.status === 'caught';
    fights.push({ t: f.t, land, snap: f.status === 'snapped', tired: f.tired, exhausted: f.exhausted });
  }
  const landed = fights.filter((f) => f.land).length;
  const ts = fights.map((f) => f.t).sort((a, b) => a - b);
  return {
    land: landed / n,
    snaps: fights.filter((f) => f.snap).length / n,
    secs: fights.reduce((s, f) => s + f.t, 0) / Math.max(1, landed),
    long: fights.filter((f) => f.t > 60).length / n,
    p90: ts[Math.floor(0.9 * n)],
    mean: ts.reduce((s, t) => s + t, 0) / n,
    tired: fights.filter((f) => f.tired).length / n,
    exhausted: fights.filter((f) => f.exhausted).length / n,
  };
}

const players = (process.env.HANDS ?? 'careful,skilled').split(',').map((h) => ({ name: `${h} (${HANDS[h as Hand].react} s)`, ...HANDS[h as Hand] }));
const places: [number, number][] = [...ZONES.slice(0, ABYSS).map((_, z): [number, number] => [z, 0]), [ABYSS, 1], [ABYSS, 6], [ABYSS, 11]];

const pct = (x: number) => `${Math.round(100 * x)}%`;
for (const p of players) {
  console.log(`\n${p.name}, rod step ${rod.steps} Abyss level ${rod.levels}, ${n} fish a cell`);
  console.log('zone           rating    land  snaps  fights  >60s   p90    mean  tired  exhausted');
  for (const [zone, marker] of places) {
    // The best style here: least fight time per landed fish.
    let best: Row | null = null;
    for (const st of p.styles) {
      const r = play(zone, marker, p.react, st);
      if (!best || (r.land > 0 && (best.land === 0 || r.secs < best.secs))) best = r;
    }
    const r = best!;
    const where = `${ZONES[zone].name}${zone === ABYSS ? ` ${marker}` : ''}`;
    console.log(
      `${where.padEnd(14)} ${RATING_NAMES[seaRating(zone, marker, rod)].padEnd(8)} ${pct(r.land).padStart(4)}  ${pct(r.snaps).padStart(5)}  ${(r.land ? (holdFish(0) / r.land).toFixed(1) : '–').padStart(6)}  ${pct(r.long).padStart(4)}  ${r.p90.toFixed(0).padStart(4)}s  ${r.mean.toFixed(0).padStart(4)}s  ${pct(r.tired).padStart(5)}  ${pct(r.exhausted).padStart(9)}`,
    );
  }
}
