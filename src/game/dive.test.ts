import { describe, expect, it } from 'vitest';
import { byId, FISH } from '../data/content';
import { ABYSS, BOAT_PARTS, LINE, MARKER, PEARLS, ROD, SPOOL_COINS, ZONES } from '../data/dive';
import {
  abyssLevelCost, afterFight, averageSale, behaviourOdds, canStart, lineCost, markerGrowth, newSpool, nextRodBuy, payAt, pearlMult, pearlsFor, powInt, ratingOf,
  rodBuyName, rodStepCost, rollSeaFish, seaFightWords, seaFishTier, seaGap, seaGaps, seaRating, seaRodTier, spoolPrice, startDive, stepZone, typicalSale,
  zoneOpen, type SeaRod,
} from './dive';
import { rollSeaCast } from './economy';
import { mulberry } from './env';
import { FISH_SPREAD, TAG_BONUS, TAG_TIERS, rollSize, sellValue } from './progression';
import { GOOD_MAX, Reel, type Gaps } from './reel';
import { STYLES, botFight } from './reelbot';
import { newSave } from './state';

const rod = (steps = 0, levels = 0): SeaRod => ({ steps, levels });
const none = rod();

describe('sea fish and the Deep Sea Rod, in tiers', () => {
  it('a sea fish is tier 5 on the Shelf and 0.8 more each zone out, the same on strength and weight', () => {
    expect([0, 1, 2, 3, 4].map((z) => seaFishTier(z))).toEqual([5, 5.8, 6.6, 7.4, 8.2].map((t) => expect.closeTo(t, 9)));
    // Markers only count in the Abyss.
    expect(seaFishTier(2, 7)).toBeCloseTo(6.6, 9);
    expect(seaGaps(3, 0, none)).toEqual({ strength: 2.4, weight: 2.4 });
  });

  it('each Abyss marker past the first is 0.1 of a tier harder', () => {
    expect(seaFishTier(ABYSS, 1)).toBeCloseTo(8.2, 9);
    expect(seaFishTier(ABYSS, 2)).toBeCloseTo(8.3, 9);
    expect(seaFishTier(ABYSS, 11)).toBeCloseTo(9.2, 9);
    // Marker 0 or below counts as the first.
    expect(seaFishTier(ABYSS, 0)).toBeCloseTo(8.2, 9);
  });

  it('the rod is tier 5, 0.4 more a step and 0.1 more an Abyss level, on both gaps', () => {
    expect(seaRodTier(none)).toBe(5);
    expect(seaRodTier(rod(2))).toBeCloseTo(5.8, 9);
    expect(seaRodTier(rod(8))).toBeCloseTo(8.2, 9);
    expect(seaRodTier(rod(8, 3))).toBeCloseTo(8.5, 9);
    // A zone's two steps bring the rod up to it.
    for (let z = 1; z < ZONES.length; z++) expect(seaGap(z, 1, rod(2 * z))).toBe(0);
    expect(seaGap(ABYSS, 4, rod(8, 3))).toBe(0);
  });

  it('computes powers by multiplication', () => {
    expect(powInt(1.12, 0)).toBe(1);
    expect(powInt(1.12, 40) / Math.pow(1.12, 40)).toBeCloseTo(1, 12);
  });
});

