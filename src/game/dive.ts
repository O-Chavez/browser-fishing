// Charter rules (Oscar, 2026-11-12: the charters are a place to earn). A charter is fished in one zone; its fish pay
// coins and Black Pearls by zone, each hooked fish uses line off a spool bought with coins, and the Abyss alone has
// markers that get harder and pay more. Nothing is at risk: what a fish pays is the player's as it lands.
// Pure logic for the server and the screens; no Math.pow, so the server and the client agree. Numbers in data/dive.ts.
import { byId, DEEP_SEA_ROD, FISH, type Fish } from '../data/content';
import { ABYSS, BOAT_PARTS, DIVE, LINE, MARKER, PEARLS, RATING, ROD, SEA_TIERS, SPOOL_COINS, ZONES, type Behaviour, type Zone } from '../data/dive';
import { sellValue, type FishTag } from './progression';
import type { Gaps } from './reel';

/** base^n for a whole n ≥ 0, by repeated multiplication (same result in every JS engine, unlike `Math.pow`). */
export function powInt(base: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= base;
  return r;
}

const hundredths = (x: number) => Math.round(x * 100) / 100;

/** A zone index (0 the Shelf ... 4 the Abyss) as a whole number in range. */
export const isZone = (z: unknown): z is number => typeof z === 'number' && Number.isInteger(z) && z >= 0 && z < ZONES.length;

export const zoneOf = (zone: number): Zone => ZONES[Math.max(0, Math.min(ZONES.length - 1, zone))];

/** The marker a charter in this zone fishes at: the Abyss's (at least 1), none (0) anywhere else. */
export const markerIn = (zone: number, marker: number): number => (zone === ABYSS ? Math.max(1, marker) : 0);

/** The Deep Sea Rod's state: its steps (0 to `ROD.steps`) and its Abyss levels past them. */
export interface SeaRod {
  steps: number;
  levels: number;
}

/** A sea fish's tier on both strength and weight (`SEA_TIERS`): by zone, and in the Abyss by marker too. */
export function seaFishTier(zone: number, marker = 1): number {
  const t = SEA_TIERS.harbour + SEA_TIERS.zone * zone;
  return zone === ABYSS ? t + SEA_TIERS.marker * (markerIn(zone, marker) - 1) : t;
}

/** The Deep Sea Rod's tier at sea, on both strength and weight: its own, plus its steps and Abyss levels (`ROD`). */
export const seaRodTier = (rod: SeaRod): number => DEEP_SEA_ROD.tier + ROD.step * rod.steps + ROD.level * rod.levels;

/** A typical fish's gap over the rod here, in tiers, to a hundredth: the same on strength and weight. */
export const seaGap = (zone: number, marker: number, rod: SeaRod): number => hundredths(seaFishTier(zone, marker) - seaRodTier(rod));

/** A sea fight's gaps before the fish's own rolls (`rollFishGaps`): both the typical gap (`seaGap`). */
export function seaGaps(zone: number, marker: number, rod: SeaRod): Gaps {
  const g = seaGap(zone, marker, rod);
  return { strength: g, weight: g };
}

export type Rating = 'easy' | 'fair' | 'tough' | 'over';

/** The words for a rating, as the screens show them. */
export const RATING_NAMES: Record<Rating, string> = { easy: 'Easy', fair: 'Fair', tough: 'Tough', over: 'Too much' };

/** How a gap reads (`RATING`): Easy, Fair, Tough or Too much. */
export function ratingOf(gap: number): Rating {
  const g = hundredths(gap);
  return g <= RATING.easy ? 'easy' : g <= RATING.fair ? 'fair' : g <= RATING.tough ? 'tough' : 'over';
}

/** How a zone (and Abyss marker) reads for this rod: its typical fish's gap (`seaGap`) rated (`ratingOf`). */
export const seaRating = (zone: number, marker: number, rod: SeaRod): Rating => ratingOf(seaGap(zone, marker, rod));

/**
 * The hook card's words for a hooked sea fish, from its own gaps (its spread and tag included): the bigger of the two
 * rated, "Easy for your rod" to "Too much for your rod", and whether it's the last (red).
 */
export function seaFightWords(d: Gaps): { words: string; too: boolean } {
  const r = seaFightRating(d);
  return { words: `${RATING_NAMES[r]} for your rod`, too: r === 'over' };
}

/** A hooked sea fish's own rating: the bigger of its two gaps (`ratingOf`). */
export const seaFightRating = (d: Gaps): Rating => ratingOf(Math.max(d.strength, d.weight));

/**
 * Metres of line a hooked fish uses here (`LINE`), from the typical gap rather than the fish's own rolls: `base` when
 * the fish is no harder than the rod, else `base + perTier·g` rounded. A fish that gets away takes `LINE.lost` more.
 */
