// Charter economy sim (the charters as places to earn; Oscar, 2026-11-12), on the shared rules in src/game/dive.ts and
// the numbers in src/data/dive.ts. The reference hands (`HANDS.careful`, `HANDS.skilled`) fight rolled sea fish in
// every zone at every rod step, with the style that costs them the least line per landed fish. Then:
//  1. a table per hand, zone and rod step: fight seconds, share landed, fish a spool, minutes a spool, and pearls and
//     net coins (sales less the spool) a spool and an hour;
//  2. a journey for each hand from a fresh Deep Sea Rod: it always fishes whichever open zone moves it fastest toward
//     its next purchases (the next boat part in pearls, the next rod step on sale in coins) and buys as soon as it can,
//     printing when each zone opens and each rod step is bought.
// The Abyss is fished at its first marker. A spool is counted as a charter of its own (the flight out, `CHARTER`).
// Run: npx tsx scripts/seaeconomy.ts [fights a cell, default 120]; START=<coins> brings coins from the lake;
// HANDS=careful,skilled picks the hands.
import { BOAT_PARTS, LINE, ROD, ZONES } from '../src/data/dive';
import { lineCost, pearlsFor, RATING_NAMES, rodStepCost, rollSeaFish, seaGaps, seaRating, spoolPrice, stepZone, type SeaRod } from '../src/game/dive';
import { CLEAN_BONUS, TAG_BONUS } from '../src/game/economy';
import { mulberry } from '../src/game/env';
import { rollFishGaps, rollSize, sellValue } from '../src/game/progression';
import { botFight, HANDS, type Hand } from '../src/game/reelbot';

const N = Number(process.argv[2] ?? 120);
/** Seconds to a bite, around each fish (strike, landing card) and around each spool (the flight out and home). */
const BITE = 4.5, AROUND = 4, CHARTER = 45;
const START = Number(process.env.START ?? 0);
const hands = (process.env.HANDS ?? 'careful,skilled').split(',') as Hand[];

/** One hand in one zone at one rod step, per fight: seconds, landed share, metres of line, pearls and coins. */
interface Cell { t: number; land: number; m: number; pearls: number; coins: number }

