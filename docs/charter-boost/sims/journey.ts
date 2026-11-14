// Scratch: plain against lured charters, on scripts/seaeconomy.ts's model (spool of 300 m, careful hand). Kept from the charter boost workshop (2026-11-13) as a scratch file: not type-checked, tested or maintained. Run with npx tsx from the repository root.
import { BOAT_PARTS, LINE, ROD, ZONES } from '../../../src/data/dive';
import { lineCost, pearlsFor, RATING_NAMES, rodStepCost, rollSeaFish, seaGaps, seaRating, spoolPrice, stepZone, type SeaRod } from '../../../src/game/dive';
import { CLEAN_BONUS, TAG_BONUS } from '../../../src/game/economy';
import { mulberry } from '../../../src/game/env';
import { rollFishGaps, rollSize, sellValue } from '../../../src/game/progression';
import { P } from '../../../src/game/reel';
import { botFight, HANDS, type Hand } from '../../../src/game/reelbot';

const env = (k: string, d: string) => process.env[k] ?? d;
const N = 120, BITE = 4.5, AROUND = 4, CHARTER = 45;
const hand = env('HAND', 'careful') as Hand;
const GLOVES = env('GLOVES', '0') === '1';
const tune = GLOVES ? { reel: P.reel * 1.35 } : undefined;
const SH = 0.05; // plain shiny chance
const PLAINX = 1 + SH * 4; // a plain fish's coins and (decided) pearls on average, x1.2
interface Cell { t: number; land: number; m: number; pearls: number; coins: number }
const cells = new Map<string, Cell>();
function cell(zone: number, steps: number): Cell {
  const key = `${zone}:${steps}`; const hit = cells.get(key); if (hit) return hit;
  const rod: SeaRod = { steps, levels: 0 };
  let best: Cell | null = null, bestCost = Infinity;
  for (const style of HANDS[hand].styles) {
    const rng = mulberry(zone * 7919 + steps * 104_729 + 5);
    let t = 0, landed = 0, metres = 0, pearls = 0, coins = 0;
    for (let i = 0; i < N; i++) {
      const bite = rollSeaFish(zone, rng); const size = rollSize(bite.fish, rng);
      const m = rollFishGaps(seaGaps(zone, 1, rod), rng);
      const seed = Math.floor(rng() * 2 ** 31);
      const f = botFight(m.d, HANDS[hand].react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995), tune);
      const ok = f.status === 'caught'; t += f.t; metres += lineCost(zone, 1, rod) + (ok ? 0 : LINE.lost);
      if (!ok) continue; landed++;
      pearls += pearlsFor(zone, 1, { tag: m.tag, legend: !!bite.fish.legend });
      coins += sellValue(bite.fish, size) * (f.frays === 0 ? 1 + CLEAN_BONUS : 1) * (m.tag ? 1 + TAG_BONUS : 1); // not shiny
    }
    const cost = landed ? metres / landed : Infinity;
    if (!best || cost < bestCost) { best = { t: t / N, land: landed / N, m: metres / N, pearls: pearls / N, coins: coins / N }; bestCost = cost; }
  }
  cells.set(key, best!); return best!;
}
/** One spool. `lake` = seconds of lake time a lured cast costs; lured multiplies coins and pearls by 5 (every hooked fish is shiny). */
function spool(zone: number, steps: number, lured: boolean, lake: number) {
  const c = cell(zone, steps);
  const fights = LINE.spool / c.m;
  const x = lured ? 5 : PLAINX;
  const sea = (CHARTER + fights * (BITE + AROUND + c.t)) / 3600;
  const hours = sea + (lured ? (fights * lake) / 3600 : 0);
  return { c, fights, sea, hours, pearls: fights * c.pearls * x, gross: fights * c.coins * x, coins: fights * c.coins * x - spoolPrice(zone) };
}
const k = (x: number) => (Math.abs(x) >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : (x / 1000).toFixed(0) + 'k').padStart(6);
const SHORT = ['Shelf', 'Drop-off', 'Kelp', 'Twilight', 'Abyss'];
const hm = (h: number) => (h < 1 ? `${Math.round(h * 60)}min` : `${h.toFixed(1)}h`);

// Lake seconds a lured cast costs = price in chips / (lake chips a second). CHIPS = lake chips an hour, low,mid,high.
const CHIPS = env('CHIPS', '220,570,925').split(',').map(Number);
const PRICE = env('PRICE', '5,5,5,5,5').split(',').map(Number); // chips a lured cast by zone
const lakeS = (zone: number, chipsH: number) => (PRICE[zone] / chipsH) * 3600;

