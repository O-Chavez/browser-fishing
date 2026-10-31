// Sea dive rules (Endgame Gameplan, "The challenge: charter dives"): depth sets the fight, each zone's fish fight
// their own way, one spool of line lasts the dive, and the haul is only safe once the player surfaces at a ledge.
// Pure logic for the server (D2) and the dive HUD (D3); no Math.pow, so the server and the client agree.
import { byId, FISH, type Fish } from '../data/content';
import { DIVE, ZONES, type Behaviour, type Zone } from '../data/dive';
import { P, type ReelTune, type ReelWear } from './reel';

const scale = (a: number[], ...m: number[]) => a.map((x, i) => x * (m[i] ?? 1));

/**
 * Each behaviour as reel levers, tuned with the reel bots to land about 5% fewer fish than a plain fish of the
 * same difficulty, each in its own way (see dive.test.ts).
 */
export const BEHAVIOUR_TUNE: Record<Behaviour, ReelTune> = {
  // Longer surges that take line faster, and drag more of it out with the gauge green.
  runner: { surge: scale(P.surge, 1.1), drag: scale(P.drag, 1.2), run: 1.7 },
  // Short, close, uneven surges that hit harder and build quicker.
  thrasher: { surge: scale(P.surge, 0.7), gap: scale(P.gap, 0.55), powerJitter: 0.4, need: scale(P.need, 1.08, 1.08), rise: scale(P.rise, 0.6) },
  // Little warning before a surge, and the red frays the line sooner.
  sounder: { warn: scale(P.warn, 0.4, 1, 1, 0.4), fray: scale(P.fray, 0.8, 0.8) },
};

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

/**
 * Fight difficulty at sea: 1.6 × 1.01^depth × 0.97^rod level × the zone factor, scaled by the species' stamina
 * (stamina / 2.6). No clamp, rounded to 0.01 like the pond's. Size and shininess don't change it: a shiny sea
 * fish is worth more, not harder (a ×1.4 shiny would sit past the frontier wall).
 */
export function seaDifficulty(depth: number, rodLevel: number, fish?: Pick<Fish, 'stamina'>): number {
  const d = DIVE.baseDifficulty * powInt(DIVE.perDepth, depth) * powInt(DIVE.perRodLevel, rodLevel) * zoneAt(depth).factor
    * (fish ? fish.stamina / DIVE.staminaBase : 1);
  return Math.round(d * 100) / 100;
}

export interface SeaBite {
  fish: Fish;
  behaviour: Behaviour | null;
  difficulty: number;
}

/** Which fish bites at this depth: the zone's legend 1 time in 20, else one of its two everyday fish. */
export function rollSeaFish(depth: number, rodLevel: number, rng: () => number): SeaBite {
  const z = zoneAt(depth);
  const id = rng() < DIVE.legendChance ? z.legend : z.fish[Math.min(z.fish.length - 1, Math.floor(rng() * z.fish.length))];
  const fish = byId(FISH, id);
  const behaviour = z.behaviours.length ? z.behaviours[Math.min(z.behaviours.length - 1, Math.floor(rng() * z.behaviours.length))] : null;
  return { fish, behaviour, difficulty: seaDifficulty(depth, rodLevel, fish) };
}

/** Pearls a fish landed at this depth adds to the haul. */
export const pearlsAt = (depth: number): number => 1 + Math.floor(depth / DIVE.pearlStep);

/** The haul's multiplier on surfacing after reaching this many ledges this dive. */
export const haulBonus = (ledges: number): number => 1 + Math.min(DIVE.haulCap, DIVE.haulPerLedge * ledges);

/** Metres of line a fight wore: the line the fish took, plus a length if it snapped, or each fray left on a landed fish. */
export function lineWorn(wear: ReelWear, landed: boolean): number {
  return wear.lineOut * DIVE.metresPerLine + (wear.snapped ? DIVE.snapMetres : landed ? wear.frays * DIVE.frayMetres : 0);
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
