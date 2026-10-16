import * as THREE from 'three';
import type { MapDef, NpcDef, Spot } from '../data/maps';
import { groundHeight } from './env';
import { DARK, WOOD, ball, cyl, mat, rbox, textPlane, woodSign } from './hub';
import type { Circle } from './player';

const rnd = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Seamless-ish cobblestone texture, drawn once. */
function cobbleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6f6556';
  g.fillRect(0, 0, 256, 256);
  const r = rnd(7);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = 150 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${v},${v - 12},${v - 34})`;
      const ox = (y % 2) * 16 + (r() - 0.5) * 4;
      g.beginPath();
      g.roundRect(x * 32 + ox + 2, y * 32 + 2, 28, 28, 9);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface TownNpc {
  def: NpcDef;
  pos: THREE.Vector3;
  next: number;
}

export interface TownBottle {
  id: string;
  note: string;
  pos: THREE.Vector3;
}

/** Cottages, cobbled streets, townsfolk and hidden bottles around the shop. */
export class Town {
  readonly group = new THREE.Group();
  readonly colliders: Circle[] = [];
  readonly npcs: TownNpc[] = [];
  readonly bottles: TownBottle[] = [];
  private bottleMeshes = new Map<string, THREE.Object3D>();
  private windowMat = new THREE.MeshBasicMaterial({ color: 0x6d7f8c });
  private smoke: { m: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  private heads: { head: THREE.Object3D; body: THREE.Object3D; pos: THREE.Vector3; yaw: number }[] = [];
  private cobble = cobbleTexture();
  private foundKey = '';

  constructor(private map: MapDef) {
    const t = map.town;
    this.buildStreets();
    this.buildSquare(t.square);
    t.houses.forEach((h, i) => this.buildHouse(h, i));
    t.npcs.forEach((n) => this.buildNpc(n));
    t.racks.forEach((r) => this.buildRack(r));
    t.boats.forEach((b) => this.buildBoat(b));
    t.flowers.forEach((f) => this.buildFlowers(f));
    this.buildFences();
    this.buildBottles();
  }

  private at(obj: THREE.Object3D, x: number, z: number, facing = 0, y?: number): void {
    obj.position.set(x, y ?? groundHeight(x, z), z);
    obj.rotation.y = facing;
    this.group.add(obj);
  }

  private solid(x: number, z: number, r: number): void {
    this.colliders.push({ x, z, r });
  }

  /** Flat cobbled strip between two points, laid just above the ground. */
  private path(ax: number, az: number, bx: number, bz: number, w: number): void {
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 2.2), uv.getY(i) * (len / 2.2));
    const m = new THREE.Mesh(geo, mat(0xffffff, { map: this.cobble, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    m.position.set(mx, groundHeight(mx, mz) + 0.03, mz);
    m.rotation.y = Math.atan2(bx - ax, bz - az);
    this.group.add(m);
  }

  private buildStreets(): void {
    const t = this.map.town;
    this.path(0, 11, 0, this.map.gate.z - 2.5, 4.4);
    for (const h of t.houses) {
      const fx = h.x + Math.sin(h.facing) * 3.1;
      const fz = h.z + Math.cos(h.facing) * 3.1;
      this.path(fx, fz, fx > 0 ? 1.5 : -1.5, fz, 1.6);
    }
    // Spur to the fund board and the campfire cove
    this.path(-1.5, this.map.board.z, -4.5, this.map.board.z, 1.6);
    this.path(-2, this.map.campfire.z + 1, this.map.campfire.x + 1.5, this.map.campfire.z + 1, 1.6);
  }

  private buildSquare(s: { x: number; z: number; r: number }): void {
    const geo = new THREE.CircleGeometry(s.r, 40).rotateX(-Math.PI / 2);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * (s.r * 2) / 2.2, (uv.getY(i) - 0.5) * (s.r * 2) / 2.2);
    const disc = new THREE.Mesh(geo, mat(0xffffff, { map: this.cobble, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    disc.receiveShadow = true;
    this.at(disc, s.x, s.z, 0, groundHeight(s.x, s.z) + 0.035);

    // Well
    const well = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.9, 16), mat(0x9a948a));
    wall.position.y = 0.45;
    wall.castShadow = wall.receiveShadow = true;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.85, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x17394a }));
    water.position.y = 0.8;
    well.add(wall, water);
    for (const sx of [-1, 1]) {
      const post = cyl(0.07, 0.07, 1.9, DARK, 8);
      post.position.set(sx * 0.9, 1.45, 0);
      well.add(post);
    }
    const beam = cyl(0.06, 0.06, 2.0, WOOD, 8);
    beam.rotation.z = Math.PI / 2;
    beam.position.y = 2.3;
    const roofL = rbox(1.3, 0.07, 1.5, 0x8a3b32, 0.02);
    roofL.rotation.z = 0.7;
    roofL.position.set(-0.55, 2.55, 0);
    const roofR = roofL.clone();
    roofR.rotation.z = -0.7;
    roofR.position.x = 0.55;
    const bucket = cyl(0.14, 0.11, 0.2, WOOD, 10);
    bucket.position.set(0, 1.55, 0);
    well.add(beam, roofL, roofR, bucket);
    this.at(well, s.x, s.z);
    this.solid(s.x, s.z, 1.3);
    this.benches(s);
  }

  private benches(s: { x: number; z: number; r: number }): void {
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      const b = new THREE.Group();
      const seat = rbox(1.7, 0.1, 0.45, WOOD, 0.03);
      seat.position.y = 0.5;
      const back = rbox(1.7, 0.4, 0.07, WOOD, 0.03);
      back.position.set(0, 0.8, -0.22);
      for (const sx of [-0.7, 0.7]) {
        const leg = rbox(0.08, 0.5, 0.4, DARK, 0.02);
        leg.position.set(sx, 0.25, 0);
        b.add(leg);
      }
      b.add(seat, back);
      const x = s.x + Math.sin(a) * (s.r - 0.9);
      const z = s.z + Math.cos(a) * (s.r - 0.9);
      this.at(b, x, z, a + Math.PI);
      this.solid(x, z, 0.8);
    }
  }

  private buildHouse(h: MapDef['town']['houses'][number], i: number): void {
    const g = new THREE.Group();
    const W = 5;
    const D = 4.2;
    const H = 2.5;
    const rise = 1.5;
    const shape = new THREE.Shape();
    shape.moveTo(-D / 2, 0);
    shape.lineTo(D / 2, 0);
    shape.lineTo(D / 2, H);
    shape.lineTo(0, H + rise);
    shape.lineTo(-D / 2, H);
    shape.closePath();
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false }).translate(0, 0, -W / 2).rotateY(Math.PI / 2);
    // After rotation the gable faces +x/-x and the long walls face +z/-z.
    const walls = new THREE.Mesh(wallGeo, mat(h.wall));
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);

    const slope = Math.atan2(rise, D / 2);
    const rl = Math.hypot(D / 2, rise) + 0.35;
    for (const s of [-1, 1]) {
      const r = rbox(W + 0.5, 0.12, rl, h.roof, 0.03);
      r.position.set(0, H + rise / 2 + 0.07, s * (D / 4));
      r.rotation.x = s * slope;
      g.add(r);
    }
    const beamTop = rbox(W + 0.55, 0.12, 0.2, DARK, 0.03);
    beamTop.position.y = H + rise + 0.08;
    g.add(beamTop);

    // Door and windows on the +z face (the side facing the street)
    const door = rbox(0.95, 1.75, 0.12, 0x5b3a22, 0.03);
    door.position.set(0, 0.88, D / 2 + 0.03);
    const knob = ball(0.045, 0xe3c26d);
    knob.position.set(0.3, 0.9, D / 2 + 0.1);
    const step = rbox(1.5, 0.15, 0.6, 0x8d877c, 0.03);
    step.position.set(0, 0.07, D / 2 + 0.3);
    g.add(door, knob, step);
    for (const sx of [-1.65, 1.65]) {
      const frame = rbox(0.95, 0.85, 0.1, 0xf3ead2, 0.02);
      frame.position.set(sx, 1.45, D / 2 + 0.03);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.62), this.windowMat);
      pane.position.set(sx, 1.45, D / 2 + 0.1);
      const bar = rbox(0.05, 0.64, 0.02, 0xf3ead2, 0.01);
      bar.position.set(sx, 1.45, D / 2 + 0.11);
      const sill = rbox(1.1, 0.08, 0.28, 0x6b4a2b, 0.02);
      sill.position.set(sx, 1.0, D / 2 + 0.14);
      const box = rbox(0.9, 0.16, 0.22, 0x7a5a38, 0.02);
      box.position.set(sx, 1.12, D / 2 + 0.2);
      g.add(frame, pane, bar, sill, box);
      for (let k = 0; k < 4; k++) {
        const f = ball(0.07, [0xff6f91, 0xffd23a, 0xffffff, 0xc77dff][(k + i) % 4]);
        f.position.set(sx - 0.33 + k * 0.22, 1.24, D / 2 + 0.22);
        g.add(f);
      }
    }
    // Porch lantern
    const lamp = ball(0.1, 0xffd27a);
    (lamp.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
    lamp.position.set(0.85, 1.95, D / 2 + 0.2);
    this.lamps.push(lamp.material as THREE.MeshLambertMaterial);
    g.add(lamp);
    // Chimney
    const chim = rbox(0.55, 1.6, 0.55, 0x8d6e63, 0.03);
    chim.position.set(-1.4, H + 1.0, -0.6);
    g.add(chim);
    this.at(g, h.x, h.z, h.facing);
    const sin = Math.sin(h.facing);
    const cos = Math.cos(h.facing);
    const wx = h.x + -1.4 * cos + -0.6 * sin;
    const wz = h.z - -1.4 * sin + -0.6 * cos;
    const wy = groundHeight(h.x, h.z) + H + 1.9;
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdadada, transparent: true, opacity: 0.5, depthWrite: false }));
      this.group.add(m);
      this.smoke.push({ m, base: new THREE.Vector3(wx, wy, wz), ph: k / 4 });
    }

    // Collision: footprint circles in local space
    for (const lx of [-1.8, 0, 1.8]) {
      for (const lz of [-1.0, 1.0]) {
        this.solid(h.x + lx * cos + lz * sin, h.z - lx * sin + lz * cos, 1.25);
      }
    }

    if (h.sign) {
      const s = textPlane(1.3, 0.34, 384);
      woodSign(s.ctx, h.sign);
      s.tex.needsUpdate = true;
      const x = h.x + -2.9 * cos + 2.6 * sin;
      const z = h.z - -2.9 * sin + 2.6 * cos;
      const post = cyl(0.04, 0.04, 2.2, DARK, 6);
      this.at(post, x, z, h.facing, groundHeight(x, z) + 1.1);
      for (const [ry, oz] of [[0, 0.06], [Math.PI, -0.06]]) {
        const face = s.mesh.clone();
        face.rotation.y = ry;
        face.position.set(0, 0.55, oz);
        post.add(face);
      }
    }
  }
  private lamps: THREE.MeshLambertMaterial[] = [];

  private buildNpc(def: NpcDef): void {
    const p = new THREE.Group();
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 8, 14), mat(def.coat));
    torso.position.y = 1.0;
    torso.castShadow = true;
    const head = new THREE.Group();
    head.position.y = 1.75;
    head.add(ball(0.22, 0xe0b08a));
    for (const sx of [-1, 1]) {
      const eye = ball(0.028, 0x1b1b1b);
      eye.position.set(sx * 0.08, 0.04, 0.19);
      head.add(eye);
    }
    const nose = ball(0.04, 0xd49b78);
    nose.position.set(0, -0.02, 0.21);
    head.add(nose);
    if (def.hat !== undefined) {
      const brim = cyl(0.34, 0.34, 0.035, def.hat, 20);
      brim.position.y = 0.17;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(def.hat));
      dome.position.y = 0.17;
      head.add(brim, dome);
    } else {
      const hair = ball(0.23, 0x6b4a2b, 1, 0.7, 1);
      hair.position.set(0, 0.1, -0.03);
      head.add(hair);
    }
    body.add(torso, head);
    for (const sx of [-1, 1]) {
      const arm = cyl(0.07, 0.07, 0.6, def.coat, 8);
      arm.position.set(sx * 0.36, 1.05, 0.05);
      arm.rotation.z = sx * 0.12;
      body.add(arm);
    }
    p.add(body);
    this.at(p, def.x, def.z, def.facing);
    this.solid(def.x, def.z, 0.5);
    const pos = p.position.clone();
    this.npcs.push({ def, pos, next: 0 });
    this.heads.push({ head, body, pos, yaw: def.facing });
  }

  private buildRack(s: Spot): void {
    const g = new THREE.Group();
    for (const sx of [-1.4, 1.4]) {
      const post = cyl(0.06, 0.07, 1.9, DARK, 6);
      post.position.set(sx, 0.95, 0);
      g.add(post);
    }
    for (const y of [1.2, 1.8]) {
      const bar = cyl(0.04, 0.04, 3, WOOD, 6);
      bar.rotation.z = Math.PI / 2;
      bar.position.y = y;
      g.add(bar);
    }
    const cols = [0xc9a0a0, 0xa9b9c9, 0xd9c28a, 0xb0c4a0];
    for (let i = 0; i < 6; i++) {
      const f = ball(0.11, cols[i % 4], 0.5, 1.6, 0.3);
      f.position.set(-1.1 + i * 0.44, i % 2 ? 1.65 : 1.0, 0);
      g.add(f);
    }
    this.at(g, s.x, s.z, s.facing);
    this.solid(s.x - 1.1, s.z, 0.4);
    this.solid(s.x + 1.1, s.z, 0.4);
  }

  private buildBoat(s: Spot): void {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x7a4a2b, { side: THREE.DoubleSide }));
    hull.scale.set(0.8, 0.55, 2.2);
    hull.rotation.x = Math.PI;
    hull.position.y = 0.55;
    hull.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 24), mat(0xd9b88a));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(0.8, 2.2, 1);
    rim.position.y = 0.55;
    const oar = cyl(0.03, 0.03, 2, WOOD, 6);
    oar.rotation.set(0.1, 0, 1.3);
    oar.position.set(0.5, 0.75, 0.2);
    g.add(hull, rim, oar);
    this.at(g, s.x, s.z, s.facing);
    for (const lz of [-1.3, 0, 1.3]) {
      this.solid(s.x + Math.sin(s.facing) * lz, s.z + Math.cos(s.facing) * lz, 0.8);
    }
  }

  private buildFlowers(f: { x: number; z: number; w: number; d: number }): void {
    const r = rnd(Math.floor(f.x * 7 + f.z * 13 + 100));
    const bed = rbox(f.w, 0.18, f.d, 0x6b4a2b, 0.04);
    this.at(bed, f.x, f.z, 0, groundHeight(f.x, f.z) + 0.09);
    const cols = [0xff6f91, 0xffd23a, 0xffffff, 0xc77dff, 0xff9a3c];
    const n = Math.round(f.w * f.d * 9);
    for (let i = 0; i < n; i++) {
      const x = f.x + (r() - 0.5) * (f.w - 0.2);
      const z = f.z + (r() - 0.5) * (f.d - 0.2);
      const stem = cyl(0.015, 0.015, 0.3, 0x3f8f43, 4);
      this.at(stem, x, z, 0, groundHeight(x, z) + 0.28);
      const bloom = ball(0.07, cols[Math.floor(r() * cols.length)]);
      bloom.position.y = 0.17;
      stem.add(bloom);
    }
  }

  private buildFences(): void {
    // A picket fence along each side of the main street's northern stretch and in front of the end cottages.
    const run = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / 0.8);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n;
        const z = z0 + ((z1 - z0) * i) / n;
        const p = rbox(0.1, 0.8, 0.06, 0xf3ead2, 0.02);
        this.at(p, x, z, ang, groundHeight(x, z) + 0.4);
      }
      for (const y of [0.3, 0.6]) {
        const rail = rbox(0.05, 0.06, len, 0xe3d9bf, 0.01);
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        this.at(rail, mx, mz, ang, groundHeight(mx, mz) + y);
      }
      for (let d = 0; d <= len; d += 1.8) {
        this.solid(x0 + ((x1 - x0) * d) / len, z0 + ((z1 - z0) * d) / len, 0.3);
      }
    };
    run(-3.6, 36.5, -3.6, 47);
    run(3.6, 36.5, 3.6, 47);
    run(-3.6, 47, -6.3, 47);
    run(3.6, 47, 6.3, 47);
  }

  private buildBottles(): void {
    for (const b of this.map.town.bottles) {
      const g = new THREE.Group();
      const glass = new THREE.MeshStandardMaterial({ color: 0x8fe0d0, emissive: 0x2fa38f, emissiveIntensity: 0.9, transparent: true, opacity: 0.8, roughness: 0.2 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 10), glass);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 0.14, 10), glass);
      neck.position.y = 0.2;
      const cork = cyl(0.045, 0.045, 0.06, 0xb98a55, 8);
      cork.position.y = 0.3;
      const scroll = cyl(0.04, 0.04, 0.2, 0xf3e6c8, 6);
      g.add(body, neck, cork, scroll);
      g.rotation.z = Math.PI / 2.4;
      const holder = new THREE.Group();
      holder.add(g);
      const glow = new THREE.PointLight(0x7fffe0, 0.8, 4, 2);
      glow.position.y = 0.3;
      holder.add(glow);
      const onDock = b.z < 0;
      holder.position.set(b.x, onDock ? 0.95 : groundHeight(b.x, b.z) + 0.2, b.z);
      this.group.add(holder);
      this.bottleMeshes.set(b.id, holder);
      this.bottles.push({ id: b.id, note: b.note, pos: new THREE.Vector3(b.x, 0, b.z) });
    }
  }

  /** Shows only the bottles that haven't been found yet. */
  setFound(ids: string[]): void {
    const key = ids.join(',');
    if (key === this.foundKey) return;
    this.foundKey = key;
    for (const [id, m] of this.bottleMeshes) m.visible = !ids.includes(id);
  }

  /** Windows and porch lamps warm up at night (0 = day, 1 = night). */
  setNight(n: number): void {
    this.windowMat.color.set(0x6d7f8c).lerp(new THREE.Color(0xffc266), n);
    for (const m of this.lamps) m.emissiveIntensity = 0.2 + 1.6 * n;
  }

  /** The line this townsperson says next. */
  talk(npc: TownNpc, night: boolean): string {
    const lines = night && npc.def.nightLines ? [...npc.def.nightLines, ...npc.def.lines] : npc.def.lines;
    const line = lines[npc.next % lines.length];
    npc.next++;
    return `${npc.def.name}: "${line}"`;
  }

  update(t: number, px: number, pz: number): void {
    for (const s of this.smoke) {
      const k = (t * 0.18 + s.ph) % 1;
      s.m.position.set(s.base.x + k * 0.9 + Math.sin(t + s.ph * 6) * 0.1, s.base.y + k * 2.4, s.base.z);
      s.m.scale.setScalar(0.5 + k * 1.2);
      (s.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    }
    for (const h of this.heads) {
      const dx = px - h.pos.x;
      const dz = pz - h.pos.z;
      if (Math.hypot(dx, dz) < 7) {
        let a = Math.atan2(dx, dz) - h.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        h.head.rotation.y += (THREE.MathUtils.clamp(a, -1, 1) - h.head.rotation.y) * 0.1;
      } else h.head.rotation.y *= 0.95;
      h.body.position.y = Math.sin(t * 1.5 + h.pos.x) * 0.01;
    }
    for (const [, m] of this.bottleMeshes) {
      if (!m.visible) continue;
      m.children[0].rotation.y = t * 0.8;
      m.children[0].position.y = Math.sin(t * 2 + m.position.x) * 0.04;
    }
  }
}
