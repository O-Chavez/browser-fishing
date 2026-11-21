import * as THREE from 'three';
import { LEGEND_FIGHT, type FightAct, type GiantId, type GiantMove } from '../data/legendshow';
import { LURK, inHull } from '../data/sea';
import { audio } from './audio';
import type { FishModel } from './fishmodel';
import { armBearing, armRadius, boatRing, clearOfHull, fieldSpot, type Spot } from './giantlayout';
import { FightDirector, nearAt } from './legendfight';
import { LeviathanFight } from './leviathanfight';
import { modelBounds, modelLength } from './legendshow';
import type { Reel } from './reel';
import type { ScreenSpray } from './screenspray';
import type { World } from './world';

/**
 * An Abyss giant's fight as it is shown (`LEGEND_FIGHT`): the fight director (`legendfight.ts`) says which act the
 * fight is in, when the giant makes a move and when it makes its last stand; this draws them and tells the sound.
 * Presentation only: it reads the reel and never writes to it, and its dice are `Math.random`.
 *
 * Nothing is built mid-fight, so nothing compiles then: the Kraken's arms and the Dreamer's eyes are the Abyss's own
 * lurkers (`AbyssLurk`, compiled with the sea), the Leviathan's weaving serpent is built and compiled as the boat
 * reaches its sea (`LeviathanFight`), and the rest is white water (`Fx`), the lens spray, the sea's lightning and
 * rain, and the boat's lurch (`Sea.shove`).
 *
 * The Kraken is its arms alone all through the fight (its hooked model is not drawn until the landing): arms that
 * stand out of the water round where the line holds it, spread like one big animal's, alive the whole time they are
 * up and thrashing in a surge, and come in with it (`LEGEND_FIGHT.arms`). The Leviathan's hooked model is not drawn
 * either: it is a serpent weaving through the swell where the line holds it, only pieces of it breaking the surface
 * (`LEGEND_FIGHT.weave`, `leviathanfight.ts`, `leviathanweave.ts`). The Dreamer's eyes are on the water round the
 * line the same way, a field of them opening and shutting (`LEGEND_FIGHT.gaze`), its body among them; landed, they
 * open all round the boat (`landing`).
 */

/** What the fight's moves do to the hooked giant's model this frame, on top of its swimming pose. */
export interface GiantPose {
  /** How much of its thrash is stilled (0..1): a heavy move reads heavy. */
  still: number;
  /** Its nose pitched up by this (radians; down when negative), the body lifted by this (m) and rolled about its length by this (radians). */
  pitch: number;
  lift: number;
  roll: number;
  /** How far under it swims (m): act 1, when it is not seen. */
  sunk: number;
  /** Not drawn: wholly under, or a giant whose model is never drawn in the fight (the Kraken, the Leviathan). */
  hidden: boolean;
  /** Its wake's white water, times a legend's usual, and the size of its drops (far out and unseen, bigger: the wake is all there is of it). */
  wake: number;
  wakeDrop: number;
}

/** What the game hands over each frame of the fight. */
export interface GiantFrame {
  /** The fight, to read (never written to: the server replays it from the button log alone). */
  reel: Readonly<Pick<Reel, 'progress' | 'fightLeft' | 'exhausted' | 'build' | 'warning' | 'tension' | 'lateral'>>;
  /** A surge started this frame. */
  surge: boolean;
  /** Where the giant is, on the water. */
  fp: THREE.Vector3;
  /** The player's eyes, on the level (y 0). */
  from: THREE.Vector3;
  /** The giant's model and the scale it swims at. */
  fish: FishModel;
  sc: number;
}

const ease = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const REST: GiantPose = { still: 0, pitch: 0, lift: 0, roll: 0, sunk: 0, hidden: false, wake: 1, wakeDrop: 1 };
/** How much bigger white water is thrown `dist` metres off, so a boil far out still shows from the deck. */
const farDrop = (dist: number): number => Math.min(3, Math.max(1, dist / 10));

export class GiantFights {
  /** The fight on now, if a giant is on the line. */
  director: FightDirector | null = null;
  private id: GiantId = 'kraken';
  private start = 0;
  /** Seconds into the fight, and since its last move began. */
  private t = 0;
  private moveT = Infinity;
  private later: { at: number; run: () => void }[] = [];
  private pose: GiantPose = { ...REST };
  /** Act 1: how far under it is (1) or up (0); seconds of boil left. */
  private sub = 1;
  private boilT = 0;
  /** The Leviathan's fight: a serpent weaving through the swell where the line holds it (its hooked model is not drawn). */
  readonly lev: LeviathanFight;
  /** How far over it has rolled, spent (0..1). */
  private listed = 0;
  /**
   * The Kraken's arms standing where the line holds it: each one's id (`AbyssLurk.reach`), where it stands from the
   * line's end (m, level) and at what bearing, its height as a share of what an arm may stand there, when it lets go
   * (fight seconds), when white water next breaks round its foot, and whether it hangs limp (spent).
   */
  private arms: { id: number; off: THREE.Vector3; a: number; h: number; until: number; foam: number; limp: boolean }[] = [];
  /** Where a move's arms stand (the world, level), for the white water they churn while they are up: until when (fight seconds), and when it next breaks. */
  private feet: { at: THREE.Vector3; until: number; foam: number }[] = [];
  private armCd = 0;
  private armAct = 1;
  /** Staging: a surge's build-up (0..1) to show the Kraken's arms at, whatever the reel's is, or null. */
  surgeHold: number | null = null;
  /**
   * The Dreamer's eyes on the water: each one's slot (`AbyssLurk.keep`), where it lies (`off` from the line's end,
   * following it in, or `at` a fixed point of the sea's frame), its size, when it opens and shuts (fight seconds) and
   * how wide. `stay` ones are its standing watch, which open somewhere else once shut.
   */
  private eyes: { slot: number; off: THREE.Vector3 | null; at: THREE.Vector3 | null; size: number; from: number; until: number; lid: number; stay: boolean }[] = [];
  private eyeCd = 0;
  /**
   * A landed Dreamer's eyes on the water all round the boat (`landing`): seconds in, when the last of them is shut
   * and gone (-1 while it is shown), and each one's slot (from the top, clear of the fight's still shutting), where
   * it lies in the sea's frame, its size and when it opens and shuts.
   */
  private woke: { t: number; over: number; eyes: { slot: number; at: THREE.Vector3; size: number; from: number; until: number }[] } | null = null;
  /** The boat's lurch as the Kraken grips the rail: seconds in (it starts at 0), and the side gripped (+1 port, +z). */
  private lurch: { t: number; side: number } | null = null;
  /** Seconds since the player last turned the view (the tighter view lets go while they do). */
  private turnedAgo = Infinity;
  /** The last frame's place and scale, for moves staged between frames. */
  private last: GiantFrame | null = null;

