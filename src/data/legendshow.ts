/**
 * How a sea legend is shown off when it bites, fights and is landed. Every
 * other fish keeps the ordinary landing: this table only reaches fish with `legend: true` at sea.
 *
 * Legends from the Shelf to the Twilight still hang from the Deep Sea Rod, much bigger (`legendHangLen` in fishscale.ts),
 * with the view pulled up a little so the rail does not cut them off. The Abyss's three are too big to lift: they break
 * the water beside the hull, posed along a spine (`spine`), and the view turns to them. The Leviathan and the Kraken
 * come up beaten: one last heave, then they slump onto the water and lie there among the waves (`limp`).
 *
 * Sizes adapt to the model: a hanging legend's drawn length and a surfacing one's spine are laid over the model's
 * measured length (nose to tail, arms and crests included), so a longer or rebuilt model still fits its pose.
 */

/** A legend that hangs from the rod. */
export interface HangShow {
  kind: 'hang';
  /**
   * Share of the drawn length that may hang down into the water (the Oarfish, held up with its tail still in the sea);
   * 0 keeps the whole fish clear of the water like any catch.
   */
  wet: number;
  /** Scales the size rule's length, after its ceiling (1 = the rule): more for a wide, heavy legend that should dominate its zone. */
  grow: number;
}

/** A legend that surfaces beside the boat. */
export interface SurfaceShow {
  kind: 'surface';
  /** Drawn length (its model's whole measured length, arms included) as a share of its real length. */
  real: number;
  /** Floor and ceiling of the drawn length (m): bigger than the boat's working deck, never so big it can't be framed. */
  min: number;
  max: number;
  /** Where its show point (where the spine breaks the water) is: metres out from the hull's side, and across the view (+ right). */
  out: number;
  across: number;
  /** Which way the spine's "along" axis points, radians from straight back at the player (+ turns it to the player's right). */
  heading: number;
  /**
   * Laid out along the hull instead (the Leviathan): the body lies parallel to the boat, `out` metres off its beam on
   * the side the player faces, its head by the player (`across` metres to their right) and its tail away to their left
   * (to their right, mirrored, where the wheelhouse would hide it), slid along so no more than `past` of its length
   * lies beyond the boat's end. `heading` is not used. The spine's "along" axis then points from tail to head along
   * the hull, and its third number is metres (in drawn lengths) away from the hull.
   */
  alongside?: { past: number };
  /**
   * The spine, nose to tail, in units of the drawn length: [along, up, aside] from the show point on the water, along
   * pointing back toward the player (turned by `heading`), aside (0 unless given) level and square to it. The model's
   * length is laid along it, so a pose is a drawing.
   */
  spine: SpinePoint[];
  /** Deepest the body may be, as a share of its length, for a serpent's pose to read (a deeper model is drawn thinner). */
  slender?: number;
  /** Turn of the body about its spine (radians), to put a flank, an eye or the arms toward the player. */
  roll: number;
  /**
   * More turn about the spine, changing along it: [share of the length from the nose, radians], eased between (a body
   * lying limp, its head on its side and its tail flat on the water).
   */
  twist?: [at: number, roll: number][];
  /** Where the line takes hold, as a share of the length from the nose. */
  jaw: number;
  /**
   * What the view turns to: the middle of what stands out of the water, moved along the drawing's "along" axis (in drawn
   * lengths) and up (as a share of its height; 0 frames it a little low, so the water it breaks shows too).
   */
  look: [along: number, lift: number];
  /**
   * What the view settles on instead, where the middle of it is not its face (the Leviathan laid along the hull): a
   * point on the spine (a share of the length from the nose), lifted by a share of the drawn length.
   */
  face?: [at: number, lift: number];
  /**
   * How far it rides up and down with the swell (1 = like a float, 0 = fixed to the boat's frame). Kept low: a giant
   * holds its place by the hull while the Abyss's swell rises and falls round it, so it never drops behind the rail.
   * A limp one (`limp`) is this stiff only while it heaves up; then every part of it lies on its own water.
   */
  ride: number;
  /**
   * A beaten giant: it comes up in one last heave and slumps onto the water, where it lies with every part of it
   * riding the sea under it (`SURFACE_LIMP`, `LimpRide`).
   */
  limp?: {
    /** The model's own limp build is laid out in place of the one that fought (the Kraken's arms spread on the water; the Leviathan's jaw slack, its horns laid back). */
    build?: boolean;
    /** How much of its own light is left once it lies there (eyes, molten seams): it goes down to this over `SURFACE_LIMP.fade` seconds. */
    dim: number;
    /** How far under it starts (m). */
    under: number;
    /**
     * Its last heave: what is furthest from `from` (a point of the drawing: [along, aside] in drawn lengths) is thrown
     * `up` metres out of the water, nothing within `near` drawn lengths of it and all of it from `far` on, rising as
     * the `pow`er of the way between; the parts round it fall a little apart in time (`stagger`, a share of the rise).
     */
    heave: { up: number; from: [along: number, aside: number]; near: number; far: number; pow: number; stagger: number };
  };
  /** Seconds it takes to come up. */
  rise: number;
  /**
   * When in the rise (a share of it) one bolt of lightning lands behind it, so it stands as a black shape against the lit
   * cloud before the boat's lamps bring up its colour. None for the Dreamer, which wakes quietly.
   */
  bolt?: number;
  /** The boat's lamps on it (`SURFACE_LAMP.gain` unless given): more for a body painted too dark to show on a black sea. */
  lamp?: number;
  /** Its soft glows (eyes, a lamp) drawn this share of their size up close, where full size would run them together (1 unless given). */
  glow?: number;
  /** Where the Deep Sea Rod points while it is shown, in radians from its jaw: [to the right, up]. Set so the rod stands clear of its face. */
  rod: [aside: number, lift: number];
}

