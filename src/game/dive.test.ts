import { describe, expect, it } from 'vitest';
import { byId, FISH } from '../data/content';
import { DIVE, SEA_FIGHT, ZONES, type Behaviour } from '../data/dive';
import {
  BEHAVIOUR_TUNE, afterFight, behaviourOdds, canStartAt, diveOn, haulBonus, lineWorn, pearlsAt, powInt, pullWord, rodLevelEase, rollPull, seaOverGear, STRENGTH_RED,
  rollSeaFish, seaDifficulty, startDive, surface, zoneAt, type Chart, type SeaGear,
} from './dive';
import { rollSeaCast } from './economy';
import { mulberry } from './env';
import { sizeDifficulty } from './progression';
import { Reel, type ReelWear } from './reel';
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

  it('a sea cast fights at the depth on the Aurora Rod level, with its size on weight and its pull on strength', () => {
    const s = newSave();
    s.rod = 'aurora';
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
    for (const z of ZONES) expect(z.fish.length).toBe(2);
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
      const c = botCell(seaDifficulty(depth, gear, fish, pull, big), react, n, 1, STYLES, b ? BEHAVIOUR_TUNE[b] : undefined);
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

  it('each landed fish costs more of the spool as it nears, marker by marker', () => {
    for (const rows of [fast.none, fast.five]) {
      const near = rows.filter((r) => r.depth >= crossing(rows, 0.5) - 30 && r.land > 0.5);
      expect(near.length).toBeGreaterThanOrEqual(4);
      // Never far back from the dearest marker so far (the bots are noisy near 50%), and well up overall.
      for (let i = 1; i < near.length; i++) expect(near[i].metres).toBeGreaterThan(0.75 * Math.max(...near.slice(0, i).map((r) => r.metres)));
      expect(near[near.length - 1].metres).toBeGreaterThan(2.5 * near[0].metres);
    }
  }, 30_000);

  it('the water short of it is not a walkover: fights there last 15 s or more', () => {
    for (const rows of [fast.none, fast.five]) {
      const comfy = rows.find((r) => r.depth >= crossing(rows, 0.5) - 30)!;
      expect(comfy.land).toBeGreaterThan(0.85);
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
