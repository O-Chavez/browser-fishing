// Scratch: what a top-gear player earns at the lake (the pond map), lured and unlured. Kept from the charter boost workshop (2026-11-13) as a scratch file: not type-checked, tested or maintained. Run with npx tsx from the repository root.
const R = '../../../src';
import { BAITS, FISH, LINES, RODS, byId } from '../../../src/data/content';
import { CLEAN_BONUS } from '../../../src/game/economy';
import { mulberry } from '../../../src/game/env';
import { eligibleFish, fightGaps, pickFish, rollFishGaps, rollSize, sellValue, TAG_BONUS, SHINY_CHANCE, SHINY_CHANCE_NIGHT } from '../../../src/game/progression';
import { P } from '../../../src/game/reel';
import { botFight, HANDS } from '../../../src/game/reelbot';
import { nightness, NIGHT_BITE } from '../../../src/game/daynight';
import { GLOVES_CONTROL, LANTERN_NIGHT_LUCK } from '../../../src/data/casino';

const N = Number(process.argv[2] ?? 4000);
const rod = byId(RODS, 'aurora'), line = byId(LINES, 'moonsilk'), bait = byId(BAITS, 'pearl');
const tune = { reel: P.reel * GLOVES_CONTROL };
let nightShare = 0; for (let i = 0; i < 6000; i++) if (nightness((i + 0.5) / 6000) >= NIGHT_BITE) nightShare++; nightShare /= 6000;

interface Cell { plain: number; t: number; land: number; wait: number; top: number; byTier: number[]; clean: number }
function cell(hand: 'careful' | 'skilled', night: boolean, perfect: boolean): Cell {
  let best: Cell | null = null;
  for (const style of HANDS[hand].styles) {
    const rng = mulberry(12345 + (night ? 7 : 0) + (perfect ? 13 : 0));
    let v = 0, t = 0, landed = 0, wait = 0, top = 0, clean = 0; const byTier = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const fish = pickFish(eligibleFish('pond', rod, bait, night), rod, bait, rng, perfect, 'prime', night, LANTERN_NIGHT_LUCK)!;
      const size = rollSize(fish, rng);
      wait += (3.5 + rng() * 6) / bait.luck;
      const seed = Math.floor(rng() * 2 ** 31);
      const m = rollFishGaps(fightGaps(fish, rod, line), rng);
      const f = botFight(m.d, HANDS[hand].react, style, mulberry(seed), mulberry(seed ^ 0x5bd1e995), tune);
      t += f.t;
      if (f.status !== 'caught') continue;
      landed++; byTier[fish.tier - 1]++; if (fish.tier === 5) top++;
      if (f.frays === 0) clean++;
      v += sellValue(fish, size) * (f.frays === 0 ? 1 + CLEAN_BONUS : 1) * (m.tag ? 1 + TAG_BONUS : 1);
    }
    const c = { plain: v / N, t: t / N, land: landed / N, wait: wait / N, top: top / N, byTier: byTier.map((x) => x / N), clean: clean / Math.max(1, landed) };
    if (!best || c.land > best.land || (c.land === best.land && c.t < best.t)) best = c;
  }
  return best!;
}
const k = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : (x / 1000).toFixed(x < 1e5 ? 1 : 0) + 'k');
console.log(`night share of the day: ${(nightShare * 100).toFixed(0)}%   (${N} casts a cell; top gear, gloves, lantern)`);
const out: Record<string, Cell> = {};
for (const hand of ['careful', 'skilled'] as const) for (const night of [false, true]) for (const perfect of [false, true]) {
  const c = cell(hand, night, perfect); out[`${hand}:${night}:${perfect}`] = c;
  console.log(`${hand.padEnd(8)} ${night ? 'night' : 'day  '} ${perfect ? 'perfect' : 'plain  '} | plain value a cast ${Math.round(c.plain).toString().padStart(5)} (no charm) | fight ${c.t.toFixed(1)}s land ${(c.land * 100).toFixed(0)}% clean ${(c.clean * 100).toFixed(0)}% bite ${c.wait.toFixed(2)}s | tiers ${c.byTier.map((x) => (x * 100).toFixed(0) + '%').join(' ')}`);
}
// per-species top fish value
for (const id of ['ghostcarp', 'sunfire', 'aurorapike', 'constellation']) { const f = byId(FISH, id); console.log(id, 'min', sellValue(f, f.minSize), 'mid', sellValue(f, (f.minSize + f.maxSize) / 2), 'max', sellValue(f, f.maxSize)); }