describe('the rating', () => {
  it('rates a gap Easy to 0.05, Fair to 0.45, Tough to 0.85, then Too much', () => {
    expect([-1, 0, 0.05, 0.06, 0.4, 0.45, 0.46, 0.8, 0.85, 0.86, 2].map(ratingOf)).toEqual(
      ['easy', 'easy', 'easy', 'fair', 'fair', 'fair', 'tough', 'tough', 'tough', 'over', 'over'],
    );
  });

  it('rates each zone for the rod: a zone in hand, a step short, two short, and further', () => {
    expect([0, 1, 2, 3, 4].map((z) => seaRating(z, 1, none))).toEqual(['easy', 'tough', 'over', 'over', 'over']);
    expect(seaRating(1, 0, rod(1))).toBe('fair');
    expect(seaRating(1, 0, rod(2))).toBe('easy');
    expect([0, 1, 2, 3, 4].map((z) => seaRating(z, 1, rod(6)))).toEqual(['easy', 'easy', 'easy', 'easy', 'tough']);
  });

  it('rates Abyss markers by the marker and the Abyss levels', () => {
    const at = (m: number, levels = 0) => seaRating(ABYSS, m, rod(8, levels));
    expect([1, 2, 5, 6, 9, 10].map((m) => at(m))).toEqual(['easy', 'fair', 'fair', 'tough', 'tough', 'over']);
    // Each Abyss level takes a marker's difficulty off.
    expect(at(6, 1)).toBe('fair');
    expect(at(10, 5)).toBe('fair');
  });

  it("words a hooked fish by its own gaps, the bigger one, red only when it's too much", () => {
    expect(seaFightWords({ strength: 0, weight: 0.03 })).toEqual({ words: 'Easy for your rod', too: false });
    expect(seaFightWords({ strength: 0.3, weight: 0.1 })).toEqual({ words: 'Fair for your rod', too: false });
    expect(seaFightWords({ strength: 0.4, weight: 0.7 })).toEqual({ words: 'Tough for your rod', too: false });
    expect(seaFightWords({ strength: 1.2, weight: 0.4 })).toEqual({ words: 'Too much for your rod', too: true });
  });
});

describe('line', () => {
  it('a hooked fish uses 5 m when the rod handles it, 9 m at Fair and 13 m at Tough, from the typical gap', () => {
    expect(lineCost(0, 0, none)).toBe(5);
    expect(lineCost(0, 0, rod(8))).toBe(5);
    expect(lineCost(1, 0, rod(1))).toBe(9);
    expect(lineCost(1, 0, none)).toBe(13);
    expect(lineCost(2, 0, rod(2))).toBe(13);
    expect(lineCost(ABYSS, 2, rod(8))).toBe(6);
  });

  it('every charter starts on a 300 m spool, and each fish takes its line: a lost one 25 m more', () => {
    const d = startDive(1, 0, rod(1));
    expect(d).toMatchObject({ zone: 1, marker: 0, line: LINE.spool, state: 'fishing' });
    expect(LINE.spool).toBe(300);
    expect(afterFight(d, { pearls: 3, coins: 2000 })).toEqual({ cost: 9, marker: false });
    expect(d.line).toBe(291);
    expect(afterFight(d, null)).toEqual({ cost: 9 + LINE.lost, marker: false });
    expect(LINE.lost).toBe(25);
    expect(d.line).toBe(257);
    expect(d.tally).toMatchObject({ landed: 1, lost: 1, pearls: 3, coins: 2000 });
  });

  it('out of line, the charter waits for another spool, which fills it again in the same zone and marker', () => {
    const d = startDive(ABYSS, 3, rod(8));
    d.line = 4;
    afterFight(d, { pearls: 50, coins: 1000 });
    expect(d).toMatchObject({ line: 0, state: 'out', marker: 3 });
    // Nothing more is taken while it waits.
    expect(afterFight(d, null)).toEqual({ cost: 0, marker: false });
    expect(d.tally.lost).toBe(0);
    expect(newSpool(d)).toBe(true);
    expect(d).toMatchObject({ line: LINE.spool, state: 'fishing', zone: ABYSS, marker: 3 });
    expect(d.tally).toMatchObject({ spools: 2, spoolCoins: 2 * SPOOL_COINS[ABYSS] });
    expect(newSpool(d)).toBe(false);
  });

  it('a spool costs the zone\'s price, free on the Shelf, and the cast-off spool counts in the tally', () => {
    expect([0, 1, 2, 3, 4].map(spoolPrice)).toEqual([0, 14_000, 26_000, 46_000, 83_000]);
    expect(startDive(2, 0, none).tally).toEqual({ landed: 0, lost: 0, pearls: 0, coins: 0, spools: 1, spoolCoins: 26_000 });
  });
});

