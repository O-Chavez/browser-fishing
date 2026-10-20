import { describe, expect, it } from 'vitest';
import { FISH } from '../data/content';
import { TIER_BOOST, carryScale, dropScale, hangLen, heldScale, remoteHang, remoteScale, softCap, tierScale, waterScale } from './fishscale';

type View = (cm: number, tier: number) => number;
const VIEWS: Record<string, View> = { tierScale, waterScale, heldScale, carryScale, remoteScale, dropScale };

/** Smallest and largest drawn size of any species in each tier. */
function range(view: View): { lo: number; hi: number }[] {
  return [1, 2, 3, 4, 5].map((tier) => {
    const fish = FISH.filter((f) => f.tier === tier);
    return {
      lo: Math.min(...fish.map((f) => view(f.minSize, tier))),
      hi: Math.max(...fish.map((f) => view(f.maxSize, tier))),
    };
  });
}

describe('fish scale by tier', () => {
  it('boosts higher tiers more', () => {
    for (let i = 1; i < TIER_BOOST.length; i++) expect(TIER_BOOST[i]).toBeGreaterThanOrEqual(TIER_BOOST[i - 1]);
    expect(TIER_BOOST[4]).toBeGreaterThan(TIER_BOOST[3]);
    expect(TIER_BOOST[3]).toBeGreaterThan(TIER_BOOST[2]);
  });

  for (const [name, view] of Object.entries(VIEWS)) {
    it(`${name}: each tier's smallest and biggest fish are bigger than the tier below's`, () => {
      const r = range(view);
      for (let t = 1; t < 5; t++) {
        expect(r[t].lo, `tier ${t + 1} smallest`).toBeGreaterThan(r[t - 1].lo);
        expect(r[t].hi, `tier ${t + 1} biggest`).toBeGreaterThan(r[t - 1].hi);
      }
    });
  }

  it('soft cap keeps order and never passes the max', () => {
    let prev = 0;
    for (let x = 0; x < 20; x += 0.05) {
      const y = softCap(x, 2, 3);
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeLessThan(3);
      prev = y;
    }
    expect(softCap(1.5, 2, 3)).toBe(1.5);
  });

  it('top tiers are bigger than before the caps were reworked', () => {
    // Old caps: held 2.8, carried 0.24, other players and drops 1.1, reached by every tier 4-5 fish.
    const biggest = FISH.find((f) => f.id === 'constellation')!;
    expect(heldScale(biggest.maxSize, 5)).toBeGreaterThan(3);
    expect(carryScale(biggest.maxSize, 5)).toBeGreaterThan(0.28);
    expect(remoteScale(biggest.maxSize, 5)).toBeGreaterThan(1.3);
    expect(dropScale(biggest.maxSize, 5)).toBeGreaterThan(1.5);
  });
});

describe('big fish stay clear of the ground', () => {
  it('a dangling catch fits between the rod tip and the dock', () => {
    // The raised rod tip sits about 3.4 m above the planks you stand on.
    for (const f of FISH) {
      const s = heldScale(f.maxSize, f.tier);
      expect(hangLen(s) + s, f.id).toBeLessThanOrEqual(3.45);
    }
  });

  it("another player's catch hangs above the ground", () => {
    // Their rod tip is about 1.7 m up.
    for (const f of FISH) {
      const s = remoteScale(f.maxSize, f.tier);
      expect(1.7 - remoteHang(s) - s, f.id).toBeGreaterThan(0.08);
    }
  });
});
