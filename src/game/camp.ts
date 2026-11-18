import * as THREE from 'three';
import { mat, rbox, cyl, ball, textPlane, backBrace, DARK, WOOD, BEHIND } from './hub';
import { glowTag } from './nightglow';
import { boxUV, plankTexture, shingleTexture, sidingTexture, stoneTexture } from './textures';
import { mulberry } from './env';
import { FISH } from '../data/content';

/**
 * Anglers' Rest props (docs/community-zone/a-ember-point.md): the Great Fire, the crown's posts, Bram's Kettle, the
 * Legends' Totem, hedges, picket fences, stone walls and steps, the skipping stones, the rocket rack and the small
 * boards of the camp. Builders only: each returns a group in the prop's own space (metres, ground contact at y = 0,
 * front toward +z, centred on the origin) with the collision circles `solids` ([x, z, r]) where it blocks walking.
 * No prop carries a light; glowing parts use emissive materials, tagged with `glowTag`, which are handed back as
 * `lamps` for the caller to register with the map's night lamps. Arc builders take bearings in degrees round from +z
 * toward +x (0 = +z, 90 = +x), about the origin, like `byFire` in maps.ts.
 */

const FONT = "'Nunito', system-ui, sans-serif";
const STONE = 0xb4ada2;
const CAPSTONE = 0xd6cfc0;
const PALE_PLANK = 0xc9ad7a;
const CREAM = 0xf6ead0;
const SIDING = 0xa9cde3;
const TRIM = 0xfaf6ec;
const SILL_WOOD = 0x8a6440;
const BRASS = 0xc9a24a;
const IRON = 0x3d3d44;
const FRAME = 0x6b4a2b;

type Solid = [number, number, number];
type Ground = (x: number, z: number) => number;
const flat: Ground = () => 0;
const rad = (deg: number) => (deg * Math.PI) / 180;
const bearing = (r: number, deg: number): [number, number] => [r * Math.sin(rad(deg)), r * Math.cos(rad(deg))];

// ---------- shared materials ----------

/** Textured and cloth materials are shared by instance, so the map's `mergeStatic` bakes each into one draw. */
const shared = new Map<string, THREE.MeshLambertMaterial>();
const painted = (color: number, tex: THREE.Texture): THREE.MeshLambertMaterial => {
  const key = `p${color}|${tex.uuid}`;
  let m = shared.get(key);
  if (!m) shared.set(key, (m = mat(color, { map: tex })));
  return m;
};
/** Awning and valance cloth, lit a little from within so its shaded side reads as cloth. */
const cloth = (color: number): THREE.MeshLambertMaterial => {
  const key = `c${color}`;
  let m = shared.get(key);
  if (!m) shared.set(key, (m = mat(color, { side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 })));
  return m;
};

const textured = (m: THREE.Mesh, material: THREE.MeshLambertMaterial, scale: number): THREE.Mesh => {
  boxUV(m.geometry, scale);
  (m.material as THREE.Material).dispose();
  m.material = material;
  return m;
};
const stoneMat = () => painted(STONE, stoneTexture());
const stoneBox = (w: number, h: number, d: number, r = 0.03): THREE.Mesh => textured(rbox(w, h, d, STONE, r), stoneMat(), 1.6);

/** A lamp's warm glass: its own emissive material per prop, which the caller registers as a night lamp. */
const glassMat = (): THREE.MeshLambertMaterial => mat(0xffd27a, { emissive: 0xffb84a });

/** Lantern glass on a brass-dark frame, as on the town's lamp posts: a glowing box with a cap. Hung from `y` up. */
function lantern(glass: THREE.MeshLambertMaterial, size = 1): THREE.Group {
  const g = new THREE.Group();
  const glow = rbox(0.22 * size, 0.28 * size, 0.22 * size, 0xffd27a, 0.05 * size);
  glow.material = glass;
  glowTag(glow, 0.75);
  const cap = cyl(0.01, 0.15 * size, 0.1 * size, DARK, 6);
  cap.position.y = 0.19 * size;
  const base = cyl(0.1 * size, 0.09 * size, 0.04 * size, DARK, 6);
  base.position.y = -0.16 * size;
  g.add(glow, cap, base);
  return g;
}

