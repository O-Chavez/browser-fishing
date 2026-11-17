// Abyss journey sim: from the Abyss opening to the three legends' sets and pets (the Abyss emote's gate), then to all
// four deep sea emotes. Where `scripts/seaeconomy.ts` fishes the Abyss at its first marker with no rod levels, this one
// lets a charter climb the markers (one every `MARKER.every` landed fish) and the player buy the rod's endless Abyss
// levels, which is where the Abyss's pay compounds. What Master of the Deep's price is set by (`EMOTE_PRICES`).
//
// The player starts as `seaeconomy.ts` leaves them at the Abyss (rod step 6, the 20-fish hold, about 6 million coins)
// and fills the hold on every charter, casting off at the marker that pays most an hour without a fish past Tough.
// Every landed fish is a legend one time in 20; the fourth landing of each of the three completes its set. Coins and
// pearls are averages, so only the legends' luck varies between journeys. Player types:
//  - no rod levels: the rod's steps, the hold, then every piece as it unlocks; never an Abyss level (the floor);
//  - sets first: the same, with whatever is left over going on Abyss levels;
//  - rod first: Abyss levels first; a piece or a hold level only once it costs no more than one charter pays.
// Each is run plain (natural shinies, x1.2) and lured (a Shiny Lure on every cast: x5 coins and pearls, and 5 chips of
// lake time a cast at CHIPS lake chips an hour, counted in the hours). After the gate every type buys Abyss levels
// while the emotes are more than two charters away, then saves.
// Run: npx tsx scripts/abyssjourney.ts [journeys, default 600]. MASTER=20,150;250,1000 tries Master of the Deep prices
// (millions of coins, thousands of pearls); COINX=1.25 for a player with dishes and charms (Oscar's coins run about a
// quarter over the sim); HAND=careful for the slower hand; CAP=8 is the hardest fish kept fishing for, in tenths of a
// tier (8: the top of Tough); START=<coins> and CHIPS=<lake chips an hour> as in seaeconomy.ts.
import { legendPieces } from '../src/data/cosmetics';
import { ABYSS, HOLD, MARKER, ROD } from '../src/data/dive';
import { EMOTE_PRICES } from '../src/data/emotes';
import { abyssLevelCost, charterFee, holdFish, markerGrowth, pearlsFor, rodStepCost, rollSeaFish, seaGap } from '../src/game/dive';
import { CLEAN_BONUS, TAG_BONUS } from '../src/game/economy';
import { mulberry } from '../src/game/env';
import { rollFishGaps, rollSize, sellValue } from '../src/game/progression';
import { botFight, HANDS } from '../src/game/reelbot';

const RUNS = Number(process.argv[2] ?? 600);
const HAND = (process.env.HAND ?? 'skilled') as 'careful' | 'skilled';
const COINX = Number(process.env.COINX ?? 1);
const CAP = Number(process.env.CAP ?? 8);
const START = Number(process.env.START ?? 6_000_000);
/** Seconds to a bite, around each fish and around each charter, as in seaeconomy.ts; and the lake seconds a lured cast costs. */
const BITE = 4.5, AROUND = 4, CHARTER = 45;
const LURE_S = (5 / Number(process.env.CHIPS ?? 570)) * 3600;
const LEGENDS = ['leviathan', 'dreamer', 'kraken'];
const PIECES = Object.fromEntries(LEGENDS.map((f) => [f, legendPieces(f).map((c) => ({ landing: c.landing!, price: c.price })).sort((a, b) => a.landing - b.landing)]));
const MASTERS = (process.env.MASTER ?? '20,150;100,500;250,1000;500,2000;1000,5000')
  .split(';').map((c) => c.split(',').map(Number)).map(([c, p]) => ({ coins: c * 1e6, pearls: p * 1e3 }));

