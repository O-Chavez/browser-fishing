import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FISH } from '../data/content';
import type { MapDef, Spot } from '../data/maps';
import { groundHeight } from './env';
import { mergeStatic } from './merge';
import { glowTag } from './nightglow';
import { buildFish } from './fishmodel';
import { SKIN, faceHead } from './faces';
import type { Circle } from './player';
import casinoPreview from '../assets/images/casino-preview.jpg';
import charterPreview from '../assets/images/charter-preview.jpg';

export const mat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });
export const WOOD = 0x9b7248;
export const DARK = 0x5b4128;

export const rbox = (w: number, h: number, d: number, color: number, r = 0.05): THREE.Mesh => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, r), mat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
};

export const cyl = (rt: number, rb: number, h: number, color: number, seg = 14): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true;
  return m;
};

export const ball = (r: number, color: number, sx = 1, sy = 1, sz = 1): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat(color));
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
};

/** A poster beside the pond gate: which side (metres along the gate), its picture, title sign and frame. */
interface Poster {
  side: number;
  image: string;
  title: string;
  ink: string;
  frame: number;
}

/**
 * The posters beside the pond gate, showing newer players what's waiting: Casino Cove on one side, and on the other
 * a charter out to the deep sea (the Kraken, from the "What's new" photo), so players have charters to look forward
 * to while they level up toward the Aurora Rod (Oscar, 2026-11-01).
 */
const POSTERS = {
  casino: { side: 5.2, image: casinoPreview, title: 'CASINO COVE', ink: '#ffd76a', frame: 0xb8862f },
  charters: { side: -5.2, image: charterPreview, title: 'CHARTERS', ink: '#9fe8ff', frame: 0x6f9e96 },
} satisfies Record<string, Poster>;

