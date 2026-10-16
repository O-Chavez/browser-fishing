import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FISH } from '../data/content';
import type { MapDef, Spot } from '../data/maps';
import { groundHeight } from './env';
import { buildFish } from './fishmodel';
import type { FundState } from './fund';
import type { Circle } from './player';

const mat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });
const WOOD = 0x9b7248;
const DARK = 0x5b4128;

const rbox = (w: number, h: number, d: number, color: number, r = 0.05): THREE.Mesh => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
};

const cyl = (rt: number, rb: number, h: number, color: number, seg = 14): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true;
  return m;
};

const ball = (r: number, color: number, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), mat(color));
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
};

/** Capsule limb between two points. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.Mesh {
  const dir = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, dir.length() - 2 * r), 6, 10), mat(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

function textPlane(w: number, h: number, px: number): { mesh: THREE.Mesh; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * h) / w);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }),
  );
  return { mesh, ctx: canvas.getContext('2d')!, tex };
}

function woodSign(ctx: CanvasRenderingContext2D, text: string, color = '#fff3d6'): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#3f2b19';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = color;
  ctx.font = `800 ${Math.round(h * 0.5)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 3);
}

const WHEEL_WEDGES = 8;

/** The town hub: vendor stall with its keeper, the fund board and the gate to the next map. */
export interface LeaderRow {
  name: string;
  level: number;
  value: number;
  fish: string;
  tier: number;
  color: string;
  shiny?: boolean;
}

export class Hub {
  readonly group = new THREE.Group();
  /** World-space spots the player can interact with. */
  readonly vendorSpot = new THREE.Vector3();
  readonly boardSpot = new THREE.Vector3();
  readonly gateSpot = new THREE.Vector3();
  readonly wheelSpot = new THREE.Vector3();
  readonly leaderSpot = new THREE.Vector3();
  readonly mirrorSpot = new THREE.Vector3();
  readonly campSpot = new THREE.Vector3();
  private leaderCtx!: CanvasRenderingContext2D;
  private leaderTex!: THREE.CanvasTexture;
  private flames: THREE.Mesh[] = [];
  private fireLight = new THREE.PointLight(0xff8a3c, 14, 11, 2);
  private disc = new THREE.Mesh();
  private spinAnim: { from: number; to: number; t0: number; ms: number } | null = null;
  private lastTick = 0;
  /** Fires as the pointer crosses a wedge while spinning. */
  onWheelTick: () => void = () => {};
  /** Goods on the stall: look at one and press E to buy. */
  private fixed: Circle[] = [];
  private gateBlock: Circle[] = [];
  private locked = true;

  private head = new THREE.Group();
  private npc = new THREE.Group();
  private npcHome = new THREE.Vector3();
  private npcYaw = 0;
  private hanging: THREE.Object3D[] = [];
  private boardCtx!: CanvasRenderingContext2D;
  private boardTex!: THREE.CanvasTexture;
  private gateCtx!: CanvasRenderingContext2D;
  private gateTex!: THREE.CanvasTexture;
  private barrier!: THREE.Mesh;
  private torches: THREE.Mesh[] = [];

  constructor(private map: MapDef) {
    this.buildStall(map.vendor.shop, map.vendor.npc);
    this.buildBoard(map.board);
    this.buildGate(map.gate);
    this.buildWheel(map.wheel);
    this.buildProps();
    this.buildLeaderboard(map.leaderboard);
    this.buildMirror(map.mirror);
    this.buildCampfire(map.campfire);
    this.setLeaders([]);
    this.setFund({ total: 0, goal: map.goal, unlocked: false, mine: 0 });
  }

  get colliders(): Circle[] {
    return this.locked ? [...this.fixed, ...this.gateBlock] : this.fixed;
  }