/** A fight at a gap (in tenths of a tier): seconds, landed share, and a landed fish's coins and pearls at the first marker, plain. */
interface Cell { t: number; land: number; coins: number; pearls: number }
const GMIN = -12, GMAX = 16, N = 240;
const TABLE = new Map<number, Cell>();
for (let gi = GMIN; gi <= GMAX; gi++) {
  let best: Cell | null = null, bestPer = Infinity;
  for (const style of HANDS[HAND].styles) {
    const rng = mulberry((gi + 50) * 7919 + 11);
    let t = 0, landed = 0, coins = 0, pearls = 0;
    for (let i = 0; i < N; i++) {
      const bite = rollSeaFish(ABYSS, rng);
      const size = rollSize(bite.fish, rng);
      const m = rollFishGaps({ strength: gi / 10, weight: gi / 10 }, rng);
      const seed = Math.floor(rng() * 2 ** 31);
      const f = botFight(m.d, HANDS[HAND].react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995));
      t += f.t;
      if (f.status !== 'caught') continue;
      landed++;
      pearls += pearlsFor(ABYSS, 1, { tag: m.tag, legend: !!bite.fish.legend });
      coins += sellValue(bite.fish, size) * (f.frays === 0 ? 1 + CLEAN_BONUS : 1) * (m.tag ? 1 + TAG_BONUS : 1);
    }
    const per = landed ? (t + N * (BITE + AROUND)) / landed : Infinity;
    if (!best || per < bestPer) { best = { t: t / N, land: landed / N, coins: coins / Math.max(1, landed), pearls: pearls / Math.max(1, landed) }; bestPer = per; }
  }
  TABLE.set(gi, best!);
}

interface Plan { s: number; n: number; coins: number; pearls: number; hours: number }
/** The charter this rod fishes: the fullest hold with no fish past `CAP`, at the start marker (up to the record) that pays most an hour. */
function plan(steps: number, levels: number, hold: number, record: number, lured: boolean): Plan {
  const x = lured ? 5 : 1.2;
  let best: Plan = { s: 1, n: 1, coins: 0, pearls: 0, hours: 0.2 }, bestRate = -Infinity, bestN = 0;
  const centre = Math.max(1, 1 + levels - (ROD.steps - steps) * 4);
  for (let s = Math.max(1, centre - 14); s <= Math.min(record, centre + 14); s++) {
    let coins = -charterFee(ABYSS), pearls = 0, secs = CHARTER, fights = 0, n = 0;
    for (; n < hold; n++) {
      const m = s + Math.floor(n / MARKER.every);
      const gi = Math.round(seaGap(ABYSS, m, { steps, levels }) * 10);
      const c = TABLE.get(Math.max(GMIN, Math.min(GMAX, gi)))!;
      if (gi > CAP || c.land < 0.15) break;
      fights += 1 / c.land;
      secs += (BITE + AROUND + c.t) / c.land;
      coins += c.coins * markerGrowth(ABYSS, m) * x * COINX;
      pearls += c.pearls * markerGrowth(ABYSS, m) * x;
    }
    if (!n) continue;
    const hours = (secs + (lured ? fights * LURE_S : 0)) / 3600;
    if (n > bestN || (n === bestN && coins / hours > bestRate)) { bestRate = coins / hours; bestN = n; best = { s, n, coins, pearls, hours }; }
  }
  return best;
}

type Policy = 'nolevels' | 'sets' | 'rod';
const POLICY: Record<Policy, string> = { nolevels: 'no rod levels', sets: 'sets first', rod: 'rod first' };
interface Result { gateH: number; gateCharters: number; gateLevel: number; gatePay: number; gatePearls: number; after: number[]; afterH: number[]; level: number[]; pay: number[] }

