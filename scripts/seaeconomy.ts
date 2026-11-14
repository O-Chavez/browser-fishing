// Charter economy sim (the charters as places to earn; Oscar, 2026-11-12; the hold, 2026-11-14), on the shared rules in
// src/game/dive.ts and the numbers in src/data/dive.ts. A charter is a full hold of landed fish (`holdFish`, grown by
// Reed's hold levels) for a fee (`charterFee`). The reference hands (`HANDS.careful`, `HANDS.skilled`) fight rolled sea
// fish in every zone at every rod step, with the style that takes the least time per landed fish. Then:
//  1. a table per hand, zone and rod step: the rating, fight seconds, landed share, seconds per landed fish, minutes for
//     a charter at the hold the player would have in that zone (`holdFish(zone)`), the fee, a charter's pearls and net
//     coins, and pearls and coins an hour; then each new zone at Fair (rod step 2z-1) against the zone before on the
//     same rod (coins an hour and the % difference);
//  2. a journey for each hand from a fresh Deep Sea Rod, plain and lured side by side. It fishes whichever open zone it
//     can afford the fee in that moves it fastest toward its next purchases (the next boat part in pearls, the next rod
//     step or hold level on sale in coins; the rod first when both are affordable). Each charter is fished to the end,
//     then it buys on the way home. It prints when each zone opens and each step and hold level is bought, the longest
//     wait between purchases before the Abyss, and the most coins held with nothing on sale.
// A charter is 45 s of flight plus, for each fight needed to fill the hold, the bite, the strike and landing card, and
// the fight. The Abyss is fished at its first marker. Without Shiny Lures a landed fish counts x1.2 on coins and pearls
// (the natural shiny odds); a lured cast makes every fish shiny (x5 on both) and costs 5 chips of lake time.
// Run: npx tsx scripts/seaeconomy.ts [fights a cell, default 160]; START=<coins> brings coins from the lake;
// HANDS=careful,skilled picks the hands. LURED=1 adds the lured journey (lures from Kelp Deep on; FROM=<zone> changes
// it) at CHIPS=570 lake chips an hour. LOG=1 prints every purchase. To try other prices without editing the data:
// PARTS=25,150,3000,25000 (the four boat parts, in pearls), STEPS=50,110,200,500,1400,3200,4200,8400 (the rod's eight
// steps, in thousands of coins) and HOLDC=25,300,4000,8000 (the four hold levels, in thousands of coins).
import { BOAT_PARTS, HOLD, PEARLS, ROD, ZONES } from '../src/data/dive';
import { averageSale, charterFee, holdFish, nextHoldBuy, pearlsFor, RATING_NAMES, rodStepCost, rollSeaFish, seaGaps, seaRating, stepZone, type SeaRod } from '../src/game/dive';
import { CLEAN_BONUS, TAG_BONUS } from '../src/game/economy';
import { mulberry } from '../src/game/env';
import { rollFishGaps, rollSize, sellValue, SHINY_CHANCE, SHINY_VALUE } from '../src/game/progression';
import { botFight, HANDS, type Hand } from '../src/game/reelbot';

const N = Number(process.argv[2] ?? 160);
/** Seconds to a bite, around each fish (strike, landing card) and around each charter (the flight out and home). */
const BITE = 4.5, AROUND = 4, CHARTER = 45;
const START = Number(process.env.START ?? 0);
const hands = (process.env.HANDS ?? 'careful,skilled').split(',') as Hand[];
const LURED = !!process.env.LURED;
const FROM = Number(process.env.FROM ?? 2);
const CHIPS = Number(process.env.CHIPS ?? 570);
/** Lake seconds a lured cast costs (5 chips). */
const LURE_S = (5 / CHIPS) * 3600;
/** What the natural shiny odds add to a fish's coins and pearls, on average (the lure makes it x5 on both). */
const NATURAL = 1.2;
const LURE_X = 5;
if (process.env.PARTS) process.env.PARTS.split(',').forEach((p, i) => (BOAT_PARTS[i].pearls = Number(p)));
if (process.env.STEPS) ROD.stepCoins = process.env.STEPS.split(',').map((c) => Number(c) * 1000);
if (process.env.HOLDC) HOLD.coins = process.env.HOLDC.split(',').map((c) => Number(c) * 1000);
void PEARLS, void SHINY_CHANCE, void SHINY_VALUE, void averageSale;

/** One hand in one zone at one rod step, per fight: seconds, landed share, and pearls and coins per landed fish. */
interface Cell { t: number; land: number; pearls: number; coins: number }

