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
  /**
   * Night (the Twilight's atmosphere, 2026-11-19). `nightLook` 0 is the old night: the day's sky dimmed by
   * `nightSkyKeep`, the low cloud at 30%, the rain half white and the spray white. 1 blends instead, along `nightRamp`,
   * to the look's own night sky (`nightSkyH`, `nightSkyT`), cloud that darkens with it, the foam turned `nightFoam`, and
   * rain and spray that dim with the sky.
   */
  nightLook: number;
  nightSkyH: number;
  nightSkyT: number;
  nightFoam: number;
  /** The sky light's colour at night, its strength and the moon light's (times the old night's), and the boat's lamps at full night (0..1). */
  nightHemiCol: number;
  nightHemi: number;
  nightSun: number;
  nightLamps: number;
  /**
   * The hidden sun: a wide glow low on the horizon ahead of the rail, its path on the water and the cloud's undersides
   * lit by it (`glow` 0 is none), `glowCol` by day and `nightGlow` at night; `sunLow` how far the sun sinks to the
   * horizon (0..1); `sunCol` the sunlight's colour by day.
   */
  glow: number;
  glowCol: number;
  nightGlow: number;
  sunLow: number;
  sunCol: number;
  /** How much of the distance haze the low cloud takes (1 all of it; less keeps the cloud's own colours). */
  cloudHaze: number;
}

/** A look's night, hidden sun and cloud haze as they were before the Twilight's atmosphere: none of them changes a thing. */
const PLAIN = {
  nightLook: 0, nightSkyH: 0x241a3c, nightSkyT: 0x08061a, nightFoam: 0x8fb8e8, nightHemiCol: 0x7088cc, nightHemi: 1, nightSun: 1, nightLamps: 1,
  glow: 0, glowCol: 0xffb98a, nightGlow: 0x5a3e6a, sunLow: 0, sunCol: 0xfff0d6, cloudHaze: 1,
};

/** How far into its own night colours a `nightLook` sky is at nightness `n`: properly dark by about 0.7, so dusk and dawn don't go terracotta. */
export const nightRamp = (n: number): number => smooth(0.08, 0.72, n);

/**
 * The deep zones' looks (Oscar, 2026-11-10, picked from in-game mockups): the Drop-off's lilac overcast carries on
 * over Kelp Deep and only the water turns kelp green; the Twilight is a standing dusk, a rose horizon under indigo
 * cloud over violet water, with a hidden sun glowing low ahead of the rail by day and a deep violet night where the
 * jellies are the light (Oscar, 2026-11-19, "Last light" from a Fable 5.2 art review; he passed on sea mist); the
 * Abyss is dark plum by day with the boat's lamps lit, and at night keeps enough light on the water to see the swell
 * by (Oscar, 2026-11-10: its night was too dark to see much). `dropoff` is the look the
 * Drop-off ends on (mood 1), which the Shelf's sky blends toward. One block to tweak after a play test.
 */