export function lineCost(zone: number, marker: number, rod: SeaRod): number {
  const g = seaGap(zone, marker, rod);
  return g <= 0 ? LINE.base : Math.round(LINE.base + LINE.perTier * g);
}

/** Coins for a spool in this zone (`SPOOL_COINS`). */
export const spoolPrice = (zone: number): number => SPOOL_COINS[zone] ?? 0;

/** How many times more a fish pays at this Abyss marker (`MARKER.grow` a marker past the first); 1 outside the Abyss. */
export const markerGrowth = (zone: number, marker: number): number => (zone === ABYSS ? powInt(MARKER.grow, markerIn(zone, marker) - 1) : 1);

/** What sets one landed fish's pearls beside where it was landed: a Feisty or Brutish tag, and whether it's a legend. */
export interface PearlFish {
  tag?: FishTag | null;
  legend?: boolean;
}

/** How many times a plain fish's pearls this fish pays: `PEARLS.tag` for a tag, `PEARLS.legend` for a legend, both multiplying. */
export const pearlMult = (fish: PearlFish): number => (fish.tag ? PEARLS.tag : 1) * (fish.legend ? PEARLS.legend : 1);

/** Black Pearls a landed fish pays here: the zone's (`PEARLS.zone`), times `pearlMult`, times the Abyss marker's growth, rounded. */
export const pearlsFor = (zone: number, marker: number, fish: PearlFish = {}): number =>
  Math.round(PEARLS.zone[zone] * pearlMult(fish) * markerGrowth(zone, marker));

/** Bins for `typicalSale`'s average over a fish's sizes. */
const SIZE_BINS = 200;

/**
 * An everyday fish's average sale in this zone (plain, before clean-catch and tag bonuses, and before any Abyss
 * marker's growth), worked out from `sellValue` over the size roll (`rollSize`: the mean of two uniform rolls), evenly
 * across the zone's everyday fish.
 */
export function typicalSale(zone: number): number {
  const z = zoneOf(zone);
  let total = 0;
  for (const id of z.fish) {
    const f = byId(FISH, id);
    let sum = 0;
    for (let i = 0; i < SIZE_BINS; i++) {
      const t = (i + 0.5) / SIZE_BINS;
      const p = t < 0.5 ? 4 * t : 4 * (1 - t);
      sum += p * sellValue(f, f.minSize + t * (f.maxSize - f.minSize));
    }
    total += sum / SIZE_BINS;
  }
  return total / z.fish.length;
}

/** What a plain everyday fish pays here, for the screens: its pearls, and its average coins to the nearest 10. */
export function payAt(zone: number, marker: number): { pearls: number; coins: number } {
  return { pearls: pearlsFor(zone, marker), coins: Math.round((typicalSale(zone) * markerGrowth(zone, marker)) / 10) * 10 };
}

/** The behaviours a fish in this zone fights with, evenly (none on the Shelf). The fight leaves them off for now. */
export function behaviourOdds(zone: number): [Behaviour | null, number][] {
  const bs = zoneOf(zone).behaviours;
  return bs.length ? bs.map((b) => [b, 1 / bs.length]) : [[null, 1]];
}

export interface SeaBite {
  fish: Fish;
  behaviour: Behaviour | null;
}

/** Which fish bites in this zone: one of its legends 1 time in 20, else one of its everyday fish, and its behaviour. */
export function rollSeaFish(zone: number, rng: () => number): SeaBite {
  const z = zoneOf(zone);
  const pick = (ids: string[]) => (ids.length === 1 ? ids[0] : ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))]);
  const id = rng() < DIVE.legendChance ? pick(z.legends) : pick(z.fish);
  const fish = byId(FISH, id);
  const odds = behaviourOdds(zone);
  let r = rng();
  let behaviour = odds[odds.length - 1][0];
  for (const [b, p] of odds) {
    if (r < p) {
      behaviour = b;
      break;
    }
    r -= p;
  }
  return { fish, behaviour };
}

/** The Deep Sea Rod's next purchase, for the screens and the loss card: a step while there are steps left, else an Abyss level. */
export interface RodBuy {
  kind: 'step' | 'level';
  /** The step (1 to `ROD.steps`) or the Abyss level (1 and up) it would be. */
  n: number;
  coins: number;
  /** The zone whose opening puts it on sale (a step's), or the Abyss (a level's). */
  zone: number;
}

/** Coins for step n (1 to `ROD.steps`). */
export const rodStepCost = (n: number): number => ROD.stepCoins[n - 1];

/** Coins for Abyss level n (n ≥ 1): `levelCoins × levelGrow^(n−1)`, to the nearest `levelRound`. */
export const abyssLevelCost = (n: number): number => Math.round((ROD.levelCoins * powInt(ROD.levelGrow, n - 1)) / ROD.levelRound) * ROD.levelRound;

/** The zone whose opening puts rod step n on sale: zone z sells steps 2z−1 and 2z. */
export const stepZone = (n: number): number => Math.ceil(n / 2);