if (!process.env.QUIET) {
  console.log(`${hand}${GLOVES ? ' +gloves' : ''}; plain counts the 5% shiny (x${PLAINX}) on coins and pearls; lured = every cast, ${PRICE.join('/')} chips a cast; lake at ${CHIPS.join(' / ')} chips an hour`);
  console.log('zone      step rating   s/fish fish mins | PLAIN coins/h pearls/h | LURED spool: chips  coins  pearls | pace x (coins/h net, pearls/h) at lake low / mid / high');
  for (let z = 0; z < 5; z++) for (const st of z === 0 ? [0] : [2 * z - 2, 2 * z - 1, 2 * z]) {
    const p = spool(z, st, false, 0);
    if (p.c.land < 0.3) continue;
    const l0 = spool(z, st, true, 0);
    const paces = CHIPS.map((ch) => { const l = spool(z, st, true, lakeS(z, ch)); return `${(l.coins / l.hours / (p.coins / p.hours)).toFixed(2)},${(l.pearls / l.hours / (p.pearls / p.hours)).toFixed(2)} (${(l.hours * 60).toFixed(0)}m)`; });
    console.log(`${SHORT[z].padEnd(9)} ${String(st).padStart(4)} ${RATING_NAMES[seaRating(z, 1, { steps: st, levels: 0 })].padEnd(8)} ${(BITE + AROUND + p.c.t).toFixed(1).padStart(5)} ${(p.fights * p.c.land).toFixed(0).padStart(4)} ${(p.sea * 60).toFixed(0).padStart(4)} | ${k(p.coins / p.hours)} ${(p.pearls / p.hours).toFixed(0).padStart(8)} | ${(p.fights * PRICE[z]).toFixed(0).padStart(6)} ${k(l0.coins)} ${l0.pearls.toFixed(0).padStart(6)} | ${paces.join('  ')}`);
  }
}

/** Journey as in seaeconomy.ts. `from` = first zone the player lures in (9 = never); `chipsH` = their lake rate. */
function journey(parts0: number[], steps0: number[], from: number, chipsH: number) {
  let parts = 0, steps = 0, coins = 0, pearls = 0, hours = 0, lakeH = 0;
  const opened: number[] = []; const stepAt: number[] = [];
  const buy = (): boolean => {
    let bought = false;
    for (let again = true; again;) {
      again = false;
      if (steps < ROD.steps && stepZone(steps + 1) <= parts && coins >= steps0[steps]) { coins -= steps0[steps++]; stepAt.push(hours); again = bought = true; }
      if (parts < 4 && pearls >= parts0[parts]) { pearls -= parts0[parts]; parts++; opened.push(hours); again = bought = true; }
    }
    return bought;
  };
  let guard = 0;
  while ((parts < 4 || steps < ROD.steps) && guard++ < 50_000) {
    const needP = parts < 4 ? Math.max(1, parts0[parts] - pearls) : 0;
    const onSale = steps < ROD.steps && stepZone(steps + 1) <= parts;
    const needC = onSale ? Math.max(1, steps0[steps] - coins) : 0;
    let zone = 0, pick = spool(0, steps, false, 0), best = -Infinity, lured = false;
    for (let z = 0; z <= parts; z++) {
      if (coins < spoolPrice(z)) continue;
      for (const lu of z >= from ? [false, true] : [false]) {
        const r = spool(z, steps, lu, lakeS(z, chipsH));
        if (r.c.land < 0.3) continue;
        const score = (needP ? r.pearls / r.hours / needP : 0) + (needC ? r.coins / r.hours / needC : 0) + (!needP && !needC ? r.coins / r.hours : 0);
        if (score > best) (best = score), (pick = r), (zone = z), (lured = lu);
      }
    }
    coins -= spoolPrice(zone); hours += CHARTER / 3600;
    const LOOKS = 12;
    for (let i = 0; i < LOOKS; i++) {
      hours += (pick.hours - CHARTER / 3600) / LOOKS; if (lured) lakeH += (pick.hours - pick.sea) / LOOKS;
      pearls += pick.pearls / LOOKS; coins += pick.gross / LOOKS;
      if (buy()) break;
    }
  }
  return { opened, stepAt, hours, lakeH, coins, pearls };
}
const STEPS = env('STEPS', '40,90,150,350,600,1300,1200,2400').split(',').map((x) => Number(x) * 1000);
const sets = env('PARTSETS', '30,150,1500,10000').split(';').map((s) => s.split(',').map(Number));
console.log('\nJOURNEYS (total play time, lake time included)');
for (const ps of sets) {
  console.log(`parts ${ps.join(' / ')} pearls; steps ${STEPS.map((x) => x / 1000).join('/')}k`);
  const plain = journey(ps, STEPS, 9, 1);
  console.log(`  plain                         zones ${plain.opened.map(hm).join(' / ')}; rod done ${hm(plain.hours)}`);
  for (const [i, ch] of CHIPS.entries()) {
    const b = journey(ps, STEPS, Number(env('FROM', '2')), ch);
    console.log(`  lured from ${SHORT[Number(env('FROM', '2'))]}, lake ${['low ', 'mid ', 'high'][i]} ${String(ch).padStart(4)}/h  zones ${b.opened.map(hm).join(' / ')}; rod done ${hm(b.hours)}; lake time ${hm(b.lakeH)}  (Abyss x${(plain.opened[3] / b.opened[3]).toFixed(2)} faster)`);
  }
}