export const DEEP_LOOKS = {
  dropoff: { ...PLAIN, skyH: 0xc8bcc6, skyT: 0x8c86a0, water: 0x3f6674, deep: 0x2a3a4e, nightWater: 0x10191d, nightDeep: 0x0e131a, nightLift: 1, cloudTop: 0xc4bac6, cloudBot: 0x8a8094, foam: 0xf6f4f2, hemiCol: 0xc6c3d0, hemi: 1.54, sun: 1.35, glare: 1, lamps: 0 },
  kelp: { ...PLAIN, skyH: 0xc2bcc0, skyT: 0x7f8496, water: 0x256b58, deep: 0x0c3530, nightWater: 0x091b16, nightDeep: 0x041110, nightLift: 1, cloudTop: 0xbcb6ba, cloudBot: 0x7c7a88, foam: 0xf6f4f2, hemiCol: 0xc8c8d0, hemi: 1.45, sun: 1.15, glare: 0, lamps: 0 },
  twilight: {
    ...PLAIN, skyH: 0xd79a8c, skyT: 0x4a3f78, water: 0x4a4f86, deep: 0x232450, nightWater: 0x1a1636, nightDeep: 0x0e0b22, nightLift: 1, cloudTop: 0x8676aa, cloudBot: 0x463e72, foam: 0xf2dcd8, hemiCol: 0xa898d8, hemi: 0.95, sun: 0.8, glare: 0, lamps: 0.5,
    nightLook: 1, nightHemiCol: 0x6a58b0, nightHemi: 0.47, nightSun: 0.4, nightLamps: 0.25, glow: 1, sunLow: 1, sunCol: 0xffc9a8, cloudHaze: 0.3,
  },
  abyss: { ...PLAIN, skyH: 0x3d2f4d, skyT: 0x0d0a16, water: 0x1a1b30, deep: 0x07070f, nightWater: 0x222c4c, nightDeep: 0x121830, nightLift: 8, cloudTop: 0x3a2f48, cloudBot: 0x17121f, foam: 0xb8b4c8, hemiCol: 0xa89cc8, hemi: 0.5, sun: 0.25, glare: 0, lamps: 1 },
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

/** The look's fields that are amounts, blended as numbers; the rest are colours. */
const LOOK_NUMBERS = new Set<keyof DeepLook>([
  'nightLift', 'hemi', 'sun', 'glare', 'lamps', 'nightLook', 'nightHemi', 'nightSun', 'nightLamps', 'glow', 'sunLow', 'cloudHaze',
]);

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
    for (const k of Object.keys(a) as (keyof DeepLook)[]) out[k] = LOOK_NUMBERS.has(k) ? a[k] + (b[k] - a[k]) * t : mixHex(a[k], b[k], t);
    return out;
  }
  return s[s.length - 1][1];
}

/**
 * The Abyss's look (Oscar's picks, 2026-11-19: the violet band, the whitecaps back): a standing night, the way the
 * Twilight is a standing dusk. It is laid over `DEEP_LOOKS.abyss` by `abyssAt`, so `amount` 0 is the old plum storm and
 * 1 the look below; one block to tune live, read every frame.
 *
 * The sky is near black whatever the clock says (`sky` overhead, `fog` at the horizon and in the fog), with a `band` of
 * dim storm-light on the horizon between the sea and the cloud base: `bandHeight` tall (the share of the way up the sky
 * at which it has faded to about a third), strongest out to sea and broken along the horizon by `bandBreak` (0 an even
 * ring). The far cloud is haze in front of it and lets `cloudBand` of it through, so the deck's skirts read as darker
 * shapes in the band. The clock still passes: the band, the foam and the light on the water keep `night` of their
 * brightness at full night. `cloud` is the deck's lit tops and shaded undersides, and `hemi` scales the sky light on the
 * deck and players (1 leaves it alone).
 *
 * The water is black and glassy (`water` near the boat, `deep` far off), and the swell reads at all times by the band's
 * light. It mirrors the band at glancing angles, so crests get a rim of light: `rim` is how strong that rim is on top of
 * the plain reflection, `rimWidth` how far up the mirrored sky the band reaches (wider lights more of each face), and
 * `rimBreak` how much it comes and goes along a crest with the chop (0 an even line on every crest, 1 thinning to
 * nothing in places). `crest` is how much of the band's light the top of each swell catches, and `face` the faint sheen
 * a face leaning toward the boat keeps, stepping in value from facet to facet, so a wall of water beside the boat
 * still has a surface (keep it below the rim).
 *
 * `foam` is the whitecaps: its `color`, and how much is left (0..1) of the storm's own foam (the `chop`'s, the foam down
 * the swell's `face`s, the wind `streak`s and the `caps` along the swell's crests; all gone); `hull` is how wide the
 * foam lapping the hull is (1 as in the other zones). In their place the Abyss has `lines`: a thin torn line of dim
 * foam lying along a breaking ridge just over its top (0 none; how far it goes toward the foam's colour, so under 1 it
 * stays a dim violet-grey). `lineWidth` is how far down the ridge's leading face a line reaches (as a slope, so a
 * sharper ridge carries a thinner line; never more than a metre or so of water or a few pixels), `lineHeight` how high
 * up the chop a ridge must stand to carry one, and `lineBare` about the share of ridges with none. None lie within
 * about 10 m of the boat, where the chop is cut down to humps. `spindrift`, `rain` and `screenSpray` are how bright
 * those stay against the black (1 is the white of the other zones), and `bowSpray` is the bow spray's colour in the
 * lamps.
 *
 * The boat is the only warm light. `pool` is the lamps' light on the water hugging the hull: its `color`, how strong
 * the soft glow is (`glow`; it tints the black water, so keep it low), full within `core` metres of the hull and gone by
 * `reach` (through the air, so a swell towering beside the boat is lit only at its foot), with a few thin glints along
 * the hull `glints` times as bright as the glow; `foam` is how much brighter the foam in it shows, and `rain` how many
 * times brighter than elsewhere the lamps catch the rain.
 *
 * Lightning silhouettes the world: `flash` lights the sky and the far haze from behind while the fog, the water and the
 * nearer cloud stay dark. `sky` is how bright the sky goes toward the bolt and `wide` the share of that on the far side
 * of the sky; `haze` is how much of it shows through the far cloud, `edge` how brightly the nearer cloud's rims catch
 * it; `glint` is the narrow hard light the water throws back and `crests` the light along the very edge of its crests;
 * `rain` is how much the rain catches, and `rim` the cold light (`rimColor`) on the boat, deck and players (the other
 * zones wash everything with 2.5 of near white), leaning `lean` of the way toward the bolt. `sheet` is sheet
 * lightning, a flicker inside the cloud with no bolt and no thunder: one every `every` seconds (where bolts are rarest,
 * and where they are most frequent), each `length` seconds long at `strength` of its brightness, lighting a patch of
 * cloud `size` wide (1 a tight patch, 0.2 a third of the sky): `cloud` is how brightly the cloud bodies glow there and
 * `sky` the gaps and the horizon near it.
 */
