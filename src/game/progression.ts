import {
  FISH, POND_FISH, RARITY_VALUE, SEA_VALUE, RARITY_WEIGHT, RARITY_XP, RODS,
  type Fish, type Rod, type Bait,
} from '../data/content';

import { CASINO_LEVEL } from '../data/casino';
import { cosById } from '../data/cosmetics';
import { RANKS, nextRank, type Rank } from '../data/ranks';
import { SMOKE_LEVEL } from '../data/smokehouse';
import { onDock } from './env';

/** There is no level cap: from this level on every level costs the same, so the pace never slows. */
export const FLAT_LEVEL = 50;

export type SpotId = 'prime' | 'pier' | 'shore';

export interface SpotRule {
  label: string;
  /** Multiplies rod/bait luck. */
  luck: number;
  /** Multiplies the wait for a bite. */
  wait: number;
  /** Top tiers (below your bait tier) that do not bite here. */
  cut: number;
}

/** Where you stand matters: the pier head is prime water, the shore is a poor place to fish. */
export const SPOTS: Record<SpotId, SpotRule> = {
  prime: { label: 'Prime fishing spot', luck: 1, wait: 1, cut: 0 },
  pier: { label: 'Inner pier - fish bite less here', luck: 0.7, wait: 1.25, cut: 0 },
  shore: { label: 'Poor spot - go to the pier!', luck: 0.35, wait: 1.7, cut: 1 },
};

/** Z of the line that separates the outer pier (prime) from the inner pier. */
export const PRIME_Z = 5.4;

export function fishingSpot(x: number, z: number): SpotId {
  if (!onDock(x, z)) return 'shore';
  return z <= PRIME_Z ? 'prime' : 'pier';
}

export const xpForNextLevel = (level: number): number => Math.round(10 * Math.pow(Math.min(level, FLAT_LEVEL), 1.5));

/** XP from level 1 to `FLAT_LEVEL`. */
export const XP_TO_FLAT = Array.from({ length: FLAT_LEVEL - 1 }, (_, i) => xpForNextLevel(i + 1)).reduce((a, b) => a + b, 0);

export function applyXp(level: number, xp: number, gained: number): { level: number; xp: number; leveledUp: boolean } {
  let lvl = level;
  let total = xp + gained;
  let leveledUp = false;
  while (total >= xpForNextLevel(lvl)) {
    total -= xpForNextLevel(lvl);
    lvl++;
    leveledUp = true;
  }
  return { level: lvl, xp: total, leveledUp };
}

/** Free rewards for levels past `FLAT_LEVEL`. Provisions become dishes once the Kitchen is open (`serveGifts`); fares wait for the charters. */
export interface Gifts {
  /** Dishes: one per level past 50, banked until the Kitchen opens. */
  provisions: number;
  /** Charter fares: one every 5th level past 50. */
  fares: number;
}

/** The gifts for going from level `from` to `to`. */
export function levelGifts(from: number, to: number): Gifts {
  const past = (l: number) => Math.max(0, l - FLAT_LEVEL);
  return { provisions: past(to) - past(from), fares: Math.floor(past(to) / 5) - Math.floor(past(from) / 5) };
}

/**
 * Gives every rank's title and outfit up to the player's level that they don't have yet, and
 * returns the newly reached ranks. Safe to call again: nothing is given twice.
 */
export function grantRanks(s: { level: number; titles: string[]; owned: string[] }): Rank[] {
  const fresh: Rank[] = [];
  for (const r of RANKS) {
    if (r.level > s.level || s.titles.includes(r.id)) continue;
    s.titles.push(r.id);
    if (r.outfit && !s.owned.includes(r.outfit)) s.owned.push(r.outfit);
    fresh.push(r);
  }
  return fresh;
}

/** "Bosun + Oilskin Sou'wester": a rank's title and, if it has one, its outfit. */
export const rankReward = (r: Rank): string => (r.outfit ? `${r.title} + ${cosById(r.outfit)?.name ?? r.outfit}` : r.title);

/**
 * Every catch's XP, estimated from the Fishdex counts: a mid-size catch of each species, with the
 * daytime shiny chance (nights and Shiny Lures add more, so it still comes out low) and the double XP
 * of each species' first catch.
 */