  constructor(
    private w: World,
    private spray: ScreenSpray,
    /** One bolt of lightning behind a point of the world, as the player sees it, `dist` metres off. */
    private bolt: (at: THREE.Vector3, dist: number) => void,
  ) {
    this.lev = new LeviathanFight(w, spray);
  }

  /** A giant is hooked. */
  begin(id: GiantId, startProgress: number): void {
    if (this.director) this.end('lost');
    this.arms.length = 0;
    this.feet.length = 0;
    this.eyes.length = 0;
    this.woke = null;
    this.armCd = LEGEND_FIGHT.arms.tipGap[0];
    this.eyeCd = 0;
    this.armAct = 1;
    if (id === 'leviathan') this.lev.begin();
    this.id = id;
    this.director = new FightDirector(id);
    this.start = startProgress;
    this.t = 0;
    this.moveT = Infinity;
    this.later.length = 0;
    this.sub = 1;
    this.boilT = 0;
    this.listed = 0;
    this.last = null;
    const lurk = this.w.sea?.lurk;
    // What is on the line is not also seen far off: the sea's own sightings wait for the fight to end.
    if (lurk) lurk.quiet = true;
    audio.giantFightStart(id);
  }

  /** The fight is over, landed or lost (once: nothing if no giant's fight is on). What it left on the water is put away; the storm, the view and the lamps ease back (`ambient`). */
  end(how: 'landed' | 'lost'): void {
    if (!this.director) return;
    this.director = null;
    this.later.length = 0;
    this.last = null;
    // (The Leviathan's serpent slides under where it is: `LeviathanFight.ambient`.)
    this.lev.end();
    const lurk = this.w.sea?.lurk;
    if (lurk) {
      lurk.letGo(0.5);
      lurk.shut();
      lurk.quiet = false;
      lurk.stir = 0;
    }
    // (Arms slide under and eyes shut: `letGo`, and eyes no longer asked for.) The boat is let go of.
    this.arms.length = 0;
    this.feet.length = 0;
    this.eyes.length = 0;
    // (`Game.easeShove` lets what is left of the push die away, or the landing's own swell takes the boat.)
    this.lurch = null;
    audio.giantFightEnd(how);
  }

  /** The player turned the view: the tighter view lets go for a moment. */
  turned(): void {
    this.turnedAgo = 0;
  }

