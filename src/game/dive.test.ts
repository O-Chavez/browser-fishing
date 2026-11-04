import { describe, expect, it } from 'vitest';
import { byId, FISH } from '../data/content';
import { DIVE, SEA_TIERS, ZONES, type Behaviour } from '../data/dive';
import {
  afterFight, behaviourOdds, canStartAt, diveOn, haulBonus, lineWorn, markerOver, pearlsAt, powInt, rollSeaFish, seaGaps, startDive, surface, zoneAt,
  type Chart, type SeaGear,
} from './dive';
import { rollSeaCast } from './economy';
import { mulberry } from './env';
import { FISH_SPREAD, overGear, TAG_TIERS } from './progression';
import { GOOD_MAX, Reel, type Gaps, type ReelWear } from './reel';
import { STYLES, botFight } from './reelbot';
import { newSave } from './state';

const clean: ReelWear = { lineOut: 0, frays: 0, snapped: false };
const wear = (lineOut: number, frays = 0, snapped = false): ReelWear => ({ lineOut, frays, snapped });
const none: SeaGear = { rod: 0, line: 0 };

/** Lands `n` fish with no wear. */
function land(dive: ReturnType<typeof startDive>, n: number) {
  for (let i = 0; i < n; i++) {
    afterFight(dive, 'pewtercod', true, clean);
    if (dive.state === 'ledge' && i < n - 1) diveOn(dive);
  }
  return dive;
}

describe('sea fight gaps', () => {
  it('a sea fish is a tier 5 fish at the harbour and a tier higher every 30 fish out, the same all through a marker', () => {
    expect(seaGaps(0, none)).toEqual({ strength: 0, weight: 0 });
    expect(seaGaps(4, none)).toEqual(seaGaps(0, none));
    expect(seaGaps(30, none)).toEqual({ strength: 1, weight: 1 });
    expect(seaGaps(34, none)).toEqual(seaGaps(30, none));
    expect(seaGaps(60, none)).toEqual({ strength: 2, weight: 2 });
    for (let depth = 5; depth < 300; depth += 5) expect(seaGaps(depth, none).strength).toBeGreaterThan(seaGaps(depth - 5, none).strength);
  });

  it('a Deep Sea Rod level takes weight off and a line level strength, one to one, each worth one marker', () => {
    const d = seaGaps(30, none), rod = seaGaps(30, { rod: 4, line: 0 }), line = seaGaps(30, { rod: 0, line: 4 });
    expect(rod).toEqual({ strength: d.strength, weight: seaGaps(10, none).weight });
    expect(line).toEqual({ strength: seaGaps(10, none).strength, weight: d.weight });
    expect(SEA_TIERS.level * SEA_TIERS.perTier).toBeCloseTo(DIVE.ledgeEvery);
  });

  it('the level panels name where sea fish get heavy and too heavy for the gear, a marker further out each level', () => {
    expect(markerOver(5, 0, 1)).toBe(30);
    expect(markerOver(5, 0, 2)).toBe(60);
    for (let level = 0; level < 40; level++) {
      const m = markerOver(5, level, 1);
      expect(markerOver(5, level + 1, 1)).toBe(m + DIVE.ledgeEvery);
      expect(overGear(seaGaps(m, { rod: level, line: level }))).toEqual({ rod: true, line: true });
      expect(overGear(seaGaps(m - DIVE.ledgeEvery, { rod: level, line: level }))).toEqual({ rod: false, line: false });
    }
  });

  it('computes powers by multiplication', () => {
    expect(powInt(1.01, 0)).toBe(1);
    expect(powInt(1.01, 70) / Math.pow(1.01, 70)).toBeCloseTo(1, 12);
  });
});