/** A point of a surfacing pose's spine: [along, up] or [along, up, aside], in drawn lengths. */
export type SpinePoint = [along: number, up: number, aside?: number];

export type LegendShow = HangShow | SurfaceShow;

const hang = (wet = 0, grow = 1): HangShow => ({ kind: 'hang', wet, grow });

export const LEGEND_SHOW: Record<string, LegendShow> = {
  // Wide and heavy: drawn longer than the rule so she plainly dwarfs the Pewter Cod.
  grouper: hang(0, 1.15),
  marlin: hang(),
  kelpbeard: hang(),
  kelpwyrm: hang(),
  // "Hangs from the rod with its tail still in the water", running the screen top to bottom.
  oarfish: hang(0.3, 1),
  chandelier: hang(0, 0.95),
  // Beaten, lying along the hull among the waves, rolled over on its side with its belly and its jaws to the deck:
  // its head on its side on the water, turned to the deck by the line in its jaw, the slack jaws agape toward the
  // rail and the eyes down the upper side of the skull looking up; its body trailing the boat's length behind the
  // head in loose curves, the tail's blade flat on the water at the far end.
  leviathan: {
    kind: 'surface',
    real: 1,
    min: 9,
    max: 14,
    out: 5,
    across: 0.6,
    heading: 0,
    alongside: { past: 0.35 },
    // Low: the model's own humps, laid over by the roll, become the slack curves it lies in, and the spine dips and
    // lifts under them so every stretch of it lies awash (the model carries its head high, so the head's end is drawn
    // well down). The head and the stretch of neck its horns lie over turn toward the hull in one wide arc (a tight
    // one drew the horns out into strings and ran the eyes into a band).
    spine: [
      [0.16, -0.088, -0.2],
      [0.085, -0.088, -0.11],
      [0.0, -0.085, -0.035],
      [-0.095, -0.075, 0.0],
      [-0.2, 0.0, 0.01],
      [-0.31, 0.075, 0.0],
      [-0.43, 0.02, -0.015],
      [-0.55, -0.03, 0.0],
      [-0.66, 0.04, 0.02],
      [-0.76, 0.02, 0.03],
    ],
    // Rolled away from the hull, belly to the boat: the head well over on its side, the body further over where it
    // sags and less where it humps, the tail's blade laid flat.
    roll: 0,
    twist: [[0, 0.9], [0.22, 0.9], [0.45, 1.1], [0.7, 0.75], [0.9, 1.2], [1, 1.45]],
    jaw: 0.04,
    look: [0, 0],
    face: [0.1, 0.05],
    ride: 0.3,
    rise: 2.2,
    // The bolt lands as its head is thrown highest.
    bolt: 0.56,
    // Its head and neck rear out of the water once more, the tail staying in it, and crash back.
    limp: { build: true, dim: 0.55, under: 2.2, heave: { up: 3.6, from: [-0.76, 0.03], near: 0.25, far: 0.95, pow: 1.8, stagger: 0.06 } },
    // Coal-dark plates on a black sea: the lamps are turned well up so the horns, the spines and the plates' edges show.
    lamp: 2.4,
    // Its three eyes sit close together: with their glows at full size they ran into one orange patch.
    glow: 0.3,
    // Its jaw lies low by the hull: the rod is held up and to the side, so it does not cross the face.
    rod: [0.8, 0.55],
  },
  // The dome and its huge eye just out of the water beside the hull, the tendrils spread in the water under its chin.
  dreamer: {
    kind: 'surface',
    real: 1,
    min: 8,
    max: 12,
    out: 4.5,
    across: -2.5,
    heading: 0.3,
    // Lying level and facing the deck, its back arched just out of the water: the great closed eye on the crown and the
    // small eyes waking under it show above the water, the nightcap and its lantern over them, the tendrils down in the sea.
    spine: [[0.5, 0.0], [0.25, 0.06], [0.0, 0.07], [-0.25, 0.04], [-0.5, -0.03]],
    roll: 0,
    jaw: 0.2,
    look: [0, 0],
    ride: 0.3,
    rise: 1.8,
    rod: [0.5, 0.25],
  },
  // Beaten, lying along the hull: its mantle half-sunk and rolled so one eye looks up at the deck, its arms spread
  // limp across the water ahead of it (the model's limp build, `buildKraken`), the ship's wheel afloat by an arm's tip.
  kraken: {
    kind: 'surface',
    real: 1,
    min: 10,
    max: 14,
    out: 5.4,
    across: -2.2,
    heading: 0,
    alongside: { past: 0.5 },
    // Straight and level: the limp build is already laid out as it lies. The head is at the show point, the arms
    // reaching on past it and the mantle trailing behind, a little down by the tail.
    spine: [[0.36, 0.0], [0, -0.004], [-0.64, -0.02]],
    roll: 0,
    jaw: 0.36,
    look: [0, 0],
    face: [0.45, 0.04],
    ride: 0.3,
    rise: 2.0,
    // The bolt lands as its arms are thrown highest.
    bolt: 0.56,
    // Its arms are thrown up out of the water once more and slap back down, one after another.
    limp: { build: true, dim: 0.6, under: 2.4, heave: { up: 4.4, from: [-0.2, 0], near: 0.2, far: 0.72, pow: 1.3, stagger: 0.14 } },
    rod: [0.5, 0.45],
  },
};

