import * as THREE from 'three';
import { mat, rbox, cyl, ball, limb, textPlane, drawCoin, DARK } from './hub';
import { faceHead, SKIN } from './faces';
import { glowTag } from './nightglow';
import { boxUV, plankTexture, shingleTexture, sidingTexture } from './textures';
import { RODS, LINES, BAITS } from '../data/content';

/**
 * Marlow's BAIT & TACKLE shack on the quay (picked by Oscar from rounds of renders, 2026-11-15): a mint clapboard
 * shack with a red shingled gable roof and a carved fish in the gable, Marlow serving from its window. On the sill
 * the five baits in jars, inside a pegboard of lures and a shelf of line spools, on the street side a rack of the
 * five rods, out front a LIVE BAIT chalkboard, and a bait cooler against the far wall.
 *
 * Built in the stall's frame: the middle of the counter at the origin, +z out to the players, +x to their right.
 */

const TEAL = 0x2e8b8b;
const CREAM = 0xf3e6c8;
const RED = 0xd9534f;
const CORK = 0xc89b6a;
const STEEL = 0xc9ced3;
const SIDING = 0xbfe0d0;
const TRIM = 0xfaf6ec;
const SILL_WOOD = 0x8a6440;
const FONT = "'Nunito', system-ui, sans-serif";

const W = 3.6;
/** The front wall's middle, the back wall's and the eaves' height. */
const FZ = -0.15;
const BZ = -2.3;
const EAVE = 2.4;
const RISE = 1.05;
/** The serving window: its width, sill and head heights. */
const WIN = 2.5;
const SILL = 0.95;
const HEAD = 2.05;
/** The rod rack's rails, out from the street-side wall. */
const RX = -W / 2 - 0.28;

/** Where Marlow stands: inside, just behind the window (the stall's z). */
export const KEEPER_Z = -0.85;

/**
 * The pole on the street side that the string lights across the main street hang from (`buildCozy` in town.ts), in
 * the stall's frame: just outside the roof's edge, in front of the rod rack, tied back to the wall.
 */
export const LIGHTS_MAST = { x: -2.25, z: -0.3 };

/** Colliders in the stall's frame, [x, z, r], beside the counter's own row. */
export const SHOP_SOLIDS: [number, number, number][] = [
  [-1.2, -1.4, 0.9], [0, -1.6, 0.9], [1.2, -1.4, 0.9], [-1.5, -2.0, 0.45], [1.5, -2.0, 0.45],
  [RX, -1.2, 0.45], [RX, -0.5, 0.3], [LIGHTS_MAST.x, LIGHTS_MAST.z, 0.15], [2.2, -0.85, 0.42], [-2.3, 1.0, 0.35],
];

/**
 * Materials the shop shares, so the hub's merge (`mergeStatic`) bakes each into one draw: textured and glowing
 * parts aren't vertex-coloured, so they merge only when they share a material instance.
 */
class Mats {
  private cache = new Map<string, THREE.MeshLambertMaterial>();
  constructor(readonly lamps: THREE.MeshLambertMaterial[]) {}
  private get(key: string, make: () => THREE.MeshLambertMaterial): THREE.MeshLambertMaterial {
    let m = this.cache.get(key);
    if (!m) this.cache.set(key, (m = make()));
    return m;
  }
  painted(color: number, tex: THREE.Texture): THREE.MeshLambertMaterial {
    return this.get(`p${color}|${tex.uuid}`, () => mat(color, { map: tex }));
  }
  /** Valance cloth, lit a little from within so its shaded side reads as cloth, not a dark band. */
  cloth(color: number): THREE.MeshLambertMaterial {
    return this.get(`c${color}`, () => mat(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 }));
  }
  glowJar(color: number): THREE.MeshLambertMaterial {
    return this.get(`j${color}`, () => mat(color, { emissive: color, emissiveIntensity: 0.45 }));
  }
  /** Lantern glass: one material for all of them, brightening at night with the hub's lamps. */
  glass(): THREE.MeshLambertMaterial {
    return this.get('glass', () => {
      const m = mat(0xffd27a, { emissive: 0xffb84a });
      this.lamps.push(m);
      return m;
    });
  }
}

