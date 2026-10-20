/**
 * How each species looks: body shape, fins, colours and markings. The builder in
 * `src/game/fishmodel.ts` turns these into 3D models, and `src/game/fishicon.ts` into 2D icons.
 * The tier adds a consistent finish on top (matte → satin → bold → jewel sheen → spirit glow).
 */

/** Body silhouettes. Length is always 1 unit; these set height, width and where the bulk sits. */
export type Shape = 'slim' | 'round' | 'deep' | 'torpedo' | 'long' | 'eel' | 'whisker' | 'armored' | 'arowana';
export type TailKind = 'fork' | 'round' | 'lunate' | 'shark' | 'eel';
export type DorsalKind = 'small' | 'soft' | 'spiny' | 'long' | 'sail' | 'none';
export type Mark =
  | { k: 'stripe'; color: number; width?: number }
  | { k: 'bars'; color: number; n: number }
  | { k: 'spots'; color: number; n: number; size?: number }
  | { k: 'speckle'; color: number }
  | { k: 'patches'; color: number }
  | { k: 'earspot'; color: number }
  | { k: 'scales'; color: number }
  | { k: 'stars'; color: number }
  | { k: 'glowdots'; color: number };
export type Extra = 'barbels' | 'whiskers' | 'snout' | 'upmouth' | 'scutes' | 'lantern' | 'bigmouth';
/** Tier-5 spirit flourishes. */
export type Spirit = 'ghost' | 'flame' | 'aurora' | 'stars';

/**
 * Body proportions per silhouette. `h`/`w` are the half-height/half-width at the thickest point
 * (length is always 1), `peak` is where along the body (0 nose, 1 tail) that point sits,
 * `front`/`back` shape the taper (lower = blunter), and `sag` drops the belly.
 */
export const SHAPES: Record<Shape, { h: number; w: number; peak: number; front: number; back: number; sag: number }> = {
  slim: { h: 0.11, w: 0.065, peak: 0.36, front: 0.75, back: 0.85, sag: 0 },
  round: { h: 0.26, w: 0.08, peak: 0.42, front: 0.5, back: 0.75, sag: 0.04 },
  deep: { h: 0.22, w: 0.11, peak: 0.38, front: 0.55, back: 0.8, sag: 0.1 },
  torpedo: { h: 0.15, w: 0.095, peak: 0.36, front: 0.6, back: 0.85, sag: 0.03 },
  long: { h: 0.11, w: 0.08, peak: 0.5, front: 0.85, back: 0.65, sag: 0.01 },
  eel: { h: 0.07, w: 0.06, peak: 0.25, front: 0.45, back: 0.32, sag: 0 },
  whisker: { h: 0.13, w: 0.14, peak: 0.24, front: 0.4, back: 0.75, sag: 0.04 },
  armored: { h: 0.11, w: 0.1, peak: 0.3, front: 0.95, back: 0.8, sag: 0 },
  arowana: { h: 0.14, w: 0.07, peak: 0.42, front: 0.8, back: 0.7, sag: 0.05 },
};

/** Thickness envelope (0..1) at position t along the body (0 nose, 1 tail). */
export function envelope(shape: Shape, t: number): number {
  const s = SHAPES[shape];
  const u = t < s.peak ? (0.5 * t) / s.peak : 0.5 + (0.5 * (t - s.peak)) / (1 - s.peak);
  const e = t < s.peak ? s.front : s.back;
  // Keep a little thickness at the tail root so the caudal fin has something to attach to.
  return Math.max(t > 0.5 ? 0.12 : 0, Math.pow(Math.max(0, Math.sin(Math.PI * u)), e));
}

export interface FishLook {
  shape: Shape;
  tail: TailKind;
  dorsal: DorsalKind;
  back: number;
  belly: number;
  fin: number;
  marks?: Mark[];
  extras?: Extra[];
  /** Glow and highlight colour for tiers 4-5. */
  accent?: number;
  spirit?: Spirit;
}

