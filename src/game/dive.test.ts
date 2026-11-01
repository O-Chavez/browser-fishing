import { describe, expect, it } from 'vitest';
import { DIVE, ZONES } from '../data/dive';
import {
  BEHAVIOUR_TUNE, afterFight, canStartAt, diveOn, haulBonus, lineWorn, pearlsAt, powInt, rollSeaFish, seaDifficulty,
  startDive, surface, zoneAt, type Chart,
} from './dive';
import { mulberry } from './env';
import { Reel, type ReelWear } from './reel';
import { STYLES, botFight, botSweep } from './reelbot';

const clean: ReelWear = { lineOut: 0, frays: 0, snapped: false };
const wear = (lineOut: number, frays = 0, snapped = false): ReelWear => ({ lineOut, frays, snapped });

/** Lands `n` fish with no wear. */
function land(dive: ReturnType<typeof startDive>, n: number) {
  for (let i = 0; i < n; i++) {
    afterFight(dive, 'pewtercod', true, clean);
    if (dive.state === 'ledge' && i < n - 1) diveOn(dive);
  }
  return dive;
}

describe('sea fight difficulty', () => {
  it('is 1.6 × 1.01^depth × 0.97^rod level, with no clamp', () => {
    expect(seaDifficulty(0, 0)).toBe(1.6);
    for (const [depth, rod] of [[10, 0], [50, 0], [50, 10], [120, 40], [400, 5]]) {
      expect(seaDifficulty(depth, rod)).toBeCloseTo(1.6 * Math.pow(1.01, depth) * Math.pow(0.97, rod) * zoneAt(depth).factor, 2);
    }
    expect(seaDifficulty(300, 0)).toBeGreaterThan(10);
  });

  it('a rod level is worth about 3 depths', () => {
    expect(seaDifficulty(33, 1)).toBeCloseTo(seaDifficulty(30, 0), 1);
  });

  it('scales by the species stamina rather than adding to it', () => {
    expect(seaDifficulty(20, 0, { stamina: 2.6 })).toBe(seaDifficulty(20, 0));
    expect(seaDifficulty(20, 0, { stamina: 2.86 })).toBeCloseTo(seaDifficulty(20, 0) * 1.1, 1);
  });

  it('computes powers by multiplication', () => {
    expect(powInt(1.01, 0)).toBe(1);
    expect(powInt(1.01, 70) / Math.pow(1.01, 70)).toBeCloseTo(1, 12);
  });
});

describe('sea zones and bites', () => {
  it('runs Shelf 1-15, Drop-off 16-40, Kelp Deep 41-80, Twilight 81-150, Abyss 151+', () => {
    const at = (d: number) => zoneAt(d).id;
    expect([0, 15, 16, 40, 41, 80, 81, 150, 151, 900].map(at)).toEqual(
      ['shelf', 'shelf', 'dropoff', 'dropoff', 'kelp', 'kelp', 'twilight', 'twilight', 'abyss', 'abyss'],
    );
  });

  it('a legend bites about 1 time in 20, the two everyday fish evenly', () => {
    const rng = mulberry(3);
    const n = 6000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const b = rollSeaFish(5, 0, rng);
      count[b.fish.id] = (count[b.fish.id] ?? 0) + 1;
      expect(b.behaviour).toBeNull();
    }
    expect(count.grouper / n).toBeGreaterThan(0.04);
    expect(count.grouper / n).toBeLessThan(0.06);
    expect(Math.abs(count.pewtercod - count.snapper) / n).toBeLessThan(0.03);
  });

  it('each zone past the Shelf has its behaviour, and the Abyss mixes all three', () => {
    const seen = (depth: number) => {
      const rng = mulberry(9);
      const s = new Set<string | null>();
      for (let i = 0; i < 300; i++) s.add(rollSeaFish(depth, 0, rng).behaviour);
      return [...s].sort();
    };
    expect(seen(20)).toEqual(['runner']);
    expect(seen(60)).toEqual(['thrasher']);
    expect(seen(100)).toEqual(['sounder']);
    expect(seen(200)).toEqual(['runner', 'sounder', 'thrasher']);
  });

  it('only rolls sea fish, with the difficulty of the fish that bit', () => {
    const rng = mulberry(5);
    for (let depth = 0; depth < 200; depth += 7) {
      const b = rollSeaFish(depth, 3, rng);
      expect(b.fish.sea).toBe(true);
      expect(b.difficulty).toBe(seaDifficulty(depth, 3, b.fish));
    }
    for (const z of ZONES) expect(z.fish.length).toBe(2);
  });
});

describe('fish behaviours', () => {
  // Where the bots land half their fish, plain and with each behaviour.
  const half = (react: number, tune?: (typeof BEHAVIOUR_TUNE)[keyof typeof BEHAVIOUR_TUNE]) => botSweep(react, 1.4, 3.2, 0.1, 200, undefined, tune);
  const plain = { fast: half(0.25), slow: half(0.7) };

  for (const [name, tune] of Object.entries(BEHAVIOUR_TUNE)) {
    it(`a ${name} is a little harder than a plain fish for fast and slow players, with no cliff`, () => {
      const fast = half(0.25, tune);
      const slow = half(0.7, tune);
      for (const [b, p] of [[fast, plain.fast], [slow, plain.slow]]) {
        expect(b.d50).toBeLessThan(p.d50 + 0.02);
        expect(b.d50).toBeGreaterThan(p.d50 * 0.9);
        // The small per-fish spread (`P.fight`) makes the land-rate curve steeper than it was; 0.2 of difficulty is ~8 leagues.
        expect(b.steepest).toBeLessThanOrEqual(0.75);
      }
    });
  }

  it('a runner takes more line', () => {
    const line = (tune?: typeof BEHAVIOUR_TUNE.runner) => {
      let total = 0;
      const rng = mulberry(4), brng = mulberry(8);
      for (let i = 0; i < 200; i++) total += botFight(2.0, 0.25, STYLES[0], rng, brng, tune).lineOut;
      return total;
    };
    expect(line(BEHAVIOUR_TUNE.runner)).toBeGreaterThan(1.3 * line());
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
      const bite = rollSeaFish(d.depth, 0, rng);
      const f = botFight(bite.difficulty, 0.25, STYLES[0], rng, brng);
      afterFight(d, bite.fish.id, f.status === 'caught', { lineOut: f.lineOut, frays: f.frays, snapped: f.status === 'snapped' });
    }
    expect(d.state).toBe('ledge');
    expect(d.depth).toBe(5);
    expect(d.line).toBeGreaterThan(DIVE.spool - 30);
  });
});
