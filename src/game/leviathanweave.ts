import * as THREE from 'three';
import { LEGEND_FIGHT, LEGEND_SHOW, SURFACE_LAMP, rearAt, type FightAct, type SurfaceShow } from '../data/legendshow';
import { inHull } from '../data/sea';
import { WAVE_GLSL, type WaveUniforms } from './seawaves';

/**
 * The Leviathan as its fight shows it (`LEGEND_FIGHT.weave`): one long plated serpent under the water where the line
 * holds it, weaving through the swell so that only pieces of it break the surface: the arches of its coils, a ridge
 * of back spines, its tail's blade, and on a move its head. (Its hooked model is never drawn in the fight.)
 *
 * One mesh, one draw, one shader program (`LeviathanWeave`): a straight tube of plates whose spine is bent in the
 * vertex shader (`WEAVE_GLSL`: humps that travel along it, a neck that rears, a tail that lifts, an arch that rolls
 * through), riding the drawn water under each point of it, with its plates sliding forward over the humps.
 *
 * `WeaveMotion` is the serpent's motion alone (numbers, no drawing): what the fight asks of it each frame and where
 * that leaves its spine. `LeviathanFight` (`leviathanfight.ts`) draws it where the line is and throws its white water.
 * Presentation only: nothing here reads or writes the reel, and its dice are `Math.random`.
 */

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const ease = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const smoothstep = (a: number, b: number, x: number): number => ease((x - a) / (b - a));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Up easing, held, then down faster and faster (a thing falling): 0..1 at `t` seconds in. */
const heave = (t: number, up: number, hold: number, down: number): number => (t < up ? ease(t / up) : t < up + hold ? 1 : 1 - Math.min(1, (t - up - hold) / down) ** 2);

// ---------------------------------------------------------------------------------------------------------------
// The spine

/**
 * Where the serpent's spine lies this frame, in metres (the serpent as it is drawn, grown for the distance):
 * - `L` its length, `A` its humps' height, `K` their wavenumber and `ph` their phase (they travel toward the head as
 *   it grows);
 * - `ride`: how high its middle rides over the water (under when negative); `from`, `to`: the stretch of body the
 *   humps stand along (m back from the head): ahead of it and behind it the body rides `dip` deeper;
 * - `sunk`: all of it this far under (coming up, going under);
 * - `rear` (0..1): the neck reared, `tall` high and `neck` long, the head swaying `sway` m to the side;
 * - `tail` (0..1): the last `tailLen` of it lifted, its tip `tailUp` high;
 * - `rollAt`, `rollUp`, `rollWide`: one more arch, centred this far back, this high and this long;
 * - `wander`: how far it winds from side to side.
 */
export interface WeaveShape {
  L: number;
  A: number;
  K: number;
  ph: number;
  ride: number;
  from: number;
  to: number;
  sunk: number;
  rear: number;
  tall: number;
  neck: number;
  sway: number;
  tail: number;
  tailUp: number;
  tailLen: number;
  wander: number;
  rollAt: number;
  rollUp: number;
  rollWide: number;
  dip: number;
}

export const restShape = (): WeaveShape => ({ L: 14, A: 0, K: 1, ph: 0, ride: 0, from: 3, to: 10, sunk: 9, rear: 0, tall: 3, neck: 4, sway: 0, tail: 0, tailUp: 2, tailLen: 4, wander: 0, rollAt: 0, rollUp: 0, rollWide: 2, dip: 1.3 });

/**
 * GLSL: the spine `s` metres back from the head, in the serpent's own frame: (how far forward of where it lies
 * straight, height over the water, sideways). `b` = (L, A, K, ph), `w` = (ride, from, to, sunk), `r` = (rear, tall,
 * neck, sway), `t` = (tail, tailUp, tailLen, wander), `o` = (rollAt, rollUp, rollWide, dip): `WeaveShape`. Written as
 * plain float sums so the test can run the same lines as JS against `weaveSpine`.
 */
export const WEAVE_GLSL = `
vec3 weaveSpine(float s, vec4 b, vec4 w, vec4 r, vec4 t, vec4 o) {
  float q = clamp(1.0 - s / r.z, 0.0, 1.0);
  float ramp = 1.4 * o.w;
  float front = 1.0 - smoothstep(w.y - ramp, w.y, s);
  float back = smoothstep(w.z, w.z + ramp, s);
  float end = clamp((s - b.x + t.z) / t.z, 0.0, 1.0);
  float d = (s - o.x) / o.z;
  float neckUp = r.y * (1.0 - (1.0 - q) * (1.0 - q)) - 0.2 * r.y * q * q * q * q;
  float y = w.x + b.y * (1.0 - front) * (1.0 - back) * sin(b.z * s + b.w) + o.y * exp(-d * d);
  y = y - front * o.w * (1.0 - r.x) - back * o.w * (1.0 - t.x) + r.x * neckUp + t.x * t.y * end * sqrt(end) - w.w;
  float x = r.x * r.z * (0.25 * q * q * q - 0.7 * q) + t.x * t.z * 0.3 * end * end;
  float z = t.w * (1.0 - front) * sin(b.z * s * 0.37 + b.w * 0.5 + 1.0) + r.w * r.x * q * q;
  return vec3(x, y, z);
}`;

/** `WEAVE_GLSL` in JS, into `out` (forward, up, sideways). Allocates nothing. */
export function weaveSpine(s: number, h: WeaveShape, out: number[]): number[] {
  const q = clamp01(1 - s / h.neck);
  const ramp = 1.4 * h.dip;
  const front = 1 - smoothstep(h.from - ramp, h.from, s);
  const back = smoothstep(h.to, h.to + ramp, s);
  const end = clamp01((s - h.L + h.tailLen) / h.tailLen);
  const d = (s - h.rollAt) / h.rollWide;
  const neckUp = h.tall * (1 - (1 - q) * (1 - q)) - 0.2 * h.tall * q * q * q * q;
  let y = h.ride + h.A * (1 - front) * (1 - back) * Math.sin(h.K * s + h.ph) + h.rollUp * Math.exp(-d * d);
  y = y - front * h.dip * (1 - h.rear) - back * h.dip * (1 - h.tail) + h.rear * neckUp + h.tail * h.tailUp * end * Math.sqrt(end) - h.sunk;
  out[0] = h.rear * h.neck * (0.25 * q * q * q - 0.7 * q) + h.tail * h.tailLen * 0.3 * end * end;
  out[1] = y;
  out[2] = h.wander * (1 - front) * Math.sin(h.K * s * 0.37 + h.ph * 0.5 + 1) + h.sway * h.rear * q * q;
  return out;
}