/** A canvas text plane that fits `text` to the plane's width, drawn by `ink` on `paper`. */
function textFace(w: number, h: number, px: number, paper: string, ink: string, text: string, weight = 900): ReturnType<typeof textPlane> {
  const t = textPlane(w, h, px);
  const g = t.ctx;
  const { width: cw, height: ch } = g.canvas;
  g.fillStyle = paper;
  g.fillRect(0, 0, cw, ch);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${weight} ${Math.round(ch * 0.55)}px ${FONT}`;
  g.fillText(text, cw / 2, ch / 2 + 2, cw - 24);
  t.tex.needsUpdate = true;
  return t;
}

// ---------- the pieces several props share ----------

/** A kettle: a squat body, a lid with a knob, a spout and an arched handle. About 0.3 m wide at scale 1; the base at y = 0. */
function kettle(color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const body = ball(0.15, color, 1, 0.8, 1);
  body.position.y = 0.12;
  const lid = cyl(0.07, 0.1, 0.05, color, 10);
  lid.position.y = 0.24;
  const knob = ball(0.03, DARK);
  knob.position.y = 0.285;
  const spout = cyl(0.025, 0.045, 0.16, color, 8);
  spout.position.set(0.17, 0.17, 0);
  spout.rotation.z = -0.9;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 5, 10, Math.PI), mat(DARK));
  handle.position.y = 0.23;
  handle.rotation.y = Math.PI / 2;
  g.add(body, lid, knob, spout, handle);
  g.scale.setScalar(scale);
  return g;
}

/** A mug with a handle, standing on y = 0. */
function mug(color: number): THREE.Group {
  const g = new THREE.Group();
  const cup = cyl(0.04, 0.034, 0.085, color, 8);
  cup.position.y = 0.043;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 4, 8, Math.PI), mat(color));
  handle.position.set(0.04, 0.045, 0);
  handle.rotation.z = -Math.PI / 2;
  g.add(cup, handle);
  return g;
}

/**
 * A firework rocket: a painted tube with a dark nose, three fins and a wooden stick below, standing up with the
 * tube's foot at y = 0 (the stick runs 0.45 m down from it).
 */
function rocket(color: number): THREE.Group {
  const g = new THREE.Group();
  const tube = cyl(0.04, 0.04, 0.34, color, 8);
  tube.position.y = 0.17;
  const band = cyl(0.043, 0.043, 0.05, CREAM, 8);
  band.position.y = 0.09;
  const nose = cyl(0.002, 0.04, 0.12, DARK, 8);
  nose.position.y = 0.4;
  const stick = cyl(0.007, 0.007, 0.45, SILL_WOOD, 4);
  stick.position.y = -0.2;
  g.add(tube, band, nose, stick);
  for (let i = 0; i < 3; i++) {
    const fin = rbox(0.008, 0.1, 0.07, color, 0.003);
    fin.position.set(Math.sin((i * Math.PI * 2) / 3) * 0.055, 0.05, Math.cos((i * Math.PI * 2) / 3) * 0.055);
    fin.rotation.y = (i * Math.PI * 2) / 3 + Math.PI / 2;
    g.add(fin);
  }
  return g;
}
const ROCKETS = [0xe5483f, 0x3f82d9, 0xf2b933];

/** A slatted crate, open at the top, with its foot at y = 0. */
function crate(w: number, h: number, d: number): THREE.Group {
  const g = new THREE.Group();
  const plank = painted(SILL_WOOD, plankTexture());
  const wall = (ww: number, hh: number, dd: number, x: number, z: number) => {
    const b = textured(rbox(ww, hh, dd, SILL_WOOD, 0.012), plank, 1.6);
    b.position.set(x, h / 2, z);
    g.add(b);
  };
  const t = 0.03;
  wall(w, h, t, 0, d / 2 - t / 2);
  wall(w, h, t, 0, -d / 2 + t / 2);
  wall(t, h, d - 2 * t, w / 2 - t / 2, 0);
  wall(t, h, d - 2 * t, -w / 2 + t / 2, 0);
  const floor = rbox(w - 0.02, 0.03, d - 0.02, 0x6b4a2b, 0.01);
  floor.position.y = 0.04;
  g.add(floor);
  for (const sx of [-1, 1]) {
    const cleat = rbox(0.045, h + 0.02, 0.045, 0x6b4a2b, 0.01);
    cleat.position.set(sx * (w / 2 - 0.01), h / 2, d / 2 - 0.01);
    g.add(cleat);
  }
  return g;
}

// ---------- 1. the Great Fire ----------

/** The Great Fire: what `buildHearth` returns. */
export interface Hearth {
  group: THREE.Group;
  solids: Solid[];
  /** The flame cones, biggest first, then the small licks: flicker them as hub.ts does (scale and spin each). */
  flames: THREE.Mesh[];
  /** Embers glowing among the logs: register as a night lamp. */
  lamps: THREE.MeshLambertMaterial[];
  /** 1 m up the middle of the flames: the caller's fire light goes here, `glowTag`ged for its night halo. */
  fireSpot: THREE.Object3D;
}

/** Where the kettle's tripod stands, at the hearth's edge (local x, z), on the front-left where the camp sees it. */
export const HEARTH_TRIPOD = { x: -1.27, z: 0.89 };

/**
 * The Great Fire: a stone hearth 2.1 m across on a rim of flat slabs, a criss-cross of logs on a bed of embers, a tall
 * flame to about 1.9 m with a yellow core and five leaning tongues, and a kettle on an iron tripod at its edge.
 */
export function buildHearth(): Hearth {
  const g = new THREE.Group();
  const rnd = mulberry(7);
  const grey = [0x9a958a, 0xaaa59a, 0x8c887e];
  const stones = grey.map((c) => mat(c));
  // The slab rim: flat stones laid round under the ring, out to 1.05 m.
  const nSlab = 10;
  for (let i = 0; i < nSlab; i++) {
    const a = (i / nSlab) * Math.PI * 2;
    const slab = rbox(0.62, 0.1, 0.52 + rnd() * 0.06, grey[(i + 1) % 3] + 0x080808, 0.03);
    slab.position.set(Math.sin(a) * 0.78, 0.05, Math.cos(a) * 0.78);
    slab.rotation.y = a + (rnd() - 0.5) * 0.12;
    g.add(slab);
  }
  // The ring: chunky stones of mixed size standing on it.
  const nStone = 11;
  for (let i = 0; i < nStone; i++) {
    const a = ((i + (rnd() - 0.5) * 0.3) / nStone) * Math.PI * 2;
    const r = 0.2 + rnd() * 0.12;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stones[i % 3]);
    s.position.set(Math.sin(a) * (1.05 - r * 0.85), 0.1 + r * 0.6, Math.cos(a) * (1.05 - r * 0.85));
    s.scale.set(1.05, 0.72, 0.9);
    s.rotation.set(rnd(), rnd() * 6, rnd());
    s.castShadow = s.receiveShadow = true;
    g.add(s);
  }
  for (let i = 0; i < 5; i++) {
    const a = ((i + 0.5) / 5) * Math.PI * 2 + 0.3;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + rnd() * 0.05, 0), stones[(i + 1) % 3]);
    s.position.set(Math.sin(a) * 0.85, 0.5, Math.cos(a) * 0.85);
    s.scale.set(1, 0.7, 0.9);
    s.rotation.set(rnd(), rnd() * 6, rnd());
    s.castShadow = true;
    g.add(s);
  }

  // The ember bed: a low glowing disc under the logs.
  const embers = mat(0xff7a2a, { emissive: 0xff5a1a });
  const bed = cyl(0.7, 0.74, 0.06, 0xff7a2a, 14);
  bed.material = embers;
  bed.position.y = 0.13;
  glowTag(bed, 1.2, 1, true);
  g.add(bed);

  // The logs, laid criss-cross: two across x, two across z on top of them, two across x again, shorter each course.
  const logCol = [0x5b3a1e, 0x6b4526, 0x4d311a];
  const courses: [number, number, number, number][] = [[0, 0.24, 0.2, 1.25], [1, 0.22, 0.38, 1.1], [0, 0.12, 0.55, 0.9]];
  courses.forEach(([dir, off, y, len], c) => {
    for (const sgn of [-1, 1]) {
      const log = cyl(0.085, 0.095, len, logCol[(c + (sgn > 0 ? 1 : 0)) % 3], 8);
      log.rotation.z = dir === 0 ? Math.PI / 2 : 0;
      log.rotation.x = dir === 1 ? Math.PI / 2 : 0;
      log.position.set(dir === 1 ? sgn * off : 0, y, dir === 0 ? sgn * off : 0);
      log.rotation.y = (sgn * 0.06) * (c + 1);
      g.add(log);
    }
  });

  // Flames: a tall centre flame, a yellow core and five leaning tongues of uneven length and spacing.
  const flames: THREE.Mesh[] = [];
  const flame = (h: number, r: number, color: number, x: number, z: number, lean: number, out: number): void => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    const dx = Math.sin(lean) * Math.sin(out);
    const dz = Math.sin(lean) * Math.cos(out);
    f.position.set(x + (dx * h) / 2, 0.3 + (Math.cos(lean) * h) / 2, z + (dz * h) / 2);
    // Leaned first and spun last, so the caller's spin (`rotation.y`) turns a tongue about its own axis.
    f.rotation.order = 'XZY';
    f.rotation.set(dz ? Math.asin(dz) : 0, 0, dx ? -Math.asin(dx) : 0);
    flames.push(f);
    g.add(f);
  };
  flame(1.6, 0.4, 0xff6a1a, 0, 0, 0, 0);
  flame(1.1, 0.24, 0xffe14a, 0, 0, 0, 0);
  [[1.3, 0xff8a1f, 0, 0.26], [0.9, 0xffa51f, 1.2, 0.22], [1.1, 0xff6a1a, 2.6, 0.24], [0.8, 0xffb52f, 3.7, 0.2], [1.2, 0xff7a1a, 5.1, 0.23]].forEach(([h, c, ang, lean], i) => {
    const out = ang as number;
    flame(h as number, 0.19 - (i % 2) * 0.03, c as number, Math.sin(out) * 0.38, Math.cos(out) * 0.38, ((10 + (i * 2) % 9) * Math.PI) / 180, out);
    void lean;
  });

  const fireSpot = new THREE.Object3D();
  fireSpot.position.y = 1;
  g.add(fireSpot);

  // The kettle's tripod: three iron legs meeting over a hook, the kettle on its chain.
  const t = new THREE.Group();
  const spread = 0.42;
  const height = 1.1;
  const tilt = Math.atan(spread / height);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 3) * Math.PI * 2 + 0.5;
    const leg = cyl(0.02, 0.028, Math.hypot(spread, height), IRON, 6);
    leg.position.set(0, height / 2, spread / 2);
    leg.rotation.x = -tilt;
    pivot.add(leg);
    t.add(pivot);
  }
  const hub = cyl(0.045, 0.045, 0.07, IRON, 6);
  hub.position.y = height;
  const chain = cyl(0.008, 0.008, 0.4, IRON, 4);
  chain.position.y = height - 0.22;
  const pot = kettle(0x56565e, 1.5);
  pot.position.y = height - 0.82;
  t.add(hub, chain, pot);
  t.position.set(HEARTH_TRIPOD.x, 0, HEARTH_TRIPOD.z);
  g.add(t);

  return { group: g, solids: [[0, 0, 1.12], [HEARTH_TRIPOD.x, HEARTH_TRIPOD.z, 0.3]], flames, lamps: [embers], fireSpot };
}

// ---------- 2. the crown's posts ----------

/** A tall dark post for the ring of string lights, with a brass collar and a small finial. */
export function buildCrownPost(height = 3.3): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const post = cyl(0.05, 0.065, height, DARK, 8);
  post.position.y = height / 2;
  const foot = cyl(0.1, 0.12, 0.18, DARK, 8);
  foot.position.y = 0.09;
  const collar = cyl(0.075, 0.075, 0.06, BRASS, 8);
  collar.position.y = height - 0.06;
  const cap = cyl(0.015, 0.08, 0.1, DARK, 8);
  cap.position.y = height + 0.04;
  const finial = ball(0.05, BRASS);
  finial.position.y = height + 0.13;
  g.add(post, foot, collar, cap, finial);
  return { group: g, solids: [[0, 0, 0.15]] };
}

// ---------- 3. Bram's Kettle ----------

const KW = 3.2;
const KFZ = 0.95;
const KBZ = -1.1;
const KEAVE = 2.35;
const KRISE = 0.8;
const KWIN = 2.3;
const KSILL = 0.95;
const KHEAD = 1.98;

/** Where Bram stands: behind the counter, inside the shack (local x, z). */
export const KETTLE_KEEPER = { x: 0, z: 0.1 };
/** The counter's front edge (local z): the player stands in front of it. */
export const KETTLE_COUNTER_Z = 1.5;
/** Colliders in the stall's frame, [x, z, r]: the shack, the counter's row, the awning posts and the crate. */
export const KETTLE_SOLIDS: Solid[] = [
  [-1.15, -0.6, 0.8], [0, -0.7, 0.85], [1.15, -0.6, 0.8], [-1.1, 1.2, 0.4], [0, 1.2, 0.4], [1.1, 1.2, 0.4],
  [-1.5, 1.2, 0.35], [1.5, 1.2, 0.35], [-1.3, 1.72, 0.12], [1.3, 1.72, 0.12], [2.05, 0.7, 0.4],
];

/** Bram's Kettle, the host's stall: what `buildKettleStall` returns. */
export interface KettleStall {
  group: THREE.Group;
  solids: Solid[];
  /** Where the keeper stands, in the stall's frame. */
  keeper: { x: number; z: number };
  /** The lantern's glass: register as a night lamp. */
  lamps: THREE.MeshLambertMaterial[];
  /** The lantern under the awning: the camp's one light that casts goes here. */
  lantern: THREE.Object3D;
  /** The counter plaque's canvas: write on it and set `tex.needsUpdate`. */
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

/**
 * Bram's Kettle: a pale blue clapboard shack 3.2 m wide by 2.2 m deep, in the family of Marlow's. A counter across
 * the front (+z) under a coral-and-cream striped awning, a hanging sign, a kettle and mugs on the counter, a crate of
 * rockets beside it, a lantern hung from the awning and a small plaque on the counter ("Light it on the jetty").
 */
export function buildKettleStall(): KettleStall {
  const g = new THREE.Group();
  const siding = painted(SIDING, sidingTexture());
  const plank = painted(SILL_WOOD, plankTexture());
  const sidingBox = (w: number, h: number, d: number) => textured(rbox(w, h, d, SIDING, 0.02), siding, 1.05);
  const T = 0.14;
  const depth = KFZ - KBZ;
  const jw = (KW - KWIN) / 2;

  for (const sx of [-1, 1]) {
    const jamb = sidingBox(jw, KEAVE, T);
    jamb.position.set(sx * (KW / 2 - jw / 2), KEAVE / 2, KFZ);
    const side = sidingBox(T, KEAVE, depth);
    side.position.set(sx * (KW / 2 - T / 2), KEAVE / 2, (KFZ + KBZ) / 2);
    g.add(jamb, side);
    for (const z of [KFZ + 0.03, KBZ - 0.03]) {
      const corner = rbox(0.1, KEAVE, 0.1, TRIM, 0.02);
      corner.position.set(sx * (KW / 2 - 0.02), KEAVE / 2, z);
      g.add(corner);
    }
  }
  const below = sidingBox(KWIN, KSILL, T);
  below.position.set(0, KSILL / 2, KFZ);
  const header = sidingBox(KWIN, KEAVE - KHEAD, T);
  header.position.set(0, (KEAVE + KHEAD) / 2, KFZ);
  const back = sidingBox(KW, KEAVE, T);
  back.position.set(0, KEAVE / 2, KBZ);
  const floor = textured(rbox(KW - 0.28, 0.04, depth - T, SILL_WOOD, 0.01), plank, 1.6);
  floor.position.set(0, 0.02, (KFZ + KBZ) / 2);
  g.add(below, header, back, floor);
  for (const sx of [-1, 1]) {
    const t = rbox(0.08, KHEAD - KSILL + 0.08, 0.06, TRIM, 0.015);
    t.position.set(sx * (KWIN / 2 + 0.02), (KHEAD + KSILL) / 2, KFZ + 0.09);
    g.add(t);
  }
  const lintel = rbox(KWIN + 0.2, 0.09, 0.07, TRIM, 0.015);
  lintel.position.set(0, KHEAD + 0.03, KFZ + 0.09);
  g.add(lintel);

  // The gables and the shingled roof, in slate blue.
  const tri = new THREE.Shape();
  tri.moveTo(-KW / 2, 0);
  tri.lineTo(KW / 2, 0);
  tri.lineTo(0, KRISE);
  tri.closePath();
  for (const z of [KFZ - T / 2, KBZ - T / 2]) {
    const gable = new THREE.Mesh(boxUV(new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false }), 1.05), siding);
    gable.position.set(0, KEAVE, z);
    gable.castShadow = gable.receiveShadow = true;
    g.add(gable);
  }
  const a = Math.atan2(KRISE, KW / 2);
  const len = (KW / 2 + 0.3) / Math.cos(a);
  const front = KFZ + 0.5;
  const rear = KBZ - 0.25;
  const roof = painted(0x5f7fa3, shingleTexture());
  for (const sx of [-1, 1]) {
    const slab = textured(rbox(len, 0.12, front - rear, 0x5f7fa3, 0.03), roof, 1.5);
    slab.rotation.z = -sx * a;
    slab.position.set(sx * (len / 2) * Math.cos(a), KEAVE + KRISE - (len / 2) * Math.sin(a) + 0.08, (front + rear) / 2);
    const fascia = rbox(len, 0.14, 0.06, TRIM, 0.02);
    fascia.rotation.z = -sx * a;
    fascia.position.set(slab.position.x, slab.position.y - 0.06, front + 0.02);
    g.add(slab, fascia);
  }
  const ridge = cyl(0.08, 0.08, front - rear + 0.05, 0x44607f, 8);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, KEAVE + KRISE + 0.12, (front + rear) / 2);
  g.add(ridge);
  // A chimney for the kettle's stove, out of the back slope.
  const chim = textured(rbox(0.34, 0.8, 0.34, 0xa08478, 0.02), painted(0xa08478, stoneTexture()), 1.6);
  chim.position.set(1.0, KEAVE + 0.75, KBZ + 0.4);
  const chimCap = rbox(0.42, 0.07, 0.42, 0x8a7266, 0.02);
  chimCap.position.set(1.0, KEAVE + 1.18, KBZ + 0.4);
  g.add(chim, chimCap);

  // The counter: a plank sill on two brackets out in front of the window.
  const counter = sidingBox(KWIN + 0.3, KSILL, 0.4);
  counter.position.set(0, KSILL / 2, KFZ + 0.27);
  const sill = textured(rbox(KWIN + 0.46, 0.08, 0.64, SILL_WOOD, 0.03), plank, 1.6);
  sill.position.set(0, KSILL + 0.04, KFZ + 0.27);
  g.add(counter, sill);
  const top = KSILL + 0.08;
  const pot = kettle(0xc07a44, 1.15);
  pot.position.set(-0.75, top, KFZ + 0.3);
  g.add(pot);
  [0xf6ead0, 0xee7b6b, 0x7fb6d9].forEach((c, i) => {
    const m = mug(c);
    m.position.set(-0.3 + i * 0.17, top, KFZ + 0.22 + (i % 2) * 0.1);
    m.rotation.y = i;
    g.add(m);
  });
  const plaque = buildPlaque(0.5);
  plaque.group.position.set(0.55, top + 0.02, KFZ + 0.4);
  plaque.group.rotation.x = -0.35;
  g.add(plaque.group);
  writePlaque(plaque.ctx, plaque.tex, 'Light it on the jetty');

  // The awning: coral and cream stripes sloping out over the counter, a scalloped valance, two posts. Its front edge
  // is above a standing player's eye, so the keeper's face shows under it from the counter.
  const AW = 2.8;
  const n = 10;
  const slope = 0.16;
  const alen = 0.95;
  const ATOP = 2.2;
  const drop = Math.atan2(slope, alen);
  const run = Math.hypot(slope, alen);
  for (let i = 0; i < n; i++) {
    const s = rbox(AW / n + 0.004, 0.03, run, i % 2 ? CREAM : 0xee7b6b, 0.008);
    s.rotation.x = drop;
    s.position.set(-AW / 2 + (i + 0.5) * (AW / n), ATOP - slope / 2, KFZ + 0.03 + alen / 2);
    g.add(s);
    const sc = new THREE.Mesh(new THREE.CircleGeometry(AW / n / 2, 10, Math.PI, Math.PI), cloth(i % 2 ? CREAM : 0xee7b6b));
    sc.position.set(-AW / 2 + (i + 0.5) * (AW / n), ATOP - slope - 0.01, KFZ + 0.03 + alen);
    sc.rotation.x = 0.1;
    g.add(sc);
  }
  for (const sx of [-1, 1]) {
    const post = cyl(0.03, 0.035, ATOP - slope, WOOD, 6);
    post.position.set(sx * 1.3, (ATOP - slope) / 2, KFZ + 0.03 + alen - 0.1);
    g.add(post);
  }

  // The hanging sign, from the roof's overhang over the awning on two short chains.
  const sign = textPlane(1.9, 0.44, 640);
  const sg = sign.ctx;
  const { width: sw, height: sh } = sg.canvas;
  sg.fillStyle = '#6b4a2b';
  sg.fillRect(0, 0, sw, sh);
  sg.strokeStyle = '#3f2b19';
  sg.lineWidth = 12;
  sg.strokeRect(6, 6, sw - 12, sh - 12);
  sg.strokeStyle = '#e3c26d';
  sg.lineWidth = 4;
  sg.strokeRect(22, 22, sw - 44, sh - 44);
  sg.fillStyle = '#fff3d6';
  sg.font = `900 ${Math.round(sh * 0.5)}px ${FONT}`;
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText("BRAM'S KETTLE", sw / 2, sh / 2 + 4, sw - 90);
  sign.tex.needsUpdate = true;
  const board = rbox(1.98, 0.5, 0.06, FRAME, 0.02);
  const hang = new THREE.Group();
  sign.mesh.position.z = 0.034;
  const back2 = sign.mesh.clone();
  back2.position.z = -0.034;
  back2.rotation.y = Math.PI;
  hang.add(board, sign.mesh, back2);
  hang.position.set(0, 2.5, KFZ + 0.38);
  g.add(hang);
  for (const sx of [-0.8, 0.8]) {
    const chain = cyl(0.008, 0.008, 0.2, DARK, 4);
    chain.position.set(sx, 2.84, KFZ + 0.38);
    g.add(chain);
  }
  const beam = rbox(2.1, 0.07, 0.07, FRAME, 0.015);
  beam.position.set(0, 2.94, KFZ + 0.38);
  g.add(beam);
  for (const sx of [-1, 1]) {
    const arm = rbox(0.06, 0.06, 0.4, FRAME, 0.015);
    arm.position.set(sx * 1.0, 2.94, KFZ + 0.18);
    g.add(arm);
  }

  // The lantern, hung from the awning's front edge at the counter's right end.
  const glass = glassMat();
  const lamp = lantern(glass, 1.05);
  lamp.position.set(1.15, 1.43, KFZ + 0.9);
  const cord = cyl(0.006, 0.006, 0.44, DARK, 3);
  cord.position.set(1.15, 1.82, KFZ + 0.9);
  g.add(lamp, cord);

  // A crate of rockets beside the stall, three colours.
  const box = crate(0.6, 0.4, 0.42);
  box.position.set(2.05, 0, 0.7);
  box.rotation.y = -0.2;
  g.add(box);
  ROCKETS.forEach((c, i) => {
    const r = rocket(c);
    r.position.set(2.05 + (i - 1) * 0.15 * Math.cos(0.2), 0.5, 0.7 + (i - 1) * 0.15 * Math.sin(0.2));
    r.rotation.z = (1 - i) * 0.1;
    g.add(r);
  });

  return { group: g, solids: KETTLE_SOLIDS.map((s) => [...s] as Solid), keeper: { ...KETTLE_KEEPER }, lamps: [glass], lantern: lamp, ctx: plaque.ctx, tex: plaque.tex };
}

// ---------- 4. the Legends' Totem ----------

/** The Legends' Totem: what `buildTotem` returns. */
export interface Totem {
  group: THREE.Group;
  solids: Solid[];
}

const WOOD_BROWN = new THREE.Color(0x7a5232);
/** A legend's carved paint: its colour from `FISH`, made clear and bright (not muddy), then drawn 15% toward wood so the set belongs together. */
function paintOf(color: number, override?: number): number {
  const k = new THREE.Color(override ?? color);
  if (override === undefined) {
    const hsl = { h: 0, s: 0, l: 0 };
    k.getHSL(hsl);
    k.setHSL(hsl.h, THREE.MathUtils.clamp(hsl.s * 1.15 + 0.12, 0.5, 0.9), THREE.MathUtils.clamp(hsl.l, 0.45, 0.68));
  }
  return k.lerp(WOOD_BROWN, 0.15).getHex();
}
const lighter = (c: number, t: number) => new THREE.Color(c).lerp(new THREE.Color(0xfff3dc), t).getHex();

/** One colour, one material, however many carvings use it. */
const flatMats = new Map<number, THREE.MeshLambertMaterial>();
const flat1 = (c: number): THREE.MeshLambertMaterial => {
  let m = flatMats.get(c);
  if (!m) flatMats.set(c, (m = mat(c)));
  return m;
};
const carve = (m: THREE.Mesh): THREE.Mesh => {
  (m.material as THREE.Material).dispose();
  m.material = flat1((m as THREE.Mesh & { userData: { c: number } }).userData.c);
  return m;
};
/** A rounded block in a shared colour. */
const blockOf = (w: number, h: number, d: number, c: number, r: number): THREE.Mesh => {
  const m = rbox(w, h, d, c, r);
  m.userData.c = c;
  return carve(m);
};
const discOf = (r: number, thick: number, c: number): THREE.Mesh => {
  const m = cyl(r, r, thick, c, 10);
  m.userData.c = c;
  m.rotation.x = Math.PI / 2;
  return carve(m);
};

/** Three wing shapes pointing +x from the block's side, 0.4 m out: a swept blade, a rounded paddle and a spiked fan. */
const wingShapes = (): THREE.Shape[] => {
  const blade = new THREE.Shape();
  blade.moveTo(0, -0.1);
  blade.lineTo(0.22, -0.05);
  blade.lineTo(0.42, 0.2);
  blade.lineTo(0.2, 0.06);
  blade.lineTo(0, 0.14);
  const paddle = new THREE.Shape();
  paddle.moveTo(0, -0.12);
  paddle.quadraticCurveTo(0.42, -0.2, 0.42, 0.02);
  paddle.quadraticCurveTo(0.38, 0.2, 0, 0.13);
  const fan = new THREE.Shape();
  fan.moveTo(0, -0.1);
  fan.lineTo(0.3, -0.22);
  fan.lineTo(0.24, -0.08);
  fan.lineTo(0.42, -0.02);
  fan.lineTo(0.26, 0.08);
  fan.lineTo(0.34, 0.2);
  fan.lineTo(0, 0.12);
  return [blade, paddle, fan];
};
let wingGeos: THREE.BufferGeometry[] | null = null;
const wings = () =>
  (wingGeos ??= wingShapes().map((sh) => new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 5 }).translate(0, 0, -0.03)));

/**
 * One carved fish face looking out the front (+z): a bevelled block in the fish's paint, two round eyes (a pale disc
 * with a dark pupil), a carved mouth, and a wing-fin out of each side. About 0.75 m across the block, 1.5 m with the fins.
 */
function fishTier(paint: number, wing: number, belly?: number): THREE.Group {
  const g = new THREE.Group();
  const body = blockOf(0.75, 0.34, 0.6, paint, 0.09);
  g.add(body);
  for (const sx of [-1, 1]) {
    const eye = discOf(0.085, 0.04, 0xf4efe2);
    eye.position.set(sx * 0.2, 0.06, 0.3);
    const pupil = discOf(0.045, 0.03, 0x22201e);
    pupil.position.set(sx * 0.2, 0.06, 0.318);
    const fin = new THREE.Mesh(wings()[wing], flat1(lighter(paint, 0.3)));
    fin.castShadow = true;
    fin.position.set(sx * 0.35, -0.02, 0);
    fin.rotation.set(0, sx < 0 ? Math.PI : 0, sx * 0.12);
    g.add(eye, pupil, fin);
  }
  const mouth = blockOf(0.3, 0.04, 0.03, 0x3a2410, 0.012);
  mouth.position.set(0, -0.1, 0.3);
  g.add(mouth);
  if (belly !== undefined) {
    const band = blockOf(0.77, 0.09, 0.62, belly, 0.03);
    band.position.y = -0.14;
    g.add(band);
  }
  return g;
}

/** A tapered limb from `a` to `b`, a cylinder narrowing from radius `r0` to `r1`. */
function taper(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, c: number): THREE.Mesh {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 7), flat1(c));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

/**
 * The Legends' Totem: a carved, painted pole about 3.4 m tall on a 0.9 m stone plinth. Six fish faces climb a dark
 * wood pole, a hand's width of bare pole between them: the lake's four legends, then the Leviathan and the Drowned
 * Dreamer of the sea, each alternately turned a little left and right. The Kraken crowns it, a hooded-eyed dome with
 * six arms curling out and up. Colours come from `FISH`, made clear as paint. Front toward +z.
 */
export function buildTotem(): Totem {
  const g = new THREE.Group();
  const plinth = stoneBox(0.9, 0.35, 0.9, 0.05);
  plinth.position.y = 0.175;
  const pole = blockOf(0.5, 2.6, 0.5, DARK, 0.06);
  pole.position.y = 0.35 + 2.6 / 2;
  g.add(plinth, pole);

  const lake = FISH.filter((f) => f.tier === 5 && !f.sea);
  const kraken = FISH.find((f) => f.id === 'kraken')!;
  // The sea's dull colours are replaced by a clear paint for the two that stand under the Kraken.
  const tiers: { paint: number; belly?: number }[] = [
    ...lake.map((f) => ({ paint: paintOf(f.color) })),
    { paint: paintOf(0, 0x4f7fb0), belly: lighter(paintOf(0, 0x4f7fb0), 0.7) },
    { paint: paintOf(0, 0x2fa58a) },
  ];
  tiers.forEach((t, i) => {
    const tier = fishTier(t.paint, i % 3, t.belly);
    tier.position.set(0, 0.6 + i * 0.42, 0.03);
    tier.rotation.y = (i % 2 ? -1 : 1) * 0.21;
    g.add(tier);
    // The Starweaver Eel (the fourth of the lake's) is freckled with pale stars.
    if (lake[i]?.id === 'constellation') {
      for (const [x, y] of [[-0.25, 0.1], [0.05, 0.13], [0.3, 0.07]]) {
        const star = blockOf(0.045, 0.045, 0.02, 0xfff3b0, 0.01);
        star.position.set(x, y, 0.305);
        tier.add(star);
      }
    }
  });

  // The Kraken: a domed head, two hooded eye discs, and six arms from under the dome curling out, then up.
  const red = paintOf(kraken.color, 0x9a2a48);
  const dome = ball(0.42, red, 1, 0.8, 0.95);
  dome.material = flat1(red);
  dome.position.y = 3.0;
  g.add(dome);
  for (const sx of [-1, 1]) {
    const eye = discOf(0.1, 0.05, 0xf4efe2);
    eye.position.set(sx * 0.17, 2.98, 0.37);
    const pupil = discOf(0.05, 0.03, 0x22201e);
    pupil.position.set(sx * 0.17, 2.97, 0.4);
    const lid = blockOf(0.24, 0.06, 0.1, new THREE.Color(red).multiplyScalar(0.75).getHex(), 0.02);
    lid.position.set(sx * 0.17, 3.07, 0.37);
    lid.rotation.set(-0.35, 0, sx * 0.15);
    g.add(eye, pupil, lid);
  }
  [20, 90, 150, 215, 270, 335].forEach((deg, i) => {
    const pivot = new THREE.Group();
    pivot.rotation.y = (deg * Math.PI) / 180;
    const reach = 0.84 + (i % 3) * 0.06;
    const p0 = new THREE.Vector3(0, 2.94, 0.3);
    const p1 = new THREE.Vector3(0, 2.88, reach * 0.62);
    const p2 = new THREE.Vector3(0, 3.12 + (i % 2) * 0.06, reach);
    pivot.add(taper(p0, p1, 0.09, 0.07, red), taper(p1, p2, 0.07, 0.03, red));
    g.add(pivot);
  });
  return { group: g, solids: [[0, 0, 0.55]] };
}

// ---------- 5. hedges ----------

/** The town's planted green: the flower pots' bush (0x4f9a4b) and the foliage (0x3f8f43), with a little darker and lighter. */
const GREENS = [0x4f9a4b, 0x3f8f43, 0x468c44, 0x57a050, 0x3a8540];

/** Lays one clipped block of hedge centred on the ground at (x, z), its length along bearing `yaw`; sunk a little so it meets the ground. */
function hedgeBlock(g: THREE.Group, x: number, z: number, yaw: number, len: number, height: number, thick: number, i: number, groundAt: Ground): void {
  const rnd = mulberry(1009 + i * 31);
  const h = height * (0.94 + rnd() * 0.12);
  const l = len * (1.04 + rnd() * 0.08);
  const t = thick * (0.94 + rnd() * 0.1);
  const lowest = Math.min(groundAt(x, z), groundAt(x + Math.cos(yaw) * l * 0.5, z - Math.sin(yaw) * l * 0.5), groundAt(x - Math.cos(yaw) * l * 0.5, z + Math.sin(yaw) * l * 0.5));
  const sink = 0.12;
  const b = rbox(l, h + sink, t, GREENS[Math.floor(rnd() * GREENS.length)], Math.min(h, t) * 0.2);
  b.position.set(x, lowest + (h - sink) / 2, z);
  b.rotation.y = yaw;
  g.add(b);
}

/** A clipped hedge on an arc: blocks about a metre long, set on the terrain by `groundAt`. Bearings run `fromDeg` to `toDeg`. */
export function buildHedgeArc(r: number, fromDeg: number, toDeg: number, height: number, thickness = 0.7, groundAt: Ground = flat): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const solids: Solid[] = [];
  const span = toDeg - fromDeg;
  const n = Math.max(1, Math.round((Math.abs(rad(span)) * r) / 0.95));
  for (let i = 0; i < n; i++) {
    const deg = fromDeg + (span * (i + 0.5)) / n;
    const [x, z] = bearing(r, deg);
    hedgeBlock(g, x, z, rad(deg), 2 * r * Math.sin(Math.abs(rad(span)) / n / 2), height, thickness, i, groundAt);
  }
  const m = Math.max(1, Math.round((Math.abs(rad(span)) * r) / 1.1));
  for (let i = 0; i <= m; i++) {
    const [x, z] = bearing(r, fromDeg + (span * i) / m);
    solids.push([x, z, thickness / 2 + 0.1]);
  }
  return { group: g, solids };
}

/** A clipped hedge along a polyline of [x, z] points, set on the terrain by `groundAt`. */
export function buildHedgeRun(points: [number, number][], height: number, thickness = 0.7, groundAt: Ground = flat): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const solids: Solid[] = [];
  let k = 0;
  for (let s = 0; s + 1 < points.length; s++) {
    const [x0, z0] = points[s];
    const [x1, z1] = points[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.round(len / 0.95));
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      hedgeBlock(g, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f, yaw, len / n, height, thickness, k++, groundAt);
    }
    for (let d = 0; d < len; d += 1.1) solids.push([x0 + ((x1 - x0) * d) / len, z0 + ((z1 - z0) * d) / len, thickness / 2 + 0.1]);
  }
  const last = points[points.length - 1];
  if (last) solids.push([last[0], last[1], thickness / 2 + 0.1]);
  return { group: g, solids };
}

// ---------- 6. the town's picket fence ----------

/** The town's white picket fence along a polyline (`buildFences` in town.ts): the same pickets and rails, on the terrain by `groundAt`. */
export function buildPicketRun(points: [number, number][], groundAt: Ground = flat): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const solids: Solid[] = [];
  for (let s = 0; s + 1 < points.length; s++) {
    const [x0, z0] = points[s];
    const [x1, z1] = points[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.floor(len / 0.8));
    const ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = s ? 1 : 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      const p = rbox(0.1, 0.8, 0.06, 0xf3ead2, 0.02);
      p.position.set(x, groundAt(x, z) + 0.4, z);
      p.rotation.y = ang;
      g.add(p);
    }
    const rise = groundAt(x1, z1) - groundAt(x0, z0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    for (const y of [0.3, 0.6]) {
      const rail = rbox(0.05, 0.06, len, 0xe3d9bf, 0.01);
      rail.rotation.order = 'YXZ';
      rail.rotation.set(-Math.atan2(rise, len), ang, 0);
      rail.position.set(mx, (groundAt(x0, z0) + groundAt(x1, z1)) / 2 + y, mz);
      g.add(rail);
    }
    for (let d = 0; d <= len; d += 1.8) solids.push([x0 + ((x1 - x0) * d) / len, z0 + ((z1 - z0) * d) / len, 0.3]);
  }
  return { group: g, solids };
}

// ---------- 7. stone walls ----------

/**
 * A stone wall on an arc, in the seat wall's stone (`buildRing`): a run of one-metre sections, each `height` above the
 * ground there (by `groundAt`) with its foot sunk 0.25 m, and a thin coping on top. Bearings run `fromDeg` to `toDeg`.
 */
export function buildStoneArc(r: number, fromDeg: number, toDeg: number, height: number, thickness: number, groundAt: Ground = flat): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const solids: Solid[] = [];
  const stone = stoneMat();
  const lo = Math.min(fromDeg, toDeg);
  const hi = Math.max(fromDeg, toDeg);
  const n = Math.max(1, Math.ceil((rad(hi - lo) * r) / 1.2));
  const ring = (a0: number, a1: number, t: number, y0: number, y1: number): THREE.Mesh => {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, r + t / 2, rad(a0) - Math.PI / 2, rad(a1) - Math.PI / 2, false);
    shape.absarc(0, 0, r - t / 2, rad(a1) - Math.PI / 2, rad(a0) - Math.PI / 2, true);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(boxUV(geo, 1.6), stone);
    m.position.y = y0;
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  for (let i = 0; i < n; i++) {
    const a0 = lo + ((hi - lo) * i) / n;
    const a1 = lo + ((hi - lo) * (i + 1)) / n;
    const [sx0, sz0] = bearing(r, a0);
    const [sx1, sz1] = bearing(r, a1);
    const [mx, mz] = bearing(r, (a0 + a1) / 2);
    const base = Math.min(groundAt(sx0, sz0), groundAt(sx1, sz1), groundAt(mx, mz));
    g.add(ring(a0, a1, thickness, base - 0.25, base + height));
    g.add(ring(a0 - 0.01, a1 + 0.01, thickness + 0.1, base + height, base + height + 0.07));
  }
  const m = Math.max(1, Math.ceil((rad(hi - lo) * r) / Math.max(0.5, thickness * 0.8)));
  for (let i = 0; i <= m; i++) {
    const [x, z] = bearing(r, lo + ((hi - lo) * i) / m);
    solids.push([x, z, thickness / 2 + 0.05]);
  }
  return { group: g, solids };
}

/**
 * A stone wall along a polyline of [x, z] points, built like `buildStoneArc`: sections about a metre long, each
 * `height` above the lowest ground under it (by `groundAt`) with its foot sunk 0.25 m, and a thin coping on top.
 */
export function buildStoneRun(points: [number, number][], height: number, thickness: number, groundAt: Ground = flat): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const solids: Solid[] = [];
  for (let s = 0; s + 1 < points.length; s++) {
    const [x0, z0] = points[s];
    const [x1, z1] = points[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.ceil(len / 1.2));
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    const at = (f: number): [number, number] => [x0 + (x1 - x0) * f, z0 + (z1 - z0) * f];
    for (let i = 0; i < n; i++) {
      const [mx, mz] = at((i + 0.5) / n);
      const base = Math.min(groundAt(...at(i / n)), groundAt(...at((i + 1) / n)), groundAt(mx, mz));
      const block = stoneBox(len / n + 0.02, height + 0.25, thickness, 0.02);
      block.position.set(mx, base + (height - 0.25) / 2, mz);
      block.rotation.y = yaw;
      const cope = stoneBox(len / n + 0.04, 0.07, thickness + 0.1, 0.02);
      cope.position.set(mx, base + height + 0.035, mz);
      cope.rotation.y = yaw;
      g.add(block, cope);
    }
    const step = Math.max(0.5, thickness * 0.8);
    for (let d = 0; d <= len; d += step) solids.push([...at(d / len), thickness / 2 + 0.05]);
  }
  return { group: g, solids };
}

/**
 * A gate pier: a square shaft of the wall's stone, `size` across and `height` tall with its foot sunk 0.25 m, on a
 * low plinth, under a thin capstone a little wider than it, in a paler stone.
 */
export function buildGatePier(size: number, height: number): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const cap = 0.09;
  const shaft = stoneBox(size, height - cap + 0.25, size, 0.02);
  shaft.position.y = (height - cap - 0.25) / 2;
  const plinth = stoneBox(size + 0.1, 0.45, size + 0.1, 0.02);
  plinth.position.y = -0.025;
  const stone = rbox(size + 0.16, cap, size + 0.16, CAPSTONE, 0.025);
  stone.position.y = height - cap / 2;
  g.add(shaft, plinth, stone);
  return { group: g, solids: [[0, 0, size / 2 + 0.08]] };
}

// ---------- 8. steps ----------

/** How deep each tread is, front to back (m). */
export const TREAD_DEPTH = 0.42;

/**
 * Stone steps down from a terrace: the top tread's surface at y = 0 with its middle at the origin, the steps going
 * down toward +z, each `rise` lower than the last. They are solid blocks to below the last tread, in the wall's stone.
 */
export function buildSteps(width = 2, rise: number, treads: number): { group: THREE.Group; solids: Solid[]; length: number } {
  const g = new THREE.Group();
  const bottom = -treads * rise - 0.15;
  for (let i = 0; i < treads; i++) {
    const h = -i * rise - bottom;
    const b = stoneBox(width, h, TREAD_DEPTH, 0.025);
    b.position.set(0, bottom + h / 2, i * TREAD_DEPTH);
    g.add(b);
  }
  return { group: g, solids: [], length: treads * TREAD_DEPTH };
}

// ---------- 9. the skipping stones ----------

/** A small pile of flat skipping stones with a few loose ones beside it. */
export function buildStonePile(): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const rnd = mulberry(21);
  const tones = [0x8d8a84, 0x9a948a, 0x77808a, 0xa59d90, 0x6f7479];
  const flatStone = (x: number, y: number, z: number, r: number, i: number): THREE.Mesh => {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r, r * 0.22, 7), mat(tones[i % tones.length]));
    s.position.set(x, y, z);
    s.rotation.set((rnd() - 0.5) * 0.18, rnd() * 6, (rnd() - 0.5) * 0.18);
    s.scale.z = 0.75 + rnd() * 0.25;
    s.castShadow = s.receiveShadow = true;
    return s;
  };
  let y = 0.05;
  for (let i = 0; i < 8; i++) {
    const r = 0.26 - i * 0.017;
    g.add(flatStone((rnd() - 0.5) * 0.05, y, (rnd() - 0.5) * 0.05, r, i));
    y += r * 0.22 + 0.005;
  }
  for (let i = 0; i < 5; i++) {
    const a = 0.7 + i * 0.95;
    g.add(flatStone(Math.sin(a) * (0.5 + (i % 2) * 0.12), 0.05, Math.cos(a) * (0.5 + (i % 2) * 0.12), 0.14 + rnd() * 0.06, i + 2));
  }
  return { group: g, solids: [[0, 0, 0.3]] };
}

// ---------- 10. the skip sign ----------

/** A board whose canvas the caller writes on: what `buildSkipSign` returns. */
export interface Writable {
  group: THREE.Group;
  solids: Solid[];
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
}

/** Letters the skip sign: BEST SKIP over the day's best (`today`: "today: 9 skips · Oscar", `skipSignText`), cream on wood. */
export function writeSkipSign(ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture, today: string): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff3d6';
  ctx.font = `900 ${Math.round(h * 0.24)}px ${FONT}`;
  ctx.fillText('BEST SKIP', w / 2, h * 0.36, w - 24);
  ctx.fillStyle = '#e3c26d';
  ctx.font = `700 ${Math.round(h * 0.17)}px ${FONT}`;
  ctx.fillText(today, w / 2, h * 0.68, w - 24);
  tex.needsUpdate = true;
}

/** A small sign on a post for the day's best skip, its canvas face the caller rewrites (`writeSkipSign`). Reads "BEST SKIP, today: none yet" until then. */
export function buildSkipSign(): Writable {
  const g = new THREE.Group();
  const post = cyl(0.045, 0.06, 1.15, DARK, 8);
  post.position.set(0, 0.575, -0.06);
  const frame = rbox(0.9, 0.6, 0.08, FRAME, 0.03);
  frame.position.y = 1.2;
  const face = textPlane(0.8, 0.5, 384);
  writeSkipSign(face.ctx, face.tex, 'today: none yet');
  face.mesh.position.set(0, 1.2, 0.045);
  const cap = rbox(1.0, 0.07, 0.18, 0xb5476e, 0.03);
  cap.position.set(0, 1.54, 0);
  g.add(post, frame, face.mesh, cap);
  return { group: g, solids: [[0, -0.05, 0.2]], ctx: face.ctx, tex: face.tex };
}

// ---------- 11. the rocket rack ----------

/**
 * A wooden rack holding three rockets (red, blue, gold) standing up and leaning a little out toward +z, over the
 * water, with a crate beside it. The caller stands the rack with its front (+z) toward the lake.
 */
export function buildRocketRack(): { group: THREE.Group; solids: Solid[] } {
  const g = new THREE.Group();
  const plank = painted(SILL_WOOD, plankTexture());
  const lean = 0.14;
  for (const sx of [-0.6, 0.6]) {
    const leg = textured(rbox(0.09, 0.85, 0.09, SILL_WOOD, 0.02), plank, 1.6);
    leg.position.set(sx, 0.425, 0);
    g.add(leg);
  }
  const rail = textured(rbox(1.4, 0.09, 0.1, SILL_WOOD, 0.02), plank, 1.6);
  rail.position.y = 0.8;
  const low = textured(rbox(1.4, 0.07, 0.08, SILL_WOOD, 0.02), plank, 1.6);
  low.position.set(0, 0.3, 0);
  g.add(rail, low);
  // A launch tube of dark wood for each rocket's stick, leaning out over the water with it.
  ROCKETS.forEach((c, i) => {
    const x = (i - 1) * 0.4;
    const slot = cyl(0.045, 0.045, 0.3, 0x6b4a2b, 8);
    slot.position.set(x, 0.86, 0.02);
    slot.rotation.x = lean;
    const r = rocket(c);
    r.scale.setScalar(1.5);
    r.position.set(x, 1.0, 0.07);
    r.rotation.x = lean;
    g.add(slot, r);
  });
  const box = crate(0.55, 0.36, 0.4);
  box.position.set(1.2, 0, -0.2);
  box.rotation.y = 0.25;
  g.add(box);
  const spare = rocket(0xe5483f);
  spare.scale.setScalar(1.5);
  spare.position.set(1.2, 0.68, -0.2);
  spare.rotation.set(0.1, 0, -0.3);
  g.add(spare);
  return { group: g, solids: [[0, 0, 0.7], [1.2, -0.2, 0.35]] };
}

// ---------- 12. the signpost ----------

/**
 * A signpost: a post `H` m tall with a finger board for each entry of `fingers`, one under another, each pointing a
 * different way (alternately right and left) and fanned a little so every one reads from the front. Given `swing`
 * (radians, one for each finger), every finger points right instead, swung that far round toward the back. Text on
 * both faces.
 */
export function buildSignpost(fingers: string[], swing?: number[], H = 2.35): { group: THREE.Group; solids: Solid[]; yaws: number[] } {
  const g = new THREE.Group();
  const post = cyl(0.06, 0.08, H, DARK, 8);
  post.position.y = H / 2;
  const cap = rbox(0.18, 0.1, 0.18, FRAME, 0.03);
  cap.position.y = H + 0.04;
  g.add(post, cap);
  const L = 1.05;
  const Hh = 0.22;
  /** A finger's outline pointing right (dir 1) or left (dir -1), its near end at x = 0. */
  const outline = (dir: number): THREE.ExtrudeGeometry => {
    const s = new THREE.Shape();
    s.moveTo(0, -Hh / 2);
    s.lineTo(dir * (L - 0.1), -Hh / 2);
    s.lineTo(dir * (L + 0.1), 0);
    s.lineTo(dir * (L - 0.1), Hh / 2);
    s.lineTo(0, Hh / 2);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.01, bevelSegments: 1 }).translate(0, 0, -0.02);
  };
  const geos = { 1: outline(1), '-1': outline(-1) };
  const yaws: number[] = [];
  fingers.forEach((text, i) => {
    const dir = swing || i % 2 === 0 ? 1 : -1;
    const a = swing?.[i] ?? 0.25 + 0.12 * (i % 3);
    yaws.push(dir * a);
    const finger = new THREE.Group();
    const board = new THREE.Mesh(geos[dir === 1 ? 1 : '-1'], mat(0xc4a070));
    board.castShadow = true;
    const front = textFace(L - 0.1, Hh - 0.05, 320, '#c4a070', '#3a2615', text, 900);
    front.mesh.position.set(dir * (L / 2 - 0.05), 0, 0.034);
    const back = front.mesh.clone();
    back.position.z = -0.034;
    back.rotation.y = Math.PI;
    finger.add(board, front.mesh, back);
    finger.rotation.y = dir * a;
    finger.position.set(dir * 0.06 * Math.cos(a), H - 0.3 - i * (Hh + 0.09), -0.06 * Math.sin(a));
    g.add(finger);
  });
  return { group: g, solids: [[0, 0, 0.18]], yaws };
}

// ---------- 13. plaques and fish mounts ----------

/** Fills a plaque's face with `text` in dark ink on brass (two lines at most: split on '\n'), and marks the texture for upload. */
export function writePlaque(ctx: CanvasRenderingContext2D, tex: THREE.CanvasTexture, text: string): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e6c775';
  ctx.fillRect(0, 0, w, h * 0.08);
  ctx.strokeStyle = '#7b5b1c';
  ctx.lineWidth = Math.max(3, h * 0.04);
  ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  ctx.fillStyle = '#3a2a0c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let lines = text.split('\n');
  if (lines.length === 1 && text.length > 14) {
    const words = text.split(' ');
    const mid = Math.ceil(words.length / 2);
    lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }
  const size = Math.round((h * (lines.length > 1 ? 0.3 : 0.45)));
  ctx.font = `900 ${size}px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05 + 2, w - h * 0.4));
  tex.needsUpdate = true;
}

