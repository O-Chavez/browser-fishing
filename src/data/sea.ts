/**
 * The open sea the dives fish on: its zones, how rough each depth looks, the swell, and the charter
 * boat's deck. Pure data and maths (no three.js), shared by the walkable deck (`env.ts`), the sea's
 * shader (`sea.ts`) and the server.
 */

export interface SeaZone {
  id: string;
  name: string;
  /** First depth of the zone. */
  from: number;
}

export const SEA_ZONES: SeaZone[] = [
  { id: 'shelf', name: 'The Shelf', from: 1 },
  { id: 'dropoff', name: 'The Drop-off', from: 16 },
  { id: 'kelp', name: 'Kelp Deep', from: 36 },
  { id: 'twilight', name: 'The Twilight', from: 61 },
  { id: 'abyss', name: 'The Abyss', from: 91 },
];

export const zoneAt = (depth: number): SeaZone => {
  let z = SEA_ZONES[0];
  for (const s of SEA_ZONES) if (depth >= s.from) z = s;
  return z;
};

/**
 * The depth the sea is drawn at for a charter's zone (0 the Shelf ... 4 the Abyss) and Abyss marker: about the middle
 * of each zone's stretch of looks (`SEA_LOOK_DEPTH`), and in the Abyss `abyss.from + abyss.per·(marker − 1)`, rougher
 * each marker, up to `abyss.cap`.
 */
export const SEA_LOOK_DEPTH = { zones: [8, 26, 48, 76], abyss: { from: 100, per: 3, cap: 250 } };

export function seaDepthFor(zone: number, marker = 1): number {
  const z = Math.max(0, Math.min(SEA_ZONES.length - 1, Math.floor(zone)));
  const a = SEA_LOOK_DEPTH.abyss;
  if (z < SEA_LOOK_DEPTH.zones.length) return SEA_LOOK_DEPTH.zones[z];
  return Math.min(a.cap, a.from + a.per * (Math.max(1, Math.floor(marker)) - 1));
}

/**
 * How rough the sea and sky are at each depth: 0 is the pond's calm sky over a choppy sea, 0.6 the
 * Drop-off's low cloud, fog, whitecaps and spray. It climbs steadily rather than stepping at zone
 * lines. Colours stop changing at 1, the end of the Drop-off; past it the swell, spray and roll keep
 * building: treacherous from the Twilight, insanity in the Abyss, which keeps climbing the deeper the
 * dive (Oscar, 2026-10-31: save the big seas for the deep zones, and make the Abyss crazy).
 * Past the Drop-off each zone has its own colours (`DEEP_LOOKS`).
 */
export const MOOD_POINTS: [depth: number, mood: number][] = [
  [1, 0],
  [16, 0.6],
  [35, 1],
  [60, 1.35],
  [90, 1.85],
  [120, 2],
  [210, 2.25],
];

