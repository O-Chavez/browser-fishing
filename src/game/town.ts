import * as THREE from 'three';
import { LOG, SEAT_TOP, archPosts, atBearing, campLogs, campRim, campSeats, campStands, seatPlanks, type Arc, type CampDef, type MapDef, type NpcDef, type Spot } from '../data/maps';
import { DOCK_TOP, REED_WHARF, groundHeight, onDock, smooth, standHeight, terrainHeight, waveHeight } from './env';
import { LOCATIONS } from '../data/content';
import { DARK, WOOD, ball, cyl, limb, mat, rbox, textPlane, woodSign } from './hub';
import { mergeStatic } from './merge';
import { INSTRUMENTS, partBit } from '../data/band';
import { restInstrument } from './instruments';
import { NpcWalker, type Bystander } from './npcwalk';
import { glowTag } from './nightglow';
import { BOARD_POSTS, FurthestBoard } from './furthestboard';
import { boxUV, groundTexture, shingleTexture, sidingTexture, stoneTexture } from './textures';
import { faceHead } from './faces';
import { LIGHTS_MAST } from './baitshop';
import {
  buildCrownPost, buildGatePier, buildHedgeArc, buildKettleStall, buildLanternPier, buildPicketRun, buildRocketRack, buildSignpost,
  buildSkipSign, buildSteps, buildStoneArc, buildStonePile, buildStoneRun, buildTotem, TREAD_DEPTH as STEP_DEPTH, writePlaque, type Writable,
} from './camp';
import type { Circle } from './player';
import type { FurthestRow } from '../net/protocol';

const rnd = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Seamless-ish cobblestone texture, drawn once. */
/** How far the cobbles lie above the ground. */
const COBBLE_LIFT = 0.04;
/** How far relaid ground (`Town.relay`) lies above the terrain, enough that the terrain's creases stay under it. */
const GROUND_LIFT = 0.05;
/** The string lights' four bulb colours, in turn along a string. */
const BULBS = [0xffd27a, 0xff9a6a, 0xfff0b0, 0xffb84a];
/** How high an arch's beam is above the lane it spans (`Town.arch`). */
const ARCH_H = 3;
/** How far a cottage's chimney top stands above its eaves; the ridge is 1.5 above them. Play-test: the height. */
const CHIMNEY_TOP = 2.9;

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
  walker?: NpcWalker;
}

export interface TownBottle {
  id: string;
  note: string;
  pos: THREE.Vector3;
}

/** Cottages, cobbled streets, townsfolk and hidden bottles around the shop. */
/** A place to sit: where the sitter's body rests and the way they face (0 = toward +z). */
/** A place to sit: where the sitter rests and which way they face, and how high the seat's top is over the ground there (`SEAT_TOP`). */
export interface Seat { x: number; z: number; facing: number; top: number }