/** The body's thickness `u` of the way down it (0 head .. 1 tail), in girths: a neck, the bulk, a long taper to the tail. */
export const girthAt = (u: number): number => (0.84 + 0.16 * ease(u / 0.12)) * (1 - 0.7 * Math.pow(ease((u - 0.5) / 0.5), 1.2));
/** How tall the back spines stand `u` of the way down it, in spine heights: smaller by the head and toward the tail. */
export const finAt = (u: number): number => (0.55 + 0.45 * ease(u / 0.1)) * (1 - 0.7 * ease((u - 0.6) / 0.4));

const GIRTH_GLSL = `
float weaveGirth(float u){ return (0.84 + 0.16 * smoothstep(0.0, 0.12, u)) * (1.0 - 0.7 * pow(smoothstep(0.5, 1.0, u), 1.2)); }
float weaveFin(float u){ return (0.55 + 0.45 * smoothstep(0.0, 0.1, u)) * (1.0 - 0.7 * smoothstep(0.6, 1.0, u)); }`;

/** A stretch of the serpent standing out of the water: from `from` to `to` metres back from its head, highest (`peak` m over the water) at `at`. */
export interface WeaveBreak {
  from: number;
  to: number;
  peak: number;
  at: number;
}

const SP = [0, 0, 0];

/**
 * Where the serpent breaks the surface: every stretch of it whose top (its back, `girth` thick at its thickest, with
 * `fin` more of spines on it; 0 for the back alone) is over the water, head to tail, into `out`.
 */
export function weaveBreaks(h: WeaveShape, girth: number, fin = 0, out: WeaveBreak[] = [], step = 0.25): WeaveBreak[] {
  out.length = 0;
  let open: WeaveBreak | null = null;
  let last = -1;
  for (let s = 0; s <= h.L + 1e-6; s += step) {
    const u = s / h.L;
    const top = weaveSpine(s, h, SP)[1] + girth * girthAt(u) + fin * finAt(u);
    if (top > 0) {
      if (!open) {
        // Where it came through, between this step and the last.
        const edge = s > 0 ? s - step * (top / (top - last)) : 0;
        open = { from: edge, to: s, peak: top, at: s };
        out.push(open);
      }
      open.to = s;
      if (top > open.peak) {
        open.peak = top;
        open.at = s;
      }
    } else if (open) {
      open.to = s - step * (-top / (last - top));
      open = null;
    }
    last = top;
  }
  return out;
}

/**
 * The heading nearest `want` (radians, in the world), and no more than `most` from it, on which a body lying through
 * (x, z), `ahead` metres ahead of that point and `behind` metres behind it, stays `pad` metres clear of the hull; if
 * none does, the one that crosses least of it. (Bounded, so a body lying across the line is never swung end-on to the
 * boat, where its tail would come up through the deck.)
 */