/** A small brass-and-wood name plaque, `width` m wide and 0.4 of that tall, its face a canvas (`writePlaque` fills it). Back at z = 0, face toward +z. */
export function buildPlaque(width = 1.2): { group: THREE.Group; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; width: number; height: number } {
  const h = Math.max(0.2, width * 0.4);
  const g = new THREE.Group();
  const wood = rbox(width + 0.1, h + 0.1, 0.05, FRAME, 0.02);
  wood.position.z = 0.025;
  const rim = rbox(width + 0.02, h + 0.02, 0.03, 0x9c7a2a, 0.01);
  rim.position.z = 0.058;
  const face = textPlane(width, h, 512);
  face.mesh.position.z = 0.076;
  g.add(wood, rim, face.mesh);
  for (const sx of [-1, 1]) {
    const screw = cyl(0.014, 0.014, 0.012, 0x7b5b1c, 6);
    screw.rotation.x = Math.PI / 2;
    screw.position.set(sx * (width / 2 + 0.01), 0, 0.078);
    g.add(screw);
  }
  writePlaque(face.ctx, face.tex, '');
  return { group: g, ctx: face.ctx, tex: face.tex, width, height: h };
}

/**
 * A wooden bracket that a record fish is fixed to above a board's roof: two short feet that stand on the roof (y = 0,
 * at `feet` along x), a pale-faced backboard `w` by `h` (`mountBoard` makes one of another size) and two pegs. The caller adds the fish to `anchor`, which hangs its
 * middle on the pegs, in the middle of the backboard.
 */
