/**
 * Sea dive tuning (Endgame Gameplan, "The challenge: charter dives" and "P1 numbers"): each landed fish takes the
 * boat one depth deeper, every 5th depth is a ledge where the player surfaces with the haul or dives on, and one
 * spool of line has to last the dive. The rules are in `src/game/dive.ts`.
 */

/**
 * How a sea fish fights, named on the HUD when it's hooked: its feel on the reel (`BEHAVIOUR_TUNE`). Each comes in
 * with the zone that leads on its axis (`Zone.lead`), so Runners arrive as the fish get heavier, and so on.
 */
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
  /** Everyday fish, evenly split, and the zone's rare legends (`DIVE.legendChance` for any of them, evenly split). */
  fish: string[];
  legends: string[];
  /** The behaviours its fish roll from, evenly once the zone's first markers have blended in (`behaviourOdds`); none on the Shelf. */
  behaviours: Behaviour[];
  /**
   * Leagues the zone adds to an axis, for its fish and every zone below, ramping in over its first markers
   * (`SEA_FIGHT.ramp`), and how far it lifts the pace's cap. So each zone is harder in its own way, and no marker is
   * easier than the one before.
   */
  lead?: { weight?: number; strength?: number; paceCap?: number };
}

export const ZONES: Zone[] = [
  { id: 'shelf', name: 'The Shelf', from: 0, fish: ['pewtercod', 'snapper'], legends: ['grouper'], behaviours: [] },
  // Heavier fish: they take more of the spool. Tests the rod.
  { id: 'dropoff', name: 'The Drop-off', from: 16, fish: ['galemackerel', 'irontuna'], legends: ['marlin'], behaviours: ['runner'], lead: { weight: 15 } },
  // Stronger fish: surges pull nearer the red. Tests the line.
  { id: 'kelp', name: 'Kelp Deep', from: 41, fish: ['frondback', 'lionfish', 'wolfeel'], legends: ['kelpbeard', 'kelpwyrm'], behaviours: ['thrasher'], lead: { strength: 10 } },
  // Twitchier fish. Tests the player.
  { id: 'twilight', name: 'The Twilight', from: 81, fish: ['hatchet', 'fangjaw', 'lanternshark'], legends: ['oarfish', 'chandelier'], behaviours: ['sounder'], lead: { paceCap: 0.1 } },
  { id: 'abyss', name: 'The Abyss', from: 151, fish: ['lurker', 'gulper', 'krakenspawn', 'boneserpent'], legends: ['leviathan', 'dreamer', 'kraken'], behaviours: ['runner', 'thrasher', 'sounder'] },
];

/**
 * Sea fights on the pond's two axes (REELING.md, "The sea"). Each axis is base × perLeague^x, with x counted in
 * leagues: the depth at the start of its marker (a fight is the same all through a marker, then steps up), the
 * axis's head start and the zones' leads (`Zone.lead`), less what the gear eases. So nearing your frontier is felt
 * marker by marker: heavier fish take more of the spool and stronger ones pull closer to the red, with each fish's
 * own pull (`spread`) making the last markers a gamble rather than a wall.
 */
export const SEA_FIGHT = {
  base: 1.6,
  perLeague: 1.01,
  /** A zone's lead, and its fish's way of fighting, come in a quarter at a time, one each marker, full from its 4th. */
  ramp: 4,
  /** Weight's head start, in leagues: sea fish are heavy from the first marker, so even the Shelf takes some line. */
  weightStart: 15,
  /** Pace rises at this share of the depth (no gear eases it) up to `paceCap`, which a 0.7 s player can still play. */
  paceShare: 0.6,
  paceCap: 2.0,
  /** Weight stops at cap - k·(pace - 2), short of the slog where reeling barely beats the drag: [cap, k]. */
  weightCap: [3.3, 1.25],
  /** Leagues each Aurora Rod level takes off weight, and `cross` off strength; a line level the other way round. */
  ease: 4.5,
  cross: 1.5,
  /** Each fish's pull: strength ×spread^±1, log-uniform, so some fish of a depth pull harder than others. */
  spread: 1.4,
  /** The hook toast calls a pull above `strong` "a strong one" and below `light` "a light one" (about 1 fish in 4 each). */
  strong: 1.2,
  light: 0.85,
};

export const DIVE = {
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

/**
 * Whether players can start a charter at Captain Reed's seaplane. Closed while charters are being worked on: Reed's
 * panel says his plane isn't ready, the server refuses `dive`, and only the dev console's `/sea` sails out. While
 * closed, the rod levels only show to players who already have pearls or a level.
 */
export const DIVES_OPEN = false;

/**
 * Rod levels (Endgame Gameplan, "The chase: rod levels" and "P1 numbers"): the Aurora Rod keeps levelling at Marlow's
 * stall with no cap, each level making sea fish lighter (`SEA_FIGHT.ease`); pond fights don't change. A level
 * costs coins plus Black Pearls, which only come from dives and are never sold, so a coin stockpile can't skip the climb.
 * The Deep Sea Line (`SEA_LINE`) is the second track. Each track's step is twice P1's single one, so levelling both
 * evenly keeps P1's pace of a level every 25-45 minutes (REELING.md, "Sea findings").
 */
export const ROD_LEVEL = {
  /** The rod that levels. */
  rod: 'aurora',
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls ... */
  pearls: 100,
  pearlsPer: 24,
  /** ... and min(coinCap, coins + coinsPer·N) coins. */
  coins: 50_000,
  coinsPer: 8_000,
  coinCap: 150_000,
  /** The rod's tip glow changes colour every this many levels (`GLOW_STEPS`). */
  glowEvery: 5,
};

/**
 * The Deep Sea Line's levels, the sea's second track: bought at Marlow's stall like the rod's, each making sea fish
 * pull weaker (`SEA_FIGHT.ease` off strength). It needs the Aurora Rod, and its first level spools it in place of the
 * pond line (it holds tier 5 there). Half the rod's coins, so charters pay for both tracks with coins to spare.
 */
export const SEA_LINE = {
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls ... */
  pearls: 100,
  pearlsPer: 24,
  /** ... and min(coinCap, coins + coinsPer·N) coins. */
  coins: 25_000,
  coinsPer: 4_000,
  coinCap: 75_000,
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
