/**
 * How each species looks: body shape, fins, colours and markings. The builder in
 * `src/game/fishmodel.ts` turns these into 3D models, and `src/game/fishicon.ts` into 2D icons.
 * The tier adds a consistent finish on top (matte → satin → bold → jewel sheen → spirit glow).
 */

import type { AbyssParts } from './seaparts/abyss';
import type { KelpParts } from './seaparts/kelp';
import type { TwilightParts } from './seaparts/twilight';

/** Body silhouettes. Length is always 1 unit; these set height, width and where the bulk sits. The last five are the deep sea's. */
export type Shape = 'slim' | 'round' | 'deep' | 'torpedo' | 'long' | 'eel' | 'whisker' | 'armored' | 'arowana' | 'ribbon' | 'bulb' | 'gulper' | 'mantle' | 'plated';
export type TailKind = 'fork' | 'round' | 'lunate' | 'shark' | 'eel' | 'squid' | 'none';
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
/** The deep sea zones' finishes, their answer to the lake's tiers: Kelp Deep, the Twilight, the Abyss. */
export type SeaFinish = 'overgrown' | 'lit' | 'abyssal';

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
  // The deep sea's: the oarfish's ribbon, the Abyss's bulbs, the gulper's head-heavy body, squid mantles and armour.
  ribbon: { h: 0.055, w: 0.025, peak: 0.12, front: 0.5, back: 0.18, sag: 0 },
  bulb: { h: 0.3, w: 0.22, peak: 0.42, front: 0.5, back: 0.6, sag: 0.05 },
  gulper: { h: 0.12, w: 0.09, peak: 0.1, front: 0.3, back: 0.4, sag: 0.02 },
  mantle: { h: 0.17, w: 0.13, peak: 0.25, front: 0.55, back: 0.9, sag: 0 },
  plated: { h: 0.17, w: 0.13, peak: 0.3, front: 0.7, back: 0.7, sag: 0.03 },
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
  /** A deep sea zone's finish, drawn by that zone's module in `src/game/seafish/`. */
  finish?: SeaFinish;
  /** 'none' leaves out the usual pair of eyes, for fish whose zone module draws its own. */
  eye?: 'none';
  /** Each deep zone's own parts (frills, lights, tentacles...), built by `src/game/seafish/<zone>.ts`. */
  kelp?: KelpParts;
  twilight?: TwilightParts;
  abyss?: AbyssParts;
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

  // Sea · Shelf and Drop-off: plain tier-5 gear, no spirit (the finish is the lake-giant one)
  pewtercod: { shape: 'torpedo', tail: 'round', dorsal: 'soft', back: 0x6f8294, belly: 0xe4e8e6, fin: 0x8296a6, marks: [{ k: 'speckle', color: 0x3a4a58 }], extras: ['barbels'] },
  snapper: { shape: 'deep', tail: 'fork', dorsal: 'spiny', back: 0xc4552e, belly: 0xf6c9a0, fin: 0xe0703a, marks: [{ k: 'scales', color: 0xf0a070 }] },
  grouper: { shape: 'deep', tail: 'round', dorsal: 'spiny', back: 0x5e6b48, belly: 0xcbbf8e, fin: 0x7a6a3a, marks: [{ k: 'patches', color: 0xa8a06a }, { k: 'spots', color: 0xe8e4d0, n: 12, size: 0.03 }], extras: ['bigmouth'] },
  galemackerel: { shape: 'slim', tail: 'lunate', dorsal: 'small', back: 0x1f6f8f, belly: 0xe8f4f6, fin: 0x4a8fa8, marks: [{ k: 'bars', color: 0x143f58, n: 9 }] },
  irontuna: { shape: 'torpedo', tail: 'lunate', dorsal: 'soft', back: 0x1b3a6e, belly: 0xdfe8f2, fin: 0xe8c548, marks: [{ k: 'stripe', color: 0xc9d6e6, width: 0.05 }] },
  marlin: { shape: 'torpedo', tail: 'lunate', dorsal: 'sail', back: 0x153f8a, belly: 0xe6f0fa, fin: 0x3a7fd0, marks: [{ k: 'bars', color: 0x6fb4ff, n: 10 }], extras: ['snout'], accent: 0x7fd0ff },

  // Sea · Kelp Deep, Overgrown: leafy frills, bold bars and spines, with a gloss (parts: `kelp`, src/game/seafish/kelp.ts)
  frondback: { shape: 'long', tail: 'round', dorsal: 'soft', back: 0x8a8a2e, belly: 0xf0d77a, fin: 0xb6d65a, marks: [{ k: 'bars', color: 0xe6c85a, n: 7 }], extras: ['snout'], accent: 0xc8f06a, finish: 'overgrown', kelp: { frills: { n: 7, color: 0x9fcf4a, size: 0.17, belly: true } } },
  lionfish: { shape: 'deep', tail: 'round', dorsal: 'small', back: 0xc0532c, belly: 0xf6e4c8, fin: 0xf3d2b0, marks: [{ k: 'bars', color: 0x7a2a14, n: 9 }], accent: 0xffb07a, finish: 'overgrown', kelp: { spines: { n: 9, len: 0.3, color: 0x8a2c14, flag: 0xf3d2b0, stripe: 0x9a3a1c }, fans: { color: 0xf3d2b0, stripe: 0x9a3a1c } } },
  wolfeel: { shape: 'whisker', tail: 'eel', dorsal: 'long', back: 0x56707e, belly: 0xc9d0c2, fin: 0x6f8794, marks: [{ k: 'bars', color: 0x2c3d48, n: 5 }, { k: 'spots', color: 0x2c3d48, n: 20, size: 0.028 }], extras: ['bigmouth'], accent: 0xb8d0dc, finish: 'overgrown', kelp: { teeth: { n: 4, color: 0xf6efd8, jowl: 0xb8c4c0 } } },
  kelpbeard: { shape: 'deep', tail: 'round', dorsal: 'spiny', back: 0x3c6b38, belly: 0xdcc98c, fin: 0x74b04c, marks: [{ k: 'scales', color: 0xe8d890 }], extras: ['bigmouth'], accent: 0xc8f06a, finish: 'overgrown', kelp: { crown: { n: 6, color: 0x8fd04a, size: 0.26 }, beard: { n: 9, color: 0x6aa83a, len: 0.3 }, motes: 6 } },
  kelpwyrm: { shape: 'eel', tail: 'eel', dorsal: 'long', back: 0x2e5a3a, belly: 0xbad98a, fin: 0x7fc24a, marks: [{ k: 'stripe', color: 0x9fcf4a, width: 0.06 }], accent: 0xc8f06a, finish: 'overgrown', kelp: { frills: { n: 11, color: 0x7fc24a, size: 0.15, belly: true, flanks: true }, horns: { len: 0.2, color: 0xe8e0b8 }, motes: 6 } },

  // Sea · The Twilight, Lit from within: dark bodies, glowing lights and lures (parts: `twilight`, src/game/seafish/twilight.ts)
  hatchet: { shape: 'round', tail: 'fork', dorsal: 'small', back: 0x9fb6cc, belly: 0xeef6ff, fin: 0xc8dcef, marks: [{ k: 'bars', color: 0x7f9ab4, n: 7 }], accent: 0x6fd8ff, finish: 'lit', eye: 'none', twilight: { glass: true, tubeEye: true, tailH: 0.7, lights: { n: 8, from: 0.12, to: 0.78, row: 'belly', color: 0x6fd8ff, r: 0.012 } } },
  fangjaw: { shape: 'long', tail: 'fork', dorsal: 'small', back: 0x1c1834, belly: 0x3a3366, fin: 0x4a3f86, marks: [{ k: 'bars', color: 0x2a2450, n: 8 }], extras: ['bigmouth'], accent: 0x5ae0ff, finish: 'lit', eye: 'none', twilight: { fangs: { n: 5, len: 0.1 }, chinLure: 0xff4a6a, tailH: 0.7, wave: [0.028, 1], eye: { t: 0.14, r: 0.028, color: 0x5ae0ff }, lights: { n: 12, from: 0.12, to: 0.88, row: 'flank', color: 0x5ae0ff, r: 0.009 } } },
  lanternshark: { shape: 'torpedo', tail: 'shark', dorsal: 'small', back: 0x2a2442, belly: 0x5a4c8a, fin: 0x3a3260, marks: [{ k: 'bars', color: 0x1c1832, n: 6 }], accent: 0x9a8aff, finish: 'lit', eye: 'none', twilight: { eye: { t: 0.1, r: 0.03, color: 0xc4ff6a }, lights: { n: 10, from: 0.16, to: 0.84, row: 'belly', color: 0x9a8aff, r: 0.011 } } },
  oarfish: { shape: 'ribbon', tail: 'none', dorsal: 'none', back: 0xd8e0ee, belly: 0xf4f7ff, fin: 0xff3a5a, marks: [{ k: 'spots', color: 0x8a9ab8, n: 30, size: 0.025 }], accent: 0xff7a9a, finish: 'lit', eye: 'none', twilight: { crest: true, wave: [0.085, 1.3], eye: { t: 0.07, r: 0.024, color: 0xff7a9a } } },
  chandelier: { shape: 'bulb', tail: 'round', dorsal: 'none', back: 0x2c2040, belly: 0x5a4870, fin: 0x45365e, marks: [{ k: 'bars', color: 0x1c1430, n: 7 }], accent: 0xffd27a, finish: 'lit', eye: 'none', twilight: { lures: { n: 5, color: 0xffd27a }, fangs: { n: 7, len: 0.05, grin: true }, tailH: 0.7, eye: { t: 0.2, r: 0.055, color: 0xffd27a } } },

  // Sea · The Abyss, Abyssal: impossible anatomy in a violet aura (parts: `abyss`, src/game/seafish/abyss.ts)
  lurker: { shape: 'bulb', tail: 'round', dorsal: 'soft', back: 0x5a3a7c, belly: 0xc0a2de, fin: 0x8a68b2, marks: [{ k: 'speckle', color: 0x3c2458 }], extras: ['bigmouth'], accent: 0xd6ff6a, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.15, r: 0.09, up: 0.3, pupil: 'slit' }, eyes: { n: 13, r: [0.03, 0.07] } } },
  gulper: { shape: 'gulper', tail: 'none', dorsal: 'long', back: 0x241d34, belly: 0x463858, fin: 0x3a2e52, accent: 0xff5a7a, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.24, r: 0.036, up: 0.45 }, jaw: 0xd65a8a, whip: 0xff4a5a } },
  krakenspawn: { shape: 'mantle', tail: 'none', dorsal: 'none', back: 0x8a2a4c, belly: 0xf0a2b4, fin: 0xb84a6a, marks: [{ k: 'spots', color: 0xffd0dc, n: 10, size: 0.03 }], accent: 0xff8ab0, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.15, r: 0.072, up: 0.25, pupil: 'bar' }, tentacles: { n: 6, len: 0.52, r: 0.036, color: 0xb03a5e, dir: 'forward', suckers: 0xffd0dc }, squidFins: 1 } },
  boneserpent: { shape: 'eel', tail: 'eel', dorsal: 'none', back: 0xe8e0cc, belly: 0xcab89c, fin: 0xf2ecdc, accent: 0x7affd8, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.07, r: 0.034, up: 0.35, pupil: 'lamp' }, ribs: { n: 10, color: 0x6a5a48 }, spines: { n: 18, len: 0.11, color: 0xf2ecdc }, horns: { n: 2, len: 0.2, color: 0xf2ecdc }, fangs: 2, wave: { amp: 0.06, freq: 1.3 } } },
  leviathan: { shape: 'plated', tail: 'shark', dorsal: 'none', back: 0x2c2c42, belly: 0x4c3c44, fin: 0x3e3a56, extras: ['bigmouth'], accent: 0xff7a2a, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.1, r: 0.045, up: 0.3, iris: 0xffb02e, pupil: 'slit' }, eyeRow: 2, seams: { n: 4, color: 0xff6a1a }, spines: { n: 10, len: 0.14, color: 0xf4e8cc }, horns: { n: 3, len: 0.3, color: 0xf4e8cc }, fangs: 3, tentacles: { n: 5, len: 0.22, r: 0.016, color: 0x9a86c0, dir: 'down' } } },
  dreamer: { shape: 'bulb', tail: 'round', dorsal: 'soft', back: 0x2c6a5c, belly: 0x9ad8b8, fin: 0x4a9a7c, accent: 0x9affd0, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.16, r: 0.075, up: 0.35 }, eyes: { n: 6, r: [0.026, 0.05] }, tentacles: { n: 8, len: 0.6, r: 0.042, color: 0x2f7a62, dir: 'down' }, halo: true } },
  kraken: { shape: 'mantle', tail: 'none', dorsal: 'none', back: 0x6a1a36, belly: 0xe07a96, fin: 0x9a2a50, marks: [{ k: 'spots', color: 0xffc8d6, n: 14, size: 0.03 }], accent: 0xff6a9a, finish: 'abyssal', eye: 'none',
    abyss: { eye: { t: 0.17, r: 0.1, up: 0.25, iris: 0xffc23a, pupil: 'bar' }, tentacles: { n: 9, len: 0.9, r: 0.075, color: 0x8a2246, dir: 'forward', suckers: 0xffc8d6 }, squidFins: 1.35 } },
};