const cells = new Map<string, Cell>();
function cell(hand: Hand, zone: number, steps: number): Cell {
  const key = `${hand}:${zone}:${steps}`;
  const hit = cells.get(key);
  if (hit) return hit;
  const rod: SeaRod = { steps, levels: 0 };
  const marker = 1;
  let best: Cell | null = null, bestCost = Infinity;
  for (const style of HANDS[hand].styles) {
    // The same fish for every style.
    const rng = mulberry(zone * 7919 + steps * 104_729 + 5);
    let t = 0, landed = 0, metres = 0, pearls = 0, coins = 0;
    for (let i = 0; i < N; i++) {
      const bite = rollSeaFish(zone, rng);
      const size = rollSize(bite.fish, rng);
      const m = rollFishGaps(seaGaps(zone, marker, rod), rng);
      const seed = Math.floor(rng() * 2 ** 31);
      const f = botFight(m.d, HANDS[hand].react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
      const ok = f.status === 'caught';
      t += f.t;
      metres += lineCost(zone, marker, rod) + (ok ? 0 : LINE.lost);
      if (!ok) continue;
      landed++;
      pearls += pearlsFor(zone, marker, { tag: m.tag, legend: !!bite.fish.legend });
      coins += Math.round(sellValue(bite.fish, size) * (f.frays === 0 ? 1 + CLEAN_BONUS : 1) * (m.tag ? 1 + TAG_BONUS : 1));
    }
    const cost = landed ? metres / landed : Infinity;
    if (!best || cost < bestCost) {
      best = { t: t / N, land: landed / N, m: metres / N, pearls: pearls / N, coins: coins / N };
      bestCost = cost;
    }
  }
  cells.set(key, best!);
  return best!;
}

/** One spool's worth in a zone at a rod step: its hours, fish landed, pearls and net coins (sales less the spool). */
function spool(hand: Hand, zone: number, steps: number) {
  const c = cell(hand, zone, steps);
  const fights = LINE.spool / c.m;
  const hours = (CHARTER + fights * (BITE + AROUND + c.t)) / 3600;
  return { c, hours, fish: fights * c.land, pearls: fights * c.pearls, coins: fights * c.coins - spoolPrice(zone) };
}

const pct = (x: number) => `${Math.round(100 * x)}%`.padStart(4);
const k = (x: number) => `${(x / 1000).toFixed(0)}k`.padStart(6);
const SHORT = ['Shelf', 'Drop-off', 'Kelp', 'Twilight', 'Abyss'];

for (const hand of hands) {
  console.log(`\n${hand} (${HANDS[hand].react} s), ${N} fish a cell; per spool (${LINE.spool} m) and per hour`);
  console.log('zone      step  rating    fight  land  fish  mins  pearls  coins | pearls/h  coins/h');
  for (let z = 0; z < ZONES.length; z++)
    for (let st = 0; st <= ROD.steps; st++) {
      const s = spool(hand, z, st);
      const rating = RATING_NAMES[seaRating(z, 1, { steps: st, levels: 0 })];
      console.log(
        `${SHORT[z].padEnd(9)} ${String(st).padStart(4)}  ${rating.padEnd(8)} ${s.c.t.toFixed(0).padStart(5)}s  ${pct(s.c.land)}  ${s.fish.toFixed(0).padStart(4)}  ${(s.hours * 60).toFixed(0).padStart(4)}  ${s.pearls.toFixed(0).padStart(6)} ${k(s.coins)} | ${(s.pearls / s.hours).toFixed(0).padStart(8)} ${k(s.coins / s.hours)}`,
      );
    }
}

console.log('');
for (const hand of hands) {
  let parts = 0, steps = 0, coins = START, pearls = 0, hours = 0;
  const opened: number[] = [];
  const log: string[] = [];
  let guard = 0;
  while ((parts < BOAT_PARTS.length || steps < ROD.steps) && guard++ < 20_000) {
    // What it still needs: the next boat part's pearls, and the next rod step's coins once that step is on sale.
    const part = BOAT_PARTS[parts];
    const needP = part ? Math.max(1, part.pearls - pearls) : 0;
    const onSale = steps < ROD.steps && stepZone(steps + 1) <= parts;
    const needC = onSale ? Math.max(1, rodStepCost(steps + 1) - coins) : 0;
    let pick = spool(hand, 0, steps), best = -Infinity;
    for (let z = 0; z <= parts; z++) {
      const r = spool(hand, z, steps);
      const score = (needP ? r.pearls / r.hours / needP : 0) + (needC ? r.coins / r.hours / needC : 0) + (!needP && !needC ? r.coins / r.hours : 0);
      if (score > best) (best = score), (pick = r);
    }
    hours += pick.hours;
    pearls += pick.pearls;
    coins += pick.coins;
    for (let again = true; again;) {
      again = false;
      if (steps < ROD.steps && stepZone(steps + 1) <= parts && coins >= rodStepCost(steps + 1)) {
        coins -= rodStepCost(++steps);
        log.push(`rod step ${steps} @${hours.toFixed(1)}h`);
        again = true;
      }
      const p = BOAT_PARTS[parts];
      if (p && pearls >= p.pearls) {
        pearls -= p.pearls;
        parts++;
        opened.push(hours);
        log.push(`${ZONES[parts].name} opens @${hours.toFixed(1)}h`);
        again = true;
      }
    }
  }
  console.log(`${hand}${START ? ` (+${START / 1000}k coins brought)` : ''}: zones open at ${opened.map((h) => h.toFixed(1)).join(' / ')} h; all ${ROD.steps} rod steps by ${hours.toFixed(1)} h; left over ${Math.round(coins / 1000)}k coins, ${Math.round(pearls)} pearls`);
  console.log(`   ${log.join(' · ')}`);
}