describe('pay', () => {
  it('a fish pays pearls by zone: 1, 3, 8, 20 and 50', () => {
    expect([0, 1, 2, 3, 4].map((z) => pearlsFor(z, 1))).toEqual([1, 3, 8, 20, 50]);
    expect(PEARLS.zone).toEqual([1, 3, 8, 20, 50]);
  });

  it('a Feisty or Brutish fish pays double and a legend five times, multiplying', () => {
    expect(pearlMult({})).toBe(1);
    expect(pearlMult({ tag: 'feisty' })).toBe(2);
    expect(pearlMult({ tag: 'brutish' })).toBe(2);
    expect(pearlMult({ legend: true })).toBe(5);
    expect(pearlMult({ tag: 'brutish', legend: true })).toBe(10);
    expect(pearlsFor(2, 0, { tag: 'feisty' })).toBe(16);
    expect(pearlsFor(3, 0, { tag: 'feisty', legend: true })).toBe(200);
  });

  it('in the Abyss, pearls and coins grow 12% a marker past the first', () => {
    expect(markerGrowth(ABYSS, 1)).toBe(1);
    expect(markerGrowth(ABYSS, 2)).toBeCloseTo(1.12, 12);
    expect(markerGrowth(ABYSS, 4)).toBeCloseTo(1.12 ** 3, 12);
    expect(markerGrowth(2, 9)).toBe(1);
    expect(pearlsFor(ABYSS, 2)).toBe(56);
    expect(pearlsFor(ABYSS, 4)).toBe(70);
    expect(pearlsFor(ABYSS, 4, { tag: 'feisty', legend: true })).toBe(Math.round(500 * 1.12 ** 3));
    expect(MARKER.grow).toBe(1.12);
  });

  it("an everyday fish's average sale is about 1,100 / 2,000 / 3,600 / 6,400 / 11,500 coins by zone, and a legend about three times it", () => {
    const want = [1100, 2000, 3600, 6400, 11_500];
    const rng = mulberry(4);
    ZONES.forEach((z, i) => {
      expect(typicalSale(i) / want[i], z.id).toBeGreaterThan(0.97);
      expect(typicalSale(i) / want[i], z.id).toBeLessThan(1.03);
      // The worked-out average is what the size roll gives.
      const avg = (id: string, n = 4000) => {
        const f = byId(FISH, id);
        let s = 0;
        for (let k = 0; k < n; k++) s += sellValue(f, rollSize(f, rng));
        return s / n;
      };
      const everyday = z.fish.reduce((a, id) => a + avg(id), 0) / z.fish.length;
      expect(everyday / typicalSale(i), z.id).toBeCloseTo(1, 1);
      for (const id of z.legends) expect(avg(id) / everyday, id).toBeCloseTo(3, 0);
    });
    // Further zones pay more.
    for (let z = 1; z < ZONES.length; z++) expect(typicalSale(z)).toBeGreaterThan(1.5 * typicalSale(z - 1));
  });

  it("a landed fish's average sale counts in legends, shinies and Feisty or Brutish fish: about a third over a plain everyday one", () => {
    const rng = mulberry(9);
    const s = newSave();
    ZONES.forEach((z, i) => {
      expect(averageSale(i) / typicalSale(i), z.id).toBeGreaterThan(1.3);
      expect(averageSale(i) / typicalSale(i), z.id).toBeLessThan(1.4);
      // What casts in the zone really sell for, tag bonus included, without the clean-catch bonus.
      let sum = 0;
      const n = 40_000;
      for (let k = 0; k < n; k++) {
        const roll = rollSeaCast(s, i, i === ABYSS ? 1 : 0, rod(8), rng);
        sum += sellValue(byId(FISH, roll.fishId!), roll.size, roll.shiny) * (roll.tag ? 1 + TAG_BONUS : 1);
      }
      expect(sum / n / averageSale(i), z.id).toBeGreaterThan(0.96);
      expect(sum / n / averageSale(i), z.id).toBeLessThan(1.04);
    });
  });

  it("tells the screens what a fish pays here: a plain fish's pearls and the average coins to three figures, with the Abyss marker's growth", () => {
    expect(payAt(0, 0)).toEqual({ pearls: 1, coins: Math.round(averageSale(0) / 10) * 10 });
    expect(payAt(0, 0).coins).toBe(1470);
    expect(payAt(ABYSS, 1).coins).toBe(Math.round(averageSale(ABYSS) / 100) * 100);
    expect(payAt(ABYSS, 3)).toEqual({ pearls: 63, coins: Math.round((averageSale(ABYSS) * 1.12 ** 2) / 100) * 100 });
  });
});

