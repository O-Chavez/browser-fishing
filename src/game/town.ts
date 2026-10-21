import * as THREE from 'three';
import type { MapDef, NpcDef, Spot } from '../data/maps';
import { groundHeight } from './env';
import { DARK, WOOD, ball, cyl, mat, rbox, textPlane, woodSign } from './hub';
import { mergeStatic } from './merge';
import { faceHead } from './faces';
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
  /** Beach worm patch: where it is, and the worms + marker shown only to players who can dig. */
  readonly wormSpot: THREE.Vector3 | null = null;
  private wormCue: { group: THREE.Group; worms: THREE.Object3D[]; marker: THREE.Object3D } | null = null;
  private windowMat = new THREE.MeshBasicMaterial({ color: 0x6d7f8c });
  private smoke: { m: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  private heads: { head: THREE.Object3D; body: THREE.Object3D; pos: THREE.Vector3; yaw: number }[] = [];
  private cobble = cobbleTexture();
  private foundKey = '';
  private night = 0;

  constructor(private map: MapDef) {
    const t = map.town;
    if (map.casino) {
      t.npcs.forEach((n) => this.buildNpc(n));
      mergeStatic(this.group, this.heads.map((h) => h.body));
      return;
    }
    this.buildStreets();
    this.buildSquare(t.square);
    t.houses.forEach((h, i) => this.buildHouse(h, i));
    t.npcs.forEach((n) => this.buildNpc(n));
    t.racks.forEach((r) => this.buildRack(r));
    t.boats.forEach((b) => this.buildBoat(b));
    t.flowers.forEach((f) => this.buildFlowers(f));
    this.buildFences();
    this.buildBottles();
    this.buildCozy();
    mergeStatic(this.group, [...this.heads.map((h) => h.body), ...this.bottleMeshes.values()]);
    if (map.worms) this.buildWormPatch(map.worms.x, map.worms.z);
  }

  private at(obj: THREE.Object3D, x: number, z: number, facing = 0, y?: number): void {
    obj.position.set(x, y ?? groundHeight(x, z), z);
    obj.rotation.y = facing;
    this.group.add(obj);
  }

  private solid(x: number, z: number, r: number): void {
    this.colliders.push({ x, z, r });
  }

  private pathLayers = 1;

  /** Flat cobbled strip between two points, laid just above the ground. */
  private path(ax: number, az: number, bx: number, bz: number, w: number): void {
    // Overlapping strips each get their own height and depth bias so their cobbles never z-fight.
    const layer = this.pathLayers++;
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 2.2), uv.getY(i) * (len / 2.2));
    const m = new THREE.Mesh(geo, mat(0xffffff, { map: this.cobble, polygonOffset: true, polygonOffsetFactor: -2 - layer, polygonOffsetUnits: -2 - layer }));
    m.receiveShadow = true;
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    m.position.set(mx, groundHeight(mx, mz) + 0.03 + layer * 0.012, mz);
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
    // Spur to the campfire cove
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
  private lights: THREE.PointLight[] = [];
  private fires: { light: THREE.PointLight; flames: THREE.Object3D[]; ph: number }[] = [];

  private buildNpc(def: NpcDef): void {
    const p = new THREE.Group();
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.6, 8, 14), mat(def.coat));
    torso.position.y = 1.0;
    torso.castShadow = true;
    const head = new THREE.Group();
    head.position.y = 1.75;
    head.add(faceHead(0.22, def.face));
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
    // Townsfolk don't block: they stand on the main street to and from the casino gate.
    this.at(p, def.x, def.z, def.facing);
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
    // Along the rack, turned with it like the rack itself.
    for (const lx of [-1.1, 1.1]) this.solid(s.x + lx * Math.cos(s.facing), s.z - lx * Math.sin(s.facing), 0.4);
  }

  private buildBoat(s: Spot): void {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x7a4a2b, { side: THREE.DoubleSide }));
    hull.scale.set(0.8, 0.55, 2.2);
    hull.position.y = 0.5;
    hull.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 24), mat(0xd9b88a));
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(0.8, 2.2, 1);
    rim.position.y = 0.5;
    const oar = cyl(0.03, 0.03, 2, WOOD, 6);
    oar.rotation.set(0.1, 0, 1.3);
    oar.position.set(0.5, 0.7, 0.2);
    g.add(hull, rim, oar);
    this.at(g, s.x, s.z, s.facing, -0.2);
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

  private lampPost(x: number, z: number, light: boolean): void {
    const g = new THREE.Group();
    const pole = cyl(0.045, 0.065, 2.3, DARK, 8);
    pole.position.y = 1.15;
    const arm = rbox(0.5, 0.05, 0.05, DARK, 0.01);
    arm.position.set(0.22, 2.3, 0);
    const lantern = rbox(0.24, 0.3, 0.24, 0xffd27a, 0.05);
    (lantern.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
    this.lamps.push(lantern.material as THREE.MeshLambertMaterial);
    lantern.position.set(0.45, 2.1, 0);
    const cap = cyl(0.01, 0.16, 0.12, DARK, 6);
    cap.position.set(0.45, 2.32, 0);
    g.add(pole, arm, lantern, cap);
    if (light) {
      const l = new THREE.PointLight(0xffc266, 0, 12, 1.6);
      l.position.set(0.45, 2.1, 0);
      g.add(l);
      this.lights.push(l);
    }
    this.at(g, x, z);
    this.solid(x, z, 0.2);
  }

  private pot(x: number, z: number): void {
    const g = new THREE.Group();
    const p = cyl(0.22, 0.16, 0.34, 0xb5653a, 8);
    p.position.y = 0.17;
    const bush = ball(0.26, 0x4f9a4b, 1, 0.9, 1);
    bush.position.y = 0.5;
    g.add(p, bush);
    [0xff6f91, 0xffd23a, 0xffffff].forEach((c, i) => {
      const b = ball(0.06, c);
      b.position.set(Math.cos(i * 2.1) * 0.18, 0.62 + (i % 2) * 0.05, Math.sin(i * 2.1) * 0.18);
      g.add(b);
    });
    this.at(g, x, z);
  }

  private firePit(x: number, z: number, seats: number): void {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = ball(0.14, 0x8a8478, 1, 0.7, 1);
      st.position.set(Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62);
      g.add(st);
    }
    for (let i = 0; i < 3; i++) {
      const log = cyl(0.06, 0.07, 0.8, 0x5b3a1e, 6);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i * Math.PI) / 3;
      log.position.y = 0.12;
      g.add(log);
    }
    const flames: THREE.Object3D[] = [];
    for (const [h, c] of [[0.7, 0xff6a1a], [0.5, 0xffa51f], [0.3, 0xffe14a]] as const) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 * (h / 0.7) + 0.06, h, 7), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      f.position.y = 0.15 + h / 2;
      g.add(f);
      flames.push(f);
    }
    const light = new THREE.PointLight(0xff8a3c, 6, 11, 2);
    light.position.y = 0.9;
    g.add(light);
    this.fires.push({ light, flames, ph: x * 3.1 + z });
    for (let i = 0; i < seats; i++) {
      const a = (i / seats) * Math.PI * 2 + 0.6;
      const seat = cyl(0.17, 0.17, 0.9, 0x6b4a2b, 8);
      seat.rotation.z = Math.PI / 2;
      seat.rotation.y = -a;
      seat.position.set(Math.cos(a) * 1.9, 0.2, Math.sin(a) * 1.9);
      g.add(seat);
    }
    this.at(g, x, z);
    this.solid(x, z, 0.8);
  }

  private blanket(x: number, z: number, facing: number): void {
    const g = new THREE.Group();
    const b = rbox(1.9, 0.04, 1.5, 0xc0504d, 0.01);
    b.position.y = 0.03;
    const stripe = rbox(1.9, 0.045, 0.3, 0xf3ead2, 0.01);
    stripe.position.y = 0.032;
    const basket = rbox(0.45, 0.28, 0.32, 0xb98a55, 0.04);
    basket.position.set(0.5, 0.18, 0.1);
    const cushion = rbox(0.5, 0.12, 0.5, 0x4f6fa0, 0.05);
    cushion.position.set(-0.45, 0.1, -0.2);
    g.add(b, stripe, basket, cushion);
    this.at(g, x, z, facing);
  }

  private stringLights(x0: number, x1: number, z: number, h: number): void {
    const n = 14;
    for (const x of [x0, x1]) {
      const post = cyl(0.05, 0.06, h, DARK, 6);
      this.at(post, x, z, 0, groundHeight(x, z) + h / 2);
      this.solid(x, z, 0.15);
    }
    const colors = [0xffd27a, 0xff9a6a, 0xfff0b0, 0xffb84a];
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = x0 + (x1 - x0) * k;
      const y = groundHeight(x, z) + h - Math.sin(k * Math.PI) * 0.45;
      const b = ball(0.07, colors[i % 4]);
      const m = b.material as THREE.MeshLambertMaterial;
      m.emissive.set(colors[i % 4]);
      this.lamps.push(m);
      this.at(b, x, z, 0, y);
    }
  }

  /** Lamp posts, flower pots, a fire pit, picnic spots and string lights that make the town feel lived in. */
  private buildCozy(): void {
    const posts = [[-2.6, 39, true], [2.6, 39, false], [-2.6, 45, false], [2.6, 45, true], [-2.6, 51, true], [2.6, 51, false], [12, 36, true], [-13, 39, false], [12, 47, false], [-3, 55, false]] as const;
    for (const [x, z, lit] of posts) this.lampPost(x, z, lit);
    this.pot(-3.6, 29.5);
    this.pot(3.6, 29.5);
    this.pot(-3.6, 34.5);
    this.pot(3.6, 34.5);
    this.firePit(11, 38.5, 5);
    this.pot(8.2, 40.5);
    this.blanket(9, 17, 0.4);
    this.blanket(-9.5, 17.5, -0.3);
    this.pot(7.5, 15.5);
    this.stringLights(-3.4, 3.4, 49, 3.1);
    this.stringLights(-4, 4, 34.5, 3.3);
    for (const [x, z, f] of [[20.2, 46, 0], [-18.2, 46, 0], [-12.6, 33.2, 1.57]] as const) {
      const g = new THREE.Group();
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 4 - r; i++) {
          const l = cyl(0.09, 0.09, 0.9, 0x7a5230, 6);
          l.rotation.z = Math.PI / 2;
          l.position.set((i - (3 - r) / 2) * 0.2, 0.1 + r * 0.17, 0);
          g.add(l);
        }
      }
      this.at(g, x, z, f);
    }
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
      glow.position.y = 0.4;
      holder.add(glow);
      const onDock = b.z < 0;
      holder.position.set(b.x, onDock ? 0.86 : groundHeight(b.x, b.z) + 0.1, b.z);
      this.group.add(holder);
      this.bottleMeshes.set(b.id, holder);
      this.bottles.push({ id: b.id, note: b.note, pos: new THREE.Vector3(b.x, 0, b.z) });
    }
  }

  /** A low mound of damp sand with a trowel stuck in it; the worms and marker appear only when digging is allowed. */
  private buildWormPatch(x: number, z: number): void {
    const patch = new THREE.Group();
    const mound = ball(0.75, 0x8a6a48, 1, 0.22, 0.85);
    mound.receiveShadow = true;
    patch.add(mound);
    for (const [dx, dz, r] of [[-0.45, 0.35, 0.22], [0.5, -0.3, 0.18], [0.15, 0.5, 0.15]]) {
      const lump = ball(r, 0x7a5c3d, 1, 0.5, 1);
      lump.position.set(dx, 0.04, dz);
      patch.add(lump);
    }
    const trowel = new THREE.Group();
    const handle = cyl(0.035, 0.035, 0.3, WOOD, 8);
    handle.position.y = 0.32;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), mat(0x9aa3ad));
    blade.rotation.x = Math.PI;
    blade.position.y = 0.08;
    trowel.add(handle, blade);
    trowel.position.set(0.35, 0.05, 0.2);
    trowel.rotation.set(0.25, 0.6, -0.3);
    patch.add(trowel);

    const cue = new THREE.Group();
    const worms: THREE.Object3D[] = [];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.2, 3, 6), mat(0xe58a8a));
      const a = (i / 4) * Math.PI * 2 + 0.4;
      w.position.set(Math.cos(a) * 0.3, 0.17, Math.sin(a) * 0.25);
      w.rotation.set(Math.PI / 2, 0, a);
      cue.add(w);
      worms.push(w);
    }
    const marker = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd34d }),
    );
    marker.rotation.x = Math.PI;
    cue.add(marker);
    cue.visible = false;
    patch.add(cue);

    this.at(patch, x, z, 0.4, groundHeight(x, z) - 0.04);
    this.wormCue = { group: cue, worms, marker };
    (this as { wormSpot: THREE.Vector3 | null }).wormSpot = new THREE.Vector3(x, 0, z);
  }

  /** Shows the wriggling worms and the bobbing marker over the patch. */
  setDiggable(on: boolean): void {
    if (this.wormCue) this.wormCue.group.visible = on;
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
    this.night = n;
    for (const l of this.lights) l.intensity = 8 * n;
  }

  /** The line this townsperson says next. */
  talk(npc: TownNpc, night: boolean): string {
    const lines = night && npc.def.nightLines ? [...npc.def.nightLines, ...npc.def.lines] : npc.def.lines;
    const line = lines[npc.next % lines.length];
    npc.next++;
    return `${npc.def.name}: "${line}"`;
  }

  update(t: number, px: number, pz: number): void {
    for (const f of this.fires) {
      f.light.intensity = (4 + 8 * this.night) * (0.85 + 0.15 * Math.sin(t * 9 + f.ph) + 0.08 * Math.sin(t * 23 + f.ph));
      f.flames.forEach((c, i) => c.scale.set(1, 0.85 + 0.25 * Math.sin(t * 8 + i * 2 + f.ph), 1));
    }
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
    const cue = this.wormCue;
    if (cue?.group.visible) {
      cue.marker.position.y = 2.2 + Math.sin(t * 3) * 0.2;
      cue.marker.rotation.y = t * 1.5;
      cue.worms.forEach((w, i) => (w.rotation.y = Math.sin(t * 6 + i * 1.7) * 0.6));
    }
    for (const [, m] of this.bottleMeshes) {
      if (!m.visible) continue;
      (m.children[1] as THREE.PointLight).intensity = 0.7 + Math.sin(t * 2 + m.position.x) * 0.2;
    }
  }
}
