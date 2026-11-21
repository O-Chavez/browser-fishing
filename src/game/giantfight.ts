import * as THREE from 'three';
import { LEGEND_FIGHT, rearAt, type FightAct, type GiantId, type GiantMove } from '../data/legendshow';
import { inHull } from '../data/sea';
import { audio } from './audio';
import type { FishModel } from './fishmodel';
import { FightDirector, nearAt } from './legendfight';
import { modelBounds, modelLength } from './legendshow';
import type { Reel } from './reel';
import type { ScreenSpray } from './screenspray';
import type { World } from './world';

/**
 * An Abyss giant's fight as it is shown (`LEGEND_FIGHT`): the fight director (`legendfight.ts`) says which act the
 * fight is in, when the giant makes a move and when it makes its last stand; this draws them and tells the sound.
 * Presentation only: it reads the reel and never writes to it, and its dice are `Math.random`.
 *
 * Nothing is built here, so nothing compiles mid-fight: the Kraken's arms and the Dreamer's eyes are the Abyss's own
 * lurkers (`AbyssLurk`, compiled with the sea), the Leviathan's moves pose the hooked fish's own model, and the rest
 * is white water (`Fx`), the lens spray, the sea's lightning and rain, and the boat's lurch (`Sea.shove`).
 *
 * The Kraken is its arms alone all through the fight (its hooked model is not drawn until the landing): arms that
 * stand out of the water where the line holds it and come in with it (`LEGEND_FIGHT.arms`). The Dreamer's eyes are on
 * the water round the line the same way (`LEGEND_FIGHT.gaze`), its body under them.
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
  /** Drawn this many times its swimming size (the Leviathan far off, `LEGEND_FIGHT.far`), and slid this far along its heading (m). */
  scale: number;
  along: number;
  /** Turned toward this heading (radians, as `rotation.y`) by this share (0: where the fight has it). */
  yaw: number;
  yawK: number;
  /** Wholly under: not drawn. */
  hidden: boolean;
  /** Its wake's white water, times a legend's usual, and the size of its drops (far out and unseen, bigger: the wake is all there is of it). */
  wake: number;
  wakeDrop: number;
}

/** What the game hands over each frame of the fight. */
export interface GiantFrame {
  /** The fight, to read (never written to: the server replays it from the button log alone). */
  reel: Readonly<Pick<Reel, 'progress' | 'fightLeft' | 'exhausted' | 'build' | 'warning' | 'tension'>>;
  /** A surge started this frame. */
  surge: boolean;
  /** Where the giant is, on the water. */
  fp: THREE.Vector3;
  /** The player's eyes, on the level (y 0). */
  from: THREE.Vector3;
  /** The giant's model and the scale it swims at (what it is drawn at is that times the pose's `scale`). */
  fish: FishModel;
  sc: number;
}