describe('sea zones and bites', () => {
  it('runs Shelf 1-15, Drop-off 16-40, Kelp Deep 41-80, Twilight 81-150, Abyss 151+', () => {
    const z = (d: number) => zoneAt(d).id;
    expect([0, 15, 16, 40, 41, 80, 81, 150, 151, 900].map(z)).toEqual(
      ['shelf', 'shelf', 'dropoff', 'dropoff', 'kelp', 'kelp', 'twilight', 'twilight', 'abyss', 'abyss'],
    );
  });

  it('a legend bites about 1 time in 20, the two everyday fish evenly', () => {
    const rng = mulberry(3);
    const n = 6000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const b = rollSeaFish(5, rng);
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
      const id = rollSeaFish(160, rng).fish.id;
      count[id] = (count[id] ?? 0) + 1;
    }
    const abyss = ZONES.find((z) => z.id === 'abyss')!;
    const legends = abyss.legends.reduce((a, id) => a + (count[id] ?? 0), 0) / n;
    expect(legends).toBeGreaterThan(0.04);
    expect(legends).toBeLessThan(0.06);
    for (const id of abyss.legends) expect((count[id] ?? 0) / n, id).toBeGreaterThan(0.01);
    for (const id of abyss.fish) expect(Math.abs((count[id] ?? 0) / n - 0.95 / abyss.fish.length), id).toBeLessThan(0.02);
  });

  it('each zone past the Shelf has its behaviour, and the Abyss mixes all three', () => {
    const seen = (depth: number) => {
      const rng = mulberry(9);
      const s = new Set<string | null>();
      for (let i = 0; i < 300; i++) s.add(rollSeaFish(depth, rng).behaviour);
      return [...s].sort();
    };
    expect(seen(35)).toEqual(['runner']);
    expect(seen(60)).toEqual(['thrasher']);
    expect(seen(100)).toEqual(['sounder']);
    expect(seen(200)).toEqual(['runner', 'sounder', 'thrasher']);
  });

  it('a new way of fighting blends in a quarter a marker from the zone above', () => {
    const share = (depth: number, b: Behaviour | null) => behaviourOdds(depth).filter(([x]) => x === b).reduce((a, [, p]) => a + p, 0);
    // By the player's markers: the Drop-off starts at 16, inside the marker from 15.
    expect([16, 20, 25, 30].map((d) => share(d, 'runner'))).toEqual([0.25, 0.5, 0.75, 1]);
    expect(share(19, 'runner')).toBe(0.25);
    expect(share(16, null)).toBe(0.75);
    expect([41, 45, 50, 55].map((d) => share(d, 'runner'))).toEqual([0.75, 0.5, 0.25, 0]);
    expect(share(151, 'thrasher')).toBeCloseTo(0.25 / 3 + 0.75 * 0);
    expect(share(151, 'sounder')).toBeCloseTo(0.25 / 3 + 0.75);
    for (let depth = 0; depth < 300; depth += 3) expect(behaviourOdds(depth).reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 9);
    // And the rolls follow the odds.
    const rng = mulberry(2);
    let runners = 0;
    for (let i = 0; i < 4000; i++) if (rollSeaFish(20, rng).behaviour === 'runner') runners++;
    expect(runners / 4000).toBeCloseTo(0.5, 1);
  });

  it('a sea cast fights at the depth\'s gaps over the Deep Sea Rod level, whatever the fish, with its tag and spread and no behaviour for now', () => {
    const s = newSave();
    s.seaRod = true;
    s.rodLevel = 6;
    for (let depth = 0; depth < 200; depth += 7) {
      const seed = 100 + depth;
      const roll = rollSeaCast(s, depth, mulberry(seed));
      const fish = byId(FISH, roll.fishId!);
      expect(fish.sea).toBe(true);
      const g = seaGaps(depth, { rod: 6, line: 0 });
      expect(Math.abs(roll.d!.strength - g.strength - (roll.tag === 'feisty' ? TAG_TIERS.feisty : 0))).toBeLessThanOrEqual(FISH_SPREAD + 0.005);
      expect(Math.abs(roll.d!.weight - g.weight - (roll.tag === 'brutish' ? TAG_TIERS.brutish : 0))).toBeLessThanOrEqual(FISH_SPREAD + 0.005);
      expect(roll.b).toBeUndefined();
    }
    for (const z of ZONES) {
      expect(z.fish.length).toBeGreaterThanOrEqual(2);
      expect(z.legends.length).toBeGreaterThanOrEqual(1);
      // A zone's legends are exactly its legend-flagged fish, and its everyday fish are not.
      for (const id of z.legends) expect(byId(FISH, id).legend, id).toBe(true);
      for (const id of z.fish) expect(byId(FISH, id).legend, id).toBeFalsy();
    }
    // Every sea fish swims in exactly one zone.
    const listed = ZONES.flatMap((z) => [...z.fish, ...z.legends]);
    expect(new Set(listed).size).toBe(listed.length);
    expect(FISH.filter((f) => f.sea).map((f) => f.id).sort()).toEqual([...listed].sort());
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

describe('sea gear messages', () => {
  it('come with depth and go with levels on the matching track', () => {
    const over = (depth: number, gear: SeaGear) => overGear(seaGaps(depth, gear));
    expect(over(10, none)).toEqual({ rod: false, line: false });
    expect(over(30, none)).toEqual({ rod: true, line: true });
    expect(over(30, { rod: 0, line: 1 })).toEqual({ rod: true, line: false });
    expect(over(30, { rod: 1, line: 0 })).toEqual({ rod: false, line: true });
  });
});

describe('the dive', () => {
  it('each landed fish goes one depth deeper and adds 1 + floor(depth / 20) pearls', () => {
    expect([0, 19, 20, 39, 40, 85].map(pearlsAt)).toEqual([1, 1, 2, 2, 3, 5]);
    const d = startDive(20);
    afterFight(d, 'galemackerel', true, clean);
    expect(d.depth).toBe(21);
    expect(d.pearls).toBe(2);
    afterFight(d, 'galemackerel', false, wear(0.5));
    expect(d.depth).toBe(21);
    expect(d.pearls).toBe(2);
  });

  it('stops at a ledge every 5 depths for the choice', () => {
    const d = land(startDive(0), 4);
    expect(d.state).toBe('fishing');
    afterFight(d, 'snapper', true, clean);
    expect(d.state).toBe('ledge');
    expect(d.depth).toBe(5);
    afterFight(d, 'snapper', true, clean); // no fishing at a ledge until diving on
    expect(d.depth).toBe(5);
    diveOn(d);
    land(d, 5);
    expect(d.state).toBe('ledge');
    expect(d.ledges).toBe(2);
  });

  it('the spool wears by the line taken, 25 m a fish lost (snapped or ran off) and 5 m a fray left on a landed fish', () => {
    expect(lineWorn(wear(0.5), true)).toBe(0.5 * DIVE.metresPerLine);
    expect(lineWorn(wear(0.5, 1), true)).toBe(0.5 * DIVE.metresPerLine + 5);
    expect(lineWorn(wear(0.2, 2, true), false)).toBe(0.2 * DIVE.metresPerLine + 25);
    expect(lineWorn(wear(0.9), false)).toBe(0.9 * DIVE.metresPerLine + 25);
    const d = startDive(0);
    afterFight(d, 'snapper', false, wear(0, 2, true));
    expect(d.line).toBe(DIVE.spool - 25);
  });

  it('running out of line sinks the unbanked haul, but the fish still come home', () => {
    const d = land(startDive(0), 7);
    diveOn(d);
    expect(d.pearls).toBe(7);
    for (let i = 0; i < 12; i++) afterFight(d, 'snapper', false, wear(0, 2, true));
    expect(d.state).toBe('sunk');
    expect(d.line).toBe(0);
    expect(d.pearls).toBe(0);
    expect(d.fish.length).toBe(7);
    const chart: Chart = { ledges: [], record: 0 };
    expect(surface(d, chart)).toBeNull();
    expect(chart).toEqual({ ledges: [], record: 0 });
  });

  it('a fish landed with the last of the line comes home, but the haul sinks', () => {
    const d = startDive(0);
    d.line = 3;
    afterFight(d, 'grouper', true, wear(0, 1));
    expect(d.state).toBe('sunk');
    expect(d.fish).toEqual(['grouper']);
    expect(d.pearls).toBe(0);
  });

  it('surfacing banks the haul, +10% for each ledge reached this dive, up to +50%', () => {
    expect([0, 1, 3, 5, 9].map(haulBonus)).toEqual([1, 1.1, 1.3, 1.5, 1.5]);
    const chart: Chart = { ledges: [], record: 0 };
    const d = land(startDive(0), 10);
    expect(d.pearls).toBe(10);
    const got = surface(d, chart)!;
    expect(got.pearls).toBe(12);
    expect(got.fish.length).toBe(10);
    expect(d.state).toBe('surfaced');
  });

  it('can only surface at a ledge', () => {
    const d = land(startDive(0), 3);
    expect(surface(d, { ledges: [], record: 0 })).toBeNull();
    expect(d.state).toBe('fishing');
  });

  it('surfacing charts the ledge, later dives start there, and the record is the deepest ledge surfaced from', () => {
    const chart: Chart = { ledges: [], record: 0 };
    expect(canStartAt(chart, 0)).toBe(true);
    expect(canStartAt(chart, 10)).toBe(false);
    expect(surface(land(startDive(0), 10), chart)!.record).toBe(true);
    expect(chart).toEqual({ ledges: [10], record: 10 });
    expect(canStartAt(chart, 10)).toBe(true);
    const deeper = land(startDive(10), 10);
    expect(deeper.depth).toBe(20);
    expect(surface(deeper, chart)!.record).toBe(true);
    const shallow = surface(land(startDive(0), 5), chart)!;
    expect(shallow.record).toBe(false);
    expect(chart.ledges.sort((a, b) => a - b)).toEqual([5, 10, 20]);
    expect(chart.record).toBe(20);
  });

  it('a bot can dive the Shelf with the real reel', () => {
    const rng = mulberry(11), brng = mulberry(12);
    const d = startDive(0);
    while (d.state === 'fishing') {
      const bite = rollSeaFish(d.depth, rng);
      const f = botFight(seaGaps(d.depth, none), 0.25, STYLES[0], rng, brng);
      afterFight(d, bite.fish.id, f.status === 'caught', { lineOut: f.lineOut, frays: f.frays, snapped: f.status === 'snapped' });
    }
    expect(d.state).toBe('ledge');
    expect(d.depth).toBe(5);
    expect(d.line).toBeGreaterThan(DIVE.spool - 30);
  });
});