const textured = (m: THREE.Mesh, material: THREE.MeshLambertMaterial, scale: number): THREE.Mesh => {
  boxUV(m.geometry, scale);
  (m.material as THREE.Material).dispose();
  m.material = material;
  return m;
};

/** A canvas sign with a transparent background (alpha-tested), so it can be any shape. */
function shapedSign(w: number, h: number, px: number, draw: (g: CanvasRenderingContext2D, W: number, H: number) => void): THREE.Mesh {
  const s = textPlane(w, h, px);
  const g = s.ctx;
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  draw(g, g.canvas.width, g.canvas.height);
  s.tex.needsUpdate = true;
  (s.mesh.material as THREE.MeshBasicMaterial).alphaTest = 0.5;
  return s.mesh;
}

/** A little fish glyph pointing right, centred on (x, y), `s` px long. */
function fishGlyph(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, flip = false): void {
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(s * 0.08, 0, s * 0.36, s * 0.2, 0, 0, Math.PI * 2);
  g.moveTo(-s * 0.22, 0);
  g.lineTo(-s * 0.5, -s * 0.18);
  g.lineTo(-s * 0.5, s * 0.18);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.arc(s * 0.27, -s * 0.04, s * 0.035, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A carved wooden fish with real depth, pointing +x, about 1.2 m long at scale 1. */
function carvedFish(color: number, finColor: number): THREE.Group {
  const s = new THREE.Shape();
  s.moveTo(0.55, 0);
  s.quadraticCurveTo(0.25, 0.33, -0.3, 0.07);
  s.lineTo(-0.64, 0.27);
  s.quadraticCurveTo(-0.55, 0, -0.64, -0.27);
  s.lineTo(-0.3, -0.07);
  s.quadraticCurveTo(0.25, -0.33, 0.55, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -0.03);
  const body = new THREE.Mesh(geo, mat(color));
  body.castShadow = true;
  const fin = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 12, Math.PI * 0.9), mat(finColor));
  fin.rotation.z = -Math.PI * 0.45;
  fin.position.x = 0.18;
  fin.scale.z = 3.6;
  const eye = ball(0.045, 0x2a2a2a, 1, 1, 1.1);
  eye.position.set(0.38, 0.05, 0);
  const g = new THREE.Group();
  g.add(body, fin, eye);
  return g;
}

/** A hanging lantern: dark cap and base, a warm glass that glows at night, and a ring to hang it by. */
function lantern(mats: Mats): THREE.Group {
  const g = new THREE.Group();
  const glass = cyl(0.07, 0.07, 0.19, 0xffd27a, 8);
  (glass.material as THREE.Material).dispose();
  glass.material = mats.glass();
  glowTag(glass, 0.75);
  const cap = cyl(0.025, 0.1, 0.08, DARK, 8);
  cap.position.y = 0.135;
  const base = cyl(0.09, 0.085, 0.04, DARK, 8);
  base.position.y = -0.115;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 10), mat(DARK));
  ring.position.y = 0.2;
  g.add(glass, cap, base, ring);
  for (const a of [0.4, 2, 3.6, 5.2]) {
    const bar = cyl(0.008, 0.008, 0.2, DARK, 4);
    bar.position.set(Math.sin(a) * 0.072, 0, Math.cos(a) * 0.072);
    g.add(bar);
  }
  return g;
}

/** A fishing rod standing on its butt: cork grip, a reel, guides and a tapered blank in the rod's colour. */
function rod(color: number, len: number): THREE.Group {
  const g = new THREE.Group();
  const grip = cyl(0.028, 0.032, 0.36, CORK, 8);
  grip.position.y = 0.2;
  const butt = cyl(0.034, 0.034, 0.04, 0x333333, 8);
  butt.position.y = 0.02;
  const blank = cyl(0.008, 0.02, len - 0.4, color, 6);
  blank.position.y = 0.38 + (len - 0.4) / 2;
  const reel = cyl(0.055, 0.055, 0.04, STEEL, 12);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0, 0.46, 0.06);
  const foot = cyl(0.012, 0.012, 0.07, STEEL, 4);
  foot.rotation.x = Math.PI / 2;
  foot.position.set(0, 0.46, 0.025);
  g.add(grip, butt, blank, reel, foot);
  for (let i = 1; i <= 4; i++) {
    const guide = new THREE.Mesh(new THREE.TorusGeometry(0.018 - i * 0.002, 0.004, 4, 8), mat(STEEL));
    guide.position.set(0, 0.38 + (len - 0.4) * (i / 5), 0.025);
    g.add(guide);
  }
  return g;
}