const ease = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const REST: GiantPose = { still: 0, pitch: 0, lift: 0, roll: 0, sunk: 0, scale: 1, along: 0, yaw: 0, yawK: 0, hidden: false, wake: 1, wakeDrop: 1 };
const smoothstep = (a: number, b: number, x: number): number => ease((x - a) / (b - a));
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
  /** A move the giant's own body is making (the Leviathan's, and its last stand): seconds in. */
  private body: { kind: 'rear' | 'coil' | 'tail' | 'stand'; t: number; side: number; close: boolean; foamCd: number; far: number; yaw: number } | null = null;
  /** How much bigger than it swims the giant is drawn now (`LEGEND_FIGHT.far`), eased; and how far into a move it is (0..1), for its seams and eyes. */
  private grow = 1;
  private up = 0;
  /** The heading its last stand left it lying on (the Leviathan: broadside, where it fell), or null. */
  private heldYaw: number | null = null;
  /**
   * The giant's own look for the fight (`LEGEND_FIGHT.far`): its lit and its glowing materials copied for this model
   * alone (the ones it was built with are shared by every model of the kind), with the colours they started with, and
   * its eyes' glows with their sizes. All of it is put back as the fight ends.
   */
  private look: { mats: { mesh: THREE.Mesh; was: THREE.Material; mine: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; base: THREE.Color; glow: boolean }[]; sprites: { o: THREE.Object3D; size: number }[] } | null = null;
  /** How far over it has rolled, spent (0..1). */
  private listed = 0;
  /**
   * The Kraken's arms standing where the line holds it: each one's id (`AbyssLurk.reach`), where it stands from the
   * line's end (m, level), its height as a share of what an arm may stand there, when it lets go (fight seconds) and
   * when white water next breaks round its foot.
   */
  private arms: { id: number; off: THREE.Vector3; h: number; until: number; foam: number }[] = [];
  private armCd = 0;
  private armAct = 1;
  /**
   * The Dreamer's eyes on the water: each one's slot (`AbyssLurk.keep`), where it lies (`off` from the line's end,
   * following it in, or `at` a fixed point of the sea's frame), its size, when it opens and shuts (fight seconds) and
   * how wide. `stay` ones are its standing watch, which open somewhere else once shut.
   */
  private eyes: { slot: number; off: THREE.Vector3 | null; at: THREE.Vector3 | null; size: number; from: number; until: number; lid: number; stay: boolean }[] = [];
  private eyeCd = 0;
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
  ) {}

  /** A giant is hooked: `fish` its model in the water. */
  begin(id: GiantId, startProgress: number, fish: FishModel): void {
    if (this.director) this.end('lost');
    this.grow = 1;
    this.up = 0;
    this.heldYaw = null;
    this.arms.length = 0;
    this.eyes.length = 0;
    this.armCd = LEGEND_FIGHT.arms.tipGap[0];
    this.eyeCd = 0;
    this.armAct = 1;
    this.dress(id, fish);
    this.id = id;
    this.director = new FightDirector(id);
    this.start = startProgress;
    this.t = 0;
    this.moveT = Infinity;
    this.later.length = 0;
    this.sub = 1;
    this.boilT = 0;
    this.body = null;
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
    this.body = null;
    this.last = null;
    this.undress();
    const lurk = this.w.sea?.lurk;
    if (lurk) {
      lurk.letGo(0.5);
      lurk.shut();
      lurk.quiet = false;
    }
    // (Arms slide under and eyes shut: `letGo`, and eyes no longer asked for.) The boat is let go of.
    this.arms.length = 0;
    this.eyes.length = 0;
    // (`Game.easeShove` lets what is left of the push die away, or the landing's own swell takes the boat.)
    this.lurch = null;
    audio.giantFightEnd(how);
  }

  /**
   * Gives a giant drawn for the distance (`LEGEND_FIGHT.far`) materials of its own to light: copies of the shared
   * ones it was built with, drawn with the same shader programs (nothing compiles), so only this model is lit.
   */
  private dress(id: GiantId, fish: FishModel): void {
    this.undress();
    if (!LEGEND_FIGHT.far[id]) return;
    const look: NonNullable<GiantFights['look']> = { mats: [], sprites: [] };
    const copies = new Map<THREE.Material, THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>();
    fish.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if ((o as THREE.Sprite).isSprite) look.sprites.push({ o, size: o.scale.x });
      const m = mesh.material as THREE.Material | undefined;
      if (!mesh.isMesh || !m || Array.isArray(m) || m.blending === THREE.AdditiveBlending) return;
      const lit = !!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial;
      // What glows of its own (its seams and eyes: unlit, vertex-coloured, not tone-mapped) burns brighter in a move.
      const glow = !!(m as THREE.MeshBasicMaterial).isMeshBasicMaterial && (m as THREE.MeshBasicMaterial).vertexColors && !m.toneMapped;
      if (!lit && !glow) return;
      let mine = copies.get(m);
      if (!mine) {
        mine = m.clone() as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
        mine.onBeforeCompile = m.onBeforeCompile;
        mine.customProgramCacheKey = m.customProgramCacheKey;
        copies.set(m, mine);
      }
      look.mats.push({ mesh, was: m, mine, base: mine.color.clone(), glow });
      mesh.material = mine;
    });
    this.look = look;
  }

  /** Puts the model's shared materials and its glows' sizes back (its landing, or the next cast's model, starts from them). */
  private undress(): void {
    const look = this.look;
    if (!look) return;
    this.look = null;
    const gone = new Set<THREE.Material>();
    for (const { mesh, was, mine } of look.mats) {
      if (mesh.material === mine) mesh.material = was;
      if (!gone.has(mine)) {
        gone.add(mine);
        mine.dispose();
      }
    }
    for (const { o, size } of look.sprites) o.scale.setScalar(size);
  }

  /** The player turned the view: the tighter view lets go for a moment. */
  turned(): void {
    this.turnedAgo = 0;
  }

  /** For the debug API: the director's state. */
  state(): { id: GiantId; act: FightAct; move: GiantMove | null; moves: number; sinceMove: number; lastStand: boolean; spent: boolean; near: number; dist: number; len: number } | null {
    const d = this.director;
    const f = this.last;
    return d ? { id: d.id, act: d.act, move: d.move, moves: d.moves, sinceMove: this.moveT, lastStand: d.stood, spent: d.spent, near: f ? nearAt(f.reel.progress, this.start) : 0, dist: f ? Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z) : 0, len: f ? modelLength(f.fish) * f.sc * this.grow : 0 } : null;
  }

  /** One frame of the fight: the director's step, whatever it cues, and the giant's pose for this frame. */
  tick(dt: number, f: GiantFrame): GiantPose {
    const d = this.director;
    if (!d) return REST;
    const r = f.reel;
    this.last = f;
    this.t += dt;
    this.moveT += dt;
    const cue = d.staged(d.step(dt, { progress: r.progress, fightLeft: r.fightLeft, surge: f.surge, exhausted: r.exhausted, free: !this.body }));
    const near = nearAt(r.progress, this.start);
    if (cue.boil) this.boil(f);
    if (cue.move) this.play(cue.move, f);
    if (cue.last) this.lastStand(f);
    if (this.id === 'kraken') this.standArms(dt, f, d);
    else if (this.id === 'dreamer') this.watch(dt, f, d);
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
  }

  // ----- the giant's own body -----

  private posed(dt: number, f: GiantFrame, d: FightDirector): GiantPose {
    const F = LEGEND_FIGHT;
    const w = this.w;
    const p = this.pose;
    const dist = Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z);
    // Drawn for the distance: bigger the further off, eased so a surge's run does not pump it.
    const look = F.far[d.id];
    const grown = look ? 1 + (look.grow.scale - 1) * smoothstep(look.grow.from, look.grow.to, dist) : 1;
    this.grow += (grown - this.grow) * (1 - Math.exp(-dt * 1.2));
    p.scale = this.grow;
    const sc = f.sc * this.grow;
    const top = modelBounds(f.fish).max.y * sc;
    const len = modelLength(f.fish) * sc;
    p.still = p.pitch = p.lift = p.roll = p.along = 0;
    // Act 1: under, with a boil of white water over it at each surge; it comes up as act 2 begins.
    const under = d.act === 1 ? 1 : 0;
    this.sub += Math.sign(under - this.sub) * Math.min(Math.abs(under - this.sub), dt / F.deep.rise);
    const s = ease(this.sub);
    p.sunk = s * (top * 0.55 + F.deep.under);
    // (The Kraken's body is never drawn in the fight: its arms are the Kraken.)
    p.hidden = this.sub > 0.98 || this.id === 'kraken';
    p.wake = 1;
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
    const b = this.body;
    let up = 0;
    p.yawK = 0;
    if (b) {
      b.t += dt;
      const g = f.fish.group;
      // Its nose points along -Z, turned by its heading. Through a move it lies broadside to the deck (`b.yaw`), so
      // its whole length is seen against the sky; it turns there as the move starts and back as it ends.
      const nose = new THREE.Vector3(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y));
      const along = (k: number, slid = 0) => {
        const q = f.fp.clone().addScaledVector(nose, k * len + slid);
        q.y = w.surface(q.x, q.z);
        return q;
      };
      const drop = b.far;
      /** A collar of foam where it breaks the surface, `k` lengths along it. */
      const collar = (k: number, slid = 0) => {
        if ((b.foamCd -= dt) > 0) return;
        b.foamCd = look?.collar ?? 0.1;
        const q = along(k + (Math.random() - 0.5) * 0.08, slid);
        w.fx.splash(q, 5, 0.9 + 0.5 * Math.random(), 3.6 * drop);
      };
      let total = 0;
      /** The pitch that stands its end `reach` lengths from the pivot no higher than the view has room for at that distance (`far.room`). */
      const pitched = (pitch: number, reach: number, more = 1) => (look ? Math.min(pitch, Math.asin(Math.min(1, ((look.room[0] + look.room[1] * dist) * more) / (reach * len)))) : pitch);
      if (b.kind === 'rear' || b.kind === 'stand') {
        const R = b.kind === 'rear' ? F.rear : F.stand.leviathan;
        const pitch = pitched(R.pitch, 0.5 + R.pivot, b.kind === 'stand' ? (look?.stand ?? 1) : 1);
        total = R.up + R.hold + R.down;
        // The rear: up easing, held, back down (the last stand's faster and faster, onto its side).
        const before = this.rearK;
        const k = b.kind === 'rear' ? Math.max(0, rearAt(b.t)) : b.t < R.up ? ease(b.t / R.up) : b.t < R.up + R.hold ? 1 : 1 - Math.min(1, (b.t - R.up - R.hold) / R.down) ** 2;
        this.rearK = k;
        up = k;
        p.still = k;
        p.pitch = pitch * k;
        p.lift = Math.sin(pitch * k) * len * R.pivot;
        // White water pouring off it on the way up, a collar of it round its neck, and a crash as the head comes back down.
        if (k > before && Math.random() < dt * (b.kind === 'stand' ? 16 : 9)) w.fx.splash(along(0.1), 8, 1.8, 3.2 * drop);
        if (k > 0.2) collar(-R.pivot);
        if (before >= 0.3 && k < 0.3) this.crash(along(0.3), b.kind === 'stand' ? 1.5 : 1, b.close, drop);
      } else if (b.kind === 'coil') {
        const C = F.coil;
        total = C.secs + C.back;
        const under = top * 1.2 + 1;
        if (b.t < C.secs) {
          const u = b.t / C.secs;
          // Up onto the surface, along it with its spines clear and its nose arching over, and under at the end.
          const on = ease(u / 0.16) * (1 - ease((u - 0.84) / 0.16));
          up = on;
          p.still = on;
          p.lift = top * C.lift * on;
          p.roll = C.roll * on * b.side;
          p.pitch = C.pitch * Math.sin(2 * Math.PI * u) * on;
          p.along = len * C.run * (u * u * (3 - 2 * u));
          p.sunk += ease((u - 0.84) / 0.16) * under;
          // White water all along it: on black water that line of foam is what shows how long the thing rolling past is.
          if (on > 0.25 && (b.foamCd -= dt) <= 0) {
            b.foamCd = C.foam;
            w.fx.splash(along((Math.random() - 0.5) * 0.98, p.along), 6, 1.1 + 0.5 * Math.random(), 3.8 * drop);
          }
          if (b.t + dt >= C.secs) this.crash(along(0.35, p.along), 0.8, b.close, drop);
        } else {
          // Under, back to where the line holds it, and up again.
          p.sunk += (1 - ease((b.t - C.secs) / C.back)) * under;
        }
      } else {
        const T = F.tail;
        const pitch = pitched(T.pitch, 0.5 + T.pivot);
        total = T.up + T.hold + T.down;
        // Nose down, the tail stood out of the water, then brought down flat.
        const before = this.rearK;
        const k = b.t < T.up ? ease(b.t / T.up) : b.t < T.up + T.hold ? 1 : 1 - Math.min(1, (b.t - T.up - T.hold) / T.down) ** 2;
        this.rearK = k;
        up = k;
        p.still = k;
        p.pitch = -pitch * k;
        p.lift = Math.sin(pitch * k) * len * T.pivot;
        if (k > before && Math.random() < dt * 9) w.fx.splash(along(-0.2), 8, 1.8, 3.2 * drop);
        if (k > 0.2) collar(T.pivot);
        if (b.t >= total) {
          // The slap: a wall of white water where the tail lands, and over the deck if it is close.
          this.crash(along(-0.42), 1.4, b.close, drop * 1.5);
          for (let i = 0; i < 4; i++) w.fx.splash(along(-0.12 - 0.09 * i + 0.04 * Math.random()), 12, 1.8 + Math.random(), 7 * drop);
          if (b.close) this.spray.burst(1);
        }
      }
      // Broadside through the move, and back to the line's heading as it ends (its last stand stays where it falls).
      p.yaw = b.yaw;
      p.yawK = ease(b.t / 0.3) * (b.kind === 'stand' ? 1 : 1 - ease((b.t - total + 0.35) / 0.35));
      if (b.t >= total) this.endBody();
    }
    if (!b && this.heldYaw !== null) {
      p.yaw = this.heldYaw;
      p.yawK = 1;
    }
    // Its seams burn brighter and its eyes glare while it makes a move; its plates are lit once it is up (`far`).
    this.up += (up - this.up) * (1 - Math.exp(-dt * 8));
    if (this.look && look) {
      const body = 1 + look.body * (1 - s), seams = 1 + look.seams * this.up;
      for (const m of this.look.mats) m.mine.color.copy(m.base).multiplyScalar(m.glow ? seams : body);
      const glare = (1 + look.eyes * this.up) * (1 + 0.3 * (far - 1));
      for (const sp of this.look.sprites) sp.o.scale.setScalar(sp.size * glare);
    }
    // Spent: it lists over and wallows, with little thrash and little wake left.
    if (d.spent || (d.stood && this.id === 'leviathan' && !this.body)) {
      const W = F.wallow;
      this.listed = Math.min(1, this.listed + dt / 1.2);
      const k = ease(this.listed);
      p.still = Math.max(p.still, k * (1 - W.thrash));
      p.roll += k * (W.list + W.sway * Math.sin(w.time * 0.7));
      p.lift += k * W.awash * top;
      p.wake = 1 - k * (1 - W.wake);
    }
    return p;
  }
  private rearK = 0;

  private endBody(): void {
    this.body = null;
    this.rearK = 0;
  }

  /** White water where something heavy comes down at `at`: `k` its size (1 a rear's crash); close, it shakes harder; `drop`: bigger drops for one far off. */
  private crash(at: THREE.Vector3, k: number, close: boolean, drop = 1): void {
    const w = this.w;
    w.fx.splash(at, Math.round(60 * k), 2.2 + 0.4 * (k - 1), (3.5 + 0.6 * (k - 1)) * drop);
    audio.splash(Math.min(1, k));
    w.addShake((close ? 1 : 0.7) * Math.min(1.5, 0.8 * k));
  }

  /** Act 1's answer to a surge: a boil of white water over where it swims. */
  private boil(f: GiantFrame): void {
    this.boilT = LEGEND_FIGHT.deep.boil;
    this.w.fx.splash(f.fp, 20, 2, LEGEND_FIGHT.deep.drop * farDrop(Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z)));
    audio.splash(0.6);
    this.w.addShake(0.4);
    // Out of sight still, but not nothing: an arm's tip from the Kraken, an eye or two from the Dreamer.
    if (this.id === 'kraken') this.arm(f, LEGEND_FIGHT.arms.tip, LEGEND_FIGHT.arms.tipLife[0], false);
    else if (this.id === 'dreamer') for (let i = 0; i < LEGEND_FIGHT.gaze.peek; i++) this.eye(this.around(f, LEGEND_FIGHT.gaze.ring), null, this.gazeSize(f), 0.15 + 0.3 * i, 1.6, 1, false);
  }

  // ----- the Kraken's standing arms -----

  /** How tall an arm may stand `dist` metres off: no taller than the view has room for (`LEGEND_FIGHT.reach`). */
  private tall(sc: number, dist: number, k = LEGEND_FIGHT.arm.height): number {
    return Math.min(sc * k, LEGEND_FIGHT.reach.base + LEGEND_FIGHT.reach.per * dist);
  }

  /** One standing arm up near the line's end, `h` of full height, for `life` seconds; `droop`: hanging over, away from the boat (spent). */
  private arm(f: GiantFrame, h: number, life: number, droop: boolean): void {
    const sea = this.w.sea;
    if (!sea) return;
    const A = LEGEND_FIGHT.arms;
    const away = f.fp.clone().sub(f.from).setY(0);
    const dist = away.length();
    away.normalize();
    const a = Math.random() * Math.PI * 2, r = A.ring[0] + (A.ring[1] - A.ring[0]) * Math.random();
    const off = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    const root = f.fp.clone().add(off);
    const at = this.toSea(root);
    // Curling in over the line's end, or (spent) hanging away from the boat as it is dragged in.
    const face = droop ? Math.atan2(away.z, away.x) + (Math.random() - 0.5) * 0.8 : Math.atan2(-off.z, -off.x) + (Math.random() - 0.5) * 1.4;
    const id = sea.lurk.reach(at.x, at.z, this.tall(f.sc, dist) * h, face, A.rise, 999, A.sink, droop ? { by: A.droop, at: 0, over: A.rise } : undefined, LEGEND_FIGHT.reach.girth);
    this.arms.push({ id, off, h, until: this.t + life, foam: 0 });
    this.rise(root);
  }

  /** Keeps the Kraken's arms standing where the line holds it: as many as the act has, each up a while and under as another comes up. */
  private standArms(dt: number, f: GiantFrame, d: FightDirector): void {
    const sea = this.w.sea;
    if (!sea) return;
    const A = LEGEND_FIGHT.arms;
    const dist = Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z);
    const full = this.tall(f.sc, dist);
    const far = farDrop(dist);
    const p = new THREE.Vector3();
    for (let i = this.arms.length - 1; i >= 0; i--) {
      const arm = this.arms[i];
      p.copy(f.fp).add(arm.off);
      const at = this.toSea(p);
      // Where the line holds it, and taller as a surge builds.
      const up = arm.until > this.t && sea.lurk.hold(arm.id, at.x, at.z, full * arm.h * (1 + A.surge * f.reel.build));
      if (!up) {
        sea.lurk.drop(arm.id, A.sink);
        this.arms.splice(i, 1);
        continue;
      }
      // White water round its foot.
      if ((arm.foam -= dt) <= 0) {
        arm.foam = A.foam * (0.7 + 0.6 * Math.random());
        p.y = this.w.surface(p.x, p.z);
        this.w.fx.splash(p, 3, 0.8, 3 * far);
      }
    }
    // Its last stand's own arms have the water to themselves; after it, a few hang spent.
    const standing = d.stood && !d.spent;
    const want = standing ? 0 : d.spent ? A.spent : A.count[d.act - 1];
    if (standing) for (const arm of this.arms) arm.until = Math.min(arm.until, this.t);
    // As act 2 begins it comes up at once: two arms together, the rest after them.
    const came = d.act !== this.armAct && d.act === 2;
    this.armAct = d.act;
    if (came) this.armCd = 0;
    if ((this.armCd -= dt) > 0 || this.arms.length >= want) return;
    const between = (r: [number, number]) => r[0] + (r[1] - r[0]) * Math.random();
    if (d.spent) this.arm(f, A.low * between(A.height), between(A.life), true);
    else if (d.act === 1) this.arm(f, A.tip, between(A.tipLife), false);
    else for (let n = came ? 2 : 1; n > 0; n--) this.arm(f, between(A.height), between(A.life), false);
    this.armCd = between(d.act === 1 && !d.spent ? A.tipGap : A.gap);
  }

  // ----- the Dreamer's eyes -----

  /** A point `ring[0]` to `ring[1]` drawn scales from the line's end, on the side toward the player and out to either flank (not behind the giant, where its body would hide it). */
  private around(f: GiantFrame, ring: [number, number]): THREE.Vector3 {
    const home = Math.atan2(f.from.z - f.fp.z, f.from.x - f.fp.x);
    const a = home + (Math.random() < 0.5 ? -1 : 1) * (0.25 + 1.75 * Math.random()), r = f.sc * (ring[0] + (ring[1] - ring[0]) * Math.random());
    return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
  }

  /** How big one of its standing eyes is: bigger far off, like the white water, so it shows from the deck. */
  private gazeSize(f: GiantFrame): number {
    const G = LEGEND_FIGHT.gaze;
    return (G.size[0] + (G.size[1] - G.size[0]) * Math.random()) * (1 + 0.5 * (farDrop(Math.hypot(f.fp.x - f.from.x, f.fp.z - f.from.z)) - 1));
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

  /** Keeps the Dreamer's eyes on the water: every one open now is shown where it lies, and its standing watch is kept up, as many as the act has. */
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
      const at = e.at ?? this.toSea(p.copy(f.fp).add(e.off!));
      lurk.keep(e.slot, at.x, at.z, e.size, this.t >= e.from && this.t < e.until ? e.lid : 0);
    }
    // Its watch: after its last stand (its bolt shut them all) a couple open again, half-lidded.
    const want = d.stood && !d.spent ? 0 : d.spent ? G.spent : G.count[d.act - 1];
    if ((this.eyeCd -= dt) > 0 || standing >= want) return;
    this.eyeCd = G.shut[0] + (G.shut[1] - G.shut[0]) * Math.random();
    this.eye(this.around(f, G.ring), null, this.gazeSize(f), 0, G.open[0] + (G.open[1] - G.open[0]) * Math.random(), d.spent ? G.lid : 1, true);
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
    const g = f.fish.group;
    if (m === 'rear' || m === 'coil' || m === 'tail') {
      // The Leviathan's own body, turned broadside to the deck for the move: nose to whichever side it is nearer.
      const nose = new THREE.Vector3(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y));
      const to = side.clone().multiplyScalar(nose.dot(side) >= 0 ? 1 : -1);
      const yaw = Math.atan2(-to.x, -to.z);
      // Rolled so its back and spines lean toward the deck: which way depends on the flank it will show.
      const rightFlank = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const far = farDrop(dist);
      this.body = { kind: m, t: 0, side: rightFlank.dot(away) > 0 ? 1 : -1, close, foamCd: 0, far, yaw };
      this.rearK = 0;
      // A column of white water where it comes up, tall enough to show from the deck at that distance.
      const X = F.far[this.id];
      w.fx.splash(f.fp, 30, 2.3, (X?.plume ?? 3) * far);
      audio.splash(0.8);
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
      this.rise(f.fp.clone().addScaledVector(side, sc * 0.35));
    } else if (m === 'slap') {
      // Up on one side of it and down across it, so it falls across the view.
      const k = Math.random() < 0.5 ? -1 : 1;
      const h = tall(F.slap.height);
      this.slap(f.fp.clone().addScaledVector(side, k * h * 0.55), side.clone().multiplyScalar(-k), h, F.slap, 0, close, true);
    } else if (m === 'twin') {
      const T = F.twin;
      const h = tall(T.height);
      for (const k of [-1, 1]) {
        const root = f.fp.clone().addScaledVector(side, k * Math.min(sc * T.apart, h * 0.8));
        const at = this.toSea(root);
        // Each curls in toward the other, over the giant.
        const go = () => {
          lurk.reach(at.x, at.z, h, face(side) + (k > 0 ? Math.PI : 0), F.arm.rise, T.hold, F.arm.sink, undefined, girth);
          this.rise(root);
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
      const big = 1 + 0.5 * (farDrop(dist) - 1);
      for (let i = 0; i < E.count; i++) {
        const a = turn + ((i + 0.4 * (Math.random() - 0.5)) / E.count) * Math.PI * 2, r = sc * E.radius * (0.85 + 0.3 * Math.random());
        this.eye(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), null, E.size * big * (0.8 + 0.4 * Math.random()), i * E.gap, E.stay, 1, false);
      }
    } else if (m === 'trail') {
      // A line of eyes from it to the boat, opening one after another, the nearest last: it is looking for you.
      const T = F.trail;
      const end = new THREE.Vector3(f.from.x, 0, f.from.z);
      for (let i = 0; i < 80 && inHull(end.x, end.z, T.off); i++) end.addScaledVector(away, 0.15);
      const across = new THREE.Vector3(away.z, 0, -away.x);
      for (let i = 0; i < T.count; i++) {
        const k = (i + 1) / T.count;
        // (Bigger far off, where the line starts; a little to either side of it, so it is a trail and not a rule.)
        const at = f.fp.clone().lerp(end, k).addScaledVector(across, (Math.random() - 0.5) * 1.6);
        this.eye(null, at, T.size * (1 + 0.5 * (farDrop(dist * (1 - k)) - 1)), i * T.gap, T.stay, 1, false);
      }
    } else if (m === 'under') {
      this.under();
    }
  }

  /** White water where an arm breaks the surface at `root`. */
  private rise(root: THREE.Vector3): void {
    const w = this.w;
    const at = root.clone();
    at.y = w.surface(at.x, at.z);
    w.fx.splash(at, 30, 1.6, 3);
    audio.splash(0.6);
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
      this.rise(root);
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
    for (let i = 0; i < U.count; i++) {
      // Spread along the hull, the biggest in the middle of the view, each a little further out than the last.
      const s = U.count > 1 ? i / (U.count - 1) - 0.5 : 0;
      const p = new THREE.Vector3(w.eye.x + across.x * s * U.along, 0, w.eye.z + across.z * s * U.along);
      const off = U.off[0] + (U.off[1] - U.off[0]) * ((i * 0.618) % 1);
      for (let k = 0; k < 80 && inHull(p.x, p.z, off); k++) p.addScaledVector(out, 0.15);
      // From the middle of the view outward.
      this.eye(null, p, U.size * (1 - 0.5 * Math.abs(s)), Math.abs(s) * 2 * (U.count - 1) * 0.5 * U.gap, U.stay, 1, false);
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
      // It rears higher than it ever has, the bolt behind it at the top, and falls on its side.
      const g = f.fish.group;
      // Broadside, like its moves, and it stays so once it has fallen.
      const nose = new THREE.Vector3(-Math.sin(g.rotation.y), 0, -Math.cos(g.rotation.y));
      const to = side.clone().multiplyScalar(nose.dot(side) >= 0 ? 1 : -1);
      const yaw = Math.atan2(-to.x, -to.z);
      this.heldYaw = yaw;
      const rightFlank = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      this.body = { kind: 'stand', t: 0, side: rightFlank.dot(away) > 0 ? 1 : -1, close, foamCd: 0, far: farDrop(dist), yaw };
      this.rearK = 0;
      this.later.push({ at: this.t + L.bolt, run: behind });
      const S = F.stand.leviathan;
      this.later.push({ at: this.t + S.up + S.hold + S.down, run: () => close && this.spray.burst(1) });
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
        const root = f.fp.clone().addScaledVector(dir, dist * S.spread);
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
    for (let i = 0; i < S.ring; i++) {
      const a = turn + (i / S.ring) * Math.PI * 2, r = sc * S.radius * (0.85 + 0.3 * Math.random());
      open(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), null, S.size * (1 + 0.5 * (farDrop(dist) - 1)));
    }
    // All round the boat, starting where the player looks: out from the hull's side every way.
    for (let i = 0; i < S.boat; i++) {
      // (To either side of where the player looks by turns, closer together there than behind them.)
      const a = w.yaw + (i % 2 ? -1 : 1) * Math.PI * Math.pow(Math.ceil(i / 2) / Math.ceil(S.boat / 2), 1.5);
      const out = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
      const p = new THREE.Vector3(w.eye.x * 0.3, 0, w.eye.z * 0.3);
      const off = S.off[0] + (S.off[1] - S.off[0]) * ((i * 0.618) % 1);
      for (let k = 0; k < 120 && inHull(p.x, p.z, off); k++) p.addScaledVector(out, 0.15);
      open(null, p, S.size * (0.75 + 0.35 * Math.random()));
    }
    this.later.push({
      at: this.t + S.bolt,
      run: () => {
        behind();
        w.addShake(0.9);
      },
    });
  }
}
