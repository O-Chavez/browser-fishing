/**
 * Sea dive tuning (Endgame Gameplan, "The challenge: charter dives" and "P1 numbers"): each landed fish takes the
 * boat one depth deeper, every 5th depth is a ledge where the player surfaces with the haul or dives on, and one
 * spool of line has to last the dive. The rules are in `src/game/dive.ts`.
 */

/**
 * How a sea fish fights, by zone. Left off the fight while the foundation leaves variety out (REELING.md, "The
 * foundation"); the sea mapping decides whether they come back as modifiers, merged with the pond's temperaments.
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
   * The old sea fight's lead on an axis (leagues added to it from this zone down). Unused while the foundation leaves
   * zone variety out; kept for the sea mapping to decide on.
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
 * Sea fights continue the pond on one scale of tiers (REELING.md, "The ladder" and "The foundation"; Oscar,
 * 2026-11-02): a sea fish is a `harbour` tier fish at the harbour and a tier higher every `perTier` fish further out,
 * evenly and without end, the same all through a marker (`seaFishTiers`); the Deep Sea Rod and Line are their tier
 * plus `level` of a tier a level (`seaGearTiers`), the rod for weight and the line for strength.
 */
export const SEA_TIERS = { harbour: 5, perTier: 30, level: 1 / 6 };

export const SEA_FIGHT = {
  /** A zone's fish's ways of fighting come in a quarter at a time, one each marker, full from its 4th (`behaviourOdds`). */
  ramp: 4,
};

export const DIVE = {
  /** A ledge every this many depths. */
  ledgeEvery: 5,
  /** Metres of line on the dive's one spool. */
  spool: 300,
  /** Metres off the spool per fight length of line the fish takes (`ReelWear.lineOut`): about 2 m for a fish a 0.25 s
   * player lands 99% of, 15-30 m near their frontier. Set by the P1 rerun to keep its frontiers, and raised from 10 when
   * sea fish began to tire (fewer run-offs) to keep them again (`scripts/seafights.ts`). */
  metresPerLine: 15,
  /**
   * Metres lost with a fish that got away, snapped or ran off, on top of the line it took: the spool is the price of
   * pushing past your wall, whichever way the fish is lost (Oscar, 2026-11-03; a run-off cost only its line before).
   */
  lostMetres: 25,
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
  /** The rod a player must own to start a charter (`DEEP_SEA_ROD`); its levels are `ROD_LEVEL`. */
  rod: 'searod',
  /** How close to Captain Reed a dive can start, in metres. */
  standRange: 5,
  /** A dive waits this long for a player who disconnected mid-dive; after that the haul sinks. */
  holdMs: 120_000,
};

/**
 * Whether players can start a charter at Captain Reed's seaplane. Reopened 2026-11-01 with the deep zones' fish and
 * the Deep Sea Line (closed 2026-10-31 while they were worked on). Set it to false to close them again: Reed's panel
 * then says his plane isn't ready, the server refuses `dive`, and only the dev console's `/sea` sails out.
 */
export const DIVES_OPEN = true;

/**
 * Rod levels (Endgame Gameplan, "The chase: rod levels" and "P1 numbers"): the Deep Sea Rod keeps levelling at Marlow's
 * stall with no cap, each level making sea fish lighter (`SEA_TIERS.level` of a tier); pond fights don't change. (The Aurora Rod
 * levelled until the Deep Sea Rod came, 2026-11-01; its levels carried over.) A level costs coins plus Black Pearls, which only come from dives and are never sold, so a coin stockpile can't skip the climb.
 * The Deep Sea Line (`SEA_LINE`) is the second track. Each track's step is twice P1's single one, so levelling both
 * evenly keeps P1's pace of a level every 25-45 minutes. The coins keep rising with the level, as charter income does
 * with the deeper zones' dearer fish, so levels take about 60-75% of a fast player's charter coins at every stage
 * (REELING.md, "Sea economy"; Oscar, 2026-11-01).
 */
export const ROD_LEVEL = {
  /** The rod that levels (`DEEP_SEA_ROD`). */
  rod: 'searod',
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls ... */
  pearls: 100,
  pearlsPer: 24,
  /** ... and min(coinCap, coins + coinsPer·N) coins; the cap is only a safety net, reached past +54. */
  coins: 75_000,
  coinsPer: 6_000,
  coinCap: 400_000,
  /** The rod's tip glow changes colour every this many levels (`GLOW_STEPS`). */
  glowEvery: 5,
};

/**
 * The Deep Sea Line's levels, the sea's second track: bought at Marlow's stall like the rod's, each making sea fish
 * pull weaker (`SEA_TIERS.level` of a tier off strength). The line comes on the Deep Sea Rod, so levelling it needs the rod; it's
 * only used at sea. Half the rod's coins, so charters pay for both tracks with coins to spare.
 */
export const SEA_LINE = {
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls ... */
  pearls: 100,
  pearlsPer: 24,
  /** ... and min(coinCap, coins + coinsPer·N) coins: half the rod's at every level. */
  coins: 37_500,
  coinsPer: 3_000,
  coinCap: 200_000,
};

/**
 * The Deep Sea Rod's tip glow by glow step (every `ROD_LEVEL.glowEvery` levels): gold, teal, violet,
 * rose, pearl white, then a cycling rainbow from +25. A default, to be tuned after a play test.
 */
export const GLOW_STEPS = [0xffc933, 0x3fe6c8, 0xa77bff, 0xff6fa8, 0xf2eeff];

/** The Deep Sea Rod's glow step at this rod level: 0 below +5, then one more every `ROD_LEVEL.glowEvery`. */
export const glowStep = (rodLevel: number): number => Math.floor(rodLevel / ROD_LEVEL.glowEvery);

/** The glow colour for a step, or null for the rainbow past the last colour. */
export const glowColor = (step: number): number | null => (step < GLOW_STEPS.length ? GLOW_STEPS[step] : null);