/** A bait jar: the bait's colour inside, a lid and a cream label. */
function baitJar(mats: Mats, color: number, glow: boolean, lid: number): THREE.Group {
  const g = new THREE.Group();
  const body = cyl(0.075, 0.075, 0.18, color, 12);
  if (glow) {
    (body.material as THREE.Material).dispose();
    body.material = mats.glowJar(color);
  }
  body.position.y = 0.09;
  const label = cyl(0.077, 0.077, 0.07, CREAM, 12);
  label.position.y = 0.08;
  const top = cyl(0.08, 0.08, 0.04, lid, 12);
  top.position.y = 0.2;
  g.add(body, label, top);
  return g;
}

/** A spool of line in the line's colour, lying along x so the line faces out. */
function spool(color: number): THREE.Group {
  const g = new THREE.Group();
  const core = cyl(0.07, 0.07, 0.09, color, 12);
  core.rotation.z = Math.PI / 2;
  g.add(core);
  for (const x of [-0.05, 0.05]) {
    const flange = cyl(0.09, 0.09, 0.015, 0xe8e2d6, 12);
    flange.rotation.z = Math.PI / 2;
    flange.position.x = x;
    g.add(flange);
  }
  return g;
}

/** Low-poly spheres for the lures: they're a few centimetres across and there are twenty of them. */
const LURE_BODY = new THREE.SphereGeometry(1, 8, 5);
const LURE_BELLY = new THREE.SphereGeometry(1, 6, 4);
const lureBall = (geo: THREE.SphereGeometry, r: number, color: number, sx: number, sy: number, sz: number): THREE.Mesh => {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(r * sx, r * sy, r * sz);
  return m;
};

/** A lure: a teardrop body with a pale belly and a hook. */
function lure(color: number, s = 1): THREE.Group {
  const g = new THREE.Group();
  const body = lureBall(LURE_BODY, 0.035 * s, color, 0.75, 1.5, 0.75);
  const belly = lureBall(LURE_BELLY, 0.02 * s, 0xffffff, 0.6, 1.2, 0.6);
  belly.position.set(0, -0.005, 0.02 * s);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.018 * s, 0.004, 4, 8, Math.PI * 1.3), mat(STEEL));
  hook.position.y = -0.065 * s;
  g.add(body, belly, hook);
  return g;
}

/** The LIVE BAIT chalkboard on an A-frame, the same on both faces: the three cheapest baits and their prices. */
function chalkboard(): THREE.Group {
  const g = new THREE.Group();
  const BW = 0.62;
  const BH = 0.85;
  const sign = textPlane(BW, BH, 256);
  const c = sign.ctx;
  const cw = c.canvas.width;
  const ch = c.canvas.height;
  c.fillStyle = '#2f3b36';
  c.fillRect(0, 0, cw, ch);
  c.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 40; i++) c.fillRect((i * 97) % cw, (i * 53) % ch, 30, 2);
  c.fillStyle = '#f4efe2';
  c.textAlign = 'center';
  c.font = `900 44px ${FONT}`;
  c.fillText('LIVE BAIT', cw / 2, 64, cw - 36);
  c.strokeStyle = '#f4efe2';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(40, 84);
  c.lineTo(cw - 40, 84);
  c.stroke();
  c.font = `800 30px ${FONT}`;
  BAITS.slice(0, 3).forEach((b, i) => {
    const y = 132 + i * 46;
    c.textAlign = 'left';
    c.fillText(b.name.endsWith('y') ? `${b.name.slice(0, -1)}ies` : `${b.name}s`, 26, y, cw - 120);
    c.textAlign = 'right';
    c.fillText(String(b.price), cw - 58, y);
    drawCoin(c, cw - 36, y - 10, 24);
  });
  sign.tex.needsUpdate = true;
  for (const s of [1, -1]) {
    const leaf = new THREE.Group();
    const frame = rbox(BW + 0.08, BH + 0.08, 0.04, 0x7a5232, 0.02);
    const face = s > 0 ? sign.mesh : sign.mesh.clone();
    face.position.z = 0.025;
    leaf.add(frame, face);
    leaf.position.set(0, ((BH + 0.08) / 2) * Math.cos(0.22) + 0.02, s * 0.2);
    leaf.rotation.x = s * -0.22;
    if (s < 0) leaf.rotation.y = Math.PI;
    g.add(leaf);
  }
  return g;
}

