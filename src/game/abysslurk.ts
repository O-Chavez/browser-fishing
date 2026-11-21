import * as THREE from 'three';
import { LURK, inHull, lurkAt, lurkLevel, seaHeight } from '../data/sea';
import { mulberry } from './env';
import { WAVE_GLSL, type WaveUniforms } from './seawaves';

/**
 * What lurks in the Abyss (`LURK`): the zone's three legends, glimpsed from the deck. The Leviathan arches through
 * the swell far out, the Kraken lifts an arm out of a distant crest, and the Drowned Dreamer's eyes open just under
 * the water beside the hull, find the player, and shut when looked at. Atmosphere only: no rules, nothing sent.
 *
 * Three draws at most, and none while nothing is showing: the serpent (one tube whose wave runs along it in the
 * vertex shader, `SPINE_GLSL`), the arms (instanced tubes that curl in theirs) and the eyes (instanced discs that
 * ride the drawn water like the jellies' pools, `WAVE_GLSL`). Sightings are paced from a seeded `mulberry`.
 */

type LurkUniforms = WaveUniforms & {
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uFoamCol?: { value: THREE.Color };
};

/** The sea's lightning, as far as the lurkers need it: how lit the sky is, and a bolt thrown where they stand. */
export interface LurkLightning {
  flash: number;
  strike(bearing?: number, dist?: number): void;
}

/** How a hooked Kraken's arm leans over (`reach`): `by` radians from upright, starting `at` seconds in and taking `over` seconds; `fall`: faster and faster, like a thing falling. */
export interface ArmLean {
  by: number;
  at: number;
  over: number;
  fall?: boolean;
}

export type FarKind = 'pass' | 'flash' | 'breach' | 'arm' | 'arms';
export type LurkKind = FarKind | 'eyes';

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const ease = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------------------------------------------------------
// Pacing

/** How many times faster than at level 0 sightings come: none before the zone, `LURK.busy` times at level 1. */
export const lurkRate = (here: number, level: number): number => here * (1 + (LURK.busy - 1) * clamp01(level));

/** Mean seconds between far sightings of any kind at level 0: the kinds' `every` taken together. */
export function farEvery(): number {
  const L = LURK.leviathan.every, K = LURK.kraken.every;
  return 1 / (1 / L.pass + 1 / L.flash + 1 / L.breach + 1 / K.arm + 1 / K.flash);
}

/** Which far sighting comes next, for a roll `r` (0..1): each kind as often as its `every` says. */
export function pickFar(r: number): FarKind {
  const L = LURK.leviathan.every, K = LURK.kraken.every;
  let x = r / farEvery();
  if ((x -= 1 / L.pass) < 0) return 'pass';
  if ((x -= 1 / L.flash) < 0) return 'flash';
  if ((x -= 1 / K.arm) < 0) return 'arm';
  if ((x -= 1 / K.flash) < 0) return 'arms';
  return 'breach';
}

/** Seconds (at level 0) until the next sighting of something that comes every `every` on average, for a roll `r`. */
export const lurkGap = (every: number, r: number): number => every * (0.5 + r);

/** How far out (m) a far sighting stands, for a roll `r`: from the far end of `range`, nearer the deeper the level. */
export const lurkDist = (range: [number, number], level: number, r: number): number =>
  range[0] + (range[1] - range[0]) * r * (1 - LURK.closer + LURK.closer * clamp01(level));

/**
 * How clear the view is from the deck to a point `y` metres over the water at (x, z): the least height (m) the line
 * of sight has over the swell on the way, below 0 when a crest stands in it. With `beyond`, the line is carried on
 * that many metres past the point, so above 0 also means there is sky behind it, not the face of a further swell.
 * In the Abyss's seas the far water is hidden half the time, and a dark thing in front of dark water is not seen: a
 * sighting meant to be caught in one flash waits for this.
 */
export function seaSight(x: number, z: number, y: number, t: number, mood: number, beyond = 0): number {
  const eye = 0.95 * seaHeight(0, 0, t, mood) + 3;
  const top = seaHeight(x, z, t, mood) + y;
  const d = Math.hypot(x, z) || 1;
  let clear = Infinity;
  for (let k = 1; k <= 10; k++) {
    const f = k / 11;
    clear = Math.min(clear, eye + (top - eye) * f - seaHeight(x * f, z * f, t, mood));
  }
  for (let k = 1; k <= 6 && beyond > 0; k++) {
    const f = 1 + (beyond * k) / (6 * d);
    clear = Math.min(clear, eye + (top - eye) * f - seaHeight(x * f, z * f, t, mood));
  }
  return clear;
}

// ---------------------------------------------------------------------------------------------------------------
// The Leviathan's body

/** Where along the body (m from the head) the humps begin and are full; the head rides `HEAD_DIP` m under ahead of them. */
const HEAD0 = 5, HEAD1 = 18, HEAD_DIP = 4.5;
/** How deep the body's midline rides, in hump heights, so the troughs between humps are well under. */
const RIDE = 0.1;
/** How much later the tail surfaces (and sinks) than the head, as a share of the surfacing. */
const SPREAD = 0.8;
/** The reared head droops this far (m), looking down; and the body's slow sideways wander (m). */
const DROOP = 3.5, WANDER = 1.4;
/** The humps travel at this share of the body's speed, so the plates and spines slide forward over them. */
const HUMP_PACE = 0.45;

/**
 * GLSL: the Leviathan's spine `s` metres back from the head, in its own frame: (how far forward of where it lies at
 * rest, height over the swell, sideways). `L` the body's length, `A` and `K` the humps' height and wavenumber, `ph`
 * their phase, `x` the surfacing (0 under, 1 up, 2 under again, head first both ways), `b` the breach (0..1: the neck
 * reared), `w` the reared head's sway (m). `NECK`, `TALL`: the breach's neck length and height (m). Written as plain
 * float sums so the test can run the same lines as JS against `serpentSpine`.
 */
export const SPINE_GLSL = `
vec3 spineLocal(float s, float L, float A, float K, float ph, float x, float b, float w, float NECK, float TALL) {
  float u = s / L;
  float q = clamp(1.0 - s / NECK, 0.0, 1.0);
  float up = clamp(x * ${(1 + SPREAD).toFixed(2)} - u * ${SPREAD.toFixed(2)}, 0.0, 1.0);
  float dn = clamp((x - 1.0) * ${(1 + SPREAD).toFixed(2)} - u * ${SPREAD.toFixed(2)}, 0.0, 1.0);
  float shown = up * up * (3.0 - 2.0 * up) * (1.0 - dn * dn * (3.0 - 2.0 * dn));
  float e = clamp((s - mix(${HEAD0.toFixed(1)}, NECK * 0.85, b)) / mix(${(HEAD1 - HEAD0).toFixed(1)}, NECK * 0.6, b), 0.0, 1.0);
  float body = e * e * (3.0 - 2.0 * e);
  float env = body * (1.0 - 0.5 * clamp((u - 0.55) / 0.45, 0.0, 1.0));
  float rest = A * env * sin(K * s - ph) - A * ${RIDE.toFixed(2)} - (1.0 - body) * ${HEAD_DIP.toFixed(1)} * (1.0 - b);
  float rearUp = TALL * (1.0 - (1.0 - q) * (1.0 - q)) - ${DROOP.toFixed(1)} * q * q * q * q;
  float rearFwd = NECK * (0.3 * q + 0.25 * q * q * q) - NECK * q;
  float side = ${WANDER.toFixed(1)} * body * sin(K * s * 0.37 - ph * 0.5 + 1.0) + w * b * q * q;
  return vec3(b * rearFwd, rest + b * rearUp - (1.0 - shown) * (A + 7.0 + b * TALL), side);
}`;

/** `SPINE_GLSL` in JS, into `out` (forward, up, sideways). Allocates nothing. */
export function serpentSpine(s: number, L: number, A: number, K: number, ph: number, x: number, b: number, w: number, NECK: number, TALL: number, out: number[]): number[] {
  const u = s / L;
  const q = clamp01(1 - s / NECK);
  const up = clamp01(x * (1 + SPREAD) - u * SPREAD);
  const dn = clamp01((x - 1) * (1 + SPREAD) - u * SPREAD);
  const shown = up * up * (3 - 2 * up) * (1 - dn * dn * (3 - 2 * dn));
  const e = clamp01((s - lerp(HEAD0, NECK * 0.85, b)) / lerp(HEAD1 - HEAD0, NECK * 0.6, b));
  const body = e * e * (3 - 2 * e);
  const env = body * (1 - 0.5 * clamp01((u - 0.55) / 0.45));
  const rest = A * env * Math.sin(K * s - ph) - A * RIDE - (1 - body) * HEAD_DIP * (1 - b);
  const rearUp = TALL * (1 - (1 - q) * (1 - q)) - DROOP * q * q * q * q;
  const rearFwd = NECK * (0.3 * q + 0.25 * q * q * q) - NECK * q;
  out[0] = b * rearFwd;
  out[1] = rest + b * rearUp - (1 - shown) * (A + 7 + b * TALL);
  out[2] = WANDER * body * Math.sin(K * s * 0.37 - ph * 0.5 + 1) + w * b * q * q;
  return out;
}

/** The humps' height and wavenumber for the knobs, into `out`: a hump's top stands `hump` m out of the water. */
export function serpentShape(out: { A: number; K: number } = { A: 0, K: 0 }): { A: number; K: number } {
  const V = LURK.leviathan;
  out.A = Math.max(0.5, (V.hump - V.girth) / (1 - RIDE));
  out.K = (TAU * V.humps) / V.length;
  return out;
}

