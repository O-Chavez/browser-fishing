import * as THREE from 'three';
import { LEGEND_FIGHT, type GiantMove } from '../data/legendshow';
import { audio } from './audio';
import { LeviathanWeave, WeaveMotion, clearHeading, lerp, weaveBreaks, weaveSpine, type WeaveBreak, type WeaveNow } from './leviathanweave';
import type { ScreenSpray } from './screenspray';
import type { WaveUniforms } from './seawaves';
import type { World } from './world';

/**
 * The Leviathan's fight for `GiantFights` (`LEGEND_FIGHT.weave`): its hooked model is never drawn; what the player
 * sees is a serpent weaving through the swell where the line holds it (`leviathanweave.ts`: its shape, its motion and
 * its one mesh). This puts it where the line is, clear of the hull, and throws its white water, its shake and its
 * spray. The serpent is built once for a sea and compiled then (`World.warmups`), long before a giant is hooked, so
 * nothing compiles mid-fight. Presentation only: it is told what the reel is doing and never writes to it.
 */

/** Where the line's end is and where the player stands, on the level (the world's x, z). */
interface WeaveAt {
  fp: THREE.Vector3;
  from: THREE.Vector3;
}

/** How much bigger white water is thrown `dist` metres off, so it still shows from the deck. */
const farDrop = (dist: number): number => Math.min(3, Math.max(1, dist / 10));

/**
 * The Leviathan's fight for `GiantFights`: the weaving serpent drawn where the line holds it, with its white water,
 * its shake and its spray. `ambient` runs every frame, fight or no fight: it builds the serpent for the sea the boat
 * is on (hidden until its shader is warm) and lets one whose fight has ended slide under.
 */
export class LeviathanFight {
  readonly motion = new WeaveMotion();
  private weave: LeviathanWeave | null = null;
  private sea: World['sea'] = null;
  /** Its heading (radians in the world, atan2 of z and x) and where its head is (the world's x, z). */
  private heading = 0;
  private head = new THREE.Vector3();
  private at: WeaveAt | null = null;
  private dist = 10;
  private foamCd = 0;
  private breaks: WeaveBreak[] = [];
  private p = new THREE.Vector3();
  private q = new THREE.Vector3();
  private sp = [0, 0, 0];

  constructor(private w: World, private spray: ScreenSpray) {}

  /** How long the serpent is drawn now (m). */
  get length(): number {
    return this.motion.shape.L;
  }

  /** A move of its own is playing (the director waits for it). */
  get busy(): boolean {
    return this.motion.busy;
  }

  /** A Leviathan is hooked. */
  begin(): void {
    // (Which way it heads is the line's to say while it is under; until the line is run, either.)
    this.motion.begin(Math.random() < 0.5 ? -1 : 1);
    this.at = null;
    this.foamCd = 0;
  }

  /** The fight is over, landed or lost: it slides under where it is (`ambient`). */
  end(): void {
    this.motion.end();
  }

  /** Act 1's answer to a surge. */
  glimpse(): void {
    this.motion.glimpse();
  }

  /** One of its moves. */
  play(m: GiantMove): void {
    if (m !== 'rear' && m !== 'coil' && m !== 'tail') return;
    this.motion.play(m);
    audio.splash(0.8);
  }

  /** Its last stand. */
  stand(): void {
    this.motion.stand();
  }

  /** One frame of the fight. */
  tick(dt: number, now: WeaveNow, fp: THREE.Vector3, from: THREE.Vector3): void {
    if (!this.at) this.at = { fp: new THREE.Vector3(), from: new THREE.Vector3() };
    this.at.fp.copy(fp);
    this.at.from.copy(from);
    this.dist = now.dist;
    const m = this.motion;
    const wasGone = m.gone;
    m.step(dt, now);
    this.place(dt, wasGone);
    this.water(dt, now.dist);
  }

  /** Every frame: the serpent built and warmed for this sea; after a fight, the last of it going under. */
  ambient(dt: number): void {
    const w = this.w;
    if (w.sea !== this.sea) {
      this.weave?.dispose();
      this.weave = null;
      this.sea = w.sea;
      if (w.sea) {
        this.weave = new LeviathanWeave(w.sea.waves as unknown as WaveUniforms);
        w.sea.frame.add(this.weave.group);
        // Compiled now, in the background, and never shown before it is (`place`).
        w.warmups.show(this.weave.mesh, () => false);
      }
    }
    const m = this.motion;
    if (m.over && !m.gone && this.at) {
      m.step(dt, { act: 2, build: 0, warning: false, lateral: 0, dist: this.dist, spent: false });
      this.place(dt, false);
    } else if (m.over && this.weave) this.weave.mesh.visible = false;
  }

