/**
 * Sea dive tuning (Endgame Gameplan, "The challenge: charter dives" and "P1 numbers"): each landed fish takes the
 * boat one depth deeper, every 5th depth is a ledge where the player surfaces with the haul or dives on, and one
 * spool of line has to last the dive. Fish at the edge of the gear pay Black Pearls (`PEARLS`); heading home at a
 * marker banks them with the haul's bonus, and a charter that ends any other way keeps them without it. The rules are
 * in `src/game/dive.ts`.
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

/**
 * A zone starts on the first fish past a marker, so markers 15, 35, 60 and 90 are each zone's last. Brought in from
 * 41 / 81 / 151 when charters began paying for fishing at the edge of the gear (Oscar, 2026-11-11), so the Abyss is a
 * goal a levelled rod and line can reach (about +10 to +13 on both tracks; `ROD_LEVEL`). `SEA_ZONES` in
 * `src/data/sea.ts` keeps the same lines for the sea's look.
 */
export const ZONES: Zone[] = [
  { id: 'shelf', name: 'The Shelf', from: 0, fish: ['pewtercod', 'snapper'], legends: ['grouper'], behaviours: [] },
  // Heavier fish: they take more of the spool. Tests the rod.
  { id: 'dropoff', name: 'The Drop-off', from: 16, fish: ['galemackerel', 'irontuna'], legends: ['marlin'], behaviours: ['runner'], lead: { weight: 15 } },
  // Stronger fish: surges pull nearer the red. Tests the line.
  { id: 'kelp', name: 'Kelp Deep', from: 36, fish: ['frondback', 'lionfish', 'wolfeel'], legends: ['kelpbeard', 'kelpwyrm'], behaviours: ['thrasher'], lead: { strength: 10 } },
  // Twitchier fish. Tests the player.
  { id: 'twilight', name: 'The Twilight', from: 61, fish: ['hatchet', 'fangjaw', 'lanternshark'], legends: ['oarfish', 'chandelier'], behaviours: ['sounder'], lead: { paceCap: 0.1 } },
  { id: 'abyss', name: 'The Abyss', from: 91, fish: ['lurker', 'gulper', 'krakenspawn', 'boneserpent'], legends: ['leviathan', 'dreamer', 'kraken'], behaviours: ['runner', 'thrasher', 'sounder'] },
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
  /** A pearl-water fish's base pay: 1 + floor(depth / pearlStep), before `PEARLS.step` for how far over the gear it is. */
  pearlStep: 20,
  /**
   * The haul's bonus grows by this, compounding, at each marker reached whose stretch was pearl water (`PEARLS`):
   * x1.25, x1.56, x1.95 ... (`haulBonus`). Markers reached in easy water add nothing.
   */
  haulGrow: 0.25,
  /** The most markers the bonus grows for; none for now (Infinity), kept so a play test can cap it. */
  haulCap: Infinity,
  /** Chance a bite is the zone's legend. */
  legendChance: 0.05,
  /** Seconds until a bite at sea: `biteMin` plus up to `biteSpread`. Casts at sea use no bait (Reed's boat has it). */
  biteMin: 2.5,
  biteSpread: 4,
  /** The rod a player must own to start a charter (`DEEP_SEA_ROD`); its levels are `ROD_LEVEL`. */
  rod: 'searod',
  /** How close to Captain Reed a dive can start, in metres. */
  standRange: 5,
  /** A dive waits this long for a player who disconnected mid-dive; after that it ends, keeping the haul without its bonus. */
  holdMs: 120_000,
};

/**
 * Pearls pay for fishing at the edge of the gear (Oscar, 2026-11-11, chosen with simulations; to be tuned after a play
 * test). `edgeSteps` (src/game/dive.ts) is how far a typical fish at a depth is over the Deep Sea Rod and Line on both
 * gaps together, in levels: 0 at the harbour with +0/+0, 2 more each marker, 1 less for each level on either track.
 */
export const PEARLS = {
  /** Pearl water: fish at least this many levels over the gear pay pearls; easier fish pay none (they still sell). */
  from: 0,
  /** Pay grows by this for each level over the gear: about 2^(1/6), so it doubles for each combined rung over. */
  step: 1.1225,
};

/** Combined rungs over the gear (strength gap plus weight gap) for `reach`: the edge of what a player can land, and past it. */
export const REACH_RUNGS = { hard: 2, over: 3 };

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
 * The Deep Sea Line (`SEA_LINE`) is the second track. The pearls are sized for charters that pay for fishing at the
 * edge of the gear (`PEARLS`; Oscar, 2026-11-11): at the best rate a level takes roughly 20 minutes for a quick player
 * and 40 for a careful one, and the climb reaches the Abyss at about +10 to +13 on both tracks. The coins keep rising
 * with the level, as charter income does with the deeper zones' dearer fish (REELING.md, "Sea economy"; Oscar,
 * 2026-11-01).
 */
export const ROD_LEVEL = {
  /** The rod that levels (`DEEP_SEA_ROD`). */
  rod: 'searod',
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls ... */
  pearls: 750,
  pearlsPer: 130,
  /**
   * ... and min(coinCap, coins + coinsPer·N) coins; the cap is only a safety net, reached past +54. A quarter under
   * the 75,000 + 6,000·N from before pearls paid for fishing at the edge (2026-11-11): edge fights are longer, so
   * charter fish earn fewer coins an hour, and this keeps the levels at about 55-75% of a quick player's charter coins.
   */
  coins: 55_000,
  coinsPer: 4_500,
  coinCap: 300_000,
  /** The rod's tip glow changes colour every this many levels (`GLOW_STEPS`). */
  glowEvery: 5,
};

/**
 * The Deep Sea Line's levels, the sea's second track: bought at Marlow's stall like the rod's, each making sea fish
 * pull weaker (`SEA_TIERS.level` of a tier off strength). The line comes on the Deep Sea Rod, so levelling it needs the rod; it's
 * only used at sea. Half the rod's coins, so charters pay for both tracks with coins to spare.
 */
export const SEA_LINE = {
  /** Going from +N-1 to +N costs pearls + pearlsPer·N Black Pearls, the same as the rod's ... */
  pearls: 750,
  pearlsPer: 130,
  /** ... and min(coinCap, coins + coinsPer·N) coins: half the rod's at every level. */
  coins: 27_500,
  coinsPer: 2_250,
  coinCap: 150_000,
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
