import * as THREE from 'three';

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

/** First-person fishing rod that bends and swings with spring physics. */
export class Rig {
  readonly root = new THREE.Group();
  readonly tip = new THREE.Object3D();
  private pivot = new THREE.Group();
  private segs: THREE.Group[] = [];
  private crank = new THREE.Group();
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

  constructor() {
    this.root.position.set(0.24, -0.3, -0.35);
    this.root.add(this.pivot);
    this.pivot.rotation.order = 'YXZ';

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.5, 8).rotateX(Math.PI / 2), lambert(0xb98a52));
    this.pivot.add(handle);

    const reel = new THREE.Group();
    reel.position.set(0, -0.06, -0.02);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateZ(Math.PI / 2), lambert(0x9aa3ad));
    this.crank.position.set(0.035, 0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.07, 0.01), lambert(0x333333));
    arm.position.y = 0.03;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), lambert(0xd33));
    knob.position.y = 0.065;
    this.crank.add(arm, knob);
    reel.add(body, this.crank);
    this.pivot.add(reel);

    let parent: THREE.Object3D = this.pivot;
    for (let i = 0; i < SEGMENTS; i++) {
      const seg = new THREE.Group();
      seg.position.z = i === 0 ? -0.25 : -SEG_LEN;
      const r0 = 0.017 * (1 - (i / SEGMENTS) * 0.8);
      const r1 = 0.017 * (1 - ((i + 1) / SEGMENTS) * 0.8);
      const geo = new THREE.CylinderGeometry(r1, r0, SEG_LEN, 6).rotateX(-Math.PI / 2).translate(0, 0, -SEG_LEN / 2);
      seg.add(new THREE.Mesh(geo, lambert(i % 2 ? 0x22262e : 0x15171c)));
      parent.add(seg);
      this.segs.push(seg);
      parent = seg;
    }
    this.tip.position.z = -SEG_LEN;
    parent.add(this.tip);
    this.accent.position.z = -0.12;
    this.pivot.add(this.accent);
    this.glow.visible = false;
    this.tip.add(this.glow);
  }

  private accent = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  private glow = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));

  /** Colors the rod's grip band by gear tier; high tiers also get a glowing tip. */
  setLook(color: number, tier: number): void {
    (this.accent.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.accent.visible = tier > 1;
    (this.glow.material as THREE.MeshBasicMaterial).color.setHex(color);
    this.glow.visible = tier >= 4;
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
    this.segs.forEach((seg, i) => {
      const w = (i + 1) / sum;
      seg.rotation.x = -bend * w;
      seg.rotation.y = this.s.bendY.v * w;
    });

    this.crank.rotation.x += this.reelSpeed * dt;
    this.reelSpeed *= Math.exp(-4 * dt);
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