export function buildFishMount(w = 1.4, h = 0.62): { group: THREE.Group; anchor: THREE.Object3D; feet: number[] } {
  const g = new THREE.Group();
  const feet = [-(w / 2 - 0.15), w / 2 - 0.15];
  for (const sx of feet) {
    const foot = rbox(0.1, 0.2, 0.12, 0x6b4a2b, 0.02);
    foot.position.set(sx, 0.1, 0);
    g.add(foot);
  }
  const base = rbox(w + 0.1, 0.08, 0.2, FRAME, 0.02);
  base.position.y = 0.2;
  const mid = 0.23 + h / 2;
  // The backboard: dark wood for its frame, with a pale face set in it so a dark fish reads against it.
  const board = rbox(w, h, 0.05, 0x7a5232, 0.03);
  board.position.set(0, mid, -0.03);
  const face = rbox(w - 0.12, h - 0.12, 0.02, PALE_PLANK, 0.008);
  face.position.set(0, mid, 0);
  g.add(base, board, face);
  for (const sx of [-0.3, 0.3]) {
    const peg = cyl(0.02, 0.02, 0.1, BRASS, 6);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(sx, mid, 0.02);
    g.add(peg);
  }
  const anchor = new THREE.Object3D();
  anchor.position.set(0, mid, 0.1);
  g.add(anchor);
  return { group: g, anchor, feet };
}