/**
 * Builds the shack. `hang` makes one of the two fish that hang (and sway) under the eaves at its front corners;
 * glowing lantern glass is added to `lamps`.
 */
export function buildBaitShop(lamps: THREE.MeshLambertMaterial[], hang: (i: number) => THREE.Object3D): THREE.Group {
  const mats = new Mats(lamps);
  const g = new THREE.Group();
  const siding = mats.painted(SIDING, sidingTexture());
  const sidingBox = (w: number, h: number, d: number) => textured(rbox(w, h, d, SIDING, 0.02), siding, 1.05);
  const plank = mats.painted(SILL_WOOD, plankTexture());

  // Front wall round the serving window, the sides and the back, with trim on the front corners.
  const jw = (W - WIN) / 2;
  for (const sx of [-1, 1]) {
    const jamb = sidingBox(jw, EAVE, 0.14);
    jamb.position.set(sx * (W / 2 - jw / 2), EAVE / 2, FZ);
    const side = sidingBox(0.14, EAVE, FZ - BZ);
    side.position.set(sx * (W / 2 - 0.07), EAVE / 2, (FZ + BZ) / 2);
    g.add(jamb, side);
    for (const z of [FZ + 0.03, BZ - 0.03]) {
      const corner = rbox(0.1, EAVE, 0.1, TRIM, 0.02);
      corner.position.set(sx * (W / 2 - 0.02), EAVE / 2, z);
      g.add(corner);
    }
  }
  const below = sidingBox(WIN, SILL, 0.14);
  below.position.set(0, SILL / 2, FZ);
  const header = sidingBox(WIN, EAVE - HEAD, 0.14);
  header.position.set(0, (EAVE + HEAD) / 2, FZ);
  const back = sidingBox(W, EAVE, 0.14);
  back.position.set(0, EAVE / 2, BZ);
  // A plank floor inside, just above the ground, so the window doesn't look onto grass.
  const floor = textured(rbox(W - 0.28, 0.04, FZ - BZ - 0.14, SILL_WOOD, 0.01), plank, 1.6);
  floor.position.set(0, 0.02, (FZ + BZ) / 2);
  g.add(below, header, back, floor);
  for (const sx of [-1, 1]) {
    const t = rbox(0.08, HEAD - SILL + 0.08, 0.06, TRIM, 0.015);
    t.position.set(sx * (WIN / 2 + 0.02), (HEAD + SILL) / 2, FZ + 0.09);
    g.add(t);
  }
  const lintel = rbox(WIN + 0.2, 0.09, 0.07, TRIM, 0.015);
  lintel.position.set(0, HEAD + 0.03, FZ + 0.09);
  g.add(lintel);

  // The gables and a shingled roof: two slabs meeting at a ridge, overhanging the window.
  const tri = new THREE.Shape();
  tri.moveTo(-W / 2, 0);
  tri.lineTo(W / 2, 0);
  tri.lineTo(0, RISE);
  tri.closePath();
  for (const z of [FZ - 0.07, BZ - 0.07]) {
    const gable = new THREE.Mesh(boxUV(new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: false }), 1.05), siding);
    gable.position.set(0, EAVE, z);
    gable.castShadow = gable.receiveShadow = true;
    g.add(gable);
  }
  const a = Math.atan2(RISE, W / 2);
  const len = (W / 2 + 0.32) / Math.cos(a);
  const front = FZ + 0.6;
  const rear = BZ - 0.25;
  const shingles = mats.painted(0xc4594a, shingleTexture());
  for (const sx of [-1, 1]) {
    const slab = textured(rbox(len, 0.12, front - rear, 0xc4594a, 0.03), shingles, 1.5);
    slab.rotation.z = -sx * a;
    slab.position.set(sx * (len / 2) * Math.cos(a), EAVE + RISE - (len / 2) * Math.sin(a) + 0.08, (front + rear) / 2);
    const fascia = rbox(len, 0.14, 0.06, TRIM, 0.02);
    fascia.rotation.z = -sx * a;
    fascia.position.set(slab.position.x, slab.position.y - 0.06, front + 0.02);
    g.add(slab, fascia);
  }
  const ridge = cyl(0.08, 0.08, front - rear + 0.05, 0x8e3a30, 8);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, EAVE + RISE + 0.12, (front + rear) / 2);
  g.add(ridge);
  const fish = carvedFish(0xf0a04b, 0xc4703a);
  fish.scale.setScalar(0.62);
  fish.position.set(0, EAVE + 0.38, FZ + 0.12);
  g.add(fish);

  // The counter: a plank sill out in front of the window on two brackets, with the five baits in jars either
  // side of Marlow (the Glow Lure and the Moon Pearl glow).
  const sill = textured(rbox(WIN + 0.3, 0.08, 0.62, SILL_WOOD, 0.03), plank, 1.6);
  sill.position.set(0, SILL + 0.04, FZ + 0.18);
  g.add(sill);
  for (const sx of [-1, 1]) {
    const br = rbox(0.06, 0.28, 0.3, SILL_WOOD, 0.01);
    br.position.set(sx * 0.9, SILL - 0.15, FZ + 0.2);
    g.add(br);
  }
  BAITS.forEach((b, i) => {
    const j = baitJar(mats, b.color, i >= 3, i % 2 ? RED : TEAL);
    j.position.set(i < 3 ? -1.3 + i * 0.22 : 0.95 + (i - 3) * 0.24, SILL + 0.08, FZ + 0.28 + (i % 2) * 0.1);
    g.add(j);
  });

  // The sign across the header, and a scalloped red and cream valance under it.
  const sign = shapedSign(2.5, 0.52, 640, (c, SW, SH) => {
    c.beginPath();
    c.roundRect(6, 6, SW - 12, SH - 12, 26);
    c.fillStyle = '#6b4a2b';
    c.fill();
    c.lineWidth = 10;
    c.strokeStyle = '#3f2b19';
    c.stroke();
    c.beginPath();
    c.roundRect(22, 22, SW - 44, SH - 44, 16);
    c.lineWidth = 4;
    c.strokeStyle = '#e3c26d';
    c.stroke();
    c.fillStyle = '#fff3d6';
    c.font = `900 ${Math.round(SH * 0.5)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('BAIT & TACKLE', SW / 2, SH / 2 + 4);
    fishGlyph(c, 62, SH / 2, 70, '#e3c26d', true);
    fishGlyph(c, SW - 62, SH / 2, 70, '#e3c26d');
  });
  sign.position.set(0, EAVE - 0.08, FZ + 0.13);
  g.add(sign);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const sc = new THREE.Mesh(new THREE.CircleGeometry(WIN / n / 2, 12, Math.PI, Math.PI), mats.cloth(i % 2 ? CREAM : RED));
    sc.position.set(-WIN / 2 + (i + 0.5) * (WIN / n), HEAD, FZ + 0.1);
    g.add(sc);
  }

  // Inside: a pegboard of lures and a shelf of line spools on the back wall, and a lantern hung from the ceiling
  // beside Marlow, which shows lit through the window at night. Play-test: the lantern's spot.
  const peg = rbox(1.6, 0.9, 0.04, 0xd8bb8a, 0.01);
  peg.position.set(-0.35, 1.55, BZ + 0.1);
  g.add(peg);
  const tones = [...BAITS.map((b) => b.color), ...RODS.map((r) => r.color), 0xe8463a, 0xf2f2f2];
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 6; col++) {
      const l = lure(tones[(r * 6 + col) % tones.length], 1.3);
      l.position.set(-1.0 + col * 0.26, 1.85 - r * 0.28, BZ + 0.15);
      g.add(l);
    }
  }
  const shelf = rbox(0.9, 0.05, 0.28, SILL_WOOD, 0.01);
  shelf.position.set(1.15, 1.55, BZ + 0.2);
  g.add(shelf);
  LINES.forEach((l, i) => {
    const s = spool(l.color);
    s.position.set(0.8 + (i % 3) * 0.28 + (i >= 3 ? 0.14 : 0), 1.67 + Math.floor(i / 3) * 0.2, BZ + 0.2);
    g.add(s);
  });
  const inside = lantern(mats);
  inside.position.set(0.85, 2.05, -1.1);
  const cord = cyl(0.006, 0.006, 0.3, DARK, 3);
  cord.position.set(0.85, 2.3, -1.1);
  g.add(inside, cord);

  // A lantern on a bracket either side of the window.
  for (const sx of [-1, 1]) {
    const arm = rbox(0.04, 0.04, 0.32, DARK, 0.01);
    arm.position.set(sx * (WIN / 2 + 0.3), 1.98, FZ + 0.22);
    const l = lantern(mats);
    l.position.set(sx * (WIN / 2 + 0.3), 1.72, FZ + 0.34);
    g.add(arm, l);
  }

  // The street side: a rack of the five rods in their tier colours, leaning on the wall.
  const rack = mats.painted(SILL_WOOD, plankTexture());
  for (const y of [0.35, 1.35]) {
    const rail = textured(rbox(0.08, 0.08, 1.7, SILL_WOOD, 0.02), rack, 1.6);
    rail.position.set(RX, y, -1.2);
    g.add(rail);
  }
  for (const z of [-0.4, -2.0]) {
    const post = rbox(0.08, 1.45, 0.08, 0x6b4a2b, 0.02);
    post.position.set(RX, 0.72, z);
    const tie = rbox(0.28, 0.06, 0.06, 0x6b4a2b, 0.01);
    tie.position.set(RX + 0.14, 1.35, z);
    g.add(post, tie);
  }
  // The string lights' pole stands here (town.ts builds it with the string); a bracket ties it to the wall.
  const tieM = rbox(-W / 2 - LIGHTS_MAST.x, 0.06, 0.06, 0x6b4a2b, 0.01);
  tieM.position.set((LIGHTS_MAST.x - W / 2) / 2, 2.15, LIGHTS_MAST.z);
  g.add(tieM);
  RODS.forEach((r, i) => {
    const rd = rod(r.color, 2.2 + i * 0.08);
    rd.position.set(RX - 0.06, 0.05, -0.65 - i * 0.32);
    rd.rotation.set(0, Math.PI / 2, -0.1);
    g.add(rd);
  });

  // Out front on the street side the chalkboard; a bait cooler against the other side wall, off the quay road.
  const board = chalkboard();
  board.position.set(-2.3, 0, 1.0);
  board.rotation.y = -0.5;
  g.add(board);
  const cooler = new THREE.Group();
  const box = rbox(0.75, 0.42, 0.45, TEAL, 0.05);
  box.position.y = 0.21;
  const lid = rbox(0.79, 0.09, 0.49, 0xf4f1ea, 0.04);
  lid.position.y = 0.46;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 4, 10, Math.PI), mat(0xf4f1ea));
  handle.rotation.y = Math.PI / 2;
  handle.position.set(0.39, 0.32, 0);
  cooler.add(box, lid, handle);
  cooler.position.set(2.2, 0, -0.85);
  cooler.rotation.y = Math.PI / 2;
  g.add(cooler);

  for (const i of [0, 1]) {
    const h = hang(i);
    h.position.set(i ? 2.05 : -2.05, 2.25, FZ + 0.42);
    g.add(h);
  }
  return g;
}

/**
 * Dresses Marlow, built facing +z with his feet at the origin: a cream shirt with rolled sleeves under an olive
 * fishing vest with four pockets, a full white beard and moustache, and a bucket hat with three lures pinned to it.
 * His hands rest on the sill. The head (`head`, which turns to the player) gets the face, beard and hat.
 */
export function dressMarlow(npc: THREE.Group, head: THREE.Group, face?: string): void {
  const SHIRT = 0xe9e2d0;
  const VEST = 0x7d8650;
  const POCKET = 0x6a7244;
  const BEARD = 0xeeeeee;
  const HAT = 0xcfc2a0;

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 8, 14), mat(SHIRT));
  body.position.y = 1.05;
  body.scale.z = 0.85;
  body.castShadow = true;
  // The vest: an open-fronted shell round the torso and a cap over the shoulders, the shirt showing down the front.
  const open = 0.42;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.335, 0.66, 18, 1, true, open, Math.PI * 2 - open * 2), mat(VEST, { side: THREE.DoubleSide }));
  shell.position.y = 1.02;
  shell.scale.z = 0.88;
  shell.castShadow = true;
  const yoke = new THREE.Mesh(new THREE.SphereGeometry(0.312, 18, 8, open, Math.PI * 2 - open * 2, 0, Math.PI / 2), mat(VEST, { side: THREE.DoubleSide }));
  yoke.position.y = 1.34;
  yoke.scale.set(1, 0.55, 0.88);
  npc.add(body, shell, yoke);
  for (const sx of [-1, 1]) {
    for (const y of [0.95, 1.18]) {
      const pocket = rbox(0.13, 0.12, 0.04, POCKET, 0.015);
      pocket.position.set(sx * 0.17, y, 0.27);
      pocket.rotation.y = sx * 0.45;
      const flap = rbox(0.14, 0.035, 0.05, VEST, 0.01);
      flap.position.set(sx * 0.17, y + 0.06, 0.275);
      flap.rotation.y = sx * 0.45;
      npc.add(pocket, flap);
    }
  }
  // Arms: shirt to the elbow, a rolled cuff, bare forearms, hands on the sill.
  for (const sx of [-1, 1]) {
    const sh = new THREE.Vector3(sx * 0.33, 1.4, 0);
    const hand = new THREE.Vector3(sx * 0.36, 1.05, 0.62);
    const elbow = sh.clone().lerp(hand, 0.5);
    elbow.x += sx * 0.06;
    elbow.y -= 0.05;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.03, 6, 12), mat(SHIRT));
    cuff.position.copy(elbow);
    cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), hand.clone().sub(elbow).normalize());
    const fist = ball(0.095, SKIN);
    fist.position.copy(hand);
    npc.add(limb(sh, elbow, 0.095, SHIRT), cuff, limb(elbow, hand, 0.075, SKIN), fist);
  }

  head.position.y = 1.78;
  head.add(faceHead(0.22, face));
  // The beard sits below the mouth, so the painted smile still shows; the moustache above it, sideburns either side.
  const beard = ball(0.17, BEARD, 1, 0.78, 0.72);
  beard.position.set(0, -0.17, 0.08);
  head.add(beard);
  for (const sx of [-1, 1]) {
    const m = ball(0.055, BEARD, 1.3, 0.55, 0.7);
    m.position.set(sx * 0.055, -0.065, 0.2);
    m.rotation.z = sx * 0.35;
    const side = ball(0.07, BEARD, 0.7, 1.2, 0.9);
    side.position.set(sx * 0.17, -0.08, 0.06);
    head.add(m, side);
  }
  const brim = cyl(0.3, 0.36, 0.08, HAT, 20);
  brim.position.y = 0.12;
  const crown = cyl(0.23, 0.25, 0.17, HAT, 18);
  crown.position.y = 0.22;
  const top = cyl(0.2, 0.23, 0.04, HAT, 18);
  top.position.y = 0.32;
  const band = cyl(0.255, 0.255, 0.05, POCKET, 18);
  band.position.y = 0.16;
  head.add(brim, crown, top, band);
  [0xe8463a, 0xffc933, 0x4a90e2].forEach((c, i) => {
    const l = lure(c, 0.9);
    const a = -0.6 + i * 0.55;
    l.position.set(Math.sin(a) * 0.26, 0.21, Math.cos(a) * 0.26);
    l.rotation.y = a;
    head.add(l);
  });
  npc.add(head);
}
