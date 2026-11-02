import { describe, expect, it } from 'vitest';
import { byId, FISH } from '../data/content';
import { DIVE, SEA_FIGHT, ZONES, type Behaviour } from '../data/dive';
import {
  BEHAVIOUR_TUNE, afterFight, behaviourOdds, canStartAt, diveOn, haulBonus, lineWorn, pearlsAt, powInt, pullWord, rodLevelEase, rollPull, seaOverGear, STRENGTH_RED, fightTune, LEGEND_TUNE, SEA_TUNE,
  rollSeaFish, seaDifficulty, startDive, surface, zoneAt, type Chart, type SeaGear,
} from './dive';
import { rollSeaCast } from './economy';
import { mulberry } from './env';
import { sizeDifficulty } from './progression';
import { GOOD_MAX, Reel, type ReelWear } from './reel';
import { STYLES, botCell, botFight, botSweep } from './reelbot';
import { newSave } from './state';

const clean: ReelWear = { lineOut: 0, frays: 0, snapped: false };
const wear = (lineOut: number, frays = 0, snapped = false): ReelWear => ({ lineOut, frays, snapped });
const none: SeaGear = { rod: 0, line: 0 };
/** base × 1.01^x, the sea's unit. */
const at = (x: number) => 1.6 * Math.pow(1.01, x);

/** Lands `n` fish with no wear. */
function land(dive: ReturnType<typeof startDive>, n: number) {
  for (let i = 0; i < n; i++) {
    afterFight(dive, 'pewtercod', true, clean);
    if (dive.state === 'ledge' && i < n - 1) diveOn(dive);
  }
  return dive;
}

