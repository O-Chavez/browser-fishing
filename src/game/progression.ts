import {
  DEEP_SEA_ROD, FISH, POND_FISH, RARITY_VALUE, SEA_VALUE, RARITY_WEIGHT, RARITY_XP, RODS,
  type Fish, type Rod, type Bait, type Line,
} from '../data/content';
import type { Difficulty, FightDifficulty } from './reel';

import { CASINO_LEVEL } from '../data/casino';
import { DIVES_OPEN } from '../data/dive';
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

/** Fight difficulty of a typical fish of each tier on gear of the same tier: a light challenge that grows with the tiers. */
export const MATCHED_DIFFICULTY = [1.2, 1.5, 1.6, 1.7, 1.8];

/**
 * The weight axis for each tier a fish is above the rod (REELING.md, "Engine findings"): one tier over makes the
 * fight about twice as long and still landed (×1.5, up to 3.1 with a trophy of tier 5); two tiers over puts even
 * the smallest tier 3 fish past 14, where the run-off is quick at every pace, so the fish takes the line on its own
 * within the time a one-tier fight would have been landed. The numbers are big because drag follows the surge's
 * build-up, which is slow on low-pace fish.
 */
export const WEIGHT_STEP = [1, 1.5, 12, 24, 48];
/**
 * The strength axis for each tier a fish is above the line: one tier over puts the surges in the red for everyone
 * (a fast player still lands about half by giving line); two tiers over, nobody holds it.
 */
export const STRENGTH_STEP = [1, 2.5, 4, 6, 8];
/** Each tier a fish is below the gear on an axis multiplies that axis by this. */
export const TIER_DOWN = 0.85;

/** A fish that rolled far from its species on one axis, named so the player can read it (REELING.md, "Temperament"). */
export type FishTag = 'feisty' | 'brutish';
/** How often a pond fish carries a tag, and how much it adds to that axis. */
export const TAG_CHANCE = 1 / 8;
export const TAG_BOOST = 1.3;

/**
 * Rolls a Feisty (strength) or Brutish (weight) tag, one fish in `TAG_CHANCE`, and only on an axis the gear already
 * handles: a tag never crosses a wall, so a Feisty fish on matched line still can't reach the red.
 */
export function rollTag(fish: Fish, rod: Rod, line: Line, rng: () => number): FishTag | null {
  if (rng() >= TAG_CHANCE) return null;
  const tag: FishTag = rng() < 0.5 ? 'feisty' : 'brutish';
  const over = tag === 'feisty' ? fish.tier > line.tier : fish.tier > rod.tier;
  return over ? null : tag;
}

/** How much a species' stamina sets it apart within its tier: difficulty ×(stamina / the tier's mean)^this. */
export const STAMINA_SPREAD = 0.5;

/** Fight difficulty for a species' smallest catch; its largest is the mirror above (×1.15), a mid-size one ×1. */
export const SIZE_DIFFICULTY = 0.85;

/** What a catch's size does to its weight: ×0.85 for the species' smallest up to ×1.15 for its largest. */
export const sizeDifficulty = (fish: Fish, size: number): number =>
  SIZE_DIFFICULTY + 2 * (1 - SIZE_DIFFICULTY) * Math.min(1, Math.max(0, sizeRatio(fish, size)));

/** Mean stamina of each tier's pond fish. */
const TIER_STAMINA = [1, 2, 3, 4, 5].map((t) => {
  const s = POND_FISH.filter((f) => f.tier === t).map((f) => f.stamina);
  return s.reduce((a, b) => a + b, 0) / s.length;
});

/**
 * How hard a hooked fish fights, on two axes (REELING.md). The base is its tier on matched gear, spread a little by
 * species stamina. **Weight** against the rod steps up by `WEIGHT_STEP` for each tier the fish is above the rod,
 * and carries size, a shiny, a Brutish tag and the rod boost (the gloves raise `control`), so these make a fight
 * longer, never a snap. **Strength** against the line steps up by `STRENGTH_STEP` for each tier above the line and
 * carries a Feisty tag. Each tier below the gear eases that axis by `TIER_DOWN`. The pace is the base, so the
 * fish's twitchiness follows its tier, not the gear. Without a size it's a mid-size fish.
 */
