/**
 * Sea dive tuning (Endgame Gameplan, "The challenge: charter dives" and "P1 numbers"): each landed fish takes the
 * boat one depth deeper, every 5th depth is a ledge where the player surfaces with the haul or dives on, and one
 * spool of line has to last the dive. The rules are in `src/game/dive.ts`.
 */

/** How a sea fish fights, named on the HUD when it's hooked. Each is a set of reel levers (`BEHAVIOUR_TUNE`). */
export type Behaviour = 'runner' | 'thrasher' | 'sounder';

export const BEHAVIOURS: Record<Behaviour, { name: string; hint: string }> = {
  runner: { name: 'Runner', hint: 'Long pulls that take line' },
  thrasher: { name: 'Thrasher', hint: 'Quick, short surges' },
  sounder: { name: 'Sounder', hint: 'Dives with little warning' },
};

export interface Zone {
  id: string;
  name: string;
  /** First depth of the zone; it runs to the next zone's. */
  from: number;
  /** Two everyday fish, evenly split, and the zone's rare legend (`DIVE.legendChance`). */
  fish: string[];
  legend: string;
  /** The behaviours its fish roll from, evenly; none on the Shelf. */
  behaviours: Behaviour[];
  /** Multiplies fight difficulty. The behaviours carry each zone's step, so this stays 1 unless play shows otherwise. */
  factor: number;
}

// Kelp Deep and below borrow the Drop-off's fish until their own species are added.
const DROPOFF_FISH = { fish: ['galemackerel', 'irontuna'], legend: 'marlin' };

export const ZONES: Zone[] = [
  { id: 'shelf', name: 'The Shelf', from: 0, fish: ['pewtercod', 'snapper'], legend: 'grouper', behaviours: [], factor: 1 },
  { id: 'dropoff', name: 'The Drop-off', from: 16, ...DROPOFF_FISH, behaviours: ['runner'], factor: 1 },
  { id: 'kelp', name: 'Kelp Deep', from: 41, ...DROPOFF_FISH, behaviours: ['thrasher'], factor: 1 },
  { id: 'twilight', name: 'The Twilight', from: 81, ...DROPOFF_FISH, behaviours: ['sounder'], factor: 1 },
  { id: 'abyss', name: 'The Abyss', from: 151, ...DROPOFF_FISH, behaviours: ['runner', 'thrasher', 'sounder'], factor: 1.05 },
];

export const DIVE = {
  /** Fight difficulty: base × perDepth^depth × perRodLevel^rod level × zone factor × stamina / staminaBase. No clamp. */
  baseDifficulty: 1.6,
  perDepth: 1.01,
  perRodLevel: 0.97,
  staminaBase: 2.6,
  /** A ledge every this many depths. */
  ledgeEvery: 5,
  /** Metres of line on the dive's one spool. */
  spool: 300,
  /** Metres off the spool per fight length of line the fish takes (`ReelWear.lineOut`): about 2 m for a fish a 0.25 s
   * player lands 99% of, 15-25 m near their frontier. Set by the P1 rerun to keep its frontiers (20 m costs ~5 depths). */
  metresPerLine: 10,
  /** Metres lost with a snapped line. */
  snapMetres: 25,
  /** Metres for each fray left on a landed fish. */
  frayMetres: 5,
  /** Pearls per landed fish: 1 + floor(depth / pearlStep). */
  pearlStep: 20,
  /** The haul grows by this for each ledge reached this dive, up to `haulCap`. */
  haulPerLedge: 0.1,
  haulCap: 0.5,
  /** Chance a bite is the zone's legend. */
  legendChance: 0.05,
  /** Seconds until a bite at sea: `biteMin` plus up to `biteSpread`. Casts at sea use no bait (Reed's boat has it). */
  biteMin: 2.5,
  biteSpread: 4,
  /** The rod a player must own to start a dive; D4's rod levels build on it. */
  rod: 'aurora',
  /** How close to Captain Reed a dive can start, in metres. */
  standRange: 5,
  /** A dive waits this long for a player who disconnected mid-dive; after that the haul sinks. */
  holdMs: 120_000,
};

/** Whether players can dive yet: Captain Reed's charters are open (D3), so the rod levels show to every Aurora Rod owner. */
export const DIVES_OPEN = true;

/**
 * Rod levels (Endgame Gameplan, "The chase: rod levels" and "P1 numbers"): the Aurora Rod keeps levelling at Marlow's
 * stall with no cap, each level making sea fights 3% easier (`DIVE.perRodLevel`); pond fights don't change. A level
 * costs coins plus Black Pearls, which only come from dives and are never sold, so a coin stockpile can't skip the climb.
 */
export const ROD_LEVEL = {
  /** The rod that levels. */
  rod: 'aurora',
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls ... */
  pearls: 100,
  pearlsPer: 12,
  /** ... and min(coinCap, coins + coinsPer·N) coins. */
  coins: 50_000,
  coinsPer: 4_000,
  coinCap: 150_000,
  /** The rod's tip glow changes colour every this many levels (`GLOW_STEPS`). */
  glowEvery: 5,
};

/**
 * The Aurora Rod's tip glow and grip band by glow step (every `ROD_LEVEL.glowEvery` levels): gold, teal, violet,
 * rose, pearl white, then a cycling rainbow from +25. A default, to be tuned after a play test.
 */
export const GLOW_STEPS = [0xffc933, 0x3fe6c8, 0xa77bff, 0xff6fa8, 0xf2eeff];

/** The Aurora Rod's glow step at this rod level: 0 below +5, then one more every `ROD_LEVEL.glowEvery`. */
export const glowStep = (rodLevel: number): number => Math.floor(rodLevel / ROD_LEVEL.glowEvery);

/** The glow colour for a step, or null for the rainbow past the last colour. */
export const glowColor = (step: number): number | null => (step < GLOW_STEPS.length ? GLOW_STEPS[step] : null);
