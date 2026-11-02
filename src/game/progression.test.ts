import { describe, expect, it } from 'vitest';
import { BAITS, FISH, LINES, POND_FISH, RODS, SEA_FISH, byId } from '../data/content';
import { mulberry } from './env';
import { FLAT_LEVEL, SHINY_DIFFICULTY, STRENGTH_STEP, TAG_BOOST, TIER_DOWN, WEIGHT_STEP, XP_TO_FLAT, applyXp, backPayXp, canCatch, catchXp, earnedXp, xpPastFlat, eligibleFish, grantRanks, levelGifts, nextGoal, pickFish, reelDifficulty, rollSize, rollTag, sellValue, welcomeText, xpForNextLevel } from './progression';

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
      const lo = Math.min(...POND_FISH.filter((f) => f.tier === t + 1).map((f) => sellValue(f, f.minSize)));
      const hi = Math.max(...POND_FISH.filter((f) => f.tier === t).map((f) => sellValue(f, f.maxSize)));
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
  const lineOfTier = (t: number) => LINES[t - 1];
  it('matched gear: the tiers climb gently, and the pace follows the fish', () => {
    const matched = [1, 2, 3, 4, 5].map((t) => {
      const fish = FISH.filter((x) => x.tier === t && !x.sea);
      const rod = RODS.find((r) => r.tier === t)!;
      const ds = fish.map((x) => reelDifficulty(x, rod, lineOfTier(t)));
      for (const d of ds) {
        expect(d.weight).toBe(d.pace);
        expect(d.strength).toBe(d.pace);
      }
      return ds.reduce((a, x) => a + x.pace!, 0) / ds.length;
    });
    for (let i = 1; i < matched.length; i++) expect(matched[i]).toBeGreaterThan(matched[i - 1]);
    expect(matched[4]).toBeLessThan(2.0);
  });
  it('the rod moves only the weight axis, the line only the strength axis', () => {
    const f = FISH.find((x) => x.tier === 3)!;
    const base = reelDifficulty(f, RODS[2], lineOfTier(3));
    const weakRod = reelDifficulty(f, RODS[0], lineOfTier(3));
    expect(weakRod.weight).toBeCloseTo(base.weight * WEIGHT_STEP[2], 1);
    expect(weakRod.strength).toBe(base.strength);
    expect(weakRod.pace).toBe(base.pace);
    const weakLine = reelDifficulty(f, RODS[2], lineOfTier(1));
    expect(weakLine.strength).toBeCloseTo(base.strength * STRENGTH_STEP[2], 1);
    expect(weakLine.weight).toBe(base.weight);
    const strongRod = reelDifficulty(f, RODS[4], lineOfTier(3));
    expect(strongRod.weight).toBeCloseTo(base.weight * TIER_DOWN * TIER_DOWN, 1);
    expect(strongRod.strength).toBe(base.strength);
  });
  it('bait sets what you can hook; an under-tier rod makes the fight much longer', () => {
    expect(canCatch(FISH.find((f) => f.tier === 3)!, 'pond', RODS[0], BAITS[2])).toBe(true);
  });
  it('bigger fish of a species are heavier, not stronger: x0.85 for the smallest up to x1.15 for the largest', () => {
    const f = FISH.find((x) => x.id === 'aurorapike')!;
    const rod = RODS.find((r) => r.id === 'aurora')!;
    const mid = reelDifficulty(f, rod, lineOfTier(5));
    const small = reelDifficulty(f, rod, lineOfTier(5), false, f.minSize);
    const big = reelDifficulty(f, rod, lineOfTier(5), false, f.maxSize);
    expect(small.weight).toBeCloseTo(mid.weight * 0.85, 1);
    expect(big.weight).toBeCloseTo(mid.weight * 1.15, 1);
    expect(small.strength).toBe(mid.strength);
    expect(big.strength).toBe(mid.strength);
    expect(reelDifficulty(f, rod, lineOfTier(5), false, (f.minSize + f.maxSize) / 2)).toEqual(mid);
  });
  it('a shiny or a tag lengthens a fight on gear that handles the fish, and never pushes it over a wall', () => {
    const f = FISH.find((x) => x.id === 'pike')!;
    const base = reelDifficulty(f, RODS[2], lineOfTier(3));
    expect(reelDifficulty(f, RODS[2], lineOfTier(3), true).weight).toBeCloseTo(base.weight * SHINY_DIFFICULTY, 1);
    expect(reelDifficulty(f, RODS[2], lineOfTier(3), true).strength).toBe(base.strength);
    // Over the rod, a shiny fights like a plain fish of its size.
    expect(reelDifficulty(f, RODS[1], lineOfTier(3), true)).toEqual(reelDifficulty(f, RODS[1], lineOfTier(3)));
    expect(reelDifficulty(f, RODS[2], lineOfTier(3), false, undefined, 'brutish').weight).toBeCloseTo(base.weight * TAG_BOOST, 1);
    expect(reelDifficulty(f, RODS[2], lineOfTier(3), false, undefined, 'feisty').strength).toBeCloseTo(base.strength * TAG_BOOST, 1);
    expect(reelDifficulty(f, RODS[2], lineOfTier(3), false, undefined, 'feisty').weight).toBe(base.weight);
    // The largest tier 5 fish a tier over the rod stays inside the long-fight band; a Feisty matched fish stays under the red.
    const top = FISH.filter((x) => x.tier === 5 && !x.sea);
    for (const t of top) {
      expect(reelDifficulty(t, RODS[3], lineOfTier(5), true, t.maxSize).weight).toBeLessThan(3.5);
      expect(reelDifficulty(t, RODS[4], lineOfTier(5), false, undefined, 'feisty').strength).toBeLessThan(2.5);
    }
  });
  it('tags roll one fish in eight, and only on an axis the gear already handles', () => {
    const f = FISH.find((x) => x.id === 'pike')!;
    const count = (rod: number, line: number) => {
      const rng = mulberry(7);
      const n = { feisty: 0, brutish: 0, none: 0 };
      for (let i = 0; i < 4000; i++) n[rollTag(f, RODS[rod - 1], lineOfTier(line), rng) ?? 'none']++;
      return n;
    };
    const matched = count(3, 3);
    expect(matched.feisty + matched.brutish).toBeGreaterThan(4000 / 8 * 0.8);
    expect(matched.feisty + matched.brutish).toBeLessThan(4000 / 8 * 1.2);
    expect(Math.abs(matched.feisty - matched.brutish)).toBeLessThan(120);
    expect(count(2, 3).brutish).toBe(0);
    expect(count(2, 3).feisty).toBeGreaterThan(0);
    expect(count(3, 2).feisty).toBe(0);
    expect(count(3, 2).brutish).toBeGreaterThan(0);
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
  it('names the next rank once the casino is open', () => {
    const t = welcomeText('Ana', { level: 20, xp: 0, coins: 5, dex: { [FISH[0].id]: {} } });
    expect(t.line).toBe('Lv 20 · 5 coins · next goal: Lv 25 Bosun');
  });
  it('counts the missing Fishdex species past the last rank', () => {
    const t = welcomeText('Ana', { level: 200, xp: 0, coins: 5, dex: { [FISH[0].id]: {} } });
    expect(t.line).toBe(`Lv 200 · 5 coins · next goal: ${POND_FISH.length - 1} more Fishdex species`);
    // Sea fish are a separate page: a complete pond Fishdex stays complete.
    const all = Object.fromEntries(POND_FISH.map((f) => [f.id, {}]));
    expect(welcomeText('Ana', { level: 200, xp: 0, coins: 5, dex: all }).line).toContain('Fishdex complete');
  });
});

