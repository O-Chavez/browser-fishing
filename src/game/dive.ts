// Sea dive rules (Endgame Gameplan, "The challenge: charter dives"): depth sets the fight, one spool of line lasts the
// dive, and the haul is only safe once the player surfaces at a ledge.
// Pure logic for the server (D2) and the dive HUD (D3); no Math.pow, so the server and the client agree.
import { byId, DEEP_SEA_LINE, DEEP_SEA_ROD, FISH, type Fish } from '../data/content';
import { DIVE, SEA_FIGHT, SEA_TIERS, ZONES, type Behaviour, type Zone } from '../data/dive';
import { gapsOf, type FishTiers, type GearTiers } from './progression';
import type { Gaps, ReelWear } from './reel';

/** base^n for a whole n ≥ 0, by repeated multiplication (same result in every JS engine, unlike `Math.pow`). */
export function powInt(base: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= base;
  return r;
}

export function zoneAt(depth: number): Zone {
  let z = ZONES[0];
  for (const x of ZONES) if (depth >= x.from) z = x;
  return z;
}

/** The Deep Sea Rod and Line levels a sea fight is eased by. */
export interface SeaGear {
  rod: number;
  line: number;
}

const round = (x: number) => Math.round(x * 100) / 100;

/** How far into its zone a depth is: a quarter in the marker the zone starts in, up to 1 from its `SEA_FIGHT.ramp`th. */
function rampShare(depth: number, z: Zone): number {
  const markers = Math.floor(depth / DIVE.ledgeEvery) - Math.floor(z.from / DIVE.ledgeEvery) + 1;
  return Math.min(1, markers / SEA_FIGHT.ramp);
}

/**
 * The behaviours a fish at this depth fights with, and their odds: the zone's, evenly, blending in from the zone
 * above over its first markers (`rampShare`), so a new way of fighting arrives a few fish at a time.
 */
export function behaviourOdds(depth: number): [Behaviour | null, number][] {
  const z = zoneAt(depth);
  const above = ZONES[ZONES.indexOf(z) - 1];
  const share = above ? rampShare(depth, z) : 1;
  const odds: [Behaviour | null, number][] = [];
  const add = (bs: Behaviour[], p: number) => {
    if (!bs.length) odds.push([null, p]);
    else for (const b of bs) odds.push([b, p / bs.length]);
  };
  add(z.behaviours, share);
  if (share < 1) add(above.behaviours, 1 - share);
  return odds;
}

/** A sea fish's tiers (`SEA_TIERS`): from how far out it is, the same all through a marker. Like the pond, nothing else counts for now. */
export function seaFishTiers(depth: number): FishTiers {
  const t = SEA_TIERS.harbour + (Math.floor(depth / DIVE.ledgeEvery) * DIVE.ledgeEvery) / SEA_TIERS.perTier;
  return { strength: t, weight: t };
}

/** The Deep Sea Rod's and Line's tiers with their levels (`SEA_TIERS.level` of a tier each). */
export const seaGearTiers = (gear: SeaGear): GearTiers => ({
  line: DEEP_SEA_LINE.tier + SEA_TIERS.level * gear.line,
  rod: DEEP_SEA_ROD.tier + SEA_TIERS.level * gear.rod,
});

/** A sea fight's gaps: the pond's formula (`gapsOf`) on the sea fish's and gear's tiers, to a hundredth. */
export function seaGaps(depth: number, gear: SeaGear): Gaps {
  const g = gapsOf(seaFishTiers(depth), seaGearTiers(gear));
  return { strength: round(g.strength), weight: round(g.weight) };
}

/**
 * The first marker where a typical sea fish is `rungs` over a Deep Sea Rod or Line at this level (`seaGaps`), for the
 * level panels' "heavy for it from marker 30" (Oscar, 2026-11-03): each level moves it one marker further out.
 */
export function markerOver(gearTier: number, level: number, rungs: number): number {
  const depth = (rungs + gearTier + SEA_TIERS.level * level - SEA_TIERS.harbour) * SEA_TIERS.perTier;
  return Math.ceil(depth / DIVE.ledgeEvery - 1e-9) * DIVE.ledgeEvery;
}

export interface SeaBite {
  fish: Fish;
  behaviour: Behaviour | null;
}

