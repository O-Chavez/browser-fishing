import * as THREE from 'three';
import { DEEP_SEA_LINE } from '../data/content';

/** The Deep Sea Line's colour, on the Deep Sea Rod's spool. */
const DEEP_SEA_BLUE = DEEP_SEA_LINE.color;

class Spring {
  vel = 0;
  t: number;
  constructor(public v: number) {
    this.t = v;
  }
  step(dt: number, k: number, c: number): void {
    this.vel += (k * (this.t - this.v) - c * this.vel) * dt;
    this.v += this.vel * dt;
  }
}

export interface Pose {
  pitch?: number;
  yaw?: number;
  bendP?: number;
  bendY?: number;
  k?: number;
  c?: number;
}

type Axis = 'pitch' | 'yaw' | 'bendP' | 'bendY';

const SEGMENTS = 8;
const SEG_LEN = 0.33;

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
const shiny = (color: number) => new THREE.MeshPhongMaterial({ color, shininess: 60, specular: 0x666666 });

/** Which rod is in hand: one of the pond's (one model, coloured by tier) or the Deep Sea Rod at sea. */
export type RigKind = 'pond' | 'sea';

/** One rod model: its parts, the bending sections from butt to tip, and the tip the line hangs from. */
interface Build {
  group: THREE.Group;
  segs: THREE.Group[];
  tip: THREE.Object3D;
  crank: THREE.Group;
  /** Where the rod sits in view (the sea rod is longer and held further out, so its reel shows). */
  at: THREE.Vector3;
  /** A soft light around the tip of a levelled rod, growing with each glow step, and a bright dot in it. */
  halo: THREE.Mesh;
  glow: THREE.Mesh;
}

