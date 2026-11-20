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

/**
 * A sea legend's fight. Its leaps take longer the bigger it is drawn, so a giant heaves out and falls back instead
 * of hopping: `leap` seconds for an everyday fish, `leapPerScale` more for each point of drawn scale over 1, up to `leapMax`.
 *
 * An Abyss legend shows itself as each surge starts, so the creature is seen to cause the gauge's SURGE: the Kraken
 * lifts an arm beside it, the Dreamer's eyes open round it, the Leviathan rears. With no surge for a while one comes
 * anyway, `glimpseGap` seconds after the last (the first `glimpseFirst` seconds in), never within `glimpseRest` of another.
 */
export const LEGEND_FIGHT = {
  leap: 0.75,
  leapPerScale: 0.16,
  leapMax: 1.9,
  glimpseFirst: 1.2,
  glimpseGap: [12, 16] as [number, number],
  glimpseRest: 2.5,
  /** The Kraken's arm: seconds up, held and sliding back under, and its height as a share of the Kraken's drawn scale. */
  arm: { rise: 0.9, hold: 2.2, sink: 1.6, height: 0.95 },
  /** The Dreamer's eyes: how many, in a ring this share of its drawn scale across, open this long (s). */
  eyes: { count: 6, radius: 0.55, stay: 3 },
  /**
   * The Leviathan's rear: head and neck heaved slowly out of the water and back (seconds up, held and down), its nose
   * pitched up by `pitch` radians about a point `pivot` of its length behind its middle, so the tail stays under.
   */
  rear: { up: 0.8, hold: 0.45, down: 0.85, pitch: 0.85, pivot: 0.2 },
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