/**
 * The hanging legends' framing: how far the view is pulled up (radians), and the Deep Sea Rod's pitch and yaw while it
 * holds one: turned left and bowed left under the weight, so the fish hangs beside the rod's butt rather than behind it.
 */
export const LEGEND_HANG_VIEW = { lookUp: 0.28, rodPitch: 0.9, rodYaw: 0.1, rodBend: 0.8, rodBendY: 0.8 };

/** The Deep Sea Rod while a surfacing legend is on it: bent this hard (where it points is each pose's `rod`). */
export const SURFACE_ROD = { bend: 0.85 };

/**
 * The boat's lamps on a surfacing legend: every lit part brightened toward their warm light, hue kept (the Abyss is a
 * standing night). One with a bolt (`SurfaceShow.bolt`) comes up `dark` (a share of its own colour) so the bolt shows it
 * as a black shape, then the lamps bring its colour up over `up` seconds, starting `after` seconds past the bolt.
 */
export const SURFACE_LAMP = { color: 0xffb070, gain: 0.6, dark: 0.3, after: 0.35, up: 0.9 };

/**
 * The view while a surfacing legend is shown: turned this far (radians) to the right of it, so it stands left of the
 * catch card and LEGEND LANDED! (not on touch, where the card is on the left). The bolt behind it stands `bolt`
 * metres off, about the nearest the sea's lightning comes, so its thunder is the near crack. The Dreamer has no bolt:
 * the wind and the rain drop away for `hush` seconds under its music box (about as long as the phrase runs), and the sea's
 * own bolts hold off two seconds longer.
 */
export const SURFACE_VIEW = { aside: 0.2, bolt: 95, hush: 5 };

/**
 * Where a surfacing legend comes up (`surfacingSpot`): out past the hull's side the way the player faces, unless that
 * side is more than `reach` metres from them (looking along the deck); then the way out is turned toward a beam in
 * `steps` steps until it is, so the legend is as near from the middle of the deck as it is from the rails.
 */
export const SURFACE_SPOT = { reach: 3.4, steps: 6 };

/**
 * A surfacing legend's send-off, once its card is put away: it sinks back over `secs` seconds until its top is `under`
 * metres down, its glows going out, with a last splash as the water closes. Nothing waits for it: the next cast is free at once.
 */
export const SURFACE_SINK = { secs: 1.5, under: 0.6 };

/** An Abyss giant: the three legends whose fights are staged in acts (`src/game/legendfight.ts`). */
export type GiantId = 'leviathan' | 'kraken' | 'dreamer';

/** The acts of a giant's fight: 1 far out (its wake and its voice only), 2 mid-fight (it shows itself), 3 close in. */
export type FightAct = 1 | 2 | 3;