/** Tier themes, shown as Fishdex section headers and on the catch card. */
/** The Fishdex Sea page's theme, for the sea fish (which are tier 5 for gear but not part of the pond ladder). */
export const SEA_THEME = 'Sea fish';
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
  pewtercod: 'Dull as a pewter plate, with a chin whisker and a hunger to match.',
  snapper: 'Scales like beaten copper. It snaps at the bait before you see it.',
  grouper: 'The Shelf’s grandmother. Slow, ancient and far bigger than you.',
  galemackerel: 'Barred like the sea in a storm. It runs in a blur at the edge of the drop.',
  irontuna: 'A blue-steel torpedo with a golden fin. Built to pull a boat.',
  marlin: 'A sail on its back, a spear on its nose. The storm itself, on a line.',
  frondback: 'Half fish, half seaweed. You only see it when it bites.',
  lionfish: 'A bouquet of striped spines, and every one of them is angry.',
  wolfeel: 'It cracks crabs like walnuts. It would like to try your line next.',
  kelpbeard: 'The forest grew up around him. Some say he planted it.',
  kelpwyrm: 'What sailors call a kelp forest, the Kelpwyrm calls its mane.',
  hatchet: 'So thin you can read through it. Its belly glows so nothing below can see it.',
  fangjaw: "Its teeth don't fit in its mouth. That's your problem now.",
  lanternshark: 'It hunts by its own light, and it can see yours.',
  oarfish: 'Every sea serpent sailors swore they saw. It is real, it is long, and it is on your line.',
  chandelier: 'Five lights in the dark, and one very large smile.',
  lurker: 'It sees you from every side. Mostly it sees dinner.',
  gulper: 'A mouth with a fish attached. It can swallow things bigger than itself.',
  krakenspawn: 'Every kraken starts small. This one is still bigger than your boat.',
  boneserpent: 'A skeleton that never got the news. It still bites.',
  leviathan: 'The oldest name for fear on the sea. It has waited a long time for a line strong enough.',
  dreamer: 'Sailors say the sea is its dream. Try not to wake it.',
  kraken: 'Not technically a fish. Try telling it that.',
};