export function reelDifficulty(fish: Fish, rod: Rod, line: Line, shiny = false, size?: number, tag: FishTag | null = null): FightDifficulty {
  const tier = Math.min(5, Math.max(1, fish.tier)) - 1;
  const species = Math.pow(fish.stamina / TIER_STAMINA[tier], STAMINA_SPREAD);
  const base = MATCHED_DIFFICULTY[tier] * species;
  const big = size === undefined ? 1 : sizeDifficulty(fish, size);
  const boost = Math.pow((RODS.find((r) => r.id === rod.id)?.control ?? rod.control) / rod.control, 0.45);
  const step = (gap: number, up: number[]) => (gap > 0 ? up[Math.min(gap, up.length - 1)] : Math.pow(TIER_DOWN, -gap));
  const r = (x: number) => Math.round(Math.max(0.4, x) * 100) / 100;
  return {
    // A shiny fights heavier only on gear that handles it, like a tag: it lengthens a fight, never pushes one over the wall.
    weight: r(base * step(fish.tier - rod.tier, WEIGHT_STEP) * big * boost * (shiny && fish.tier <= rod.tier ? SHINY_DIFFICULTY : 1) * (tag === 'brutish' ? TAG_BOOST : 1)),
    strength: r(base * step(fish.tier - line.tier, STRENGTH_STEP) * (tag === 'feisty' ? TAG_BOOST : 1)),
    pace: r(base),
  };
}

/** The word for a fight on the "Hooked!" toast, from its hardest axis. */
export function difficultyLabel(d: Difficulty): string {
  const x = typeof d === 'number' ? d : Math.max(d.weight, d.strength);
  return x < 1.0 ? 'Easy' : x < 1.4 ? 'Gentle' : x < 1.9 ? 'Medium' : x < 2.4 ? 'Hard' : 'Brutal';
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

/**
 * Next unlock, for the "next goal" HUD hint: a charter once the Deep Sea Rod is owned (`charters`, see
 * `chartersToTry`), the next rod, then the Deep Sea Rod while charters are open and `seaRod` isn't bought, then the
 * next rank and its reward.
 */
export function nextGoal(level: number, dex: Record<string, unknown> = {}, charters = false, seaRod = true, open = DIVES_OPEN): string {
  if (charters) return 'Take a charter: Captain Reed\'s seaplane, west beach';
  const rod = RODS.find((r) => r.unlockLevel > level);
  const sea = open && !seaRod;
  const named = (r: Rod) => (sea && r.unlockLevel === DEEP_SEA_ROD.unlockLevel ? `the ${r.name} and the ${DEEP_SEA_ROD.name} become available` : `the ${r.name} becomes available`);
  if (level < SMOKE_LEVEL) return `Level ${SMOKE_LEVEL}: Mags's Smokehouse opens${rod?.unlockLevel === SMOKE_LEVEL ? ` and ${named(rod)}` : ''}`;
  if (rod) return `Level ${rod.unlockLevel}: ${named(rod)}`;
  if (sea) return level < DEEP_SEA_ROD.unlockLevel ? `Level ${DEEP_SEA_ROD.unlockLevel}: the ${DEEP_SEA_ROD.name}, for Captain Reed's charters` : `The ${DEEP_SEA_ROD.name} at the stall: it opens Captain Reed's charters`;
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
  charters = false,
): { title: string; line: string } {
  if (isFreshSave(s)) return { title: 'Welcome to Lakeside', line: 'First goal: catch a fish, then sell it at the stall' };
  const missing = POND_FISH.filter((f) => !s.dex[f.id]).length;
  const rank = nextRank(s.level);
  const goal =
    charters ? 'next goal: a charter with Captain Reed'
    : s.level < CASINO_LEVEL ? `next goal: Lv ${CASINO_LEVEL} casino`
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