describe('levels past 50 and ranks', () => {
  it('has no cap: every level from 50 on costs the same', () => {
    const step = xpForNextLevel(FLAT_LEVEL);
    expect(xpForNextLevel(80)).toBe(step);
    expect(xpForNextLevel(49)).toBeLessThan(step);
    expect(applyXp(FLAT_LEVEL, 0, step * 3 + 7)).toEqual({ level: FLAT_LEVEL + 3, xp: 7, leveledUp: true });
  });
  it('gives a provision every level past 50 and a fare every 5th', () => {
    expect(levelGifts(10, 50)).toEqual({ provisions: 0, fares: 0 });
    expect(levelGifts(49, 61)).toEqual({ provisions: 11, fares: 2 });
    expect(levelGifts(54, 55)).toEqual({ provisions: 1, fares: 1 });
  });
  it('gives each rank title and outfit once', () => {
    const s = { level: 37, titles: [] as string[], owned: ['cap'] };
    expect(grantRanks(s).map((r) => r.id)).toEqual(['deckhand', 'bosun', 'firstmate', 'skipper']);
    expect(s.owned).toEqual(['cap', 'souwester', 'slicker']);
    expect(grantRanks(s)).toEqual([]);
    s.level = 40;
    expect(grantRanks(s).map((r) => r.id)).toEqual(['captain']);
  });
  it('points at the next rank and its outfit after the last rod', () => {
    expect(nextGoal(20)).toBe("Level 25: Bosun + Oilskin Sou'wester");
    expect(nextGoal(25)).toBe('Level 30: First Mate');
    expect(nextGoal(50)).toBe('Level 60: Fleet Admiral');
    expect(nextGoal(50, {}, false)).toBe('Level 60: Fleet Admiral');
    expect(nextGoal(50, {}, true)).toBe("Take a charter: Captain Reed's seaplane, west beach");
    expect(welcomeText('Ana', { level: 50, xp: 0, coins: 5, dex: { [FISH[0].id]: {} } }, true).line).toContain('a charter with Captain Reed');
  });
  it('names the Deep Sea Rod after the Aurora Rod, until it is bought, while charters are open', () => {
    expect(nextGoal(12, {}, false, false, true)).toBe('Level 15: the Aurora Rod becomes available');
    expect(nextGoal(16, {}, false, false, true)).toBe("Level 20: the Deep Sea Rod, for Captain Reed's charters");
    expect(nextGoal(16, {}, false, false, false)).toBe(nextGoal(16));
    expect(nextGoal(20, {}, false, false, true)).toBe("The Deep Sea Rod at the stall: it opens Captain Reed's charters");
    expect(nextGoal(20, {}, false, true, true)).toBe("Level 25: Bosun + Oilskin Sou'wester");
    expect(nextGoal(20, {}, true, true, true)).toBe("Take a charter: Captain Reed's seaplane, west beach");
  });
  it('estimates thrown-away XP from Fishdex counts, low and never negative', () => {
    expect(backPayXp({ [FISH[0].id]: { count: 10 } })).toBe(0);
    const eel = byId(FISH, 'constellation');
    const n = 2000;
    const mid = catchXp(eel, (eel.minSize + eel.maxSize) / 2, false);
    // Daytime shinies triple 5% of catches, and the first catch is double.
    const earned = Math.round(n * mid * 1.1 + mid);
    expect(earnedXp({ [eel.id]: { count: n } })).toBe(earned);
    expect(backPayXp({ [eel.id]: { count: n } })).toBe(earned - XP_TO_FLAT);
    expect(backPayXp({ [eel.id]: { count: n } }, 5000)).toBe(earned - XP_TO_FLAT - 5000);
  });
  it('counts XP past 50 only for saves past it', () => {
    expect(xpPastFlat({ level: 49, xp: 900 })).toBe(0);
    expect(xpPastFlat({ level: 50, xp: 900 })).toBe(900);
    expect(xpPastFlat({ level: 52, xp: 10 })).toBe(2 * xpForNextLevel(50) + 10);
  });
});

