import { describe, expect, it } from 'vitest';
import { BAITS, FISH, RODS, byId } from '../data/content';
import { applyXp, canCatch, eligibleFish, pickFish, rollSize, sellValue, xpForNextLevel } from './progression';

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

  it('gates fish by the lower of rod and bait tier', () => {
    const koi = byId(FISH, 'koi');
    const minnow = byId(BAITS, 'minnow');
    expect(canCatch(koi, 'pond', twig, minnow)).toBe(false);
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