describe('the Abyss', () => {
  it('reaches the next marker every 3 fish landed; lost fish and other zones don\'t count', () => {
    const d = startDive(ABYSS, 1, rod(8));
    const pay = { pearls: 0, coins: 0 };
    expect(afterFight(d, pay).marker).toBe(false);
    afterFight(d, null);
    expect(afterFight(d, pay).marker).toBe(false);
    expect(d).toMatchObject({ marker: 1, toNext: 2 });
    expect(afterFight(d, pay).marker).toBe(true);
    expect(d).toMatchObject({ marker: 2, toNext: 0 });
    for (let i = 0; i < 3 * 5; i++) afterFight(d, pay);
    expect(d.marker).toBe(7);
    // The line a fish costs follows the marker it's at.
    expect(lineCost(ABYSS, 7, rod(8))).toBe(11);
    const kelp = startDive(2, 5, rod(4));
    for (let i = 0; i < 6; i++) afterFight(kelp, pay);
    expect(kelp).toMatchObject({ marker: 0, toNext: 0 });
  });

  it('starts in an open zone, and in the Abyss at marker 1 or any marker up to the furthest reached', () => {
    const p = { boatParts: 2, abyssRecord: 0 };
    expect([0, 1, 2, 3, 4].map((z) => canStart(p, z, 0))).toEqual([true, true, true, false, false]);
    expect(canStart(p, 1)).toBe(true);
    // No markers outside the Abyss, and nothing odd.
    expect(canStart(p, 1, 2)).toBe(false);
    expect(canStart(p, '1', 0)).toBe(false);
    expect(canStart(p, 1.5, 0)).toBe(false);
    expect(canStart(p, -1, 0)).toBe(false);
    const all = { boatParts: 4, abyssRecord: 0 };
    expect(canStart(all, ABYSS, 1)).toBe(true);
    expect(canStart(all, ABYSS, 0)).toBe(false);
    expect(canStart(all, ABYSS, 2)).toBe(false);
    const far = { boatParts: 4, abyssRecord: 12 };
    expect([1, 7, 12, 13].map((m) => canStart(far, ABYSS, m))).toEqual([true, true, true, false]);
    expect(canStart(far, ABYSS, 2.5)).toBe(false);
    expect(zoneOpen(far, 4)).toBe(true);
    expect(zoneOpen(p, 3)).toBe(false);
    expect(startDive(ABYSS, 7, rod(8))).toMatchObject({ marker: 7, toNext: 0 });
    expect(startDive(1, 7, rod(1)).marker).toBe(0);
  });
});

