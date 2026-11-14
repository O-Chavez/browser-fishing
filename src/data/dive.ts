/**
 * Charter tuning (Oscar, 2026-11-12: the charters are a place to earn). A charter is fished in one zone the player
 * picked; its fish pay coins and Black Pearls by zone, and every fish hooked uses line off a spool that costs coins.
 * Coins buy the Deep Sea Rod's steps and Abyss levels (`ROD`), pearls buy the boat parts that open zones
 * (`BOAT_PARTS`), all from Captain Reed. Only the Abyss has markers (`ABYSS`). The rules are in `src/game/dive.ts`;
 * every number is here, to tune after a play test.
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
  /** Everyday fish, evenly split, and the zone's rare legends (`DIVE.legendChance` for any of them, evenly split). */
  fish: string[];
  legends: string[];
  /** The behaviours its fish roll from, evenly (`behaviourOdds`); none on the Shelf. */
  behaviours: Behaviour[];
  /**
   * The old sea fight's lead on an axis. Unused while the foundation leaves zone variety out; kept for the sea mapping
   * to decide on.
   */
  lead?: { weight?: number; strength?: number; paceCap?: number };
}

/** The five zones, by index: 0 the Shelf ... 4 the Abyss. `SEA_ZONES` in `src/data/sea.ts` keeps the sea's look for each. */
export const ZONES: Zone[] = [
  { id: 'shelf', name: 'The Shelf', fish: ['pewtercod', 'snapper'], legends: ['grouper'], behaviours: [] },
  // Heavier fish. Tests the rod.
  { id: 'dropoff', name: 'The Drop-off', fish: ['galemackerel', 'irontuna'], legends: ['marlin'], behaviours: ['runner'], lead: { weight: 15 } },
  // Stronger fish: surges pull nearer the red.
  { id: 'kelp', name: 'Kelp Deep', fish: ['frondback', 'lionfish', 'wolfeel'], legends: ['kelpbeard', 'kelpwyrm'], behaviours: ['thrasher'], lead: { strength: 10 } },
  // Twitchier fish. Tests the player.
  { id: 'twilight', name: 'The Twilight', fish: ['hatchet', 'fangjaw', 'lanternshark'], legends: ['oarfish', 'chandelier'], behaviours: ['sounder'], lead: { paceCap: 0.1 } },
  { id: 'abyss', name: 'The Abyss', fish: ['lurker', 'gulper', 'krakenspawn', 'boneserpent'], legends: ['leviathan', 'dreamer', 'kraken'], behaviours: ['runner', 'thrasher', 'sounder'] },
];

/** The Abyss's index in `ZONES`: the one zone with markers. */
export const ABYSS = 4;

/**
 * Sea fights continue the pond on one scale of tiers (REELING.md, "The ladder"): a sea fish in zone z is
 * `harbour + zone·z` tiers on both strength and weight, and in the Abyss `marker` more for each marker past the first
 * (`seaFishTier`).
 */
export const SEA_TIERS = {
  /** A Shelf fish: the Deep Sea Rod's own tier, so a rod with no steps meets the Shelf at parity. */
  harbour: 5,
  /** Tiers added by each zone out. */
  zone: 0.8,
  /** Tiers added by each Abyss marker past the first. */
  marker: 0.1,
};

/**
 * The Deep Sea Rod's one track (`seaRodTier`): `steps` steps worth `step` tiers each, on both strength and weight,
 * then endless Abyss levels worth `level` each. A zone's two steps (2z−1 and 2z) go on sale once the zone is open.
 * All bought with coins from Captain Reed.
 */
export const ROD = {
  steps: 8,
  /** Tiers each step adds. */
  step: 0.4,
  /** Tiers each Abyss level adds. */
  level: 0.1,
  /**
   * Coins for steps 1 to 8. A zone's two steps come in while its fish earn the next boat part (`BOAT_PARTS`), so the
   * first ones are cheap and the first two zones pass quickly. From Kelp Deep the plain path is long on purpose: Shiny
   * Lures are how a player speeds it up (Oscar, 2026-11-13: the Abyss at about 5 hours is the lured player's time; about
   * 8 plain). A best estimate, to revisit after a play test (`scripts/seaeconomy.ts`).
   */
  stepCoins: [40_000, 90_000, 150_000, 350_000, 900_000, 2_000_000, 2_400_000, 4_800_000],
  /** Abyss level n costs `levelCoins × levelGrow^(n−1)` coins, to the nearest `levelRound`. */
  levelCoins: 1_000_000,
  levelGrow: 1.12,
  levelRound: 1000,
  /**
   * The rod's tip glow (`glowStep`): one colour for every `glowSteps` steps, then one more every `glowLevels` Abyss
   * levels. A default, to tune after a play test.
   */
  glowSteps: 2,
  glowLevels: 5,
};

