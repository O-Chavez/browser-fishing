// Charter economy sim (REELING.md, "Sea economy", "The sea mapping" and "The edge pays"): the reference hands (`HANDS`)
// fight rolled sea fish at every depth, then whole charters are played from those fights for each start marker and
// head-home rule. It reports the best pearls an hour with the charter that earns it and its coins, and what three
// ways of avoiding the edge earn next to it: farming (charters that end 20 or more fish short of the wall), hops
// (charters of one marker) and never heading home (fishing until the line runs out). Assumes every marker is charted.
// Run: npx tsx scripts/seaeconomy.ts [rod level] [line level] [last depth, default 120] [fights a depth, default 80]
import { DIVE } from '../src/data/dive';
import { haulBonus, inPearlWater, isLedge, lineWorn, pearlsAt, rollSeaFish, seaGaps } from '../src/game/dive';
import { mulberry } from '../src/game/env';
import { rollFishGaps, rollSize, sellValue } from '../src/game/progression';
import { botFight, HANDS, type BotStyle, type Hand } from '../src/game/reelbot';

const gear = { rod: Number(process.argv[2] ?? 0), line: Number(process.argv[3] ?? 0) };
const last = Number(process.argv[4] ?? 120);
const n = Number(process.argv[5] ?? 80);
/** Seconds to a bite, around each fish (strike, landing card) and around each charter (flight out and home). */
const BITE = 4.5, AROUND = 4, CHARTER = 45;
const CHARTERS = 300;

interface Fight { t: number; metres: number; landed: boolean; coins: number }

/** `n` rolled fish at a depth, fought by one player with the style that costs the least spool there. */
function pool(depth: number, react: number, styles: BotStyle[]): Fight[] {
  let best: Fight[] | null = null, bestCost = Infinity;
  for (const style of styles) {
    const rng = mulberry(depth * 7919 + 13);
    const fights: Fight[] = [];
    for (let i = 0; i < n; i++) {
      const bite = rollSeaFish(depth, rng);
      const size = rollSize(bite.fish, rng);
      // Each fish with its modifiers (tag and spread, `rollFishGaps`); PLAIN=1 fights the bare gaps.
      const d = process.env.PLAIN ? seaGaps(depth, gear) : rollFishGaps(seaGaps(depth, gear), rng).d;
      const seed = Math.floor(rng() * 2 ** 31);
      const f = botFight(d, react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
      const landed = f.status === 'caught';
      const coins = landed ? Math.round(sellValue(bite.fish, size) * (f.frays === 0 ? 1.1 : 1)) : 0;
      fights.push({ t: f.t, landed, coins, metres: lineWorn({ lineOut: f.lineOut, frays: f.frays, snapped: f.status === 'snapped' }, landed) });
    }
    const landed = fights.filter((f) => f.landed).length;
    const cost = landed ? fights.reduce((s, f) => s + f.metres, 0) / landed : Infinity;
    if (!best || cost < bestCost) (best = fights), (bestCost = cost);
  }
  return best!;
}

/** Charters from `start`, heading home at the first marker with less than `home` metres of line left (0: never). */
function charters(pools: Fight[][], start: number, home: number) {
  const rng = mulberry(start * 31 + home);
  let secs = 0, pearls = 0, coins = 0, sunk = 0, fights = 0, end = 0;
  for (let c = 0; c < CHARTERS; c++) {
    secs += CHARTER;
    let depth = start, line = DIVE.spool, haul = 0, grown = 0;
    for (;;) {
      const p = pools[Math.min(depth, pools.length - 1)];
      const f = p[Math.floor(rng() * p.length)];
      secs += BITE + AROUND + f.t;
      fights++;
      line -= f.metres;
      coins += f.coins;
      if (f.landed) haul += pearlsAt(depth++, gear);
      // Out of line: the haul comes home without its bonus.
      if (line <= 0) { sunk++; pearls += haul; break; }
      if (f.landed && isLedge(depth)) {
        if (inPearlWater(depth - 1, gear)) grown++;
        if (line < home) { pearls += Math.round(haul * haulBonus(grown)); break; }
      }
    }
    end += depth;
  }
  const h = secs / 3600;
  return { pearls: pearls / h, coins: coins / h, sunk: sunk / CHARTERS, fights: fights / CHARTERS, end: end / CHARTERS, mins: secs / 60 / CHARTERS };
}

const players = (process.env.HANDS ?? 'careful,skilled').split(',').map((h) => ({ name: h, ...HANDS[h as Hand] }));
const pct = (x: number) => `${Math.round(100 * x)}%`;
for (const p of players) {
  const pools: Fight[][] = [];
  for (let depth = 0; depth <= last; depth++) pools.push(pool(depth, p.react, p.styles));
  // The wall: the first marker where fewer than half the fish land.
  let wall = 0;
  for (let d = 0; d <= last; d += DIVE.ledgeEvery) {
    wall = d;
    if (pools[d].filter((f) => f.landed).length / pools[d].length < 0.5) break;
  }
  let best = { pearls: 0, coins: 0, sunk: 0, fights: 0, end: 0, mins: 0, start: 0, home: 0 };
  let farm = 0, hop = 0, never = 0;
  for (let start = 0; start <= last - 10; start += DIVE.ledgeEvery) {
    for (let home = 0; home <= DIVE.spool; home += 25) {
      const r = charters(pools, start, home);
      if (r.pearls > best.pearls) best = { ...r, start, home };
      if (r.end <= wall - 20) farm = Math.max(farm, r.pearls);
      if (r.fights <= DIVE.ledgeEvery + 1.5) hop = Math.max(hop, r.pearls);
      if (home === 0) never = Math.max(never, r.pearls);
    }
  }
  console.log(
    `rod +${gear.rod} line +${gear.line} ${p.name} (wall at marker ${wall}): ${Math.round(best.pearls)} pearls/h, ${Math.round(best.coins / 1000)}k coins/h ` +
    `(markers ${best.start}-${Math.round(best.end)}, home under ${best.home} m, ${best.mins.toFixed(0)} min, ${pct(best.sunk)} out of line) · ` +
    `farming ${pct(farm / best.pearls)}, hops ${pct(hop / best.pearls)}, never heading home ${pct(never / best.pearls)}`,
  );
}
