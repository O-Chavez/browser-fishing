import { COSMETICS, legendPieces } from './cosmetics';
import type { EmoteCamera } from '../game/emotes/types';

/**
 * Emotes (GAME_DESIGN.md §40): every account has the base four, the rest are bought. The casino's are designed but not
 * built yet, so there are none of that tier here; the deep sea four are sold by Captain Reed, in his Wardrobe tab, once
 * their gate is met.
 */
export type EmoteTier = 'base' | 'casino' | 'deep';

/** What a bought emote takes before it goes on sale: cosmetics owned, and other emotes owned. */
export interface EmoteGate {
  /** Cosmetic ids that must all be owned (a zone's set; the Abyss legends' sets with their pets). */
  pieces: string[];
  /** Emote ids that must all be owned. */
  emotes: string[];
  /** The gate in a few words, for the wheel and for Reed: "Own the Kelp Deep set". */
  text: string;
}

export interface EmoteDef {
  /** Never changes: saves, the wire and the look registry (`EMOTE_LOOKS`) use it. */
  id: string;
  /** The name on screen. */
  name: string;
  /** The wheel's icon. */
  icon: string;
  tier: EmoteTier;
  /** How long it plays, in seconds. */
  seconds: number;
  /** How the player's own view frames it (`ThirdPerson`). */
  camera: EmoteCamera;
  /**
   * Metres back for the camera when its usual distance (`CAM`, thirdperson.ts) can't fit the look: a tall or wide
   * scene. The design's own `cameraDistance`.
   */
  cameraDistance?: number;
  /** Bought emotes: what it takes to buy, the price (coins and Black Pearls, both), and who sells it. */
  gate?: EmoteGate;
  price?: EmotePrice;
  seller?: string;
}

/** What a bought emote costs: both are paid. */
export interface EmotePrice {
  coins: number;
  pearls: number;
}

const base = (id: string, name: string, icon: string, seconds: number): EmoteDef => ({ id, name, icon, tier: 'base', seconds, camera: 'behind' });

const zoneSet = (zone: number): string[] => COSMETICS.filter((c) => c.shop === 'zone' && c.zone === zone).map((c) => c.id);
const KELP_DEEP = 2;
const TWILIGHT = 3;
/** The Abyss's three legends with a set and a pet. */
const ABYSS_LEGENDS = ['leviathan', 'dreamer', 'kraken'];

const deep = (id: string, name: string, icon: string, seconds: number, price: EmotePrice, gate: EmoteGate, cameraDistance?: number): EmoteDef => ({
  id, name, icon, tier: 'deep', seconds, camera: 'cinematic', gate, price, seller: 'Captain Reed', ...(cameraDistance ? { cameraDistance } : {}),
});

/**
 * What the deep sea emotes cost, in coins and Black Pearls both (Oscar, 2026-11-16: "best estimations for each zone
 * and a notable achievement, especially the master one; not super easy to get but not overly difficult"). Defaults
 * for Oscar to tune, worked out from the charter sim (`npx tsx scripts/seaeconomy.ts`, the careful player):
 *
 * - Kelp Deep: its leg lasts about 2.2 hours at 0.5 to 1.15 million coins and 900 to 2,300 pearls an hour, and ends
 *   when the Deep lamps' 3,000 pearls are in. The set is 450,000 coins, and the sim holds about 650,000 as the Twilight
 *   opens. The emote is 300,000 coins (a step over the dearest piece, about 20 minutes there) and 1,000 pearls (a third
 *   of the Deep lamps, about half an hour): bought before the lamps it puts the Twilight off by that half hour, bought
 *   after them it is 15 to 25 minutes of the Twilight's pearls.
 * - The Twilight: about 5.9 hours at 1 to 2.4 million coins and 2,400 to 5,500 pearls an hour, toward the Iron keel's
 *   25,000 pearls. The set is 3 million coins. The emote is 2,000,000 coins (about 50 minutes) and 6,000 pearls (a
 *   quarter of the keel, a little over an hour there, or half an hour of the Abyss's).
 * - The Abyss: 3.2 to 4.9 million coins and 9,000 to 13,700 pearls an hour at the first marker, each marker 12% more;
 *   no boat part is left, so pearls pile up. Its gate is the three legends' sets and pets, 43.5 million coins of
 *   pieces, so whoever meets it has spent many hours out there. The emote is 8,000,000 coins (over the dearest piece,
 *   the 5 million pets) and 40,000 pearls (about three hours of first-marker pearls, under one past marker 10).
 * - Master of the Deep: priced for a player who uses Shiny Lures and levels the rod (Oscar, 2026-11-16: "the cost
 *   should be significant for players using lures; non lure players should know to use them"). Abyss pay compounds:
 *   a marker pays 12% more and a rod level costs 12% more, so a lured charter always buys about three levels and pay
 *   climbs by about a third a charter. The Abyss journey sim (`npx tsx scripts/abyssjourney.ts`) has that player own
 *   the three sets about 6 hours into the Abyss with a charter paying 7 to 26 million, where the first price
 *   (20,000,000 coins and 150,000 pearls) was a charter or two; a play tester at marker 67 made 2 billion a charter
 *   and proposed 250 million and a million pearls. At 250,000,000 coins and 1,000,000 pearls it comes 3 to 5 lured
 *   hours after the sets, near rod Abyss level 25, where a charter pays about 100 million; coins and pearls run out
 *   at about the same time. Each doubling adds only about an hour. Plain casts take 7 to 10 hours with the rod
 *   levelled, and about 46 with no Abyss levels at all.
 */
