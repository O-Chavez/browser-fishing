import { describe, expect, it } from 'vitest';
import { BAITS, FISH, RODS, byId } from '../data/content';
import { applyXp, canCatch, eligibleFish, pickFish, reelDifficulty, rollSize, sellValue, xpForNextLevel } from './progression';

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
      const ok = RODS.some((r) => BAITS.some((b) => f.locations.some((l) => canCatch(f, l, r, b))));
      expect(ok, f.id).toBe(true);
    }
  });
});

import { fishWeight, formatWeight } from './progression';
import { FISH as ALL_FISH } from '../data/content';

describe('fish weight', () => {
  it('increases with size and scales value', () => {
    const carp = ALL_FISH.find((f) => f.id === 'carp')!;
    expect(fishWeight(carp, 60)).toBe(12);
    expect(fishWeight(carp, 40)).toBeLessThan(fishWeight(carp, 50));
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
    expect(matched[4]).toBeLessThan(1.7);
  });
  it('bait sets what you can hook; an under-tier rod makes the fight much harder', () => {
    expect(canCatch(FISH.find((f) => f.tier === 3)!, 'pond', RODS[0], BAITS[2])).toBe(true);
    const f = FISH.find((x) => x.tier === 3)!;
    const weak = reelDifficulty(f, RODS[0]);
    const matched = reelDifficulty(f, RODS[2]);
    expect(weak).toBeGreaterThan(matched * 1.5);
  });
});