/** A pass's surfacing (0 under .. 1 up .. 2 under again) `t` seconds in, of `dur`, surfacing and sinking over `rise`. */
export const passPhase = (t: number, dur: number, rise: number): number =>
  t < rise ? Math.max(0, t / rise) : t > dur - rise ? Math.min(2, 1 + (t - (dur - rise)) / rise) : 1;

/**
 * A breach `t` seconds in, into `out` as (surfacing 0..2, rear 0..1): up fast and slowing at the top, hanging, then
 * crashing back faster and faster, and the rest of it sinking after. Over at `breachLength()` seconds.
 */
export function breachPose(t: number, out: number[]): number[] {
  const B = LURK.leviathan.breach;
  const fall = t - B.up - B.hang;
  out[0] = fall > B.down ? Math.min(2, 1 + (fall - B.down) / 2.5) : Math.min(1, Math.max(0, t) / (B.up * 0.6));
  const rise = clamp01(t / B.up);
  out[1] = fall <= 0 ? 1 - (1 - rise) * (1 - rise) * (1 - rise) : Math.max(0, 1 - (fall / B.down) * (fall / B.down));
  return out;
}
export const breachLength = (): number => LURK.leviathan.breach.up + LURK.leviathan.breach.hang + LURK.leviathan.breach.down + 2.5;

// ---------------------------------------------------------------------------------------------------------------
// The eyes' rules

/**
 * The shy-eye rule: how long (s) a cluster has been stared at, after `dt` more seconds with the middle of the view
 * `angle` radians off its middle. `spread` is how wide the heart of the cluster looks from there (radians, half its
 * radius): looking there, or within `LURK.eyes.shyAngle` of it, counts; a glance away starts the count again.
 */
export const stareTime = (stared: number, angle: number, spread: number, dt: number): number =>
  angle < LURK.eyes.shyAngle + spread ? stared + dt : 0;

/** Whether a cluster shuts now: at a lightning strike, or (if they are shy) once stared at for `shyAfter` seconds. */
export const eyesShut = (stared: number, flash: number): boolean => flash > 0.5 || (LURK.eyes.shy && stared >= LURK.eyes.shyAfter);

/**
 * Where a cluster opens, into `out` (x, z in the sea's frame): off to one side of where the camera at (cx, cz) looks
 * (`look`, a bearing), `r1` and `r2` rolls for the angle and the distance, and never within `LURK.eyes.range[0]`
 * metres of the hull.
 */
export function eyeSpot(cx: number, cz: number, look: number, side: number, r1: number, r2: number, out: number[]): number[] {
  const [near, far] = LURK.eyes.range;
  const a = look + side * (0.4 + 0.5 * r1);
  const dx = Math.cos(a), dz = Math.sin(a);
  let d = near + 1.5 + (far - near - 1.5) * r2 * r2;
  let x = cx + dx * d, z = cz + dz * d;
  // Stepped on outward until clear of the hull (straight over the boat, if the camera was looking inboard).
  for (let i = 0; i < 40 && inHull(x, z, near); i++) {
    d += 1.5;
    x = cx + dx * d;
    z = cz + dz * d;
  }
  out[0] = x;
  out[1] = z;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry

/** Triangles with a tone each, for the flat-shaded creatures: `at` is a float per corner (where along the body). */
class Soup {
  pos: number[] = [];
  at: number[] = [];
  tone: number[] = [];
  tri(a: number[], b: number[], c: number[], tone: number): void {
    for (const v of [a, b, c]) {
      this.at.push(v[0]);
      this.pos.push(v[1], v[2], v[3]);
      this.tone.push(tone);
    }
  }
  quad(a: number[], b: number[], c: number[], d: number[], tone: number): void {
    this.tri(a, b, c, tone);
    this.tri(a, c, d, tone);
  }
  /** A pyramid: `base` points round, and a tip. */
  spike(base: number[][], tip: number[], tone: number): void {
    for (let i = 0; i < base.length; i++) this.tri(base[i], base[(i + 1) % base.length], tip, tone);
  }
  build(atName: string): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute(atName, new THREE.Float32BufferAttribute(this.at, 1));
    g.setAttribute('aTone', new THREE.Float32BufferAttribute(this.tone, 1));
    return g;
  }
}

/** Tones: what each triangle is made of. */
const BODY = 0, BELLY = 1, BONE = 2, SEAM = 3, EYE = 4;

/** The serpent's thickness `u` of the way down it (0 head .. 1 tail), in `girth`s. */
const girthAt = (u: number): number => (0.84 + 0.16 * ease(u / 0.12)) * (1 - 0.84 * Math.pow(ease((u - 0.5) / 0.5), 1.2));

/**
 * The Leviathan: a tube of overlapping plates with a bone spine on each, and a horned, many-eyed head on the front.
 * `aS` is where along the spine each corner hangs (m back from the head) and `position` its offset there (forward, up,
 * across); the head hangs whole off the spine's front end.
 */
function leviathanGeometry(): THREE.BufferGeometry {
  const V = LURK.leviathan;
  const g = new Soup();
  const SIDES = 7, PLATES = 36, SEAM_LEN = 0.3;
  const len = V.length / PLATES;
  const ring = (s: number, r: number, k: number): number[] => {
    // A corner on top, where the spines stand.
    const a = Math.PI / 2 + (k / SIDES) * TAU;
    return [s, 0, Math.sin(a) * r, Math.cos(a) * r];
  };
  for (let i = 0; i < PLATES; i++) {
    const s0 = i * len, s1 = s0 + len;
    const r0 = V.girth * girthAt(s0 / V.length), r1 = V.girth * girthAt(s1 / V.length);
    // A plate flares toward its back edge, over the front of the next one; two lengths of it, so it bends.
    const stops: [number, number][] = [[s0, r0 * 0.93], [s0 + (len - SEAM_LEN) / 2, (r0 + r1) * 0.5], [s1 - SEAM_LEN, r1 * 1.1], [s1, r1 * 0.93]];
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < SIDES; k++) {
        const under = Math.sin(Math.PI / 2 + ((k + 0.5) / SIDES) * TAU) < -0.4;
        g.quad(ring(stops[j][0], stops[j][1], k), ring(stops[j][0], stops[j][1], k + 1), ring(stops[j + 1][0], stops[j + 1][1], k + 1), ring(stops[j + 1][0], stops[j + 1][1], k), j === 2 ? SEAM : under ? BELLY : BODY);
      }
    // Its spine: a bone blade swept back, every third one taller, smaller toward the tail.
    const u = s1 / V.length;
    const h = V.spine * (i % 3 === 0 ? 1 : 0.62) * (0.5 + 0.5 * ease(u / 0.1)) * (1 - 0.75 * ease((u - 0.55) / 0.45));
    const sb = s1 - SEAM_LEN - 0.8;
    const top = r1 * 1.02;
    g.spike([[sb, 0.8, top, 0], [sb, 0, top - 0.15, 0.4], [sb, -0.8, top + 0.1, 0], [sb, 0, top - 0.15, -0.4]], [sb, -1.3, top + h, 0], BONE);
  }
  // The tail's tip.
  const tipR = V.girth * girthAt(1) * 0.93;
  for (let k = 0; k < SIDES; k++) g.tri(ring(V.length, tipR, k), ring(V.length, tipR, k + 1), [V.length, -2.5, 0, 0], BODY);

  // The head, hung off the spine's front end: sections from the neck to the snout (how far forward, half width, top, bottom).
  const R = V.girth * girthAt(0) * 0.93;
  const HS = 8;
  const loft = (secs: number[][], place: (x: number, y: number, z: number) => number[], tone: (k: number, j: number) => number, tip: number[]) => {
    const pt = (j: number, k: number): number[] => {
      const [x, w, top, bot] = secs[j];
      const a = Math.PI / 2 + Math.PI / HS + (k / HS) * TAU;
      const sn = Math.sin(a);
      return place(x, sn > 0 ? top * sn : -bot * sn, w * Math.cos(a));
    };
    for (let j = 0; j < secs.length - 1; j++) for (let k = 0; k < HS; k++) g.quad(pt(j, k + 1), pt(j, k), pt(j + 1, k), pt(j + 1, k + 1), tone(k, j));
    for (let k = 0; k < HS; k++) g.tri(pt(secs.length - 1, k + 1), pt(secs.length - 1, k), tip, tone(k, secs.length - 1));
    for (let k = 0; k < HS; k++) g.tri(pt(0, k), pt(0, k + 1), place(secs[0][0], 0, 0), BODY);
  };
  const skull = [[0, R, R, -R], [1.8, 3.2, 3.1, -2.2], [4.4, 2.8, 2.3, -0.5], [7.6, 1.8, 1.25, -0.25], [9.8, 0.75, 0.4, -0.15]];
  const head = (x: number, y: number, z: number): number[] => [0, x, y, z];
  loft(skull, head, () => BODY, head(11, 0.05, 0));
  // The lower jaw, hinged under the skull and hanging open.
  const gape = 0.3, hx = 1.6, hy = -1.7;
  const jaw = (x: number, y: number, z: number): number[] => [0, hx + x * Math.cos(gape) + y * Math.sin(gape), hy - x * Math.sin(gape) + y * Math.cos(gape), z];
  loft([[0, 2.5, 0.35, -1.1], [3, 2.35, 0.25, -1.0], [6.2, 1.5, 0.15, -0.6], [8.2, 0.6, 0.1, -0.3]], jaw, () => BELLY, jaw(9.3, 0, 0));
  // Fangs: hanging from the upper jaw, and standing up from the lower.
  const fang = (place: (x: number, y: number, z: number) => number[], x: number, y: number, z: number, l: number) =>
    g.spike([place(x + 0.35, y, z), place(x - 0.2, y, z + 0.3), place(x - 0.2, y, z - 0.3)], place(x - 0.1, y + l, z), BONE);
  for (const sgn of [-1, 1]) {
    fang(head, 5.0, -0.4, sgn * 2.2, -1.5);
    fang(head, 6.6, -0.3, sgn * 1.75, -1.3);
    fang(head, 8.2, -0.2, sgn * 1.2, -1.1);
    fang(jaw, 5.4, 0.15, sgn * 1.45, 1.2);
    fang(jaw, 7.2, 0.1, sgn * 0.85, 1.0);
  }
  // A crown of three horns swept back off the brow.
  const horn = (z: number, l: number, out: number) =>
    g.spike([head(2.6, 2.7, z), head(1.6, 2.9, z + 0.6), head(0.9, 2.5, z), head(1.6, 2.9, z - 0.6)], head(1.4 - l * 0.72, 2.9 + l * 0.7, z + out), BONE);
  horn(0, 5.5, 0);
  horn(1.9, 4.2, 1.3);
  horn(-1.9, 4.2, -1.3);
  // The burning eyes: a row down each side of the skull, each a little smaller than the one ahead of it.
  const eyes: [number, number, number, number][] = [[5.3, 1.35, 1.75, 0.85], [3.8, 1.9, 1.8, 0.7], [2.4, 2.35, 1.75, 0.55]];
  for (const sgn of [-1, 1])
    for (const [x, y, z, r] of eyes) {
      const c = [x, y, sgn * z];
      const p = (dx: number, dy: number, dz: number): number[] => head(c[0] + dx * r, c[1] + dy * r, c[2] + dz * r * sgn);
      // A gem standing out of the socket: four facets up to a point, on a wider ring.
      const rim = [p(1.2, -0.3, 0), p(0, 0.9, -0.2), p(-1.2, 0.3, 0), p(0, -0.9, 0.1)];
      g.spike(sgn > 0 ? rim : [...rim].reverse(), p(0, 0.25, 0.75), EYE);
    }
  return g.build('aS');
}