describe('sea fight difficulty', () => {
  it('starts the Shelf at 1.6 strength and pace, with weight 15 leagues ahead', () => {
    expect(seaDifficulty(0, none)).toEqual({ weight: +at(15).toFixed(2), strength: 1.6, pace: 1.6 });
  });

  it('is the same all through a marker, then steps up', () => {
    expect(seaDifficulty(24, none)).toEqual(seaDifficulty(20, none));
    expect(seaDifficulty(24, none).strength).toBeCloseTo(at(20), 2);
    expect(seaDifficulty(25, none).strength).toBeCloseTo(at(25), 2);
    expect(seaDifficulty(30, none).strength).toBeGreaterThan(seaDifficulty(25, none).strength);
  });

  it('no marker is easier than the one before on any axis, whatever the gear', () => {
    for (const gear of [none, { rod: 10, line: 0 }, { rod: 0, line: 10 }, { rod: 30, line: 30 }]) {
      let prev = seaDifficulty(0, gear);
      for (let depth = 1; depth < 400; depth++) {
        const d = seaDifficulty(depth, gear);
        // Weight may only give way to its cap, which comes down as the pace goes up.
        const cap = SEA_FIGHT.weightCap[0] - SEA_FIGHT.weightCap[1] * (d.pace! - 2);
        expect(d.weight).toBeGreaterThanOrEqual(Math.min(prev.weight, cap) - 0.015);
        expect(d.strength).toBeGreaterThanOrEqual(prev.strength);
        expect(d.pace!).toBeGreaterThanOrEqual(prev.pace!);
        prev = d;
      }
    }
  });

  it('a rod level takes 4.5 leagues off weight and 1.5 off strength; a line level the other way round', () => {
    const d = seaDifficulty(30, none), rod = seaDifficulty(30, { rod: 4, line: 0 }), line = seaDifficulty(30, { rod: 0, line: 4 });
    expect(rod.weight / d.weight).toBeCloseTo(Math.pow(1.01, -18), 2);
    expect(rod.strength / d.strength).toBeCloseTo(Math.pow(1.01, -6), 2);
    expect(line.strength / d.strength).toBeCloseTo(Math.pow(1.01, -18), 2);
    expect(line.weight / d.weight).toBeCloseTo(Math.pow(1.01, -6), 2);
    expect(rodLevelEase(1)).toBeCloseTo(1 - Math.pow(1.01, -4.5), 6);
  });

  it('no gear eases the pace, and it levels off where a 0.7 s player can still play it', () => {
    expect(seaDifficulty(30, { rod: 20, line: 20 }).pace).toBe(seaDifficulty(30, none).pace);
    expect(seaDifficulty(70, none).pace).toBe(SEA_FIGHT.paceCap);
    for (const depth of [100, 400]) expect(seaDifficulty(depth, none).pace).toBeCloseTo(SEA_FIGHT.paceCap + ZONES[3].lead!.paceCap!, 2);
  });

  it('weight stops short of the slog at every depth, however big the fish', () => {
    for (let depth = 0; depth < 400; depth += 5) {
      const d = seaDifficulty(depth, none, { stamina: 2.8 }, 1, 1.15);
      expect(d.weight).toBeLessThanOrEqual(SEA_FIGHT.weightCap[0] - SEA_FIGHT.weightCap[1] * (d.pace! - 2) + 0.015);
    }
  });

  it('the Drop-off leads on weight and Kelp Deep on strength, each ramping in over its first 4 markers and staying below', () => {
    // Leagues each axis is ahead of the plain climb (rounding to 0.01 is under a league).
    const leagues = (a: number, b: number) => Math.log(a / b) / Math.log(1.01);
    const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThan(1);
    const rod = 20;
    const w = (depth: number) => leagues(seaDifficulty(depth, { rod, line: 0 }).weight, at(Math.floor(depth / 5) * 5 + SEA_FIGHT.weightStart - rod * SEA_FIGHT.ease));
    const lead = ZONES[1].lead!.weight!;
    [[15, 0], [16, lead / 4], [20, lead / 2], [29, (3 * lead) / 4], [30, lead], [120, lead]].forEach(([d, x]) => near(w(d), x));
    const s = (depth: number) => leagues(seaDifficulty(depth, none).strength, at(Math.floor(depth / 5) * 5));
    const pull = ZONES[2].lead!.strength!;
    [[40, 0], [41, pull / 4], [55, pull], [300, pull]].forEach(([d, x]) => near(s(d), x));
  });

  it('the pull roll moves strength only, size and the species weight', () => {
    const d = seaDifficulty(30, none);
    const strong = seaDifficulty(30, none, undefined, 1.3), big0 = seaDifficulty(30, none, undefined, 1, 1.1);
    expect([strong.weight, strong.pace]).toEqual([d.weight, d.pace]);
    expect(strong.strength).toBeCloseTo(d.strength * 1.3, 1);
    expect([big0.strength, big0.pace]).toEqual([d.strength, d.pace]);
    expect(big0.weight).toBeCloseTo(d.weight * 1.1, 1);
    const big = seaDifficulty(30, none, { stamina: 2.86 });
    expect(big.weight).toBeCloseTo(d.weight * 1.1, 1);
    expect(big.strength).toBeCloseTo(d.strength * 1.1, 1);
  });

  it('a fish pulls up to 1.4× either way, about one in four strong and one in four light', () => {
    const rng = mulberry(21);
    const n = 4000;
    let strong = 0, light = 0;
    for (let i = 0; i < n; i++) {
      const p = rollPull(rng);
      expect(p).toBeGreaterThanOrEqual(1 / SEA_FIGHT.spread - 1e-9);
      expect(p).toBeLessThanOrEqual(SEA_FIGHT.spread + 1e-9);
      if (pullWord(p) === 'strong') strong++;
      if (pullWord(p) === 'light') light++;
    }
    expect(strong / n).toBeGreaterThan(0.18);
    expect(strong / n).toBeLessThan(0.28);
    expect(light / n).toBeGreaterThan(0.21);
    expect(light / n).toBeLessThan(0.31);
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

  it('a legend fights 1.5× as long, no stronger and no heavier: the same land rate and spool', () => {
    expect(fightTune(null, 'pewtercod')).toEqual(SEA_TUNE);
    expect(fightTune('runner', 'galemackerel')).toEqual({ ...SEA_TUNE, ...BEHAVIOUR_TUNE.runner });
    expect(fightTune('runner', 'marlin')).toEqual({ ...SEA_TUNE, ...BEHAVIOUR_TUNE.runner, ...LEGEND_TUNE });
    const d = { weight: 2.6, strength: 2.3, pace: 2 };
    const plain = botCell(d, 0.25, 60, 1, STYLES, fightTune(null, 'irontuna'));
    const legend = botCell(d, 0.25, 60, 1, STYLES, fightTune(null, 'leviathan'));
    expect(legend.t / plain.t).toBeGreaterThan(1.35);
    expect(legend.t / plain.t).toBeLessThan(1.7);
    expect(legend.land).toBeGreaterThanOrEqual(plain.land - 0.05);
    // Its tired surges fade over a longer fight, so it takes a little more line (about 1.4×; legends are 1 bite in 20).
    expect(legend.lineOut).toBeLessThan(plain.lineOut * 1.45);
  }, 30_000);

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

  it('a sea cast fights at the depth on the Deep Sea Rod level, with its size on weight and its pull on strength', () => {
    const s = newSave();
    s.seaRod = true;
    s.rodLevel = 6;
    for (let depth = 0; depth < 200; depth += 7) {
      const seed = 100 + depth;
      const roll = rollSeaCast(s, depth, mulberry(seed));
      const fish = byId(FISH, roll.fishId!);
      expect(fish.sea).toBe(true);
      const bite = rollSeaFish(depth, mulberry(seed));
      expect(roll.d).toEqual(seaDifficulty(depth, { rod: 6, line: 0 }, fish, bite.pull, sizeDifficulty(fish, roll.size)));
      expect(roll.b).toBe(bite.behaviour ?? undefined);
      expect(roll.pull).toBe(pullWord(bite.pull) ?? undefined);
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

describe('fish behaviours', () => {
  // Where the bots land half their fish, plain and with each behaviour's feel: the axes carry how hard it is.
  const half = (react: number, tune?: (typeof BEHAVIOUR_TUNE)[Behaviour]) => botSweep(react, 1.4, 3.2, 0.1, 150, undefined, tune);
  const plain = { fast: half(0.25), slow: half(0.7) };

  for (const [name, tune] of Object.entries(BEHAVIOUR_TUNE)) {
    it(`a ${name} plays differently but no harder than a plain fish of the same difficulty, with no cliff`, () => {
      for (const [b, p] of [[half(0.25, tune), plain.fast], [half(0.7, tune), plain.slow]]) {
        expect(Math.abs(b.d50 / p.d50 - 1)).toBeLessThan(0.06);
        expect(b.steepest).toBeLessThanOrEqual(0.75);
      }
    }, 30_000);
  }

  it('a runner takes more line', () => {
    const line = (tune?: typeof BEHAVIOUR_TUNE.runner) => {
      let total = 0;
      const rng = mulberry(4), brng = mulberry(8);
      for (let i = 0; i < 200; i++) total += botFight(2.0, 0.25, STYLES[0], rng, brng, tune).lineOut;
      return total;
    };
    expect(line(BEHAVIOUR_TUNE.runner)).toBeGreaterThan(1.15 * line());
  });

  /** Seconds of warning per surge and surges per minute, holding gently through a fight. */
  function pattern(tune?: typeof BEHAVIOUR_TUNE.runner) {
    let warn = 0, t = 0, surges = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = new Reel(2.0, mulberry(seed), tune);
      for (let k = 0; k < 60 * 30 && r.status === 'reeling'; k++) {
        if (r.warning) warn += 1 / 60;
        r.update(1 / 60, r.surging ? r.tension < r.need + 0.1 : r.tension < 0.6);
      }
      t += r.elapsed;
      surges += r.surgeCount;
    }
    return { warn: warn / surges, perMin: (60 * surges) / t };
  }

  it('a thrasher surges more often; a sounder gives less warning', () => {
    const p = pattern();
    expect(pattern(BEHAVIOUR_TUNE.thrasher).perMin).toBeGreaterThan(1.4 * p.perMin);
    expect(pattern(BEHAVIOUR_TUNE.sounder).warn).toBeLessThan(0.6 * p.warn);
  });
});

/**
 * The frontier, played by the bots (REELING.md, "The sea"): per marker, the share of fish landed and the spool each
 * landed fish costs, over the depth's behaviours (`behaviourOdds`), four pull rolls and two sizes.
 */
function seaRow(gear: SeaGear, react: number, from = 0, to = 300, n = 20) {
  const pulls = [1, 3, 5, 7].map((k) => Math.pow(SEA_FIGHT.spread, 2 * (k / 8) - 1));
  const rows: { depth: number; land: number; t: number; metres: number }[] = [];
  for (let depth = from; depth <= to; depth += DIVE.ledgeEvery) {
    const fish = byId(FISH, zoneAt(depth).fish[0]);
    let land = 0, t = 0, metres = 0;
    for (const [b, p] of behaviourOdds(depth)) for (const pull of pulls) for (const big of [0.88, 1.12]) {
      const c = botCell(seaDifficulty(depth, gear, fish, pull, big), react, n, 1, STYLES, fightTune(b, fish.id));
      const k = p / (pulls.length * 2);
      land += c.land * k;
      t += c.t * k;
      metres += (c.lineOut * DIVE.metresPerLine * c.land + c.snaps * DIVE.snapMetres) * k;
    }
    rows.push({ depth, land, t, metres: metres / Math.max(0.01, land) });
    if (land < 0.3) break;
  }
  return rows;
}
/** The depth where the land rate falls through `share`. */
function crossing(rows: ReturnType<typeof seaRow>, share: number): number {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    if (b.land < share) return a.depth + (DIVE.ledgeEvery * (a.land - share)) / (a.land - b.land);
  }
  return Infinity;
}

describe('fight left', () => {
  /** A fight held gently in the green, like the room tests' player: the surges' peak pulls and when it was exhausted. */
  function watch(d: { weight: number; strength: number; pace: number }, seed: number, tune = SEA_TUNE) {
    const r = new Reel(d, mulberry(seed), tune);
    const peaks: number[] = [];
    // The calm before each surge and the surge's length, at full fight and late in the tired stage.
    const gaps = { full: [] as number[], tired: [] as number[] };
    const surges = { full: [] as number[], tired: [] as number[] };
    let peak = 0, tiredAt = -1, exhaustedAt = -1, surgesAfter = 0, lastEnd = -1, start = -1, late = false;
    for (let k = 0; k < 60 * 300 && r.status === 'reeling'; k++) {
      const was = r.surgeCount, surging = r.surging;
      r.update(1 / 60, r.surging ? r.tension < Math.min(0.75, r.need + 0.1) : r.tension < 0.6);
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

  it('pond fish never tire; every sea fish does', () => {
    expect(new Reel(2.5, mulberry(1)).tires).toBe(false);
    expect(fightTune(null, 'bluegill')).toBeUndefined();
    for (const z of ZONES) for (const id of [...z.fish, ...z.legends]) expect(new Reel(2.5, mulberry(1), fightTune(null, id)).tires, id).toBe(true);
  });

  it('an exhausted fish surges no more and comes in (most are reeled in while still tired)', () => {
    let exhausted = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = watch({ weight: 3.2, strength: 2, pace: 2 }, seed);
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
      const w = watch({ weight: 3.2, strength: 2, pace: 2 }, seed);
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
      const { peaks } = watch({ weight: 3.2, strength: 2.6, pace: 2 }, seed);
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
        const { peaks } = watch({ weight: 3.2, strength, pace: 2 }, seed);
        if (peaks.length < 4) continue;
        first += peaks[0] + peaks[1];
        lastPulls += peaks[peaks.length - 1] + peaks[peaks.length - 2];
        // Fish whose own roll pulls into the red at full strength stay there.
        if (peaks[0] > GOOD_MAX + 0.05) inRed &&= peaks.every((p) => p > GOOD_MAX);
      }
      return { ratio: lastPulls / first, inRed };
    };
    // A fish the line holds fades toward exhausted; one over the line keeps every surge in the red.
    expect(fade(2.6).ratio).toBeLessThan(0.75);
    expect(fade(3.5).inRed).toBe(true);
  });

  it('every surge of a sea fish pulls about the same, so the marker reads as its strength', () => {
    // At full fight, before it tires.
    for (let seed = 1; seed <= 10; seed++) {
      const peaks = watch({ weight: 3.2, strength: 2.6, pace: 2 }, seed).peaks.slice(0, 3);
      for (const p of peaks) expect(Math.abs(p / peaks[0] - 1)).toBeLessThan(0.12);
    }
  });

  it('heavier fish have more fight in them, so the rod still decides how long a fight runs', () => {
    const tiresAfter = (weight: number) => {
      let t = 0;
      for (let seed = 1; seed <= 20; seed++) t += watch({ weight, strength: 2, pace: 2 }, seed).tiredAt;
      return t / 20;
    };
    // Fight is in proportion to weight (3.2 is 1.45× 2.2).
    expect(tiresAfter(3.2)).toBeGreaterThan(1.3 * tiresAfter(2.2));
  });

  it('no slog: a careful player fights a Drop-off fish at marker 35 inside a minute, 9 times in 10', () => {
    const rng = mulberry(35);
    const ts: number[] = [];
    for (let i = 0; i < 80; i++) {
      const bite = rollSeaFish(35, rng);
      const d = seaDifficulty(35, none, bite.fish, bite.pull);
      ts.push(botFight(d, 0.3, { lo: 0.05, hi: 0.2 }, mulberry(i + 1), mulberry(i + 99), fightTune(bite.behaviour, bite.fish.id)).t);
    }
    ts.sort((a, b) => a - b);
    expect(ts[Math.floor(0.9 * ts.length)]).toBeLessThan(60);
  }, 30_000);
});

describe('sea gear messages', () => {
  it('a fish is over the line once its surges reach the red, and over the rod at its heaviest', () => {
    expect(STRENGTH_RED).toBeCloseTo(3.16, 2);
    expect(seaOverGear({ weight: 2, strength: 3.1, pace: 2 })).toEqual({ rod: false, line: false });
    expect(seaOverGear({ weight: 2, strength: 3.2, pace: 2 })).toEqual({ rod: false, line: true });
    expect(seaOverGear({ weight: SEA_FIGHT.weightCap[0], strength: 2, pace: 2 })).toEqual({ rod: true, line: false });
    // Twitchier fish cap lower, so they're too heavy sooner.
    expect(seaOverGear({ weight: 3, strength: 2, pace: 2 }).rod).toBe(false);
    expect(seaOverGear({ weight: 3, strength: 2, pace: 2.2 }).rod).toBe(true);
  });

  it('come with depth and go with levels on the matching track', () => {
    const over = (depth: number, gear: SeaGear, pull = 1) => seaOverGear(seaDifficulty(depth, gear, undefined, pull));
    expect(over(10, none)).toEqual({ rod: false, line: false });
    expect(over(60, none).line).toBe(true);
    expect(over(60, { rod: 0, line: 10 }).line).toBe(false);
    expect(over(45, none).rod).toBe(true);
    expect(over(45, { rod: 10, line: 0 }).rod).toBe(false);
  });
});

describe('the frontier', () => {
  const fast = { none: seaRow(none, 0.25), five: seaRow({ rod: 5, line: 5 }, 0.25) };

  it('is felt coming: the land rate falls over 3 markers or more, no marker before it taking more than a quarter', () => {
    for (const rows of [fast.none, fast.five]) {
      expect(crossing(rows, 0.5) - crossing(rows, 0.9)).toBeGreaterThanOrEqual(15);
      for (let i = 1; i < rows.length && rows[i - 1].land > 0.5; i++) expect(rows[i - 1].land - rows[i].land).toBeLessThan(0.25);
    }
  }, 30_000);

  // Fish tire, so a fish the line holds costs bounded spool and one over it is lost: past the Drop-off the land rate
  // follows the share of fish the line holds, and the spool climbs less steeply than before they tired (2026-11-01).
  it('each landed fish costs more of the spool as it nears, marker by marker', () => {
    for (const rows of [fast.none, fast.five]) {
      const near = rows.filter((r) => r.depth >= crossing(rows, 0.5) - 30 && r.land > 0.5);
      expect(near.length).toBeGreaterThanOrEqual(4);
      // Never far back from the dearest marker so far (the bots are noisy near 50%), and well up overall.
      for (let i = 1; i < near.length; i++) expect(near[i].metres).toBeGreaterThan(0.75 * Math.max(...near.slice(0, i).map((r) => r.metres)));
      expect(near[near.length - 1].metres).toBeGreaterThan(1.75 * near[0].metres);
    }
  }, 30_000);

  it('the water short of it is not a walkover: fights there last 15 s or more', () => {
    for (const rows of [fast.none, fast.five]) {
      const comfy = rows.find((r) => r.depth >= crossing(rows, 0.5) - 30)!;
      expect(comfy.land).toBeGreaterThan(0.8);
      expect(comfy.t).toBeGreaterThanOrEqual(15);
    }
  }, 30_000);

  it('levels on either track push it deeper, and both further still (a soft stall, not a wall)', () => {
    const f = (gear: SeaGear) => crossing(seaRow(gear, 0.25, 30), 0.5);
    const base = crossing(fast.none, 0.5);
    const rod = f({ rod: 10, line: 0 }), line = f({ rod: 0, line: 10 }), both = f({ rod: 10, line: 10 });
    expect(rod).toBeGreaterThan(base + 10);
    expect(line).toBeGreaterThan(base + 10);
    expect(both).toBeGreaterThan(Math.max(rod, line) + 10);
  }, 60_000);
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

  it('the spool wears by the line taken, 25 m a snap and 5 m a fray left on a landed fish', () => {
    expect(lineWorn(wear(0.5), true)).toBe(0.5 * DIVE.metresPerLine);
    expect(lineWorn(wear(0.5, 1), true)).toBe(0.5 * DIVE.metresPerLine + 5);
    expect(lineWorn(wear(0.2, 2, true), false)).toBe(0.2 * DIVE.metresPerLine + 25);
    expect(lineWorn(wear(0.9), false)).toBe(0.9 * DIVE.metresPerLine);
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
      const f = botFight(seaDifficulty(d.depth, none, bite.fish, bite.pull), 0.25, STYLES[0], rng, brng);
      afterFight(d, bite.fish.id, f.status === 'caught', { lineOut: f.lineOut, frays: f.frays, snapped: f.status === 'snapped' });
    }
    expect(d.state).toBe('ledge');
    expect(d.depth).toBe(5);
    expect(d.line).toBeGreaterThan(DIVE.spool - 30);
  });
});