/**
 * What a giant does when it shows itself (a "move"):
 * - the Kraken (seen in the fight as its arms alone, `LEGEND_FIGHT.arms`): `arm` lifts one great arm over the others;
 *   `slap` lifts one and brings it down flat on the water; `twin` lifts two at once, either side of it; `grip` (close
 *   in) an arm comes over the rail by the player and the boat lurches;
 * - the Leviathan: `rear` heaves head and neck out of the water, a bolt behind it; `coil` rolls its long spined back
 *   through the surface, a line of white water its whole length, and goes under; `tail` stands its tail out of the water and slaps it down, spraying the deck when it is close;
 * - the Dreamer (eyes in the water round the line all through, `LEGEND_FIGHT.gaze`): `ring` opens a wide ring of them
 *   round it; `trail` opens them one after another in a line from it to the boat; `under` opens them in the water
 *   right beside the hull.
 */
export type GiantMove = 'arm' | 'slap' | 'twin' | 'grip' | 'rear' | 'coil' | 'tail' | 'ring' | 'trail' | 'under';

/**
 * A sea legend's fight. Its leaps take longer the bigger it is drawn, so a giant heaves out and falls back instead
 * of hopping: `leap` seconds for an everyday fish, `leapPerScale` more for each point of drawn scale over 1, up to `leapMax`.
 *
 * An Abyss giant's fight is staged in three acts so it builds (the fight director, `src/game/legendfight.ts`;
 * presentation only: the reel, its gauge and the catch are untouched):
 * - Act 1, far out: the giant is not seen. It swims under, and each surge throws up a boil of white water over it
 *   (with an arm's tip from the Kraken, an eye or two from the Dreamer).
 * - Act 2, mid-fight: it is up (the Leviathan's back breaking the water, the Kraken's arms standing out of it where
 *   the line holds it, the Dreamer's eyes open round it), and it shows itself as each surge starts with one of its `moves`.
 * - Act 3, close in: the same with its close moves, the view a little tighter and the storm at its height.
 * Acts never go back, and the first surge is always act 1's, however fast the line comes in. A move comes as each
 * surge starts, so the creature is seen to cause the gauge's SURGE; with no surge for a while one comes anyway,
 * `glimpseGap` seconds after the last (act 1's first boil `glimpseFirst` seconds in), never within `glimpseRest` of
 * another, and never the same move twice running.
 *
 * Once a fight it makes a last stand (`lastStand`), bigger than any move, with a bolt behind it; after it the giant
 * is spent: no more moves, it wallows as it is brought in.
 */
