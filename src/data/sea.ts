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
  { id: 'kelp', name: 'Kelp Deep', from: 41 },
  { id: 'twilight', name: 'The Twilight', from: 81 },
  { id: 'abyss', name: 'The Abyss', from: 151 },
];

export const zoneAt = (depth: number): SeaZone => {
  let z = SEA_ZONES[0];
  for (const s of SEA_ZONES) if (depth >= s.from) z = s;
  return z;
};

/**
 * How rough the sea and sky are at each depth: 0 is the pond's calm sky over a choppy sea, 0.6 the
 * Drop-off's low cloud, fog, whitecaps and spray. It climbs steadily rather than stepping at zone
 * lines. Colours stop changing at 1, the end of the Drop-off; past it the swell, spray and roll keep
 * building: treacherous from the Twilight, insanity in the Abyss, which keeps climbing the deeper the
 * dive (Oscar, 2026-10-31: save the big seas for the deep zones, and make the Abyss crazy).
 * Kelp Deep and below keep the Drop-off palette until their own looks are decided.
 */
export const MOOD_POINTS: [depth: number, mood: number][] = [
  [1, 0],
  [16, 0.6],
  [40, 1],
  [80, 1.35],
  [150, 1.85],
  [200, 2],
  [350, 2.25],
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
 * Past mood 1, how far the deep zones have sunk into gloom (0..1, by mood 2): the sky, sea and fog
 * darken and close in. A first pass at the deep look (Oscar, 2026-10-31: "dark and gloomy, full of wave
 * sprays") until Kelp Deep, the Twilight and the Abyss get their own.
 */
export const gloomAt = (mood: number): number => Math.min(1, Math.max(0, mood - 1));

/**
 * How dark the sky gets at night out at sea (Oscar, 2026-10-31: much darker the further out). One knob
 * block to tweak: `points` are [league, darkness 0..1] (eased between), and `floor` is the share of the
 * sky's light that is left at the darkest (full night, darkness 1): 0 is pitch black, 0.05 a faint
 * indigo. Darkness 0 is the old look (75% dimmed at night); the Twilight (81) and the Abyss (151) sit
 * near black. Days are untouched: it only scales with how night it is.
 */
export const SEA_NIGHT_DARK = {
  points: [[1, 0], [16, 0.3], [41, 0.7], [81, 0.92], [151, 1]] as [league: number, dark: number][],
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
 * How hard spray hits the screen when the bow slams into a wave (0..1): from about depth 28 (mood 0.75)
 * to soaked by the Abyss, so the waves feel more treacherous the deeper the dive (Oscar, 2026-10-31).
 */
export const SCREEN_SPRAY = { from: 0.75, to: 2 };

/** How stormy the deep sea looks (0..1): foam on the swell's crests and faces, spindrift, streaks; from Kelp Deep to the Abyss. */
export const stormAt = (mood: number): number => smooth(1, 2.15, mood);

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
  /** Deck taken up by the wheelhouse, the fish boxes, the barrel and the net drum (x0, x1, z0, z1). */
  blocked: [
    [1.5, 3.7, -1.1, 1.1],
    [-0.45, 0.85, 0.5, 1.5],
    [-5.1, -4.5, 1.1, 1.8],
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