describe('rod steps, Abyss levels and boat parts', () => {
  it('prices the eight steps, and Abyss levels at 1,000,000 coins growing 12% a level, to the nearest 1,000', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(rodStepCost)).toEqual([40_000, 90_000, 150_000, 350_000, 600_000, 1_300_000, 1_200_000, 2_400_000]);
    expect([1, 2, 3, 10].map(abyssLevelCost)).toEqual([1_000_000, 1_120_000, 1_254_000, Math.round(1_000_000 * 1.12 ** 9 / 1000) * 1000]);
    for (let n = 1; n < 60; n++) expect(abyssLevelCost(n) % 1000).toBe(0);
    expect(ROD.steps).toBe(8);
  });

  it('puts a zone\'s two steps on sale with the zone: steps 1-2 the Drop-off ... 7-8 the Abyss', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(stepZone)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('names the next purchase: a step until all eight, then Abyss levels', () => {
    expect(nextRodBuy(rod(0))).toEqual({ kind: 'step', n: 1, coins: 40_000, zone: 1 });
    expect(nextRodBuy(rod(7))).toEqual({ kind: 'step', n: 8, coins: 2_400_000, zone: 4 });
    expect(nextRodBuy(rod(8))).toEqual({ kind: 'level', n: 1, coins: 1_000_000, zone: ABYSS });
    expect(nextRodBuy(rod(8, 2))).toMatchObject({ kind: 'level', n: 3, coins: 1_254_000 });
    expect(rodBuyName(nextRodBuy(rod(4)))).toBe('Deep Sea Rod step 5');
    expect(rodBuyName(nextRodBuy(rod(8, 2)))).toBe('Deep Sea Rod Abyss level 3');
  });

  it('has four boat parts for pearls, one opening each zone past the Shelf', () => {
    expect(BOAT_PARTS.map((p) => p.pearls)).toEqual([30, 150, 1500, 10_000]);
    expect(BOAT_PARTS.map((p) => p.name)).toEqual(['Storm sail', 'Kelp cutter', 'Deep lamps', 'Iron keel']);
    expect(BOAT_PARTS).toHaveLength(ZONES.length - 1);
  });
});