const cells = new Map<string, Cell>();
function cell(hand: Hand, zone: number, steps: number): Cell {
  const key = `${hand}:${zone}:${steps}`;
  const hit = cells.get(key);
  if (hit) return hit;
  const rod: SeaRod = { steps, levels: 0 };
  let best: Cell | null = null, bestPer = Infinity;
  for (const style of HANDS[hand].styles) {
    // The same fish for every style.
    const rng = mulberry(zone * 7919 + steps * 104_729 + 5);
    let t = 0, landed = 0, pearls = 0, coins = 0;
    for (let i = 0; i < N; i++) {
      const bite = rollSeaFish(zone, rng);
      const size = rollSize(bite.fish, rng);
      const m = rollFishGaps(seaGaps(zone, 1, rod), rng);
      const seed = Math.floor(rng() * 2 ** 31);
      const f = botFight(m.d, HANDS[hand].react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
      t += f.t;
      if (f.status !== 'caught') continue;
      landed++;
      pearls += pearlsFor(zone, 1, { tag: m.tag, legend: !!bite.fish.legend });
      coins += sellValue(bite.fish, size) * (f.frays === 0 ? 1 + CLEAN_BONUS : 1) * (m.tag ? 1 + TAG_BONUS : 1);
    }
    // The best style takes the least time per landed fish.
    const per = landed ? (t + N * (BITE + AROUND)) / landed : Infinity;
    if (!best || per < bestPer) {
      best = { t: t / N, land: landed / N, pearls: pearls / Math.max(1, landed), coins: coins / Math.max(1, landed) };
      bestPer = per;
    }
  }
  cells.set(key, best!);
  return best!;
}

/** One full hold in a zone at a rod step: sea hours, hours with the lake time of lures, fights, pearls, gross and net coins. */
function charter(hand: Hand, zone: number, steps: number, hold: number, lured = false) {
  const c = cell(hand, zone, steps);
  if (c.land < 0.3) return null;
  const fights = hold / c.land;
  const x = lured ? LURE_X : NATURAL;
  const sea = (CHARTER + fights * (BITE + AROUND + c.t)) / 3600;
  const hours = sea + (lured ? (fights * LURE_S) / 3600 : 0);
  const gross = hold * c.coins * x;
  return { c, sea, hours, fights, pearls: hold * c.pearls * x, gross, coins: gross - charterFee(zone) };
}

const k = (x: number) => (Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(2)}M` : `${Math.round(x / 1000)}k`).padStart(6);
const SHORT = ['Shelf', 'Drop-off', 'Kelp', 'Twilight', 'Abyss'];

for (const hand of hands) {
  console.log(`\n${hand} (${HANDS[hand].react} s), ${N} fish a cell; a charter fills the zone's hold (${[0, 1, 2, 3, 4].map((z) => holdFish(z)).join('/')} fish), natural shinies x${NATURAL}`);
  console.log('zone      step  rating    fight  land  s/fish  mins  hold   fee  pearls  coins | pearls/h  coins/h');
  for (let z = 0; z < ZONES.length; z++)
    for (let st = 0; st <= ROD.steps; st++) {
      const s = charter(hand, z, st, holdFish(z));
      const rating = RATING_NAMES[seaRating(z, 1, { steps: st, levels: 0 })];
      const c = cell(hand, z, st);
      if (!s) { console.log(`${SHORT[z].padEnd(9)} ${String(st).padStart(4)}  ${rating.padEnd(8)} ${c.t.toFixed(0).padStart(5)}s  ${Math.round(100 * c.land)}%`.padEnd(40) + '  (too few landed)'); continue; }
      const per = (BITE + AROUND + c.t) / c.land;
      console.log(
        `${SHORT[z].padEnd(9)} ${String(st).padStart(4)}  ${rating.padEnd(8)} ${c.t.toFixed(0).padStart(5)}s  ${`${Math.round(100 * c.land)}%`.padStart(4)}  ${per.toFixed(0).padStart(5)}s  ${(s.sea * 60).toFixed(0).padStart(4)}  ${String(holdFish(z)).padStart(4)} ${k(charterFee(z))}  ${s.pearls.toFixed(0).padStart(6)} ${k(s.coins)} | ${(s.pearls / s.sea).toFixed(0).padStart(8)} ${k(s.coins / s.sea)}`,
      );
    }
  console.log(`\n${hand}: each new zone at Fair (rod step 2z-1) against the zone before on the same rod, coins an hour`);
  for (let z = 1; z < ZONES.length; z++) {
    const st = 2 * z - 1;
    const a = charter(hand, z, st, holdFish(z)), b = charter(hand, z - 1, st, holdFish(z));
    if (!a || !b) continue;
    const ra = a.coins / a.sea, rb = b.coins / b.sea;
    console.log(`${SHORT[z].padEnd(9)} step ${st}: ${k(ra)} vs ${SHORT[z - 1]} ${k(rb)}  ${ra >= rb ? '+' : ''}${Math.round(100 * (ra / rb - 1))}%`);
  }
}

const hm = (h: number | undefined) => (h === undefined ? 'never' : h < 1 ? `${Math.round(h * 60)}min` : `${h.toFixed(1)}h`);