  private place(obj: THREE.Object3D, spot: Spot, lx = 0, lz = 0, y?: number): THREE.Object3D {
    const sin = Math.sin(spot.facing);
    const cos = Math.cos(spot.facing);
    const x = spot.x + lx * cos + lz * sin;
    const z = spot.z - lx * sin + lz * cos;
    obj.position.set(x, y ?? groundHeight(x, z), z);
    obj.rotation.y = spot.facing;
    this.group.add(obj);
    return obj;
  }

  private world(spot: Spot, lx: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
    const sin = Math.sin(spot.facing);
    const cos = Math.cos(spot.facing);
    const x = spot.x + lx * cos + lz * sin;
    const z = spot.z - lx * sin + lz * cos;
    return out.set(x, groundHeight(x, z), z);
  }

  private buildStall(shop: Spot, npcSpot: Spot): void {
    const stall = new THREE.Group();
    const counter = rbox(3.2, 1.0, 1.0, WOOD, 0.08);
    counter.position.y = 0.5;
    const top = rbox(3.4, 0.1, 1.2, DARK, 0.04);
    top.position.y = 1.03;
    const back = rbox(3.2, 2.3, 0.14, 0x7a5a38, 0.04);
    back.position.set(0, 1.15, -1.5);
    stall.add(counter, top, back);

    for (const lx of [-1.5, 1.5]) {
      for (const lz of [0.9, -1.5]) {
        const post = cyl(0.07, 0.08, 2.5, DARK, 8);
        post.position.set(lx, 1.25, lz);
        stall.add(post);
      }
    }

    // Striped half-cylinder awning
    const stripes = 8;
    const L = 3.8;
    for (let i = 0; i < stripes; i++) {
      const geo = new THREE.CylinderGeometry(1.35, 1.35, L / stripes, 16, 1, true, 0, Math.PI)
        .rotateZ(Math.PI / 2)
        .translate(-L / 2 + ((i + 0.5) * L) / stripes, 0, 0);
      const m = new THREE.Mesh(geo, mat(i % 2 ? 0xf3e6c8 : 0xd9534f, { side: THREE.DoubleSide }));
      m.scale.y = 0.45;
      m.position.set(0, 2.45, -0.3);
      m.castShadow = true;
      stall.add(m);
    }

    const sign = textPlane(2.4, 0.6, 512);
    woodSign(sign.ctx, 'BAIT & TACKLE');
    sign.tex.needsUpdate = true;
    sign.mesh.position.set(0, 3.2, 0.25);
    sign.mesh.rotation.x = -0.12;
    stall.add(sign.mesh);

    // Fish hanging from the awning edge
    const fishList = [FISH[1], FISH[4]];
    fishList.forEach((f, i) => {
      const hang = new THREE.Group();
      const fish = buildFish(f.color);
      fish.group.scale.setScalar(0.5);
      fish.group.rotation.x = Math.PI / 2;
      fish.group.position.y = -0.35;
      const line = cyl(0.008, 0.008, 0.25, 0xdddddd, 4);
      line.position.y = -0.1;
      hang.add(line, fish.group);
      hang.position.set(-1.3 + i * 2.6, 2.2, 1.0);
      this.hanging.push(hang);
      stall.add(hang);
    });

    this.place(stall, shop);
    for (const lx of [-1.1, 0, 1.1]) {
      const c = this.world(shop, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.75 });
    }
    this.world(shop, 0, 2.3, this.vendorSpot);