  /** For the debug API: the director's state. */
  state(): { id: GiantId; act: FightAct; move: GiantMove | null; moves: number; sinceMove: number; lastStand: boolean; spent: boolean; near: number; dist: number; len: number } | null {
    const d = this.director;
    const f = this.last;
    return d ? { id: d.id, act: d.act, move: d.move, moves: d.moves, sinceMove: this.moveT, lastStand: d.stood, spent: d.spent, near: f ? nearAt(f.reel.progress, this.start) : 0, dist: f ? Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z) : 0, len: !f ? 0 : d.id === 'leviathan' ? this.lev.length : modelLength(f.fish) * f.sc } : null;
  }

  /** For the debug API: how many of the Kraken's standing arms are up, and how many eyes the Dreamer has on the water (in the fight, and landed). */
  shown(): { arms: number; eyes: number; landed: number } {
    return { arms: this.arms.length, eyes: this.eyes.filter((e) => this.t >= e.from && this.t < e.until).length, landed: this.woke ? this.woke.eyes.filter((e) => this.woke!.t >= e.from && this.woke!.t < e.until).length : 0 };
  }

  /** One frame of the fight: the director's step, whatever it cues, and the giant's pose for this frame. */
  tick(dt: number, f: GiantFrame): GiantPose {
    const d = this.director;
    if (!d) return REST;
    const r = f.reel;
    this.last = f;
    this.t += dt;
    this.moveT += dt;
    const cue = d.staged(d.step(dt, { progress: r.progress, fightLeft: r.fightLeft, surge: f.surge, exhausted: r.exhausted, free: !this.lev.busy }));
    const near = nearAt(r.progress, this.start);
    if (cue.boil) this.boil(f);
    if (cue.move) this.play(cue.move, f);
    if (cue.last) this.lastStand(f);
    if (this.id === 'kraken') this.standArms(dt, f, d);
    else if (this.id === 'dreamer') this.watch(dt, f, d);
    else this.lev.tick(dt, { act: d.act, build: r.build, warning: r.warning, lateral: r.lateral, dist: Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z), spent: d.spent }, f.fp, f.from);
    if (cue.call) audio.giantCall(this.id, { kind: cue.call, near, fight: r.fightLeft });
    audio.giantFight(dt, { act: d.act, near, fight: r.fightLeft, surge: r.build, warning: r.warning, tension: r.tension, spent: d.spent });
    // What was set going earlier and falls due now (an arm coming down, a second arm, a bolt).
    for (let i = 0; i < this.later.length; i++) {
      if (this.later[i].at > this.t) continue;
      const [e] = this.later.splice(i--, 1);
      e.run();
    }
    return this.posed(dt, f, d);
  }

  /**
   * Every frame, fight or no fight: the storm, the view and the boat's lurch ease to where the fight has them, and
   * back to rest once it is over.
   */
  ambient(dt: number): void {
    const w = this.w;
    const F = LEGEND_FIGHT;
    const d = this.director;
    const a = d ? d.act - 1 : -1;
    this.lev.ambient(dt);
    this.turnedAgo += dt;
    const k = (secs: number) => 1 - Math.exp((-dt * 3) / secs);
    const sea = w.sea;
    if (sea) {
      const S = sea.fight;
      S.bolts += ((a < 0 ? 1 : F.storm.bolts[a]) - S.bolts) * k(F.storm.ease);
      S.rain += ((a < 0 ? 1 : F.storm.rain[a]) - S.rain) * k(F.storm.ease);
      S.wind += ((a < 0 ? 1 : F.storm.wind[a]) - S.wind) * k(F.storm.ease);
    }
    // A little tighter as the giant comes in; never while the player is turning the view.
    const fov = a < 0 || this.turnedAgo < F.view.yield ? 0 : F.view.fov[a];
    w.fovFight += (fov - w.fovFight) * k(F.view.ease);
    if (Math.abs(w.fovFight) < 0.01 && fov === 0) w.fovFight = 0;
    // The Kraken's grip: the boat heels toward the arm and rocks back.
    const l = this.lurch;
    if (l && sea) {
      l.t += dt;
      const G = F.grip;
      const x = Math.max(0, l.t);
      const rock = Math.sin((x / G.period) * Math.PI * 2) * Math.exp(-x / G.die);
      const over = x > G.die * 4;
      // A positive roll lowers the port side (+z).
      sea.shove.roll = over ? 0 : l.side * G.roll * rock;
      sea.shove.heave = over ? 0 : -G.heave * Math.abs(rock);
      sea.shove.pitch = 0;
      if (over) this.lurch = null;
    }
    this.wake(dt);
  }

  // ----- the giant's own body -----

  private posed(dt: number, f: GiantFrame, d: FightDirector): GiantPose {
    const F = LEGEND_FIGHT;
    const w = this.w;
    const p = this.pose;
    const dist = Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z);
    const sc = f.sc;
    const top = modelBounds(f.fish).max.y * sc;
    p.still = p.pitch = p.lift = p.roll = 0;
    // Act 1: under, with a boil of white water over it at each surge; it comes up as act 2 begins.
    const under = d.act === 1 ? 1 : 0;
    this.sub += Math.sign(under - this.sub) * Math.min(Math.abs(under - this.sub), dt / F.deep.rise);
    const s = ease(this.sub);
    p.sunk = s * (top * 0.55 + F.deep.under);
    // (The Kraken's body is never drawn in the fight: its arms are the Kraken. Nor the Leviathan's: its weaving serpent is.)
    p.hidden = this.sub > 0.98 || this.id === 'kraken' || this.id === 'leviathan';
    // (Once the Leviathan is up its coils throw their own white water; the wake at the line's end is the less.)
    p.wake = this.id === 'leviathan' ? 1 - (1 - F.weave.wake) * (1 - s) : 1;
    const far = farDrop(dist);
    p.wakeDrop = 1 + (far - 1) * s;
    if (this.boilT > 0) {
      this.boilT -= dt;
      const at = new THREE.Vector3();
      for (let n = Math.random() < dt * F.deep.rate * 2 ? 2 : Math.random() < dt * F.deep.rate ? 1 : 0; n > 0; n--) {
        const a = Math.random() * Math.PI * 2, q = Math.sqrt(Math.random()) * sc * F.deep.wide;
        at.set(f.fp.x + Math.cos(a) * q, 0, f.fp.z + Math.sin(a) * q);
        at.y = w.surface(at.x, at.z);
        w.fx.splash(at, 7, 1.3 + 0.8 * Math.random(), F.deep.drop * far);
      }
    }
    // Spent: it lists over and wallows, with little thrash and little wake left.
    if (d.spent) {
      const W = F.wallow;
      this.listed = Math.min(1, this.listed + dt / 1.2);
      const k = ease(this.listed);
      p.still = Math.max(p.still, k * (1 - W.thrash));
      p.roll += k * (W.list + W.sway * Math.sin(w.time * 0.7));
      p.lift += k * W.awash * top;
      p.wake *= 1 - k * (1 - W.wake);
    }
    return p;
  }
  /** Act 1's answer to a surge: a boil of white water over where it swims. */
  private boil(f: GiantFrame): void {
    this.boilT = LEGEND_FIGHT.deep.boil;
    this.w.fx.splash(f.fp, 20, 2, LEGEND_FIGHT.deep.drop * farDrop(Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z)));
    audio.splash(0.6);
    this.w.addShake(0.4);
    // Out of sight still, but not nothing: an arm's tip from the Kraken, an eye or two from the Dreamer.
    if (this.id === 'kraken') this.arm(f, LEGEND_FIGHT.arms.tip, LEGEND_FIGHT.arms.tipLife[0], false, 0.5);
    else if (this.id === 'dreamer') for (let i = 0, n = this.few(LEGEND_FIGHT.gaze.peek); i < n; i++) this.gaze(f, 0.15 + 0.22 * i, 1.4 + 0.8 * Math.random(), 1, false, 0.6);
    else this.lev.glimpse();
  }

  // ----- the Kraken's standing arms -----

  /** How tall an arm may stand `dist` metres off: no taller than the view has room for (`LEGEND_FIGHT.reach`). */
  private tall(sc: number, dist: number, k = LEGEND_FIGHT.arm.height): number {
    return Math.min(sc * k, LEGEND_FIGHT.reach.base + LEGEND_FIGHT.reach.per * dist);
  }

  /** How tall a standing arm `dist` metres from the player may stand, as `tall`, and lower again right by the rail (`LEGEND_FIGHT.arms.rail`), where a full-height arm would stand out of the top of the view. */
  private stood(sc: number, dist: number): number {
    const [within, low] = LEGEND_FIGHT.arms.rail;
    return this.tall(sc, dist) * (low + (1 - low) * Math.min(1, dist / within));
  }

  /** Where an arm `off` from the line's end stands (the world, level), into `out`: there, or moved out clear of the hull (`LEGEND_FIGHT.arms.clear`). */
  private foot(f: GiantFrame, off: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(f.fp).add(off).setY(0);
    const c = clearOfHull(out.x, out.z, LEGEND_FIGHT.arms.clear, f.fp.x, f.fp.z, this.xz);
    return out.set(c[0], 0, c[1]);
  }
  private xz = [0, 0];

  /**
   * One standing arm up round the line's end, `h` of full height, for `life` seconds; `droop`: hanging limp, over
   * and away from the boat (spent). It stands in the widest gap the arms already up leave, `spread` of the knobs'
   * spread out (act 1's lone tip stays nearer the boil).
   */
  private arm(f: GiantFrame, h: number, life: number, droop: boolean, spread = 1): void {
    const sea = this.w.sea;
    if (!sea) return;
    const A = LEGEND_FIGHT.arms;
    const away = f.fp.clone().sub(f.from).setY(0).normalize();
    const a = armBearing(this.arms.map((x) => x.a), Math.random(), Math.random());
    const r = armRadius(A.ring, [A.spread[0] * spread, A.spread[1] * spread], A.spreadIn, nearAt(f.reel.progress, this.start), Math.random(), Math.random());
    const off = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    // On the boat's side of the line's end it stands less far out: an arm right under the rod fills the view.
    const toward = -(off.x * away.x + off.z * away.z);
    if (toward > 0) off.addScaledVector(away, toward * (1 - A.toward));
    const root = this.foot(f, off, new THREE.Vector3());
    const at = this.toSea(root);
    // Curling in over the line's end, or (spent) hanging away from the boat as it is dragged in.
    const face = droop ? Math.atan2(away.z, away.x) + (Math.random() - 0.5) * 0.8 : Math.atan2(-off.z, -off.x) + (Math.random() - 0.5) * 1.4;
    const tall = this.stood(f.sc, Math.hypot(root.x - f.from.x, root.z - f.from.z)) * h;
    const id = droop
      ? sea.lurk.reach(at.x, at.z, tall, face, A.limpRise, 999, A.limpSink, { by: A.droop, at: 0, over: A.limpRise, limp: A.limp }, LEGEND_FIGHT.reach.girth)
      : sea.lurk.reach(at.x, at.z, tall, face, A.rise, 999, A.sink, undefined, LEGEND_FIGHT.reach.girth);
    this.arms.push({ id, off, a, h, until: this.t + life, foam: 0, limp: droop });
    this.rise(root);
  }

  /**
   * Keeps the Kraken's arms standing round where the line holds it: as many as the act has, each up a while and
   * under as another comes up; alive, thrashing as a surge builds, and dragged (each leans away from the boat, more
   * the harder the line pulls).
   */
  private standArms(dt: number, f: GiantFrame, d: FightDirector): void {
    const sea = this.w.sea;
    if (!sea) return;
    const A = LEGEND_FIGHT.arms;
    const r = f.reel;
    const away = f.fp.clone().sub(f.from).setY(0);
    const far = farDrop(away.length());
    away.normalize();
    // Its last stand's own arms have the water to themselves; after it, a few hang spent.
    const standing = d.stood && !d.spent;
    // How hard they stir: alive in the calm, quicker as the SURGE warning shows, thrashing as the surge builds.
    const build = this.surgeHold ?? Math.max(r.build, r.warning ? 0.3 : 0);
    sea.lurk.stir = standing ? LEGEND_FIGHT.stand.kraken.stir : d.act === 1 && !d.stood ? A.tipStir : A.alive + A.thrash * build;
    const churn = 1 + (A.churn - 1) * (standing ? 1 : build);
    const lean = A.lean[0] + (A.lean[1] - A.lean[0]) * Math.min(1, Math.max(0, r.tension));
    const p = new THREE.Vector3();
    /** White water where an arm cuts the surface at `p`, more of it the harder it thrashes. */
    const cut = (o: { foam: number }, limp: boolean): void => {
      if ((o.foam -= dt * (limp ? 0.5 : churn)) > 0) return;
      o.foam = A.foam * (0.7 + 0.6 * Math.random());
      p.x += (Math.random() - 0.5) * 0.5;
      p.z += (Math.random() - 0.5) * 0.5;
      p.y = this.w.surface(p.x, p.z);
      this.w.fx.splash(p, limp ? 2 : Math.round(2 + churn), 0.7 + 0.25 * churn, 3 * far);
    };
    for (let i = this.arms.length - 1; i >= 0; i--) {
      const arm = this.arms[i];
      this.foot(f, arm.off, p);
      const at = this.toSea(p);
      // Where the line holds it, no taller than the view has room for where it stands, and taller as a surge builds.
      const tall = this.stood(f.sc, Math.hypot(p.x - f.from.x, p.z - f.from.z)) * arm.h * (1 + A.surge * (this.surgeHold ?? r.build));
      const k = arm.limp ? 0 : lean;
      const up = arm.until > this.t && sea.lurk.hold(arm.id, at.x, at.z, tall, away.x * k, away.z * k);
      if (!up) {
        sea.lurk.drop(arm.id, arm.limp ? A.limpSink : A.sink);
        this.arms.splice(i, 1);
        continue;
      }
      cut(arm, arm.limp);
    }
    // A move's arms churn the water too, while they are up.
    for (let i = this.feet.length - 1; i >= 0; i--) {
      const foot = this.feet[i];
      if (foot.until <= this.t) {
        this.feet.splice(i, 1);
        continue;
      }
      p.copy(foot.at);
      cut(foot, false);
    }
    const want = standing ? 0 : d.spent ? A.spent : A.count[d.act - 1];
    if (standing) for (const arm of this.arms) arm.until = Math.min(arm.until, this.t);
    // As act 2 begins it comes up at once: two arms together, the rest after them.
    const came = d.act !== this.armAct && d.act === 2;
    this.armAct = d.act;
    if (came) this.armCd = 0;
    if ((this.armCd -= dt) > 0 || this.arms.length >= want) return;
    const between = (r: [number, number]) => r[0] + (r[1] - r[0]) * Math.random();
    if (d.spent) this.arm(f, A.low * between(A.height), between(A.life), true);
    else if (d.act === 1) this.arm(f, A.tip, between(A.tipLife), false, 0.5);
    else for (let n = came ? 2 : 1; n > 0; n--) this.arm(f, between(A.height), between(A.life), false);
    this.armCd = between(d.act === 1 && !d.spent ? A.tipGap : A.gap);
  }

  // ----- the Dreamer's eyes -----

  /** `n` of its eyes, as many as these graphics keep (`LEGEND_FIGHT.gaze.lite` of them in lite graphics). */
  private few(n: number): number {
    return this.w.sea?.lurk.isLite ? Math.ceil(n * LEGEND_FIGHT.gaze.lite) : n;
  }

  /** How much bigger an eye `dist` metres from the player is drawn: bigger far off, like the white water, so it shows from the deck; smaller right under the rail, where a full-size one fills the view. */
  private gazeFar(dist: number): number {
    const [within, low] = LEGEND_FIGHT.gaze.rail;
    return (1 + 0.5 * (farDrop(dist) - 1)) * (low + (1 - low) * Math.min(1, dist / within));
  }

  /**
   * One eye on the water: `off` from the line's end (it follows the line in) or `at` a point of the world, opening
   * `wait` seconds from now for `secs` seconds, its lids `lid` wide. False if every eye there is room for is open.
   */
  private eye(off: THREE.Vector3 | null, at: THREE.Vector3 | null, size: number, wait: number, secs: number, lid: number, stay: boolean): boolean {
    const lurk = this.w.sea?.lurk;
    if (!lurk) return false;
    let slot = 0;
    while (this.eyes.some((e) => e.slot === slot)) slot++;
    if (slot >= lurk.keepRoom) return false;
    this.eyes.push({ slot, off, at: at ? this.toSea(at) : null, size, from: this.t + wait, until: this.t + wait + secs, lid, stay });
    return true;
  }

  /**
   * One more eye of its field (`LEGEND_FIGHT.gaze`): somewhere round the line's end clear of the eyes already there
   * (`fieldSpot`), `reach` of the field's radius out at most, on open water this side of the boat. False if the spot
   * rolled was no good (the hull, or behind the boat): the next try rolls another.
   */
  private gaze(f: GiantFrame, wait: number, secs: number, lid: number, stay: boolean, reach = 1): boolean {
    const G = LEGEND_FIGHT.gaze;
    const iris = LURK.eyes.size[1];
    const home = Math.atan2(f.from.z - f.fp.z, f.from.x - f.fp.x);
    const dist = Math.hypot(f.from.x - f.fp.x, f.from.z - f.fp.z);
    // Most of them small and a few big; room is kept for it at the biggest it may be drawn there.
    const base = G.size[0] + (G.size[1] - G.size[0]) * Math.random() ** 2;
    let size = base * this.gazeFar(Math.max(dist, G.rail[0]));
    const taken: Spot[] = [];
    for (const e of this.eyes) if (e.off && this.t < e.until) taken.push({ x: e.off.x, z: e.off.z, r: e.size * iris });
    // (Close in the field draws in round it: an eye off past the edge of the view is an eye not seen.)
    const inner = f.sc * G.ring[0], outer = Math.max(inner * 2.5, Math.min(f.sc * G.ring[1], dist * G.within)) * reach;
    const s = fieldSpot(taken, size * iris, [inner, outer], home, G.toward, G.apart, Math.random, this.spot);
    // Not under the hull, and not past the boat, where the deck hides it.
    if (s.x * Math.cos(home) + s.z * Math.sin(home) > dist - 1 || inHull(f.fp.x + s.x, f.fp.z + s.z, G.clear + 0.6)) return false;
    // (Drawn for how far off it lies itself, not for how far off the Dreamer is.)
    size = base * this.gazeFar(Math.hypot(f.fp.x + s.x - f.from.x, f.fp.z + s.z - f.from.z));
    return this.eye(new THREE.Vector3(s.x, 0, s.z), null, size, wait, secs, lid, stay);
  }
  private spot: Spot = { x: 0, z: 0, r: 0 };

  /**
   * Keeps the Dreamer's eyes on the water: every one open now is shown where it lies, and its field is kept up, as
   * many as the act has, one opening somewhere as another shuts.
   */
  private watch(dt: number, f: GiantFrame, d: FightDirector): void {
    const lurk = this.w.sea?.lurk;
    if (!lurk) return;
    const G = LEGEND_FIGHT.gaze;
    const p = new THREE.Vector3();
    let standing = 0;
    for (let i = this.eyes.length - 1; i >= 0; i--) {
      const e = this.eyes[i];
      // Shut a moment already: gone (the lurker lets an eye not asked for shut and go).
      if (this.t > e.until + 0.4) {
        this.eyes.splice(i, 1);
        continue;
      }
      if (e.stay) standing++;
      let at = e.at;
      if (!at) {
        p.copy(f.fp).add(e.off!);
        // The line has carried it in to the hull: it shuts.
        if (inHull(p.x, p.z, G.clear)) e.until = Math.min(e.until, this.t);
        at = this.toSea(p);
      }
      lurk.keep(e.slot, at.x, at.z, e.size, this.t >= e.from && this.t < e.until ? e.lid : 0);
    }
    // Its field: after its last stand (its bolt shut them all) some open again, half-lidded.
    const want = d.stood && !d.spent ? 0 : this.few(d.spent ? G.spent : G.count[d.act - 1]);
    if ((this.eyeCd -= dt) > 0 || standing >= want) return;
    this.eyeCd = G.fill[0] + (G.fill[1] - G.fill[0]) * Math.random();
    // (A few rolls: close in, much of the field is the hull.)
    for (let i = 0; i < 4; i++) if (this.gaze(f, 0, G.open[0] + (G.open[1] - G.open[0]) * Math.random(), d.spent ? G.lid : 1, true)) break;
  }

  /**
   * The Dreamer is landed (`LEGEND_FIGHT.gaze.landing`): as it comes up beside the hull (over `rise` seconds, its
   * middle at `mid` in the world, `len` metres long) its eyes open on the water all round the boat, from beside it
   * round to the far side, and stay while it is shown; none where it lies itself.
   */
  landing(mid: THREE.Vector3, len: number, rise: number): void {
    const lurk = this.w.sea?.lurk;
    this.woke = null;
    if (!lurk) return;
    const L = LEGEND_FIGHT.gaze.landing;
    const spots = boatRing(this.few(L.count), L.off, Math.random, { x: mid.x, z: mid.z, r: len * L.keepOut });
    // Those beside it first, then on round the boat.
    spots.sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z));
    const room = lurk.keepRoom;
    this.woke = {
      t: 0,
      over: -1,
      eyes: spots.map((s, i) => ({
        slot: room - 1 - i,
        at: this.toSea(new THREE.Vector3(s.x, 0, s.z)),
        // The close ones big, the far ones smaller.
        size: (L.size[1] + (L.size[0] - L.size[1]) * s.k) * (0.85 + 0.3 * Math.random()),
        from: rise * L.wait + i * L.gap * (0.7 + 0.6 * Math.random()),
        until: Infinity,
      })),
    };
  }

  /** The landed Dreamer sinks back over `secs` seconds: its eyes round the boat shut one by one as it goes. */
  landingOver(secs: number): void {
    const k = this.woke;
    if (!k || k.over >= 0) return;
    for (const e of k.eyes) e.until = Math.min(e.until, k.t + secs * 0.85 * Math.random());
    k.over = k.t + secs + 1;
  }

  /** Keeps a landed Dreamer's eyes on the water round the boat (every frame, from `ambient`). */
  private wake(dt: number): void {
    const k = this.woke;
    if (!k) return;
    const lurk = this.w.sea?.lurk;
    k.t += dt;
    if (!lurk || (k.over >= 0 && k.t > k.over)) {
      this.woke = null;
      return;
    }
    for (const e of k.eyes) lurk.keep(e.slot, e.at.x, e.at.z, e.size, k.t >= e.from && k.t < e.until ? 1 : 0);
  }

  // ----- the moves -----

  /** Where a point of the world is in the sea's own frame (where the lurkers ride the swell), and a bearing there. */
  private toSea(p: THREE.Vector3): THREE.Vector3 {
    return this.w.sea!.frame.worldToLocal(p.clone());
  }

  /** Plays `m` now (the director has picked it). */
  private play(m: GiantMove, f: GiantFrame): void {
    const w = this.w;
    const sea = w.sea;
    const F = LEGEND_FIGHT;
    this.moveT = 0;
    const away = f.fp.clone().sub(f.from).setY(0);
    const dist = away.length();
    away.normalize();
    const close = dist < F.close;
    // Across the line, to the player's left and right.
    const side = new THREE.Vector3(away.z, 0, -away.x);
    const sc = f.sc;
    // An arm is no taller than the view has room for at that distance.
    const tall = (k: number) => Math.min(sc * k, F.reach.base + F.reach.per * dist);
    const girth = F.reach.girth;
    if (m === 'rear' || m === 'coil' || m === 'tail') {
      // The Leviathan's: its weaving serpent makes them (`LeviathanFight`).
      this.lev.play(m);
      // The rear tops out against a bolt.
      if (m === 'rear' && F.rear.bolt > 0)
        this.later.push({
          at: this.t + F.rear.up * 0.8,
          run: () => {
            if (!this.last) return;
            const at = this.last.fp.clone();
            at.y += 3;
            this.bolt(at, F.rear.bolt);
          },
        });
      return;
    }
    if (!sea) return;
    const lurk = sea.lurk;
    const face = (v: THREE.Vector3) => Math.atan2(v.z, v.x);
    if (m === 'arm') {
      const at = this.toSea(f.fp.clone().addScaledVector(side, sc * 0.35));
      lurk.reach(at.x, at.z, tall(F.arm.height), Math.atan2(at.z, at.x) + Math.PI / 2, F.arm.rise, F.arm.hold, F.arm.sink, undefined, girth);
      this.rise(f.fp.clone().addScaledVector(side, sc * 0.35), F.arm.rise + F.arm.hold);
    } else if (m === 'slap') {
      // Up on one side of it and down across it, so it falls across the view.
      const k = Math.random() < 0.5 ? -1 : 1;
      const h = tall(F.slap.height);
      this.slap(f.fp.clone().addScaledVector(side, k * h * 0.55), side.clone().multiplyScalar(-k), h, F.slap, 0, close, true);
    } else if (m === 'twin') {
      const T = F.twin;
      const h = tall(T.height);
      for (const k of [-1, 1]) {
        // Well apart, either side of the line's end (and clear of the hull).
        const root = this.foot(f, side.clone().multiplyScalar(k * THREE.MathUtils.clamp(sc * T.apart, T.wide[0], T.wide[1])), new THREE.Vector3());
        const at = this.toSea(root);
        // Each curls in toward the other, over the giant.
        const go = () => {
          lurk.reach(at.x, at.z, h, face(side) + (k > 0 ? Math.PI : 0), F.arm.rise, T.hold, F.arm.sink, undefined, girth);
          this.rise(root, F.arm.rise + T.hold);
        };
        if (k < 0) go();
        else this.later.push({ at: this.t + T.lag, run: go });
      }
    } else if (m === 'grip') {
      this.grip(f);
    } else if (m === 'ring') {
      // A wide ring of eyes round it, opening one after another, following the line in.
      const E = F.eyes;
      const turn = Math.random() * Math.PI * 2;
      let nth = 0;
      // The outer ring round, then the smaller one inside it.
      for (const [n, at, size] of [[this.few(E.count), 1, 1], [this.few(E.inner), E.innerAt, 0.8]]) {
        for (let i = 0; i < n; i++) {
          const a = turn + ((i + 0.4 * (Math.random() - 0.5)) / n) * Math.PI * 2, r = sc * E.radius * at * (0.9 + 0.2 * Math.random());
          const off = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
          if (inHull(f.fp.x + off.x, f.fp.z + off.z, F.gaze.clear)) continue;
          // (Each drawn for how far off it lies itself: the near side of a ring round a far Dreamer is close by.)
          const big = this.gazeFar(Math.hypot(f.fp.x + off.x - f.from.x, f.fp.z + off.z - f.from.z));
          this.eye(off, null, E.size * size * big * (0.8 + 0.4 * Math.random()), nth++ * E.gap, E.stay, 1, false);
        }
      }
    } else if (m === 'trail') {
      // A line of eyes from it to the boat, opening one after another, the nearest last: it is looking for you.
      const T = F.trail;
      const end = new THREE.Vector3(f.from.x, 0, f.from.z);
      for (let i = 0; i < 80 && inHull(end.x, end.z, T.off); i++) end.addScaledVector(away, 0.15);
      const across = new THREE.Vector3(away.z, 0, -away.x);
      for (let i = 0, n = this.few(T.count); i < n; i++) {
        const k = (i + 1) / n;
        // (Bigger far off, where the line starts; to either side of it by turns, so it is a path of them and not a rule.)
        const at = f.fp.clone().lerp(end, k).addScaledVector(across, (i % 2 ? 1 : -1) * T.wide * (0.15 + 0.85 * Math.random()));
        if (inHull(at.x, at.z, F.gaze.clear)) continue;
        this.eye(null, at, T.size * (0.65 + 0.55 * Math.random()) * (1 + 0.5 * (farDrop(dist * (1 - k)) - 1)), i * T.gap, T.stay, 1, false);
      }
    } else if (m === 'under') {
      this.under();
    }
  }

  /** White water where an arm breaks the surface at `root`, and round it while it thrashes there for `secs` seconds more (a move's arm; the standing ones have their own). */
  private rise(root: THREE.Vector3, secs = 0): void {
    const w = this.w;
    const at = root.clone();
    at.y = w.surface(at.x, at.z);
    w.fx.splash(at, 30, 1.6, 3);
    audio.splash(0.6);
    if (secs > 0) this.feet.push({ at: root.clone(), until: this.t + secs, foam: 0.2 });
  }

  /**
   * One Kraken arm up at `root` and down flat along `dir` (level, unit): `S` its timing, `wait` seconds from now.
   * With `sound`, its landing is heard and felt (one of several coming down together leaves that to the first).
   */
  private slap(root: THREE.Vector3, dir: THREE.Vector3, height: number, S: { rise: number; hold: number; fall: number; lie: number; sink: number }, wait: number, close: boolean, sound: boolean): void {
    const w = this.w;
    const lurk = w.sea!.lurk;
    const at = this.toSea(root);
    const go = () => {
      lurk.reach(at.x, at.z, height, Math.atan2(dir.z, dir.x), S.rise, S.hold + S.fall + S.lie, S.sink, { by: 1.5, at: S.rise + S.hold, over: S.fall, fall: true }, LEGEND_FIGHT.reach.girth);
      this.rise(root, S.rise + S.hold);
    };
    if (wait > 0) this.later.push({ at: this.t + wait, run: go });
    else go();
    this.later.push({
      at: this.t + wait + S.rise + S.hold + S.fall,
      run: () => {
        // White water all along where it lands.
        const p = new THREE.Vector3();
        for (let i = 1; i <= 6; i++) {
          p.copy(root).addScaledVector(dir, (i / 6) * height * 0.95);
          p.y = w.surface(p.x, p.z);
          w.fx.splash(p, sound ? 16 : 6, 2.2 + 0.6 * Math.random(), 5.5);
        }
        if (!sound) return;
        audio.splash(1);
        w.addShake(close ? 1.1 : 0.7);
        if (close) this.spray.burst(0.7);
      },
    });
  }

  /** The Kraken's grip: an arm up beside the hull by the player, hooked over the rail, and the boat lurches toward it. */
  private grip(f: GiantFrame): void {
    const w = this.w;
    const G = LEGEND_FIGHT.grip;
    // Out past the rail the player looks over, a little to the left of where they look (the rod is on the right).
    const yaw = w.yaw + G.aside;
    const out = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const p = new THREE.Vector3(f.from.x, 0, f.from.z);
    for (let i = 0; i < 80 && inHull(p.x, p.z, G.off); i++) p.addScaledVector(out, 0.15);
    const at = this.toSea(p);
    // It curls back in over the rail, toward the player.
    const back = new THREE.Vector3(f.from.x - p.x, 0, f.from.z - p.z).normalize();
    w.sea!.lurk.reach(at.x, at.z, G.height, Math.atan2(back.z, back.x), G.rise, G.hold, G.sink, undefined, G.girth);
    this.rise(p);
    this.later.push({
      at: this.t + G.rise * 0.75,
      run: () => {
        // It takes hold: the boat heels toward it.
        this.lurch = { t: 0, side: p.z >= 0 ? 1 : -1 };
        w.addShake(1.2);
        w.pitchKick = -0.04;
        audio.splash(0.9);
        this.spray.burst(0.5);
      },
    });
  }

  /** The Dreamer's eyes open in the water right beside the hull, along the side the player looks over. */
  private under(): void {
    const w = this.w;
    const U = LEGEND_FIGHT.under;
    const out = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
    const across = new THREE.Vector3(out.z, 0, -out.x);
    const n = this.few(U.count);
    for (let i = 0; i < n; i++) {
      // Spread along the hull, the biggest in the middle of the view and close in, each its own way out from the side.
      const s = n > 1 ? i / (n - 1) - 0.5 : 0;
      const p = new THREE.Vector3(w.eye.x + across.x * s * U.along, 0, w.eye.z + across.z * s * U.along);
      const far = (i * 0.618) % 1;
      const off = U.off[0] + (U.off[1] - U.off[0]) * far;
      for (let k = 0; k < 120 && inHull(p.x, p.z, off); k++) p.addScaledVector(out, 0.15);
      // From the middle of the view outward.
      this.eye(null, p, U.size * (1 - 0.5 * Math.abs(s)) * (1 - 0.4 * far), Math.abs(s) * 2 * (n - 1) * 0.5 * U.gap, U.stay, 1, false);
    }
  }

  // ----- the last stand -----

  private lastStand(f: GiantFrame): void {
    const w = this.w;
    const sea = w.sea;
    const F = LEGEND_FIGHT;
    const L = F.lastStand;
    this.moveT = 0;
    const away = f.fp.clone().sub(f.from).setY(0);
    const dist = away.length();
    const close = dist < F.close;
    away.normalize();
    const side = new THREE.Vector3(away.z, 0, -away.x);
    const sc = f.sc;
    const behind = () => {
      if (!this.last) return;
      const at = this.last.fp.clone();
      at.y += 2;
      this.bolt(at, L.boltDist);
    };
    w.fx.splash(f.fp, 70, 2.4, 3.6 * farDrop(dist));
    audio.splash(1);
    w.addShake(1);
    if (this.id === 'leviathan') {
      // Its head, its coils and its tail up all at once, the bolt behind them at the top, and all of it down together.
      this.lev.stand();
      this.later.push({ at: this.t + L.bolt, run: behind });
      return;
    }
    if (!sea) return;
    if (this.id === 'kraken') {
      // Every arm it has up round it at once, the bolt behind them, and all of them down together.
      const S = F.stand.kraken;
      sea.lurk.letGo(0.3);
      const h = Math.min(sc * 1.4, F.reach.base + F.reach.per * dist) * S.height;
      for (let i = 0; i < S.arms; i++) {
        // Fanned round its far side and its flanks, each falling outward.
        const a = (i / (S.arms - 1) - 0.5) * Math.PI * S.fan;
        const dir = away.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
        // Each its own way off the line's end, so close in they still stand apart (and clear of the hull).
        const root = this.foot(f, dir.clone().multiplyScalar(Math.max(dist * S.spread, S.wide[0] + (S.wide[1] - S.wide[0]) * ((i * 0.618 + 0.3) % 1))), new THREE.Vector3());
        this.slap(root, dir, h * (0.8 + 0.2 * Math.cos(a)), { ...S, hold: S.hold + (S.arms - 1 - i) * S.lag }, i * S.lag, close, i === 0);
      }
      this.later.push({ at: this.t + L.bolt, run: behind });
      this.later.push({ at: this.t + (S.arms - 1) * S.lag + S.rise + S.hold + S.fall, run: () => close && this.spray.burst(1) });
      return;
    }
    // The Dreamer: every eye it has opens, all round the boat and round itself, and its bolt shuts them all together.
    // (The wind and the rain drop under it, and the sea's own bolts hold off: nothing is done to the lamps or the light.)
    const S = F.stand.dreamer;
    audio.hush(S.hush);
    sea.lightning.hush(S.hush + 1);
    // Its standing watch shuts with the rest at the bolt.
    for (const e of this.eyes) e.until = Math.min(e.until, this.t + S.bolt);
    let n = 0;
    const open = (off: THREE.Vector3 | null, at: THREE.Vector3 | null, size: number) => this.eye(off, at, size, n++ * S.gap, S.bolt - (n - 1) * S.gap, 1, false);
    const turn = Math.random() * Math.PI * 2;
    for (let i = 0, ring = this.few(S.ring); i < ring; i++) {
      const a = turn + (i / ring) * Math.PI * 2, r = sc * S.radius * (0.8 + 0.4 * Math.random());
      const off = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      if (!inHull(f.fp.x + off.x, f.fp.z + off.z, F.gaze.clear)) open(off, null, S.size * (0.75 + 0.4 * Math.random()) * this.gazeFar(Math.hypot(f.fp.x + off.x - f.from.x, f.fp.z + off.z - f.from.z)));
    }
    // All round the boat, out from the hull's side every way: from where the player looks, round to behind them.
    const look = new THREE.Vector3(-Math.sin(w.yaw), 0, -Math.cos(w.yaw));
    const turned = (p: { x: number; z: number }) => -(look.x * (p.x - w.eye.x) + look.z * (p.z - w.eye.z)) / (Math.hypot(p.x - w.eye.x, p.z - w.eye.z) || 1);
    for (const p of boatRing(this.few(S.boat), S.off, Math.random).sort((a, b) => turned(a) - turned(b))) open(null, new THREE.Vector3(p.x, 0, p.z), S.size * (1 - 0.4 * p.k) * (0.8 + 0.3 * Math.random()));
    this.later.push({
      at: this.t + S.bolt,
      run: () => {
        behind();
        w.addShake(0.9);
      },
    });
  }
}