function journey(policy: Policy, lured: boolean, rng: () => number): Result {
  let coins = START, pearls = 0, steps = 6, levels = 0, holdLv = 2, record = 1, hours = 0, charters = 0;
  const landed: Record<string, number> = { leviathan: 0, dreamer: 0, kraken: 0 };
  const owned: Record<string, number> = { leviathan: 0, dreamer: 0, kraken: 0 };
  const plans = new Map<string, Plan>();
  const planFor = () => {
    const key = `${steps}:${levels}:${holdLv}:${Math.min(record, levels + 21)}`;
    let p = plans.get(key);
    if (!p) plans.set(key, (p = plan(steps, levels, holdFish(holdLv), record, lured)));
    return p;
  };
  const holdCost = () => (holdLv < HOLD.fish.length - 1 ? HOLD.coins[holdLv] : 0);
  /** The cheapest piece unlocked and not bought yet. */
  const nextPiece = () => {
    let best: { f: string; price: number } | null = null;
    for (const f of LEGENDS) {
      const p = PIECES[f][owned[f]];
      if (p && landed[f] >= p.landing && (!best || p.price < best.price)) best = { f, price: p.price };
    }
    return best;
  };
  const fish = (p: Plan) => {
    charters++;
    hours += p.hours; coins += p.coins; pearls += p.pearls;
    record = Math.max(record, p.s + Math.floor(p.n / MARKER.every));
  };
  const buy = (income: number) => {
    for (;;) {
      if (steps < ROD.steps) { const c = rodStepCost(steps + 1); if (coins < c) return; coins -= c; steps++; continue; }
      const piece = nextPiece(), hold = holdCost();
      if (policy !== 'rod') {
        if (hold) { if (coins < hold) return; coins -= hold; holdLv++; continue; }
        if (piece) { if (coins < piece.price) return; coins -= piece.price; owned[piece.f]++; continue; }
      } else {
        if (piece && piece.price <= income) { if (coins < piece.price) return; coins -= piece.price; owned[piece.f]++; continue; }
        if (hold && hold <= income) { if (coins < hold) return; coins -= hold; holdLv++; continue; }
      }
      const lvl = abyssLevelCost(levels + 1);
      if (policy === 'nolevels' || coins < lvl) return;
      coins -= lvl; levels++;
    }
  };
  buy(0);
  while (!LEGENDS.every((f) => owned[f] >= 4) && charters < 5000) {
    const p = planFor();
    fish(p);
    for (let i = 0; i < p.n; i++) if (rng() < 0.05) landed[LEGENDS[Math.floor(rng() * 3)]]++;
    buy(p.coins);
  }
  const gate = planFor();
  const out: Result = { gateH: hours, gateCharters: charters, gateLevel: levels, gatePay: gate.coins, gatePearls: pearls, after: [], afterH: [], level: [], pay: [] };
  // From the gate, once for each Master of the Deep price: the other three emotes at their prices, then Master.
  const saved = { coins, pearls, levels, holdLv, record, hours, charters };
  for (const master of MASTERS) {
    ({ coins, pearls, levels, holdLv, record, hours, charters } = saved);
    const tC = EMOTE_PRICES.kelp.coins + EMOTE_PRICES.twilight.coins + EMOTE_PRICES.abyss.coins + master.coins;
    const tP = EMOTE_PRICES.kelp.pearls + EMOTE_PRICES.twilight.pearls + EMOTE_PRICES.abyss.pearls + master.pearls;
    while ((coins < tC || pearls < tP) && charters < saved.charters + 3000) {
      for (;;) {
        const p = planFor(), hold = holdCost(), lvl = abyssLevelCost(levels + 1);
        if (hold && hold <= p.coins && coins >= hold) { coins -= hold; holdLv++; continue; }
        const away = Math.max((tC - coins) / p.coins, (tP - pearls) / p.pearls);
        if (policy === 'nolevels' || away <= 2 || coins < lvl) break;
        coins -= lvl; levels++;
      }
      fish(planFor());
    }
    out.after.push(charters - saved.charters); out.afterH.push(hours - saved.hours); out.level.push(levels); out.pay.push(planFor().coins);
  }
  return out;
}

const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const k = (x: number) => (Math.abs(x) >= 1e9 ? `${(x / 1e9).toFixed(1)}B` : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : `${Math.round(x / 1000)}k`);
const band = (xs: number[], fmt: (x: number) => string) => `${fmt(q(xs, 0.5))} (${fmt(q(xs, 0.1))}-${fmt(q(xs, 0.9))})`;
const one = (x: number) => x.toFixed(1), whole = (x: number) => String(Math.round(x));

console.log(`${HAND} hand, ${RUNS} journeys a row, coins x${COINX}; median (10th-90th)`);
for (const lured of [false, true])
  for (const policy of ['nolevels', 'sets', 'rod'] as Policy[]) {
    const rng = mulberry(1234);
    const rs = Array.from({ length: RUNS }, () => journey(policy, lured, rng));
    console.log(`\n${lured ? 'lured' : 'plain'} · ${POLICY[policy]}`);
    console.log(`  the three sets and pets owned after ${band(rs.map((r) => r.gateH), one)} h in the Abyss${lured ? ' (lake time for lures counted)' : ''}, ${band(rs.map((r) => r.gateCharters), whole)} charters; rod Abyss level ${band(rs.map((r) => r.gateLevel), whole)}; a charter pays ${band(rs.map((r) => r.gatePay), k)} coins; ${band(rs.map((r) => r.gatePearls), k)} pearls held`);
    MASTERS.forEach((m, i) =>
      console.log(`  Master at ${k(m.coins).padStart(7)} coins, ${k(m.pearls).padStart(6)} pearls: all four emotes ${band(rs.map((r) => r.afterH[i]), one).padEnd(17)} h later (${band(rs.map((r) => r.after[i]), whole)} charters), at rod Abyss level ${band(rs.map((r) => r.level[i]), whole)}, a charter then paying ${band(rs.map((r) => r.pay[i]), k)}`),
    );
  }