describe('sea fish', () => {
  const shelf = SEA_FISH.filter((f) => f.locations.includes('shelf'));
  const dropoff = SEA_FISH.filter((f) => f.locations.includes('dropoff'));
  const mid = (f: (typeof FISH)[number]) => sellValue(f, (f.minSize + f.maxSize) / 2);
  const commons = (list: typeof FISH) => list.filter((f) => f.baseValue < 300);

  it('has three species at the Shelf and three at the Drop-off, each tier 5', () => {
    expect(shelf.map((f) => f.id)).toEqual(['pewtercod', 'snapper', 'grouper']);
    expect(dropoff.map((f) => f.id)).toEqual(['galemackerel', 'irontuna', 'marlin']);
    expect(SEA_FISH.every((f) => f.tier === 5 && f.sea)).toBe(true);
  });
  it('sells at base value x10 (not the tier 5 x50) with the usual size factor', () => {
    const cod = byId(FISH, 'pewtercod');
    expect(sellValue(cod, cod.minSize)).toBe(Math.round(140 * 10 * 0.5));
    expect(sellValue(cod, cod.maxSize)).toBe(Math.round(140 * 10 * 1.5));
    expect(sellValue(cod, cod.maxSize, true)).toBeGreaterThan(sellValue(cod, cod.maxSize));
  });
  it('a typical catch is about 1,500 at the Shelf and 2,000 at the Drop-off', () => {
    // Mean sale value over rolled sizes (seeded), per species. A random mix with the legend about one catch in ten lands near the targets.
    let seed = 7;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const mean = (f: (typeof FISH)[number]) => { let t = 0; for (let i = 0; i < 4000; i++) t += sellValue(f, rollSize(f, rng)); return t / 4000; };
    const common = (list: typeof FISH) => commons(list).reduce((a, f) => a + mean(f), 0) / commons(list).length;
    const mixed = (list: typeof FISH) => 0.9 * common(list) + 0.1 * mean(list.find((f) => f.baseValue >= 300)!);
    expect(mixed(shelf)).toBeGreaterThan(1400);
    expect(mixed(shelf)).toBeLessThan(1800);
    expect(mixed(dropoff)).toBeGreaterThan(1850);
    expect(mixed(dropoff)).toBeLessThan(2300);
    // The legends are the jackpot.
    expect(mean(byId(FISH, 'grouper'))).toBeGreaterThan(2.5 * common(shelf));
    expect(mean(byId(FISH, 'marlin'))).toBeGreaterThan(2.5 * common(dropoff));
    expect(mid(byId(FISH, 'marlin'))).toBeGreaterThan(mid(byId(FISH, 'grouper')));
  });
  it('are never rolled in the pond or lake, whatever the gear', () => {
    const rod = RODS[RODS.length - 1];
    const bait = BAITS[BAITS.length - 1];
    for (const night of [false, true]) for (const loc of ['pond', 'lake']) {
      const pool = eligibleFish(loc, rod, bait, night);
      expect(pool.some((f) => f.sea)).toBe(false);
      for (let i = 0; i < 500; i++) expect(pickFish(pool, rod, bait, Math.random, i % 2 === 0)!.sea).toBeFalsy();
    }
  });
  it('can be rolled by their own location with top gear', () => {
    const rod = RODS[RODS.length - 1];
    const bait = BAITS[BAITS.length - 1];
    expect(eligibleFish('shelf', rod, bait).map((f) => f.id).sort()).toEqual(shelf.map((f) => f.id).sort());
    expect(eligibleFish('dropoff', rod, bait).map((f) => f.id).sort()).toEqual(dropoff.map((f) => f.id).sort());
    expect(pickFish(eligibleFish('dropoff', rod, bait), rod, bait)!.locations).toContain('dropoff');
  });
});