/** The rod's next purchase (`RodBuy`). */
export function nextRodBuy(rod: SeaRod): RodBuy {
  if (rod.steps < ROD.steps) {
    const n = rod.steps + 1;
    return { kind: 'step', n, coins: rodStepCost(n), zone: stepZone(n) };
  }
  const n = rod.levels + 1;
  return { kind: 'level', n, coins: abyssLevelCost(n), zone: ABYSS };
}

/** The next purchase's name: "Deep Sea Rod step 5" or "Deep Sea Rod Abyss level 3". */
export const rodBuyName = (b: RodBuy): string => `${DEEP_SEA_ROD.name} ${b.kind === 'step' ? 'step' : 'Abyss level'} ${b.n}`;

/** The next boat part to buy (zone z needs z of them), or null with all four. */
export const nextBoatPart = (parts: number): (typeof BOAT_PARTS)[number] | null => BOAT_PARTS[parts] ?? null;

/** What a player's save holds of the sea that a charter's start depends on. */
export interface SeaProgress {
  boatParts: number;
  abyssRecord: number;
}

/** A zone is open with as many boat parts as its index. */
export const zoneOpen = (p: Pick<SeaProgress, 'boatParts'>, zone: number): boolean => isZone(zone) && zone <= p.boatParts;

/**
 * Where a new charter may fish: an open zone, and in the Abyss a whole marker from 1 up to the furthest reached
 * (`abyssRecord`); no marker anywhere else (0 or left out).
 */
export function canStart(p: SeaProgress, zone: unknown, marker: unknown = 0): boolean {
  if (!isZone(zone) || !zoneOpen(p, zone)) return false;
  if (zone !== ABYSS) return marker === 0 || marker === undefined;
  return typeof marker === 'number' && Number.isInteger(marker) && marker >= 1 && marker <= Math.max(1, p.abyssRecord);
}

/** A charter's running tally, for the cards. */
export interface Tally {
  landed: number;
  lost: number;
  /** Black Pearls and coins the landed fish paid. */
  pearls: number;
  coins: number;
  /** Spools bought, the one cast off on included, and the coins they cost. */
  spools: number;
  spoolCoins: number;
}

/** Fishing, or out of line: waiting for another spool or for the player to head home. */
export type DiveState = 'fishing' | 'out';

export interface Dive {
  zone: number;
  /** The Abyss marker (1 and up); 0 in the other zones. */
  marker: number;
  /** Fish landed toward the next Abyss marker (0 to `MARKER.every` − 1); 0 elsewhere. */
  toNext: number;
  /** Metres left on the spool. */
  line: number;
  state: DiveState;
  /** The rod the charter fishes with, fixed at casting off (nothing is bought at sea). */
  rod: SeaRod;
  tally: Tally;
}

/** A new charter in a zone (and Abyss marker) on its first spool, bought for `spoolPrice`. */
export function startDive(zone: number, marker: number, rod: SeaRod): Dive {
  return {
    zone, marker: markerIn(zone, marker), toNext: 0, line: LINE.spool, state: 'fishing', rod: { steps: rod.steps, levels: rod.levels },
    tally: { landed: 0, lost: 0, pearls: 0, coins: 0, spools: 1, spoolCoins: spoolPrice(zone) },
  };
}

/** What a finished fight paid: nothing for a lost fish. */
export interface Landing {
  pearls: number;
  coins: number;
}

/**
 * Applies a finished fight, with `landing` for a landed fish (null for one that got away): the line it used
 * (`lineCost`, plus `LINE.lost` for a lost fish), the tally, and in the Abyss the fish toward the next marker, which
 * it reaches every `MARKER.every` fish. With the line gone the charter waits, out of line. Returns the metres used and
 * whether a new marker was reached.
 */
export function afterFight(d: Dive, landing: Landing | null): { cost: number; marker: boolean } {
  if (d.state !== 'fishing') return { cost: 0, marker: false };
  const cost = lineCost(d.zone, d.marker, d.rod) + (landing ? 0 : LINE.lost);
  d.line = Math.max(0, d.line - cost);
  let marker = false;
  if (landing) {
    d.tally.landed++;
    d.tally.pearls += landing.pearls;
    d.tally.coins += landing.coins;
    if (d.zone === ABYSS && ++d.toNext >= MARKER.every) {
      d.toNext = 0;
      d.marker++;
      marker = true;
    }
  } else d.tally.lost++;
  if (d.line <= 0) d.state = 'out';
  return { cost, marker };
}

/** Out of line: another spool (bought for `spoolPrice`) and on fishing in the same zone and marker. */
export function newSpool(d: Dive): boolean {
  if (d.state !== 'out') return false;
  d.line = LINE.spool;
  d.state = 'fishing';
  d.tally.spools++;
  d.tally.spoolCoins += spoolPrice(d.zone);
  return true;
}