export function earnedXp(dex: Record<string, { count: number }>): number {
  let total = 0;
  for (const f of FISH) {
    const n = dex[f.id]?.count ?? 0;
    const mid = catchXp(f, (f.minSize + f.maxSize) / 2, false);
    if (n > 0) total += n * mid * (1 + 2 * SHINY_CHANCE) + mid;
  }
  return Math.round(total);
}

/** Bumped when `backPayXp` changes, so unpaid estimates are redone (see `migrate`). */
export const BACKPAY_VERSION = 2;

/** XP gained past level 50, by a save that has passed it. */
export const xpPastFlat = (s: { level: number; xp: number }): number => Math.max(0, s.level - FLAT_LEVEL) * xpForNextLevel(FLAT_LEVEL) + (s.level >= FLAT_LEVEL ? s.xp : 0);

/**
 * Before the cap was lifted, XP past level 50 was thrown away. This is what the Fishdex says was
 * earned, less the XP it takes to reach 50 and the XP already counted past it (`since`).
 */
export function backPayXp(dex: Record<string, { count: number }>, since = 0): number {
  return Math.max(0, earnedXp(dex) - XP_TO_FLAT - since);
}

/** The best tier of fish you can hook is set by the bait; the rod only decides how hard the fight is. */
export const gearTier = (_rod: Rod, bait: Bait): number => bait.tier;

/** Extra fight difficulty for every tier a fish is above your rod. */
export const UNDERGEAR_PENALTY = 0.35;

/** How hard a hooked fish fights: its stamina, softened by a better rod and made much worse by an under-tier one. */
export function reelDifficulty(fish: Fish, rod: Rod, shiny = false): number {
  const gap = Math.max(0, fish.tier - rod.tier);
  const d = ((fish.stamina * (shiny ? SHINY_DIFFICULTY : 1)) / Math.pow(rod.control, 0.45)) * (1 + UNDERGEAR_PENALTY * gap);
  return Math.round(Math.min(3.2, Math.max(0.4, d)) * 100) / 100;
}

export function difficultyLabel(d: number): string {
  return d < 0.7 ? 'Easy' : d < 1.0 ? 'Gentle' : d < 1.25 ? 'Medium' : d < 1.5 ? 'Hard' : 'Brutal';
}

export function canCatch(fish: Fish, locationId: string, rod: Rod, bait: Bait, night = false): boolean {
  return fish.locations.includes(locationId) && fish.tier <= gearTier(rod, bait) && (!fish.night || night);
}

export function eligibleFish(locationId: string, rod: Rod, bait: Bait, night = false): Fish[] {
  return FISH.filter((f) => canCatch(f, locationId, rod, bait, night));
}

/**
 * Fish below your gear tier turn up less often (×0.3 per tier below), so each upgrade visibly
 * shifts what you catch: with top gear about 1 in 5 catches is still a tier 1-2 fish.
 */
export const OUTGROWN = 0.3;

/** Luck multiplier for a perfect cast; it also drops the lowest tiers from the pool. */
export const PERFECT_LUCK = 2;

/** Power-meter window (0-1) that counts as a perfect cast. */
export const PERFECT_MIN = 0.86;
export const PERFECT_MAX = 0.96;

/** After dark, rare fish bite far more often and night-only fish join the pool. */
export const NIGHT_LUCK = 1.8;
export const NIGHT_FISH_BOOST = 2;