export const EMOTE_PRICES = {
  kelp: { coins: 300_000, pearls: 1_000 },
  twilight: { coins: 2_000_000, pearls: 6_000 },
  abyss: { coins: 8_000_000, pearls: 40_000 },
  master: { coins: 250_000_000, pearls: 1_000_000 },
} satisfies Record<string, EmotePrice>;

/** Every emote. Ids never change (saves keep the bought ones); names, icons and lengths can. */
export const EMOTES: EmoteDef[] = [
  // Lengths (and camera distances) of the picked looks (`WAVE_SECONDS`, `KELP_SECONDS` and so on in
  // `src/game/emotes/looks/`); a test keeps them in step.
  base('wave', 'Wave', '👋', 2.4),
  base('nice', 'Nice!', '👏', 2.6),
  base('yes', 'Yes', '✅', 2.2),
  base('no', 'No', '❌', 2.2),
  deep('kelp', 'Kelp Deep', '🌿', 9.5, EMOTE_PRICES.kelp, { pieces: zoneSet(KELP_DEEP), emotes: [], text: 'Own the Kelp Deep set' }),
  deep('twilight', 'The Twilight', '✨', 10, EMOTE_PRICES.twilight, { pieces: zoneSet(TWILIGHT), emotes: [], text: 'Own the Twilight set' }),
  // A toy Pelican on a patch of the Abyss's sea with the legends round her: its camera stands 5.5 m back (`ABYSS_SECONDS`, `ABYSS_CAMERA`).
  deep(
    'abyss',
    'The Abyss',
    '🐙',
    9.5,
    EMOTE_PRICES.abyss,
    {
      pieces: ABYSS_LEGENDS.flatMap((f) => legendPieces(f).map((c) => c.id)),
      emotes: [],
      text: "Own the Abyss's three legend sets and their pets",
    },
    5.5,
  ),
  // About 5 m tall and 3.4 m out: its camera stands 6.5 m back (`MASTER_SECONDS`, `MASTER_CAMERA`).
  deep('master', 'Master of the Deep', '🔱', 10.5, EMOTE_PRICES.master, { pieces: [], emotes: ['kelp', 'twilight', 'abyss'], text: 'Own the other three deep sea emotes' }, 6.5),
];

/** Emotes started closer together than this are dropped, here and by the server: one can be cut short and another started, but not spammed. */
export const EMOTE_GAP_MS = 1000;

export const emoteById = (id: unknown): EmoteDef | undefined => (typeof id === 'string' ? EMOTES.find((e) => e.id === id) : undefined);

/** How many emotes the wheel shows at once. */
export const WHEEL_SLOTS = 8;

/**
 * The wheel, clockwise from the top. The base four sit on the cross (up, right, down, left), the easiest directions
 * to hit, and the deep sea four on the diagonals between them. A longer list would be shown a page of `WHEEL_SLOTS`
 * at a time (`wheelPage`).
 */
export const WHEEL_ORDER: string[] = ['wave', 'kelp', 'yes', 'twilight', 'nice', 'abyss', 'no', 'master'];

/** The emotes on a page of the wheel (there is one page today), slot 0 at the top. */
export const wheelPage = (page = 0): EmoteDef[] =>
  WHEEL_ORDER.slice(page * WHEEL_SLOTS, (page + 1) * WHEEL_SLOTS).flatMap((id) => emoteById(id) ?? []);
