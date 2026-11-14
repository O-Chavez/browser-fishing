// Scratch model of the hold proposal, on the real fight bot and fish. Kept from the charter boost workshop (2026-11-13) as a scratch file: not type-checked, tested or maintained. Run with npx tsx from the repository root.
import { ZONES } from '../../../src/data/dive';
import { pearlsFor, rollSeaFish, seaGaps, seaRating, RATING_NAMES, averageSale } from '../../../src/game/dive';
import { CLEAN_BONUS, TAG_BONUS } from '../../../src/game/economy';
import { mulberry } from '../../../src/game/env';
import { rollFishGaps, rollSize, sellValue } from '../../../src/game/progression';
import { botFight, HANDS } from '../../../src/game/reelbot';

const env = (k: string, d: string) => process.env[k] ?? d;
const nums = (k: string, d: string) => env(k, d).split(',').filter((x) => x !== '').map(Number);
const N = 120, BITE = 4.5, AROUND = 4, CHARTER = 45;
const hand = env('HAND', 'careful');
const G = Number(env('G', '1.8'));               // coins a fish, times a zone
const SHINYP = 1 + 0.05 * (Number(env('SHINYP', '5')) - 1); // shiny pearls, on average
const SHINYC = 1.2;
const FEE = Number(env('FEE', '4'));              // the fee, in average fish of the zone (Shelf free)
const HOLD = nums('HOLD', '20,25,30,35,40,45,50,55,60'); // hold by level
const HOLDZ = nums('HOLDZ', '1,1,2,2,2,3,3,3');   // zone that puts each hold level on sale
const HOLDC = nums('HOLDC', '0,0,0,0,0,0,0,0');   // price, thousands
const GEAR = nums('GEAR', '1,1.25,1.5,1.75,2,2.25,2.5'); // pearl gear multiplier by level
const GEARZ = nums('GEARZ', '2,2,2,3,3,3');
const GEARC = nums('GEARC', '0,0,0,0,0,0');
const STEPS = nums('STEPS', '40,90,150,350,600,1300,1200,2400').map((x) => x * 1000);
const PARTS = nums('PARTS', '30,150,1500,10000');
const zmult = (z: number) => Math.pow(G / 1.8, z);
const fee = (z: number) => (z === 0 ? 0 : Math.round((FEE * averageSale(z) * zmult(z)) / 1000) * 1000);

