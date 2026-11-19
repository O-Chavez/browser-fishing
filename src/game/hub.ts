import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FISH } from '../data/content';
import { readingSpot, type MapDef, type Spot } from '../data/maps';
import { DOCK_TOP, PILE_HEAD, groundHeight, pileLength, standHeight } from './env';
import { mergeStatic } from './merge';
import { glowTag } from './nightglow';
import { buildFish, disposeFish, type FishModel } from './fishmodel';
import { boardSum } from './format';
import type { Circle } from './player';
import { ColliderList } from './colliderlist';
import casinoPreview from '../assets/images/casino-preview.jpg';
import { buildBaitShop, dressMarlow, SHOP_SOLIDS } from './baitshop';
import { buildFishMount, buildHearth, buildPlaque, mountBoard, writePlaque } from './camp';

export const mat = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });
export const WOOD = 0x9b7248;
export const DARK = 0x5b4128;

/**
 * Rounded boxes already worked out, by size: building one is slow (three's `getUv` per vertex) and a map is rebuilt
 * on every visit with the same sizes (its props' random sizes are seeded), so each later box is a copy of the arrays.
 * Kept as plain geometry, since cloning a `RoundedBoxGeometry` builds a default one first. Never drawn, so they hold
 * no GPU memory; capped in case some caller's sizes never repeat.
 */
const RBOX_CACHE_MAX = 4096;
const rboxCache = new Map<string, THREE.BufferGeometry>();
function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const key = `${w},${h},${d},${r}`;
  const hit = rboxCache.get(key);
  if (hit) return hit.clone();
  const geo = new RoundedBoxGeometry(w, h, d, 1, r);
  if (rboxCache.size < RBOX_CACHE_MAX) rboxCache.set(key, new THREE.BufferGeometry().copy(geo));
  return geo;
}

export const rbox = (w: number, h: number, d: number, color: number, r = 0.05): THREE.Mesh => {
  const m = new THREE.Mesh(roundedBox(w, h, d, r), mat(color));
  m.castShadow = m.receiveShadow = true;
  return m;
};

/**
 * How far behind a board's middle its posts stand: far enough that a post up to 0.1 m thick stays behind the front
 * of a frame 0.1 m thick or more, where the board's face is.
 */
export const BEHIND = 0.14;

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
 * The poster beside the pond gate, showing newer players what's waiting in Casino Cove. (The CHARTERS poster on the
 * gate's other side moved to the Furthest Out board, Oscar 2026-11-13.)
 */
const POSTERS = {
  casino: { side: 5.2, image: casinoPreview, title: 'CASINO COVE', ink: '#ffd76a', frame: 0xb8862f },
} satisfies Record<string, Poster>;

/**
 * What dresses a board's back, seen from behind it: a frame of four battens and a cross brace, `w` by `h`, centred
 * on the origin and standing out toward -z.
 */
export function backBrace(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const T = 0.09;
  for (const side of [-1, 1]) {
    const rail = rbox(w, T, 0.04, WOOD, 0.015);
    rail.position.set(0, (side * (h - T)) / 2, -0.02);
    const stile = rbox(T, h - 2 * T, 0.04, WOOD, 0.015);
    stile.position.set((side * (w - T)) / 2, 0, -0.02);
    const brace = rbox(Math.hypot(w - 2 * T, h - 2 * T), T * 0.8, 0.03, WOOD, 0.012);
    brace.position.z = -0.015;
    brace.rotation.z = side * Math.atan2(h - 2 * T, w - 2 * T);
    g.add(rail, stile, brace);
  }
  return g;
}

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

/** A wooden sign's face: `text` in `color` on a framed board. A long text is squeezed to `fit` px wide, if given. */
export function woodSign(ctx: CanvasRenderingContext2D, text: string, color = '#fff3d6', fit?: number): void {
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
  ctx.fillText(text, w / 2, h / 2 + 3, fit);
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
  /** A charter catch: shown by name alone, since every sea fish is tier 5. */
  sea?: boolean;
  /** The catch's fish (`FISH`), for the trophy over the board. */
  fishId?: string;
}

