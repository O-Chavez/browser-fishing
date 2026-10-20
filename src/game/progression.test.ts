import { describe, expect, it } from 'vitest';
import { BAITS, FISH, RODS, byId } from '../data/content';
import { applyXp, canCatch, eligibleFish, pickFish, reelDifficulty, rollSize, sellValue, welcomeText, xpForNextLevel } from './progression';

const twig = byId(RODS, 'twig');
const graphite = byId(RODS, 'graphite');
const worm = byId(BAITS, 'worm');

describe('progression', () => {
  it('levels up and carries over xp', () => {
    const r = applyXp(1, 0, xpForNextLevel(1) + 5);
    expect(r.level).toBe(2);
    expect(r.xp).toBe(5);
    expect(r.leveledUp).toBe(true);
  });

  it('gates fish by bait tier, whatever the rod', () => {
    const koi = byId(FISH, 'koi');
    const minnow = byId(BAITS, 'minnow');
    expect(canCatch(koi, 'pond', twig, minnow)).toBe(true);
    expect(canCatch(koi, 'pond', graphite, worm)).toBe(false);
    expect(canCatch(koi, 'pond', graphite, minnow)).toBe(true);
    expect(canCatch(byId(FISH, 'aurorapike'), 'pond', graphite, minnow)).toBe(false);
  });

  it('never offers gated fish', () => {
    const pool = eligibleFish('pond', twig, worm);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((f) => f.tier <= 1 && f.locations.includes('pond'))).toBe(true);
    for (let i = 0; i < 200; i++) expect(pool).toContain(pickFish(pool, twig, worm));
  });

  it('perfect casts skew toward higher tiers and cut the low ones', () => {
  const carbon = byId(RODS, 'carbon');
  const bait = byId(BAITS, 'minnow');
  const pool = eligibleFish('pond', carbon, bait);
  const g = Math.max(...pool.map((f) => f.tier));
  const avg = (perfect: boolean) => {
    let t = 0;
    for (let i = 0; i < 4000; i++) t += pickFish(pool, carbon, bait, Math.random, perfect)!.tier;
    return t / 4000;
  };
  expect(avg(true)).toBeGreaterThan(avg(false));
  for (let i = 0; i < 300; i++) expect(pickFish(pool, carbon, bait, Math.random, true)!.tier).toBeGreaterThanOrEqual(g - 1);
});

  it('returns null for empty pool and sizes within range', () => {
    expect(pickFish([], twig, worm)).toBeNull();
    const f = byId(FISH, 'carp');
    for (let i = 0; i < 50; i++) {
      const s = rollSize(f);
      expect(s).toBeGreaterThanOrEqual(f.minSize);
      expect(s).toBeLessThanOrEqual(f.maxSize);
    }
  });

  it('values bigger and rarer fish more', () => {
    const f = byId(FISH, 'carp');
    expect(sellValue(f, f.maxSize)).toBeGreaterThan(sellValue(f, f.minSize));
    expect(sellValue(byId(FISH, 'ghostcarp'), 90)).toBeGreaterThan(sellValue(f, 45));
  });

  it('every fish is catchable somewhere', () => {
    for (const f of FISH) {
      const ok = RODS.some((r) => BAITS.some((b) => f.locations.some((l) => canCatch(f, l, r, b, true))));
      expect(ok, f.id).toBe(true);
    }
  });
});

import { fishWeight, formatWeight } from './progression';
import { FISH as ALL_FISH } from '../data/content';

describe('fish weight', () => {
  it('increases with size and scales value', () => {
    const carp = ALL_FISH.find((f) => f.id === 'carp')!;
    expect(fishWeight(carp, carp.maxSize)).toBe(carp.maxWeight);
    expect(fishWeight(carp, 25)).toBeLessThan(fishWeight(carp, 35));
    expect(formatWeight(0.45)).toBe('450 g');
    expect(formatWeight(12)).toBe('12.0 kg');
  });
});

describe('tier progression', () => {
  const avg = (f: (typeof FISH)[number]) => sellValue(f, (f.minSize + f.maxSize) / 2);
  it('every tier is worth strictly more than the one below, even at extreme sizes', () => {
    for (let t = 1; t < 5; t++) {
      const lo = Math.min(...FISH.filter((f) => f.tier === t + 1).map((f) => sellValue(f, f.minSize)));
      const hi = Math.max(...FISH.filter((f) => f.tier === t).map((f) => sellValue(f, f.maxSize)));
      expect(lo).toBeGreaterThan(hi);
    }
    expect(avg(FISH[0])).toBeGreaterThan(0);
  });
  it('fish get harder with each tier', () => {
    for (let t = 1; t < 5; t++) {
      const lo = Math.min(...FISH.filter((f) => f.tier === t + 1).map((f) => f.stamina));
      const hi = Math.max(...FISH.filter((f) => f.tier === t).map((f) => f.stamina));
      expect(lo).toBeGreaterThan(hi);
    }
  });
  it('better rods soften the fight but higher tiers stay harder with matched gear', () => {
    const f = FISH.find((x) => x.tier === 5)!;
    const d = RODS.map((r) => reelDifficulty(f, r));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeLessThanOrEqual(d[i - 1]);
    expect(d[4]).toBeLessThan(d[0]);
    expect(d[4]).toBeLessThan(2);
    const matched = [1, 2, 3, 4, 5].map((t) => {
      const fish = FISH.filter((x) => x.tier === t);
      const rod = RODS.find((r) => r.tier === t)!;
      return fish.reduce((a, x) => a + reelDifficulty(x, rod), 0) / fish.length;
    });
    for (let i = 1; i < matched.length; i++) expect(matched[i]).toBeGreaterThan(matched[i - 1]);
    expect(matched[4]).toBeLessThan(2.0);
  });
  it('bait sets what you can hook; an under-tier rod makes the fight much harder', () => {
    expect(canCatch(FISH.find((f) => f.tier === 3)!, 'pond', RODS[0], BAITS[2])).toBe(true);
    const f = FISH.find((x) => x.tier === 3)!;
    const weak = reelDifficulty(f, RODS[0]);
    const matched = reelDifficulty(f, RODS[2]);
    expect(weak).toBeGreaterThan(matched * 1.5);
  });
});