const ARM_SEGS = 26, ARM_SIDES = 8;

/**
 * One Kraken arm, as a straight tube the shader bends: `aU` how far along (0 root .. 1 tip), `position` the corner's
 * place on its ring (toward the inside of the curl, across) with how far along again. The inside of the curl is the
 * pale underside, with two rows of suckers.
 */
function armGeometry(): THREE.BufferGeometry {
  const g = new Soup();
  // Closer rings toward the tip, where it curls.
  const at = (i: number): number => 1 - Math.pow(1 - i / ARM_SEGS, 1.4);
  const ring = (u: number, k: number, r = 1): number[] => {
    const a = ((k + 0.5) / ARM_SIDES) * TAU;
    return [u, Math.cos(a) * r, Math.sin(a) * r, u];
  };
  for (let i = 0; i < ARM_SEGS; i++) {
    const u0 = at(i), u1 = at(i + 1);
    for (let k = 0; k < ARM_SIDES; k++) {
      // Facets facing the inside of the curl (ring angle 0) are the underside.
      const mid = ((k + 1) / ARM_SIDES) * TAU;
      const tone = Math.cos(mid) > 0.6 ? BELLY : BODY;
      if (i === ARM_SEGS - 1) g.tri(ring(u0, k), ring(u0, k + 1), [1, 0, 0, 1], tone);
      else g.quad(ring(u0, k), ring(u0, k + 1), ring(u1, k + 1), ring(u1, k), tone);
    }
    // A sucker on each row, standing out of the underside.
    if (i > 2 && i < ARM_SEGS - 2)
      for (const sgn of [-1, 1]) {
        const a = sgn * 0.52, um = (u0 + u1) / 2, du = (u1 - u0) * 0.42, da = 0.2;
        const p = (uu: number, aa: number, r: number): number[] => [uu, Math.cos(aa) * r, Math.sin(aa) * r, uu];
        g.spike([p(um - du, a, 0.97), p(um, a + da, 0.97), p(um + du, a, 0.97), p(um, a - da, 0.97)], p(um, a, 1.3), SEAM);
      }
  }
  return g.build('aU');
}

/**
 * A disc 1 across on the water (y up), in rings of `segs` points at `radii` (shares of its radius), for an eye to
 * bend over the waves: close rings across the iris in the middle, which must not dip under the water it lies on, and
 * wide ones out through the glow.
 */