/** Non-common weights are boosted by rod and bait luck. */
export function pickFish(pool: Fish[], rod: Rod, bait: Bait, rng: () => number = Math.random, perfect = false, spot: SpotId = 'prime', night = false, nightBoost = 1): Fish | null {
  const rule = SPOTS[spot];
  const g = Math.max(1, gearTier(rod, bait) - rule.cut);
  const capped = pool.filter((f) => f.tier <= g);
  if (capped.length > 0) pool = capped;
  if (perfect) {
    // A perfect cast reaches the better water: only the top two tiers of the pool remain.
    const high = pool.filter((f) => f.tier >= g - 1);
    if (high.length > 0) pool = high;
  }
  if (pool.length === 0) return null;
  const luck = rod.luck * bait.luck * rule.luck * (perfect ? PERFECT_LUCK : 1) * (night ? NIGHT_LUCK * nightBoost : 1);
  const weights = pool.map(
    (f) =>
      (f.tier === 1 ? RARITY_WEIGHT.common : RARITY_WEIGHT[f.rarity] * luck) *
      (night && f.night ? NIGHT_FISH_BOOST : 1) *
      Math.pow(OUTGROWN, Math.max(0, g - f.tier)),
  );
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

export function rollSize(fish: Fish, rng: () => number = Math.random): number {
  const t = (rng() + rng()) / 2; // bias toward the middle
  return Math.round((fish.minSize + t * (fish.maxSize - fish.minSize)) * 10) / 10;
}

const sizeRatio = (fish: Fish, size: number) => (size - fish.minSize) / Math.max(1, fish.maxSize - fish.minSize);

/** Where a catch's weight falls between the species' lightest and heaviest (0..1). */
const weightRatio = (fish: Fish, size: number) => {
  const cube = (x: number) => Math.pow(x / fish.maxSize, 3);
  return Math.min(1, Math.max(0, (cube(size) - cube(fish.minSize)) / (1 - cube(fish.minSize))));
};

/** Chance that any hooked fish is a shiny, and how much more a shiny is worth. */
export const SHINY_CHANCE = 0.05;
export const SHINY_CHANCE_NIGHT = 0.15;
export const SHINY_VALUE = 5;
export const SHINY_DIFFICULTY = 1.4;

export function sellValue(fish: Fish, size: number, shiny = false): number {
  return Math.max(1, Math.round(fish.baseValue * (fish.sea ? SEA_VALUE : RARITY_VALUE[fish.rarity]) * (0.5 + weightRatio(fish, size)) * (shiny ? SHINY_VALUE : 1)));
}

export function catchXp(fish: Fish, size: number, firstCatch: boolean, shiny = false): number {
  return Math.round(5 * RARITY_XP[fish.rarity] * (1 + sizeRatio(fish, size) * 0.5) * (firstCatch ? 2 : 1) * (shiny ? 3 : 1));
}

/** Next unlock, for the "next goal" HUD hint: the next rod, then the next rank and its reward. */
export function nextGoal(level: number, dex: Record<string, unknown> = {}): string {
  const rod = RODS.find((r) => r.unlockLevel > level);
  if (level < SMOKE_LEVEL) return `Level ${SMOKE_LEVEL}: Mags's Smokehouse opens${rod?.unlockLevel === SMOKE_LEVEL ? ` and the ${rod.name} becomes available` : ''}`;
  if (rod) return `Level ${rod.unlockLevel}: the ${rod.name} becomes available`;
  const rank = nextRank(level);
  if (rank) return `Level ${rank.level}: ${rankReward(rank)}`;
  const missing = POND_FISH.filter((f) => !dex[f.id]).length;
  return missing ? `Complete your Fishdex! (${missing} to go)` : 'Fishdex complete! Chase shinies and casino perks';
}

/** A save that has never caught a fish or earned xp: the player is brand new. */
export function isFreshSave(s: { level: number; xp: number; dex: Record<string, unknown> }): boolean {
  return s.level <= 1 && s.xp <= 0 && Object.keys(s.dex).length === 0;
}

/** The headline and progress line of the banner shown when a player joins. */
export function welcomeText(
  name: string,
  s: { level: number; xp: number; coins: number; dex: Record<string, unknown> },
): { title: string; line: string } {
  if (isFreshSave(s)) return { title: 'Welcome to Lakeside', line: 'First goal: catch a fish, then sell it at the stall' };
  const missing = POND_FISH.filter((f) => !s.dex[f.id]).length;
  const rank = nextRank(s.level);
  const goal =
    s.level < CASINO_LEVEL ? `next goal: Lv ${CASINO_LEVEL} casino`
    : rank ? `next goal: Lv ${rank.level} ${rank.title}`
    : missing ? `next goal: ${missing} more Fishdex species`
    : 'Fishdex complete · chase shinies';
  return {
    title: `~ Welcome back${name ? `, ${name}` : ''} ~`,
    line: `Lv ${s.level} · ${s.coins.toLocaleString('en-US')} coins · ${goal}`,
  };
}

/** Weight in kg grows with the cube of length, topping out at the species' maxWeight. */
export function fishWeight(fish: Fish, size: number): number {
  return Math.max(0.01, Math.round(fish.maxWeight * Math.pow(size / fish.maxSize, 3) * 100) / 100);
}

export function formatWeight(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(kg < 10 ? 2 : 1)} kg`;
}