export const LEGEND_FIGHT = {
  leap: 0.75,
  leapPerScale: 0.16,
  leapMax: 1.9,
  glimpseFirst: 1.2,
  glimpseGap: [12, 16] as [number, number],
  glimpseRest: 2.5,
  /**
   * When the acts start: act 2 once this much of the line is in (the reel's `progress`; a fight starts at 0.35) or
   * the giant's fight is down to this (`fightLeft`), whichever comes first; act 3 the same. On the reel bots
   * (`scripts/giantsim.ts`) a Fair giant's first act is about the first quarter of the fight (one to three surges) and
   * its third the last third. Act 3 also starts by the fight left, so a heavy giant that only comes in once it is
   * exhausted (the top of Tough) still gets its third act before its last stand; with `three.fight` at 0 act 3 is
   * only ever close in. Play-test defaults.
   */
  acts: { two: { progress: 0.5, fight: 0.75 }, three: { progress: 0.72, fight: 0.35 } },
  /** Each giant's moves by act (act 1 has none: its wake only). */
  moves: {
    kraken: { 2: ['arm', 'slap', 'twin'], 3: ['grip', 'slap', 'twin'] },
    // (Its tail slap is act 3's: a thin tail and its splash did not carry 13 m off in the filmed fight; its rear and its long back do.)
    leviathan: { 2: ['rear', 'coil'], 3: ['tail', 'coil', 'rear'] },
    dreamer: { 2: ['ring', 'trail'], 3: ['under', 'trail', 'ring'] },
  } as Record<GiantId, Record<2 | 3, GiantMove[]>>,
  /**
   * The last stand. It comes the moment the giant is exhausted (the reel makes no more surges after that). A fight
   * won before the giant tires out never gets there (on the bots: no Easy fight, and a skilled hand's Fair ones), so
   * failing that it is the first surge to start with `near` of the line in: at 0.85 that is the fight's last surge
   * nine times in ten, 2 to 5 seconds before the landing (a median 3.3 to 3.7 s, one in ten under 2). So its climax
   * is front-loaded: the cry at once, the highest pose and the bolt (`bolt` seconds in, `boltDist` metres off: the
   * near crack) inside the first second, the crash by 1.5; what is left of its `secs` seconds is the fall and the
   * first of the wallow, which the landing cuts without loss. From `secs` on the giant is spent.
   */
  lastStand: { near: 0.85, secs: 2.6, bolt: 0.5, boltDist: 95 },
  /**
   * Act 1: how far under its top swims (m), seconds it takes to come up for act 2, and a surge's boil: seconds it
   * boils, white water bursts a second, how wide (in drawn scales) and how big its drops (an everyday splash's are 1;
   * up to three times that again far out, so it shows from the deck).
   */
  deep: { under: 1.4, rise: 1.6, boil: 1.5, rate: 10, wide: 0.6, drop: 5 },
  /**
   * The storm by act (1, 2, 3), each eased in over `ease` seconds: how often the sea's own bolts come (times the
   * Abyss's own pace, so the first act is a lull and the third a barrage), how much of the rain falls and how hard
   * the wind drives it (times the zone's own). Play-test defaults. (Nothing dims the lamps or the view: that read as
   * a fault.)
   */
  storm: { bolts: [0.6, 1, 1.6] as [number, number, number], rain: [0.7, 0.85, 1] as [number, number, number], wind: [0.8, 1, 1.5] as [number, number, number], ease: 3 },
  /**
   * The view by act: degrees it closes by (a little tighter as the giant comes in), eased over `ease` seconds. It
   * never turns the view; while the player is turning it, and for `yield` seconds after, it lets go (eases back out).
   */
  view: { fov: [0, -1.5, -5] as [number, number, number], ease: 2.5, yield: 1.2 },
  /** A move counts as close (spray on the lens, a harder shake) when the giant is within this many metres of the player. */
  close: 11,
  /**
   * The Leviathan is a slender coal-dark body: on the Abyss's black water it was a speck 12 to 22 m out, where most of
   * a Fair fight is fought (the Kraken's arms and the Dreamer's eyes are tall, pale or glowing, and carry). So in the
   * fight it is drawn for the distance, as its landing draws it for the hull:
   * - `grow`: bigger the further off, `scale` times from `to` metres out and its swimming size within `from` (still
   *   bigger on screen the nearer it comes; it swims 7 m long and its landing lays it out at 9 to 14 m, so far off
   *   it is drawn about as long as it lands);
   * - `room`: how high its head (or its tail) may stand out of the water, `room[0]` + `room[1]` times its distance
   *   (m): a rear is pitched no steeper than that allows, so it tops out inside the view instead of through its top
   *   (the swell often has it high in the view already); its last stand may stand `stand` times as high;
   * - `body`: its plates and bone lit, its own colour times 1 + this (the landing's lamps do the same, 2.4);
   * - `seams`, `eyes`: while it makes a move its molten seams burn this much brighter and its eyes' glare is this
   *   much bigger (and bigger again far off, with the white water);
   * - `plume`, `collar`: every move starts with a column of white water (drops this big, an everyday splash's 1) and
   *   keeps a collar of foam where it breaks the surface, a burst every `collar` seconds.
   */
  far: { leviathan: { grow: { from: 5, to: 14, scale: 1.6 }, room: [2.6, 0.18], stand: 1.25, body: 2.2, seams: 0.9, eyes: 0.8, plume: 4.5, collar: 0.07 } } as Partial<
    Record<GiantId, { grow: { from: number; to: number; scale: number }; room: [number, number]; stand: number; body: number; seams: number; eyes: number; plume: number; collar: number }>
  >,
  /**
   * The Kraken's arms in the fight: none stands taller than `base` + `per` times its distance from the player (m), so
   * close in an arm still stands inside the view instead of filling it; `girth` is how thick they are, times a far
   * sighting's arm of that length.
   */
  reach: { base: 1.9, per: 0.5, girth: 0.6 },
  /** The Kraken's arm: seconds up, held and sliding back under, and its height as a share of the Kraken's drawn scale. */
  arm: { rise: 0.9, hold: 2.2, sink: 1.6, height: 0.95 },
  /**
   * The Kraken's slap: an arm this tall (in drawn scales) up in `rise` seconds, held, then down flat on the water in
   * `fall` seconds across the view, lying `lie` seconds before it slides under in `sink`.
   */
  slap: { height: 1.15, rise: 0.75, hold: 0.45, fall: 0.24, lie: 0.7, sink: 1.1 },
  /** The Kraken's two arms: this far either side of it and this tall (in drawn scales), the second `lag` seconds after the first; up and under as `arm`, held `hold` seconds. */
  twin: { apart: 0.5, height: 1.1, lag: 0.3, hold: 1.8 },
  /**
   * The Kraken's grip: an arm `height` m tall comes up `off` m outside the hull by the player (`aside` radians to the
   * left of where they look, clear of the rod), curls in over the rail and holds on `hold` seconds; the boat lurches
   * toward it (`roll` radians and `heave` m down, rocking back with `period` s and dying in `die` s). `girth` as `reach`'s.
   */
  grip: { height: 3.7, girth: 0.36, off: 0.7, aside: 0.62, rise: 0.7, hold: 1.7, sink: 1.0, roll: 0.085, heave: 0.22, period: 1.7, die: 1.3 },
  /** The Dreamer's ring of eyes: how many, in a ring this share of its drawn scale across, one opening every `gap` seconds, open this long (s), `size` times a sighting's biggest. */
  eyes: { count: 7, radius: 0.85, gap: 0.07, stay: 3, size: 1.2 },
  /**
   * The Dreamer's eyes under the boat: how many, each `size` times a sighting's, from `off[0]` to `off[1]` m outside
   * the hull along the side the player looks over, over `along` m of it, one opening every `gap` seconds, open `stay` seconds.
   */
  under: { count: 7, size: 1.15, off: [2.2, 6] as [number, number], along: 10, gap: 0.1, stay: 3.4 },
  /** The Dreamer's line of eyes: `count` of them from it to `off` m outside the hull, one opening every `gap` seconds, the nearest last, each open `stay` seconds, `size` times a sighting's biggest. */
  trail: { count: 6, off: 2.4, gap: 0.16, stay: 2.4, size: 1 },
  /**
   * The Leviathan's rear: head and neck heaved slowly out of the water and back (seconds up, held and down), its nose
   * pitched up by `pitch` radians about a point `pivot` of its length behind its middle, so the tail stays under. As
   * it tops out a bolt lands behind it, `bolt` metres off (further than the last stand's: a rumble, not the near
   * crack), so its head stands black against the lit cloud; 0 for none.
   */
  rear: { up: 0.8, hold: 0.6, down: 0.85, pitch: 0.9, pivot: 0.22, bolt: 140 },
  /**
   * The Leviathan's coil: its long back rolls through the surface. Over `secs` seconds it comes up onto the water
   * (lifted `lift` of its height, so its plates and spines stand clear), leans `roll` radians toward the deck,
   * slides `run` of its length along its heading, nose arching up then down (`pitch` radians either way), white
   * water bursting all along it every `foam` seconds, and goes under at the end; then `back` seconds to come up again
   * where the line holds it.
   */
  coil: { secs: 2.6, pitch: 0.22, lift: 0.75, roll: 0.4, run: 0.45, foam: 0.04, back: 0.8 },
  /**
   * The Leviathan's tail slap: nose down and tail stood `pitch` radians out of the water (about a point `pivot` of its
   * length ahead of its middle) in `up` seconds, held, then brought down in `down`.
   */
  tail: { up: 0.7, hold: 0.35, down: 0.2, pitch: 1.0, pivot: 0.22 },
  /**
   * The last stands, each with its height inside the first second and its crash by 1.5 s (`lastStand`). The Kraken
   * throws `arms` arms up round its far side (over `fan` of a half turn, `spread` of its distance from the player
   * off it, one every `lag` seconds), each `height` times as tall as an arm may stand (`reach`), and brings them all
   * down at once; the Leviathan rears higher than ever (`pitch`, `pivot` as `rear`) and falls on its side; the
   * Dreamer opens every eye it has: `boat` of them all round the boat, closest together where the player looks (`off[0]` to `off[1]` m outside the hull), and
   * `ring` round itself (`radius` drawn scales across), `size` times a sighting's biggest, one every `gap` seconds,
   * and its bolt, `bolt` seconds in, shuts them all together; the wind and the rain drop under it for `hush` seconds
   * (sound only: nothing is done to the lamps or the light, which read as a fault, Oscar 2026-11-20).
   */
  stand: {
    kraken: { arms: 5, height: 1.2, spread: 0.32, fan: 0.9, lag: 0.04, rise: 0.45, hold: 0.4, fall: 0.25, lie: 0.5, sink: 0.9 },
    leviathan: { up: 0.55, hold: 0.55, down: 0.35, pitch: 1.2, pivot: 0.3 },
    dreamer: { boat: 10, off: [2.2, 5] as [number, number], ring: 5, radius: 0.7, size: 1.45, gap: 0.04, bolt: 0.95, hush: 1.6 },
  },
  /**
   * The Kraken in the fight is its arms alone: the hooked model is never drawn (it and the arms read as two separate
   * things, a still body dragged along under them; Oscar, 2026-11-20), and is first seen at the landing. Arms stand
   * out of the water where the line holds it, and come in with it:
   * - `count` of them by act, each up for `life` seconds and then under as another comes up `gap` seconds on (the
   *   first two at once as act 2 begins), `ring[0]` to `ring[1]` m from the line's end, `height[0]` to `height[1]` of
   *   what an arm may stand at that distance (`reach`), `surge` taller again at a surge's height; white water round
   *   each foot every `foam` seconds;
   * - act 1 keeps it mostly hidden: only an arm's `tip` (this share of full height) for `tipLife` seconds, at each
   *   surge's boil and every `tipGap` seconds between;
   * - spent, `spent` of them `droop` radians over, trailing away from the boat, `low` of the height.
   */
  arms: {
    count: [1, 4, 5] as [number, number, number],
    height: [0.6, 0.95] as [number, number],
    ring: [0.8, 3] as [number, number],
    life: [3.5, 6.5] as [number, number],
    gap: [0.3, 0.8] as [number, number],
    rise: 0.8,
    sink: 1.3,
    surge: 0.35,
    tip: 0.35,
    tipLife: [2, 3.2] as [number, number],
    tipGap: [1.5, 3] as [number, number],
    foam: 0.22,
    spent: 3,
    droop: 0.95,
    low: 0.85,
  },
  /**
   * The Dreamer's eyes are on the water all through the fight, round where the line holds it and coming in with it:
   * `count` of them by act (act 1 none: `peek` of them for a moment at a surge), each open `open` seconds and shut
   * `shut` seconds before it opens somewhere else, `ring[0]` to `ring[1]` drawn scales from the line's end on the side
   * toward the boat and out to either flank (behind its body they would not be seen), `size` times a sighting's
   * biggest (bigger far off, with the white water); spent, `spent` of them half-lidded (`lid`).
   */
  gaze: { count: [0, 5, 7] as [number, number, number], peek: 2, open: [3, 5.5] as [number, number], shut: [0.25, 0.8] as [number, number], ring: [0.4, 0.8] as [number, number], size: [0.8, 1.15] as [number, number], spent: 2, lid: 0.45 },
  /**
   * Spent: how far it lists over as it wallows (radians, and the sway on top), how much of its thrash and its wake
   * is left, and how much higher it lies (a share of its height), awash.
   */
  wallow: { list: 0.5, sway: 0.22, thrash: 0.2, wake: 0.4, awash: 0.3 },
};