  /** Where it lies this frame, and the mesh bent to it. */
  private place(dt: number, snap: boolean): void {
    const w = this.w, sea = w.sea, weave = this.weave, at = this.at;
    if (!sea || !weave || !at) return;
    const W = LEGEND_FIGHT.weave;
    const m = this.motion, sh = m.shape;
    if (!m.over) {
      // Across the line, heading the way it is run, and clear of the hull.
      const ax = at.fp.x - at.from.x, az = at.fp.z - at.from.z;
      const away = Math.atan2(az, ax);
      // (To the player's right is a quarter turn on from straight away, as bearings run here.)
      const want = clearHeading(at.fp.x, at.fp.z, away + m.side * W.across, m.hook, sh.L - m.hook, W.pad);
      const turn = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
      // Under, it turns unseen; up, no faster than a thing that size swings (the line's bearing drifting, the hull coming near).
      this.heading += snap || m.show <= 0 ? turn : Math.sign(turn) * Math.min(Math.abs(turn), W.swing * dt);
      this.head.set(at.fp.x + Math.cos(this.heading) * m.hook, 0, at.fp.z + Math.sin(this.heading) * m.hook);
    }
    // Into the sea's own frame, where it rides the swell.
    const p = this.p.copy(this.head), q = this.q.set(this.head.x + Math.cos(this.heading), 0, this.head.z + Math.sin(this.heading));
    p.y = w.surface(p.x, p.z);
    q.y = w.surface(q.x, q.z);
    sea.frame.worldToLocal(p);
    sea.frame.worldToLocal(q);
    weave.set(m, p.x, p.z, Math.atan2(q.z - p.z, q.x - p.x), sea.lightning.flash);
    weave.mesh.visible = !m.gone && w.warmups.isWarm(weave.mesh);
  }

  /** A point of its spine `s` metres back from the head, on the water there, in the world. */
  private pointAt(s: number, out: THREE.Vector3): void {
    const l = weaveSpine(s, this.motion.shape, this.sp);
    const c = Math.cos(this.heading), n = Math.sin(this.heading);
    out.set(this.head.x + c * (l[0] - s) - n * l[2], 0, this.head.z + n * (l[0] - s) + c * l[2]);
    out.y = this.w.surface(out.x, out.z);
  }

  /** Its white water for this frame: what its moves throw, and bursts where its back cuts the surface. */
  private water(dt: number, dist: number): void {
    const w = this.w;
    const F = LEGEND_FIGHT, W = F.weave;
    const m = this.motion;
    const far = farDrop(dist);
    const close = dist < F.close;
    const p = this.p;
    for (const e of m.events) {
      this.pointAt(e.s, p);
      if (e.kind === 'plume') w.fx.splash(p, 26, 2.3, W.plume * far);
      else if (e.kind === 'pour') w.fx.splash(p, 8, 1.8 * e.k, 3.2 * far);
      else if (e.kind === 'collar') w.fx.splash(p, 5, 0.9 + 0.5 * Math.random(), 3.6 * far);
      else if (e.kind === 'foam') w.fx.splash(p, 6 * e.k, 1.1 + 0.5 * Math.random(), 3.8 * far);
      else if (e.kind === 'flick') w.fx.splash(p, 14, 1.5, 3.4 * far);
      else if (e.kind === 'crash') {
        // Something heavy comes down: `k` its size (1 a rear's crash); close, it shakes harder.
        w.fx.splash(p, Math.round(60 * e.k), 2.2 + 0.4 * (e.k - 1), (3.5 + 0.6 * (e.k - 1)) * far);
        audio.splash(Math.min(1, e.k));
        w.addShake((close ? 1 : 0.7) * Math.min(1.5, 0.8 * e.k));
      } else {
        // The slap: a wall of white water where the blade lands, and over the deck if it is close.
        w.fx.splash(p, Math.round(50 * e.k), 2.4, 4.4 * far * 1.5);
        for (let i = 1; i <= 3; i++) {
          this.pointAt(e.s - i * 0.5 * m.scale, p);
          w.fx.splash(p, 10, 1.8 + Math.random(), 7 * far);
        }
        audio.splash(1);
        w.addShake((close ? 1 : 0.7) * 1.1);
        if (close) this.spray.burst(1);
      }
    }
    // Where its back cuts the surface: a burst at one end or the other of a stretch that is up, by turns.
    if ((this.foamCd -= dt) > 0 || m.show < 0.3) return;
    this.foamCd = W.foam * (0.7 + 0.6 * Math.random());
    const br = weaveBreaks(m.shape, m.girth, m.fin * 0.6, this.breaks, 0.5);
    if (!br.length) return;
    const b = br[Math.floor(Math.random() * br.length) % br.length];
    const r = Math.random();
    this.pointAt(r < 0.4 ? b.from : r < 0.8 ? b.to : lerp(b.from, b.to, Math.random()), p);
    w.fx.splash(p, 4, 0.8 + 0.5 * Math.random(), W.drop * far);
  }
}