// Hourly model
const CHARM = 1.15;
function hourly(hand: 'careful' | 'skilled', perfectRate: number, o: { cast: number; around: number; slots: number; sellTrip: number; casinoTrip: number; banquet: boolean; lured: boolean; label: string }) {
  // blend day/night by time share and perfect by rate
  let v = 0, t = 0, wait = 0, shinyAvg = 0;
  for (const night of [false, true]) for (const perfect of [false, true]) {
    const w = (night ? nightShare : 1 - nightShare) * (perfect ? perfectRate : 1 - perfectRate);
    const c = out[`${hand}:${night}:${perfect}`];
    const sc = o.lured ? 1 : Math.min(1, (night ? SHINY_CHANCE_NIGHT : SHINY_CHANCE) * (o.banquet ? 2 : 1));
    v += w * c.plain * (1 + sc * 4); t += w * c.t; wait += w * c.wait; shinyAvg += w * sc;
  }
  const mult = CHARM * (o.banquet ? 1.3 : 1);
  const value = v * mult;                       // coins of fish value a cast (all land)
  const perFish = o.cast + wait + o.around + t; // seconds
  // chips mode: every fish to the Prize Counter
  const tripChips = o.slots * perFish + o.casinoTrip;
  const castsH = (3600 / tripChips) * o.slots;
  const gross = castsH * value / 1000;
  const lureCost = o.lured ? castsH * 5 : 0;
  const baitCoins = castsH * bait.price;
  // coins mode: sell at the stall; a lured player must also turn in 5,000 coins of fish a cast (one fish in N)
  const fishPerLureFish = o.lured ? 5000 / value : 0; // share of fish that go to the casino
  const tripCoins = o.slots * perFish + o.sellTrip * (1 - fishPerLureFish) + o.casinoTrip * fishPerLureFish;
  const castsHc = (3600 / tripCoins) * o.slots;
  const coinsH = castsHc * (value - (o.lured ? 5000 : 0) - bait.price);
  return { label: o.label, value, perFish, castsH, gross, netChips: gross - lureCost, baitCoins, coinsH, castsHc };
}
console.log('\nHOURLY (blend day/night by clock share)');
console.log('case                                   value/cast s/fish casts/h | chips/h gross  net-of-lures  bait coins/h | coins/h (sell, net of lures+bait)');
for (const hand of ['careful', 'skilled'] as const)
  for (const [label, pr, cast, around, slots, sell, cas] of [
    ['low  (30% perfect, 3 slots, slow trips)', 0.3, 4, 5, 3, 30, 90],
    ['mid  (60% perfect, 5 slots)            ', 0.6, 3, 4, 5, 22, 65],
    ['high (90% perfect, 5 slots, fast trips)', 0.9, 2.5, 3.5, 5, 15, 45],
  ] as const)
    for (const [lured, banquet] of [[true, false], [true, true], [false, false], [false, true]] as const) {
      const h = hourly(hand, pr, { cast, around, slots, sellTrip: sell, casinoTrip: cas, banquet, lured, label });
      console.log(`${hand.padEnd(8)}${label} ${lured ? 'LURED  ' : 'unlured'}${banquet ? '+banquet' : '        '} ${Math.round(h.value).toString().padStart(6)} ${h.perFish.toFixed(1).padStart(5)} ${h.castsH.toFixed(0).padStart(5)} | ${h.gross.toFixed(0).padStart(6)} ${h.netChips.toFixed(0).padStart(8)} ${k(h.baitCoins).padStart(10)} | ${k(h.coinsH).padStart(8)}`);
    }