/** Capsule limb between two points. */
export function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.Mesh {
  const dir = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, dir.length() - 2 * r), 6, 10), mat(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

export function textPlane(w: number, h: number, px: number): { mesh: THREE.Mesh; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture } {
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

export function woodSign(ctx: CanvasRenderingContext2D, text: string, color = '#fff3d6'): void {
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

/** The HUD's gold coin (`.coin` in style.css) on a canvas: `size` px across, centred on (x, y). */
export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  // The darker rim along the bottom, like the CSS coin's inset shadow.
  ctx.fillStyle = '#a8730d';
  ctx.fillRect(x - r, y - r, size, size);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x - r * 0.3, y - r * 0.3, r * 1.84);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.45, '#ffc933');
  g.addColorStop(1, '#c58a12');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y - size * 0.08, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Draws an amount followed by the gold coin, right-aligned at `right` on baseline `y`, in the current `px`-sized font; returns the width. */
export function fillCoinAmount(ctx: CanvasRenderingContext2D, text: string, right: number, y: number, px: number): number {
  const d = Math.round(px * 0.8);
  const gap = Math.round(px * 0.22);
  ctx.textAlign = 'right';
  ctx.fillText(text, right - d - gap, y);
  drawCoin(ctx, right - d / 2, y - px * 0.36, d);
  return ctx.measureText(text).width + gap + d;
}

export interface LeaderRow {
  name: string;
  level: number;
  value: number;
  fish: string;
  tier: number;
  color: string;
  shiny?: boolean;
  title?: string | null;
}

/** The town hub: vendor stall with its keeper and the gate to the next map. */
export class Hub {
  readonly group = new THREE.Group();
  /** World-space spots the player can interact with. */
  readonly vendorSpot = new THREE.Vector3();
  readonly gateSpot = new THREE.Vector3();
  /** The casino poster beside the pond gate (unset on maps without one). */
  readonly peekSpot: THREE.Vector3 | null = null;
  /** The charter poster on the gate's other side, on maps with Reed's harbour (unset elsewhere). */
  readonly charterSpot: THREE.Vector3 | null = null;
  readonly leaderSpot = new THREE.Vector3();
  readonly mirrorSpot = new THREE.Vector3();
  readonly campSpot = new THREE.Vector3();
  private leaderCtx!: CanvasRenderingContext2D;
  private leaderTex!: THREE.CanvasTexture;
  private thanksCtx!: CanvasRenderingContext2D;
  private thanksTex!: THREE.CanvasTexture;
  private flames: THREE.Mesh[] = [];
  private lampMats: THREE.MeshLambertMaterial[] = [];
  private lampLights: THREE.PointLight[] = [];
  private fireLight = new THREE.PointLight(0xff8a3c, 14, 11, 2);
  /** Colliders that never change; the gate's are kept apart because they open. */
  private fixed: Circle[] = [];
  private gateBlock: Circle[] = [];
  private locked = true;
  private gateKey = '';

  private head = new THREE.Group();
  private npc = new THREE.Group();
  private npcHome = new THREE.Vector3();
  private npcYaw = 0;
  private hanging: THREE.Object3D[] = [];
  private gateCtx!: CanvasRenderingContext2D;
  private gateTex!: THREE.CanvasTexture;
  private barrier!: THREE.Mesh;
  private torches: THREE.Mesh[] = [];

  constructor(private map: MapDef) {
    this.buildStall(map.vendor.shop, map.vendor.npc);
    this.buildGate(map.gate);
    if (map.next?.id === 'casino') (this as { peekSpot: THREE.Vector3 | null }).peekSpot = this.buildPoster(map.gate, POSTERS.casino);
    if (map.harbour) (this as { charterSpot: THREE.Vector3 | null }).charterSpot = this.buildPoster(map.gate, POSTERS.charters);
    this.buildProps();
    this.buildLeaderboard(map.leaderboard);
    this.buildThanks(map.leaderboard);
    this.buildMirror(map.mirror);
    this.buildCampfire(map.campfire);
    this.setLeaders([]);
    this.setSupporters([]);
    this.setGate(false);
    // The shopkeeper and the hanging fish animate; everything else static is baked together.
    mergeStatic(this.group, [this.npc, ...this.hanging]);
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
      const fish = buildFish(f.color, false, false, f.tier, f.id);
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
    this.head.position.y = 1.78;
    this.head.add(faceHead(0.22, this.map.vendor.face));
    // A short beard below the mouth, so the painted smile still shows.
    const beard = ball(0.15, 0xeeeeee, 1, 0.75, 0.7);
    beard.position.set(0, -0.17, 0.08);
    this.head.add(beard);
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
      const fist = ball(0.095, SKIN);
      fist.position.copy(hand);
      npc.add(limb(sh, hand, 0.09, 0x2e8b8b), fist);
    }
    this.place(npc, npcSpot);
    this.npcHome.copy(npc.position);
    this.npcYaw = npcSpot.facing;
    const nc = this.world(npcSpot, 0, 0.4);
    this.fixed.push({ x: nc.x, z: nc.z, r: 0.5 });
  }

  /** A framed poster beside the gate, so newer players can see what's waiting (`POSTERS`). */
  private buildPoster(gate: Spot, p: Poster): THREE.Vector3 {
    const spot: Spot = { ...this.world(gate, p.side, 0.6), facing: gate.facing } as Spot;
    const g = new THREE.Group();
    for (const lx of [-0.95, 0.95]) {
      const post = cyl(0.07, 0.09, 2.6, DARK, 8);
      post.position.set(lx, 1.3, 0);
      g.add(post);
    }
    const frame = rbox(2.2, 1.55, 0.1, p.frame, 0.04);
    frame.position.set(0, 1.85, 0);
    const tex = new THREE.TextureLoader().load(p.image);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.96, 1.1), new THREE.MeshBasicMaterial({ map: tex }));
    pic.position.set(0, 1.78, 0.06);
    const title = textPlane(2.0, 0.32, 512);
    woodSign(title.ctx, p.title, p.ink);
    title.tex.needsUpdate = true;
    title.mesh.position.set(0, 2.47, 0.06);
    g.add(frame, pic, title.mesh);
    this.place(g, spot);
    for (const lx of [-0.95, 0.95]) {
      const c = this.world(spot, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.2 });
    }
    return this.world(spot, 0, 0.5);
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
      glowTag(torch, 1.0);
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
    // Lamp posts along the path from the dock, and around the wider plaza
    const lit = new Set(['2.4,18', '-2.4,18', '2.4,30', '-12,26']);
    const posts = [[-2.4, 14], [2.4, 14], [-2.4, 18], [2.4, 18], [-9, 36], [9, 36], [-12, 26], [13, 26], [-2.4, 30], [2.4, 30]];
    for (const [x, z] of posts) {
      const lamp = new THREE.Group();
      const pole = cyl(0.05, 0.07, 2.2, DARK, 8);
      pole.position.y = 1.1;
      const bulb = ball(0.14, 0xffd27a);
      const bm = bulb.material as THREE.MeshLambertMaterial;
      bm.emissive.set(0xffb84a);
      this.lampMats.push(bm);
      bulb.position.y = 2.3;
      glowTag(bulb, 0.75);
      lamp.add(pole, bulb);
      if (lit.has(`${x},${z}`)) {
        const l = new THREE.PointLight(0xffc266, 0, 13, 1.6);
        l.position.y = 2.2;
        lamp.add(l);
        this.lampLights.push(l);
      }
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
      if (r.value) fillCoinAmount(ctx, r.value.toLocaleString(), w - 34, y, 32);
      else ctx.fillText('—', w - 34, y);
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

  /** A small "thank you" board beside Top Anglers, listing the players who tipped on Ko-fi. */
  private buildThanks(board: Spot): void {
    const g = new THREE.Group();
    for (const lx of [-0.6, 0.6]) {
      const post = cyl(0.06, 0.08, 2.2, DARK, 8);
      post.position.set(lx, 1.1, 0);
      g.add(post);
    }
    const frame = rbox(1.6, 1.5, 0.1, 0x6b4a2b, 0.04);
    frame.position.set(0, 1.55, 0);
    const face = textPlane(1.45, 1.35, 384);
    face.mesh.position.set(0, 1.55, 0.06);
    const roof = rbox(1.9, 0.1, 0.55, 0xb5476e, 0.04);
    roof.position.set(0, 2.36, 0);
    roof.rotation.x = 0.15;
    g.add(frame, face.mesh, roof);
    this.thanksCtx = face.ctx;
    this.thanksTex = face.tex;
    const at = this.world(board, 2.45, 0.35);
    const spot = { x: at.x, z: at.z, facing: board.facing };
    this.place(g, spot);
    for (const lx of [-0.6, 0.6]) {
      const c = this.world(spot, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.25 });
    }
  }

  /** Redraws the supporters board: the newest tippers first. */
  setSupporters(names: string[]): void {
    const ctx = this.thanksCtx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#4a2338';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2a7c3';
    ctx.lineWidth = 8;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe1ec';
    ctx.font = '800 40px system-ui, sans-serif';
    ctx.fillText('THANK YOU 💗', w / 2, 54);
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.fillStyle = '#e6a9c1';
    ctx.fillText('Lakeside supporters', w / 2, 82);
    const shown = names.slice(0, names.length > 5 ? 4 : 5);
    ctx.font = '700 32px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    shown.forEach((n, i) => ctx.fillText(n, w / 2, 126 + i * 40));
    if (names.length > shown.length) {
      ctx.font = '600 22px system-ui, sans-serif';
      ctx.fillStyle = '#e6a9c1';
      ctx.fillText(`and ${names.length - shown.length} more`, w / 2, 126 + shown.length * 40 - 6);
    }
    if (!names.length) {
      ctx.font = '700 28px system-ui, sans-serif';
      ctx.fillStyle = '#e6a9c1';
      ctx.fillText('Be the first!', w / 2, 180);
    }
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillStyle = '#c98aa4';
    ctx.fillText('Tip jar: ⚙️ Settings', w / 2, h - 18);
    this.thanksTex.needsUpdate = true;
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
    glowTag(this.fireLight, 1.6, 1, true);
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

  /** Opens or seals the gate for the local player; redraws only when something changed. */
  setGate(open: boolean): void {
    const nextName = this.map.next?.name ?? null;
    const key = `${open}|${nextName}`;
    if (key === this.gateKey) return;
    this.gateKey = key;
    this.locked = !open;
    woodSign(this.gateCtx, `${open ? '✔' : '🔒'} ${nextName ?? 'The End'}`, open ? '#b8ffc9' : '#ffd7cf');
    this.gateTex.needsUpdate = true;
    this.barrier.visible = !open;
    for (const t of this.torches) {
      const m = t.material as THREE.MeshLambertMaterial;
      m.color.set(open ? 0x6cff9a : 0xff5a3c);
      m.emissive.set(open ? 0x2fd36a : 0xff3c1e);
    }
  }

  /** Lamps glow brighter as night falls (0 = day, 1 = night). */
  setNight(n: number): void {
    for (const m of this.lampMats) m.emissiveIntensity = 0.25 + 1.6 * n;
    for (const l of this.lampLights) l.intensity = 9 * n;
  }

  update(t: number, px: number, pz: number): void {
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