/** A catch board's words and colours: Lake Legends keeps Top Anglers' navy and gold, Deep Sea is darker with a pale aqua trim. */
interface BoardLook { title: string; sub: string; empty: string; roof: number; bg: string; trim: string; head: string; soft: string; first: string }
const LAKE_BOARD: BoardLook = { title: 'LAKE LEGENDS', sub: 'most valuable lake catch', empty: 'No anglers yet', roof: 0x2f6f9f, bg: '#1f3d5a', trim: '#d4af37', head: '#ffe9b8', soft: '#9fc2de', first: '#ffd23a' };
const SEA_BOARD: BoardLook = { title: 'DEEP SEA', sub: 'most valuable charter catch', empty: 'No charter catches yet', roof: 0x1d3557, bg: '#14243f', trim: '#8fd8e6', head: '#dff7ff', soft: '#8fb3cf', first: '#9fe8f5' };
/** A canvas face and, for a catch board, the rows last drawn on it (`drawBoard`). */
interface BoardFace { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; drawn?: string }
/** A board's trophy: the mount over its roof, the record fish on it and the holder's plaque under it. */
interface Trophy { anchor: THREE.Object3D; plaque: BoardFace; fish: FishModel | null; tall: THREE.Group | null; shown: string }
/**
 * A trophy's back board (m), and the box on it that every trophy fish is fitted to, whatever its species and size:
 * `w` across and `h` high. A fish whose outline is taller than that for its width (the Kraken, with its arms out)
 * may stand up to `tall` high, on a back board made taller for it.
 */
const TROPHY = { board: [1.6, 0.95] as [number, number], w: 1.4, h: 0.8, tall: 1.2 };