/**
 * How a zone (and Abyss marker) reads for the player's rod (`ratingOf`), by the gap between a typical fish there and
 * the rod, in tiers: Easy up to `easy`, Fair up to `fair`, Tough up to `tough`, Too much past it.
 */
export const RATING = { easy: 0.05, fair: 0.45, tough: 0.85 };

/**
 * Line: every charter starts on one spool of `spool` metres, the same in every zone. Every hooked fish uses `base`
 * metres when it's no harder than the rod, else `base + perTier·g` (rounded) for a typical fish's gap g there (9 m at
 * Fair, 13 m at Tough); a fish that gets away takes `lost` more. A missed strike and frays cost nothing.
 */
export const LINE = { spool: 300, base: 5, perTier: 10, lost: 25 };

/** Coins for a spool, by zone: paid on casting off and for each spool after. Free on the Shelf. */
export const SPOOL_COINS = [0, 14_000, 26_000, 46_000, 83_000];

/**
 * Black Pearls a landed fish pays, by zone (`pearlsFor`). A Feisty or Brutish fish (`rollTag`, one in 8) pays `tag`
 * times, a legend (one bite in 20) `legend` times and a shiny (one in 20, or every fish on a Shiny Lure) `shiny` times;
 * all three multiply (Oscar, 2026-11-13: a shiny sea fish pays five times the pearls as well as the coins).
 */
export const PEARLS = {
  zone: [1, 3, 8, 20, 50],
  tag: 2,
  legend: 5,
  shiny: 5,
};

/**
 * The Abyss's markers: every `every` fish landed the charter reaches the next marker, and each marker past the first
 * makes its fish `SEA_TIERS.marker` harder and their pearls and coins `grow` times more, compounding.
 */
export const MARKER = { every: 3, grow: 1.12 };

/**
 * The boat parts that open zones, fitted by Captain Reed for Black Pearls: zone z needs z of them, in this order.
 * Pearls buy nothing else, so the screens show them as progress to the next part, not as a purse. The first two zones
 * open quickly (Oscar, 2026-11-13): the first part after 5 to 10 minutes on the Shelf, the next 15 to 30 minutes on.
 * From Kelp Deep the plain path is long on purpose, and Shiny Lures (a shiny pays `PEARLS.shiny` times) are how a
 * player speeds it up: the Abyss at about 5 hours is the lured player's time (Oscar, 2026-11-13). A best estimate, to
 * revisit after a play test (`scripts/seaeconomy.ts`). Working names, flagged for Oscar to rename.
 */
export const BOAT_PARTS = [
  { id: 'sail', name: 'Storm sail', pearls: 30 },
  { id: 'cutter', name: 'Kelp cutter', pearls: 150 },
  { id: 'lamps', name: 'Deep lamps', pearls: 3000 },
  { id: 'keel', name: 'Iron keel', pearls: 25_000 },
];

export const DIVE = {
  /** Chance a bite is the zone's legend. */
  legendChance: 0.05,
  /** Seconds until a bite at sea: `biteMin` plus up to `biteSpread`. Casts at sea use no bait (Reed's boat has it). */
  biteMin: 2.5,
  biteSpread: 4,
  /** The rod a player must own to start a charter (`DEEP_SEA_ROD`). */
  rod: 'searod',
  /** How close to Captain Reed a charter can start, or his wares be bought, in metres. */
  standRange: 5,
  /** A charter waits this long for a player who disconnected; after that it simply ends. */
  holdMs: 120_000,
};

/**
 * Whether players can start a charter at Captain Reed's seaplane. Set it to false to close them: Reed's panel then
 * says his plane isn't ready, the server refuses `dive`, and only the dev console's `/sea` sails out.
 */
export const DIVES_OPEN = true;

/**
 * The Deep Sea Rod's tip glow by glow step (`glowStep`): gold, teal, violet, rose, pearl white, then a cycling
 * rainbow. Step 0 shows no glow. A default, to be tuned after a play test.
 */
export const GLOW_STEPS = [0xffc933, 0x3fe6c8, 0xa77bff, 0xff6fa8, 0xf2eeff];

/** The Deep Sea Rod's glow step: one more every `ROD.glowSteps` steps, then every `ROD.glowLevels` Abyss levels. */
export const glowStep = (steps: number, levels = 0): number => Math.floor(steps / ROD.glowSteps) + Math.floor(levels / ROD.glowLevels);

/** The glow colour for a step, or null for the rainbow past the last colour. */
export const glowColor = (step: number): number | null => (step < GLOW_STEPS.length ? GLOW_STEPS[step] : null);