export const ABYSS = {
  amount: 1,
  band: 0x524478,
  bandHeight: 0.17,
  bandBreak: 0.35,
  cloudBand: 0.55,
  night: 0.72,
  sky: 0x050409,
  fog: 0x0d0a14,
  cloud: [0x17131f, 0x09070d] as [top: number, bottom: number],
  hemi: 1,
  water: 0x0a0c14,
  deep: 0x030407,
  rim: 1,
  rimWidth: 0.14,
  rimBreak: 0.55,
  crest: 0.17,
  face: 0.4,
  foam: { color: 0x6c6884, chop: 0, face: 0, streak: 0, caps: 0, hull: 0.4, lines: 0.8, lineWidth: 0.3, lineHeight: 0.45, lineBare: 0.1 },
  spindrift: 0.08,
  bowSpray: 0x8a6a48,
  rain: 0.2,
  screenSpray: 0.3,
  pool: { color: 0xffad59, glow: 0.05, core: 1.2, reach: 4.2, glints: 6, foam: 1.5, rain: 2.4 },
  flash: { color: 0xd9d6ff, sky: 1.3, wide: 0.12, haze: 0.7, edge: 1.2, glint: 1.2, crests: 0.3, rain: 0.35, rim: 0.4, rimColor: 0x8ea2e8, lean: 0.8 },
  sheet: { color: 0xb8a8f0, every: [5, 1.6] as [rare: number, often: number], length: [0.35, 0.9] as [number, number], strength: [0.35, 1] as [number, number], size: 0.45, cloud: 0.5, sky: 0.1 },
};

/**
 * How far the Abyss's own look is in (0..1): nothing through the Twilight, easing in over the same markers as its
 * colours (`DEEP_LOOK_STOPS`, 86 to 97), times `ABYSS.amount`.
 */
export function abyssAt(mood: number): number {
  const s = DEEP_LOOK_STOPS;
  const m0 = seaMood(s[s.length - 2][0]), m1 = seaMood(s[s.length - 1][0]);
  return ABYSS.amount * Math.min(1, Math.max(0, (mood - m0) / (m1 - m0)));
}

/**
 * How brightly a flicker of sheet lightning lights the cloud (0..1), `age` seconds into one `length` seconds long: it
 * swells and dies away, fluttering as it goes; `k` (0..1) gives each flicker its own flutter.
 */