/** Seconds a hooked fish's leap takes: `LEGEND_FIGHT.leap`, longer for a sea legend by how big it is drawn. */
export const leapSecs = (scale: number, legend: boolean): number =>
  legend ? Math.min(LEGEND_FIGHT.leapMax, LEGEND_FIGHT.leap + LEGEND_FIGHT.leapPerScale * Math.max(0, scale - 1)) : LEGEND_FIGHT.leap;

/** The Leviathan's rear at `t` seconds in: 0 lying in the water, 1 fully reared, easing up, held, easing back; -1 once over. */
export function rearAt(t: number): number {
  const { up, hold, down } = LEGEND_FIGHT.rear;
  const ease = (x: number) => x * x * (3 - 2 * x);
  if (t < 0 || t >= up + hold + down) return -1;
  if (t < up) return ease(t / up);
  if (t < up + hold) return 1;
  return ease(1 - (t - up - hold) / down);
}

/**
 * What an Abyss legend does by the bobber in the last `lead` seconds before it bites, each its own tell (atmosphere
 * only: the bite comes when it would have, and nothing is asked of the player):
 * - the Kraken lifts one arm `height` m out of the water `side` m from the bobber over `rise` seconds, and that arm takes
 *   it under at the bite, in `under` seconds;
 * - the Dreamer's eyes (`eyes` of them, `size` times as big as the ones that open by the hull, since the bobber is
 *   far off) open in a ring `radius` m round the bobber, and shut at the bite;
 * - the Leviathan's back rolls past `past` m beyond the bobber over `run` m, its horns and spines out of the water
 *   (`out` of its height at the top of the roll), white water breaking along its length every `foam` seconds: black
 *   on a black sea, it is that line of foam and its eyes that show it.
 * At the bite one bolt lands behind the bobber, `bolt` m off (the near crack).
 */