describe('sea zones and bites', () => {
  it('a legend bites about 1 time in 20, the two everyday fish evenly', () => {
    const rng = mulberry(3);
    const n = 6000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const b = rollSeaFish(0, rng);
      count[b.fish.id] = (count[b.fish.id] ?? 0) + 1;
      expect(b.behaviour).toBeNull();
    }
    expect(count.grouper / n).toBeGreaterThan(0.04);
    expect(count.grouper / n).toBeLessThan(0.06);
    expect(Math.abs(count.pewtercod - count.snapper) / n).toBeLessThan(0.03);
  });

  it('a zone with several legends splits the 1 in 20 between them, and its everyday fish evenly', () => {
    const rng = mulberry(5);
    const n = 12000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const id = rollSeaFish(ABYSS, rng).fish.id;
      count[id] = (count[id] ?? 0) + 1;
    }
    const abyss = ZONES[ABYSS];
    const legends = abyss.legends.reduce((a, id) => a + (count[id] ?? 0), 0) / n;
    expect(legends).toBeGreaterThan(0.04);
    expect(legends).toBeLessThan(0.06);
    for (const id of abyss.legends) expect((count[id] ?? 0) / n, id).toBeGreaterThan(0.01);
    for (const id of abyss.fish) expect(Math.abs((count[id] ?? 0) / n - 0.95 / abyss.fish.length), id).toBeLessThan(0.02);
  });

  it('each zone past the Shelf has its behaviour, and the Abyss mixes all three evenly', () => {
    expect(behaviourOdds(0)).toEqual([[null, 1]]);
    expect(behaviourOdds(1)).toEqual([['runner', 1]]);
    expect(behaviourOdds(2)).toEqual([['thrasher', 1]]);
    expect(behaviourOdds(3)).toEqual([['sounder', 1]]);
    expect(behaviourOdds(ABYSS).map(([b]) => b).sort()).toEqual(['runner', 'sounder', 'thrasher']);
    const rng = mulberry(9);
    const seen = new Set<string | null>();
    for (let i = 0; i < 300; i++) seen.add(rollSeaFish(ABYSS, rng).behaviour);
    expect([...seen].sort()).toEqual(['runner', 'sounder', 'thrasher']);
  });

  it("a sea cast fights at the zone's gaps over the charter's rod, with its tag and spread and no behaviour for now", () => {
    const s = newSave();
    s.seaRod = true;
    for (const [zone, marker, r] of [[0, 0, rod(0)], [2, 0, rod(3)], [ABYSS, 5, rod(8, 1)]] as const) {
      for (let k = 0; k < 20; k++) {
        const roll = rollSeaCast(s, zone, marker, r, mulberry(100 + k + zone));
        const fish = byId(FISH, roll.fishId!);
        expect(fish.sea).toBe(true);
        expect(ZONES[zone].fish.concat(ZONES[zone].legends)).toContain(fish.id);
        const g = seaGaps(zone, marker, r);
        expect(Math.abs(roll.d!.strength - g.strength - (roll.tag === 'feisty' ? TAG_TIERS.feisty : 0))).toBeLessThanOrEqual(FISH_SPREAD + 0.005);
        expect(Math.abs(roll.d!.weight - g.weight - (roll.tag === 'brutish' ? TAG_TIERS.brutish : 0))).toBeLessThanOrEqual(FISH_SPREAD + 0.005);
        expect(roll.b).toBeUndefined();
      }
    }
    for (const z of ZONES) {
      expect(z.fish.length).toBeGreaterThanOrEqual(2);
      expect(z.legends.length).toBeGreaterThanOrEqual(1);
      for (const id of z.legends) expect(byId(FISH, id).legend, id).toBe(true);
      for (const id of z.fish) expect(byId(FISH, id).legend, id).toBeFalsy();
    }
    const listed = ZONES.flatMap((z) => [...z.fish, ...z.legends]);
    expect(new Set(listed).size).toBe(listed.length);
    expect(FISH.filter((f) => f.sea).map((f) => f.id).sort()).toEqual([...listed].sort());
  });

  it('a bot can fish a spool on the Shelf with the real reel', () => {
    const rng = mulberry(11), brng = mulberry(12);
    const d = startDive(0, 0, none);
    while (d.state === 'fishing') {
      rollSeaFish(d.zone, rng);
      const f = botFight(seaGaps(d.zone, d.marker, d.rod), 0.25, STYLES[0], rng, brng);
      afterFight(d, f.status === 'caught' ? { pearls: 1, coins: 1000 } : null);
    }
    expect(d.state).toBe('out');
    // Shelf fish are Easy on a fresh rod: about 60 to a spool at 5 m each.
    expect(d.tally.landed).toBeGreaterThan(50);
    expect(d.tally.landed + d.tally.lost).toBeLessThanOrEqual(LINE.spool / LINE.base);
  });
});

