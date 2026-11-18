import * as THREE from 'three';
import type { MapDef } from '../data/maps';
import { SKIP, beatsBest, skipCount, skipDir, skipPath, skipSignText, skipSpread, skipsText, type SkipBest, type SkipPath } from '../data/skip';
import { writeSkipSign, type Writable } from './camp';
import { SKIP_HAND, SKIP_LET_GO } from './emotes/looks/skip';
import { standHeight } from './env';

/** Stones that can be in the air at once on one screen, and the rings on the water they share. */
const STONES = 12;
const RINGS = 28;
/** A touch's ring: how wide it spreads (metres) and how long it lasts (seconds); the sinking touch's are wider. */
const RING = { skip: 1.1, sink: 2, life: 1.2 };
/** A hold shorter than this is a slip of the finger, not a throw. */
const MIN_HOLD = 0.15;
/** How long the view takes to come round to the lake as the throw winds up, and where it looks. */
const TURN_SECS = 0.6;
const TURN_PITCH = -0.1;
/** The counter's pop as each number comes up (it is centred with a translate, which the keyframes keep). */
const POP = [{ transform: 'translateX(-50%) scale(1.45)' }, { transform: 'translateX(-50%) scale(1)' }];
/** How long the final count stays up, and how long the thrower waits for the server's word before throwing again. */
const COUNT_SECS = 2.4;
const REPLY_MS = 1500;

interface Stone {
  mesh: THREE.Mesh;
  active: boolean;
  /** Who threw it (a player id), and whether that is this player. */
  id: number;
  own: boolean;
  n: number;
  path: SkipPath;
  /** Seconds since the release (below 0 while the thrower's arm is still coming through). */
  t: number;
  /** The touch it flies to next (`path.t[leg]`); `n + 1` once it sinks. */
  leg: number;
  /** The hand it left, the pile the throw's line starts at, and the line's direction. */
  hand: THREE.Vector3;
  px: number;
  pz: number;
  dx: number;
  dz: number;
}

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  max: number;
}

/** How far apart two yaws are, in radians (0 to π). */
const turn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** What the stones need from the game. */
export interface SkipHost {
  /** The water's height at a spot, now. */
  surface(x: number, z: number): number;
  /** A few drops thrown up from the water at `p`. */
  splash(p: THREE.Vector3, n: number, power: number): void;
  /** Compiles what a group draws with, so its first sight doesn't stall (`World.warm`). */
  warm(o: THREE.Object3D): void;
  /** The skip sign standing on this map, or null. */
  sign(): Writable | null;
  /** This player: their id (0 offline), name and spot. */
  me(): { id: number; name: string; x: number; z: number };
  /** Sends a release to the server; false offline, where the game counts the skips itself. */
  send(p: number): boolean;
  /** Plays the throw on another player's avatar. */
  pose(id: number): void;
  /** The throw's swish, a touch's plip (`pitch` 1 and up) and the sinking plop, `gain` 0 to 1 by how far off it is. */
  whoosh(): void;
  plip(gain: number, pitch: number): void;
  plop(gain: number): void;
  toast(msg: string): void;
}

/** The view the throw turns and kicks: the world's own fields. */
export interface SkipView {
  yaw: number;
  pitch: number;
  fovKick: number;
  pitchKick: number;
}

/**
 * Skipping stones on Skipper's Beach (GAME_DESIGN.md §41; rules in `src/data/skip.ts`): the wind-up at the pile (a
 * gauge that sweeps like a cast's, `charging` and `power`), every stone in the air on this map with its rings, the
 * thrower's own counter, and the sign's line for the day's best. The stones, rings and materials are made once and
 * reused: nothing is built while a stone flies, and nothing here casts light or stands in anyone's way.
 */