/** A journey from a fresh rod: buys rod steps and hold levels (rod first), opens zones with pearls, lures from `lureFrom` on. */
function journey(hand: Hand, lureFrom: number) {
  let parts = 0, steps = 0, hold = 0, coins = START, pearls = 0, hours = 0, lakeH = 0, charters = 0, idle = 0, lures = 0;
  const log: string[] = [];
  const spent = { rod: 0, hold: 0, fee: 0 };
  const at: Record<string, number> = {};
  const buys: number[] = [];
  const onSale = () => {
    const o: { kind: 'rod' | 'hold'; cost: number }[] = [];
    if (steps < ROD.steps && stepZone(steps + 1) <= parts) o.push({ kind: 'rod', cost: rodStepCost(steps + 1) });
    const h = nextHoldBuy(hold);
    if (h && h.zone <= parts) o.push({ kind: 'hold', cost: h.coins });
    return o;
  };
  const buy = () => {
    for (let again = true; again;) {
      again = false;
      for (const o of onSale()) {
        if (coins < o.cost) continue;
        coins -= o.cost;
        if (o.kind === 'rod') { steps++; spent.rod += o.cost; log.push(`step ${steps} ${hm(hours)}`); at[`step${steps}`] = hours; }
        else { hold++; spent.hold += o.cost; log.push(`hold ${holdFish(hold)} ${hm(hours)}`); at[`hold${hold}`] = hours; }
        buys.push(hours);
        again = true;
        break;
      }
      if (parts < BOAT_PARTS.length && pearls >= BOAT_PARTS[parts].pearls) {
        pearls -= BOAT_PARTS[parts].pearls;
        parts++;
        at[`zone${parts}`] = hours;
        buys.push(hours);
        log.push(`** ${SHORT[parts]} ${hm(hours)} (${k(coins).trim()} held)`);
        again = true;
      }
    }
  };
  let guard = 0;
  while ((parts < BOAT_PARTS.length || steps < ROD.steps || nextHoldBuy(hold)) && guard++ < 50_000) {
    const needP = parts < BOAT_PARTS.length ? Math.max(1, BOAT_PARTS[parts].pearls - pearls) : 0;
    const o = onSale().sort((a, b) => a.cost - b.cost)[0];
    const needC = o ? Math.max(1, o.cost - coins) : 0;
    if (!o) idle = Math.max(idle, coins);
    let zone = 0, pick = charter(hand, 0, steps, holdFish(hold))!, best = -Infinity, lured = false;
    for (let z = 0; z <= parts; z++)
      for (const lu of z >= lureFrom ? [false, true] : [false]) {
        const r = charter(hand, z, steps, holdFish(hold), lu);
        if (!r || coins < charterFee(z)) continue;
        const score = (needP ? r.pearls / r.hours / needP : 0) + (needC ? r.coins / r.hours / needC : 0) + (!needP && !needC ? r.coins / r.hours : 0);
        if (score > best) (best = score), (pick = r), (zone = z), (lured = lu);
      }
    // A charter is fished to the end (the hold is short); purchases happen on the way home.
    coins -= charterFee(zone);
    spent.fee += charterFee(zone);
    charters++;
    hours += pick.hours;
    if (lured) { lakeH += pick.hours - pick.sea; lures += pick.fights; }
    pearls += pick.pearls;
    coins += pick.gross;
    buy();
  }
  let gap = 0, gapAt = 0;
  buys.sort((a, b) => a - b);
  for (let i = 1; i < buys.length; i++) if (buys[i] - buys[i - 1] > gap && buys[i] <= (at.zone4 ?? Infinity) + 0.01) (gap = buys[i] - buys[i - 1]), (gapAt = buys[i]);
  return { at, log, hours, lakeH, lures, charters, spent, coins, pearls, idle, gap, gapAt };
}

console.log('');
for (const hand of hands) {
  const show = (name: string, j: ReturnType<typeof journey>) => {
    console.log(`${hand} ${name}${START ? ` (+${START / 1000}k coins brought)` : ''}: zones open at ${[1, 2, 3, 4].map((z) => hm(j.at[`zone${z}`])).join(' / ')}; all done ${hm(j.hours)}${j.lakeH ? ` (lake ${hm(j.lakeH)}, ${Math.round(j.lures)} lures)` : ''}; ${j.charters} charters; spent rod ${k(j.spent.rod).trim()} hold ${k(j.spent.hold).trim()} fees ${k(j.spent.fee).trim()}; most coins held with nothing on sale ${k(j.idle).trim()}; longest wait before the Abyss ${Math.round(j.gap * 60)} min (to ${hm(j.gapAt)})`);
    console.log(`   ${j.log.join(' · ')}`);
  };
  show('plain', journey(hand, 99));
  if (LURED) show(`lured from ${SHORT[FROM]} @${CHIPS}/h`, journey(hand, FROM));
}