function eyeDisc(radii: number[], segs: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  const rings = radii.length;
  for (let r = 1; r <= rings; r++)
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU, d = 0.5 * radii[r - 1];
      pos.push(Math.cos(a) * d, 0, Math.sin(a) * d);
    }
  const at = (r: number, i: number) => (r ? 1 + (r - 1) * segs + (i % segs) : 0);
  for (let i = 0; i < segs; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let r = 1; r < rings; r++)
    for (let i = 0; i < segs; i++) idx.push(at(r, i), at(r, i + 1), at(r + 1, i + 1), at(r, i), at(r + 1, i + 1), at(r + 1, i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---------------------------------------------------------------------------------------------------------------
// Shaders

/**
 * GLSL (fragment): a far creature's colour. Flat facets, lit a little from above and more in a lightning flash, a
 * line of foam where it breaks the water, then lost toward the fog's own dark colour with distance; what glows
 * (eyes, seams) shows through that.
 */
const SHADE_GLSL = `
uniform vec3 uDark, uFogColor, uFoamCol;
uniform float uFogNear, uFogFar, uHaze, uLight, uFlash, uFlashLit, uSheen, uMurk, uClock;
float lurkHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 lurkShade(vec3 base, vec3 glowCol, float glow, float above, vec3 world) {
  vec3 fn = normalize(cross(dFdx(world), dFdy(world)));
  float up = 0.5 + 0.5 * fn.y;
  vec3 col = base * (uLight * (0.3 + 0.7 * up) + uFlash * uFlashLit * (0.2 + 0.8 * up));
  // Wet hide catches what light there is, most on its upper faces.
  col += vec3(0.5, 0.55, 0.75) * uSheen * (0.3 + 0.7 * smoothstep(0.3, 1.0, up));
  float churn = lurkHash(floor(world.xz * 1.3) + floor(uClock * 3.0));
  float foam = (1.0 - smoothstep(0.0, 0.7 + 1.1 * churn, above)) * step(-4.0, above);
  col = mix(col, uFoamCol * (0.75 + 0.25 * churn), foam * 0.7);
  float far = smoothstep(uFogNear, uFogFar, length(cameraPosition - world));
  float haze = uHaze * far;
  col = mix(col, uDark, haze);
  col = mix(col, glowCol, glow * (1.0 - 0.4 * haze));
  // Low down it is lost in the murk the far water is lost in (the fog as it is now, lit or not), so it stands in
  // the sea and not over it.
  return mix(col, uFogColor, far * (1.0 - smoothstep(0.0, uMurk, above)));
}`;

const leviathanVert = `
${WAVE_GLSL}
${SPINE_GLSL}
attribute float aS; attribute float aTone;
uniform vec4 uHead, uPose, uShape;
varying vec3 vWorld; varying float vTone; varying float vAbove;
// The spine s metres back from the head, in the sea's frame, riding the long swell where it is.
vec3 spine(float s){
  vec3 l = spineLocal(s, uShape.x, uShape.y, uShape.z, uPose.z, uPose.x, uPose.y, uPose.w, uShape.w, uHead.w);
  vec2 dir = vec2(cos(uHead.z), sin(uHead.z));
  vec2 p = uHead.xy + dir * (l.x - s) + vec2(-dir.y, dir.x) * l.z;
  vec3 d, n; float hc, hs, att;
  seaWaves(p, d, n, hc, hs, att);
  return vec3(p.x, hs + l.y, p.y);
}
void main(){
  vec3 a = spine(aS - 0.6), c = spine(aS + 0.6);
  vec3 T = normalize(a - c);
  vec3 B = vec3(-sin(uHead.z), 0.0, cos(uHead.z));
  B = normalize(B - T * dot(B, T));
  vec3 N = cross(B, T);
  vec3 p = 0.5 * (a + c) + T * position.x + N * position.y + B * position.z;
  vec3 d, n; float hc, hs, att;
  seaWaves(p.xz, d, n, hc, hs, att);
  vAbove = p.y - hs;
  vTone = aTone;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const leviathanFrag = `
${SHADE_GLSL}
uniform vec3 uBody, uBelly, uBone, uEmber;
uniform float uSeams, uEyes;
varying vec3 vWorld; varying float vTone; varying float vAbove;
void main(){
  vec3 base = vTone < 0.5 ? uBody : vTone < 1.5 ? uBelly : vTone < 2.5 ? uBone : uBody * 0.6;
  float glow = vTone > 3.5 ? uEyes : vTone > 2.5 ? uSeams : 0.0;
  vec3 col = lurkShade(base, uEmber * (vTone > 3.5 ? 2.2 : 1.0), glow, vAbove, vWorld);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const armVert = `
${WAVE_GLSL}
attribute float aU; attribute float aTone;
attribute vec4 aArm; attribute vec4 aArmB;
uniform float uCurl;
varying vec3 vWorld; varying float vTone; varying float vAbove;
// How far the arm leans off upright u of the way along it: a slow sway, and a curl that tightens toward the tip.
float bend(float u, float curl){
  float c = smoothstep(0.3, 1.0, u);
  return 0.14 * sin(uTime * 0.4 + aArmB.y * 6.0) + 0.3 * u * sin(uTime * 0.55 + aArmB.y * 17.0 + u * 2.4) + curl * c * c;
}
void main(){
  float len = aArm.w, out0 = 1.0 - aArmB.x;
  // It comes up straight as a spike, and the tip curls over as more of it stands clear.
  float curl = uCurl * (0.65 + 0.7 * fract(aArmB.y * 7.3)) * (0.25 + 0.75 * smoothstep(0.15, 0.8, aArmB.x)) * (0.9 + 0.1 * sin(uTime * 0.3 + aArmB.y * 9.0));
  // A hooked Kraken's arm may lean over from the waterline (aArmB.w, radians: a slap lays it flat on the water);
  // laid over, it straightens out.
  float lean = aArmB.w;
  curl *= 1.0 - 0.75 * clamp(lean / 1.5, 0.0, 1.0);
  vec2 p = vec2(0.0, -(out0 - aU) * len);
  float a = 0.0;
  if (aU > out0) {
    p = vec2(0.0);
    float du = (aU - out0) / 14.0;
    for (int i = 0; i < 14; i++) {
      float uu = out0 + (float(i) + 0.5) * du;
      float b = bend(uu, curl) + lean * smoothstep(0.0, 0.12, uu - out0);
      p += vec2(sin(b), cos(b)) * du * len;
    }
    a = bend(aU, curl) + lean * smoothstep(0.0, 0.12, aU - out0);
  }
  vec3 d, n; float hc, hs, att;
  seaWaves(aArm.xy, d, n, hc, hs, att);
  float f = aArm.z + 0.2 * sin(uTime * 0.23 + aArmB.y * 31.0);
  vec3 H = vec3(cos(f), 0.0, sin(f)), B = vec3(-sin(f), 0.0, cos(f));
  vec3 inner = H * cos(a) - vec3(0.0, 1.0, 0.0) * sin(a);
  float r = aArmB.z * (1.0 - 0.9 * pow(aU, 1.15));
  vec3 q = vec3(aArm.x, hs, aArm.y) + H * p.x + vec3(0.0, p.y, 0.0) + (inner * position.x + B * position.y) * r;
  // The foam where it breaks the water is in scale with it: a short arm by the hull (a hooked Kraken's) has a narrow line of it.
  vAbove = (q.y - hs) / clamp(len / 16.0, 0.25, 1.0);
  vTone = aTone;
  vec4 w = modelMatrix * vec4(q, 1.0);
  vWorld = w.xyz;
  gl_Position = aArmB.x < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
}`;

const armFrag = `
${SHADE_GLSL}
uniform vec3 uBody, uBelly, uSucker;
varying vec3 vWorld; varying float vTone; varying float vAbove;
void main(){
  vec3 base = vTone < 0.5 ? uBody : vTone < 1.5 ? uBelly : uSucker;
  gl_FragColor = vec4(lurkShade(base, vec3(0.0), 0.0, vAbove, vWorld), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** How many iris radii the eye's patch of water reaches, for the glow round it; lite graphics draws the eye alone. */
const EYE_REACH = 2.6, EYE_REACH_LITE = 1.1;

const eyeVert = `
${WAVE_GLSL}
attribute vec4 aEye; attribute vec4 aGaze;
uniform vec3 uCam;
uniform float uReach, uStretch, uFogNear, uFogFar;
varying vec2 vUv; varying vec2 vPupil; varying float vOpen; varying float vSeed; varying float vFade; varying vec3 vWorld;
void main(){
  // The eye's own frame on the water: across the view, and toward the viewer, which is the way its lids close.
  vec2 toCam = uCam.xz - aEye.xy;
  float away = length(toCam);
  toCam /= max(away, 0.001);
  vec2 across = vec2(toCam.y, -toCam.x);
  // Seen low across the water a disc is a line: it is drawn longer toward the viewer, so it stays an eye. How low
  // is from the water's own slope where the eye lies: on a wave's near face it is seen almost square-on.
  vec3 d, n; float hc, hs, att;
  seaWaves(aEye.xy, d, n, hc, hs, att);
  float steep = max(dot(normalize(n), normalize(uCam - vec3(aEye.x + d.x, d.y, aEye.y + d.z))), 0.05);
  float stretch = clamp(0.8 / steep, 1.0, uStretch);
  vUv = position.xz * 2.0 * uReach;
  vec2 p = aEye.xy + (across * vUv.x + toCam * vUv.y * stretch) * aEye.z;
  seaWaves(p, d, n, hc, hs, att);
  vec4 w = modelMatrix * vec4(p.x + d.x, d.y + 0.06, p.y + d.z, 1.0);
  vWorld = w.xyz;
  vOpen = aEye.w;
  vSeed = aGaze.z;
  vPupil = vec2(dot(aGaze.xy, across), dot(aGaze.xy, toCam)) * 0.36;
  vFade = 1.0 - 0.7 * smoothstep(uFogNear, uFogFar, length(cameraPosition - w.xyz));
  gl_Position = aEye.w < 0.004 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
}`;

const eyeFrag = `
uniform vec3 uIris, uPupil;
uniform float uGlow, uClock;
varying vec2 vUv; varying vec2 vPupil; varying float vOpen; varying float vSeed; varying float vFade; varying vec3 vWorld;
void main(){
  // The water over it wobbles what is seen.
  vec2 q = vUv + 0.04 * vec2(sin(vWorld.z * 5.0 + uClock * 2.3 + vSeed), cos(vWorld.x * 4.3 - uClock * 1.9));
  float r = length(q);
  // The lids: an almond that narrows to a slit and shuts.
  float lid = vOpen * 1.1 * sqrt(max(0.0, 1.0 - q.x * q.x)) - abs(q.y);
  float inLid = smoothstep(0.0, 0.08, lid);
  float eye = (1.0 - smoothstep(0.92, 1.0, r)) * inLid;
  vec2 pq = (q - vPupil) / vec2(0.3, 0.52);
  float pupil = 1.0 - smoothstep(0.78, 1.0, length(pq));
  // The iris: flat wedges round the pupil, brighter toward it, with a dark rim.
  float wedge = 0.8 + 0.2 * step(0.5, fract(atan(q.y - vPupil.y, q.x - vPupil.x) * 1.9099 + vSeed));
  vec3 iris = uIris * (0.4 + 0.8 * smoothstep(1.0, 0.4, r)) * wedge * (1.0 - 0.6 * smoothstep(0.7, 0.95, r));
  iris = mix(iris, uPupil, pupil);
  // Its light on the water round it, while it is open.
  float halo = uGlow * vOpen * (0.5 * exp(-r * r * 1.1) + 0.25 * exp(-r * r * 6.0)) * (1.0 - eye);
  gl_FragColor = vec4((iris * eye + uIris * halo) * vFade, eye * 0.96 * vFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------------------------------------------------------

/** How many arms and eyes can be drawn at once: the sightings use 5 and 9 at most; a hooked Kraken's arms and a hooked Dreamer's eyes (`reach`, `keep`) the rest. */
const ARMS = 10;
const EYES = 24;
/** How long (s) a sighting shown by one flash waits for a clear view before giving up: about one swell. */
const FLASH_WAIT = 12;

export class AbyssLurk {
  readonly group = new THREE.Group();
  /** The knobs, for staging from the page. */
  readonly knobs = LURK;
  /** Staging: false stops sightings coming on their own (`show` still works). */
  auto = true;
  /** Staging: the level to pace by instead of the sea's own (0..1), or null. */
  level: number | null = null;
  /** Staging: holds every eye this far open (0..1), unblinking and unshy, or null. */
  eyeHold: number | null = null;

  private rnd = mulberry(47);
  private lite = false;
  private mood = 0;
  private t = 0;
  private dim = 0;

  private shade: Record<string, THREE.IUniform>;
  private dark = new THREE.Color();
  private lastFlash = 0;
  /** Seconds (at level 0) until the next far sighting and the next eyes, and of nothing left after a far one. */
  private farIn: number;
  private eyesIn: number;
  private restIn = 0;
  /**
   * A sighting shown by one flash is `armed` until its bolt comes (at bearing `boltAt`): it has waited `wait` seconds
   * for the swell to leave the view to it clear, and gives up after `FLASH_WAIT`.
   */
  private armed = false;
  private wait = 0;
  private boltAt = 0;

  // The Leviathan.
  private serpent: THREE.Mesh;
  private sU: { uHead: { value: THREE.Vector4 }; uPose: { value: THREE.Vector4 }; uShape: { value: THREE.Vector4 }; uEyes: { value: number }; uSeams: { value: number } } & Record<string, THREE.IUniform>;
  private sKind: 'none' | 'pass' | 'flash' | 'breach' = 'none';
  private sT = 0;
  private sDur = 0;
  private sX = 0;
  private sZ = 0;
  private sHeading = 0;
  private sPh = 0;
  private sRear = 0;
  private sSeen = false;
  private pose = [0, 0];

  // The Kraken's arms.
  private arms: THREE.Mesh;
  private armGeo: THREE.InstancedBufferGeometry;
  private armA: THREE.InstancedBufferAttribute;
  private armB: THREE.InstancedBufferAttribute;
  private aU: Record<string, THREE.IUniform>;
  /** Per arm: 0 none, 1 rising and sinking in its own time, 2 shown by a flash. */
  private aMode = new Uint8Array(ARMS);
  private aT = new Float32Array(ARMS);
  private aX = new Float32Array(ARMS);
  private aZ = new Float32Array(ARMS);
  private aFace = new Float32Array(ARMS);
  private aLen = new Float32Array(ARMS);
  private aSeed = new Float32Array(ARMS);
  private aHang = new Float32Array(ARMS);
  private aTop = new Float32Array(ARMS);
  /** Seconds each arm takes to rise and to sink (`LURK.kraken.rise` and `sink`, or a hooked Kraken's own). */
  private aRise = new Float32Array(ARMS).fill(LURK.kraken.rise);
  private aSink = new Float32Array(ARMS).fill(LURK.kraken.sink);
  /** Per arm: 1 for one a hooked Kraken raised (`reach`), which `letGo` sinks. */
  private aReach = new Uint8Array(ARMS);
  /** Per arm (a hooked Kraken's): how far it leans over (radians), from `aLeanAt` seconds in and over `aLeanIn` seconds (falling faster and faster if `aLeanFall`); and its girth, times the far arms'. */
  private aLean = new Float32Array(ARMS);
  private aLeanAt = new Float32Array(ARMS);
  private aLeanIn = new Float32Array(ARMS).fill(1);
  private aLeanFall = new Uint8Array(ARMS);
  private aGirth = new Float32Array(ARMS).fill(1);
  /** Per arm: how many times its place has been given out by `reach`, so an old id is not taken for a new arm. */
  private aGen = new Uint32Array(ARMS);
  /** Staging and a giant's fight: true stops sightings coming on their own (what the game asks for still shows). */
  quiet = false;
  private aSeen = false;
  private aOn = false;

  // The eyes.
  private eyes: THREE.Mesh;
  private eyeGeo: THREE.InstancedBufferGeometry;
  private eyeA: THREE.InstancedBufferAttribute;
  private eyeG: THREE.InstancedBufferAttribute;
  private eU: { uCam: { value: THREE.Vector3 }; uIris: { value: THREE.Color }; uPupil: { value: THREE.Color }; uGlow: { value: number }; uReach: { value: number }; uStretch: { value: number } } & Record<string, THREE.IUniform>;
  /** 0 none, 1 waiting to learn where the camera is, 2 open, 3 shutting, 4 away before opening somewhere else. */
  private eState = 0;
  private eT = 0;
  private eStay = 0;
  private eAway = 0;
  private eMoves = 0;
  private eN = 0;
  private eX = 0;
  private eZ = 0;
  private eR = 1;
  private eStared = 0;
  private eBearing: number | null = null;
  /** A ring the game asked for (`ring`): its radius (m), how many eyes and how long they stay; they are not shy and open nowhere else. */
  private eRing: { radius: number; count: number; stay: number; size: number } | null = null;
  private eOx = new Float32Array(EYES);
  private eOz = new Float32Array(EYES);
  private eAcross = new Float32Array(EYES);
  private eAlong = new Float32Array(EYES);
  private eSize = new Float32Array(EYES);
  private eDelay = new Float32Array(EYES);
  private eOpen = new Float32Array(EYES);
  private eBlink = new Float32Array(EYES);
  private eShutFor = new Float32Array(EYES);
  private eGx = new Float32Array(EYES);
  private eGz = new Float32Array(EYES);
  private eWander = new Float32Array(EYES);
  /** The camera in the sea's frame, as last drawn: where it is and which way it looks. */
  private cam = new THREE.Vector3();
  private camDir = new THREE.Vector3(0, 0, -1);
  private camSeen = false;
  private inv = new THREE.Matrix4();
  private spot = [0, 0];

  constructor(private u: LurkUniforms) {
    this.farIn = lurkGap(farEvery(), this.rnd()) * 0.6;
    this.eyesIn = lurkGap(LURK.eyes.every, this.rnd()) * 0.5;
    const waves = { uTime: u.uTime, uWa: u.uWa, uWb: u.uWb };
    this.shade = {
      uDark: { value: this.dark },
      uFogColor: u.uFogColor,
      uMurk: { value: LURK.murk },
      uFoamCol: u.uFoamCol ?? { value: new THREE.Color(0xb8b4c8) },
      uFogNear: u.uFogNear,
      uFogFar: u.uFogFar,
      uHaze: { value: LURK.haze },
      uLight: { value: 1 },
      uFlash: { value: 0 },
      uFlashLit: { value: LURK.flashLit },
      uSheen: { value: LURK.sheen },
      uClock: u.uTime,
    };
    const V = LURK.leviathan;
    this.sU = {
      ...waves,
      ...this.shade,
      uHead: { value: new THREE.Vector4() },
      uPose: { value: new THREE.Vector4() },
      uShape: { value: new THREE.Vector4() },
      uBody: { value: new THREE.Color(V.body) },
      uBelly: { value: new THREE.Color(V.belly) },
      uBone: { value: new THREE.Color(V.bone) },
      uEmber: { value: new THREE.Color(V.ember) },
      uSeams: { value: 0 },
      uEyes: { value: 0 },
    };
    this.serpent = new THREE.Mesh(
      leviathanGeometry(),
      new THREE.ShaderMaterial({ uniforms: this.sU, vertexShader: leviathanVert, fragmentShader: leviathanFrag, side: THREE.DoubleSide }),
    );

    const K = LURK.kraken;
    this.armGeo = new THREE.InstancedBufferGeometry().copy(armGeometry() as THREE.InstancedBufferGeometry);
    this.armA = new THREE.InstancedBufferAttribute(new Float32Array(ARMS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.armB = new THREE.InstancedBufferAttribute(new Float32Array(ARMS * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.armGeo.setAttribute('aArm', this.armA);
    this.armGeo.setAttribute('aArmB', this.armB);
    this.aU = {
      ...waves,
      ...this.shade,
      uCurl: { value: K.curl },
      uBody: { value: new THREE.Color(K.body) },
      uBelly: { value: new THREE.Color(K.belly) },
      uSucker: { value: new THREE.Color(K.sucker) },
    };
    this.arms = new THREE.Mesh(this.armGeo, new THREE.ShaderMaterial({ uniforms: this.aU, vertexShader: armVert, fragmentShader: armFrag, side: THREE.DoubleSide }));

    const E = LURK.eyes;
    this.eyeGeo = new THREE.InstancedBufferGeometry().copy(eyeDisc([0.1, 0.2, 0.3, 0.4, 0.62, 1], 16) as THREE.InstancedBufferGeometry);
    this.eyeA = new THREE.InstancedBufferAttribute(new Float32Array(EYES * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.eyeG = new THREE.InstancedBufferAttribute(new Float32Array(EYES * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.eyeGeo.setAttribute('aEye', this.eyeA);
    this.eyeGeo.setAttribute('aGaze', this.eyeG);
    this.eU = {
      ...waves,
      uFogNear: u.uFogNear,
      uFogFar: u.uFogFar,
      uClock: u.uTime,
      uCam: { value: new THREE.Vector3(0, 3, 0) },
      uIris: { value: new THREE.Color(E.color) },
      uPupil: { value: new THREE.Color(E.pupil) },
      uGlow: { value: E.glow },
      uReach: { value: EYE_REACH },
      uStretch: { value: E.stretch },
    };
    this.eyes = new THREE.Mesh(
      this.eyeGeo,
      new THREE.ShaderMaterial({
        uniforms: this.eU,
        vertexShader: eyeVert,
        fragmentShader: eyeFrag,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
      }),
    );
    this.eyes.renderOrder = 3;
    // The eyes turn to the camera, and shut when it looks at them: each draw says where it is, in the sea's frame.
    this.eyes.onBeforeRender = (_r, _s, camera) => {
      this.inv.copy(this.eyes.matrixWorld).invert();
      this.cam.copy(camera.position).applyMatrix4(this.inv);
      camera.getWorldDirection(this.camDir).transformDirection(this.inv);
      this.camSeen = true;
    };

    for (const o of [this.serpent, this.arms, this.eyes]) {
      o.frustumCulled = false;
      o.visible = false;
    }
    this.group.add(this.serpent, this.arms, this.eyes);
    this.group.visible = false;
  }

  /** Lite graphics: the eyes lose their glow on the water, and fewer open. */
  setLite(on: boolean): void {
    this.lite = on;
  }

  /**
   * Staging: shows a sighting now, at `bearing` (atan2 of z, x; default somewhere over the open sea players face) and,
   * for the far ones, `dist` metres out. `pass`, `flash` and `breach` are the Leviathan's, `arm` one Kraken arm and
   * `arms` several in a flash; `eyes` opens a cluster (at `bearing` and `dist` from the boat's middle if given, else
   * off to the side of the camera's view). `side` (-1 or 1): which way the Leviathan heads, or an arm curls.
   */
  show(kind: LurkKind, bearing?: number, dist?: number, side?: number): void {
    if (kind === 'eyes') this.startEyes(bearing, dist);
    else {
      this.startFar(kind, this.level ?? lurkLevel(this.mood), bearing, dist, side);
      // Now, not when the swell next leaves the view clear.
      this.wait = Infinity;
    }
  }

  /**
   * A hooked Kraken shows an arm. One arm up out of the water at (x, z) in the sea's frame,
   * `height` m tall, curling toward `face` (radians), up in `rise` seconds and down after `hold` (in `sink` seconds, the
   * far arms' own unless given), or sooner with `letGo`. Not counted as a sighting.
   */
  reach(x: number, z: number, height: number, face: number, rise: number, hold: number, sink = LURK.kraken.sink, lean?: ArmLean, girth = 1): number {
    let i = this.aMode.indexOf(0);
    if (i < 0) i = 0;
    this.aGen[i]++;
    this.aLean[i] = lean?.by ?? 0;
    this.aLeanAt[i] = lean?.at ?? 0;
    this.aLeanIn[i] = Math.max(0.01, lean?.over ?? 1);
    this.aLeanFall[i] = lean?.fall ? 1 : 0;
    this.aGirth[i] = girth;
    this.aSink[i] = sink;
    this.aReach[i] = 1;
    this.aX[i] = x;
    this.aZ[i] = z;
    this.aFace[i] = face;
    this.aLen[i] = height / 0.8;
    this.aSeed[i] = this.rnd();
    this.aHang[i] = hold;
    this.aTop[i] = 1;
    this.aT[i] = 0;
    this.aRise[i] = rise;
    this.aMode[i] = 1;
    return this.aGen[i] * ARMS + i;
  }

  /** The arm `reach` gave `id` for, if it is still that arm and not yet gone under; -1 otherwise. */
  private armOf(id: number): number {
    const i = id % ARMS;
    return id >= 0 && this.aMode[i] === 1 && this.aReach[i] && this.aGen[i] * ARMS + i === id ? i : -1;
  }

  /**
   * Moves a hooked Kraken's arm (`id` from `reach`) to (x, z), standing `height` m tall: the game keeps its arms where
   * the line holds it, and has them stand taller in a surge. False once the arm has gone under.
   */
  hold(id: number, x: number, z: number, height: number): boolean {
    const i = this.armOf(id);
    if (i < 0) return false;
    this.aX[i] = x;
    this.aZ[i] = z;
    this.aLen[i] = height / 0.8;
    return true;
  }

  /** One of a hooked Kraken's arms (`id` from `reach`) slides under now, in `sink` seconds. */
  drop(id: number, sink: number): void {
    const i = this.armOf(id);
    if (i >= 0) this.sinkArm(i, sink);
  }

  /** The arms a hooked Kraken raised (`reach`) slide under now, in `sink` seconds, from however far up they are. */
  letGo(sink: number): void {
    for (let i = 0; i < ARMS; i++) if (this.aMode[i] === 1 && this.aReach[i]) this.sinkArm(i, sink);
  }

  private sinkArm(i: number, sink: number): void {
    const up = this.aRise[i] + this.aHang[i];
    // Already sinking: left to it. Still rising: it sinks from where it has got to.
    if (this.aT[i] >= up) return;
    const r = ease(this.aT[i] / this.aRise[i]);
    this.aTop[i] *= r;
    this.aSink[i] = sink;
    this.aT[i] = up;
  }

  /**
   * The Dreamer's eyes open in a ring: `count` of them `radius` m round (x, z) in the sea's frame, for `stay` seconds
   * or until `shut`, drawn `size` times a sighting's (far from the boat they need it). Unlike a sighting's they are not
   * shy (the player is looking right at them), a lightning strike does not shut them (in the far Abyss one lands
   * every few seconds), and they open nowhere else after. Not counted as a sighting.
   */
  ring(x: number, z: number, radius: number, count: number, stay: number, size = 1): void {
    this.startEyes(0, 0);
    this.spot[0] = x;
    this.spot[1] = z;
    this.eMoves = 0;
    this.eRing = { radius, count, stay, size };
  }

  /**
   * A hooked Dreamer's eyes, kept by the game: eye `slot` (0 up to `keepRoom`) lies at (x, z) in the sea's frame,
   * `size` times a sighting's biggest, its lids `open` (0 shut .. 1 wide). Called every frame for every eye the game
   * wants: one not asked for shuts and is gone. They are not shy; their lids ease, they blink and their pupils find
   * the viewer like any other eye's. While any is kept no sighting's cluster is drawn. Lite graphics, which draws
   * them without their glow on the water, keeps the first half of the slots only.
   */
  keep(slot: number, x: number, z: number, size: number, open: number): void {
    if (slot < 0 || slot >= EYES || (this.lite && slot >= EYES / 2)) return;
    if (!this.kOn[slot]) {
      this.kOn[slot] = 1;
      this.kOpen[slot] = 0;
      this.kSeed[slot] = this.rnd() * TAU;
      this.kBlink[slot] = 1.5 + 5 * this.rnd();
      this.kGx[slot] = Math.cos(this.kSeed[slot]);
      this.kGz[slot] = Math.sin(this.kSeed[slot]);
    }
    this.kX[slot] = x;
    this.kZ[slot] = z;
    this.kSize[slot] = size;
    this.kWant[slot] = clamp01(open);
    this.kAsked[slot] = 1;
  }
  /** How many eyes the game may keep (`keep`). */
  readonly keepRoom = EYES;
  private kOn = new Uint8Array(EYES);
  private kAsked = new Uint8Array(EYES);
  private kX = new Float32Array(EYES);
  private kZ = new Float32Array(EYES);
  private kSize = new Float32Array(EYES);
  private kWant = new Float32Array(EYES);
  private kOpen = new Float32Array(EYES);
  private kSeed = new Float32Array(EYES);
  private kBlink = new Float32Array(EYES);
  private kShut = new Float32Array(EYES);
  private kGx = new Float32Array(EYES);
  private kGz = new Float32Array(EYES);

  /** Draws the eyes the game keeps (`keep`); false if there are none. */
  private updateKept(dt: number): boolean {
    const E = LURK.eyes;
    const A = this.eyeA.array as Float32Array, G = this.eyeG.array as Float32Array;
    const cam = this.cam;
    let n = 0;
    for (let i = 0; i < EYES; i++) {
      if (!this.kOn[i]) continue;
      // Not asked for this frame: it shuts, and is gone once shut.
      let want = this.kAsked[i] ? this.kWant[i] : 0;
      this.kAsked[i] = 0;
      const asked = want > 0;
      // A blink now and then.
      if (asked && (this.kBlink[i] -= dt) <= 0) {
        this.kShut[i] = 0.14 + 0.1 * this.rnd();
        this.kBlink[i] = 1.5 + 6 * this.rnd();
      }
      const blink = this.kShut[i] > 0;
      if (blink) {
        this.kShut[i] -= dt;
        want = 0;
      }
      const o = this.kOpen[i];
      this.kOpen[i] = want > o ? Math.min(want, o + dt / 0.35) : Math.max(want, o - dt / (blink ? 0.1 : E.shut));
      if (!asked && this.kOpen[i] <= 0.004) {
        this.kOn[i] = 0;
        this.kShut[i] = 0;
        continue;
      }
      // Its pupil finds the viewer and follows them.
      let gx = cam.x - this.kX[i], gz = cam.z - this.kZ[i];
      const gd = Math.hypot(gx, gz) || 1;
      gx /= gd;
      gz /= gd;
      const k = Math.min(1, dt * 5);
      this.kGx[i] += (gx - this.kGx[i]) * k;
      this.kGz[i] += (gz - this.kGz[i]) * k;
      A[n * 4] = this.kX[i];
      A[n * 4 + 1] = this.kZ[i];
      A[n * 4 + 2] = this.kSize[i] * E.size[1];
      A[n * 4 + 3] = this.kOpen[i];
      G[n * 4] = this.kGx[i];
      G[n * 4 + 1] = this.kGz[i];
      G[n * 4 + 2] = this.kSeed[i];
      n++;
    }
    if (!n && !this.kOn.some((v) => v)) return false;
    // A sighting's cluster, if one was open, is put away: what is on the line has the water to itself.
    this.eState = 0;
    this.eyes.visible = true;
    this.eyeGeo.instanceCount = n;
    this.eyeA.needsUpdate = this.eyeG.needsUpdate = true;
    const u = this.eU;
    u.uCam.value.copy(cam);
    u.uIris.value.set(E.color);
    u.uPupil.value.set(E.pupil);
    u.uGlow.value = this.lite ? 0 : E.glow;
    u.uReach.value = this.lite ? EYE_REACH_LITE : EYE_REACH;
    u.uStretch.value = E.stretch;
    return true;
  }

  /** Shuts a `ring` now. */
  shut(): void {
    if (this.eRing && (this.eState === 1 || this.eState === 2)) this.eState = this.eState === 1 ? 0 : 3;
  }

  /** Staging: puts everything away. */
  hide(): void {
    this.sKind = 'none';
    this.aMode.fill(0);
    this.aOn = this.armed = false;
    this.eState = 0;
    this.eOpen.fill(0);
    this.kOn.fill(0);
    this.serpent.visible = this.arms.visible = this.eyes.visible = false;
  }

  /** `t`: the sea's clock (s); `mood`: the sea's mood; `night`: how dark it is (0..1); `lightning`: the sea's. */
  update(t: number, dt: number, mood: number, night: number, lightning: LurkLightning): void {
    this.t = t;
    this.mood = mood;
    const here = lurkAt(mood);
    if (here <= 0) {
      if (this.group.visible) {
        this.hide();
        this.group.visible = false;
      }
      return;
    }
    this.group.visible = true;
    const level = this.level ?? lurkLevel(mood);
    // The fog's colour as it was before the bolt lit it: what far silhouettes sink into.
    if (this.lastFlash <= 0) this.dark.copy(this.u.uFogColor.value);
    this.lastFlash = lightning.flash;
    const sh = this.shade;
    this.dim = night;
    sh.uLight.value = lerp(LURK.light[0], LURK.light[1], night);
    sh.uFlash.value = lightning.flash;
    sh.uFlashLit.value = LURK.flashLit;
    sh.uHaze.value = LURK.haze;
    sh.uSheen.value = LURK.sheen;
    sh.uMurk.value = LURK.murk;

    if (this.auto && !this.quiet) {
      const rate = lurkRate(here, level);
      const farBusy = this.sKind !== 'none' || this.aOn;
      if (farBusy) this.restIn = LURK.rest;
      else if (this.restIn > 0) this.restIn -= dt;
      else if ((this.farIn -= dt * rate) <= 0) {
        this.startFar(pickFar(this.rnd()), level);
        this.farIn = lurkGap(farEvery(), this.rnd());
      }
      if (this.eState === 0 && (this.eyesIn -= dt * rate) <= 0) {
        this.startEyes();
        this.eyesIn = lurkGap(LURK.eyes.every, this.rnd());
      }
    }
    this.updateSerpent(dt, lightning);
    this.updateArms(dt, lightning);
    this.updateEyes(t, dt, mood, lightning);
  }

  // ----- far sightings -----

  private startFar(kind: FarKind, level: number, bearing?: number, dist?: number, turn?: number): void {
    const r = this.rnd;
    // Over the open sea players face (-z), like most of the lightning.
    const a = bearing ?? -Math.PI * (0.2 + 0.6 * r());
    const side = turn ?? (r() < 0.5 ? -1 : 1);
    this.armed = kind === 'flash' || kind === 'arms';
    this.wait = 0;
    if (kind === 'arm' || kind === 'arms') {
      const K = LURK.kraken;
      const n = kind === 'arm' ? 1 : Math.min(ARMS, Math.round(lerp(K.flashArms[0], K.flashArms[1], r())));
      this.aMode.fill(0);
      for (let i = 0; i < n; i++) {
        // Several: fanned out either side of the bearing, at their own distances.
        const ai = a + (n > 1 ? (i / (n - 1) - 0.5) * (0.3 + 0.07 * n) + (r() - 0.5) * 0.06 : 0);
        let d = dist ?? lurkDist(K.range, level, r());
        if (n > 1) d = Math.max(K.range[1], d * (0.8 + 0.4 * r()));
        // Out of a crest: of a few spots along the bearing, the one the swell stands highest at.
        let best = d, top = -Infinity;
        for (let k = -2; k <= 2 && dist == null; k++) {
          const dk = Math.max(K.range[1], d + k * 14);
          const h = seaHeight(Math.cos(ai) * dk, Math.sin(ai) * dk, this.t, this.mood);
          if (h > top) {
            top = h;
            best = dk;
          }
        }
        this.aX[i] = Math.cos(ai) * best;
        this.aZ[i] = Math.sin(ai) * best;
        // Curling across the view, so the hook shows side-on.
        this.aFace[i] = ai + (n > 1 && r() < 0.5 ? -side : side) * (Math.PI / 2) + (r() - 0.5) * 0.9;
        this.aLen[i] = lerp(K.height[0], K.height[1], r()) / 0.8;
        this.aSeed[i] = r();
        this.aHang[i] = lerp(K.hang[0], K.hang[1], r());
        this.aTop[i] = n > 1 ? 0.75 + 0.25 * r() : 1;
        this.aT[i] = 0;
        this.aRise[i] = K.rise;
        this.aSink[i] = K.sink;
        this.aReach[i] = 0;
        this.aMode[i] = kind === 'arm' ? 1 : 2;
      }
      this.aSeen = false;
      this.boltAt = a + side * 0.04;
      return;
    }
    const V = LURK.leviathan;
    const d = dist ?? lurkDist(V.range, level, r());
    this.sKind = kind;
    this.sT = 0;
    this.sPh = r() * TAU;
    this.sSeen = false;
    this.sRear = 0;
    this.sX = Math.cos(a) * d;
    this.sZ = Math.sin(a) * d;
    if (kind === 'pass') {
      // Across the view, a little askew; never nearer than its closest point, `d` out (less the skew).
      this.sHeading = a + side * (Math.PI / 2) + (r() - 0.5) * 0.4;
      this.sDur = lerp(V.pass[0], V.pass[1], r());
    } else {
      // Standing: side-on, turned a little toward the boat, its middle (or its reared neck) on the bearing.
      this.sHeading = a + side * (Math.PI / 2 + 0.35);
      const rear = kind === 'breach' || r() < V.flashReared;
      const back = rear ? V.breach.neck * 0.45 : V.length * 0.5;
      this.sX += Math.cos(this.sHeading) * back;
      this.sZ += Math.sin(this.sHeading) * back;
      this.sRear = rear ? 1 : 0;
      this.sDur = kind === 'breach' ? breachLength() : 1.2;
      // The bolt comes down out by its head, not through its middle.
      this.boltAt = a + side * (rear ? 0.22 : 0.45);
    }
  }

  /**
   * An armed sighting's bolt: thrown once the view to the point `y` m over the water at (x, z) is clear, with sky
   * behind it (or at once, shown from `show`). False when it has waited too long, and the sighting is off.
   */
  private bolt(x: number, z: number, y: number, dt: number, lightning: LurkLightning): boolean {
    if (this.wait === Infinity || seaSight(x, z, y, this.t, this.mood, 150) > 0.5) {
      this.armed = false;
      lightning.strike(this.boltAt);
    } else if ((this.wait += dt) > FLASH_WAIT) return (this.armed = false);
    return true;
  }

  private updateSerpent(dt: number, lightning: LurkLightning): void {
    const kind = this.sKind;
    if (kind === 'none') {
      this.serpent.visible = false;
      return;
    }
    const V = LURK.leviathan;
    const { A, K } = serpentShape(SHAPE);
    const tau = (this.sT += dt);
    let x = 1, b = 0, hx = this.sX, hz = this.sZ, show = true;
    if (kind === 'pass') {
      x = passPhase(tau, this.sDur, V.rise);
      const along = V.length / 2 + V.speed * (tau - this.sDur / 2);
      hx += Math.cos(this.sHeading) * along;
      hz += Math.sin(this.sHeading) * along;
      this.sPh += dt * K * (1 - HUMP_PACE) * V.speed;
      // Swimming, it carries its head a little out of the water ahead of the humps.
      b = V.headUp;
    } else {
      this.sPh += dt * K * 1.2;
      if (kind === 'breach') {
        breachPose(tau, this.pose);
        x = this.pose[0];
        b = this.pose[1];
      } else {
        // There for the length of the flash: from the bolt's first light until the sky has gone dark again. The bolt
        // waits for the swell to leave the view clear, and if it never does there is no sighting.
        b = this.sRear || V.headUp;
        if (this.armed) {
          this.sT = 0;
          show = false;
          const mid = V.length * 0.5 * (1 - b);
          if (!this.bolt(hx - Math.cos(this.sHeading) * mid, hz - Math.sin(this.sHeading) * mid, V.hump * 0.5, dt, lightning)) this.sKind = 'none';
        } else if (!this.sSeen) {
          this.sSeen = lightning.flash > 0.5;
          show = this.sSeen;
        } else if (lightning.flash < 0.04) this.sKind = 'none';
      }
    }
    if (this.sT >= this.sDur && (kind !== 'flash' || !this.sSeen)) this.sKind = 'none';
    this.serpent.visible = show && this.sKind !== 'none';
    const u = this.sU;
    u.uHead.value.set(hx, hz, this.sHeading, V.breach.height);
    u.uPose.value.set(x, b, this.sPh, 2.2 * Math.sin(tau * 0.9));
    u.uShape.value.set(V.length, A, K, V.breach.neck);
    // The seams smoulder brightest in the dark; daylight and a lightning flash wash them out.
    u.uSeams.value = V.seams * (0.45 + 0.55 * this.dim) * (1 - 0.5 * lightning.flash);
    u.uEyes.value = Math.min(1, 0.45 + b);
    (u.uBody.value as THREE.Color).set(V.body);
    (u.uBelly.value as THREE.Color).set(V.belly);
    (u.uBone.value as THREE.Color).set(V.bone);
    (u.uEmber.value as THREE.Color).set(V.ember);
  }

  private updateArms(dt: number, lightning: LurkLightning): void {
    const K = LURK.kraken;
    const A = this.armA.array as Float32Array, B = this.armB.array as Float32Array;
    let n = 0;
    let flashArms = false;
    for (let i = 0; i < ARMS; i++) {
      const mode = this.aMode[i];
      if (!mode) continue;
      const tt = (this.aT[i] += dt);
      let r = this.aTop[i];
      if (mode === 1) {
        const down = tt - this.aRise[i] - this.aHang[i];
        r *= down > 0 ? 1 - ease(down / this.aSink[i]) : ease(tt / this.aRise[i]);
        if (down >= this.aSink[i]) {
          this.aMode[i] = 0;
          continue;
        }
      } else {
        flashArms = true;
        if (!this.aSeen) continue;
      }
      const k = n++ * 4;
      A[k] = this.aX[i];
      A[k + 1] = this.aZ[i];
      A[k + 2] = this.aFace[i];
      A[k + 3] = this.aLen[i];
      // Never all of it out: its root stays under as the swell drops away.
      B[k] = Math.max(0.003, r * 0.8);
      B[k + 1] = this.aSeed[i];
      B[k + 2] = K.girth * (0.8 + 0.4 * this.aSeed[i]) * (this.aLen[i] / (K.height[1] / 0.8)) ** 0.5 * (this.aReach[i] ? this.aGirth[i] : 1);
      // A hooked Kraken's arm leans over (a slap falls faster and faster; any other eases over).
      const lu = clamp01((tt - this.aLeanAt[i]) / this.aLeanIn[i]);
      B[k + 3] = this.aReach[i] ? this.aLean[i] * (this.aLeanFall[i] ? lu * lu : ease(lu)) : 0;
    }
    if (flashArms && this.armed) {
      this.aT.fill(0);
      if (!this.bolt(this.aX[0], this.aZ[0], 8, dt, lightning)) this.aMode.fill(0);
    } else if (flashArms) {
      // Shown by the flash, like the Leviathan's: gone when the sky is dark again (or if no bolt came).
      if (!this.aSeen) {
        this.aSeen = lightning.flash > 0.5;
        if (!this.aSeen && this.aT[0] > 1.2) this.aMode.fill(0);
      } else if (lightning.flash < 0.04) this.aMode.fill(0);
    }
    this.aOn = flashArms || n > 0;
    this.armGeo.instanceCount = n;
    this.arms.visible = n > 0;
    if (!n) return;
    this.aU.uCurl.value = K.curl;
    (this.aU.uBody.value as THREE.Color).set(K.body);
    (this.aU.uBelly.value as THREE.Color).set(K.belly);
    (this.aU.uSucker.value as THREE.Color).set(K.sucker);
    this.armA.needsUpdate = this.armB.needsUpdate = true;
  }

  // ----- the eyes -----

  private startEyes(bearing?: number, dist?: number): void {
    this.eRing = null;
    this.eState = 1;
    this.eMoves = LURK.eyes.moves;
    this.camSeen = false;
    this.eOpen.fill(0);
    this.eBearing = bearing ?? null;
    if (bearing != null) {
      const d = dist ?? 12;
      this.spot[0] = Math.cos(bearing) * d;
      this.spot[1] = Math.sin(bearing) * d;
    }
  }

  /** Lays a cluster out at (x, z): the biggest eye first, the rest scattered round it, apart from each other. */
  private openEyes(x: number, z: number, level: number): void {
    const E = LURK.eyes, r = this.rnd;
    const most = this.lite ? Math.min(E.liteCount, E.count[1]) : E.count[1];
    const ring = this.eRing;
    const n = ring ? Math.min(EYES, most, ring.count) : Math.min(EYES, Math.max(Math.min(E.count[0], most), Math.round(lerp(E.count[0], most, r() * (0.6 + 0.4 * level)))));
    this.eN = n;
    this.eX = x;
    this.eZ = z;
    this.eR = 0.9 + 0.4 * n;
    // Laid out across the view and (further apart, as they are drawn long that way) along it.
    let tx = this.cam.x - x, tz = this.cam.z - z;
    const td = Math.hypot(tx, tz) || 1;
    tx /= td;
    tz /= td;
    const turn = r() * TAU;
    for (let i = 0; i < n; i++) {
      this.eSize[i] = i === 0 ? E.size[1] : lerp(E.size[0], E.size[1], r() * r());
      if (ring) {
        // Evenly round the ring, a little unevenly, on the water as it lies (not drawn out along the view).
        const a = turn + ((i + 0.5 * (r() - 0.5)) / n) * TAU, d = ring.radius * (0.9 + 0.2 * r());
        this.eSize[i] = lerp(E.size[0], E.size[1], 0.35 + 0.65 * r()) * ring.size;
        this.eOx[i] = Math.cos(a) * d;
        this.eOz[i] = Math.sin(a) * d;
      }
      // A few tries at a place clear of the others.
      for (let k = 0; k < 12 && !ring; k++) {
        const a = r() * TAU, d = i === 0 ? 0.3 * r() : this.eR * Math.sqrt(0.08 + 0.92 * r());
        const across = Math.cos(a) * d, along = Math.sin(a) * d;
        this.eAcross[i] = across;
        this.eAlong[i] = along;
        this.eOx[i] = tz * across + tx * along * 1.6;
        this.eOz[i] = -tx * across + tz * along * 1.6;
        let clear = true;
        for (let j = 0; j < i && clear; j++) clear = Math.hypot(across - this.eAcross[j], along - this.eAlong[j]) > (this.eSize[i] + this.eSize[j]) * 1.5;
        if (clear) break;
      }
      // The big one first, then the others one by one (a ring's, quickly round).
      this.eDelay[i] = ring ? i * 0.14 : i === 0 ? 0 : E.open * (0.4 + i * (0.6 + 0.8 * r()));
      this.eOpen[i] = 0;
      this.eBlink[i] = this.eDelay[i] + 2 + 5 * r();
      this.eShutFor[i] = 0;
      this.eWander[i] = r() * TAU;
      this.eGx[i] = Math.cos(this.eWander[i]);
      this.eGz[i] = Math.sin(this.eWander[i]);
    }
    this.eT = 0;
    this.eStay = ring ? ring.stay : lerp(E.stay[0], E.stay[1], r());
    if (ring) this.eR = ring.radius;
    this.eStared = 0;
    this.eState = 2;
  }

  private updateEyes(t: number, dt: number, mood: number, lightning: LurkLightning): void {
    const E = LURK.eyes;
    if (this.updateKept(dt)) return;
    if (this.eState === 0) {
      this.eyes.visible = false;
      return;
    }
    const level = this.level ?? lurkLevel(mood);
    if (this.eState === 4) {
      // Away: then somewhere else.
      this.eyes.visible = false;
      if ((this.eT += dt) >= this.eAway) {
        this.eState = 1;
        this.camSeen = false;
        this.eBearing = null;
      }
      return;
    }
    this.eyes.visible = true;
    if (this.eState === 1) {
      // Drawn once with nothing in it, to learn where the camera is; then the cluster opens off to one side of the view.
      this.eyeGeo.instanceCount = 0;
      if (!this.camSeen) return;
      if (this.eBearing == null) eyeSpot(this.cam.x, this.cam.z, Math.atan2(this.camDir.z, this.camDir.x), this.rnd() < 0.5 ? -1 : 1, this.rnd(), this.rnd() * (1 - 0.4 * level), this.spot);
      this.openEyes(this.spot[0], this.spot[1], level);
    }
    const held = this.eyeHold;
    const cam = this.cam;
    this.eT += dt;
    if (this.eState === 2 && held == null) {
      // Shy: shut by a strike, or by being looked at; or their time is up.
      const y = seaHeight(this.eX, this.eZ, t, mood);
      const dx = this.eX - cam.x, dy = y - cam.y, dz = this.eZ - cam.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      const angle = Math.acos(Math.min(1, Math.max(-1, (dx * this.camDir.x + dy * this.camDir.y + dz * this.camDir.z) / d)));
      // A ring is not shy: it is where the player is looking.
      this.eStared = this.eRing ? 0 : stareTime(this.eStared, angle, 0.5 * Math.atan2(this.eR, d), dt);
      const over = this.eT > this.eStay;
      if (over || (!this.eRing && eyesShut(this.eStared, lightning.flash))) {
        this.eState = 3;
        if (over) this.eMoves = 0;
      }
    }
    const A = this.eyeA.array as Float32Array, G = this.eyeG.array as Float32Array;
    let open = 0;
    const n = this.eN;
    for (let i = 0; i < n; i++) {
      let want = this.eState === 2 && this.eT > this.eDelay[i] ? 1 : 0;
      if (held != null) want = held;
      else if (want) {
        // A blink now and then.
        if (this.eT > this.eBlink[i]) {
          this.eShutFor[i] = 0.16 + 0.1 * this.rnd();
          this.eBlink[i] = this.eT + 1.5 + 6 * this.rnd();
        }
        if (this.eShutFor[i] > 0) {
          this.eShutFor[i] -= dt;
          want = 0;
        }
      }
      const o = this.eOpen[i];
      const rate = want > o ? 1 / 0.4 : 1 / (this.eState === 3 ? E.shut : 0.1);
      this.eOpen[i] = want > o ? Math.min(want, o + dt * rate) : Math.max(want, o - dt * rate);
      open = Math.max(open, this.eOpen[i]);
      const ex = this.eX + this.eOx[i], ez = this.eZ + this.eOz[i];
      // The pupil wanders as the eye wakes, then finds the viewer and follows them.
      let gx = cam.x - ex, gz = cam.z - ez;
      const gd = Math.hypot(gx, gz) || 1;
      gx /= gd;
      gz /= gd;
      if (held == null && this.eT < this.eDelay[i] + E.notice * (0.6 + 0.8 * (i % 3) * 0.5)) {
        const w = this.eWander[i] + 0.9 * Math.sin(this.eT * 1.7 + i);
        gx = Math.cos(w);
        gz = Math.sin(w);
      }
      const k = Math.min(1, dt * 6);
      this.eGx[i] += (gx - this.eGx[i]) * k;
      this.eGz[i] += (gz - this.eGz[i]) * k;
      A[i * 4] = ex;
      A[i * 4 + 1] = ez;
      A[i * 4 + 2] = this.eSize[i];
      A[i * 4 + 3] = this.eOpen[i];
      G[i * 4] = this.eGx[i];
      G[i * 4 + 1] = this.eGz[i];
      G[i * 4 + 2] = this.eWander[i];
    }
    if (this.eState === 3 && open < 0.004) {
      if (this.eMoves-- > 0) {
        this.eState = 4;
        this.eT = 0;
        this.eAway = lerp(E.away[0], E.away[1], this.rnd());
      } else this.eState = 0;
      this.eyes.visible = false;
      return;
    }
    this.eyeGeo.instanceCount = n;
    this.eyeA.needsUpdate = this.eyeG.needsUpdate = true;
    const u = this.eU;
    u.uCam.value.copy(cam);
    u.uIris.value.set(E.color);
    u.uPupil.value.set(E.pupil);
    u.uGlow.value = this.lite ? 0 : E.glow;
    u.uReach.value = this.lite ? EYE_REACH_LITE : EYE_REACH;
    u.uStretch.value = E.stretch;
  }
}

/** The humps' shape for this frame's knobs, kept in one object so a frame allocates nothing. */
const SHAPE = { A: 1, K: 1 };
