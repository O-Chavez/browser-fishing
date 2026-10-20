import {
  FISH, RARITY_VALUE, RARITY_WEIGHT, RARITY_XP, RODS,
  type Fish, type Rod, type Bait,
} from '../data/content';

import { CASINO_LEVEL } from '../data/casino';
import { onDock } from './env';

export const MAX_LEVEL = 50;

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

export const xpForNextLevel = (level: number): number => Math.round(10 * Math.pow(level, 1.5));

export function applyXp(level: number, xp: number, gained: number): { level: number; xp: number; leveledUp: boolean } {
  let lvl = level;
  let total = xp + gained;
  let leveledUp = false;
  while (lvl < MAX_LEVEL && total >= xpForNextLevel(lvl)) {
    total -= xpForNextLevel(lvl);
    lvl++;
    leveledUp = true;
  }
  if (lvl >= MAX_LEVEL) total = 0;
  return { level: lvl, xp: total, leveledUp };
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
  return Math.max(1, Math.round(fish.baseValue * RARITY_VALUE[fish.rarity] * (0.5 + weightRatio(fish, size)) * (shiny ? SHINY_VALUE : 1)));
}

export function catchXp(fish: Fish, size: number, firstCatch: boolean, shiny = false): number {
  return Math.round(5 * RARITY_XP[fish.rarity] * (1 + sizeRatio(fish, size) * 0.5) * (firstCatch ? 2 : 1) * (shiny ? 3 : 1));
}

/** Next unlock, for the "next goal" HUD hint. */
export function nextGoal(level: number, dex: Record<string, unknown> = {}): string {
  const rod = RODS.find((r) => r.unlockLevel > level);
  if (rod) return `Level ${rod.unlockLevel}: the ${rod.name} becomes available`;
  const missing = FISH.filter((f) => !dex[f.id]).length;
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
  const missing = FISH.filter((f) => !s.dex[f.id]).length;
  const goal =
    s.level < CASINO_LEVEL ? `next goal: Lv ${CASINO_LEVEL} casino`
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