export const FISH_LOOK: Record<string, FishLook> = {
  // Tier 1 · Shallows: small, everyday fish in plain natural colours
  minnow: { shape: 'slim', tail: 'fork', dorsal: 'small', back: 0x8fa3ad, belly: 0xf2f6f8, fin: 0xb8c6cc, marks: [{ k: 'stripe', color: 0xdfe8ec, width: 0.05 }] },
  bluegill: { shape: 'round', tail: 'round', dorsal: 'spiny', back: 0x3f6f9a, belly: 0xf0b25a, fin: 0x5b7f9e, marks: [{ k: 'bars', color: 0x2c4f70, n: 6 }, { k: 'earspot', color: 0x152535 }] },
  carp: { shape: 'deep', tail: 'fork', dorsal: 'long', back: 0x7d6338, belly: 0xe2c48a, fin: 0x8c6a3c, marks: [{ k: 'scales', color: 0x5a4424 }], extras: ['barbels'] },

  // Tier 2 · Sport fish: the classics, with their real patterns
  perch: { shape: 'torpedo', tail: 'fork', dorsal: 'spiny', back: 0x6f8a2a, belly: 0xf3e3a0, fin: 0xe2742c, marks: [{ k: 'bars', color: 0x3a4a12, n: 6 }] },
  trout: { shape: 'torpedo', tail: 'fork', dorsal: 'soft', back: 0x5b7d5e, belly: 0xf2ece4, fin: 0x8a9d84, marks: [{ k: 'stripe', color: 0xe8728f, width: 0.12 }, { k: 'speckle', color: 0x2a3a2a }] },
  bass: { shape: 'torpedo', tail: 'round', dorsal: 'spiny', back: 0x4f6b2a, belly: 0xe9ecc6, fin: 0x63793a, marks: [{ k: 'stripe', color: 0x2c3a14, width: 0.1 }], extras: ['bigmouth'] },
  midnightcat: { shape: 'whisker', tail: 'round', dorsal: 'small', back: 0x2c3556, belly: 0xb9c2dc, fin: 0x3a4570, marks: [{ k: 'spots', color: 0x1a2038, n: 14, size: 0.03 }], extras: ['whiskers'] },

  // Tier 3 · Lake giants: big, bold predators and pond royalty
  koi: { shape: 'deep', tail: 'fork', dorsal: 'long', back: 0xf2f0ea, belly: 0xfbfaf6, fin: 0xffe2b8, marks: [{ k: 'patches', color: 0xff8a1f }], extras: ['barbels'] },
  pike: { shape: 'long', tail: 'fork', dorsal: 'small', back: 0x2f5a3c, belly: 0xe6e9c8, fin: 0x7a6a2a, marks: [{ k: 'spots', color: 0xd9e3a8, n: 26, size: 0.035 }], extras: ['bigmouth'] },
  gar: { shape: 'long', tail: 'round', dorsal: 'small', back: 0x6a7a44, belly: 0xe2e3c4, fin: 0x7d7a48, marks: [{ k: 'spots', color: 0x2f3518, n: 30, size: 0.03 }], extras: ['snout'] },
  lanterneel: { shape: 'eel', tail: 'eel', dorsal: 'long', back: 0x1f5f58, belly: 0x9de8cf, fin: 0x2c8c78, marks: [{ k: 'glowdots', color: 0x7dffd8 }], extras: ['lantern'], accent: 0x7dffd8 },

  // Tier 4 · Jewel fish: gem colours with a metallic sheen
  sturgeon: { shape: 'armored', tail: 'shark', dorsal: 'small', back: 0x8c96a8, belly: 0xf4f2ee, fin: 0xb7bfcc, marks: [{ k: 'scales', color: 0xffffff }], extras: ['scutes', 'barbels'], accent: 0xfff6e6 },
  arowana: { shape: 'arowana', tail: 'round', dorsal: 'long', back: 0xa3122a, belly: 0xff8a7a, fin: 0xd4243a, marks: [{ k: 'scales', color: 0xffd0c8 }], extras: ['upmouth', 'barbels'], accent: 0xff5a6e },
  dorado: { shape: 'torpedo', tail: 'lunate', dorsal: 'sail', back: 0x1d4fb8, belly: 0x9fd8ff, fin: 0x2f7be0, marks: [{ k: 'speckle', color: 0x0c2a6e }], accent: 0x6fc4ff },
  moonscale: { shape: 'torpedo', tail: 'fork', dorsal: 'soft', back: 0x6f7fc4, belly: 0xf2f4ff, fin: 0x9aa8e8, marks: [{ k: 'spots', color: 0xffffff, n: 10, size: 0.05 }], accent: 0xd8e2ff },

  // Tier 5 · Spirit fish: mythic versions of familiar fish
  ghostcarp: { shape: 'deep', tail: 'fork', dorsal: 'long', back: 0xd8ecff, belly: 0xffffff, fin: 0xb8dcff, marks: [{ k: 'scales', color: 0x9fcaff }], extras: ['barbels'], accent: 0x9fd8ff, spirit: 'ghost' },
  sunfire: { shape: 'torpedo', tail: 'fork', dorsal: 'sail', back: 0xd8380f, belly: 0xffd25a, fin: 0xff7a1a, marks: [{ k: 'stripe', color: 0xffe066, width: 0.12 }], accent: 0xffb02e, spirit: 'flame' },
  aurorapike: { shape: 'long', tail: 'fork', dorsal: 'sail', back: 0x137a74, belly: 0xb8fff0, fin: 0x2fe0c0, marks: [{ k: 'stripe', color: 0x8affd9, width: 0.08 }], extras: ['bigmouth'], accent: 0x7af0d8, spirit: 'aurora' },
  constellation: { shape: 'eel', tail: 'eel', dorsal: 'long', back: 0x1a1250, belly: 0x3a2f8a, fin: 0x6b5bd8, marks: [{ k: 'stars', color: 0xffffff }], accent: 0xb9a8ff, spirit: 'stars' },
};