/** A fish mount's backboard on its own, `w` by `h`: the dark frame and the pale face, its front where the mount's is (z = 0.01), centred on the origin. */
export function mountBoard(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const board = rbox(w, h, 0.05, 0x7a5232, 0.03);
  board.position.z = -0.03;
  const face = rbox(w - 0.12, h - 0.12, 0.02, PALE_PLANK, 0.008);
  g.add(board, face);
  return g;
}

// ---------- 14. the lantern pier ----------

/**
 * A squat stone pier, 0.55 m tall, with a lantern on top (its glass is the lamp handed back). The lantern stands
 * `lampZ` m toward the front of the cap, which leaves the back of it for a post to rise through.
 */
export function buildLanternPier(lampZ = 0): { group: THREE.Group; solids: Solid[]; lamps: THREE.MeshLambertMaterial[] } {
  const g = new THREE.Group();
  const base = stoneBox(0.62, 0.43, 0.62, 0.05);
  base.position.y = 0.215;
  const cap = stoneBox(0.76, 0.12, 0.76, 0.04);
  cap.position.y = 0.49;
  g.add(base, cap);
  const glass = glassMat();
  const lamp = lantern(glass, 1.3);
  lamp.position.set(0, 0.55 + 0.17 * 1.3 + 0.1, lampZ);
  g.add(lamp);
  return { group: g, solids: [[0, 0, 0.42]], lamps: [glass] };
}