import { fishingSpot as _spot, SPOTS as _SPOTS } from './progression';
describe('fishing spots', () => {
  it('rates the pier head above the inner pier above the shore', () => {
    expect(_spot(0, -4)).toBe('prime');
    expect(_spot(0, 9)).toBe('pier');
    expect(_spot(5.5, 20)).toBe('shore');
    expect(_SPOTS.shore.wait).toBeGreaterThan(_SPOTS.pier.wait);
    expect(_SPOTS.pier.luck).toBeLessThan(_SPOTS.prime.luck);
  });
});

describe('night fishing', () => {
  const carbon = byId(RODS, 'carbon');
  const lure = byId(BAITS, 'lure');
  it('night-only fish are in the pool only after dark', () => {
    expect(eligibleFish('pond', carbon, lure).some((f) => f.night)).toBe(false);
    expect(eligibleFish('pond', carbon, lure, true).some((f) => f.night)).toBe(true);
    expect(canCatch(byId(FISH, 'constellation'), 'pond', byId(RODS, 'aurora'), byId(BAITS, 'pearl'))).toBe(false);
  });
  it('rare fish bite more at night', () => {
    const pool = eligibleFish('pond', carbon, lure, true);
    const avg = (night: boolean) => {
      let t = 0;
      for (let i = 0; i < 4000; i++) t += pickFish(pool, carbon, lure, Math.random, false, 'prime', night)!.tier;
      return t / 4000;
    };
    expect(avg(true)).toBeGreaterThan(avg(false));
  });
});

describe('fish progression feel', () => {
  const tierFish = (t: number) => FISH.filter((f) => f.tier === t);
  const mid = (f: (typeof FISH)[number]) => (f.minSize + f.maxSize) / 2;

  it('each tier is clearly bigger than the last', () => {
    for (let t = 1; t < 5; t++) {
      const avg = (k: number) => tierFish(k).reduce((a, f) => a + mid(f), 0) / tierFish(k).length;
      expect(avg(t + 1), `tier ${t + 1} vs ${t}`).toBeGreaterThan(avg(t) * 1.4);
      expect(Math.max(...tierFish(t + 1).map((f) => f.maxSize))).toBeGreaterThan(Math.max(...tierFish(t).map((f) => f.maxSize)));
    }
  });

  it('better gear shifts the catch up while legendaries stay special', () => {
    const share = (gear: number, test: (tier: number) => boolean) => {
      const rod = RODS[gear - 1];
      const bait = BAITS[gear - 1];
      const pool = eligibleFish('pond', rod, bait);
      let seed = 1;
      const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      let hits = 0;
      for (let i = 0; i < 20000; i++) if (test(pickFish(pool, rod, bait, rng)!.tier)) hits++;
      return hits / 20000;
    };
    expect(share(3, (t) => t === 3)).toBeGreaterThan(0.4);
    expect(share(4, (t) => t === 4)).toBeGreaterThan(0.35);
    expect(share(5, (t) => t <= 2)).toBeLessThan(0.3);
    const legend = share(5, (t) => t === 5);
    expect(legend).toBeGreaterThan(0.1);
    expect(legend).toBeLessThan(0.25);
  });
});

describe('welcome banner', () => {
  const fresh = { level: 1, xp: 0, coins: 20, dex: {} };
  it('greets new players with their first goal', () => {
    expect(welcomeText('Ana', fresh)).toEqual({ title: 'Welcome to Lakeside', line: 'First goal: catch a fish, then sell it at the stall' });
  });
  it('points returning players below the casino level at the casino', () => {
    const t = welcomeText('Ana', { level: 12, xp: 5, coins: 1240, dex: { [FISH[0].id]: {} } });
    expect(t.title).toBe('~ Welcome back, Ana ~');
    expect(t.line).toBe('Lv 12 · 1,240 coins · next goal: Lv 15 casino');
  });
  it('counts the missing Fishdex species once the casino is open', () => {
    const t = welcomeText('Ana', { level: 20, xp: 0, coins: 5, dex: { [FISH[0].id]: {} } });
    expect(t.line).toBe(`Lv 20 · 5 coins · next goal: ${FISH.length - 1} more Fishdex species`);
    const all = Object.fromEntries(FISH.map((f) => [f.id, {}]));
    expect(welcomeText('Ana', { level: 20, xp: 0, coins: 5, dex: all }).line).toContain('Fishdex complete');
  });
});