export function sheetGlow(age: number, length: number, k = 0): number {
  if (age <= 0 || age >= length) return 0;
  const swell = Math.sin((Math.PI * age) / length) ** 0.6;
  return Math.min(1, swell * (0.6 + 0.4 * Math.sin(age * 41 + k * 6.283) * Math.sin(age * 17 + k * 11)));
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

/**
 * The Twilight's lantern jellies (Oscar, 2026-11-18, picked from in-game mockups): small jellies bobbing on the swell
 * with their domes just breaking the surface, each with a bright heart, a soft halo and a pool of light on the water
 * round it, in the Twilight set's three fish-light colours (cyan-white, lilac, peach). They are a night thing: by day
 * only `day` of them are up, within `dayReach` metres of the boat, as an omen: pastel domes in their own colours, the
 * bell at `dayBell` of its brightness and the halo and pool at `dayGlow` of their light. The rest surface one by one
 * through dusk, each at its own nightness between `rise` (taking `fade` to come up), and at full night the whole field
 * is out.
 *
 * `near`: about how many float within `ring` metres of the boat at once, each with a bell you can see, `starboard` the
 * share of them on the side players fish from. `far`: about how many float in the field past them out toward the
 * horizon; those within `bells` metres show their bells too (up to `bellCap` at once), and past that each is a halo and
 * a pool (out to `pools` metres, then just the halo), the halo growing up to `farHalo` times as wide and `farGlow`
 * times as bright to stand in for the bell, so they still read as jellies. They fade toward the fog but keep `floor` of
 * their light. Lite graphics keeps `liteFar` of the far ones and drops the pools. `size`: a bell's radius range (m).
 * `halo` and `pool`: how bright those are (1 is the mockup's); `poolRings`: how many rings of points a pool bends over
 * the waves by (fewer is cheaper). `sail`: how fast the boat makes its way through the field (m/s, bow to stern),
 * so the jellies go by the way the marker buoy falls astern (Oscar, 2026-11-18: "it looks like the boat is still
 * sailing through the zone"). `current`: the water's own slow drift on top of that (m/s, along the sea's x and z;
 * Kelp Deep's rafts drift about 0.55), each jelly wandering up to `wander` metres off its line; past each ring's rims they
 * fade out over `edge` metres, and come round again where they have faded to nothing.
 *
 * `legs` (Oscar, 2026-11-18: "slight jellyfish legs flowing on the water", so they read as jellyfish, not glowing
 * balls): every jelly showing its bell trails `threads` thin threads on the water behind it, the way it came, in a
 * narrow fan, each `length` bell widths long, with `arms` shorter, wider frilly arms (`armLength`) down the middle,
 * like the Twilight set's little jellies. A ripple runs down each from root to tip (`speed`, radians a second), swinging
 * up to `sway` of its length at the tip, a little harder (`kick`) as the bell beats. They are `width` and `armWidth`
 * metres wide at the root, brightest there at `glow` (and the arms `armGlow`) of the halo's light, and fade to nothing
 * at the tip, bending over the waves in `segments` pieces. They trail out to `reach` metres from the boat (past it
 * they are too fine to see); lite graphics keeps them on the near ring only. To tune after a play test.
 */
export const JELLIES = {
  colors: [0xdff2ff, 0xc8b4f4, 0xffb09a],
  size: [0.6, 1.05] as [number, number],
  near: { count: 27, ring: [5, 30] as [number, number], starboard: 0.65 },
  far: { count: 170, ring: [34, 240] as [number, number], bells: 50, bellCap: 16, pools: 120 },
  day: 4,
  dayReach: 20,
  dayGlow: 0.3,
  dayBell: 0.75,
  rise: [0.12, 0.85] as [number, number],
  fade: 0.1,
  halo: 1,
  pool: 1,
  poolRings: 2,
  farHalo: 2.6,
  farGlow: 2.2,
  floor: 0.5,
  liteFar: 0.35,
  sail: 3,
  current: [-0.14, 0.03] as [number, number],
  wander: 0.7,
  edge: 6,
  /**
   * The light round a jelly (halo, pool and legs) is held at `dayGlow` until the water has darkened, coming up to full
   * between these nightnesses: on still-bright dusk water a brighter glow washed out to a flat white disc (art review,
   * 2026-11-19). The bells show as soon as they are up.
   */
  lightDark: [0.5, 0.95] as [number, number],
  /**
   * Pools and legs fade where the water is seen this edge-on (how square-on the eye is to the water there, 0 edge-on ..
   * 1 straight down): low across the water a pool smeared into a wide streak and a jelly's legs stacked into one bright
   * line, so a near peach jelly read as a fire (art review, 2026-11-19). The legs need the steeper view to stay apart.
   */
  grazing: { pools: [0.05, 0.2] as [number, number], legs: [0.12, 0.3] as [number, number] },
  legs: { threads: 6, length: [2.5, 3.5] as [number, number], arms: 3, armLength: [1.2, 1.8] as [number, number], width: 0.05, armWidth: 0.12, glow: 1.1, armGlow: 0.8, sway: 0.1, speed: 2, kick: 0.5, segments: 6, reach: 34 },
};

/** How much of the jelly field shows (0..1): it comes in over the markers before the Twilight's line (61) and thins out before the Abyss's (91). */
export const jelliesAt = (mood: number): number => smooth(seaMood(56), seaMood(61), mood) * (1 - smooth(seaMood(86), seaMood(91), mood));

/**
 * Whether one lantern jelly is up (0..1) at nightness `n` (0 day, 1 full night), from `rise`, the nightness it surfaces
 * at; below 0 for the few that are up all day.
 */
export const jellyUp = (n: number, rise: number): number => (rise < 0 ? 1 : smooth(rise - JELLIES.fade, rise, n));

/** How brightly one lantern jelly glows (0..1): `dayGlow` for the few up by day, rising to full with the night. */
export const jellyGlow = (n: number, rise: number): number =>
  jellyUp(n, rise) * (JELLIES.dayGlow + (1 - JELLIES.dayGlow) * smooth(0, 1, n));

/**
 * How bright the light round one lantern jelly is (its halo, pool and legs; 0..1): its glow, held at `dayGlow` until the
 * water has darkened (`lightDark`). The same as `jellyGlow` by day and at full night.
 */
export const jellyLight = (n: number, rise: number): number =>
  Math.min(jellyGlow(n, rise), JELLIES.dayGlow + (1 - JELLIES.dayGlow) * smooth(JELLIES.lightDark[0], JELLIES.lightDark[1], n));

/** The nightness each of `count` jellies surfaces at: the first `day` are up all day, the rest spread evenly over `JELLIES.rise`. */
export function jellyRises(count: number, day = 0): number[] {
  const [a, b] = JELLIES.rise;
  const m = count - day;
  return Array.from({ length: count }, (_, i) => (i < day ? -1 : a + ((b - a) * (i - day + 0.5)) / m));
}

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

/**
 * What lurks in the Abyss (Oscar, 2026-11-19): the zone's three legends glimpsed from the deck, so what a player sees
 * out there is what they might hook. Atmosphere only: nothing here touches a fight, a hold or the network, and each
 * player sees their own. Most of the time nothing is there.
 *
 * They come in over the markers drawn between the depths in `from`, and `level` (0..1) climbs from the first marker to
 * `deep`: at level 1 sightings come `busy` times as often, and reach all the way in from the far end of their `range`
 * (metres from the boat, far end first) to the near one; at level 0 they stop `closer` of the way short of it. Each
 * `every` is the mean seconds between sightings of that kind at level 0; far sightings (the Leviathan's and the
 * Kraken's) never overlap, and at least `rest` seconds of nothing follow each.
 *
 * Far things are silhouettes: near black, lit `light` of their colour by day and at night and `flashLit` more in a
 * lightning flash, their wet hide catching a pale `sheen` (most on its upper faces), and taking up to `haze` of the
 * fog's colour with distance (the fog's colour without the lightning in it, so they stand stark against a lit sky).
 * Their lowest `murk` metres are lost in the fog as the far water is, so they stand in the sea and not over it.
 *
 * `leviathan`: a plated serpent `length` m long and `girth` m thick, arching through the swell in `humps` humps that
 * stand `hump` m out of the water, bone spines `spine` m tall down its back, the ember seams between its plates
 * glowing `seams` at night (0 off; less by day and in a flash). A `pass` surfaces head first over `rise` s and swims
 * across at `speed` m/s for that many seconds, its head carried `headUp` of the way to a breach's height ahead of
 * the humps, then sinks. A `flash` sighting stands there for one lightning flash (`flashReared` of them with the
 * neck up), the bolt held until the swell leaves the view to it clear, with sky behind it. A `breach` rears the head
 * and `neck` m of neck `height` m up over `up` s, eyes lit, hangs for `hang` s and crashes back in `down` s.
 *
 * `kraken`: one arm `girth` m thick at the root rising `height` m out of a crest over `rise` s, hanging `hang` s with
 * a slow `curl` (radians at the tip, more on some arms) and sliding back under in `sink` s; or `flashArms` of them
 * at once, shown by one flash.
 *
 * `eyes` (the Drowned Dreamer's): `count` eyes of radius `size` m open just under the surface `range` m from the
 * hull, off to the side of where the player is looking, the big one first and the rest about `open` s apart; their
 * pupils wander, then find the player about `notice` s on and follow them. They stay `stay` s, blinking, and shut
 * (`shut` s) at a lightning strike or when looked at within `shyAngle` radians for `shyAfter` s (`shy` off: they
 * bear being looked at), then open somewhere else `away` s later, up to `moves` times. `color` is the iris (the
 * Dreamer's mint; Oscar's pick, 2026-11-19) and `pupil` its dark, `glow` the light round each on the water; seen low
 * across the water an eye is drawn up to `stretch` times as long toward the viewer, so it stays an eye and not a line.
 * Lite graphics drops the glow and opens `liteCount` at most.
 */
export const LURK = {
  from: [94, 106] as [number, number],
  deep: 160,
  busy: 1.8,
  closer: 0.35,
  rest: 30,
  light: [0.5, 0.16] as [number, number],
  flashLit: 0.6,
  sheen: 0.06,
  haze: 0.55,
  murk: 7,
  leviathan: {
    every: { pass: 360, flash: 240, breach: 1500 },
    range: [180, 90] as [number, number],
    length: 100,
    girth: 3.4,
    humps: 4.5,
    hump: 9,
    spine: 2.2,
    seams: 0.22,
    speed: 5,
    headUp: 0.4,
    pass: [12, 20] as [number, number],
    rise: 3.5,
    flashReared: 0.3,
    breach: { height: 24, neck: 30, up: 2.4, hang: 2.6, down: 1.3 },
    body: 0x2c2c42,
    belly: 0x4c3c44,
    bone: 0xf4e8cc,
    ember: 0xff7a2a,
  },
  kraken: {
    every: { arm: 300, flash: 720 },
    range: [150, 60] as [number, number],
    height: [22, 36] as [number, number],
    girth: 3,
    curl: 2.6,
    rise: 5,
    hang: [5, 9] as [number, number],
    sink: 4,
    flashArms: [3, 5] as [number, number],
    body: 0x6a1a36,
    belly: 0xe07a96,
    sucker: 0xffc8d6,
  },
  eyes: {
    every: 110,
    range: [5, 25] as [number, number],
    count: [3, 9] as [number, number],
    size: [0.25, 0.65] as [number, number],
    color: 0x9affd0,
    pupil: 0x03100c,
    glow: 1,
    stretch: 2.5,
    open: 0.5,
    notice: 1.6,
    stay: [14, 26] as [number, number],
    shut: 0.25,
    shy: true,
    shyAngle: 0.13,
    shyAfter: 0.5,
    away: [6, 14] as [number, number],
    moves: 2,
    liteCount: 5,
  },
};

/** How much of the Abyss's lurkers shows (0..1): nothing before the zone, easing in over its first markers (`LURK.from`). */
export const lurkAt = (mood: number): number => smooth(seaMood(LURK.from[0]), seaMood(LURK.from[1]), mood);

/** How far into the Abyss the sea is drawn (0..1), for the lurkers' pacing: 0 at its first marker, 1 by `LURK.deep`. */
export const lurkLevel = (mood: number): number =>
  Math.min(1, Math.max(0, (mood - seaMood(SEA_LOOK_DEPTH.abyss.from)) / (seaMood(LURK.deep) - seaMood(SEA_LOOK_DEPTH.abyss.from))));
