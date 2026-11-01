// Sea dive rules (Endgame Gameplan, "The challenge: charter dives"): depth sets the fight, each zone's fish fight
// their own way, one spool of line lasts the dive, and the haul is only safe once the player surfaces at a ledge.
// Pure logic for the server (D2) and the dive HUD (D3); no Math.pow, so the server and the client agree.
import { byId, FISH, type Fish } from '../data/content';
import { DIVE, SEA_FIGHT, ZONES, type Behaviour, type Zone } from '../data/dive';
import { P, expArith, lnArith, type FightDifficulty, type ReelTune, type ReelWear } from './reel';

const scale = (a: number[], ...m: number[]) => a.map((x, i) => x * (m[i] ?? 1));

/**
 * How each behaviour feels on the reel. How hard a fish is lives on the axes (`seaDifficulty`); these levers only set
 * its pattern, so a Runner, a Thrasher and a Sounder of the same difficulty play differently (see dive.test.ts).
 */
export const BEHAVIOUR_TUNE: Record<Behaviour, ReelTune> = {
  // Longer surges, and slack costs more line.
  runner: { surge: scale(P.surge, 1.1), run: 1.7 },
  // Short, close, uneven surges that build quicker.
  thrasher: { surge: scale(P.surge, 0.7), gap: scale(P.gap, 0.55), powerJitter: 0.4, rise: scale(P.rise, 0.8) },
  // Little warning before a surge.
  sounder: { warn: scale(P.warn, 0.4, 1, 1, 0.4) },
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

/** The Aurora Rod and sea line levels a sea fight is eased by. */
export interface SeaGear {
  rod: number;
  line: number;
}

const LN_LEAGUE = lnArith(SEA_FIGHT.perLeague);
/** base × perLeague^x for any x, without `Math.pow`. */
const atLeagues = (x: number) => SEA_FIGHT.base * expArith(x * LN_LEAGUE);
const round = (x: number) => Math.round(x * 100) / 100;

/** How far into its zone a depth is: a quarter in the marker the zone starts in, up to 1 from its `SEA_FIGHT.ramp`th. */
function rampShare(depth: number, z: Zone): number {
  const markers = Math.floor(depth / DIVE.ledgeEvery) - Math.floor(z.from / DIVE.ledgeEvery) + 1;
  return Math.min(1, markers / SEA_FIGHT.ramp);
}

/** The zones' leads at this depth: every zone's down to here, the current one ramping in (`rampShare`). */
function leads(depth: number): { weight: number; strength: number; paceCap: number } {
  const here = zoneAt(depth);
  const sum = { weight: 0, strength: 0, paceCap: 0 };
  for (const z of ZONES) {
    if (z.from > here.from) break;
    const share = z === here ? rampShare(depth, z) : 1;
    sum.weight += (z.lead?.weight ?? 0) * share;
    sum.strength += (z.lead?.strength ?? 0) * share;
    sum.paceCap += (z.lead?.paceCap ?? 0) * share;
  }
  return sum;
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

/**
 * A sea fight on the two axes (`SEA_FIGHT`): weight against the Aurora Rod's level (how much spool a fish takes),
 * strength against the line's (how near the red it pulls), and a pace that follows the depth and levels off. Each
 * zone leads on its axis (`Zone.lead`); `pull` is the fish's own strength roll and `big` its size
 * (`sizeDifficulty`), both 1 for a typical fish. The species' stamina (÷ 2.6) scales weight and strength.
 */
export function seaDifficulty(depth: number, gear: SeaGear, fish?: Pick<Fish, 'stamina'>, pull = 1, big = 1): FightDifficulty {
  const x = Math.floor(depth / DIVE.ledgeEvery) * DIVE.ledgeEvery;
  const lead = leads(depth);
  const species = fish ? fish.stamina / 2.6 : 1;
  const pace = Math.min(SEA_FIGHT.paceCap + lead.paceCap, atLeagues(SEA_FIGHT.paceShare * x));
  const cap = SEA_FIGHT.weightCap[0] - SEA_FIGHT.weightCap[1] * (pace - 2);
  const weight = atLeagues(x + SEA_FIGHT.weightStart + lead.weight - SEA_FIGHT.ease * gear.rod - SEA_FIGHT.cross * gear.line);
  const strength = atLeagues(x + lead.strength - SEA_FIGHT.ease * gear.line - SEA_FIGHT.cross * gear.rod);
  return { weight: round(Math.min(cap, weight * species * big)), strength: round(strength * species * pull), pace: round(pace) };
}

/** How much lighter this many Aurora Rod levels make sea fish, as a share (0.37 is 37% lighter). */
export const rodLevelEase = (level: number): number => 1 - expArith(-SEA_FIGHT.ease * level * LN_LEAGUE);

/** A fish's pull roll: ×spread^±1, log-uniform. */
export const rollPull = (rng: () => number): number => expArith((2 * rng() - 1) * lnArith(SEA_FIGHT.spread));

/** The hook toast's word for a pull roll. */
export const pullWord = (pull: number): 'strong' | 'light' | null => (pull > SEA_FIGHT.strong ? 'strong' : pull < SEA_FIGHT.light ? 'light' : null);

export interface SeaBite {
  fish: Fish;
  behaviour: Behaviour | null;
  /** The fish's strength roll (`rollPull`). */
  pull: number;
}

/**
 * Which fish bites at this depth: the zone's legend 1 time in 20, else one of its two everyday fish; how it fights
 * (`behaviourOdds`), and how it pulls.
 */
export function rollSeaFish(depth: number, rng: () => number): SeaBite {
  const z = zoneAt(depth);
  const id = rng() < DIVE.legendChance ? z.legend : z.fish[Math.min(z.fish.length - 1, Math.floor(rng() * z.fish.length))];
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
  return { fish, behaviour, pull: rollPull(rng) };
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