interface Cell { t: number; land: number; pearls: number; coins: number }
const cells = new Map<string, Cell>();
function cell(zone: number, steps: number): Cell {
  const key = `${zone}:${steps}`;
  if (cells.has(key)) return cells.get(key)!;
  let best: Cell | null = null, bestT = Infinity;
  for (const style of HANDS[hand].styles) {
    const rng = mulberry(zone * 7919 + steps * 104_729 + 5);
    let t = 0, landed = 0, pearls = 0, coins = 0;
    for (let i = 0; i < N; i++) {
      const bite = rollSeaFish(zone, rng);
      const size = rollSize(bite.fish, rng);
      const m = rollFishGaps(seaGaps(zone, 1, { steps, levels: 0 }), rng);
      const seed = Math.floor(rng() * 2 ** 31);
      const f = botFight(m.d, HANDS[hand].react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
      t += f.t;
      if (f.status !== 'caught') continue;
      landed++;
      pearls += pearlsFor(zone, 1, { tag: m.tag, legend: !!bite.fish.legend });
      coins += sellValue(bite.fish, size) * SHINYC * (f.frays === 0 ? 1 + CLEAN_BONUS : 1) * (m.tag ? 1 + TAG_BONUS : 1);
    }
    const perLanded = landed ? (t + N * (BITE + AROUND)) / landed : Infinity;
    if (!best || perLanded < bestT) (best = { t: t / N, land: landed / N, pearls: pearls / Math.max(1, landed), coins: coins / Math.max(1, landed) }), (bestT = perLanded);
  }
  cells.set(key, best!);
  return best!;
}
/** One full hold: hours, pearls and net coins. */
function charter(zone: number, steps: number, hold: number, gear: number) {
  const c = cell(zone, steps);
  if (c.land < 0.3) return null;
  const fights = hold / c.land;
  const hours = (CHARTER + fights * (BITE + AROUND + c.t)) / 3600;
  return { c, hours, pearls: hold * c.pearls * SHINYP * gear, gross: hold * c.coins * zmult(zone), coins: hold * c.coins * zmult(zone) - fee(zone) };
}
const k = (x: number) => `${Math.round(x / 1000)}k`.padStart(6);
const SHORT = ['Shelf', 'Drop-off', 'Kelp', 'Twilight', 'Abyss'];
const hm = (h: number) => (h < 1 ? `${Math.round(h * 60)}min` : `${h.toFixed(2)}h`);

console.log(`${hand}; coins x${G} a zone; fee ${FEE} fish: ${[0, 1, 2, 3, 4].map((z) => k(fee(z)).trim()).join(' / ')}; coins a fish ${[0, 1, 2, 3, 4].map((z) => Math.round(averageSale(z) * zmult(z))).join(' / ')}`);
console.log('zone      step rating   fight land | hold mins   fee   take  pearls | coins/h pearls/h | zone before at this rod: coins/h pearls/h');
const hl = Number(env('SHOWHOLD', '30'));
for (let z = 0; z < 5; z++)
  for (const st of z === 0 ? [0] : [2 * z - 2, 2 * z - 1, 2 * z]) {
    const a = charter(z, st, hl, 1), b = z ? charter(z - 1, st, hl, 1) : null;
    if (!a) continue;
    console.log(`${SHORT[z].padEnd(9)} ${String(st).padStart(4)} ${RATING_NAMES[seaRating(z, 1, { steps: st, levels: 0 })].padEnd(8)} ${a.c.t.toFixed(0).padStart(4)}s ${Math.round(a.c.land * 100)}% | ${String(hl).padStart(4)} ${(a.hours * 60).toFixed(0).padStart(4)} ${k(fee(z))} ${k(a.gross)} ${a.pearls.toFixed(0).padStart(7)} | ${k(a.coins / a.hours)} ${(a.pearls / a.hours).toFixed(0).padStart(8)} |${b ? ` ${k(b.coins / b.hours)} ${(b.pearls / b.hours).toFixed(0).padStart(8)}   coins ${a.coins / a.hours > b.coins / b.hours ? '+' : ''}${Math.round(100 * (a.coins / a.hours / (b.coins / b.hours) - 1))}%` : ''}`);
  }

// Journey: fishes the open zone that moves it fastest to its next purchases; buys the cheapest thing on sale when it can.
let parts = 0, steps = 0, hold = 0, gear = 0, coins = 0, pearls = 0, hours = 0, last = 0, spent = { rod: 0, hold: 0, gear: 0, fee: 0 };
const log: string[] = [];
const note = (s: string) => { log.push(`${hm(hours).padStart(7)}  +${String(Math.round((hours - last) * 60)).padStart(3)} min  ${s}`); last = hours; };
function onSale() {
  const o: { kind: string; cost: number }[] = [];
  if (steps < 8 && (process.env.SHIFT ? Math.floor((steps + 1) / 2) : Math.ceil((steps + 1) / 2)) <= parts) o.push({ kind: 'rod', cost: STEPS[steps] });
  if (hold < HOLD.length - 1 && HOLDZ[hold] <= parts) o.push({ kind: 'hold', cost: HOLDC[hold] * 1000 });
  if (gear < GEAR.length - 1 && GEARZ[gear] <= parts) o.push({ kind: 'gear', cost: GEARC[gear] * 1000 });
  return o.sort((a, b) => (process.env.RODFIRST ? (b.kind === 'rod' ? 1 : 0) - (a.kind === 'rod' ? 1 : 0) : 0) || a.cost - b.cost);
}
function buy(): boolean {
  let bought = false;
  for (let again = true; again;) {
    again = false;
    const o = onSale()[0];
    if (o && coins >= o.cost) {
      coins -= o.cost;
      if (o.kind === 'rod') { steps++; spent.rod += o.cost; note(`rod step ${steps} (${k(o.cost).trim()})`); }
      if (o.kind === 'hold') { hold++; spent.hold += o.cost; note(`hold ${HOLD[hold]} fish (${k(o.cost).trim()})`); }
      if (o.kind === 'gear') { gear++; spent.gear += o.cost; note(`pearl gear ${gear}, x${GEAR[gear]} (${k(o.cost).trim()})`); }
      again = bought = true;
    }
    if (parts < 4 && pearls >= PARTS[parts]) { pearls -= PARTS[parts]; parts++; note(`** ${ZONES[parts].name} opens (${PARTS[parts - 1]} pearls)`); again = bought = true; }
  }
  return bought;
}
let guard = 0;
while ((parts < 4 || steps < 8) && guard++ < 50_000) {
  const needP = parts < 4 ? Math.max(1, PARTS[parts] - pearls) : 0;
  const o = onSale()[0];
  const needC = o ? Math.max(1, o.cost - coins) : 0;
  let zone = 0, pick = charter(0, steps, HOLD[hold], GEAR[gear])!, best = -Infinity;
  for (let z = 0; z <= parts; z++) {
    const r = charter(z, steps, HOLD[hold], GEAR[gear]);
    if (!r || coins < fee(z)) continue;
    const score = (needP ? r.pearls / r.hours / needP : 0) + (needC ? r.coins / r.hours / needC : 0) + (!needP && !needC ? r.coins / r.hours : 0);
    if (score > best) (best = score), (pick = r), (zone = z);
  }
  coins -= fee(zone); spent.fee += fee(zone);
  hours += CHARTER / 3600;
  const LOOKS = 12;
  for (let i = 0; i < LOOKS; i++) {
    hours += (pick.hours - CHARTER / 3600) / LOOKS;
    pearls += pick.pearls / LOOKS;
    coins += pick.gross / LOOKS;
    if (buy()) break;
  }
}
console.log(log.join('\n'));
console.log(`done ${hm(hours)}; spent rod ${k(spent.rod)} hold ${k(spent.hold)} gear ${k(spent.gear)} fees ${k(spent.fee)}; left ${k(coins)} coins, ${Math.round(pearls)} pearls`);