const HALO = () =>
  new THREE.Mesh(
    new THREE.SphereGeometry(0.045, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  );

/** Deep Sea Rod colours: a navy blank with sea-teal wraps, brass fittings, and the Deep Sea Line's blue on the spool. */
const SEA = { blank: [0x2f4a80, 0x36548f], grip: 0x263354, wrap: 0x3fc7b4, brass: 0xd9a441, brassDark: 0xa87a2c, insert: 0xf4efe6, lever: 0xe5533d, knob: 0xf2e6c8 };
const SEA_SEG_LEN = 0.45;
/** The sea rod's blank: radius at the butt, and how much it tapers to the tip. */
const SEA_R = 0.03;
const SEA_TAPER = 0.65;
/** The reel's spool radius when empty and full; `setSpool` moves between them. */
const SPOOL_EMPTY = 0.034;
const SPOOL_FULL = 0.068;
const REEL_SCALE = 0.75;

/** First-person fishing rod that bends and swings with spring physics. */
export class Rig {
  readonly root = new THREE.Group();
  private pivot = new THREE.Group();
  private builds: Record<RigKind, Build>;
  private kind: RigKind = 'pond';
  private b: Build;
  private spool!: THREE.Mesh;
  private s: Record<Axis, Spring> = {
    pitch: new Spring(0.55),
    yaw: new Spring(0),
    bendP: new Spring(0.1),
    bendY: new Spring(0),
  };
  private k = 60;
  private c = 10;
  private reelSpeed = 0;
  private t = 0;
  /** The pond rod's grip band in its tier colour. */
  private accent = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  /** The last glow step cycles through the rainbow (see `update`). */
  private rainbow = false;

  constructor() {
    this.root.add(this.pivot);
    this.pivot.rotation.order = 'YXZ';
    this.builds = { pond: this.buildPond(), sea: this.buildSea() };
    this.builds.sea.group.visible = false;
    this.b = this.builds.pond;
    this.root.position.copy(this.b.at);
  }

  /** The rod tip, where the line leaves the rod. */
  get tip(): THREE.Object3D {
    return this.b.tip;
  }

  /** A bending blank of `SEGMENTS` sections under `parent`, each nested in the last, ending in a tip. */
  private blank(parent: THREE.Object3D, start: number, len: number, radius: (i: number) => number, color: (i: number) => number, extras?: (seg: THREE.Group, i: number) => void) {
    const segs: THREE.Group[] = [];
    let at = parent;
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? start : -len;
      const geo = new THREE.CylinderGeometry(radius(i + 1), radius(i), len, 8).rotateX(-Math.PI / 2).translate(0, 0, -len / 2);
      seg.add(new THREE.Mesh(geo, lambert(color(i))));
      extras?.(seg, i);
      at.add(seg);
      segs.push(seg);
      at = seg;
    }
    const tip = new THREE.Object3D();
    tip.position.z = -len;
    at.add(tip);
    return { segs, tip };
  }

  private buildPond(): Build {
    const group = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 8).rotateX(Math.PI / 2), lambert(0xb98a52));
    group.add(handle);

    const reel = new THREE.Group();
    reel.position.set(0, -0.06, -0.02);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateZ(Math.PI / 2), lambert(0x9aa3ad));
    const crank = new THREE.Group();
    crank.position.set(0.035, 0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.01), lambert(0x333333));
    arm.position.y = 0.03;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), lambert(0xd33));
    knob.position.y = 0.065;
    crank.add(arm, knob);
    reel.add(body, crank);
    group.add(reel);

    const { segs, tip } = this.blank(group, -0.25, SEG_LEN, (i) => 0.017 * (1 - (i / SEGMENTS) * 0.8), (i) => (i % 2 ? 0x22262e : 0x15171c));
    this.accent.position.z = -0.12;
    group.add(this.accent);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const halo = HALO();
    glow.visible = halo.visible = false;
    tip.add(glow, halo);
    this.pivot.add(group);
    return { group, segs, tip, crank, at: new THREE.Vector3(0.24, -0.3, -0.35), glow, halo };
  }

  /**
   * The Deep Sea Rod: a big-game boat rod, longer than the pond's, with a gimbal butt, a brass lever reel on top
   * where it shows in first person, and loop guides along the top with the line threaded through them.
   */
  private buildSea(): Build {
    const group = new THREE.Group();
    const brass = shiny(SEA.brass);
    const brassDark = shiny(SEA.brassDark);
    const grip = lambert(SEA.grip);
    const tube = (r0: number, r1: number, len: number, mat: THREE.Material, z: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 12).rotateX(-Math.PI / 2), mat);
      m.position.z = z;
      group.add(m);
    };
    tube(0.036, 0.036, 0.5, grip, 0.33); // butt
    tube(0.042, 0.04, 0.07, brass, 0.6); // gimbal cap
    tube(0.04, 0.04, 0.16, brass, 0); // reel seat
    tube(0.036, 0.032, 0.26, grip, -0.21); // foregrip
    tube(0.036, 0.036, 0.03, lambert(SEA.wrap), -0.35);

    // The lever reel, on top of the seat. The spool shows the line left (`setSpool`).
    const reel = new THREE.Group();
    reel.position.set(0, 0.04 + 0.075 * REEL_SCALE, 0);
    reel.scale.setScalar(REEL_SCALE);
    for (const x of [-0.058, 0.058]) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.016, 20).rotateZ(Math.PI / 2), brass);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 24).rotateY(Math.PI / 2), brassDark);
      plate.position.x = rim.position.x = x;
      reel.add(plate, rim);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(SPOOL_EMPTY - 0.002, SPOOL_EMPTY - 0.002, 0.1, 14).rotateZ(Math.PI / 2), lambert(SEA.grip));
    this.spool = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.098, 20).rotateZ(Math.PI / 2), lambert(DEEP_SEA_BLUE));
    reel.add(core, this.spool);
    for (const [y, z] of [[0.05, -0.05], [-0.05, -0.05], [0, 0.07]]) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.116, 6).rotateZ(Math.PI / 2), brassDark);
      bar.position.set(0, y, z);
      reel.add(bar);
    }
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.1), brassDark);
    foot.position.y = -0.07;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.08, 0.02), lambert(SEA.lever));
    lever.position.set(0.072, 0.05, 0.035);
    lever.rotation.x = -0.7;
    reel.add(foot, lever);
    const crank = new THREE.Group();
    crank.position.set(0.075, 0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.1, 0.02), brassDark);
    arm.position.y = 0.045;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.045, 10).rotateZ(Math.PI / 2), lambert(SEA.knob));
    knob.position.set(0.022, 0.09, 0);
    crank.add(arm, knob);
    reel.add(crank);
    group.add(reel);
    this.setSpool(1);

    // A loop guide on top of each section, shrinking toward the tip, and the line running through them from the spool.
    const radius = (i: number) => SEA_R * (1 - (i / SEGMENTS) * SEA_TAPER);
    const guide = (i: number) => {
      const r = radius(i);
      const h = 0.03 * (1 - (i / SEGMENTS) * 0.55);
      const ring = 0.028 * (1 - (i / SEGMENTS) * 0.6);
      return { r, h, ring, y: r + h + ring, z: -SEA_SEG_LEN * 0.55 };
    };
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
    const line = (seg: THREE.Group, a: THREE.Vector3, b: THREE.Vector3) => seg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMat));
    const wrapMat = lambert(SEA.wrap);
    const insertMat = lambert(SEA.insert);
    const start = -0.36;
    const { segs, tip } = this.blank(group, start, SEA_SEG_LEN, radius, (i) => SEA.blank[i % 2], (seg, i) => {
      const g = guide(i);
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(g.r * 1.18, g.r * 1.18, 0.07, 10).rotateX(Math.PI / 2), wrapMat);
      wrap.position.z = g.z;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(g.ring, Math.max(0.0035, g.ring * 0.16), 6, 16), brass);
      loop.position.set(0, g.y, g.z);
      const insert = new THREE.Mesh(new THREE.TorusGeometry(g.ring * 0.8, Math.max(0.002, g.ring * 0.08), 4, 16), insertMat);
      insert.position.copy(loop.position);
      seg.add(wrap, loop, insert);
      const legLen = g.h + g.ring * 0.4;
      for (const dz of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.006, legLen, 0.006), brass);
        leg.position.set(0, g.r + legLen / 2, g.z + dz * 0.014);
        leg.rotation.x = dz * 0.45;
        seg.add(leg);
      }
      const here = new THREE.Vector3(0, g.y, g.z);
      // The first stretch starts at the top of the spool, in this section's frame.
      if (i === 0) line(seg, new THREE.Vector3(0, reel.position.y + SPOOL_FULL * REEL_SCALE, -start), here);
      line(seg, here, i + 1 < SEGMENTS ? new THREE.Vector3(0, guide(i + 1).y, -SEA_SEG_LEN + guide(i + 1).z) : new THREE.Vector3(0, 0.02, -SEA_SEG_LEN));
    });
    // A roller tip-top, where the level glow sits.
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.034, 12).rotateZ(Math.PI / 2), brass);
    roller.position.y = 0.012;
    const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.03, 0.03), brass);
    cheek.position.set(0, 0.005, 0.012);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const halo = HALO();
    glow.position.y = halo.position.y = 0.012;
    glow.visible = halo.visible = false;
    tip.add(roller, cheek, glow, halo);
    this.pivot.add(group);
    return { group, segs, tip, crank, at: new THREE.Vector3(0.28, -0.31, -0.6), glow, halo };
  }

  /** Swaps the rod in hand: a pond rod, or the Deep Sea Rod from Reed's boat at sea. */
  setKind(kind: RigKind): void {
    if (kind === this.kind) return;
    this.kind = kind;
    this.builds.pond.group.visible = kind === 'pond';
    this.builds.sea.group.visible = kind === 'sea';
    this.b = this.builds[kind];
    this.root.position.copy(this.b.at);
  }

  /** How full the Deep Sea Rod's spool looks, 0-1: the charter's line left. */
  setSpool(fill: number): void {
    const r = SPOOL_EMPTY + (SPOOL_FULL - SPOOL_EMPTY) * Math.max(0, Math.min(1, fill));
    this.spool.scale.set(1, r, r);
  }

  /**
   * The rod's look. A pond rod's grip band takes the gear tier's colour, and high tiers get a glowing tip. `step` is
   * the Deep Sea Rod's glow step (one per 5 rod levels, `GLOW_STEPS`): from 1 on its tip gets a halo that grows with
   * it, in `color`; null is the rainbow.
   */
  setLook(color: number | null, tier: number, step = 0): void {
    this.rainbow = color === null;
    for (const m of this.glowMeshes()) (m.material as THREE.MeshBasicMaterial).color.setHex(color ?? 0xffffff);
    const b = this.b;
    this.accent.visible = tier > 1;
    b.glow.visible = this.kind === 'sea' ? step > 0 : tier >= 4;
    b.halo.visible = step > 0;
    b.halo.scale.setScalar((this.kind === 'sea' ? 1.3 : 1) * (1 + 0.3 * Math.max(0, Math.min(step - 1, 5))));
  }

  private glowMeshes(): THREE.Mesh[] {
    return this.kind === 'pond' ? [this.accent, this.b.glow, this.b.halo] : [this.b.glow, this.b.halo];
  }

  pose(p: Pose): void {
    if (p.pitch !== undefined) this.s.pitch.t = p.pitch;
    if (p.yaw !== undefined) this.s.yaw.t = p.yaw;
    if (p.bendP !== undefined) this.s.bendP.t = p.bendP;
    if (p.bendY !== undefined) this.s.bendY.t = p.bendY;
    if (p.k !== undefined) this.k = p.k;
    if (p.c !== undefined) this.c = p.c;
  }

  kick(axis: Axis, v: number): void {
    this.s[axis].vel += v;
  }

  /** Turns the reel's crank at this speed (radians a second); it slows on its own when not kept up. */
  spin(speed: number): void {
    this.reelSpeed = speed;
  }

  update(dt: number): void {
    this.t += dt;
    const steps = Math.max(1, Math.ceil(dt / 0.006));
    for (let i = 0; i < steps; i++) for (const a of Object.values(this.s)) a.step(dt / steps, this.k, this.c);

    const lag = Math.max(-1, Math.min(1, this.s.pitch.vel * 0.09));
    const bend = this.s.bendP.v + lag;
    const idle = Math.sin(this.t * 1.3) * 0.012;
    this.pivot.rotation.set(this.s.pitch.v + idle, this.s.yaw.v, 0);

    const sum = (SEGMENTS * (SEGMENTS + 1)) / 2;
    this.b.segs.forEach((seg, i) => {
      const w = (i + 1) / sum;
      seg.rotation.x = -bend * w;
      seg.rotation.y = this.s.bendY.v * w;
    });

    this.b.crank.rotation.x += this.reelSpeed * dt;
    this.reelSpeed *= Math.exp(-4 * dt);

    if (this.rainbow) for (const m of this.glowMeshes()) (m.material as THREE.MeshBasicMaterial).color.setHSL((this.t * 0.12) % 1, 0.85, 0.62);
  }
}

/** Thin fishing line drawn between two points with adjustable sag. */
export class LineRenderer {
  readonly line: THREE.Line;
  private pts = 28;
  private attr: THREE.BufferAttribute;

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(this.pts * 3), 3);
    geo.setAttribute('position', this.attr);
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
  }

  update(a: THREE.Vector3, b: THREE.Vector3, sag: number, sway = 0, t = 0): void {
    for (let i = 0; i < this.pts; i++) {
      const u = i / (this.pts - 1);
      const s = 4 * u * (1 - u);
      this.attr.setXYZ(
        i,
        a.x + (b.x - a.x) * u + Math.sin(t * 3 + u * 6) * sway * s,
        a.y + (b.y - a.y) * u - sag * s,
        a.z + (b.z - a.z) * u,
      );
    }
    this.attr.needsUpdate = true;
  }
}