export class Town {
  readonly group = new THREE.Group();
  readonly colliders: Circle[] = [];
  /** Places to sit: two on every bench and every log seat, one on each plank of the campfire's seat wall. */
  readonly seats: Seat[] = [];
  /** The campfire band's instruments standing by their fire logs, in the logs' order (`INSTRUMENTS`). */
  readonly instruments: THREE.Object3D[] = [];
  /** The instruments being played (`setBand`), which are in their players' hands. */
  private bandMask = 0;
  readonly npcs: TownNpc[] = [];
  readonly bottles: TownBottle[] = [];
  private bottleMeshes = new Map<string, THREE.Object3D>();
  /** Beach worm patch: where it is, and the worms + marker shown only to players who can dig. */
  readonly wormSpot: THREE.Vector3 | null = null;
  private wormCue: { group: THREE.Group; worms: THREE.Object3D[]; marker: THREE.Object3D } | null = null;
  private windowMat = new THREE.MeshBasicMaterial({ color: 0x6d7f8c });
  private smoke: { m: THREE.Mesh; base: THREE.Vector3; ph: number }[] = [];
  private heads: {
    head: THREE.Object3D;
    body: THREE.Object3D;
    arms: THREE.Object3D[];
    pos: THREE.Vector3;
    yaw: number;
    model: THREE.Object3D;
    walker?: NpcWalker;
  }[] = [];
  private cobble = cobbleTexture();
  /** Textured materials shared by colour, so mergeStatic can still bake same-coloured parts together. */
  private paintedMats = new Map<string, THREE.MeshLambertMaterial>();
  /** Cobbled strips (ax, az, bx, bz, half width), so ground clutter can stay off them. */
  readonly paths: [number, number, number, number, number][] = [];
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
    if (map.smokehouse) this.buildSmokehouse(map.smokehouse);
    if (map.harbour) this.buildHarbour(map.harbour);
    t.npcs.forEach((n) => this.buildNpc(n));
    t.racks.forEach((r) => this.buildRack(r));
    t.boats.forEach((b) => this.buildBoat(b));
    t.flowers.forEach((f) => this.buildFlowers(f));
    this.buildFences();
    this.buildBottles();
    this.buildCozy();
    mergeStatic(this.group, [...this.heads.map((h) => h.body), ...this.instruments, ...this.bottleMeshes.values(), ...(this.plane ? [this.plane] : []), ...(this.furthest ? [this.furthest.face.mesh] : [])]);
    if (map.worms) this.buildWormPatch(map.worms.x, map.worms.z);
  }

  /** True on a cobbled path or inside anything solid: ground clutter skips these spots. */
  blocked(x: number, z: number, pad = 0.4): boolean {
    for (const [ax, az, bx, bz, hw] of this.paths) {
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < hw + pad) return true;
    }
    for (const s of [this.map.town.square, ...(this.map.town.circles ?? [])]) if (Math.hypot(x - s.x, z - s.z) < s.r + pad) return true;
    // Keep hidden bottles and the worm patch easy to spot
    if (this.bottles.some((b) => Math.hypot(x - b.pos.x, z - b.pos.z) < 1.5)) return true;
    if (this.wormSpot && Math.hypot(x - this.wormSpot.x, z - this.wormSpot.z) < 2) return true;
    return this.colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad + 0.3);
  }

  private painted(color: number, map: THREE.Texture): THREE.MeshLambertMaterial {
    const key = `${color}|${map.uuid}`;
    let m = this.paintedMats.get(key);
    if (!m) this.paintedMats.set(key, (m = mat(color, { map })));
    return m;
  }

  private at(obj: THREE.Object3D, x: number, z: number, facing = 0, y?: number): void {
    obj.position.set(x, y ?? groundHeight(x, z), z);
    obj.rotation.y = facing;
    this.group.add(obj);
  }

  private solid(x: number, z: number, r: number): void {
    this.colliders.push({ x, z, r });
  }

  /** Which of the band's instruments are being played, bit i for log i (`partBit`): each of those is off its stand, in its players' hands. */
  setBand(mask: number): void {
    if (mask === this.bandMask) return;
    this.bandMask = mask;
    this.instruments.forEach((g, i) => (g.visible = !(mask & partBit(i))));
  }

  /** The nearest seat within `range` metres of a spot that passes `ok`, if any. */
  seatNear(x: number, z: number, range: number, ok: (s: Seat) => boolean = () => true): Seat | null {
    let best: Seat | null = null;
    let bd = range;
    for (const s of this.seats) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd && ok(s)) [best, bd] = [s, d];
    }
    return best;
  }

  /** Flat cobbled strip between two points, laid just above the ground; `buildStreets` rounds the lanes' ends. */
  private path(ax: number, az: number, bx: number, bz: number, w: number): void {
    this.paths.push([ax, az, bx, bz, w / 2]);
    const len = Math.hypot(bx - ax, bz - az);
    // Built in world space, a vertex every half metre along and across, each on the ground under it, so a lane
    // down or across a slope lies on the ground instead of floating at one edge and sinking at the other.
    const geo = new THREE.PlaneGeometry(w, len, Math.max(1, Math.ceil(w / 0.55)), Math.max(1, Math.ceil(len / 0.5))).rotateX(-Math.PI / 2);
    const uv = geo.getAttribute('uv');
    const mx = (ax + bx) / 2;
    const mz = (az + bz) / 2;
    const ang = Math.atan2(bx - ax, bz - az);
    const sin = Math.sin(ang);
    const cos = Math.cos(ang);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = mx + pos.getX(i) * cos + pos.getZ(i) * sin;
      const z = mz - pos.getX(i) * sin + pos.getZ(i) * cos;
      // Every strip and the square lie at one height with one depth bias and take their cobbles from the same
      // world-space pattern, so where two overlap they show the same stones and read as one paved surface. The
      // height is the terrain mesh's, not the ground's formula, so the ground can't poke through between its points.
      pos.setXYZ(i, x, terrainHeight(x, z) + COBBLE_LIFT, z);
      uv.setXY(i, x / 2.2, z / 2.2);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(0xffffff, { map: this.cobble, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  /** The main street and the lanes, as the map lays them out (`paths` in maps.ts), and the round patches (`circles`). */
  private buildStreets(): void {
    // Every end of a lane gets a round of cobbles as wide as the widest strip that meets there. At a bend it fills
    // the wedge between the two strips and rounds the outside corner; where a lane runs into a wider one or into
    // the square it tucks under it; where a lane stops it ends in a half round instead of a sawn-off edge. The main
    // street has none: it stops where it is laid, against the quay deck.
    const ends = new Map<string, { x: number; z: number; r: number }>();
    for (const p of this.map.town.paths) {
      this.path(p.from[0], p.from[1], p.to[0], p.to[1], p.w);
      if (p.w >= 4) continue;
      for (const [x, z] of [p.from, p.to]) {
        const e = ends.get(`${x},${z}`);
        if (e) e.r = Math.max(e.r, p.w / 2);
        else ends.set(`${x},${z}`, { x, z, r: p.w / 2 });
      }
    }
    for (const e of ends.values()) this.disc(e.x, e.z, e.r, 20);
    for (const c of this.map.town.circles ?? []) this.disc(c.x, c.z, c.r);
  }

  /**
   * Round cobbled patch, laid on the ground like `path`: the square, and the campfire's terrace. Given `part` (an
   * inner radius and two bearings in degrees), only that stretch of its outer band is laid.
   */
  private disc(cx: number, cz: number, r: number, around = 40, part?: [number, number, number]): void {
    const [r0, from, to] = part ?? [0, 0, 360];
    // Rings every half metre, so the patch follows the ground under it instead of lying flat across a slope. A ring's
    // angle is its bearing less 90°.
    const geo = new THREE.RingGeometry(r0, r, around, Math.max(1, Math.ceil((r - r0) / 0.5)), ((from - 90) * Math.PI) / 180, ((to - from) * Math.PI) / 180).rotateX(-Math.PI / 2);
    const uv = geo.getAttribute('uv');
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const x = cx + pos.getX(i);
      const z = cz + pos.getZ(i);
      // The same height, depth bias and world-space cobbles as the paths, so the lanes run in without a seam.
      pos.setXYZ(i, x, terrainHeight(x, z) + COBBLE_LIFT, z);
      uv.setXY(i, x / 2.2, z / 2.2);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(0xffffff, { map: this.cobble, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  private buildSquare(s: { x: number; z: number; r: number }): void {
    this.disc(s.x, s.z, s.r);

    // Well
    const well = new THREE.Group();
    // Cylinder UVs run 0..1 around and up, so the stones are repeated to keep them roughly square.
    const stones = stoneTexture().clone();
    stones.repeat.set(5, 0.9);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.9, 16), mat(0xb4ada2, { map: stones }));
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

  /** The square's pair of benches, facing the well. */
  private benches(s: { x: number; z: number; r: number }): void {
    for (const a of [Math.PI / 2, -Math.PI / 2]) {
      this.bench(s.x + Math.sin(a) * (s.r - 0.9), s.z + Math.cos(a) * (s.r - 0.9), a + Math.PI);
    }
  }
  /** A bench with a back, facing `facing`; on a dock it stands on the deck. */
  private bench(x: number, z: number, facing: number): void {
    const b = new THREE.Group();
    const seat = rbox(1.7, 0.1, 0.45, WOOD, 0.03);
    seat.position.y = SEAT_TOP.bench - 0.05;
    const back = rbox(1.7, 0.4, 0.07, WOOD, 0.03);
    back.position.set(0, 0.8, -0.22);
    for (const sx of [-0.7, 0.7]) {
      const leg = rbox(0.08, 0.5, 0.4, DARK, 0.02);
      leg.position.set(sx, 0.25, 0);
      b.add(leg);
    }
    b.add(seat, back);
    // Room for two, side by side.
    for (const lx of [-0.42, 0.42]) this.seats.push({ x: x + lx * Math.cos(facing), z: z - lx * Math.sin(facing), facing, top: SEAT_TOP.bench });
    this.at(b, x, z, facing, standHeight(x, z));
    this.solid(x, z, 0.8);
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
    const walls = new THREE.Mesh(boxUV(wallGeo, 1.05), this.painted(h.wall, sidingTexture()));
    walls.castShadow = walls.receiveShadow = true;
    g.add(walls);

    const slope = Math.atan2(rise, D / 2);
    const rl = Math.hypot(D / 2, rise) + 0.35;
    for (const s of [-1, 1]) {
      const r = rbox(W + 0.5, 0.12, rl, h.roof, 0.03);
      boxUV(r.geometry, 1.5);
      r.material = this.painted(h.roof, shingleTexture());
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
    // Two windows with flower boxes on the street side and two on the back, one on each gable: every side a
    // lane passes has a face, and lights up at night. [x, z, turn]
    const windows: [number, number, number][] = [
      [-1.65, D / 2, 0], [1.65, D / 2, 0], [-1.65, -D / 2, Math.PI], [1.65, -D / 2, Math.PI],
      [W / 2, 0, Math.PI / 2], [-W / 2, 0, -Math.PI / 2],
    ];
    windows.forEach(([wx, wz, turn], n) => {
      const w = new THREE.Group();
      const frame = rbox(0.95, 0.85, 0.1, 0xf3ead2, 0.02);
      frame.position.set(0, 1.45, 0.03);
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.62), this.windowMat);
      pane.position.set(0, 1.45, 0.1);
      glowTag(pane, 0.8, 0.5);
      const bar = rbox(0.05, 0.64, 0.02, 0xf3ead2, 0.01);
      bar.position.set(0, 1.45, 0.11);
      const sill = rbox(1.1, 0.08, 0.28, 0x6b4a2b, 0.02);
      sill.position.set(0, 1.0, 0.14);
      const box = rbox(0.9, 0.16, 0.22, 0x7a5a38, 0.02);
      box.position.set(0, 1.12, 0.2);
      w.add(frame, pane, bar, sill, box);
      for (let k = 0; k < 4; k++) {
        const f = ball(0.07, [0xff6f91, 0xffd23a, 0xffffff, 0xc77dff][(k + i + n) % 4]);
        f.position.set(-0.33 + k * 0.22, 1.24, 0.22);
        w.add(f);
      }
      w.position.set(wx, 0, wz);
      w.rotation.y = turn;
      g.add(w);
    });
    // Porch lantern
    const lamp = ball(0.1, 0xffd27a);
    (lamp.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
    lamp.position.set(0.85, 1.95, D / 2 + 0.2);
    glowTag(lamp, 0.7);
    this.lamps.push(lamp.material as THREE.MeshLambertMaterial);
    g.add(lamp);
    // Chimney: on the back slope, and tall enough to stand well clear of the ridge (`CHIMNEY_TOP` above the
    // eaves), so it shows from the street in front and the smoke has somewhere to come from. A darker cap on top.
    const chim = rbox(0.55, CHIMNEY_TOP - 0.2, 0.55, 0x8d6e63, 0.03);
    boxUV(chim.geometry, 1.6);
    chim.material = this.painted(0xa08478, stoneTexture());
    chim.position.set(-1.4, H + 0.2 + (CHIMNEY_TOP - 0.2) / 2, -0.6);
    const pot = rbox(0.7, 0.14, 0.7, 0x6f5a52, 0.03);
    pot.position.set(-1.4, H + CHIMNEY_TOP, -0.6);
    g.add(chim, pot);
    this.at(g, h.x, h.z, h.facing);
    const sin = Math.sin(h.facing);
    const cos = Math.cos(h.facing);
    const wx = h.x + -1.4 * cos + -0.6 * sin;
    const wz = h.z - -1.4 * sin + -0.6 * cos;
    const wy = groundHeight(h.x, h.z) + H + CHIMNEY_TOP + 0.2;
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

    // Behind the house: a woodpile under one window and a water barrel by the other.
    const local = (lx: number, lz: number): [number, number] => [h.x + lx * cos + lz * sin, h.z - lx * sin + lz * cos];
    this.woodpile(...local(1.5, -D / 2 - 0.5), h.facing);
    const barrel = cyl(0.3, 0.26, 0.75, WOOD, 10);
    const [bx, bz] = local(-0.3, -D / 2 - 0.5);
    this.at(barrel, bx, bz, 0, groundHeight(bx, bz) + 0.37);
    this.solid(bx, bz, 0.4);
    // A fenced garden beside the door, open at the back.
    if (h.yard) {
      const a = local(h.yard * 0.95, D / 2 + 1.5);
      const b = local(h.yard * (W / 2 + 1.3), D / 2 + 1.5);
      const c = local(h.yard * (W / 2 + 1.3), -D / 2 + 0.3);
      this.fence(a[0], a[1], b[0], b[1]);
      this.fence(b[0], b[1], c[0], c[1]);
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
  private bulbMats = new Map<number, THREE.MeshLambertMaterial>();
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
    if (def.scarf !== undefined) {
      // A headscarf: a snug cap with a knot at the back.
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), mat(def.scarf));
      cap.position.y = 0.06;
      const knot = ball(0.07, def.scarf, 1.2, 0.8, 0.8);
      knot.position.set(0, 0.08, -0.24);
      head.add(cap, knot);
    } else if (def.hat !== undefined) {
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
    if (def.apron !== undefined) {
      const apron = rbox(0.44, 0.78, 0.05, def.apron, 0.02);
      apron.position.set(0, 0.9, 0.28);
      apron.rotation.x = -0.06;
      const bib = rbox(0.32, 0.34, 0.05, def.apron, 0.02);
      bib.position.set(0, 1.3, 0.27);
      body.add(apron, bib);
    }
    // Each arm hangs from a shoulder pivot, so walking can swing it.
    const arms = [-1, 1].map((sx) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(sx * (0.36 - 0.3 * Math.sin(0.12)), 1.05 + 0.3 * Math.cos(0.12), 0.05);
      shoulder.rotation.z = sx * 0.12;
      const arm = cyl(0.07, 0.07, 0.6, def.coat, 8);
      arm.position.y = -0.3;
      shoulder.add(arm);
      body.add(shoulder);
      return shoulder;
    });
    p.add(body);
    // Townsfolk don't block: they stand on the main street to and from the casino gate.
    this.at(p, def.x, def.z, def.facing, standHeight(def.x, def.z));
    const pos = p.position.clone();
    const walker = def.walk && new NpcWalker({ ...def, walk: def.walk });
    this.npcs.push({ def, pos, next: 0, walker });
    this.heads.push({ head, body, arms, pos, yaw: def.facing, model: p, walker });
  }

  /**
   * Mags Cinder's smoke shack: a dark timber lean-to, open at the front, with a counter of smoked fish,
   * more hanging under the eave and on the back wall, a lantern, a SMOKEHOUSE sign up high, and a stone
   * smoker behind it whose pipe puffs smoke over the roof. `sh` is the middle of the counter; the shack
   * stands behind it.
   * Dark and smoky on purpose, so it reads as a different place from Marlow's mint BAIT & TACKLE shack.
   */
  private buildSmokehouse(sh: Spot): void {
    const g = new THREE.Group();
    const W = 3.4;
    const BACK = -2.1;
    const FRONT = 0.25;
    const LOW = 2.3;
    const HIGH = 2.95;
    const plank = this.painted(0x5a3e2b, sidingTexture());
    // Back wall and the two side walls, whose tops follow the roof's slope.
    const back = rbox(W, HIGH, 0.16, 0x5a3e2b, 0.03);
    boxUV(back.geometry, 1.05);
    back.material = plank;
    back.position.set(0, HIGH / 2, BACK);
    g.add(back);
    const side = new THREE.Shape();
    side.moveTo(BACK, 0);
    side.lineTo(FRONT, 0);
    side.lineTo(FRONT, LOW);
    side.lineTo(BACK, HIGH);
    side.closePath();
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(boxUV(new THREE.ExtrudeGeometry(side, { depth: 0.16, bevelEnabled: false }).rotateY(-Math.PI / 2), 1.05), plank);
      wall.position.x = sx * (W / 2) + (sx > 0 ? 0 : 0.16);
      wall.castShadow = wall.receiveShadow = true;
      g.add(wall);
    }
    // A shingled roof sloping down to the front, overhanging the counter.
    const run = FRONT + 0.25 - (BACK - 0.2);
    const rise = HIGH - LOW;
    const roof = rbox(W + 0.5, 0.12, Math.hypot(run, rise), 0x3d3a37, 0.03);
    boxUV(roof.geometry, 1.5);
    roof.material = this.painted(0x4a4440, shingleTexture());
    roof.position.set(0, (LOW + HIGH) / 2 + 0.1, (FRONT + 0.25 + BACK - 0.2) / 2);
    roof.rotation.x = Math.atan2(rise, run);
    g.add(roof);
    // The counter, with smoked fish laid out on top, each with a tail.
    const front = rbox(W - 0.5, 0.92, 0.55, WOOD, 0.03);
    front.position.y = 0.46;
    const top = rbox(W - 0.3, 0.08, 0.72, 0x6b4a2b, 0.02);
    top.position.y = 0.96;
    g.add(front, top);
    const browns = [0xb0692e, 0x9a5a28, 0xc47f3a, 0x8a4f22];
    const smoked = (i: number) => {
      const f = new THREE.Group();
      const body = ball(0.08, browns[i % 4], 2.4, 0.5, 1.1);
      const tail = cyl(0, 0.09, 0.15, browns[i % 4], 4);
      tail.rotation.z = -Math.PI / 2;
      tail.scale.set(0.35, 1, 1);
      tail.position.x = -0.26;
      f.add(body, tail);
      return f;
    };
    for (let i = 0; i < 5; i++) {
      const f = smoked(i);
      f.position.set(-1.1 + i * 0.55, 1.03, i % 2 ? 0.14 : -0.12);
      f.rotation.y = i % 2 ? 0.35 : -0.3;
      g.add(f);
    }
    // Corner posts, a pole under the eave with fish hanging from it, and two rows on the back wall.
    for (const sx of [-1, 1]) {
      const post = cyl(0.07, 0.08, LOW, DARK, 8);
      post.position.set(sx * (W / 2 - 0.08), LOW / 2, FRONT);
      g.add(post);
    }
    const pole = cyl(0.035, 0.035, W - 0.2, DARK, 6);
    pole.rotation.z = Math.PI / 2;
    pole.position.set(0, 2.08, FRONT);
    g.add(pole);
    const hang = (x: number, y: number, z: number, i: number) => {
      const f = smoked(i);
      f.rotation.z = Math.PI / 2;
      f.position.set(x, y, z);
      g.add(f);
    };
    for (let i = 0; i < 6; i++) hang(-1.25 + i * 0.5, 1.78, FRONT, i);
    for (const y of [1.45, 2.15]) for (let i = 0; i < 5; i++) hang(-1.0 + i * 0.5, y, BACK + 0.14, i + 1);
    // A lantern at the front corner, lit at night like the porch lamps.
    const lamp = ball(0.11, 0xffd27a);
    (lamp.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
    lamp.position.set(-W / 2 + 0.08, 1.9, FRONT + 0.14);
    glowTag(lamp, 0.7);
    this.lamps.push(lamp.material as THREE.MeshLambertMaterial);
    g.add(lamp);
    // The back faces the campfire: a shuttered window and a stack of firewood, so it isn't a blank wall.
    const frame = rbox(0.9, 0.75, 0.08, 0x3a2a1e, 0.02);
    frame.position.set(-0.3, 1.55, BACK - 0.1);
    g.add(frame);
    for (const sx of [-1, 1]) {
      const shutter = rbox(0.4, 0.66, 0.06, 0x6b7f5a, 0.02);
      shutter.position.set(-0.3 + sx * 0.21, 1.55, BACK - 0.16);
      g.add(shutter);
    }
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 5 - r; i++) {
        const log = cyl(0.1, 0.1, 0.55, 0x7a5232, 7);
        log.rotation.x = Math.PI / 2;
        log.position.set(-1.1 + (i - (4 - r) / 2) * 0.21, 0.1 + r * 0.18, BACK - 0.38);
        g.add(log);
      }
    }
    // The sign stands on the roof's front edge, up where Marlow's is.
    const sign = textPlane(2.4, 0.55, 512);
    woodSign(sign.ctx, 'SMOKEHOUSE');
    sign.tex.needsUpdate = true;
    sign.mesh.position.set(0, LOW + 0.55, FRONT + 0.32);
    sign.mesh.rotation.x = -0.12;
    g.add(sign.mesh);
    // The stone smoker stands beside the shack on its street side, where players see it, its iron door and
    // glowing coals facing the way the shack does, firewood stacked on its street side, and a tall pipe so the
    // smoke rises beside the roof.
    const SX = W / 2 + 0.8;
    const SZ = -0.6;
    const sm = new THREE.Group();
    const box = rbox(1.0, 1.2, 1.0, 0x8d6e63, 0.04);
    boxUV(box.geometry, 1.2);
    box.material = this.painted(0x9a8a7c, stoneTexture());
    box.position.y = 0.6;
    const door = rbox(0.55, 0.5, 0.06, 0x2e2a28, 0.02);
    door.position.set(0, 0.55, 0.5);
    const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.07), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
    ember.position.set(0, 0.42, 0.54);
    glowTag(ember, 0.6);
    const pipe = cyl(0.09, 0.09, 2.4, 0x3a3532, 10);
    pipe.position.set(0, 2.4, -0.15);
    const cap = cyl(0.17, 0.12, 0.08, 0x3a3532, 10);
    cap.position.set(0, 3.63, -0.15);
    sm.add(box, door, ember, pipe, cap);
    for (let i = 0; i < 3; i++) {
      const log = cyl(0.09, 0.09, 0.7, 0x7a5232, 8);
      log.rotation.x = Math.PI / 2;
      log.position.set(0.62 + (i === 2 ? 0.09 : i * 0.18), i === 2 ? 0.24 : 0.09, 0);
      sm.add(log);
    }
    sm.position.set(SX, 0, SZ);
    g.add(sm);
    this.at(g, sh.x, sh.z, sh.facing);
    const sin = Math.sin(sh.facing);
    const cos = Math.cos(sh.facing);
    const world = (lx: number, lz: number) => ({ x: sh.x + lx * cos + lz * sin, z: sh.z - lx * sin + lz * cos });
    for (const [lx, lz, r] of [[-1, 0, 0.5], [0, 0, 0.5], [1, 0, 0.5], [-1.2, BACK, 0.5], [0, BACK, 0.5], [1.2, BACK, 0.5], [-1, BACK - 0.38, 0.5], [-W / 2, -1, 0.6], [W / 2, -1, 0.6], [SX, SZ, 0.75], [SX + 0.7, SZ, 0.3]] as const) {
      const c = world(lx, lz);
      this.solid(c.x, c.z, r);
    }
    // The pipe sits 0.15 behind the smoker's middle.
    const top2 = world(SX, SZ - 0.15);
    const base = new THREE.Vector3(top2.x, groundHeight(sh.x, sh.z) + 3.75, top2.z);
    for (let n = 0; n < 4; n++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfcfcf, transparent: true, opacity: 0.5, depthWrite: false }));
      this.group.add(m);
      this.smoke.push({ m, base, ph: n / 4 });
    }
  }

  /**
   * Captain Reed's charters under the west headland (`HARBOUR` in maps.ts): his wharf (the boards are a dock rect,
   * `REED_WHARF` in env.ts, drawn with the other docks), the CHARTERS arch at its head and his seaplane moored to
   * it. The plane is cream with sea-green wings, tail and cowling, and a red band lettered CHARTERS down each
   * side; it sits on two floats with its nose square to the wharf and bobs on the swell (`update`). Up the lane
   * stands the Furthest Out board (`FurthestBoard`).
   */
  private buildHarbour(h: { plane: Spot; sign: Spot; board: Spot }): void {
    this.buildSeaplane(h.plane);
    this.buildFurthest(h.board);
    this.buildCharterArch(h.sign);
    this.buildWharf(h.plane);
  }

  /**
   * A timber arch across a lane: a post either side (`post` builds one, with its foot at y = 0), `half` m from the
   * middle, a beam across them 3 m up and a sign hung under it, `w` m wide and lettered on both faces. Players walk
   * under it, so the sign hangs clear of their heads and only the posts are solid. Hands back the arch for what else
   * hangs on it, in its own frame: x across the lane, its front toward +z.
   */
  private arch(s: Spot, text: string, half: number, w: number, post: () => THREE.Object3D): THREE.Group {
    const g = new THREE.Group();
    for (const sx of [-half, half]) {
      const p = post();
      p.position.x = sx;
      g.add(p);
    }
    const beam = rbox(half * 2 + 0.5, 0.14, 0.18, DARK, 0.03);
    beam.position.y = ARCH_H - 0.12;
    g.add(beam);
    const sign = textPlane(w, 0.46, 512);
    woodSign(sign.ctx, text, undefined, sign.ctx.canvas.width - 56);
    sign.tex.needsUpdate = true;
    const SIGN_Y = ARCH_H - 0.45;
    for (const [ry, oz] of [[0, 0.09], [Math.PI, -0.09]]) {
      const face = sign.mesh.clone();
      face.rotation.y = ry;
      face.position.set(0, SIGN_Y, oz);
      g.add(face);
    }
    const board = rbox(w + 0.06, 0.52, 0.16, DARK, 0.03);
    board.position.y = SIGN_Y;
    g.add(board);
    this.at(g, s.x, s.z, s.facing, groundHeight(s.x, s.z) - 0.05);
    for (const sx of [-half, half]) this.solid(s.x + sx * Math.cos(s.facing), s.z - sx * Math.sin(s.facing), 0.15);
    return g;
  }

  /**
   * The CHARTERS arch over the head of Reed's wharf (`arch`), a post either side of the lane's last cobbles, with a
   * lantern on top lit at night and a lifebuoy on the beach-side post.
   */
  private buildCharterArch(s: Spot): void {
    const HALF = 1.08;
    const g = this.arch(s, 'CHARTERS', HALF, 1.8, () => {
      const post = cyl(0.07, 0.09, ARCH_H, DARK, 8);
      post.geometry.translate(0, ARCH_H / 2, 0);
      return post;
    });
    const lamp = ball(0.11, 0xffd27a);
    (lamp.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
    lamp.position.y = ARCH_H + 0.06;
    glowTag(lamp, 0.7);
    this.lamps.push(lamp.material as THREE.MeshLambertMaterial);
    const cap = cyl(0.14, 0.1, 0.06, DARK, 8);
    cap.position.y = ARCH_H + 0.2;
    // The lantern casts real light at night: it hangs in front of Reed and above him, so it lights his face for
    // whoever comes down the lane, and the head of the wharf with him.
    const glow = new THREE.PointLight(0xffc266, 0, 11, 1.6);
    glow.position.y = ARCH_H - 0.15;
    this.lights.push(glow);
    g.add(lamp, cap, glow);
    // A lifebuoy (a cream ring with red bands) hung on the beach-side post's outer side, clear of the way through,
    // facing up the lane.
    const BUOY_X = -HALF - 0.24;
    const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 16), mat(0xe8e0d0));
    buoy.position.set(BUOY_X, 1.25, 0.16);
    buoy.castShadow = true;
    g.add(buoy);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const band = rbox(0.2, 0.2, 0.12, 0xc0453a, 0.02);
      band.position.set(BUOY_X + Math.sin(a) * 0.28, 1.25 + Math.cos(a) * 0.28, 0.16);
      band.rotation.z = -a;
      g.add(band);
    }
  }

  /**
   * What stands on Reed's wharf: a mooring pile off its face for each of the plane's floats, with a line to the
   * float's bow, a coil of rope on the boards, and two fuel drums and a crate across its far end. The piles
   * stand in the water a step off the boards, out of reach like the quay's lamp piles, so they need no collider.
   */
  private buildWharf(p: Spot): void {
    const w = REED_WHARF;
    const ROPE = 0xc8b07a;
    const sin = Math.sin(p.facing);
    const cos = Math.cos(p.facing);
    for (const sx of [-0.95, 0.95]) {
      // The float's bow, in the plane's own frame (`buildSeaplane`).
      const bow = new THREE.Vector3(p.x + sx * cos + 2.42 * sin, 0.34, p.z - sx * sin + 2.42 * cos);
      const px = w.x1 + 0.25;
      const pile = cyl(0.1, 0.12, 3.3, DARK, 7);
      this.at(pile, px, bow.z, 0, -0.5);
      const hitch = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 12), mat(ROPE));
      hitch.rotation.x = Math.PI / 2;
      this.at(hitch, px, bow.z, 0, 0.92);
      this.group.add(limb(new THREE.Vector3(px + 0.1, 0.92, bow.z), bow, 0.025, ROPE));
    }
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 14), mat(ROPE));
    coil.rotation.x = Math.PI / 2;
    coil.castShadow = true;
    this.at(coil, w.x1 - 0.5, p.z + 2.2, 0, DOCK_TOP + 0.07);
    this.drum(w.x0 + 0.45, w.z0 + 0.42);
    this.drum(w.x0 + 1.08, w.z0 + 0.5);
    const crate = rbox(0.6, 0.5, 0.6, WOOD, 0.04);
    this.at(crate, w.x1 - 0.5, w.z0 + 0.5, 0.3, DOCK_TOP + 0.25);
    this.solid(w.x1 - 0.5, w.z0 + 0.5, 0.42);
  }

  /** A fuel drum in the seaplane's sea green with its red band; on a dock it stands on the deck. */
  private drum(x: number, z: number): void {
    const g = new THREE.Group();
    const body = cyl(0.27, 0.27, 0.82, 0x6f9e96, 12);
    body.position.y = 0.41;
    const band = cyl(0.278, 0.278, 0.14, 0xc0453a, 12);
    band.position.y = 0.55;
    g.add(body, band);
    this.at(g, x, z, 0, standHeight(x, z));
    this.solid(x, z, 0.3);
  }

  /** The skip sign by the stone pile on Skipper's Beach, whose face `Skipping` rewrites with the day's best. */
  skipSign: Writable | null = null;

  /** The Furthest Out board by the seaplane (D6); `setFurthest` redraws it from the server's rows. */
  furthest: FurthestBoard | null = null;

  private buildFurthest(s: Spot): void {
    const b = (this.furthest = new FurthestBoard());
    this.lamps.push(b.lamp);
    this.at(b.group, s.x, s.z, s.facing, groundHeight(s.x, s.z) - 0.05);
    for (const lx of BOARD_POSTS) this.solid(s.x + lx * Math.cos(s.facing), s.z - lx * Math.sin(s.facing), 0.3);
  }

  /** Redraws the Furthest Out board, if this map has one. */
  setFurthest(rows: FurthestRow[]): void {
    this.furthest?.set(rows);
  }

  /** The seaplane bobbing in the shallows, kept out of the town's merge so it can move; `update` rocks it. */
  plane: THREE.Group | null = null;

  private buildSeaplane(s: Spot): void {
    const CREAM = 0xf3ead8, GREEN = 0x6f9e96, RED = 0xc0453a, GLASS = 0x34465e, METAL = 0x3a3532;
    const g = new THREE.Group();
    // Local frame: the nose points to +z, the waterline is y = 0, and +x is the plane's left (port).
    for (const sx of [-0.95, 0.95]) {
      const float = rbox(0.38, 0.34, 4.2, CREAM, 0.1);
      float.position.set(sx, 0.08, -0.1);
      const tip = rbox(0.36, 0.3, 0.7, CREAM, 0.1);
      tip.position.set(sx, 0.17, 2.15);
      tip.rotation.x = -0.35;
      const stripe = rbox(0.4, 0.05, 4.0, GREEN, 0.02);
      stripe.position.set(sx, 0.25, -0.1);
      g.add(float, tip, stripe);
      for (const z of [1.0, -0.8]) g.add(limb(new THREE.Vector3(sx, 0.2, z), new THREE.Vector3(sx * 0.45, 1.0, z), 0.04, METAL));
    }
    const cabin = rbox(1.0, 1.05, 2.4, CREAM, 0.12);
    cabin.position.set(0, 1.45, 0.35);
    const cowl = cyl(0.36, 0.48, 0.8, GREEN, 12);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 1.42, 1.95);
    const spinner = cyl(0.03, 0.15, 0.28, RED, 10);
    spinner.rotation.x = Math.PI / 2;
    spinner.position.set(0, 1.42, 2.48);
    const blade = rbox(0.14, 1.6, 0.05, METAL, 0.02);
    blade.position.set(0, 1.42, 2.4);
    blade.rotation.z = 0.5;
    // The tail boom tapers from the cabin's back to the tail, along its top edge.
    const boom = cyl(0.42, 0.14, 2.3, CREAM, 8);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 1.6, -2.0);
    const wing = rbox(7.6, 0.12, 1.3, GREEN, 0.05);
    wing.position.set(0, 2.04, 0.6);
    const stab = rbox(2.4, 0.08, 0.7, GREEN, 0.03);
    stab.position.set(0, 1.68, -2.9);
    const fin = rbox(0.08, 1.0, 0.85, GREEN, 0.03);
    fin.position.set(0, 2.15, -2.95);
    fin.rotation.x = -0.25;
    const finBand = rbox(0.1, 0.16, 0.8, RED, 0.02);
    finBand.position.set(0, 2.42, -3.02);
    finBand.rotation.x = -0.25;
    const shield = rbox(0.82, 0.34, 0.04, GLASS, 0.02);
    shield.position.set(0, 1.74, 1.56);
    g.add(cabin, cowl, spinner, blade, boom, wing, stab, fin, finBand, shield);
    for (const sx of [-1, 1]) {
      for (const z of [1.0, 0.25]) {
        const pane = rbox(0.04, 0.34, 0.55, GLASS, 0.02);
        pane.position.set(sx * 0.505, 1.72, z);
        g.add(pane);
      }
      g.add(limb(new THREE.Vector3(sx * 0.5, 1.05, 0.6), new THREE.Vector3(sx * 2.4, 1.98, 0.6), 0.035, METAL));
    }
    // Wingtip lights, port red and starboard green, glowing at night like the lamps.
    for (const [sx, c] of [[3.8, 0xe0503a], [-3.8, 0x4ac06a]] as const) {
      const light = ball(0.08, c);
      (light.material as THREE.MeshLambertMaterial).emissive.set(c);
      light.position.set(sx, 2.04, 0.6);
      this.lamps.push(light.material as THREE.MeshLambertMaterial);
      g.add(light);
    }
    mergeStatic(g, []);
    // A red band lettered CHARTERS down each side of the cabin, under the windows.
    const band = textPlane(2.2, 0.3, 512);
    band.ctx.fillStyle = '#c0453a';
    band.ctx.fillRect(0, 0, 512, band.ctx.canvas.height);
    band.ctx.fillStyle = '#fff3d6';
    band.ctx.font = `800 ${Math.round(band.ctx.canvas.height * 0.62)}px system-ui, sans-serif`;
    band.ctx.textAlign = 'center';
    band.ctx.textBaseline = 'middle';
    band.ctx.fillText('CHARTERS', 256, band.ctx.canvas.height / 2 + 2);
    band.tex.needsUpdate = true;
    band.mesh.material = mat(0xffffff, { map: band.tex });
    for (const sx of [-1, 1]) {
      const side = band.mesh.clone();
      side.position.set(sx * 0.508, 1.22, 0.35);
      side.rotation.y = (sx * Math.PI) / 2;
      g.add(side);
    }
    g.rotation.order = 'YXZ';
    this.at(g, s.x, s.z, s.facing, 0);
    this.plane = g;
    // The floats' tips and the nose, a step off the wharf's face.
    const sin = Math.sin(s.facing);
    const cos = Math.cos(s.facing);
    for (const [lx, lz, r] of [[-0.95, 2.1, 0.45], [0.95, 2.1, 0.45], [0, 2.3, 0.55], [-0.95, 0.8, 0.45], [0.95, 0.8, 0.45]] as const) {
      this.solid(s.x + lx * cos + lz * sin, s.z - lx * sin + lz * cos, r);
    }
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

  /** A picket fence between two points. */
  private fence(x0: number, z0: number, x1: number, z1: number): void {
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
  }

  private buildFences(): void {
    // A picket fence along each side of the main street's northern stretch and in front of the end cottages.
    this.fence(-3.6, 44, -3.6, 51.5);
    this.fence(3.6, 44, 3.6, 51.5);
    this.fence(-3.6, 51.5, -6.3, 51.5);
    this.fence(3.6, 51.5, 6.3, 51.5);
  }

  /** A stack of split logs, three rows high. */
  private woodpile(x: number, z: number, facing: number): void {
    const g = new THREE.Group();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 4 - r; i++) {
        const l = cyl(0.09, 0.09, 0.9, 0x7a5230, 6);
        l.rotation.z = Math.PI / 2;
        l.position.set((i - (3 - r) / 2) * 0.2, 0.1 + r * 0.17, 0);
        g.add(l);
      }
    }
    this.at(g, x, z, facing);
  }

  /**
   * A lantern on an arm, as on the town's lamp posts: the arm runs out along x (`dir` 1 or -1) from a post at `x`,
   * `h` up, and the lantern hangs from its end. Lit at night.
   */
  private armLantern(g: THREE.Group, x: number, h: number, dir: number): THREE.Mesh {
    const arm = rbox(0.5, 0.05, 0.05, DARK, 0.01);
    arm.position.set(x + dir * 0.22, h, 0);
    const lantern = rbox(0.24, 0.3, 0.24, 0xffd27a, 0.05);
    (lantern.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
    this.lamps.push(lantern.material as THREE.MeshLambertMaterial);
    lantern.position.set(x + dir * 0.45, h - 0.2, 0);
    glowTag(lantern, 0.75);
    const cap = cyl(0.01, 0.16, 0.12, DARK, 6);
    cap.position.set(x + dir * 0.45, h + 0.02, 0);
    g.add(arm, lantern, cap);
    return lantern;
  }

  private lampPost(x: number, z: number, light: boolean): void {
    const g = new THREE.Group();
    const pole = cyl(0.045, 0.065, 2.3, DARK, 8);
    pole.position.y = 1.15;
    g.add(pole);
    const lantern = this.armLantern(g, 0, 2.3, 1);
    if (light) {
      const l = new THREE.PointLight(0xffc266, 0, 12, 1.6);
      l.position.copy(lantern.position);
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
    glowTag(light, 1.4, 1, true);
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

  /**
   * A string of bulbs from (ax, az) to (bx, bz), `h` above the ground at each end. It hangs between two posts of
   * its own, or, given `masts` (the height above the ground where each one starts), from thin masts on top of
   * something that stands there already, which leaves nothing new to walk round. With `posts` off it hangs from
   * posts built elsewhere (the campfire's crown).
   */
  private stringLights(ax: number, az: number, bx: number, bz: number, h: number, masts?: [number, number], posts = true): void {
    // A bulb about every half metre, with the sag of a short string.
    const n = Math.max(8, Math.round(Math.hypot(bx - ax, bz - az) * 2));
    if (posts) [[ax, az], [bx, bz]].forEach(([x, z], i) => {
      const from = masts?.[i] ?? 0;
      const post = masts ? cyl(0.03, 0.035, h - from, DARK, 6) : cyl(0.05, 0.06, h, DARK, 6);
      this.at(post, x, z, 0, groundHeight(x, z) + (h + from) / 2);
      if (!masts) this.solid(x, z, 0.15);
    });
    // Straight from one post top to the other, so a string across a slope hangs like one.
    const ya = groundHeight(ax, az) + h;
    const yb = groundHeight(bx, bz) + h;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const x = ax + (bx - ax) * k;
      const z = az + (bz - az) * k;
      const y = ya + (yb - ya) * k - Math.sin(k * Math.PI) * 0.45;
      const b = ball(0.07, BULBS[i % 4]);
      (b.material as THREE.Material).dispose();
      b.material = this.bulb(BULBS[i % 4]);
      this.at(b, x, z, 0, y);
      // The bulb is baked into its string's mesh, so a bare marker carries its halo.
      const halo = new THREE.Object3D();
      glowTag(halo, 0.3, 0.7, false, b.material as THREE.MeshLambertMaterial);
      this.at(halo, x, z, 0, y);
    }
  }

  /** A string light's bulb material: one for each colour, lit at night, so `mergeStatic` bakes all the bulbs of a colour in a merge cell into one draw. */
  private bulb(color: number): THREE.MeshLambertMaterial {
    let m = this.bulbMats.get(color);
    if (!m) {
      this.bulbMats.set(color, (m = mat(color, { emissive: color })));
      this.lamps.push(m);
    }
    return m;
  }

  /** Lamp posts, flower pots, benches, picnic spots and string lights that make the town feel lived in (docs/map-rework/harbour.json). */
  private buildCozy(): void {
    // The village's lamp posts up the street from the square to the gate and on the ring lanes; three carry a point
    // light, with the hub's five (hub.ts) making the map's eight.
    const posts = [[3.6, 36.5, false], [-3.6, 36.5, true], [2.8, 48.5, true], [-2.8, 48.5, false], [-2.8, 54, true], [2.8, 54, false], [-11, 40.5, false], [11.5, 44, false], [-17.6, 19.5, false], [19.6, 20, false]] as const;
    for (const [x, z, lit] of posts) this.lampPost(x, z, lit);
    for (const b of this.map.town.benches) this.bench(b.x, b.z, b.facing);
    this.pot(-3.6, 29.5);
    this.pot(3.6, 29.5);
    this.pot(-3.6, 34.5);
    this.pot(3.6, 34.5);
    this.pot(-8.5, 19);
    this.pot(6.3, 23);
    // Beside the bench at the quay's east end.
    this.pot(12.45, 13.4);
    // A picnic blanket on the slope above Reed's lane (the campfire headland is too narrow for a second one).
    this.blanket(-15, 16.5, -0.3);
    // String lights over the mouth of the main street between the two stalls, over the square and at the gate (the
    // campfire's hang round its terrace, `buildCamp`). The stalls' string hangs from a pole beside Marlow's shack, tied
    // to its wall (`LIGHTS_MAST`, baitshop.ts), and a mast on the Smokehouse's street-side front post
    // (`buildSmokehouse`), so no post stands on the quay road.
    // Play-test: the posts and the height.
    const sh = this.map.smokehouse;
    if (sh) {
      const { shop } = this.map.vendor;
      const corner = (s: Spot, lx: number, lz: number, top: number): [number, number, number] => {
        const x = s.x + lx * Math.cos(s.facing) + lz * Math.sin(s.facing);
        const z = s.z - lx * Math.sin(s.facing) + lz * Math.cos(s.facing);
        return [x, z, standHeight(s.x, s.z) + top - groundHeight(x, z)];
      };
      const [ax, az, a] = corner(shop, LIGHTS_MAST.x, LIGHTS_MAST.z, 0);
      const [bx, bz, b] = corner(sh, 3.4 / 2 - 0.08, 0.25, 2.3);
      this.stringLights(ax, az, bx, bz, 3.3, [a, b]);
    }
    this.stringLights(-4, 32, 4, 32, 3.3);
    this.stringLights(-3.4, 54.5, 3.4, 54.5, 3.1);
    if (this.map.camp) this.buildCamp(this.map.camp);
    this.woodpile(-18.5, 31, 1.57);
  }

  /** Stands a prop (camp.ts) at a spot, turned to `facing`, with its colliders; on the ground or the deck there unless `y` is given. */
  private prop(p: { group: THREE.Object3D; solids?: [number, number, number][] }, x: number, z: number, facing = 0, y = standHeight(x, z)): void {
    this.at(p.group, x, z, facing, y);
    const sin = Math.sin(facing);
    const cos = Math.cos(facing);
    for (const [lx, lz, r] of p.solids ?? []) this.solid(x + lx * cos + lz * sin, z - lx * sin + lz * cos, r);
  }

  /** A row of colliders along a polyline, close enough together that nobody slips between two. */
  private solidRow(points: [number, number][], r: number): void {
    for (let i = 0; i + 1 < points.length; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (r * 2)));
      for (let k = i ? 1 : 0; k <= n; k++) this.solid(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, r);
    }
  }

  /**
   * Anglers' Rest (`CampDef` in maps.ts), the campfire's camp, on its level floor. The terrace: a kerb of flat stones
   * round the cobbles, which gives way at the stall's bay to an apron of cobbles; log seats for two round the fire and
   * on the beach; a low stone seat wall with a plank top along the cove-side rim, with the lantern's pier at its
   * middle and a stone ledge outside it down to the water; and the crown of lights, tall posts round the rim with one
   * run of bulbs from post to post, closed over the way in by the gate arch's post. Behind it the retaining wall, the
   * hedge and the picket fence; the stall in its bay, a flower bed behind Thank You and one in the bay past Deep Sea; the gate arch across the lane
   * and the signpost where the lanes meet; and down the steps, the beach's Totem, stones and sign and the jetty's
   * rocket rack. The boards and the fire itself are the hub's (hub.ts). Two lights that cast: the stall's lantern
   * and the beach's.
   */
  private buildCamp(camp: CampDef): void {
    const fire = this.map.campfire;
    const { x: cx, z: cz } = fire;
    const y = groundHeight(cx, cz);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const spot = (deg: number, r: number): [number, number] => {
      const p = atBearing(fire, r, deg);
      return [p.x, p.z];
    };
    /** The lower of the ground and the mesh that draws it, so nothing set on a bank floats: in the map's frame, and in the fire's for the props built round it. */
    const lie = (x: number, z: number) => Math.min(groundHeight(x, z), terrainHeight(x, z));
    const round = (x: number, z: number) => lie(cx + x, cz + z);
    /** Stands a prop built round the fire (an arc, in bearings) where it belongs. */
    const ring = (p: { group: THREE.Object3D; solids: [number, number, number][] }) => this.prop(p, cx, cz, 0, 0);
    const stone = this.painted(0xb4ada2, stoneTexture());
    /** The wall's middle line; the crown's posts stand on it too. */
    const mid = campRim(camp);

    // The kerb: one course of flat stones laid round the cobbles, the stone texture wrapped round it, from one side of
    // the stall's bay round to the other. A ring's angle is its bearing less 90°.
    const turn = rad(360 - (camp.apron.to - camp.apron.from));
    const kerb = new THREE.RingGeometry(camp.r, camp.r + 0.3, 64, 1, rad(camp.apron.to - 90), turn).rotateX(-Math.PI / 2);
    const ku = kerb.getAttribute('uv');
    const reps = Math.round((turn * (camp.r + 0.15)) / 1.4);
    // 65 vertices round the inner edge, then 65 round the outer: one row of the texture's stones across the band.
    for (let i = 0; i < ku.count; i++) ku.setXY(i, ((i % 65) / 64) * reps, i < 65 ? 0 : 0.25);
    const kerbMesh = new THREE.Mesh(kerb, mat(0xb4ada2, { map: stoneTexture(), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    kerbMesh.receiveShadow = true;
    this.at(kerbMesh, cx, cz, 0, y + 0.05);
    // Its two faces, down into the ground: the outer one, so the floor has a stone edge where its bank falls away,
    // and the inner one, so the kerb stands on the cobbles where the ground's mesh dips under it.
    const faces: [number, THREE.MeshLambertMaterial][] = [[camp.r + 0.3, stone], [camp.r, mat(0xb4ada2, { map: stoneTexture(), side: THREE.BackSide })]];
    for (const [r, m] of faces) {
      const face = new THREE.CylinderGeometry(r, r, 0.3, 64, 1, true, rad(camp.apron.to), turn);
      const fu = face.getAttribute('uv');
      for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) * reps, fu.getY(i) * 0.25);
      const faceMesh = new THREE.Mesh(face, m);
      faceMesh.receiveShadow = true;
      this.at(faceMesh, cx, cz, 0, y - 0.1);
    }
    // The apron in the bay: the terrace's cobbles carried on past the kerb's line to the stall's front.
    this.disc(cx, cz, camp.apron.r, 12, [camp.r - 0.1, camp.apron.from, camp.apron.to]);

    // The seat wall: an arc of stone from one end to the other, its foot well into the bank that falls away behind it.
    // The planks on its top are 0.06 m thick: their tops are the seat (`SEAT_TOP.wall`).
    const WALL = SEAT_TOP.wall - 0.06;
    const { from, to } = camp.seatWall;
    const shape = new THREE.Shape();
    // Drawn in the shape's x-y plane and turned flat, so its angles are bearings less 90° too.
    shape.absarc(0, 0, mid + 0.22, rad(from - 90), rad(to - 90), false);
    shape.absarc(0, 0, mid - 0.22, rad(to - 90), rad(from - 90), true);
    shape.closePath();
    const FOOT = 0.35;
    const wall = new THREE.Mesh(boxUV(new THREE.ExtrudeGeometry(shape, { depth: WALL + FOOT, bevelEnabled: false, curveSegments: 48 }).rotateX(-Math.PI / 2), 1.6), stone);
    wall.castShadow = wall.receiveShadow = true;
    this.at(wall, cx, cz, 0, y - FOOT);
    // Its seat: planks laid end to end along the top (`seatPlanks`), one sitter to a plank.
    for (const p of seatPlanks(camp)) {
      const plank = rbox(2 * mid * Math.sin(p.len / mid / 2) - 0.03, 0.06, 0.5, WOOD, 0.02);
      this.at(plank, ...spot(p.deg, mid), rad(p.deg), y + WALL + 0.03);
    }
    // Solid from end to end: a row of circles along it, the first and last just inside its ends.
    for (let i = 0, n = Math.ceil((rad(to - from - 4) * mid) / 0.45); i <= n; i++) this.solid(...spot(from + 2 + ((to - from - 4) * i) / n, mid), 0.27);
    // The lantern's pier, where the planks leave the wall's stone bare: the lantern at the front of its cap, toward
    // the fire, and the crown's post there at the back of it.
    const PIER_POST = 0.17;
    const pier = buildLanternPier(PIER_POST);
    this.lamps.push(...pier.lamps);
    this.prop(pier, camp.pier.x, camp.pier.z, camp.pier.facing, y);
    // The wall's footing: a battered face of stone laid on the rim's bank, from the wall's foot out and down to the
    // water's edge, in the wall's courses. From the pier the terrace is a plinth with the fire on it.
    const { rimFace } = camp;
    const [fTop, fFoot] = [y + 0.08, -0.1];
    const span = rad(rimFace.to - rimFace.from);
    const footing = new THREE.CylinderGeometry(mid + 0.2, mid + 0.2 + rimFace.w, fTop - fFoot, 48, 1, true, rad(rimFace.from), span);
    const fuv = footing.getAttribute('uv');
    const along = Math.round((span * (mid + 0.2 + rimFace.w / 2)) / 1.4);
    const courses = Math.hypot(rimFace.w, fTop - fFoot) / 1.2;
    for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * along, fuv.getY(i) * courses);
    const footingMesh = new THREE.Mesh(footing, stone);
    footingMesh.receiveShadow = true;
    this.at(footingMesh, cx, cz, 0, (fTop + fFoot) / 2);
    // It is solid, and so are the shallows at its foot, which are too narrow to wade: out to where the water is over
    // a player's ankles.
    const arcRow = (r: number, a: number, b: number): [number, number][] => {
      const n = Math.ceil((rad(b - a) * r) / 0.8);
      return Array.from({ length: n + 1 }, (_, i) => spot(a + ((b - a) * i) / n, r));
    };
    this.solidRow(arcRow(mid + 0.65, rimFace.from + 2, rimFace.to - 2), 0.45);
    this.solidRow(arcRow(mid + 1.3, rimFace.from + 10, rimFace.to - 20), 0.45);

    // The crown: posts as tall as the bulbs hang, on the wall's line, and the gate arch's post nearer the fire; then
    // one run of bulbs from each post to the next, all the way round. Tall enough that the bulbs clear the catch
    // boards' roofs, which stand under them.
    const H = 3.9;
    const { arch } = camp;
    const [gate] = archPosts(arch, fire);
    const bearing = (p: { x: number; z: number }) => ((Math.atan2(p.x - cx, p.z - cz) * 180) / Math.PI + 360) % 360;
    const crown = camp.crown.map((deg) => ({ deg, ...atBearing(fire, deg === camp.seatWall.pier ? mid + PIER_POST : mid, deg) }));
    for (const p of crown) this.prop(buildCrownPost(H), p.x, p.z, 0, y);
    const posts = [...crown, { deg: bearing(gate), ...gate }].sort((a, b) => a.deg - b.deg);
    posts.forEach((p, i) => {
      const next = posts[(i + 1) % posts.length];
      this.stringLights(p.x, p.z, next.x, next.z, H, undefined, false);
    });
    // The gate arch, ANGLERS' REST, across the lane: its posts are the crown's, with a lantern on an arm outside each.
    const gateArch = this.arch(arch, "ANGLERS' REST", arch.w / 2, 2.1, () => buildCrownPost(H).group);
    for (const side of [-1, 1]) this.armLantern(gateArch, (side * arch.w) / 2, 2.45, side);

    // The log seats: round the fire they lie along its ring, on the beach as the map turns them.
    for (const l of campLogs(this.map)) {
      const log = cyl(LOG.thick, LOG.thick, LOG.len, 0x7a5232, 9);
      log.rotation.z = Math.PI / 2;
      const seat = new THREE.Group();
      seat.add(log);
      this.at(seat, l.x, l.z, l.facing, standHeight(l.x, l.z) + LOG.rest);
      for (const side of LOG.solids) this.solid(l.x + side * Math.cos(l.facing), l.z - side * Math.sin(l.facing), LOG.r);
    }
    this.seats.push(...campSeats(this.map));
    // The band's instruments (src/data/band.ts), each waiting at the end of its fire log until someone sits there
    // (`setBand`). They are props to walk past: no collider and no light.
    campStands(this.map).forEach((s, i) => {
      const id = INSTRUMENTS[i]?.id;
      if (!id) return;
      const inst = restInstrument(id, camp.logs.stands[i]);
      this.at(inst.group, s.x, s.z, s.facing, standHeight(s.x, s.z));
      this.instruments.push(inst.group);
    });

    // Behind the panels: the retaining wall that holds the cut bank, either side of the stall's back; the hedge
    // behind it, planted at the wall's foot and clipped a metre above its top, with a stone pier a little taller at
    // each of its ends; and the picket fence behind that, on the bank, which runs on from one pier to the gate's
    // outer post and from the other down the beach's east end into the shallows.
    const WALL_H = 0.9;
    for (const w of camp.wall) ring(buildStoneArc(w.r, w.from, w.to, WALL_H, 0.6, round));
    ring(buildHedgeArc(camp.hedge.r, camp.hedge.from, camp.hedge.to, WALL_H + 1, 0.7, round));
    // Each pier is as wide as the hedge and a hand taller, its foot on the lowest ground under it.
    for (const p of camp.piers) {
      const base = Math.min(...[-0.3, 0.3].flatMap((dx) => [-0.3, 0.3].map((dz) => lie(p.x + dx, p.z + dz))));
      this.prop(buildGatePier(0.75, y + WALL_H + 1.1 - base), p.x, p.z, p.facing, base);
    }
    const { arc, runs } = camp.fence;
    const steps = Math.ceil((rad(arc.to - arc.from) * arc.r) / 0.8);
    const fence: [number, number][][] = [
      Array.from({ length: steps + 1 }, (_, i) => spot(arc.from + ((arc.to - arc.from) * i) / steps, arc.r)),
      ...runs.map((r) => [r.from, ...(r.via ?? []), r.to]),
    ];
    fence.forEach((line, i) => {
      this.group.add(buildPicketRun(line, terrainHeight).group);
      // The runs are thin, so the one that ends at the arch's post leaves the lane its width.
      this.solidRow(line, i ? 0.18 : 0.3);
    });
    // The low wall the beach's sand ends at, its foot on the beach's level: along the beach's back it holds the turf
    // behind the panels, a step high on the turf's side, and round the east end the bank under the fence.
    const [bx, bz] = spot(180, camp.r + 2.5);
    const beach = groundHeight(bx, bz);
    for (const run of camp.beachWall) this.prop(buildStoneRun(run, y + 0.3 - beach, 0.35, () => beach), 0, 0, 0, 0);
    this.flowerBed(camp.flowers);
    this.flowerBed(camp.bayBed);
    // The bay bed's wall, thinner than the beach wall it runs on from, with the same top.
    this.prop(buildStoneRun(camp.bayWall, y + 0.3 - beach, 0.25, () => beach), 0, 0, 0, 0);
    this.relayCamp(camp);

    // The stall in its bay, Bram's Kettle; its lantern under the awning casts light.
    const stall = buildKettleStall();
    this.lamps.push(...stall.lamps);
    const light = new THREE.PointLight(0xffc266, 0, 11, 1.6);
    stall.lantern.add(light);
    this.lights.push(light);
    this.prop(stall, camp.stall.x, camp.stall.z, camp.stall.facing, y);

    // The beach's lantern on its short stone pier by the foot of the steps, which casts the beach's light.
    const bl = camp.beachLantern;
    const beachLantern = buildLanternPier();
    this.lamps.push(...beachLantern.lamps);
    const beachLight = new THREE.PointLight(0xffc266, 0, 10, 1.6);
    beachLight.position.y = 0.9;
    beachLantern.group.add(beachLight);
    this.lights.push(beachLight);
    this.prop(beachLantern, bl.x, bl.z, bl.facing, lie(bl.x, bl.z) - 0.03);
    // The steps down to the beach, their top tread level with the kerb; the Totem on the beach's west tip, the
    // skipping stones and their sign at its east end; the rocket rack at the jetty's end.
    const st = camp.steps;
    this.prop(buildSteps(st.w, st.rise, st.treads), st.x, st.z, st.facing, y + 0.05);
    this.prop(buildTotem(), camp.totem.x, camp.totem.z, camp.totem.facing, lie(camp.totem.x, camp.totem.z) - 0.03);
    this.prop(buildStonePile(), camp.stones.x, camp.stones.z, 0, lie(camp.stones.x, camp.stones.z));
    this.skipSign = buildSkipSign();
    this.prop(this.skipSign, camp.skipSign.x, camp.skipSign.z, camp.skipSign.facing, lie(camp.skipSign.x, camp.skipSign.z) - 0.05);
    this.prop(buildRocketRack(), camp.rack.x, camp.rack.z, camp.rack.facing);
    // The signpost where the lanes meet, tall enough to walk under its fingers.
    const sp = camp.signpost;
    this.prop(buildSignpost(sp.fingers.map((f) => f.text), sp.fingers.map((f) => f.yaw), 3), sp.x, sp.z, sp.facing, lie(sp.x, sp.z) - 0.1);
  }

  /**
   * The camp's turf and its beach's sand, relaid over the terrain (`relay`) so each keeps its edge: the turf from the
   * kerb out to the retaining wall's foot or, by the lane, to the fence's run to the gate; the sand from the kerb out
   * into the water or, at the beach's east end, to the fence.
   */
  private relayCamp(camp: CampDef): void {
    const fire = this.map.campfire;
    const at = (r: number, deg: number): [number, number] => {
      const p = atBearing(fire, r, deg);
      return [p.x, p.z];
    };
    /** How far out from the fire, at a bearing, a polyline is crossed; `far` if it isn't. */
    const reach = (line: [number, number][], deg: number, far: number): number => {
      const [dx, dz] = [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];
      let best = far;
      for (let i = 0; i + 1 < line.length; i++) {
        const [ax, az] = [line[i][0] - fire.x, line[i][1] - fire.z];
        const [ex, ez] = [line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]];
        const det = ex * dz - ez * dx;
        if (Math.abs(det) < 1e-9) continue;
        // fire + r·d = a + t·e
        const r = (ex * az - ez * ax) / det;
        const t = (dx * az - dz * ax) / det;
        if (r > 0 && t >= 0 && t <= 1) best = Math.min(best, r);
      }
      return best;
    };
    // Each stretch stops a finger short of the stone that edges it (the kerb, the walls), so it can't show through
    // the stone's foot.
    const kerb = camp.r + 0.32;
    const sweep = (from: number, to: number, step: number, far: (deg: number) => number, near: (deg: number) => number = () => kerb): [[number, number], [number, number]][] =>
      Array.from({ length: Math.ceil((to - from) / step) + 1 }, (_, i) => {
        const deg = Math.min(to, from + i * step);
        const start = Math.max(kerb, near(deg));
        return [at(start, deg), at(Math.max(start, far(deg)), deg)];
      });
    const [toGate, down] = camp.fence.runs.map((r) => [r.from, ...(r.via ?? []), r.to] as [number, number][]);
    const foot = camp.wall[0].r - 0.32;
    // The beach steps are stone: no sand is laid over them, across their width and down to their foot.
    const st = camp.steps;
    const onSteps = (x: number, z: number): boolean => {
      const across = (x - st.x) * Math.cos(st.facing) - (z - st.z) * Math.sin(st.facing);
      const down = (x - st.x) * Math.sin(st.facing) + (z - st.z) * Math.cos(st.facing);
      return Math.abs(across) < st.w / 2 + 0.05 && down > -1 && down < (st.treads - 0.5) * STEP_DEPTH + 0.03;
    };
    const { turf } = camp;
    const [back, east] = camp.beachWall;
    /** A point `r` m out at the turf's last bearing and `off` m past it, toward the beach. */
    const past = (r: number, off: number): [number, number] => {
      const [x, z] = at(r, turf.to);
      return [x + off * Math.cos((turf.to * Math.PI) / 180), z - off * Math.sin((turf.to * Math.PI) / 180)];
    };
    const fromFire = ([x, z]: [number, number]) => Math.hypot(x - fire.x, z - fire.z);
    const bearingOf = ([x, z]: [number, number]) => (Math.atan2(x - fire.x, z - fire.z) * 180) / Math.PI;
    // The turf's lip: from its last bearing on to the back wall's inner face, level with the terrace, over the bank
    // that falls to the beach there.
    const lipEnd = fromFire(back[1]) - 0.1;
    const lip: [[number, number], [number, number]][] = Array.from({ length: Math.ceil((lipEnd - kerb) / 0.5) + 1 }, (_, i) => {
      const r = Math.min(lipEnd, kerb + i * 0.5);
      return [at(r, turf.to), past(r, turf.lip - 0.2)];
    });
    // The bank between the east wall and the fence behind it: the wall's points and the fence's, pair by pair.
    const bank: [[number, number], [number, number]][] = [];
    for (let i = 0; i + 1 < east.length; i++) {
      const n = Math.ceil(Math.hypot(east[i + 1][0] - east[i][0], east[i + 1][1] - east[i][1]) / 0.5);
      for (let k = i ? 1 : 0; k <= n; k++) {
        const mix = (p: [number, number], q: [number, number]): [number, number] => [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n];
        bank.push([mix(east[i], east[i + 1]), mix(down[i], down[i + 1])]);
      }
    }
    // The sand starts at the back wall's beach face, where a line out from the fire crosses it, and ends at the east
    // wall, the fence past the wall's end, or out in the water.
    const face: [number, number][] = [past(kerb - 0.6, turf.lip + 0.2), past(lipEnd + 0.15, turf.lip + 0.2)];
    const edge: [number, number][] = [...east, ...down.slice(-2)];
    this.relay([
      // The turf's first row runs along the lane's cobbles, from the kerb to the gate's outer post. By the lane it
      // runs out to the fence, and from the retaining wall's start to the wall's foot.
      { turf: true, rows: [[at(kerb, turf.from), toGate[toGate.length - 1]], ...sweep(turf.from, turf.to, 3, (deg) => (deg < camp.wall[0].from ? reach(toGate, deg, foot) : foot))] },
      { turf: true, rows: lip, level: groundHeight(fire.x, fire.z) + GROUND_LIFT },
      { turf: true, rows: bank },
      { turf: false, rows: sweep(bearingOf(face[1]), camp.sand.to, 1, (deg) => reach(edge, deg, camp.sand.r) - 0.1, (deg) => reach(face, deg, kerb)), hole: onSteps },
    ]);
  }

  /**
   * Relays stretches of the ground on a fine grid over the terrain's mesh, in the terrain's own colours and texture
   * (`buildTerrain` in world.ts): turf as grass whatever its height, or bare sand. The terrain's colours fade across
   * a whole cell of its mesh, a metre and more, which draws a sawtooth where turf meets sand; relaid, each keeps a
   * clean edge. A stretch is laid from one row to the next, each row a line from one point to another; it leaves out
   * whatever touches its `hole`. Given a `level`, each row climbs from the ground at its first point to that height
   * at its last, which bridges a bank.
   */
  private relay(stretches: { turf: boolean; rows: [[number, number], [number, number]][]; hole?: (x: number, z: number) => boolean; level?: number }[]): void {
    const loc = LOCATIONS.find((l) => l.id === this.map.locationId)!;
    const grass = new THREE.Color(loc.grass);
    const sand = new THREE.Color(loc.sand);
    const c = new THREE.Color();
    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (const s of stretches) {
      const across = Math.max(1, Math.ceil(Math.max(...s.rows.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]))) / 0.5));
      const base = pos.length / 3;
      for (const [a, b] of s.rows) {
        const start = terrainHeight(a[0], a[1]) + GROUND_LIFT;
        for (let k = 0; k <= across; k++) {
          const x = a[0] + ((b[0] - a[0]) * k) / across;
          const z = a[1] + ((b[1] - a[1]) * k) / across;
          const y = s.level === undefined ? terrainHeight(x, z) : start + ((s.level - start) * k) / across - GROUND_LIFT;
          pos.push(x, y + GROUND_LIFT, z);
          if (s.turf) c.copy(grass).multiplyScalar(0.88 + 0.24 * (Math.sin(x * 0.4) * Math.cos(z * 0.37) * 0.5 + 0.5));
          else c.copy(sand).multiplyScalar(0.65 + 0.35 * smooth(-1.2, 0.4, y));
          col.push(c.r, c.g, c.b);
          uv.push(x / 3.2, z / 3.2);
        }
      }
      for (let i = 0; i + 1 < s.rows.length; i++) {
        for (let k = 0; k < across; k++) {
          const p = base + i * (across + 1) + k;
          const q = p + across + 1;
          if (s.hole && [p, p + 1, q, q + 1].some((v) => s.hole!(pos[v * 3], pos[v * 3 + 2]))) continue;
          idx.push(p, p + 1, q, p + 1, q + 1, q);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(0xffffff, { vertexColors: true, map: groundTexture(), flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  /**
   * A curved flower bed (an arc round the campfire, `w` deep): a low border of soil, planted like the town's beds.
   * Its top stands a hand above the ground at its fire-side edge, and its soil runs down to the ground at its outer
   * edge, so a bed on a bank stands level.
   */
  private flowerBed(bed: Arc & { w: number }): void {
    const fire = this.map.campfire;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, bed.r + bed.w / 2, rad(bed.from - 90), rad(bed.to - 90), false);
    shape.absarc(0, 0, bed.r - bed.w / 2, rad(bed.to - 90), rad(bed.from - 90), true);
    shape.closePath();
    const mid = atBearing(fire, bed.r - bed.w / 2, (bed.from + bed.to) / 2);
    const top = Math.max(groundHeight(mid.x, mid.z), terrainHeight(mid.x, mid.z)) + 0.16;
    let foot = top - 0.16;
    for (let i = 0; i <= 8; i++) {
      const p = atBearing(fire, bed.r + bed.w / 2, bed.from + ((bed.to - bed.from) * i) / 8);
      foot = Math.min(foot, groundHeight(p.x, p.z), terrainHeight(p.x, p.z));
    }
    const depth = top - foot + 0.14;
    const soil = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }).rotateX(-Math.PI / 2), mat(0x6b4a2b));
    soil.castShadow = soil.receiveShadow = true;
    this.at(soil, fire.x, fire.z, 0, top - depth);
    const r = rnd(Math.floor(bed.r * 31 + bed.from * 7 + 100));
    const cols = [0xff6f91, 0xffd23a, 0xffffff, 0xc77dff, 0xff9a3c];
    const length = rad(bed.to - bed.from) * bed.r;
    for (let i = 0, n = Math.round(length * bed.w * 9); i < n; i++) {
      const p = atBearing(fire, bed.r + (r() - 0.5) * (bed.w - 0.2), bed.from + (bed.to - bed.from) * (0.03 + 0.94 * r()));
      const stem = cyl(0.015, 0.015, 0.3, 0x3f8f43, 4);
      this.at(stem, p.x, p.z, 0, top + 0.1);
      const bloom = ball(0.07, cols[Math.floor(r() * cols.length)]);
      bloom.position.y = 0.17;
      stem.add(bloom);
    }
    for (let i = 0, n = Math.ceil(length / 0.7); i <= n; i++) {
      const p = atBearing(fire, bed.r, bed.from + ((bed.to - bed.from) * i) / n);
      this.solid(p.x, p.z, bed.w / 2);
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
      holder.position.set(b.x, onDock(b.x, b.z) ? DOCK_TOP + 0.16 : groundHeight(b.x, b.z) + 0.1, b.z);
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

  /** The line this townsperson says next, with their name. */
  talk(npc: TownNpc, night: boolean): string {
    return `${npc.def.name}: "${this.nextLine(npc, night)}"`;
  }

  /** The line this townsperson says next; they stop to say it. */
  nextLine(npc: TownNpc, night: boolean): string {
    const lines = night && npc.def.nightLines ? [...npc.def.nightLines, ...npc.def.lines] : npc.def.lines;
    const line = lines[npc.next % lines.length];
    npc.next++;
    npc.walker?.listen();
    return line;
  }

  /** `you` is the local player; `others` are the other players on this map, whom walking townsfolk keep clear of too. */
  update(t: number, dt: number, you: Bystander, others: readonly Bystander[]): void {
    if (this.plane) {
      const p = this.plane;
      p.position.y = waveHeight(p.position.x, p.position.z, t) * 0.6;
      p.rotation.x = 0.015 * Math.sin(t * 1.1);
      p.rotation.z = 0.02 * Math.sin(t * 0.8 + 1);
    }
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
      const w = h.walker;
      if (w) {
        w.update(dt, you, others);
        h.pos.set(w.x, standHeight(w.x, w.z), w.z);
        h.model.position.copy(h.pos);
        h.model.rotation.y = h.yaw = w.yaw;
      }
      const dx = you.x - h.pos.x;
      const dz = you.z - h.pos.z;
      if (Math.hypot(dx, dz) < 7) {
        let a = Math.atan2(dx, dz) - h.yaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        h.head.rotation.y += (THREE.MathUtils.clamp(a, -1, 1) - h.head.rotation.y) * 0.1;
      } else h.head.rotation.y *= 0.95;
      // Idle breathing, blending into a walking bob, sway and arm swing.
      const m = w?.moving ?? 0;
      const s = Math.sin(w?.phase ?? 0);
      h.body.position.y = Math.sin(t * 1.5 + h.pos.x) * 0.01 * (1 - m) + Math.abs(s) * 0.05 * m;
      h.body.rotation.z = s * 0.05 * m;
      h.arms[0].rotation.x = s * 0.5 * m;
      h.arms[1].rotation.x = -s * 0.5 * m;
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
