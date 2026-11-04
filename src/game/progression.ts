import {
  DEEP_SEA_ROD, FISH, POND_FISH, RARITY_VALUE, SEA_VALUE, RARITY_WEIGHT, RARITY_XP, RODS,
  type Fish, type Rod, type Bait, type Line,
} from '../data/content';
import type { Gaps } from './reel';

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

/** A hooked fish's strength and weight, in tiers: a pond fish's tier on both, a sea fish's from how far out (`seaFishTiers`). */
export interface FishTiers {
  strength: number;
  weight: number;
}

/** The gear's, in tiers: the line answers strength and the rod weight, one to one (a sea level is a share of a tier, `seaGearTiers`). */
export interface GearTiers {
  line: number;
  rod: number;
}

/**
 * The one formula, pond and sea (REELING.md, "The foundation"; Oscar, 2026-11-02): each gap is the fish's stat over the
 * gear's that answers it. One tier is one rung.
 */
export const gapsOf = (fish: FishTiers, gear: GearTiers): Gaps => ({ strength: fish.strength - gear.line, weight: fish.weight - gear.rod });

/**
 * A hooked pond fish against the gear (`gapsOf`): its strength and weight are its tier, as are a line's strength and a
 * rod's. Nothing else about the fish counts for now: species, size, a shiny, Feisty or Brutish and the gloves are
 * left off the foundation, to come back as modifiers on top if they're wanted (Oscar, 2026-11-02).
 */
export function fightGaps(fish: Fish, rod: Rod, line: Line): Gaps {
  return gapsOf({ strength: fish.tier, weight: fish.tier }, { line: line.tier, rod: rod.tier });
}

/**
 * The first modifiers on top of the foundation, pond and sea (REELING.md, "The sea mapping"; Oscar, 2026-11-03): each
 * fish rolls its strength and its weight separately, up to `FISH_SPREAD` of a tier either way.
 */
export const FISH_SPREAD = 0.15;

/** Whole rungs over the gear, give or take a fish's spread, so a pond fish a tier over always reads as one. */
export const rungsOver = (gap: number): number => Math.floor(gap + FISH_SPREAD);

/** Which gear a fight is over, pond and sea alike, for the loss card: a rung or more over it. */
export const overGear = (g: Gaps): { rod: boolean; line: boolean } => ({ rod: rungsOver(g.weight) >= 1, line: rungsOver(g.strength) >= 1 });

/** A fish a rung or more under the gear on both axes, give or take its spread: "An easy one" on the hook toast (Oscar, 2026-11-03). */
export const underGear = (g: Gaps): boolean => rungsOver(-g.strength) >= 1 && rungsOver(-g.weight) >= 1;

/**
 * The matchup in words, for the hook toast and the sea sticker (Oscar, 2026-11-03): a rung over is "strong for your
 * line" or "heavy for your rod", two or more "too strong" or "too heavy", so the bigger problem reads as one. Empty
 * when the gear handles the fish; `too` when either axis is two or more over.
 */
export function matchupWords(g: Gaps): { words: string; too: boolean } {
  const say = (gap: number, a: string, gear: string) => (rungsOver(gap) >= 2 ? `too ${a} for your ${gear}` : rungsOver(gap) >= 1 ? `${a} for your ${gear}` : '');
  const words = [say(g.strength, 'strong', 'line'), say(g.weight, 'heavy', 'rod')].filter(Boolean).join(', ');
  return { words: words && words[0].toUpperCase() + words.slice(1), too: rungsOver(g.strength) >= 2 || rungsOver(g.weight) >= 2 };
}

/** A fish stronger (Feisty) or heavier (Brutish) than others of its kind, named on the hook toast and the badge (REELING.md, "Temperament"). */
export type FishTag = 'feisty' | 'brutish';
/** How often a fish carries a tag, pond and sea. */
export const TAG_CHANCE = 1 / 8;
/**
 * Tiers a tag adds to its axis (Oscar, 2026-11-03): a change you notice in the fight, not a lost fish. Feisty is
 * smaller, since a careful player's strength limit is a cliff at the red's edge (Brutish +0.5 only lengthens the fight).
 */
export const TAG_TIERS: Record<FishTag, number> = { feisty: 0.25, brutish: 0.5 };

/**
 * Rolls a Feisty (strength) or Brutish (weight) tag, one fish in `TAG_CHANCE`, on any fish (Oscar, 2026-11-03): at the
 * frontier too, since tags that stopped where the gear strains would make pushing past it easier.
 */
export function rollTag(rng: () => number): FishTag | null {
  if (rng() >= TAG_CHANCE) return null;
  return rng() < 0.5 ? 'feisty' : 'brutish';
}

const hundredths = (x: number) => Math.round(x * 100) / 100;

/** A hooked fish's gaps with its modifiers: maybe a tag (`rollTag`), then its own spread on each axis (`FISH_SPREAD`). */
export function rollFishGaps(g: Gaps, rng: () => number): { d: Gaps; tag: FishTag | null } {
  const tag = rollTag(rng);
  const spread = () => (2 * rng() - 1) * FISH_SPREAD;
  return {
    d: {
      strength: hundredths(g.strength + (tag === 'feisty' ? TAG_TIERS.feisty : 0) + spread()),
      weight: hundredths(g.weight + (tag === 'brutish' ? TAG_TIERS.brutish : 0) + spread()),
    },
    tag,
  };
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