export const ABYSS_TELL = {
  lead: 3.6,
  kraken: { height: 6.5, side: 2, rise: 1.8, under: 0.45 },
  dreamer: { eyes: 7, radius: 2.8, size: 2 },
  leviathan: { past: 2.5, run: 7, out: 1, foam: 0.06 },
  bolt: 100,
};

/**
 * How an Abyss giant's size is sold as it comes up (Oscar's pick, 2026-11-20; presentation only, and any turn of the
 * view or press ends the camera's part at once): the camera leaves the player's eyes, up and back over the far rail,
 * so the whole creature is seen against the boat with the player small at the rail, the Deep Sea Rod in their hands;
 * it holds there while the giant comes up and its bolt lands, then comes home to the first-person view, which has
 * turned to the giant's face meanwhile. The swell the giant pushes up lifts the boat and rocks it.
 */
export const SURFACE_PULLBACK = {
  /** Seconds the camera takes out, how long it holds after the giant is up, and seconds home. */
  out: 1.0,
  hold: 0.55,
  home: 0.95,
  /** Where it goes: metres back from the player (away from the giant), up from their eyes, and how far toward the giant's middle along the hull (a share of the way). */
  back: 9,
  up: 5,
  toward: 0.45,
  /**
   * What it looks at: a share of the way from the player to the giant's middle, this high over the water (m) or
   * `aimTop` of the giant's height if that is higher, turned `aside` radians to its right so the giant stands left of
   * LEGEND LANDED!.
   */
  aim: 0.8,
  aimUp: 1.6,
  aimTop: 0.4,
  aside: 0.26,
  /** Degrees the view closes by out there: a long lens from further back, so the giant is not made small beside the deck in front of it. */
  fov: -18,
  /** The swell that lifts the boat: metres up, the roll away from the giant (radians), the rock's period and how fast it dies (s). */
  swell: { heave: 0.55, roll: 0.06, period: 2.8, die: 1.7 },
};