/** Tier themes, shown as Fishdex section headers and on the catch card. */
export const TIER_THEME = ['Shallows', 'Sport fish', 'Lake giants', 'Jewel fish', 'Spirit fish'];

/** One-line Fishdex and catch-card descriptions. */
export const FISH_BLURB: Record<string, string> = {
  minnow: 'A flicker of silver in the shallows. Every angler starts here.',
  bluegill: 'Round, bold and always hungry. Look for the dark ear spot.',
  carp: 'A patient bottom-feeder that pulls harder than it looks.',
  perch: 'Striped and spiny, with fins like little orange flags.',
  trout: 'Its pink stripe flashes as it leaps for the bait.',
  bass: 'All mouth and attitude. It hits bait like a freight train.',
  midnightcat: 'Whiskers first, out of the dark. Only bites at night.',
  koi: 'The pond’s royalty. No two share the same patches.',
  pike: 'A long, toothy ambusher that lurks beside the reeds.',
  gar: 'An ancient needle-nosed hunter in spotted armour.',
  lanterneel: 'Follow the glowing lure after dark... carefully.',
  sturgeon: 'Armoured in pearl plates, older than the lake itself.',
  arowana: 'A ruby dragonfish that leaps clean out of the water.',
  dorado: 'A sapphire sprinter with a sail fin and endless stamina.',
  moonscale: 'Its moonstone spots only glint under the night sky.',
  ghostcarp: 'Half here, half not. Some say it is the lake’s memory.',
  sunfire: 'Flames dance along its back. Hot to the touch!',
  aurorapike: 'Ribbons of the northern lights trail in its wake.',
  constellation: 'A slice of the night sky that learned to swim.',
};