export function seaMood(depth: number): number {
  const p = MOOD_POINTS;
  if (depth <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    const [d1, m1] = p[i];
    if (depth <= d1) {
      const [d0, m0] = p[i - 1];
      return m0 + ((depth - d0) / (d1 - d0)) * (m1 - m0);
    }
  }
  return p[p.length - 1][1];
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Past mood 1, how far the deep zones have sunk into gloom (0..1, by mood 2): the fog closes in, the music
 * ducks and the night light dims. The colours themselves come from `DEEP_LOOKS`.
 */
export const gloomAt = (mood: number): number => Math.min(1, Math.max(0, mood - 1));

/** A deep zone's daytime colours and light. Colours are sRGB hex. */
export interface DeepLook {
  /** Sky at the horizon (also the fog) and overhead. */
  skyH: number;
  skyT: number;
  /** Water near the boat and far off. */
  water: number;
  deep: number;
  /** The same two at full night, and how many times brighter than the day's colours the little night sky light is. */
  nightWater: number;
  nightDeep: number;
  nightLift: number;
  /** The cloud deck's lit tops and shaded undersides. */
  cloudTop: number;
  cloudBot: number;
  foam: number;
  /** The sky light's colour and strength, and the sun's strength, by day. */
  hemiCol: number;
  hemi: number;
  sun: number;
  /** How much of the sun's glare on the water is left (0..1). */
  glare: number;
  /** How far the boat's lamps are lit by day (0..1). */
  lamps: number;
}

/**
 * The deep zones' looks (Oscar, 2026-11-10, picked from in-game mockups): the Drop-off's lilac overcast carries on
 * over Kelp Deep and only the water turns kelp green; the Twilight is a standing dusk, a rose horizon under indigo
 * cloud over violet water; the Abyss is dark plum by day with the boat's lamps lit, and at night keeps enough light
 * on the water to see the swell by (Oscar, 2026-11-10: its night was too dark to see much). `dropoff` is the look the
 * Drop-off ends on (mood 1), which the Shelf's sky blends toward. One block to tweak after a play test.
 */
export const DEEP_LOOKS = {
  dropoff: { skyH: 0xc8bcc6, skyT: 0x8c86a0, water: 0x3f6674, deep: 0x2a3a4e, nightWater: 0x10191d, nightDeep: 0x0e131a, nightLift: 1, cloudTop: 0xc4bac6, cloudBot: 0x8a8094, foam: 0xf6f4f2, hemiCol: 0xc6c3d0, hemi: 1.54, sun: 1.35, glare: 1, lamps: 0 },
  kelp: { skyH: 0xc2bcc0, skyT: 0x7f8496, water: 0x256b58, deep: 0x0c3530, nightWater: 0x091b16, nightDeep: 0x041110, nightLift: 1, cloudTop: 0xbcb6ba, cloudBot: 0x7c7a88, foam: 0xf6f4f2, hemiCol: 0xc8c8d0, hemi: 1.45, sun: 1.15, glare: 0, lamps: 0 },
  twilight: { skyH: 0xd79a8c, skyT: 0x4a3f78, water: 0x4a4f86, deep: 0x232450, nightWater: 0x121421, nightDeep: 0x0c0c1a, nightLift: 1, cloudTop: 0x9a7fa6, cloudBot: 0x4f456f, foam: 0xf6f4f2, hemiCol: 0xd0b8cc, hemi: 1.15, sun: 0.8, glare: 0, lamps: 0.5 },
  abyss: { skyH: 0x3d2f4d, skyT: 0x0d0a16, water: 0x1a1b30, deep: 0x07070f, nightWater: 0x222c4c, nightDeep: 0x121830, nightLift: 8, cloudTop: 0x3a2f48, cloudBot: 0x17121f, foam: 0xb8b4c8, hemiCol: 0xa89cc8, hemi: 0.5, sun: 0.25, glare: 0, lamps: 1 },
} satisfies Record<string, DeepLook>;

/**
 * Where each look is fully in, by marker; between two stops the looks blend, so a zone's colours ease in over the
 * markers either side of its line (36, 61, 91) instead of snapping.
 */
export const DEEP_LOOK_STOPS: [depth: number, look: DeepLook][] = [
  [35, DEEP_LOOKS.dropoff],
  [42, DEEP_LOOKS.kelp],
  [56, DEEP_LOOKS.kelp],
  [65, DEEP_LOOKS.twilight],
  [86, DEEP_LOOKS.twilight],
  [97, DEEP_LOOKS.abyss],
];

const mixHex = (a: number, b: number, t: number): number => {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The deep look for a sea mood: the Drop-off's up to mood 1, then each zone's, blended between `DEEP_LOOK_STOPS`. */
export function deepLookAt(mood: number): DeepLook {
  const s = DEEP_LOOK_STOPS;
  if (mood <= seaMood(s[0][0])) return s[0][1];
  for (let i = 1; i < s.length; i++) {
    const m1 = seaMood(s[i][0]);
    if (mood > m1) continue;
    const a = s[i - 1][1], b = s[i][1];
    if (a === b) return a;
    const m0 = seaMood(s[i - 1][0]);
    const t = (mood - m0) / (m1 - m0);
    const out = {} as DeepLook;
    for (const k of Object.keys(a) as (keyof DeepLook)[])
      out[k] = k === 'nightLift' || k === 'hemi' || k === 'sun' || k === 'glare' || k === 'lamps' ? a[k] + (b[k] - a[k]) * t : mixHex(a[k], b[k], t);
    return out;
  }
  return s[s.length - 1][1];
}

/**
 * How dark the sky gets at night out at sea (Oscar, 2026-10-31: much darker the further out). One knob
 * block to tweak: `points` are [league, darkness 0..1] (eased between), and `floor` is the share of the
 * sky's light that is left at the darkest (full night, darkness 1): 0 is pitch black, 0.05 a faint
 * indigo. Darkness 0 is the old look (75% dimmed at night); the Twilight (61) and the Abyss (91) sit
 * near black. Days are untouched: it only scales with how night it is.
 */
export const SEA_NIGHT_DARK = {
  points: [[1, 0], [16, 0.3], [36, 0.7], [61, 0.92], [91, 1]] as [league: number, dark: number][],
  floor: 0.04,
};

/** The night-sky darkness (0..1) for a sea mood, following `SEA_NIGHT_DARK.points` by league. */
export function nightDarkAt(mood: number): number {
  const p = SEA_NIGHT_DARK.points.map(([d, k]) => [seaMood(d), k] as const);
  if (mood <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (mood <= p[i][0]) {
      const [m0, k0] = p[i - 1];
      const [m1, k1] = p[i];
      return k0 + ((mood - m0) / (m1 - m0)) * (k1 - k0);
    }
  }
  return p[p.length - 1][1];
}

/** The share of light the sea's night sky keeps: 0.25 at darkness 0 (the old look), `floor` at 1. */
export const nightSkyKeep = (n: number, dark: number): number =>
  1 - n * (0.75 + (1 - SEA_NIGHT_DARK.floor - 0.75) * dark);

/**
 * How hard spray hits the screen when the bow slams into a wave (0..1): from about depth 23 (mood 0.75)
 * to soaked by the Abyss, so the waves feel more treacherous the deeper the dive (Oscar, 2026-10-31).
 */
export const SCREEN_SPRAY = { from: 0.75, to: 2 };

/** How stormy the deep sea looks (0..1): foam on the swell's crests and faces, spindrift, streaks; from Kelp Deep to the Abyss. */
export const stormAt = (mood: number): number => smooth(1, 2.15, mood);

/**
 * How hard it rains (0..1): from Kelp Deep's first markers (mood 1 is marker 35), a steady rain there, heavier in
 * the Twilight and lashing in the Abyss.
 */
export const rainAt = (mood: number): number => 0.5 * smooth(1, 1.12, mood) + 0.5 * smooth(1.2, 2, mood);

/**
 * The rain's look, to tune after a play test: how many streaks at the heaviest, the box round the camera they
 * fall through (m), a streak's width (m) and length (seconds of fall), how fast it falls and how fast the wind
 * carries it sideways (m/s, in Kelp Deep and in the Abyss), and how solid a streak is.
 */
export const RAIN = { streaks: 1600, box: [34, 22, 34] as [number, number, number], width: 0.014, streak: 0.05, fall: 15, blow: [5, 13] as [number, number], opacity: 0.42 };

/**
 * The marker buoy: where it rides off the starboard side while the boat is stopped at a marker (`rest`, `z`),
 * how far ahead it comes into view and how far astern it is gone, how quickly it drifts up, and its size, and its lamp's
 * colour, height and flash (`period` seconds, lit for `duty` of it).
 */
export const BUOY = { rest: 3.5, z: -9.5, from: 60, gone: -90, ease: 0.45, lamp: 0xffc860, lampY: 2.08, size: 1.25, period: 2.4, duty: 0.6 };

/**
 * The Shelf's gulls: how many, how big (1 is life size; they read small at a distance), their wingspan (m), the
 * circles they fly (radius and height, m; speed, m/s), the moods between which they peel away one by one
 * (0.6 is the Drop-off's line), and how far into the night they go to roost.
 */
export const GULLS = { count: 7, size: 2.2, span: 1.3, radius: [9, 28] as [number, number], height: [4.5, 11] as [number, number], speed: 7, leave: [0.12, 0.5] as [number, number], roost: 0.55 };

/**
 * The Shelf's water further out: the colour it deepens to toward the horizon by day, and how much of the haze
 * the far water keeps (1 is the old look, where the sea melted into the sky), so the horizon is a crisp line.
 * Both ease out toward the Drop-off (gone by mood `until`), where the overcast and fog take over.
 */
export const SHELF_FAR = { color: 0x1668a8, haze: 0.2, until: 0.6 };

/**
 * Kelp Deep's kelp (Oscar, 2026-11-10, picked from in-game mockups: rafts over the forest; the zone gets its
 * character from things on the water, not from more green): how many rafts of torn kelp drift on the swell
 * (0..1; 0.25 is sparse, 1 dense), how dark the patches are where the forest nears the surface (0..1), and the
 * kelp's two tones (golden-brown blades and their shade). To tune after a play test.
 */
export const KELP = { rafts: 0.55, forest: 1, color: 0x7a5a1e, shade: 0x3d2e12 };

/** How much of the kelp shows (0..1): it comes in over Kelp Deep's first markers and thins out before the Twilight's line (61). */
export const kelpAt = (mood: number): number => smooth(seaMood(36), seaMood(41), mood) * (1 - smooth(seaMood(55), seaMood(61), mood));

/** How often lightning strikes (0..1): from the Abyss's first depths (mood 1.85), more often the deeper. */
export const lightningAt = (mood: number): number => smooth(1.8, 2.2, mood);
export const screenSprayAt = (mood: number): number => Math.min(1, Math.max(0, (mood - SCREEN_SPRAY.from) / (SCREEN_SPRAY.to - SCREEN_SPRAY.from)));

/**
 * The sea: travelling waves whose lengths are fixed, so a change of mood never slides the pattern;
 * only their height and sharpness grow with it. Four shorter waves make the chop; a long, slow swell
 * rises from the Drop-off's end into huge seas by the Twilight (Oscar, 2026-10-31: "huge rising swells,
 * Deadliest Catch level seas"). The boat rides the swell whole, so it isn't cut down near the hull.
 */
export interface Wave {
  /** Unit direction of travel on the water (x, z). */
  dx: number;
  dz: number;
  /** Wavenumber, 2π / length. */
  k: number;
  /** Angular speed. */
  w: number;
  ph: number;
  /** Height at mood 0, at mood 1 (the Drop-off's end) and at mood 2 (the Abyss), straight lines between. */
  calm: number;
  rough: number;
  deep: number;
  /** Whether it's cut down near the boat (`NEAR_CUT`); the long swell isn't. */
  cut: boolean;
  /** Crest sharpness (Gerstner steepness) at mood 1. */
  steep: number;
}

const wave = (deg: number, len: number, calm: number, rough: number, deep: number, steep: number, cut = true): Wave => {
  const a = (deg * Math.PI) / 180;
  const k = (2 * Math.PI) / len;
  return { dx: Math.sin(a), dz: Math.cos(a), k, w: Math.sqrt(9.8 * k) * 0.8, ph: deg * 0.37, calm, rough, deep, cut, steep };
};

export const WAVES: Wave[] = [
  wave(20, 14, 0.2, 0.75, 1.15, 0.7),
  wave(-35, 8, 0.11, 0.32, 0.45, 0.7),
  wave(65, 4.2, 0.06, 0.11, 0.15, 0.6),
  wave(0, 30, 0.14, 0.5, 1.0, 0.4),
  // The long swell: 130 m and about 11 s crest to crest, quartering the boat. Big storm seas run long;
  // a shorter one this tall would be steeper than the boat can ride. (Oscar, 2026-10-31, preferred this
  // single swell with the chop growing alongside it over two crossing swells with lighter chop.)
  wave(35, 130, 0, 0, 3.0, 0.25, false),
];

/**
 * How wild the deep zones get, tuned by play test: `waves` multiplies each wave's growth past the
 * Drop-off (2 doubles the extra height), `tiltFollow` and `maxTilt` how much harder the boat pitches and
 * rolls per point of mood past 1 (see `tiltAt`).
 */
export const DEEP_TUNE = { waves: 3, tiltFollow: 2.2, maxTilt: 0.24 };

export const waveAmp = (w: Wave, mood: number): number =>
  Math.max(0, mood <= 1 ? w.calm + (w.rough - w.calm) * mood : w.rough + (w.deep - w.rough) * (mood - 1) * DEEP_TUNE.waves);

/**
 * Wave height is cut near the boat so swells can't climb over the low rails, and far away so the
 * horizon doesn't shimmer. Distances are from the boat, which sits at the origin.
 */
export const NEAR_CUT = { from: 6.5, to: 17, keep: 0.35 };
export const FAR_CUT = { from: 70, to: 260 };

const nearScale = (r: number): number => NEAR_CUT.keep + (1 - NEAR_CUT.keep) * smooth(NEAR_CUT.from, NEAR_CUT.to, r);
const farScale = (r: number): number => 1 - smooth(FAR_CUT.from, FAR_CUT.to, r);

/** How much of a wave's height shows at (x, z): cut near the boat (for the chop) and far away. */
export const waveScale = (x: number, z: number, cut = true): number => {
  const r = Math.hypot(x, z);
  return (cut ? nearScale(r) : 1) * farScale(r);
};

/** Height of the sea at (x, z) in the sea's own frame: the same sum the shader moves its vertices by. */
export function seaHeight(x: number, z: number, t: number, mood: number): number {
  const r = Math.hypot(x, z);
  const near = nearScale(r);
  const far = farScale(r);
  let h = 0;
  for (const w of WAVES) h += waveAmp(w, mood) * (w.cut ? near : 1) * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t + w.ph);
  return h * far;
}

/**
 * The charter boat. It sits at the origin with its bow toward +x and its starboard rail toward -z,
 * where players spawn looking out to sea toward the sun (as on the pond's pier). The deck stays flat in the world; the sea moves around it
 * (see `boatMotion`), so walking, avatars and drops need nothing special on board.
 */
export const BOAT = {
  /** Room for 3-5 players along the rails (Oscar, 2026-10-31). */
  len: 13,
  /** Half the beam at its widest. */
  beam: 2.2,
  deck: 0.45,
  /** Bulwark thickness. */
  wall: 0.12,
  /** Gap kept between a player's middle and the bulwarks. */
  margin: 0.3,
  spawn: { x: -1.6, z: 0.3, yaw: 0 },
  /** Middle of the wheelhouse along the boat; the open working deck runs aft of it to the net drum. */
  wheelhouse: 2.6,
  /** Deck taken up by the wheelhouse, the fish boxes, the cooler, the barrel, the pots and the net drum (x0, x1, z0, z1). */
  blocked: [
    [1.5, 3.7, -1.1, 1.1],
    [-0.45, 0.85, 0.5, 1.5],
    [-1.4, -0.45, 1.2, 2.3],
    [-5.1, -4.5, 1.1, 1.8],
    [-4.5, -3.45, 1.1, 2.3],
    [-7, -5.4, -3, 3],
  ] as [number, number, number, number][],
};

/** Hull half-width (outside of the planking) at a point along the boat, 0 past the ends. */
export function hullHalfWidth(x: number): number {
  const u = (x + BOAT.len / 2) / BOAT.len; // 0 stern .. 1 bow
  if (u < 0 || u > 1) return 0;
  const w = u < 0.5 ? 0.92 + 0.08 * Math.sin((u / 0.5) * Math.PI * 0.5) : Math.cos(((u - 0.5) / 0.5) * Math.PI * 0.5) * 0.97 + 0.03;
  return BOAT.beam * w;
}

/** The hull's side view, shared by the model (`boat.ts`) and the hole the sea's shader cuts for it: gunwale height (0 stern .. 1 bow), keel and chine depths. */
export const hullSheer = (u: number): number => 1.0 + 0.5 * Math.pow(u, 2.5);
export const KEEL = -0.9;
export const CHINE = -0.1;
export const hullChine = (u: number): number => CHINE + (hullSheer(u) - CHINE) * 0.15 * u * u;

export function onDeck(x: number, z: number): boolean {
  if (Math.abs(x) > BOAT.len / 2 - BOAT.margin) return false;
  if (Math.abs(z) > hullHalfWidth(x) - BOAT.wall - BOAT.margin) return false;
  return !BOAT.blocked.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
}

/** Inside the hull's outline, grown by `pad`: not open water. */
export const inHull = (x: number, z: number, pad = 0): boolean =>
  Math.abs(x) < BOAT.len / 2 + pad && Math.abs(z) < hullHalfWidth(Math.max(-BOAT.len / 2, Math.min(BOAT.len / 2, x))) + pad;

/**
 * How far the boat follows the swell's slope. Below 1 the hull rides flatter than the water, which
 * keeps the horizon steadier at eye height (a seasickness risk) through the Shelf and the Drop-off.
 * Past mood 1 it follows more, `DEEP_TUNE.tiltFollow` more per point of mood; tune by play test.
 */
export const TILT = 0.6;
/** Pitch and roll ease toward this bound, in radians: about 3° up to mood 1, then `DEEP_TUNE.maxTilt` more per point of mood. */
export const MAX_TILT = 0.055;

/** How far the boat follows the swell, and the bound on its tilt, at a mood. */
export const tiltAt = (mood: number): { follow: number; max: number } => {
  const deep = Math.max(0, mood - 1);
  return { follow: TILT * (1 + DEEP_TUNE.tiltFollow * deep), max: MAX_TILT + DEEP_TUNE.maxTilt * deep };
};

export interface BoatMotion {
  heave: number;
  /** Rotation about z (bow up is positive). */
  pitch: number;
  /** Rotation about x. */
  roll: number;
}

/** How the boat rides the swell at time `t`, from the sea under its bow, stern and sides. */
export function boatMotion(t: number, mood: number, out: BoatMotion = { heave: 0, pitch: 0, roll: 0 }): BoatMotion {
  // Sampled wider than the hull: a hull averages out short chop and rides the longer swell.
  const half = BOAT.len * 0.5;
  const side = BOAT.beam * 2;
  const bow = seaHeight(half, 0, t, mood);
  const stern = seaHeight(-half, 0, t, mood);
  const north = seaHeight(0, side, t, mood);
  const south = seaHeight(0, -side, t, mood);
  const { follow, max } = tiltAt(mood);
  // A soft limit, so the deck eases toward the bound instead of stopping dead at it.
  const clamp = (v: number) => max * Math.tanh(v / max);
  // Nearly all of the swell: the boat rides up and over it rather than letting it climb the rails.
  out.heave = ((bow + stern + north + south) / 4) * 0.95;
  // A rotation by a about z lifts +x by x·sin a; one about x lowers +z by z·sin a.
  out.pitch = clamp(Math.atan2(bow - stern, 2 * half) * follow);
  out.roll = clamp(-Math.atan2(north - south, 2 * side) * follow);
  return out;
}
