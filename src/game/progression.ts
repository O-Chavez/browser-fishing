import {
  FISH, RARITY_VALUE, RARITY_WEIGHT, RARITY_XP, RODS,
  type Fish, type Rod, type Bait,
} from '../data/content';

export const MAX_LEVEL = 50;

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

/** The best tier of fish your setup can reach: limited by the weaker of rod and bait. */
export const gearTier = (rod: Rod, bait: Bait): number => Math.min(rod.tier, bait.tier);

export function canCatch(fish: Fish, locationId: string, rod: Rod, bait: Bait): boolean {
  return fish.locations.includes(locationId) && fish.tier <= gearTier(rod, bait);
}

export function eligibleFish(locationId: string, rod: Rod, bait: Bait): Fish[] {
  return FISH.filter((f) => canCatch(f, locationId, rod, bait));
}

/** Fish far below your gear tier turn up less often, so upgrading visibly shifts what you catch. */
export const OUTGROWN = 0.55;

/** Non-common weights are boosted by rod and bait luck. */
export function pickFish(pool: Fish[], rod: Rod, bait: Bait, rng: () => number = Math.random): Fish | null {
  if (pool.length === 0) return null;
  const luck = rod.luck * bait.luck;
  const g = gearTier(rod, bait);
  const weights = pool.map(
    (f) => (f.tier === 1 ? RARITY_WEIGHT.common : RARITY_WEIGHT[f.rarity] * luck) * Math.pow(OUTGROWN, Math.max(0, g - f.tier)),
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

/** Chance that any hooked fish is a shiny, and how much more a shiny is worth. */
export const SHINY_CHANCE = 0.05;
export const SHINY_VALUE = 5;
export const SHINY_DIFFICULTY = 1.4;

export function sellValue(fish: Fish, size: number, shiny = false): number {
  return Math.max(1, Math.round(fish.baseValue * RARITY_VALUE[fish.rarity] * (0.5 + sizeRatio(fish, size)) * (shiny ? SHINY_VALUE : 1)));
}

export function catchXp(fish: Fish, size: number, firstCatch: boolean, shiny = false): number {
  return Math.round(5 * RARITY_XP[fish.rarity] * (1 + sizeRatio(fish, size) * 0.5) * (firstCatch ? 2 : 1) * (shiny ? 3 : 1));
}

/** Next unlock, for the "next goal" HUD hint. */
export function nextGoal(level: number): string {
  const rod = RODS.find((r) => r.unlockLevel > level);
  return rod ? `Level ${rod.unlockLevel}: the ${rod.name} becomes available` : 'Complete your Fishdex!';
}

/** Weight in kg grows with the cube of length, topping out at the species' maxWeight. */
export function fishWeight(fish: Fish, size: number): number {
  return Math.max(0.01, Math.round(fish.maxWeight * Math.pow(size / fish.maxSize, 3) * 100) / 100);
}

export function formatWeight(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg.toFixed(kg < 10 ? 2 : 1)} kg`;
}