    // Shopkeeper
    const npc = this.npc;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 8, 14), mat(0x2e8b8b));
    body.position.y = 1.05;
    body.scale.z = 0.85;
    body.castShadow = true;
    const apron = rbox(0.5, 0.72, 0.06, 0xf3e6c8, 0.03);
    apron.position.set(0, 0.98, 0.25);
    npc.add(body, apron);
    const skin = 0xe0b08a;
    this.head.position.y = 1.78;
    this.head.add(ball(0.22, skin));
    const nose = ball(0.045, 0xd49b78);
    nose.position.set(0, -0.01, 0.21);
    const beard = ball(0.16, 0xeeeeee, 1, 0.9, 0.7);
    beard.position.set(0, -0.14, 0.1);
    this.head.add(nose, beard);
    for (const sx of [-1, 1]) {
      const eye = ball(0.028, 0x1b1b1b);
      eye.position.set(sx * 0.08, 0.05, 0.19);
      this.head.add(eye);
    }
    const brim = cyl(0.42, 0.42, 0.035, 24, 24);
    brim.material = mat(0xe3c26d);
    brim.position.y = 0.17;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      mat(0xe3c26d),
    );
    dome.position.y = 0.17;
    const band = cyl(0.255, 0.255, 0.05, 0xb5473a, 18);
    band.position.y = 0.2;
    this.head.add(brim, dome, band);
    npc.add(this.head);
    for (const sx of [-1, 1]) {
      const sh = new THREE.Vector3(sx * 0.33, 1.4, 0);
      const hand = new THREE.Vector3(sx * 0.34, 1.07, 0.55);
      const fist = ball(0.095, skin);
      fist.position.copy(hand);
      npc.add(limb(sh, hand, 0.09, 0x2e8b8b), fist);
    }
    this.place(npc, npcSpot);
    this.npcHome.copy(npc.position);
    this.npcYaw = npcSpot.facing;
    const nc = this.world(npcSpot, 0, 0.4);
    this.fixed.push({ x: nc.x, z: nc.z, r: 0.5 });
  }

  private buildBoard(spot: Spot): void {
    const g = new THREE.Group();
    for (const lx of [-1.15, 1.15]) {
      const post = cyl(0.09, 0.11, 3, DARK, 8);
      post.position.set(lx, 1.5, 0);
      g.add(post);
    }
    const frame = rbox(2.7, 1.8, 0.12, 0x6b4a2b, 0.05);
    frame.position.set(0, 2.0, 0);
    g.add(frame);
    const face = textPlane(2.5, 1.6, 640);
    face.mesh.position.set(0, 2.0, 0.07);
    g.add(face.mesh);
    const roof = rbox(3.1, 0.12, 0.7, 0xb5473a, 0.05);
    roof.position.set(0, 3.0, 0);
    roof.rotation.x = 0.15;
    g.add(roof);
    this.boardCtx = face.ctx;
    this.boardTex = face.tex;
    this.place(g, spot);
    for (const lx of [-1.15, 1.15]) {
      const c = this.world(spot, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.3 });
    }
    this.world(spot, 0, 2.2, this.boardSpot);
  }

  private buildGate(spot: Spot): void {
    const g = new THREE.Group();
    const stone = 0x8a8a86;
    for (const lx of [-2.6, 2.6]) {
      const post = cyl(0.4, 0.5, 4.6, stone, 10);
      post.position.set(lx, 2.0, 0);
      const cap = ball(0.55, stone, 1, 0.7, 1);
      cap.position.set(lx, 4.35, 0);
      const torch = ball(0.2, 0xff5a3c);
      (torch.material as THREE.MeshLambertMaterial).emissive.set(0xff3c1e);
      torch.position.set(lx, 4.95, 0);
      this.torches.push(torch);
      g.add(post, cap, torch);
    }
    const lintel = cyl(0.3, 0.3, 5.6, 0x6b4a2b, 12);
    lintel.rotation.z = Math.PI / 2;
    lintel.position.y = 4.3;
    g.add(lintel);
    const sign = textPlane(3.2, 0.9, 640);
    sign.mesh.position.set(0, 3.4, 0.05);
    this.gateCtx = sign.ctx;
    this.gateTex = sign.tex;
    g.add(sign.mesh);
    this.barrier = new THREE.Mesh(
      new THREE.PlaneGeometry(4.9, 3.8),
      new THREE.MeshBasicMaterial({ color: 0xff7a55, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.barrier.position.y = 1.9;
    g.add(this.barrier);
    this.place(g, spot, 0, 0, groundHeight(spot.x, spot.z) - 0.4);
    for (const lx of [-2.6, 2.6]) {
      const c = this.world(spot, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.55 });
    }
    for (let lx = -2.2; lx <= 2.2; lx += 0.8) {
      const c = this.world(spot, lx, 0);
      this.gateBlock.push({ x: c.x, z: c.z, r: 0.55 });
    }
    this.world(spot, 0, 2.4, this.gateSpot);
  }

  private buildProps(): void {
    // Lamp posts along the path from the dock
    for (const [x, z] of [[-2.4, 14], [2.4, 14], [-2.4, 18], [2.4, 18]]) {
      const lamp = new THREE.Group();
      const pole = cyl(0.05, 0.07, 2.2, DARK, 8);
      pole.position.y = 1.1;
      const bulb = ball(0.14, 0xffd27a);
      (bulb.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
      bulb.position.y = 2.3;
      lamp.add(pole, bulb);
      this.place(lamp, { x, z, facing: 0 });
      this.fixed.push({ x, z, r: 0.2 });
    }
    // Lamps lighting the wider plaza
    for (const [x, z] of [[-9, 36], [9, 36], [-12, 26], [13, 26], [-2.4, 30], [2.4, 30]]) {
      const lamp = new THREE.Group();
      const pole = cyl(0.05, 0.07, 2.2, DARK, 8);
      pole.position.y = 1.1;
      const bulb = ball(0.14, 0xffd27a);
      (bulb.material as THREE.MeshLambertMaterial).emissive.set(0xffb84a);
      bulb.position.y = 2.3;
      lamp.add(pole, bulb);
      this.place(lamp, { x, z, facing: 0 });
      this.fixed.push({ x, z, r: 0.2 });
    }
    // Barrels and crates around the stall
    const barrelGeo = new THREE.LatheGeometry(
      [[0.26, 0], [0.34, 0.2], [0.36, 0.45], [0.34, 0.7], [0.26, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)),
      14,
    );
    for (const [x, z, s] of [[8.4, 19.2, 1], [8.7, 20.3, 0.85], [3.3, 17.5, 1]]) {
      const b = new THREE.Mesh(barrelGeo, mat(0x8a5a30));
      b.scale.setScalar(s);
      b.castShadow = true;
      this.place(b, { x, z, facing: 0 });
      this.fixed.push({ x, z, r: 0.38 * s });
    }
    const crates = [[7.6, 23.6, 0.4], [8.3, 23.9, 1.1]] as const;
    for (const [x, z, rot] of crates) {
      const c = rbox(0.8, 0.7, 0.8, 0x9c7a4a, 0.05);
      this.place(c, { x, z, facing: rot }, 0, 0, groundHeight(x, z) + 0.35);
      this.fixed.push({ x, z, r: 0.55 });
    }
  }

  private buildLeaderboard(spot: Spot): void {
    const g = new THREE.Group();
    for (const lx of [-1.0, 1.0]) {
      const post = cyl(0.08, 0.1, 2.8, DARK, 8);
      post.position.set(lx, 1.4, 0);
      g.add(post);
    }
    const frame = rbox(2.5, 2.0, 0.12, 0x6b4a2b, 0.05);
    frame.position.set(0, 1.9, 0);
    const face = textPlane(2.3, 1.8, 512);
    face.mesh.position.set(0, 1.9, 0.07);
    const roof = rbox(2.9, 0.12, 0.7, 0x2f6f9f, 0.05);
    roof.position.set(0, 3.0, 0);
    roof.rotation.x = 0.15;
    g.add(frame, face.mesh, roof);
    this.leaderCtx = face.ctx;
    this.leaderTex = face.tex;
    this.place(g, spot);
    for (const lx of [-1.0, 1.0]) {
      const c = this.world(spot, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.3 });
    }
    this.world(spot, 0, 2.0, this.leaderSpot);
  }

  /** Redraws the "Top Anglers" board, ranked by the most valuable fish each player has caught. */
  setLeaders(rows: LeaderRow[]): void {
    const ctx = this.leaderCtx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#1f3d5a';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9b8';
    ctx.font = '800 44px system-ui, sans-serif';
    ctx.fillText('TOP ANGLERS', w / 2, 66);
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillStyle = '#9fc2de';
    ctx.fillText('most valuable catch', w / 2, 94);
    rows.slice(0, 5).forEach((r, i) => {
      const y = 148 + i * 72;
      ctx.textAlign = 'left';
      ctx.font = '700 32px system-ui, sans-serif';
      ctx.fillStyle = i === 0 ? '#ffd23a' : '#ffffff';
      ctx.fillText(`${i + 1}. ${r.name.slice(0, 9)}`, 34, y);
      const nameW = ctx.measureText(`${i + 1}. ${r.name.slice(0, 9)}`).width;
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#9fc2de';
      ctx.fillText(`Lv ${r.level}`, 34 + nameW + 10, y);
      ctx.textAlign = 'right';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.fillStyle = r.value ? '#ffd23a' : '#6f8aa3';
      ctx.fillText(r.value ? `${r.value.toLocaleString()} 🪙` : '—', w - 34, y);
      if (r.value) {
        ctx.textAlign = 'left';
        ctx.font = '600 24px system-ui, sans-serif';
        ctx.fillStyle = r.color;
        ctx.fillText(`${r.shiny ? '✨ ' : ''}T${r.tier} ${r.fish}`, 52, y + 28);
      } else {
        ctx.textAlign = 'left';
        ctx.font = '600 22px system-ui, sans-serif';
        ctx.fillStyle = '#6f8aa3';
        ctx.fillText('no catch yet', 52, y + 28);
      }
    });
    if (!rows.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fc2de';
      ctx.font = '700 32px system-ui, sans-serif';
      ctx.fillText('No anglers yet', w / 2, 200);
    }
    this.leaderTex.needsUpdate = true;
  }

  private buildMirror(spot: Spot): void {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 28), gold);
    frame.scale.set(0.8, 1.25, 1);
    frame.position.y = 1.55;
    frame.castShadow = true;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 28),
      new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.9, emissive: 0x2a5a7a, emissiveIntensity: 0.4 }),
    );
    glass.scale.set(0.8, 1.25, 1);
    glass.position.set(0, 1.55, 0.01);
    for (const lx of [-0.45, 0.45]) {
      const leg = cyl(0.04, 0.05, 1.0, DARK, 6);
      leg.position.set(lx, 0.5, -0.1);
      leg.rotation.z = lx > 0 ? -0.12 : 0.12;
      g.add(leg);
    }
    const base = rbox(1.2, 0.08, 0.5, DARK, 0.03);
    base.position.y = 0.04;
    const sign = textPlane(1.1, 0.3, 320);
    woodSign(sign.ctx, 'WARDROBE');
    sign.tex.needsUpdate = true;
    sign.mesh.position.set(0, 2.55, 0);
    g.add(frame, glass, base, sign.mesh);
    this.place(g, spot);
    this.fixed.push({ x: spot.x, z: spot.z, r: 0.5 });
    this.world(spot, 0, 1.9, this.mirrorSpot);
  }

  private buildCampfire(spot: Spot): void {
    const g = new THREE.Group();
    const stone = mat(0x77746e);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), stone);
      s.position.set(Math.sin(a) * 0.65, 0.1, Math.cos(a) * 0.65);
      s.scale.y = 0.7;
      s.castShadow = true;
      g.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const log = cyl(0.08, 0.09, 0.9, 0x5b3a1e, 7);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 4) * Math.PI;
      log.position.y = 0.16 + (i % 2) * 0.1;
      g.add(log);
    }
    for (const [h, c] of [[0.9, 0xff6a1a], [0.65, 0xffa51f], [0.4, 0xffe14a]] as const) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.28 * (h / 0.9) + 0.08, h, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
      f.position.y = 0.3 + h / 2;
      this.flames.push(f);
      g.add(f);
    }
    this.fireLight.position.set(0, 1.0, 0);
    g.add(this.fireLight);
    this.place(g, spot);
    this.fixed.push({ x: spot.x, z: spot.z, r: 0.8 });
    // Benches around the fire, leaving the side facing the plaza open.
    for (const a of [Math.PI, -Math.PI / 2, 0]) {
      const bx = spot.x + Math.sin(a) * 2.5;
      const bz = spot.z + Math.cos(a) * 2.5;
      const bench = new THREE.Group();
      const seat = rbox(1.7, 0.1, 0.5, 0x8a6a40, 0.03);
      seat.position.y = 0.45;
      bench.add(seat);
      for (const lx of [-0.7, 0.7]) {
        const leg = rbox(0.1, 0.45, 0.4, DARK, 0.02);
        leg.position.set(lx, 0.22, 0);
        bench.add(leg);
      }
      this.place(bench, { x: bx, z: bz, facing: Math.atan2(spot.x - bx, spot.z - bz) });
      this.fixed.push({ x: bx, z: bz, r: 0.85 });
    }
    this.campSpot.set(spot.x + 1.8, groundHeight(spot.x, spot.z), spot.z);
  }

  private buildWheel(spot: Spot): void {
    this.wheelSpot.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe3b341, roughness: 0.35, metalness: 0.6 });
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.1, 10), wood);
    post.position.y = 0.55;
    post.position.z = 0;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.15, 14), wood);
    base.position.y = 0.075;
    g.add(post, base);

    const px = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const c = canvas.getContext('2d')!;
    const n = WHEEL_WEDGES;
    const w = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      c.beginPath();
      c.moveTo(px / 2, px / 2);
      c.arc(px / 2, px / 2, px / 2, i * w, (i + 1) * w);
      c.fillStyle = i % 2 === 0 ? '#2e9e4f' : '#b32d2d';
      c.fill();
      c.save();
      c.translate(px / 2, px / 2);
      c.rotate((i + 0.5) * w);
      c.fillStyle = '#fff';
      c.font = '800 54px system-ui, sans-serif';
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText(i % 2 === 0 ? '×2' : 'LOSE', px / 2 - 28, 0);
      c.restore();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 64),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false }),
    );
    const hubY = 1.95;
    this.disc.position.set(0, hubY, 0.1);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.05, 8, 48), gold);
    rim.position.copy(this.disc.position);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), gold);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, hubY, 0.16);
    const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 3), gold);
    pointer.rotation.z = Math.PI;
    pointer.position.set(0, hubY + 1.0, 0.18);
    g.add(this.disc, rim, cap, pointer);

    const sign = textPlane(1.5, 0.4, 384);
    woodSign(sign.ctx, 'LUCKY WHEEL', '#ffe9a8');
    sign.tex.needsUpdate = true;
    sign.mesh.position.set(0, 0.6, 0.2);
    g.add(sign.mesh);
    this.place(g, spot);
    this.fixed.push({ x: spot.x, z: spot.z, r: 0.7 });
  }

  /** Spins the disc and lands it on a winning (green) or losing (red) wedge. */
  spinWheel(win: boolean, ms: number): void {
    const w = (Math.PI * 2) / WHEEL_WEDGES;
    const wedges = Array.from({ length: WHEEL_WEDGES }, (_, i) => i).filter((i) => (i % 2 === 0) === win);
    const i = wedges[Math.floor(Math.random() * wedges.length)];
    const base = Math.PI / 2 + (i + 0.5 + (Math.random() - 0.5) * 0.6) * w;
    const from = this.disc.rotation.z;
    const spins = Math.ceil((from + Math.PI * 2 * 6 - base) / (Math.PI * 2));
    this.spinAnim = { from, to: base + spins * Math.PI * 2, t0: performance.now(), ms };
  }

  setFund(st: FundState, nextName: string | null = this.map.next?.name ?? null): void {
    this.locked = !st.unlocked;
    const ctx = this.boardCtx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#5a3d22';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3f2b19';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9b8';
    ctx.font = '800 54px system-ui, sans-serif';
    ctx.fillText('TOWN FUND', w / 2, 80);
    const bx = 60;
    const bw = w - 120;
    ctx.fillStyle = '#2a1c10';
    ctx.fillRect(bx, 110, bw, 52);
    ctx.fillStyle = st.unlocked ? '#5fd37a' : '#ffc933';
    ctx.fillRect(bx + 4, 114, (bw - 8) * (st.total / st.goal), 44);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(`${st.total} / ${st.goal} coins`, w / 2, 215);
    ctx.font = '500 28px system-ui, sans-serif';
    ctx.fillStyle = '#e8d3a8';
    ctx.fillText(
      st.unlocked ? 'The gate is open!' : `Hand coins to ${this.map.vendor.name} to open`,
      w / 2,
      262,
    );
    if (!st.unlocked && nextName) ctx.fillText(`the gate to ${nextName}`, w / 2, 296);
    ctx.fillText(`You gave ${st.mine}`, w / 2, 366);
    this.boardTex.needsUpdate = true;

    woodSign(this.gateCtx, `${st.unlocked ? '✔' : '🔒'} ${nextName ?? 'The End'}`, st.unlocked ? '#b8ffc9' : '#ffd7cf');
    this.gateTex.needsUpdate = true;
    this.barrier.visible = !st.unlocked;
    for (const t of this.torches) {
      const m = t.material as THREE.MeshLambertMaterial;
      m.color.set(st.unlocked ? 0x6cff9a : 0xff5a3c);
      m.emissive.set(st.unlocked ? 0x2fd36a : 0xff3c1e);
    }
  }

  update(t: number, px: number, pz: number): void {
    const a = this.spinAnim;
    if (a) {
      const k = Math.min(1, (performance.now() - a.t0) / a.ms);
      const e = 1 - Math.pow(1 - k, 3);
      this.disc.rotation.z = a.from + (a.to - a.from) * e;
      const idx = Math.floor((this.disc.rotation.z * WHEEL_WEDGES) / (Math.PI * 2));
      if (idx !== this.lastTick) {
        this.lastTick = idx;
        this.onWheelTick();
      }
      if (k >= 1) this.spinAnim = null;
    }
    this.hanging.forEach((h, i) => {
      h.rotation.z = Math.sin(t * 1.2 + i * 1.7) * 0.06;
      h.rotation.x = Math.cos(t * 0.9 + i) * 0.04;
    });
    this.flames.forEach((f, i) => {
      const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.12 + Math.sin(t * 23 + i * 2) * 0.05;
      f.scale.set(1 / k, k, 1 / k);
      f.rotation.y = t * (1 + i);
    });
    this.fireLight.intensity = 13 + Math.sin(t * 11) * 2 + Math.sin(t * 17.3) * 1.5;
    this.npc.position.y = this.npcHome.y + Math.sin(t * 1.6) * 0.012;
    const dx = px - this.npcHome.x;
    const dz = pz - this.npcHome.z;
    const near = Math.hypot(dx, dz) < 9;
    let want = 0;
    if (near) {
      let a = Math.atan2(dx, dz) - this.npcYaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      want = THREE.MathUtils.clamp(a, -1.0, 1.0);
    }
    this.head.rotation.y += (want - this.head.rotation.y) * 0.1;
    this.head.rotation.x = near ? 0.05 + Math.sin(t * 1.3) * 0.02 : 0;
    if (this.barrier.visible) {
      (this.barrier.material as THREE.MeshBasicMaterial).opacity = 0.38 + 0.12 * Math.sin(t * 2.2);
    }
  }
}