export class Skipping {
  readonly group = new THREE.Group();
  private stones: Stone[] = [];
  private rings: Ring[] = [];
  private ringNext = 0;
  private map: MapDef | null = null;
  /** The wind-up: on while the action is held, with the gauge's needle and which way it moves. */
  charging = false;
  power = 0;
  private dir = 1;
  private held = 0;
  /** Until then (`performance.now()`) a release is on its way to the server and back. */
  private replyBy = 0;
  /** The day's best as the sign shows it, and one waiting for its stone to sink. */
  private best: SkipBest | null = null;
  private pending: { best: SkipBest | null; by: number } | null = null;
  private signOn: Writable | null = null;
  private signText = '';
  /** The line the sign should read (`skipSignText` of `best`), worked out when the best changes. */
  private line = skipSignText(null);
  /** The thrower's counter: seconds left on screen (0 hidden; Infinity while their stone still skips). */
  private counter: HTMLElement;
  private counterLeft = 0;
  /** Staging only: stones stop at this many seconds into their flight (null lets them fly). */
  hold: number | null = null;
  private frozen = false;
  /** The view's yaw that looks out along the stones' bearing. */
  private readonly aim = Math.atan2(-skipDir(0)[0], -skipDir(0)[1]);
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private view: SkipView,
    private host: SkipHost,
    hud: HTMLElement,
  ) {
    const stoneGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.06, 7);
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xb9b2a4, flatShading: true });
    for (let i = 0; i < STONES; i++) {
      const mesh = new THREE.Mesh(stoneGeo, stoneMat);
      mesh.visible = false;
      this.group.add(mesh);
      this.stones.push({ mesh, active: false, id: 0, own: false, n: 0, path: { d: [], t: [], lift: [] }, t: 0, leg: 0, hand: new THREE.Vector3(), px: 0, pz: 0, dx: 0, dz: 1 });
    }
    const ringGeo = new THREE.RingGeometry(0.76, 1, 40).rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      // After the water, like the bobber's ripples (`FX`).
      mesh.renderOrder = 5;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, age: 0, life: 1, max: 1 });
    }
    scene.add(this.group);
    host.warm(this.group);
    this.counter = document.createElement('div');
    this.counter.id = 'skipcount';
    this.counter.className = 'hidden';
    hud.append(this.counter);
  }

  /** The player arrived on a map: no stone of the last one flies here, and the sign is this map's. */
  setMap(map: MapDef): void {
    this.map = map;
    this.cancel();
    for (const s of this.stones) s.active = s.mesh.visible = false;
    for (const r of this.rings) r.mesh.visible = false;
    this.replyBy = 0;
    this.counterLeft = 0;
    this.counter.classList.add('hidden');
    if (this.pending) this.show(this.pending.best);
    this.signOn = null;
  }

  /** True while this player's stone is in the air, or their release is on its way to the server. */
  get busy(): boolean {
    if (performance.now() < this.replyBy) return true;
    for (const s of this.stones) if (s.active && s.own) return true;
    return false;
  }

  /**
   * How far the pile is from a player at (x, z) who can skip a stone now, or null: within reach of it, with no stone
   * of theirs in the air, and looking at it or out over the lake the way the stones fly, within `cone` radians (the
   * prompts' facing rule; `yaw` is the view's). Someone reading the sign beside the pile looks at the sign more than
   * at the pile, and isn't offered it.
   */
  offered(x: number, z: number, yaw: number, cone: number): number | null {
    const camp = this.map?.camp;
    if (!camp || this.charging || this.busy) return null;
    const d = Math.hypot(camp.stones.x - x, camp.stones.z - z);
    if (d > SKIP.reach) return null;
    const off = (tx: number, tz: number) => turn(yaw, Math.atan2(x - tx, z - tz));
    const pile = off(camp.stones.x, camp.stones.z);
    return (pile <= cone && pile <= off(camp.skipSign.x, camp.skipSign.z)) || turn(yaw, this.aim) <= cone ? d : null;
  }

  /** The action went down at the pile: the wind-up begins and the gauge sweeps. */
  begin(): void {
    if (this.charging || this.busy || !this.map?.camp) return;
    this.charging = true;
    this.power = 0;
    this.dir = 1;
    this.held = 0;
  }

  /** The wind-up is dropped without a throw (a menu opened, the player was moved). */
  cancel(): void {
    this.charging = false;
    this.frozen = false;
  }

  /** The action was let go: the stone is thrown from where the gauge stood. */
  release(): void {
    if (!this.charging) return;
    this.charging = this.frozen = false;
    if (this.held < MIN_HOLD) return this.host.toast('Hold to wind up, let go to throw.');
    // The swish and the kick come with the stone (`thrown`): a release the server refuses plays nothing.
    if (this.host.send(this.power)) {
      this.replyBy = performance.now() + REPLY_MS;
      return;
    }
    // Offline the game counts the skips itself, and the sign keeps this visit's best.
    const me = this.host.me();
    const n = skipCount(this.power, Math.random);
    this.thrown(me.id, n, skipSpread(Math.random), me);
    if (beatsBest(n, this.best)) this.setBest({ n, name: me.name }, me.id);
  }

  /**
   * A stone was thrown on this map (the server's word, or offline this player's own): it leaves the hand of player
   * `id`, who stands at `at`, and skips `n` times along the pile's bearing turned by `a`. Another player's avatar
   * plays the throw, and its stone leaves as the arm comes through.
   */
  thrown(id: number, n: number, a: number, at: { x: number; z: number }): void {
    const pile = this.map?.camp?.stones;
    if (!pile) return;
    const own = id === this.host.me().id;
    if (own) {
      this.replyBy = 0;
      this.view.fovKick = 4;
      this.view.pitchKick = -0.02;
      this.host.whoosh();
    } else this.host.pose(id);
    let s = this.stones.find((x) => !x.active);
    if (!s) {
      // Every stone is in the air: the one longest out is taken over, its count and the sign's word settled first.
      s = this.stones.reduce((old, x) => (x.t > old.t ? x : old));
      if (s.leg <= s.n) this.settle(s);
    }
    const [dx, dz] = skipDir(a);
    const path = skipPath(n);
    // The count is the path's own (a count out of range is clamped there), so the stone always reaches its last touch.
    Object.assign(s, { active: true, id, own, n: path.d.length - 1, path, t: own ? 0 : -SKIP_LET_GO, leg: 0, px: pile.x, pz: pile.z, dx, dz });
    // The hand: to the thrower's right and a little ahead of them, as they face down the throw's line.
    s.hand.set(at.x - dz * SKIP_HAND.side + dx * SKIP_HAND.front, standHeight(at.x, at.z) + SKIP_HAND.y, at.z + dx * SKIP_HAND.side + dz * SKIP_HAND.front);
    s.mesh.visible = false;
    if (own) this.count('', false);
  }

  /** The day's best changed (null: a new day): the sign shows it at once, or when the stone of thrower `by` here has sunk. */
  setBest(best: SkipBest | null, by?: number): void {
    if (by !== undefined && this.stones.some((s) => s.active && s.id === by && s.leg <= s.n)) this.pending = { best, by };
    else this.show(best);
  }

  /** Every frame: the gauge, the stones, their rings, the counter and the sign. `ok` is false when the player can't be winding up (a menu, a fish on the line). */
  update(dt: number, ok: boolean): void {
    if (this.charging && !ok) this.cancel();
    if (this.charging) this.wind(dt);
    // Staging: once every stone is held at its moment the rings hold too, so a picture shows them as that moment had them.
    let held = false;
    let flying = false;
    for (const s of this.stones) {
      if (!s.active) continue;
      held = this.hold !== null && (held || !flying) && s.t >= this.hold;
      flying = true;
      this.fly(s, dt);
    }
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      if (!held) r.age += dt;
      const u = r.age / r.life;
      if (u >= 1) r.mesh.visible = false;
      else if (u >= 0) {
        r.mesh.scale.setScalar(0.1 + u * r.max);
        r.mat.opacity = (1 - u) * (1 - u) * 0.9;
        r.mesh.position.y = this.host.surface(r.mesh.position.x, r.mesh.position.z) + 0.05;
      }
    }
    if (this.counterLeft > 0 && this.counterLeft !== Infinity) {
      this.counterLeft -= dt;
      if (this.counterLeft <= 0) this.counter.classList.add('hidden');
    }
    this.drawSign();
  }

  /** The gauge sweeps up and down, and for its first moments the view comes round to look out over the lake. */
  private wind(dt: number): void {
    this.held += dt;
    if (!this.frozen) this.power += this.dir * dt * SKIP.sweep;
    if (this.power >= 1) {
      this.power = 1;
      this.dir = -1;
    }
    if (this.power <= 0) {
      this.power = 0;
      this.dir = 1;
    }
    if (this.held > TURN_SECS) return;
    const k = 1 - Math.exp(-dt * 9);
    const v = this.view;
    v.yaw += Math.atan2(Math.sin(this.aim - v.yaw), Math.cos(this.aim - v.yaw)) * k;
    v.pitch += (TURN_PITCH - v.pitch) * k;
  }

  private fly(s: Stone, dt: number): void {
    s.t = this.hold === null ? s.t + dt : Math.min(s.t + dt, Math.max(s.t, this.hold));
    if (s.t < 0) return;
    const { d, t, lift } = s.path;
    // Each touch passed since the last frame: a ring, a few drops and a plip, and on the last one the stone sinks.
    while (s.leg <= s.n && s.t >= t[s.leg]) this.touch(s, s.leg++);
    const m = s.mesh;
    m.visible = true;
    if (s.leg > s.n) {
      const u = (s.t - t[s.n]) / SKIP.sink;
      if (u >= 1) {
        s.active = m.visible = false;
        return;
      }
      const x = s.px + s.dx * d[s.n];
      const z = s.pz + s.dz * d[s.n];
      m.position.set(x, this.host.surface(x, z) - 0.05 - 0.5 * u, z);
      return;
    }
    const i = s.leg;
    const t0 = i ? t[i - 1] : 0;
    const u = (s.t - t0) / (t[i] - t0);
    const x1 = s.px + s.dx * d[i];
    const z1 = s.pz + s.dz * d[i];
    const x0 = i ? s.px + s.dx * d[i - 1] : s.hand.x;
    const z0 = i ? s.pz + s.dz * d[i - 1] : s.hand.z;
    const x = x0 + (x1 - x0) * u;
    const z = z0 + (z1 - z0) * u;
    const water = this.host.surface(x, z);
    const y0 = i ? water : s.hand.y;
    m.position.set(x, y0 + (water - y0) * u + 4 * lift[i] * u * (1 - u) + 0.03, z);
    // Spinning flat, tipped a little into the throw.
    m.rotation.set(0.18, s.t * 22, 0);
  }

  /** Touch `i` of a stone's flight: a skip, or after its last skip the touch it sinks at. */
  private touch(s: Stone, i: number): void {
    const x = s.px + s.dx * s.path.d[i];
    const z = s.pz + s.dz * s.path.d[i];
    const p = this.tmp.set(x, this.host.surface(x, z), z);
    const me = this.host.me();
    const far = Math.hypot(x - me.x, z - me.z);
    const gain = 1 / (1 + (far / 14) ** 2);
    const last = i === s.n;
    this.ring(p, last ? RING.sink * 0.6 : RING.skip, 0);
    if (last) {
      this.ring(p, RING.sink, 0.14);
      this.host.splash(p, 16, 0.7);
      this.host.plop(gain);
      this.settle(s);
    } else {
      this.host.splash(p, 7, 0.45);
      this.host.plip(gain, 1 + i * 0.05);
      if (s.own) this.count(String(i + 1), false);
    }
  }

  /** A stone's flight is over (it sank, or its place was taken): its thrower reads the final count, and a best it set goes on the sign. */
  private settle(s: Stone): void {
    if (s.own) this.count(s.n ? skipsText(s.n) : 'Plop!', true);
    if (this.pending?.by === s.id) this.show(this.pending.best);
  }

  /** Puts a best on the sign: its line is worked out here, once, and drawn when the sign next looks. */
  private show(best: SkipBest | null): void {
    this.best = best;
    this.pending = null;
    this.line = skipSignText(best);
  }

  private ring(p: THREE.Vector3, max: number, delay: number): void {
    const r = this.rings[this.ringNext++ % RINGS];
    r.mesh.position.set(p.x, p.y + 0.05, p.z);
    r.mesh.scale.setScalar(0.1);
    r.mat.opacity = 0;
    r.mesh.visible = true;
    Object.assign(r, { age: -delay, life: RING.life + max * 0.3, max });
  }

  /** The thrower's counter: each skip's number as it happens, then the final count, which stays a moment. */
  private count(text: string, final: boolean): void {
    const el = this.counter;
    el.textContent = text;
    el.classList.toggle('hidden', !text);
    el.classList.toggle('final', final);
    this.counterLeft = !text ? 0 : final ? COUNT_SECS : Infinity;
    // Each number pops in afresh.
    if (text) el.animate?.(POP, { duration: 220, easing: 'ease-out' });
  }

  /** The sign's second line, redrawn only when it reads differently (or the sign is a new map's). */
  private drawSign(): void {
    const sign = this.host.sign();
    if (sign !== this.signOn) {
      this.signOn = sign;
      // A sign fresh from its builder reads this.
      this.signText = skipSignText(null);
    }
    if (!sign || this.line === this.signText) return;
    this.signText = this.line;
    writeSkipSign(sign.ctx, sign.tex, this.line);
  }

  /** The gauge's needle while winding up, or null. */
  get gauge(): number | null {
    return this.charging ? this.power : null;
  }

  /** Test hook: what is going on. */
  state() {
    return {
      charging: this.charging,
      power: this.power,
      busy: this.busy,
      best: this.best,
      sign: this.signOn ? this.signText : null,
      counter: this.counter.classList.contains('hidden') ? null : this.counter.textContent,
      stones: this.stones.filter((s) => s.active).map((s) => ({ id: s.id, own: s.own, n: s.n, t: +s.t.toFixed(2), skips: Math.min(s.leg, s.n), sunk: s.leg > s.n, x: +s.mesh.position.x.toFixed(2), y: +s.mesh.position.y.toFixed(2), z: +s.mesh.position.z.toFixed(2), seen: s.mesh.visible })),
      rings: this.rings.filter((r) => r.mesh.visible).length,
    };
  }

  /** Test hook, for staging only: winds up to `p` on the gauge and holds it there, or with null lets the gauge sweep on. */
  freeze(p: number | null): void {
    this.frozen = p !== null;
    if (p !== null) this.power = p;
  }
}