/**
 * A beaten giant's landing (`SurfaceShow.limp`), over its `rise`: it comes up from under in the first `up` of it,
 * heaves out of the water between `lift` (thrown right up by the second), hangs there, and from `fall` on drops back
 * and goes limp, flat on the water as the rise ends with a crash of white water all along it. From then on every part
 * of it lies on its own water: it `lean`s with the slope (a share of it), its loose ends `drift` (times the model's own
 * sway), its own light goes down over `fade` seconds (`limp.dim`), and white water laps along it and breaks over it where a crest runs under it: every `wash[0]` seconds `wash[1]`
 * spots along its waterline are tried, and those where the water stands over `wash[2]` metres above the water a
 * stride away on every side foam.
 */
export const SURFACE_LIMP = {
  up: 0.45,
  lift: [0.1, 0.55] as [number, number],
  fall: 0.72,
  lean: 0.6,
  drift: 1.6,
  fade: 3,
  /**
   * It rides the swell the boat rides. The Abyss's sea stands a metre and a half and more over and under the boat's
   * own waterline a few metres off the hull (and four metres past its ends, as it pitches), so a body that kept to
   * the water hung over the deck on every crest and was lost behind the rail in every trough. Where its water is
   * within `lo` and `hi` metres of the boat's waterline it lies on it; past that it follows only a share of the
   * rest, [over, under]: `near` the player who landed it (within `from` metres of them), where the view is, and
   * more `far` from them (`to` metres and on), where its far end goes down with the water. So a crest washes over
   * it, and a trough leaves the near of it a little proud of the water. It is never drawn more than `under` metres
   * below its water (the biggest crest of a swell lifts it after all, awash, rather than swallowing it whole) nor
   * more than `proud` metres over it (about as far as it lies deep, so no air shows under it).
   */
  keep: { hi: 0.25, lo: -0.45, near: [0.42, 0.4] as [number, number], far: [0.6, 1] as [number, number], from: 7, to: 13, under: 0.8, proud: 0.7 },
  /**
   * The pulled-back camera for a body lying flat (in place of `SURFACE_PULLBACK`'s): higher, to look down on how it
   * lies along the boat, and held a little longer, to see it settle on the water.
   */
  cam: { up: 6.5, hold: 0.8 },
  wash: [0.16, 4, 0.16] as [number, number, number],
};

const smooth01 = (a: number, b: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** A beaten giant's last heave, `u` of the way through its rise: 0 lying on the water, 1 thrown right up. */
export function limpHeave(u: number): number {
  const f = Math.min(1, Math.max(0, (u - SURFACE_LIMP.fall) / (1 - SURFACE_LIMP.fall)));
  return smooth01(SURFACE_LIMP.lift[0], SURFACE_LIMP.lift[1], u) * (1 - f * f);
}

/**
 * Where a beaten giant is `t` seconds into a landing that takes `rise`: how far through (`u`, running on past 1 for
 * the parts that fall late), how much of its starting depth it is still under, its heave, and how limp it has gone.
 */
export function limpAt(t: number, rise: number): { u: number; under: number; heave: number; limp: number } {
  const u = Math.min(2, Math.max(0, t / rise));
  const k = Math.min(1, u / SURFACE_LIMP.up);
  return { u, under: (1 - k) ** 3, heave: limpHeave(u), limp: smooth01(SURFACE_LIMP.fall, 1, u) };
}

/** A legend's show, if it has one. */
export const legendShow = (id: string | undefined): LegendShow | undefined => (id ? LEGEND_SHOW[id] : undefined);

/**
 * The landing's HUD for a legend (all sea legends): the catch card holds back a beat so the fish is seen first, then
 * comes in smaller and lower; the LEGEND LANDED! banner sits low over the rail instead of over the fish's head.
 */
export const LEGEND_HUD = {
  /** Seconds after the landing before the catch card comes in. */
  cardAfter: 1.8,
  /** Seconds the charter strip stays faded at the start (back with the card). */
  stripAfter: 1.8,
};
