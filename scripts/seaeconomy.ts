// Charter economy sim (REELING.md, "Sea economy" and "The sea mapping"): the reference hands (`HANDS`) fight rolled
// sea fish at every depth, then whole charters are played from those fights for each start marker and head-home rule, and the best pearls an hour is
// reported with the coins it earns. Assumes every marker short of the frontier is charted.
// Run: npx tsx scripts/seaeconomy.ts [rod level] [line level] [last depth, default 120] [fights a depth, default 80]
import { DIVE } from '../src/data/dive';
import { haulBonus, isLedge, lineWorn, pearlsAt, rollSeaFish, seaGaps } from '../src/game/dive';
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

/** Charters from `start`, heading home at the first marker with less than `home` metres of line left. */
function charters(pools: Fight[][], start: number, home: number) {
  const rng = mulberry(start * 31 + home);
  let secs = 0, pearls = 0, coins = 0, sunk = 0;
  for (let c = 0; c < CHARTERS; c++) {
    secs += CHARTER;
    let depth = start, line = DIVE.spool, haul = 0, ledges = 0;
    for (;;) {
      const p = pools[Math.min(depth, pools.length - 1)];
      const f = p[Math.floor(rng() * p.length)];
      secs += BITE + AROUND + f.t;
      line -= f.metres;
      coins += f.coins;
      if (f.landed) haul += pearlsAt(depth++);
      if (line <= 0) { sunk++; break; }
      if (f.landed && isLedge(depth)) {
        ledges++;
        if (line < home) { pearls += Math.round(haul * haulBonus(ledges)); break; }
      }
    }
  }
  const h = secs / 3600;
  return { pearls: pearls / h, coins: coins / h, sunk: sunk / CHARTERS };
}

const players = (process.env.HANDS ?? 'careful,skilled').split(',').map((h) => ({ name: h, ...HANDS[h as Hand] }));
for (const p of players) {
  const pools: Fight[][] = [];
  for (let depth = 0; depth <= last; depth++) pools.push(pool(depth, p.react, p.styles));
  let best = { pearls: 0, coins: 0, sunk: 0, start: 0, home: 0 };
  for (let start = 0; start <= last - 10; start += DIVE.ledgeEvery) {
    for (let home = 25; home <= DIVE.spool; home += 25) {
      const r = charters(pools, start, home);
      if (r.pearls > best.pearls) best = { ...r, start, home };
    }
  }
  console.log(`rod +${gear.rod} line +${gear.line} ${p.name}: ${Math.round(best.pearls)} pearls/h, ${Math.round(best.coins / 1000)}k coins/h (from marker ${best.start}, home under ${best.home} m, ${Math.round(100 * best.sunk)}% sunk)`);
}