export function clearHeading(x: number, z: number, want: number, ahead: number, behind: number, pad: number, most = 0.7, hull: (x: number, z: number, pad: number) => boolean = inHull): number {
  let best = want, least = Infinity;
  const STEP = 0.1;
  for (let k = 0; Math.ceil(k / 2) * STEP <= most + 1e-9; k++) {
    const a = want + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * STEP;
    const c = Math.cos(a), s = Math.sin(a);
    let hits = 0;
    for (let d = -behind; d <= ahead; d += 1) if (hull(x + c * d, z + s * d, pad)) hits++;
    if (!hits) return a;
    if (hits < least) {
      least = hits;
      best = a;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// The motion

/** What the fight asks of the serpent each frame. */
export interface WeaveNow {
  act: FightAct;
  /** The reel's surge build-up (0..1) and whether the gauge is warning of one. */
  build: number;
  warning: boolean;
  /** Which way the line is being run: over 0 to the player's right. */
  lateral: number;
  /** How far off it is (m). */
  dist: number;
  /** Spent: its last stand is over. */
  spent: boolean;
}

/**
 * White water the serpent throws this frame, `s` metres back from its head: a `plume` as a move starts, water
 * `pour`ing off what rises, a `collar` round what stands, `foam` along an arch, a `crash` (`k`: how big, 1 a rear's)
 * where something heavy comes down, the tail's `slap` and its idle `flick`.
 */
export interface WeaveEvent {
  kind: 'plume' | 'pour' | 'collar' | 'foam' | 'crash' | 'slap' | 'flick';
  s: number;
  k: number;
}

type BodyMove = 'rear' | 'coil' | 'tail' | 'stand';

export class WeaveMotion {
  readonly shape = restShape();
  /** How many times its own size it is drawn (`weave.grow`), its girth and its spines' height (m), and how far its plates have slid (m at its own size, round and round: `weaveRun`). */
  scale = 1;
  girth = 0;
  fin = 0;
  slide = 0;
  /** How much of it is up (0 under .. 1), which way it heads (1: to the player's right), and whether it is diving to turn. */
  show = 0;
  side = 1;
  turning = false;
  /** Where along it the line's end lies (m back from the head). */
  hook = 0;
  /** How far over it lists (radians), how hot its seams burn and how bright its eyes (times `weave.seams`, `weave.eyes`). */
  list = 0;
  seams = 1;
  eyes = 0;
  /** White water thrown this frame. */
  readonly events: WeaveEvent[] = [];
  /** The fight is over: it goes under and stays there. */
  over = true;
  private body: { kind: BodyMove; t: number; foam: number; was: number } | null = null;
  private flick: { t: number } | null = null;
  private flickIn = 0;
  private glimpseT = 0;
  private stood = false;
  private t = 0;
  private fresh = true;
  private against = 0;
  private sinceTurn = 0;
  /** Its humps as they are now, eased toward what the fight asks: height, ride and window (m at its own size) and pace (m/s). */
  private cur = { amp: 0, ride: -1, win: 6, pace: 1 };

  /** `rnd`: its own dice (not the fight's). */
  constructor(private rnd: () => number = Math.random) {}

  /** A move of its own is playing (the director waits for it). */
  get busy(): boolean {
    return !!this.body;
  }

  /** Wholly under, with nothing left to draw. */
  get gone(): boolean {
    return this.show <= 0;
  }

  /** A Leviathan is hooked: under, heading `side`. */
  begin(side: number): void {
    this.over = false;
    this.show = 0;
    this.side = side >= 0 ? 1 : -1;
    this.turning = false;
    this.body = null;
    this.flick = null;
    this.flickIn = 2;
    this.glimpseT = 0;
    this.stood = false;
    this.t = 0;
    this.fresh = true;
    this.against = 0;
    this.sinceTurn = 0;
    this.list = 0;
    this.eyes = 0;
    this.seams = 1;
    this.shape.rear = this.shape.tail = this.shape.rollUp = 0;
  }

  /** The fight is over: whatever it was doing, it slides under. */
  end(): void {
    this.over = true;
    this.body = null;
    this.flick = null;
  }

  /** Act 1's answer to a surge: a ridge of spines for a moment. */
  glimpse(): void {
    this.glimpseT = LEGEND_FIGHT.weave.glimpse.secs;
  }

  /** One of its moves, now. */
  play(kind: 'rear' | 'coil' | 'tail'): void {
    this.body = { kind, t: 0, foam: 0, was: 0 };
    this.flick = null;
    this.unturn();
  }

  /** Its last stand, now. */
  stand(): void {
    this.body = { kind: 'stand', t: 0, foam: 0, was: 0 };
    this.flick = null;
    this.stood = true;
    this.unturn();
  }

  /** A move cuts a turn short: it comes back up as it was heading (it only ever turns wholly under, unseen). */
  private unturn(): void {
    this.turning = false;
  }

  private flip(): void {
    this.side = -this.side;
    this.sinceTurn = 0;
    this.against = 0;
  }

  /** How long a move of this kind takes (s). */
  static secs(kind: BodyMove): number {
    const F = LEGEND_FIGHT;
    if (kind === 'rear') return F.rear.up + F.rear.hold + F.rear.down;
    if (kind === 'coil') return F.coil.secs + F.coil.back;
    if (kind === 'tail') return F.tail.up + F.tail.hold + F.tail.down;
    return F.stand.leviathan.up + F.stand.leviathan.hold + F.stand.leviathan.down;
  }

  /** One frame: the shape of its spine for it (`shape`) and the white water it throws (`events`). */
  step(dt: number, now: WeaveNow): void {
    const F = LEGEND_FIGHT, W = F.weave;
    const sh = this.shape;
    const ev = this.events;
    ev.length = 0;
    this.t += dt;
    const k = (rate: number): number => 1 - Math.exp(-dt * rate);

    // Drawn for the distance: bigger the further off, eased so a surge's run does not pump it.
    const grown = 1 + (W.grow.scale - 1) * smoothstep(W.grow.from, W.grow.to, now.dist);
    this.scale = this.fresh ? grown : this.scale + (grown - this.scale) * k(1.2);
    const sc = this.scale;
    // Nothing of it stands higher than the view has room for at that distance.
    const room = W.room[0] + W.room[1] * now.dist;

    // (Spent from the moment its last stand has crashed back down; the director says so a little later.)
    const low = (this.stood && this.body?.kind !== 'stand') || now.spent;
    const a = now.act === 3 ? 1 : 0;
    const under = now.act === 1 && !low;
    const build = low ? 0 : clamp01(now.build);
    // Close in, the rail hides the water by the hull from anyone standing back on the deck: it rides higher there.
    const near = 1 - smoothstep(W.near.from, W.near.to, now.dist);
    // Its humps as the fight has them: a ridge of spines far out, its coils once it is up, more of them and
    // bigger as a surge builds, low and slow once it is spent.
    const want = this.wantScratch;
    if (low) {
      want.amp = W.spent.amp;
      want.ride = W.spent.ride + 0.5 * W.near.ride * near;
      want.win = W.window[a];
      want.pace = W.spent.pace;
    } else if (under) {
      want.amp = W.glimpse.amp;
      want.ride = -(W.girth + W.glimpse.under);
      want.win = W.glimpse.window;
      want.pace = W.pace;
    } else {
      want.amp = W.amp[a] * (1 + W.surge.amp * build) * (1 + W.near.amp * near);
      want.ride = W.ride[a] + W.surge.ride * build + W.near.ride * near;
      want.win = W.window[a] + W.surge.window * build;
      want.pace = W.pace * (1 + W.surge.pace * build);
    }
    const c = this.cur;
    const e = this.fresh ? 1 : k(W.ease);
    c.amp += (want.amp - c.amp) * e;
    c.ride += (want.ride - c.ride) * e;
    c.win += (want.win - c.win) * e;
    c.pace += (want.pace - c.pace) * e;
    this.fresh = false;

    // Which way it heads: the way the line is being run. Run against it for a while, it dives and comes up turned.
    const b = this.body;
    this.sinceTurn += dt;
    const run = now.lateral > 0.12 ? 1 : now.lateral < -0.12 ? -1 : this.side;
    // (Wholly under and not yet up, it simply heads the way the line runs.)
    if (this.show <= 0 && !this.over && run !== this.side) this.side = run;
    this.against = run !== this.side ? this.against + dt : 0;
    if (!this.turning && !b && !low && !under && !this.over && this.against > W.turn.after && this.sinceTurn > W.turn.every) this.turning = true;

    // Up or under.
    if (this.glimpseT > 0) this.glimpseT -= dt;
    const up = this.over ? 0 : under ? (this.glimpseT > 0 ? 1 : 0) : this.turning ? 0 : 1;
    // (A move or its last stand finding it under, mid-turn, brings it up at once: their height comes inside the first second.)
    const secs = up > this.show ? (under ? 0.5 : b ? 0.3 : W.rise) : W.dive;
    this.show += Math.sign(up - this.show) * Math.min(Math.abs(up - this.show), dt / secs);
    // Wholly under, it turns (this frame it is still under: whoever draws it turns it unseen).
    if (this.turning && this.show <= 0) {
      this.turning = false;
      this.flip();
    }

    // The humps travel toward the head, and the plates slide forward over them (still while it rears: nothing pours into its skull).
    sh.ph += (dt * TAU * c.pace) / W.wave;
    this.slide = (this.slide + dt * W.slide * (low ? 0.25 : 1) * (1 - sh.rear)) % weaveRun();

    const L = W.length * sc;
    const neck0 = W.neck * sc;
    sh.L = L;
    sh.K = TAU / (W.wave * sc);
    sh.dip = W.dip * sc;
    sh.wander = W.wander * sc;
    sh.from = neck0;
    sh.to = Math.min(L - W.tail * sc * 0.6, neck0 + c.win * sc);
    sh.neck = W.rear.neck * sc;
    sh.tailLen = W.lift.len * sc;
    this.girth = W.girth * sc;
    this.fin = W.fin * sc;
    let amp = c.amp, ride = c.ride;
    let rear = 0, tail = 0, rollUp = 0, rollAt = sh.rollAt, rollWide = W.roll.wide * sc, glow = 0, eyes = 0;
    sh.tall = Math.min(W.rear.tall * sc, room);
    sh.tailUp = Math.min(W.lift.up * sc, room);
    sh.sway = 0;
    // Where the line's end lies along it: on the middle of its humps, on its neck while it rears, by its tail for a slap.
    let hook = (sh.from + sh.to) / 2;

    if (b) {
      const first = b.t === 0;
      b.t += dt;
      const collar = (s: number): void => {
        if ((b.foam -= dt) > 0) return;
        b.foam = W.collar;
        ev.push({ kind: 'collar', s, k: 1 });
      };
      if (b.kind === 'rear' || b.kind === 'stand') {
        const S = F.stand.leviathan;
        const stand = b.kind === 'stand';
        const up = stand ? heave(b.t, S.up, S.hold, S.down) : Math.max(0, rearAt(b.t));
        rear = up;
        glow = eyes = up;
        sh.sway = 0.5 * sc * Math.sin(this.t * 2.3);
        // (Its neck comes to the line's end as it rears, nearer still for its last stand, which is fought at the rail.)
        hook = stand ? sh.neck * 0.5 : lerp(hook, sh.neck * 0.75, ease(b.t / 0.5) * (1 - ease((b.t - WeaveMotion.secs('rear') + 0.5) / 0.5)));
        if (stand) {
          // Everything it has, at once: head and neck higher than ever, its coils taller, its tail up.
          sh.tall = Math.min(W.rear.tall * sc, room) * W.stand;
          sh.tailUp = Math.min(W.lift.up * sc, room) * W.stand;
          tail = up;
          amp *= 1 + W.standAmp * up;
          ride = lerp(ride, Math.max(ride, -0.2), up);
          if (first) for (const s of [sh.neck * 0.8, (sh.from + sh.to) / 2, L - sh.tailLen * 0.8]) ev.push({ kind: 'plume', s, k: 1 });
        } else if (first) ev.push({ kind: 'plume', s: sh.neck * 0.8, k: 1 });
        // White water pouring off it on the way up, a collar of it round its neck, and a crash as the head comes back down.
        if (up > b.was && this.rnd() < dt * (stand ? 16 : 9)) ev.push({ kind: 'pour', s: sh.neck * (0.3 + 0.5 * this.rnd()), k: 1 });
        if (up > 0.2) collar(sh.neck * 0.92);
        if (b.was >= 0.3 && up < 0.3) {
          ev.push({ kind: 'crash', s: 0, k: stand ? 1.5 : 1 });
          if (stand) {
            ev.push({ kind: 'slap', s: L, k: 1 });
            for (let i = 1; i <= 3; i++) ev.push({ kind: 'foam', s: lerp(sh.from, sh.to, i / 4), k: 2 });
          }
        }
        b.was = up;
      } else if (b.kind === 'coil') {
        const C = F.coil;
        if (b.t < C.secs) {
          const u = b.t / C.secs;
          // One long arch, from its tail's end to its neck, its everyday humps lying low under it.
          const on = ease(u / 0.16) * (1 - ease((u - 0.84) / 0.16));
          glow = on;
          rollAt = lerp(sh.to + rollWide * 0.2, sh.from - rollWide * 0.2, u);
          rollUp = Math.min(W.roll.up * sc, room * 0.8) * on;
          amp *= 1 - 0.75 * on;
          if (first) ev.push({ kind: 'plume', s: rollAt, k: 1 });
          // White water all along it: on black water that line of foam is what shows how long the thing rolling past is.
          if (on > 0.25 && (b.foam -= dt) <= 0) {
            b.foam = C.foam;
            ev.push({ kind: 'foam', s: rollAt + (this.rnd() - 0.5) * 2.4 * rollWide, k: 1 });
          }
          if (b.t + dt >= C.secs) ev.push({ kind: 'crash', s: rollAt, k: 0.8 });
        }
      } else {
        const X = F.tail;
        const up = heave(b.t, X.up, X.hold, X.down);
        tail = up;
        glow = up;
        // (Its tail comes to the line's end as it lifts.)
        hook = lerp(hook, L - sh.tailLen * 0.45, ease(b.t / 0.4));
        if (first) ev.push({ kind: 'plume', s: L - sh.tailLen * 0.7, k: 1 });
        if (up > b.was && this.rnd() < dt * 9) ev.push({ kind: 'pour', s: L - sh.tailLen * (0.2 + 0.5 * this.rnd()), k: 1 });
        if (up > 0.2) collar(L - sh.tailLen * 0.95);
        // The slap: a wall of white water where the blade lands.
        if (b.t >= WeaveMotion.secs('tail')) ev.push({ kind: 'slap', s: L, k: 1.4 });
        b.was = up;
      }
      if (b.t >= WeaveMotion.secs(b.kind)) this.body = null;
    } else if (!low && !under && !this.over && this.show > 0.9) {
      // Between moves its tail flicks up and slaps down behind its coils.
      if (!this.flick && (this.flickIn -= dt) <= 0) {
        this.flick = { t: 0 };
        this.flickIn = lerp(W.flick.every[0], W.flick.every[1], this.rnd());
      }
    }
    const f = this.flick;
    if (f) {
      const was = f.t;
      f.t += dt;
      tail = Math.max(tail, W.flick.up * heave(f.t, 0.5, 0.15, 0.18));
      if (was === 0) ev.push({ kind: 'pour', s: L - sh.tailLen * 0.6, k: 0.6 });
      if (f.t >= 0.83) {
        ev.push({ kind: 'flick', s: L, k: W.flick.up });
        this.flick = null;
      }
    }

    // What a move left half done as the fight ended (the landing cuts in) lets go quickly.
    const drop = this.over ? k(7) : 1;
    sh.rear += (rear - sh.rear) * drop;
    sh.tail += (tail - sh.tail) * drop;
    sh.rollUp += (rollUp - sh.rollUp) * drop;
    sh.rollAt = rollAt;
    sh.rollWide = rollWide;
    sh.A = amp * sc;
    sh.ride = ride * sc;
    // Under: deep enough that nothing of it shows, whatever it was doing.
    sh.sunk = (1 - ease(this.show)) * (sh.A + sh.rollUp + this.girth + this.fin + 1.2 * sc + sh.rear * sh.tall + sh.tail * sh.tailUp);
    this.hook += (hook - this.hook) * (this.show <= 0 ? 1 : k(b?.kind === 'stand' ? 7 : b?.kind === 'tail' ? 5 : 3));

    // Its seams burn brighter in a move and while the gauge warns of a surge; spent, they smoulder, and it lists over.
    const seams = low && !b ? W.seamsSpent : 1 + W.seamsMove * Math.max(glow, 0.6 * build) + (now.warning ? W.seamsWarn : 0);
    this.seams += (seams - this.seams) * k(8);
    this.eyes += (Math.max(eyes, 0.35) - this.eyes) * k(8);
    const list = low && !b ? W.list + W.sway * Math.sin(this.t * 0.7) : 0;
    this.list += (list - this.list) * k(1.6);
  }
  private wantScratch = { amp: 0, ride: 0, win: 0, pace: 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry

type Vert = { s: number; p: [number, number, number]; c: THREE.Color; fin?: number; glow?: number; plate?: number };

/** Triangles for the flat-shaded serpent: per corner where along the spine it hangs (`aS`) and where its plate starts (`aP`), its offset there, its colour, how much it is spine (`aFin`) and how much it glows (`aGlow`: up to 1 a seam, 2 an eye; under 0, that much of a seam's light lying on it). */
class Soup {
  pos: number[] = [];
  s: number[] = [];
  plate: number[] = [];
  fin: number[] = [];
  glow: number[] = [];
  col: number[] = [];
  tri(a: Vert, b: Vert, c: Vert): void {
    for (const v of [a, b, c]) {
      this.s.push(v.s);
      this.plate.push(v.plate ?? 0);
      this.pos.push(v.p[0], v.p[1], v.p[2]);
      this.col.push(v.c.r, v.c.g, v.c.b);
      this.fin.push(v.fin ?? 0);
      this.glow.push(v.glow ?? 0);
    }
  }
  quad(a: Vert, b: Vert, c: Vert, d: Vert): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  spike(base: Vert[], tip: Vert): void {
    for (let i = 0; i < base.length; i++) this.tri(base[i], base[(i + 1) % base.length], tip);
  }
  get triangles(): number {
    return this.s.length / 3;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(this.plate, 1));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aFin', new THREE.Float32BufferAttribute(this.fin, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    return g;
  }
}

/**
 * How many plates the serpent is built of: two more than its length holds, so that as they slide forward along it
 * each comes out of the tail's root and goes into the skull unseen; and the length of them all (m at its own size).
 */
export const weavePlates = (): number => Math.round(LEGEND_FIGHT.weave.length / LEGEND_FIGHT.weave.plate) + 2;
export const weaveRun = (): number => weavePlates() * LEGEND_FIGHT.weave.plate;

/** `aS` for what hangs whole off the spine's ends. */
const HEAD_S = -1000, TAIL_S = 1000;

/**
 * The Leviathan's own colours, as its model is painted (`seafish/giants/leviathan.ts`): near-black violet plates with
 * a pale violet lip, a dark core in the cracks, molten seams, bone, amber eyes.
 */
const COL = {
  plate: 0x1e1b40,
  edge: 0x4c4898,
  lip: 0xa898e8,
  belly: 0x2a2242,
  warm: 0x5a3448,
  deep: 0x0c0a18,
  slate: 0x6a6294,
  ember: 0xff6a1a,
  hot: 0xffbd82,
  coal: 0xb83a0a,
  bone: 0xf4e8cc,
  boneDark: 0xa8946c,
  iris: 0xffb02e,
  mouth: 0x7a2434,
  mouthDark: 0x3a0e18,
};

const SIDES = 8;

/**
 * The serpent, straight: overlapping plates with a molten seam under each lip and a bone spine on each back, a horned
 * head with a row of amber eyes hung off the front end and the tail's blade off the back. A body corner's `position`
 * is (metres along from `aS`, up and across in girths); the head's and the blade's are metres.
 */
export function weaveGeometry(): { geo: THREE.BufferGeometry; triangles: number } {
  const W = LEGEND_FIGHT.weave;
  const g = new Soup();
  const C = (hex: number, k = 1): THREE.Color => new THREE.Color(hex).multiplyScalar(k);
  const mixc = (a: THREE.Color, b: THREE.Color, t: number): THREE.Color => a.clone().lerp(b, t);
  const PLATE = C(COL.plate), EDGE = C(COL.edge), LIP = C(COL.lip), BELLY = C(COL.belly), WARM = C(COL.warm), DEEP = C(COL.deep), SLATE = C(COL.slate);
  const EMBER = C(COL.ember), HOT = C(COL.hot), COAL = C(COL.coal), BONE = C(COL.bone), BONE_D = C(COL.boneDark), IRIS = C(COL.iris), MOUTH = C(COL.mouth), MOUTH_D = C(COL.mouthDark);

  // ---- the plates (`weavePlates`): overlapping like roof tiles, each lip over the front of the next ----
  const len = W.plate, seam = 0.045, riser = 0.02;
  const n = weavePlates();
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  let s0 = 0;
  const ring = (s: number, flare: number, k: number, c: THREE.Color, glow = 0): Vert => {
    // A corner on top, where the spines stand; flatter underneath.
    const a = Math.PI / 2 + (k / SIDES) * TAU;
    const y = Math.sin(a);
    return { s, plate: s0, p: [0, y * (y < 0 ? 0.86 : 1) * flare, Math.cos(a) * 0.92 * flare], c, glow };
  };
  for (let i = 0; i < n; i++) {
    s0 = i * len;
    const s1 = s0 + len;
    const tone = 0.9 + 0.22 * rnd();
    // Light in the cracks: on some seams a broken run of it burns hot, part of the way round; the rest smoulder low
    // in the crack, all the way round. Many plates stay dark and whole.
    const heat = 0.45 + 0.55 * rnd();
    const hot = rnd() < 0.6;
    const from = -2.3 + 2.6 * rnd(), run = 0.9 + 2.2 * rnd() * heat;
    // The seam just behind the last plate's lip, this plate's back rising to its own lip, and the step down off it.
    const stops: [number, number][] = [[s0, 0.9], [s0 + seam, 0.905], [s0 + (len - riser) * 0.72, 1.04], [s1 - riser, 1.09], [s1, 0.9]];
    for (let k = 0; k < SIDES; k++) {
      const mid = Math.sin(Math.PI / 2 + ((k + 0.5) / SIDES) * TAU);
      // How far round from the top of the back this side is (radians, either way).
      let phi = ((k + 0.5) / SIDES) * TAU;
      if (phi > Math.PI) phi -= TAU;
      const lit = hot && phi > from && phi < from + run && mid > -0.4;
      const base = (mid < -0.4 ? BELLY : PLATE).clone().multiplyScalar(tone);
      // The plate's lip catches the light in a pale violet rim, most on its back; the seam's light lies on it too.
      const lip = mid < -0.4 ? mixc(base, WARM, 0.4) : mixc(base, LIP, mid > 0.3 ? 0.16 : 0.09);
      const spill = lit ? -heat : mid < -0.4 ? 0 : -0.25 * heat;
      const q = (j: number, c0: THREE.Color, c1: THREE.Color, g0 = 0, g1 = 0): void =>
        g.quad(ring(stops[j][0], stops[j][1], k, c0, g0), ring(stops[j][0], stops[j][1], k + 1, c0, g0), ring(stops[j + 1][0], stops[j + 1][1], k + 1, c1, g1), ring(stops[j + 1][0], stops[j + 1][1], k, c1, g1));
      const ember = lit ? mixc(EMBER, HOT, 0.4 * heat) : mixc(COAL, EMBER, 0.35);
      const burn = lit ? 1 : mid < -0.4 ? 0.2 : 0.3 + 0.2 * heat;
      q(0, ember, ember, burn, burn);
      q(1, mixc(base, DEEP, 0.45), base);
      q(2, base, lip, 0, spill);
      q(3, DEEP, DEEP);
    }
    // A bone blade on the back of each plate, swept toward the tail (the shader sweeps the tip back by its height); every other one stands taller.
    const sb = s1 - riser - 0.2;
    const h = i % 2 === 0 ? 1 : 0.62;
    const at = (x: number, y: number, z: number, c: THREE.Color, fin = 0): Vert => ({ s: sb, plate: s0, p: [x, y, z], c, fin });
    g.spike([at(0.16, 1.0, 0, BONE_D), at(0, 0.94, 0.2, BONE_D), at(-0.18, 1.02, 0, BONE_D), at(0, 0.94, -0.2, BONE_D)], at(0, 1.0, 0, BONE, h));
  }

  // ---- the head, hung off the spine's front end (metres: forward, up, across) ----
  const hk = 0.18;
  const R = (W.girth * girthAt(0) * 0.95) / hk;
  const head = (x: number, y: number, z: number, c: THREE.Color, glow = 0): Vert => ({ s: HEAD_S, p: [x * hk, y * hk, z * hk], c, glow });
  const HS = 8;
  type Place = (x: number, y: number, z: number, c: THREE.Color, glow?: number) => Vert;
  const loft = (secs: number[][], place: Place, col: (k: number, j: number) => THREE.Color, tip: [number, number, number]): void => {
    const pt = (j: number, k: number, c: THREE.Color): Vert => {
      const [x, w, top, bot] = secs[j];
      const a = Math.PI / 2 + Math.PI / HS + (k / HS) * TAU;
      const sn = Math.sin(a);
      return place(x, sn > 0 ? top * sn : -bot * sn, w * Math.cos(a), c);
    };
    for (let j = 0; j < secs.length - 1; j++)
      for (let k = 0; k < HS; k++) {
        const c0 = col(k, j), c1 = col(k, j + 1);
        g.quad(pt(j, k + 1, c0), pt(j, k, c0), pt(j + 1, k, c1), pt(j + 1, k + 1, c1));
      }
    const last = secs.length - 1;
    for (let k = 0; k < HS; k++) g.tri(pt(last, k + 1, col(k, last)), pt(last, k, col(k, last)), place(tip[0], tip[1], tip[2], col(k, last)));
    for (let k = 0; k < HS; k++) g.tri(pt(0, k, col(k, 0)), pt(0, k + 1, col(k, 0)), place(secs[0][0], 0, 0, col(k, 0)));
  };
  // (Which facets of a ring look up: lit slate planes on top of the skull, dark under the cheeks.)
  const upward = (k: number): number => Math.sin(Math.PI / 2 + Math.PI / HS + ((k + 0.5) / HS) * TAU);
  const skull = [[0, R, R, -R], [1.8, 3.2, 3.1, -2.2], [4.4, 2.8, 2.3, -0.5], [7.6, 1.8, 1.25, -0.25], [9.8, 0.75, 0.4, -0.15]];
  loft(skull, head, (k, j) => (upward(k) > 0.3 ? mixc(PLATE, SLATE, 0.45 + 0.1 * j) : upward(k) < -0.3 ? mixc(MOUTH_D, MOUTH, 0.5) : PLATE), [11, 0.05, 0]);
  // The lower jaw, hinged under the skull and hanging open.
  const gape = 0.34, hx = 1.6, hy = -1.7;
  const jaw: Place = (x, y, z, c, glow) => head(hx + x * Math.cos(gape) + y * Math.sin(gape), hy - x * Math.sin(gape) + y * Math.cos(gape), z, c, glow);
  loft([[0, 2.5, 0.35, -1.1], [3, 2.35, 0.25, -1.0], [6.2, 1.5, 0.15, -0.6], [8.2, 0.6, 0.1, -0.3]], jaw, (k) => (upward(k) > 0.3 ? mixc(MOUTH_D, MOUTH, 0.7) : mixc(BELLY, PLATE, 0.6)), [9.3, 0, 0]);
  // A furnace at the back of the mouth.
  const fire = mixc(EMBER, HOT, 0.3);
  g.spike([head(2.2, -0.3, 1.6, fire, 1), head(2.2, -1.5, 0, fire, 1), head(2.2, -0.3, -1.6, fire, 1)], head(5.2, -1.0, 0, COAL, 1));
  // Fangs: hanging from the upper jaw, and standing up from the lower.
  const fang = (place: Place, x: number, y: number, z: number, l: number): void => g.spike([place(x + 0.35, y, z, BONE_D), place(x - 0.2, y, z + 0.3, BONE_D), place(x - 0.2, y, z - 0.3, BONE_D)], place(x - 0.1, y + l, z, BONE));
  for (const sgn of [-1, 1]) {
    fang(head, 5.0, -0.4, sgn * 2.2, -1.5);
    fang(head, 6.6, -0.3, sgn * 1.75, -1.3);
    fang(head, 8.2, -0.2, sgn * 1.2, -1.1);
    fang(jaw, 5.4, 0.15, sgn * 1.45, 1.2);
    fang(jaw, 7.2, 0.1, sgn * 0.85, 1.0);
  }
  // A crown of three horns swept back off the brow.
  const horn = (z: number, l: number, out: number): void =>
    g.spike([head(2.6, 2.7, z, BONE_D), head(1.6, 2.9, z + 0.6, BONE_D), head(0.9, 2.5, z, BONE_D), head(1.6, 2.9, z - 0.6, BONE_D)], head(1.4 - l * 0.72, 2.9 + l * 0.7, z + out, BONE));
  horn(0, 5.5, 0);
  horn(1.9, 4.6, 1.5);
  horn(-1.9, 4.6, -1.5);
  // The burning eyes: a row down each side of the skull, each a little smaller than the one ahead of it.
  const eyes: [number, number, number, number][] = [[5.3, 1.35, 1.8, 1.15], [3.7, 1.95, 1.9, 0.9], [2.4, 2.4, 1.85, 0.7]];
  for (const sgn of [-1, 1])
    for (const [x, y, z, r] of eyes) {
      const p = (dx: number, dy: number, dz: number, c: THREE.Color): Vert => head(x + dx * r, y + dy * r, sgn * z + dz * r * sgn, c, 2);
      const rim = [p(1.2, -0.3, 0, IRIS), p(0, 0.9, -0.2, IRIS), p(-1.2, 0.3, 0, IRIS), p(0, -0.9, 0.1, IRIS)];
      g.spike(sgn > 0 ? rim : [...rim].reverse(), p(0, 0.25, 0.75, mixc(IRIS, HOT, 0.6)));
    }
  // Molten seams between the skull's plates: a ring behind the eyes, where the skull meets the neck, and a line down each side of the snout.
  const HOT_SEAM = mixc(EMBER, HOT, 0.8);
  for (let k = 0; k < HS; k++) {
    const a0 = Math.PI / 2 + Math.PI / HS + (k / HS) * TAU, a1 = a0 + TAU / HS;
    if (Math.sin((a0 + a1) / 2) < -0.3) continue;
    const at = (x: number, a: number, r: number): Vert => head(x, Math.sin(a) * r * (Math.sin(a) > 0 ? 1.02 : 0.8), Math.cos(a) * r * 1.03, HOT_SEAM, 1);
    g.quad(at(1.6, a0, 3.1), at(1.6, a1, 3.1), at(1.85, a1, 3.22), at(1.85, a0, 3.22));
  }
  for (const sgn of [-1, 1]) {
    // (Along the skull's sections, a little off the top of each.)
    const on = (j: number, a: number): Vert => head(skull[j][0], skull[j][2] * Math.sin(a) + 0.06, sgn * skull[j][1] * Math.cos(a) * 1.02, HOT_SEAM, 1);
    for (let j = 1; j < 3; j++) g.quad(on(j, 1.05), on(j, 1.16), on(j + 1, 1.16), on(j + 1, 1.05));
  }

  // ---- the tail's blade, hung off the spine's back end in its upright plane (metres: forward, up, across) ----
  const TK = 12;
  const OUT: [number, number][] = [[-0.012, 0.011], [0.026, 0.028], [0.06, 0.082], [0.095, 0.128], [0.074, 0.06], [0.06, 0.008], [0.076, -0.036], [0.09, -0.074], [0.052, -0.042], [0.02, -0.02], [-0.012, -0.011]];
  const blade = (back: number, up: number, z: number, c: THREE.Color, glow = 0): Vert => ({ s: TAIL_S, p: [-back * TK, up * TK, z], c, glow });
  const DIM = PLATE.clone().multiplyScalar(0.8);
  const root = blade(0.03, 0, 0, DIM);
  for (let i = 0; i < OUT.length - 1; i++) {
    const far = (q: [number, number]): THREE.Color => mixc(DIM, EDGE, ease(q[0] / 0.09));
    g.tri(root, blade(OUT[i][0], OUT[i][1], 0, far(OUT[i])), blade(OUT[i + 1][0], OUT[i + 1][1], 0, far(OUT[i + 1])));
  }
  // Bone along its two long edges, on both faces.
  for (const [p0, p1] of [[OUT[1], OUT[3]], [OUT[9], OUT[7]]] as [[number, number], [number, number]][]) {
    const w = 0.005 * Math.sign(p0[1]);
    for (const z of [-0.02, 0.02]) g.tri(blade(p0[0], p0[1], z, BONE_D), blade(p0[0] + 0.004, p0[1] - w, z, BONE_D), blade(p1[0], p1[1], z, BONE));
  }
  // Its ribs, molten, on both faces.
  for (const z of [-0.03, 0.03])
    for (const [b, u] of [[0.088, 0.115], [0.07, 0.05], [0.082, -0.062]]) {
      const w = 0.004;
      g.tri(blade(0.0, u * 0.05 + w, z, fire, 1), blade(0.0, u * 0.05 - w, z, fire, 1), blade(b, u, z, fire, 1));
    }
  return { geo: g.build(), triangles: g.triangles };
}

// ---------------------------------------------------------------------------------------------------------------
// The mesh

const weaveVert = `
${WAVE_GLSL}
${WEAVE_GLSL}
${GIRTH_GLSL}
attribute float aS; attribute float aP; attribute float aFin; attribute float aGlow; attribute vec3 aCol;
uniform vec4 uHead, uB, uW, uR, uT, uO, uLook;
uniform vec2 uPlates;
varying vec3 vWorld; varying vec3 vCol; varying float vGlow; varying float vAbove;
// The drawn water's height over a point of the sea's frame (the waves lean, so the rest point is found first).
float waterAt(vec2 x){
  vec3 d, n; float hc, hs, att;
  seaWaves(x, d, n, hc, hs, att);
  seaWaves(x - d.xz, d, n, hc, hs, att);
  return d.y;
}
// The spine s metres back from the head, in the sea's frame, riding the water where it is.
vec3 spine(float s){
  vec3 l = weaveSpine(s, uB, uW, uR, uT, uO);
  vec2 dir = vec2(cos(uHead.z), sin(uHead.z));
  vec2 p = uHead.xy + dir * (l.x - s) + vec2(-dir.y, dir.x) * l.z;
  return vec3(p.x, waterAt(p) + l.y, p.y);
}
void main(){
  float L = uB.x, sc = uHead.w;
  bool head = aS < -500.0, tail = aS > 500.0;
  // The plates slide forward along the spine, each whole: one comes out of the tail's root as another goes into the
  // skull (what is past either end is tucked there), and the one wholly in the skull starts again at the tail.
  float plate = mod(aP - uLook.x + uPlates.x, uPlates.y) - uPlates.x;
  float s = head ? 0.0 : tail ? L : clamp((plate + aS - aP) * sc, 0.0, L);
  float e = 0.3 * sc;
  vec3 a = spine(s - e), c = spine(s + e);
  vec3 T = normalize(a - c);
  vec3 B = vec3(-sin(uHead.z), 0.0, cos(uHead.z));
  B = normalize(B - T * dot(B, T));
  vec3 N = cross(B, T);
  // Listing over, spent.
  float cl = cos(uLook.w), sl = sin(uLook.w);
  vec3 N2 = N * cl + B * sl, B2 = B * cl - N * sl;
  vec3 p = 0.5 * (a + c);
  if (head || tail) p += (T * position.x + N2 * position.y + B2 * position.z) * sc;
  else {
    float u = s / L;
    float r = uLook.y * weaveGirth(u);
    float fin = aFin * uLook.z * weaveFin(u) * smoothstep(0.0, 0.5 * sc, s) * (1.0 - smoothstep(L - 0.5 * sc, L, s));
    p += T * position.x * sc + (N2 * position.y + B2 * position.z) * r + (N2 - 0.7 * T) * fin;
  }
  vAbove = (p.y - waterAt(p.xz)) / sc;
  vCol = aCol;
  vGlow = aGlow;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const weaveFrag = `
uniform vec3 uLamp, uRim, uFoam, uFlashCol, uEmber, uReach;
uniform vec4 uLit;
uniform float uTime; uniform vec2 uSpill;
varying vec3 vWorld; varying vec3 vCol; varying float vGlow; varying float vAbove;
float weaveHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  // Well under the water it is not there (the sea hides the rest).
  if (vAbove < -0.7) discard;
  vec3 fn = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 toEye = cameraPosition - vWorld;
  float dist = length(toEye);
  vec3 V = toEye / dist;
  if (dot(fn, V) < 0.0) fn = -fn;
  float up = 0.5 + 0.5 * fn.y;
  float facing = max(dot(fn, V), 0.0);
  // Flat facets in its own colours: the night's light from above, and the boat's lamps as the landed one has them
  // (each colour brought up toward their warm light, its hue kept), most on the faces turned to the boat.
  float lamp = mix(1.0, uReach.z, smoothstep(uReach.x, uReach.y, dist));
  vec3 col = vCol * uLit.x * (0.35 + 0.65 * up) * (1.0 + uLamp * lamp * (0.7 + 0.3 * facing));
  // A bolt's cold light on its upper faces.
  col += vCol * uFlashCol * uLit.y * up;
  // Wet hide: an edge of light where its faces turn away (not on its bone, pale already).
  float edge = 1.0 - facing;
  col += uRim * edge * edge * edge * (0.35 + 0.65 * up) * (1.0 + uLit.y) * (1.0 - 0.7 * smoothstep(0.25, 0.6, vCol.g));
  // What glows of its own: its eyes, its molten seams, and the seams' light on the plate lips beside them.
  // (Far off its seams are lines too thin to draw at their own brightness: they burn the brighter for it.)
  float seams = uLit.z * (1.0 + uSpill.y * smoothstep(8.0, 20.0, dist));
  if (vGlow > 1.5) col = vCol * uLit.w;
  else if (vGlow > 0.0) col = mix(col, vCol * seams, clamp(vGlow, 0.0, 1.0));
  else col += uEmber * (-vGlow * uSpill.x * seams);
  // White water where it cuts the surface, churning.
  float churn = weaveHash(floor(vWorld.xz * 2.6) + floor(uTime * 6.0));
  float foam = 1.0 - smoothstep(0.02, 0.1 + 0.24 * churn, vAbove);
  col = mix(col, uFoam * (0.7 + 0.3 * churn) * (1.0 + 0.6 * uLit.y), foam * 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** The serpent's mesh: one draw. `set` bends it for a frame. */
export class LeviathanWeave {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly triangles: number;
  private u: {
    uHead: { value: THREE.Vector4 };
    uB: { value: THREE.Vector4 };
    uW: { value: THREE.Vector4 };
    uR: { value: THREE.Vector4 };
    uT: { value: THREE.Vector4 };
    uO: { value: THREE.Vector4 };
    uLook: { value: THREE.Vector4 };
    uPlates: { value: THREE.Vector2 };
    uLit: { value: THREE.Vector4 };
    uLamp: { value: THREE.Color };
    uRim: { value: THREE.Color };
    uFoam: { value: THREE.Color };
    uFlashCol: { value: THREE.Color };
    uEmber: { value: THREE.Color };
    uReach: { value: THREE.Vector3 };
    uSpill: { value: THREE.Vector2 };
  } & Record<string, THREE.IUniform>;

  /** `waves`: the sea's own wave uniforms, so it rides the water as it is drawn. */
  constructor(waves: Pick<WaveUniforms, 'uTime' | 'uWa' | 'uWb'>) {
    this.u = {
      uTime: waves.uTime,
      uWa: waves.uWa,
      uWb: waves.uWb,
      uHead: { value: new THREE.Vector4(0, 0, 0, 1) },
      uB: { value: new THREE.Vector4(14, 0, 1, 0) },
      uW: { value: new THREE.Vector4(0, 3, 10, 9) },
      uR: { value: new THREE.Vector4(0, 3, 4, 0) },
      uT: { value: new THREE.Vector4(0, 2, 4, 0) },
      uO: { value: new THREE.Vector4(0, 0, 2, 1.3) },
      uLook: { value: new THREE.Vector4(0, 0.46, 0.5, 0) },
      uPlates: { value: new THREE.Vector2(LEGEND_FIGHT.weave.plate, weaveRun()) },
      uLit: { value: new THREE.Vector4(1, 0, 1, 1) },
      uLamp: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uFoam: { value: new THREE.Color() },
      uFlashCol: { value: new THREE.Color(0.8, 0.84, 1.0) },
      uEmber: { value: new THREE.Color(COL.ember) },
      uReach: { value: new THREE.Vector3(6, 20, 0.45) },
      uSpill: { value: new THREE.Vector2() },
    };
    const { geo, triangles } = weaveGeometry();
    this.triangles = triangles;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: weaveVert, fragmentShader: weaveFrag, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /**
   * Bends it for this frame: its head at (x, z) of the sea's frame heading `heading` there, in `m`'s shape; `flash`
   * the sky's lightning (0..1).
   */
  set(m: WeaveMotion, x: number, z: number, heading: number, flash: number): void {
    const W = LEGEND_FIGHT.weave;
    const h = m.shape;
    const u = this.u;
    u.uHead.value.set(x, z, heading, m.scale);
    // (The phase wraps where both of the spine's waves come round: the humps', and the slower winding at half of it.)
    u.uB.value.set(h.L, h.A, h.K, h.ph % (2 * TAU));
    u.uW.value.set(h.ride, h.from, h.to, h.sunk);
    u.uR.value.set(h.rear, h.tall, h.neck, h.sway);
    u.uT.value.set(h.tail, h.tailUp, h.tailLen, h.wander);
    u.uO.value.set(h.rollAt, h.rollUp, h.rollWide, h.dip);
    u.uLook.value.set(m.slide, m.girth, m.fin, m.list);
    u.uLit.value.set(W.light, W.flash * flash, W.seams * m.seams * (1 - 0.35 * flash), W.eyes * (0.5 + 0.5 * m.eyes));
    // (The boat's lamps on it are the landing's own: `SURFACE_LAMP`'s colour, the landed Leviathan's gain.)
    u.uLamp.value.set(SURFACE_LAMP.color).multiplyScalar((LEGEND_SHOW.leviathan as SurfaceShow).lamp ?? SURFACE_LAMP.gain);
    u.uReach.value.set(W.lamp.near, W.lamp.far, W.lamp.least);
    u.uRim.value.set(COL.lip).multiplyScalar(W.rim);
    u.uFoam.value.set(W.foamCol);
    u.uSpill.value.set(W.spill, W.seamsFar);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