/** The town hub: vendor stall with its keeper and the gate to the next map. */
export class Hub {
  readonly group = new THREE.Group();
  /** World-space spots the player can interact with. */
  readonly vendorSpot = new THREE.Vector3();
  readonly gateSpot = new THREE.Vector3();
  /** The casino poster beside the pond gate (unset on maps without one). */
  readonly peekSpot: THREE.Vector3 | null = null;
  readonly leaderSpot = new THREE.Vector3();
  /** In front of the Deep Sea board (unset on maps without one). */
  readonly seaSpot: THREE.Vector3 | null = null;
  /** The middle of the campfire. */
  readonly campSpot = new THREE.Vector3();
  private lakeFace!: BoardFace;
  private seaFace: BoardFace | null = null;
  private lakeTrophy!: Trophy;
  private seaTrophy: Trophy | null = null;
  /**
   * Given each trophy fish as it is mounted (`World.warm`), so its shaders are compiled and its model drawn once
   * before anyone looks up at it; otherwise the first look at a new record stalls.
   */
  warm: (o: THREE.Object3D) => void = () => {};
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
    this.buildProps();
    [this.lakeFace, this.lakeTrophy] = this.buildCatchBoard(map.leaderboard, LAKE_BOARD, this.leaderSpot);
    if (map.seaboard) {
      const spot = new THREE.Vector3();
      [this.seaFace, this.seaTrophy] = this.buildCatchBoard(map.seaboard, SEA_BOARD, spot);
      (this as { seaSpot: THREE.Vector3 | null }).seaSpot = spot;
    }
    this.buildThanks(map.thanks);
    this.buildCampfire(map.campfire);
    this.setLeaders([], []);
    this.setSupporters([]);
    this.setGate(false);
    // The shopkeeper and the hanging fish animate, and the trophy fish change with the boards; everything else
    // static is baked together.
    mergeStatic(this.group, [this.npc, ...this.hanging, this.lakeTrophy.anchor, ...(this.seaTrophy ? [this.seaTrophy.anchor] : [])]);
  }

  private readonly joined = new ColliderList();

  get colliders(): Circle[] {
    return this.locked ? this.joined.get([this.fixed, this.gateBlock]) : this.fixed;
  }

  private place(obj: THREE.Object3D, spot: Spot, lx = 0, lz = 0, y?: number): THREE.Object3D {
    const sin = Math.sin(spot.facing);
    const cos = Math.cos(spot.facing);
    const x = spot.x + lx * cos + lz * sin;
    const z = spot.z - lx * sin + lz * cos;
    // On the quay and jetties things stand on the deck, not the lake bed under it.
    obj.position.set(x, y ?? standHeight(x, z), z);
    obj.rotation.y = spot.facing;
    this.group.add(obj);
    return obj;
  }

  private world(spot: Spot, lx: number, lz: number, out = new THREE.Vector3()): THREE.Vector3 {
    const sin = Math.sin(spot.facing);
    const cos = Math.cos(spot.facing);
    const x = spot.x + lx * cos + lz * sin;
    const z = spot.z - lx * sin + lz * cos;
    return out.set(x, standHeight(x, z), z);
  }

  /** Marlow's BAIT & TACKLE shack (`buildBaitShop`, baitshop.ts) and Marlow at its window. */
  private buildStall(shop: Spot, npcSpot: Spot): void {
    // Two fish hang under the eaves at the front corners and sway (`update`).
    const hang = (i: number) => {
      const f = [FISH[1], FISH[4]][i];
      const h = new THREE.Group();
      const fish = buildFish(f.color, false, false, f.tier, f.id);
      fish.group.scale.setScalar(0.5);
      fish.group.rotation.x = Math.PI / 2;
      fish.group.position.y = -0.35;
      const line = cyl(0.008, 0.008, 0.25, 0xdddddd, 4);
      line.position.y = -0.1;
      h.add(line, fish.group);
      this.hanging.push(h);
      return h;
    };
    this.place(buildBaitShop(this.lampMats, hang), shop);
    for (const [lx, lz, r] of [[-1.1, 0, 0.75], [0, 0, 0.75], [1.1, 0, 0.75], ...SHOP_SOLIDS]) {
      const c = this.world(shop, lx, lz);
      this.fixed.push({ x: c.x, z: c.z, r });
    }
    this.world(shop, 0, 2.3, this.vendorSpot);

    // Marlow animates (a breath, his head turning to the player), so he stays out of the hub's merge; his own
    // static parts are baked together instead, the head's and the body's apart.
    dressMarlow(this.npc, this.head, this.map.vendor.face);
    mergeStatic(this.head, []);
    mergeStatic(this.npc, [this.head]);
    this.place(this.npc, npcSpot);
    this.npcHome.copy(this.npc.position);
    this.npcYaw = npcSpot.facing;
  }

  /** A framed poster beside the gate, so newer players can see what's waiting (`POSTERS`). */
  private buildPoster(gate: Spot, p: Poster): THREE.Vector3 {
    const spot: Spot = { ...this.world(gate, p.side, 0.6), facing: gate.facing } as Spot;
    const g = new THREE.Group();
    // The posts stand behind the frame (`BEHIND`), which is nailed to their fronts: set in its middle they came
    // through the picture, being thicker than the frame.
    for (const lx of [-0.95, 0.95]) {
      const post = cyl(0.07, 0.09, 2.6, DARK, 8);
      post.position.set(lx, 1.3, -BEHIND);
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
    // Lamp posts. None stands where players walk. The docks' four (the quay's front either side of the pier, the
    // east jetty's end, and the lake end of Reed's wharf, which lights the wharf and his plane and shows across the
    // cove) stand on their own piles in the water, a step off the deck's edge, out of reach, so they need no
    // collider. The quay's two stand off its deck: one behind the quay road beside Marlow's stall, with his barrels,
    // and one at the back of the bench at the east end. The rest stand beside the cobbles: up the main street to
    // the square, beside Reed's lane just before his arch, and in the fork where the village ring's lane meets the
    // campfire lane, out of the view along the lane to the ring (the village's own posts are in town.ts). Six
    // carry a point light: the four on piles and two of the rest.
    // Play-test: the spots.
    const piles = [[-4, 9.7], [4, 9.7], [9.05, 4.5], [-15.7, -4.3]];
    const lit = new Set(['3.6,27.5', '-18.9,5.3']);
    const posts = [[-9.7, 17.3], [11.2, 13.95], [-2.8, 22], [2.8, 22], [3.6, 27.5], [-3.6, 27.5], [-18.9, 5.3], [16.5, 13]];
    const lampPost = (x: number, z: number, light: boolean, pile: boolean) => {
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
      if (light) {
        const l = new THREE.PointLight(0xffc266, 0, 13, 1.6);
        l.position.y = 2.2;
        lamp.add(l);
        this.lampLights.push(l);
      }
      if (pile) {
        // A pile like the dock's own (world.ts), its head a little above the deck.
        const len = pileLength(x, z);
        const post = cyl(0.1, 0.12, len, 0x5b4128, 7);
        post.position.y = PILE_HEAD - len / 2 - DOCK_TOP;
        lamp.add(post);
      }
      this.place(lamp, { x, z, facing: 0 }, 0, 0, pile ? DOCK_TOP : undefined);
      if (!pile) this.fixed.push({ x, z, r: 0.2 });
    };
    for (const [x, z] of piles) lampPost(x, z, true, true);
    // The rocket jetty's lantern, on a pile off its end like the docks'. It glows but casts no light.
    const jetty = this.map.camp?.jettyLantern;
    if (jetty) lampPost(jetty.x, jetty.z, false, true);
    for (const [x, z] of posts) lampPost(x, z, lit.has(`${x},${z}`), false);
    // Marlow's stock: two barrels and a crate on the grass at his stall's west end, behind the quay road, with a
    // lamp post beside them. Nothing stands on the quay's deck or the road but the east bench. Play-test: the spots.
    const barrelGeo = new THREE.LatheGeometry(
      [[0.26, 0], [0.34, 0.2], [0.36, 0.45], [0.34, 0.7], [0.26, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)),
      14,
    );
    for (const [x, z, s] of [[-8.8, 17.5, 1], [-9.45, 17.9, 0.85]]) {
      const b = new THREE.Mesh(barrelGeo, mat(0x8a5a30));
      b.scale.setScalar(s);
      b.castShadow = true;
      this.place(b, { x, z, facing: 0 });
      this.fixed.push({ x, z, r: 0.38 * s });
    }
    const crates = [[-8.35, 18.2, 0.4]] as const;
    for (const [x, z, rot] of crates) {
      const c = rbox(0.8, 0.7, 0.8, 0x9c7a4a, 0.05);
      this.place(c, { x, z, facing: rot }, 0, 0, standHeight(x, z) + 0.35);
      this.fixed.push({ x, z, r: 0.55 });
    }
  }

  /**
   * A catch board on two posts under a little roof, with its trophy over the roof: a fish mount on two legs at the
   * roof's front edge and the holder's plaque across them (`setLeaders` fills both). `reader` is set to where a
   * player stands to read the board.
   */
  private buildCatchBoard(spot: Spot, look: BoardLook, reader: THREE.Vector3): [BoardFace, Trophy] {
    const g = new THREE.Group();
    // Posts behind the frame, like the posters' (`BEHIND`), so they don't come through the board's face.
    for (const lx of [-1.0, 1.0]) {
      const post = cyl(0.08, 0.1, 2.8, DARK, 8);
      post.position.set(lx, 1.4, -BEHIND);
      g.add(post);
    }
    const frame = rbox(2.5, 2.0, 0.12, 0x6b4a2b, 0.05);
    frame.position.set(0, 1.9, 0);
    const face = textPlane(2.3, 1.8, 512);
    face.mesh.position.set(0, 1.9, 0.07);
    const roof = rbox(2.9, 0.12, 0.7, look.roof, 0.05);
    roof.position.set(0, 3.0, 0);
    roof.rotation.x = 0.15;
    const back = backBrace(2.4, 1.9);
    back.position.set(0, 1.9, -0.06);
    g.add(frame, face.mesh, roof, back);
    // The trophy stands at the roof's front edge, in front of the campfire's string of bulbs, which runs over the
    // roof's middle: two legs up from the roof, the plaque across them and the mount on top.
    const TZ = 0.26;
    const LEGS = 0.56;
    const top = 3.0 + 0.06 - TZ * Math.sin(0.15);
    const mount = buildFishMount(...TROPHY.board);
    for (const lx of mount.feet) {
      const leg = rbox(0.1, LEGS + 0.04, 0.12, 0x6b4a2b, 0.02);
      leg.position.set(lx, top + LEGS / 2 - 0.02, TZ);
      g.add(leg);
    }
    const plaque = buildPlaque(1.1);
    plaque.group.position.set(0, top + LEGS / 2, TZ + 0.06);
    mount.group.position.set(0, top + LEGS - 0.2, TZ);
    g.add(plaque.group, mount.group);
    this.place(g, spot, 0, 0, this.footing(spot, 1.0));
    for (const lx of [-1.0, 1.0]) {
      const c = this.world(spot, lx, 0);
      this.fixed.push({ x: c.x, z: c.z, r: 0.3 });
    }
    // In the clear ring behind the fire's log seats, which the board faces.
    const { x, z } = readingSpot(spot);
    reader.set(x, standHeight(x, z), z);
    return [{ ctx: face.ctx, tex: face.tex }, { anchor: mount.anchor, plaque: { ctx: plaque.ctx, tex: plaque.tex }, fish: null, tall: null, shown: '' }];
  }

  /**
   * Shows a board's number one catch over it: a model of the fish on the mount, fitted to the same box whatever it
   * is (`TROPHY`), and its angler's name on the plaque. With no catch the mount is bare and the plaque says so.
   */
  private setTrophy(t: Trophy, top: LeaderRow | undefined): void {
    const f = top?.value ? FISH.find((x) => x.id === top.fishId) : undefined;
    const shown = f && top ? `${top.name}|${f.id}|${!!top.shiny}` : '-';
    if (shown === t.shown) return;
    t.shown = shown;
    if (t.fish) {
      t.anchor.remove(t.fish.group);
      disposeFish(t.fish);
      t.fish = null;
    }
    if (t.tall) {
      t.anchor.remove(t.tall);
      for (const m of t.tall.children as THREE.Mesh[]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      t.tall = null;
    }
    writePlaque(t.plaque.ctx, t.plaque.tex, f && top ? top.name : 'No catch yet');
    if (!f || !top) return;
    t.fish = buildFish(f.color, false, !!top.shiny, f.tier, f.id);
    // Side on, its nose to the left; the whole fish, fins and arms and all, fills the mount's box, so a long eel, a
    // round carp and the Kraken each read from the logs. Its glows, and the sparkles that circle a shiny or a
    // spirit, don't count.
    const model = t.fish;
    model.group.rotation.y = Math.PI / 2;
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    const grow = (o: THREE.Object3D): void => {
      if (o === model.orbit) return;
      const mesh = o as THREE.Mesh;
      const solid = mesh.isMesh && (mesh.material as THREE.Material).depthWrite;
      const geo = solid ? mesh.geometry : null;
      if (geo) {
        if (!geo.boundingBox) geo.computeBoundingBox();
        bounds.union(new THREE.Box3().copy(geo.boundingBox!).applyMatrix4(o.matrixWorld));
      }
      o.children.forEach(grow);
    };
    grow(model.group);
    const size = bounds.getSize(new THREE.Vector3());
    const middle = bounds.getCenter(new THREE.Vector3());
    const k = Math.min(TROPHY.w / size.x, TROPHY.tall / size.y);
    // In the box's middle; a taller one stands on the box's foot, clear of the plaque, against its own back board.
    const up = Math.max(0, size.y * k - TROPHY.h) / 2;
    model.group.scale.setScalar(k);
    model.group.position.set(-middle.x * k, up - middle.y * k, 0);
    t.anchor.add(model.group);
    if (up) {
      // In the plane of the mount's own board, which it covers (the anchor stands 0.1 m in front of that).
      t.tall = mountBoard(TROPHY.board[0], size.y * k + 0.16);
      t.tall.position.set(0, up, -0.1);
      t.anchor.add(t.tall);
    }
    this.warm(model.group);
  }

  /** Height to stand a two-post board on: the lower post's ground, so on a slope the other post sinks in rather than one floating. */
  private footing(spot: Spot, postX: number): number {
    return Math.min(this.world(spot, -postX, 0).y, this.world(spot, postX, 0).y);
  }

  /** Redraws the two catch boards, each ranked by the most valuable fish every player has caught in that water. */
  setLeaders(lake: LeaderRow[], sea: LeaderRow[]): void {
    this.drawBoard(this.lakeFace, LAKE_BOARD, lake);
    this.setTrophy(this.lakeTrophy, lake[0]);
    if (this.seaFace) this.drawBoard(this.seaFace, SEA_BOARD, sea);
    if (this.seaTrophy) this.setTrophy(this.seaTrophy, sea[0]);
  }

  private drawBoard(face: BoardFace, look: BoardLook, rows: LeaderRow[]): void {
    // The boards are set again whenever anyone joins, leaves or changes their look: the same rows draw nothing.
    const drawn = JSON.stringify(rows.slice(0, 5).map((r) => [r.name, r.level, r.value, r.fish, r.tier, r.color, !!r.shiny, !!r.sea]));
    if (drawn === face.drawn) return;
    face.drawn = drawn;
    const ctx = face.ctx;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = look.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = look.trim;
    ctx.lineWidth = 10;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = look.head;
    ctx.font = '800 42px system-ui, sans-serif';
    ctx.fillText(look.title, w / 2, 60);
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.fillStyle = look.soft;
    ctx.fillText(look.sub, w / 2, 85);
    // Five rows fit the face (the canvas is 512 by about 400). A long name beside a sum in the millions would run
    // into it, so those are shortened (`boardSum`).
    rows.slice(0, 5).forEach((r, i) => {
      const y = 128 + i * 56;
      ctx.textAlign = 'left';
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.fillStyle = i === 0 ? look.first : '#ffffff';
      ctx.fillText(`${i + 1}. ${r.name.slice(0, 9)}`, 34, y);
      const nameW = ctx.measureText(`${i + 1}. ${r.name.slice(0, 9)}`).width;
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillStyle = look.soft;
      ctx.fillText(`Lv ${r.level}`, 34 + nameW + 9, y);
      ctx.textAlign = 'right';
      ctx.font = '800 30px system-ui, sans-serif';
      ctx.fillStyle = r.value ? '#ffd23a' : '#6f8aa3';
      if (r.value) fillCoinAmount(ctx, boardSum(r.value), w - 34, y, 30);
      else ctx.fillText('—', w - 34, y);
      if (r.value) {
        ctx.textAlign = 'left';
        ctx.font = '600 21px system-ui, sans-serif';
        ctx.fillStyle = r.color;
        ctx.fillText(`${r.shiny ? '✨ ' : ''}${r.sea ? '' : `T${r.tier} `}${r.fish}`, 52, y + 24);
      } else {
        ctx.textAlign = 'left';
        ctx.font = '600 20px system-ui, sans-serif';
        ctx.fillStyle = '#6f8aa3';
        ctx.fillText('no catch yet', 52, y + 24);
      }
    });
    if (!rows.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = look.soft;
      ctx.font = '700 30px system-ui, sans-serif';
      ctx.fillText(look.empty, w / 2, 200);
    }
    face.tex.needsUpdate = true;
  }

  /** A small "thank you" board on the campfire's rim, listing the players who tipped on Ko-fi. */
  private buildThanks(spot: Spot): void {
    const g = new THREE.Group();
    for (const lx of [-0.6, 0.6]) {
      const post = cyl(0.06, 0.08, 2.2, DARK, 8);
      post.position.set(lx, 1.1, -BEHIND);
      g.add(post);
    }
    const frame = rbox(1.6, 1.5, 0.1, 0x6b4a2b, 0.04);
    frame.position.set(0, 1.55, 0);
    const face = textPlane(1.45, 1.35, 384);
    face.mesh.position.set(0, 1.55, 0.06);
    const roof = rbox(1.9, 0.1, 0.55, 0xb5476e, 0.04);
    roof.position.set(0, 2.36, 0);
    roof.rotation.x = 0.15;
    const back = backBrace(1.5, 1.4);
    back.position.set(0, 1.55, -0.05);
    g.add(frame, face.mesh, roof, back);
    this.thanksCtx = face.ctx;
    this.thanksTex = face.tex;
    this.place(g, spot, 0, 0, this.footing(spot, 0.6));
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

  /** The Great Fire (`buildHearth`, camp.ts) in the middle of the campfire's terrace, with the light it casts. */
  private buildCampfire(spot: Spot): void {
    const hearth = buildHearth();
    this.flames.push(...hearth.flames);
    this.lampMats.push(...hearth.lamps);
    glowTag(this.fireLight, 2.6, 1, true);
    hearth.fireSpot.add(this.fireLight);
    this.place(hearth.group, spot);
    for (const [lx, lz, r] of hearth.solids) {
      const c = this.world(spot, lx, lz);
      this.fixed.push({ x: c.x, z: c.z, r });
    }
    // The seats round the fire are the terrace's (`buildCamp` in town.ts): its logs and the seat wall on the cove side.
    this.campSpot.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
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