describe('fight left', () => {
  /** A fish heavy enough to be watched through the tired stage to exhausted: two rungs over the rod. */
  const TIRING_W = 2;
  /** A fight held just under the red, like the room tests' player: the surges' peak pulls and when it was exhausted. */
  function watch(d: Gaps, seed: number) {
    const r = new Reel(d, mulberry(seed));
    const peaks: number[] = [];
    // The calm before each surge and the surge's length, at full fight and late in the tired stage.
    const gaps = { full: [] as number[], tired: [] as number[] };
    const surges = { full: [] as number[], tired: [] as number[] };
    let peak = 0, tiredAt = -1, exhaustedAt = -1, surgesAfter = 0, lastEnd = -1, start = -1, late = false;
    for (let k = 0; k < 60 * 300 && r.status === 'reeling'; k++) {
      const was = r.surgeCount, surging = r.surging;
      r.update(1 / 60, r.surging ? r.tension < GOOD_MAX - 0.02 : r.tension < 0.6);
      if (r.surgeCount > was && exhaustedAt >= 0) surgesAfter++;
      const sample = !r.tired || r.fightLeft < 0.2;
      if (r.surgeCount > was) {
        late = r.tired;
        start = sample ? r.elapsed : -1;
        if (lastEnd >= 0 && sample) (late ? gaps.tired : gaps.full).push(r.elapsed - lastEnd);
      }
      if (surging && !r.surging) {
        if (start >= 0) (late ? surges.tired : surges.full).push(r.elapsed - start);
        lastEnd = r.elapsed;
      }
      if (r.surging) peak = Math.max(peak, r.need);
      else if (peak > 0) peaks.push(peak), (peak = 0);
      if (r.tired && tiredAt < 0) tiredAt = r.elapsed;
      if (r.exhausted && exhaustedAt < 0) exhaustedAt = r.elapsed;
    }
    return { r, peaks, gaps, surges, tiredAt, exhaustedAt, surgesAfter };
  }

  it('an exhausted fish surges no more and comes in (most are reeled in while still tired)', () => {
    let exhausted = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = watch({ weight: TIRING_W, strength: 0 }, seed);
      expect(w.r.status).toBe('caught');
      if (w.exhaustedAt < 0) continue;
      exhausted++;
      expect(w.surgesAfter).toBe(0);
      expect(w.r.warning).toBe(false);
    }
    expect(exhausted).toBeGreaterThan(2);
  });

  it('a tired fish still surges, shorter and further apart the more tired it is', () => {
    const gaps = { full: [] as number[], tired: [] as number[] };
    const surges = { full: [] as number[], tired: [] as number[] };
    for (let seed = 1; seed <= 30; seed++) {
      const w = watch({ weight: TIRING_W, strength: 0 }, seed);
      gaps.full.push(...w.gaps.full);
      gaps.tired.push(...w.gaps.tired);
      surges.full.push(...w.surges.full);
      surges.tired.push(...w.surges.tired);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(gaps.tired.length).toBeGreaterThan(5);
    expect(mean(gaps.tired)).toBeGreaterThan(1.4 * mean(gaps.full));
    expect(mean(surges.tired)).toBeLessThan(0.8 * mean(surges.full));
  });

  it('a tired fish fades gradually: no surge pulls far below the one before it', () => {
    let steps = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { peaks } = watch({ weight: TIRING_W, strength: 0.5 }, seed);
      for (let i = 1; i < peaks.length; i++) {
        // At most about a sixth of the gauge a surge (the marker slides; it doesn't jump).
        expect(peaks[i - 1] - peaks[i], `seed ${seed}, surge ${i}`).toBeLessThan(0.16);
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(60);
  });

  it('a tired fish pulls weaker, but a surge that reaches the red never tires out of it', () => {
    const fade = (strength: number) => {
      let first = 0, lastPulls = 0, inRed = true;
      for (let seed = 1; seed <= 40; seed++) {
        const { peaks } = watch({ weight: TIRING_W, strength }, seed);
        if (peaks.length < 4) continue;
        first += peaks[0] + peaks[1];
        lastPulls += peaks[peaks.length - 1] + peaks[peaks.length - 2];
        // A fish that pulls into the red at full strength stays there.
        if (peaks[0] > GOOD_MAX) inRed &&= peaks.every((p) => p > GOOD_MAX);
      }
      return { ratio: lastPulls / first, inRed };
    };
    // A fish the line holds fades toward exhausted; one over the line keeps every surge in the red.
    expect(fade(0).ratio).toBeLessThan(0.75);
    expect(fade(2).inRed).toBe(true);
  });

  it('every surge pulls the same at full fight, so the marker reads as its strength', () => {
    // At full fight, before it tires.
    for (let seed = 1; seed <= 10; seed++) {
      const peaks = watch({ weight: TIRING_W, strength: 0.5 }, seed).peaks.slice(0, 3);
      for (const p of peaks) expect(p).toBeCloseTo(peaks[0], 9);
    }
  });

  it('heavier fish have more fight in them, so the rod still decides how long a fight runs', () => {
    const tiresAfter = (weight: number) => watch({ weight, strength: 0 }, 1).tiredAt;
    // 20 s of surging one rung over the rod, 30 s two over.
    expect(tiresAfter(2) / tiresAfter(1)).toBeGreaterThan(1.3);
  });
});