/**
 * Which fish bites at this depth: one of the zone's legends 1 time in 20, else one of its everyday fish, and its
 * way of fighting (`behaviourOdds`), which the fight leaves off for now.
 */
export function rollSeaFish(depth: number, rng: () => number): SeaBite {
  const z = zoneAt(depth);
  const pick = (ids: string[]) => (ids.length === 1 ? ids[0] : ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))]);
  const id = rng() < DIVE.legendChance ? pick(z.legends) : pick(z.fish);
  const fish = byId(FISH, id);
  const odds = behaviourOdds(depth);
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

/** Pearls a fish landed at this depth adds to the haul. */
export const pearlsAt = (depth: number): number => 1 + Math.floor(depth / DIVE.pearlStep);

/** The haul's multiplier on surfacing after reaching this many ledges this dive. */
export const haulBonus = (ledges: number): number => 1 + Math.min(DIVE.haulCap, DIVE.haulPerLedge * ledges);

/** Metres of line a fight wore: the line the fish took, plus a length if it got away, or each fray left on a landed fish. */
export function lineWorn(wear: ReelWear, landed: boolean): number {
  return wear.lineOut * DIVE.metresPerLine + (landed ? wear.frays * DIVE.frayMetres : DIVE.lostMetres);
}

export type DiveState = 'fishing' | 'ledge' | 'surfaced' | 'sunk';

export interface Dive {
  /** The charted ledge the dive started from (0 is the harbour). */
  start: number;
  depth: number;
  /** Metres of line left on the spool. */
  line: number;
  state: DiveState;
  /** Ledges reached this dive, for the haul's growth. */
  ledges: number;
  /** Pearls in the haul, lost if the line runs out before surfacing. */
  pearls: number;
  /** Ids of the fish landed this dive; these come home even if the haul sinks. */
  fish: string[];
}

/** A charted ledge is one the player surfaced from; the record is the deepest. Dives start from 0 or any of them. */
export interface Chart {
  ledges: number[];
  record: number;
}

export const isLedge = (depth: number): boolean => depth > 0 && depth % DIVE.ledgeEvery === 0;

/** Where a new dive may start: the harbour or a charted ledge. */
export const canStartAt = (chart: Chart, start: number): boolean => start === 0 || chart.ledges.includes(start);

export function startDive(start: number): Dive {
  return { start, depth: start, line: DIVE.spool, state: 'fishing', ledges: 0, pearls: 0, fish: [] };
}

/**
 * Applies a finished fight. A landed fish joins the dive's catch, adds its pearls and takes the boat a depth
 * deeper, stopping at each ledge for the player's choice. If the line runs out, the dive ends and the haul sinks
 * (the landed fish, the last one included, still come home).
 */
export function afterFight(dive: Dive, fishId: string, landed: boolean, wear: ReelWear): Dive {
  if (dive.state !== 'fishing') return dive;
  dive.line = Math.max(0, dive.line - lineWorn(wear, landed));
  if (landed) {
    dive.fish.push(fishId);
    dive.pearls += pearlsAt(dive.depth);
    dive.depth++;
  }
  if (dive.line <= 0) {
    dive.state = 'sunk';
    dive.pearls = 0;
  } else if (landed && isLedge(dive.depth)) {
    dive.state = 'ledge';
    dive.ledges++;
  }
  return dive;
}

/** At a ledge: keep going, with the haul still at risk. */
export function diveOn(dive: Dive): Dive {
  if (dive.state === 'ledge') dive.state = 'fishing';
  return dive;
}

export interface Surfaced {
  /** Pearls banked: the haul with its growth. */
  pearls: number;
  fish: string[];
  /** The ledge surfaced from, now charted. */
  ledge: number;
  /** A new record: the deepest ledge surfaced from so far. */
  record: boolean;
}

/** At a ledge: surface. Banks the haul with its growth, charts the ledge and updates the record. */
export function surface(dive: Dive, chart: Chart): Surfaced | null {
  if (dive.state !== 'ledge') return null;
  dive.state = 'surfaced';
  const ledge = dive.depth;
  if (!chart.ledges.includes(ledge)) chart.ledges.push(ledge);
  const record = ledge > chart.record;
  if (record) chart.record = ledge;
  return { pearls: Math.round(dive.pearls * haulBonus(dive.ledges)), fish: dive.fish.slice(), ledge, record };
}
