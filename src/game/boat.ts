import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOAT, KEEL, hullChine, hullHalfWidth, hullSheer } from '../data/sea';
import { faceHead } from './faces';
import { boxUV, plankTexture } from './textures';

/**
 * The dive charter: a small steel trawler in the town's palette. A blue hull like the dock bucket,
 * brick red below the waterline, a wood rail cap with cream inner rails, a cream wheelhouse under the
 * town's red roof, and a plank deck. The bow points to +x and the starboard rail, where players fish,
 * to -z (see `BOAT`). Everything that doesn't move, glow or need a texture is baked into one
 * vertex-coloured mesh.
 *
 * Fittings: a white boot stripe over the red bottom, a rub rail and the boat's name on the bow, ribs,
 * plank seams and scuppers inside the bulwarks, rod holders and cleats on the rail cap, a bow rail and
 * an anchor. Captain Reed stands at the wheel on the bridge, behind real window openings. A mast with
 * stays, a turning radar, an aerial, a pennant in the wind and red and green running lights. After dark
 * the windows glow, the lamps have halos and a flood lamp on an arm lights the working deck.
 */

/** Painted on both bows. A default to play-test (Oscar may rename her). */
export const BOAT_NAME = 'PELICAN';

const COL = {
  hull: 0x4a6fa5,
  bottom: 0xa8483a,
  cap: 0x9b7248,
  inner: 0xeadfca,
  cabin: 0xf3ead8,
  glass: 0x34465e,
  trim: 0x9b7248,
  roof: 0xc0453a,
  wood: 0x5b4128,
  buoy: 0xe8823f,
  net: 0x6f9a5a,
  crate: 0x9c7a4a,
  crateDark: 0x8a5a30,
  tyre: 0x3a3433,
  stripe: 0xf4f1ea,
  seam: 0xcdbfa4,
  scupper: 0x3b302a,
  metal: 0xb9c0c6,
  iron: 0x3b3f45,
  rope: 0xd9c89c,
  cooler: 0xf1efe8,
  float: 0xf2c14e,
  coat: 0x2f4f4f,
  hat: 0x2b2b2b,
};

/** The way the wind blows across the deck (the long swell's, `WIND` in sea.ts). */
const WIND = new THREE.Vector3(Math.sin((35 * Math.PI) / 180), 0, Math.cos((35 * Math.PI) / 180));

const STATIONS = 12;

/** The hull's cross-section at a point along the boat: half-widths outside and inside, and its heights. */
function section(x: number) {
  const u = THREE.MathUtils.clamp((x + BOAT.len / 2) / BOAT.len, 0, 1);
  const w = Math.max(0.02, hullHalfWidth(x));
  const top = hullSheer(u);
  const keel = KEEL * (1 - 0.6 * Math.pow(u, 3));
  const chine = hullChine(u);
  // The planking slopes in from the gunwale to the chine; the inner wall stands a wall's width inside it at deck height.
  const iw = Math.max(0.01, w * (1 - 0.12 * ((top - BOAT.deck) / (top - chine))) - BOAT.wall);
  /** Half-width of the outside of the planking at height `y`, between the chine and the gunwale. */
  const out = (y: number) => w * (1 - 0.12 * THREE.MathUtils.clamp((top - y) / (top - chine), 0, 1));
  return { x, u, w, top, keel, chine, iw, out };
}

type Tri = number[];

function quad(arr: Tri, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void {
  arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
}

/** Flips triangles so their normals point along `dir(centroid)`, for lighting and the shadow bias. */
function orient(arr: Tri, dir: (c: THREE.Vector3) => THREE.Vector3): Tri {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < arr.length; i += 9) {
    a.fromArray(arr, i);
    b.fromArray(arr, i + 3);
    c.fromArray(arr, i + 6);
    n.subVectors(b, a).cross(m.subVectors(c, a));
    const cen = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(dir(cen)) < 0) for (let k = 0; k < 3; k++) [arr[i + 3 + k], arr[i + 6 + k]] = [arr[i + 6 + k], arr[i + 3 + k]];
  }
  return arr;
}

const geoOf = (arr: Tri): THREE.BufferGeometry => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  g.computeVertexNormals();
  return g;
};

/** Low-poly hull from stations along x, stern (-x) to bow (+x), following `hullHalfWidth`, with its painted and planked trim. */
function hull() {
  const up: Tri = [], low: Tri = [], cap: Tri = [], inner: Tri = [], deck: Tri = [], tr: Tri = [];
  const boot: Tri = [], stripe: Tri = [], rub: Tri = [], seam: Tri = [];
  const secs = Array.from({ length: STATIONS + 1 }, (_, k) => section(-BOAT.len / 2 + (k / STATIONS) * BOAT.len));
  const st = secs.map(({ x, w, top, keel, chine, iw }) => ({
    o: [new THREE.Vector3(x, top, w), new THREE.Vector3(x, chine, w * 0.88), new THREE.Vector3(x, keel, 0), new THREE.Vector3(x, chine, -w * 0.88), new THREE.Vector3(x, top, -w)],
    i: [new THREE.Vector3(x, top, iw), new THREE.Vector3(x, top, -iw)],
    d: [new THREE.Vector3(x, BOAT.deck, iw), new THREE.Vector3(x, BOAT.deck, -iw)],
  }));
  /** A point on the outside of the planking at height `y`, pushed `off` outward. */
  const skin = (s: (typeof secs)[number], y: number, sg: number, off: number) => new THREE.Vector3(s.x, Math.max(y, s.chine), sg * (s.out(Math.max(y, s.chine)) + off));
  for (let k = 0; k < STATIONS; k++) {
    const a = st[k], b = st[k + 1];
    quad(up, a.o[0], b.o[0], b.o[1], a.o[1]);
    quad(up, a.o[3], b.o[3], b.o[4], a.o[4]);
    quad(low, a.o[1], b.o[1], b.o[2], a.o[2]);
    quad(low, a.o[2], b.o[2], b.o[3], a.o[3]);
    quad(cap, a.o[0], b.o[0], b.i[0], a.i[0]);
    quad(cap, a.o[4], b.o[4], b.i[1], a.i[1]);
    quad(inner, a.i[0], b.i[0], b.d[0], a.d[0]);
    quad(inner, a.i[1], b.i[1], b.d[1], a.d[1]);
    quad(deck, a.d[0], b.d[0], b.d[1], a.d[1]);
    const sa = secs[k], sb = secs[k + 1];
    for (const sg of [1, -1]) {
      // The bottom paint shows above the water, under a white boot stripe.
      quad(boot, skin(sa, TRIM.boot, sg, 0.008), skin(sb, TRIM.boot, sg, 0.008), skin(sb, -1, sg, 0.008), skin(sa, -1, sg, 0.008));
      quad(stripe, skin(sa, TRIM.stripe, sg, 0.01), skin(sb, TRIM.stripe, sg, 0.01), skin(sb, TRIM.boot, sg, 0.01), skin(sa, TRIM.boot, sg, 0.01));
      // The rub rail: a wood strake under the gunwale, standing proud of the planking.
      const r0 = (s: typeof sa) => s.top - TRIM.rub[0], r1 = (s: typeof sa) => s.top - TRIM.rub[1];
      quad(rub, skin(sa, r0(sa), sg, 0), skin(sb, r0(sb), sg, 0), skin(sb, r0(sb), sg, 0.04), skin(sa, r0(sa), sg, 0.04));
      quad(rub, skin(sa, r0(sa), sg, 0.04), skin(sb, r0(sb), sg, 0.04), skin(sb, r1(sb), sg, 0.04), skin(sa, r1(sa), sg, 0.04));
      quad(rub, skin(sa, r1(sa), sg, 0.04), skin(sb, r1(sb), sg, 0.04), skin(sb, r1(sb), sg, 0), skin(sa, r1(sa), sg, 0));
      // Plank seams along the inside of the bulwark.
      for (const f of TRIM.seams) {
        const p = (s: typeof sa, dy: number) => new THREE.Vector3(s.x, BOAT.deck + (s.top - BOAT.deck) * f + dy, sg * (s.iw - 0.006));
        quad(seam, p(sa, 0.011), p(sb, 0.011), p(sb, -0.011), p(sa, -0.011));
      }
    }
  }
  // Transom: a fan over the stern outline, up to the gunwale, and its cream inside face a wall's width inboard.
  const t = st[0].o;
  const c = t[2].clone().add(t[0]).add(t[4]).multiplyScalar(1 / 3);
  const fan = (arr: Tri, dx: number) => {
    const p = (v: THREE.Vector3) => [v.x + dx, v.y, v.z];
    for (let k = 0; k < 5; k++) arr.push(...p(c), ...p(t[k]), ...p(t[(k + 1) % 5]));
  };
  fan(tr, 0);
  fan(inner, BOAT.wall);
  const outward = (v: THREE.Vector3) => new THREE.Vector3(v.x * 0.3, v.y - 0.4, v.z);
  const inward = (v: THREE.Vector3) => new THREE.Vector3(0, 0, -v.z);
  const upward = () => new THREE.Vector3(0, 1, 0);
  const sideways = (v: THREE.Vector3) => new THREE.Vector3(0, 0, v.z);
  orient(up, outward);
  orient(low, outward);
  orient(tr, outward);
  orient(cap, upward);
  orient(inner, (v) => (v.x < -BOAT.len / 2 + 0.2 ? new THREE.Vector3(1, 0, 0) : inward(v)));
  orient(deck, upward);
  orient(boot, sideways);
  orient(stripe, sideways);
  orient(seam, inward);
  return {
    up: geoOf([...up, ...tr]), low: geoOf(low), cap: geoOf(cap), inner: geoOf(inner), deck: geoOf(deck),
    boot: geoOf(boot), stripe: geoOf(stripe), rub: geoOf(rub), seam: geoOf(seam),
  };
}

/**
 * The hull's paint and planking lines, for play-test tweaks: the bottom paint reaches `boot` above the
 * resting waterline with the white stripe up to `stripe`; the rub rail sits `rub` below the gunwale;
 * `seams` are how far up the bulwark's inside its plank seams run.
 */
const TRIM = { boot: 0.16, stripe: 0.3, rub: [0.1, 0.2] as [number, number], seams: [0.36, 0.69] };

/** Bakes a transform into a non-indexed copy of `geo` with only positions and normals. */
function at(geo: THREE.BufferGeometry, p: [number, number, number], r: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const o = new THREE.Object3D();
  o.position.set(...p);
  o.rotation.set(...r);
  o.updateMatrix();
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  return g.applyMatrix4(o.matrix);
}

const box = (w: number, h: number, d: number, p: [number, number, number], r?: [number, number, number]) => at(new THREE.BoxGeometry(w, h, d), p, r);
const cyl = (r0: number, r1: number, h: number, n: number, p: [number, number, number], r?: [number, number, number]) => at(new THREE.CylinderGeometry(r0, r1, h, n), p, r);

/** Paints every vertex of `geo` one colour, for the baked mesh. */
function paint(geo: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(col, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** A round bar from `p` to `q`. */
function bar(p: [number, number, number], q: [number, number, number], r: number, n = 5): THREE.BufferGeometry {
  const a = new THREE.Vector3(...p), b = new THREE.Vector3(...q);
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), n).toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** The deck's planks: four rows a tile with their butt joints staggered, dark seams between the boards. */
function deckMaterial(): THREE.MeshLambertMaterial {
  const src = plankTexture().image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height * 4;
  const g = c.getContext('2d')!;
  const shift = [0, 150, 70, 205];
  const shade = [0, 0.07, 0.03, 0.1];
  shift.forEach((dx, row) => {
    const y = row * src.height;
    g.drawImage(src, dx - c.width, y);
    g.drawImage(src, dx, y);
    g.fillStyle = `rgba(70,45,25,${shade[row]})`;
    g.fillRect(0, y, c.width, src.height);
    g.fillStyle = 'rgba(60,40,25,0.85)';
    g.fillRect(0, y, c.width, 3);
    g.fillRect(dx - 1, y, 3, src.height);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ color: 0xc89a68, map: tex });
}

/** The boat's name in white capitals, for the bows. */
function nameTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d')!;
  g.font = '800 72px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f4f1ea';
  const text = BOAT_NAME.split('').join(' ');
  g.fillText(text, 256, 52, 496);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The name painted along both bows, following the planking; it reads from the bow aft on starboard and from aft to the bow on port. */
function nameplates(): THREE.Mesh {
  const x0 = 3.0, x1 = 4.7, N = 5;
  const pos: number[] = [], uv: number[] = [];
  for (const sg of [1, -1]) {
    const pt = (k: number, up: number) => {
      const sec = section(x0 + ((x1 - x0) * k) / N);
      const y = sec.top - 0.3 - (1 - up) * 0.3;
      return { v: [sec.x, y, sg * (sec.out(y) + 0.012)], t: [sg > 0 ? k / N : 1 - k / N, up] };
    };
    for (let k = 0; k < N; k++) {
      const a = pt(k, 0), b = pt(k + 1, 0), c = pt(k + 1, 1), d = pt(k, 1);
      for (const q of sg > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) {
        pos.push(...q.v);
        uv.push(...q.t);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: nameTexture(), transparent: true, alphaTest: 0.4 }));
}

/** A soft round glow for the lamps' halos. */
function haloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.2, 'rgba(255,255,255,0.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** How strong the two deck lamps are after dark, and how far they reach. A default to play-test. */
const DECK_LIGHT = { power: 6, reach: 12 };
const PENNANT = { len: 0.8, hoist: 0.3, cols: 8 };

export class Boat {
  readonly group = new THREE.Group();
  /** Lamp lenses and running lights: dim by day, bright after dark. */
  private lampMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  /** The lower cabin's window panes: dark glass by day, lit from inside after dark. */
  private paneMat = new THREE.MeshBasicMaterial({ color: COL.glass });
  /** The bridge's glazing, see-through so Captain Reed shows at the wheel. */
  private glassMat = new THREE.MeshBasicMaterial({ color: 0xa9cbdc, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  private haloMat = new THREE.PointsMaterial({ map: haloTexture(), size: 1.5, vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  private light = new THREE.PointLight(0xffc98a, 0, DECK_LIGHT.reach, 1.6);
  private aftLight = new THREE.PointLight(0xffc98a, 0, DECK_LIGHT.reach, 1.6);
  private radar: THREE.Mesh;
  private pennant: THREE.Mesh;
  private reedHead: THREE.Mesh;

  constructor() {
    const h = hull();
    // The mockup's layout, turned so the starboard rail faces -z and stretched to the longer hull: the
    // wheelhouse forward (centred at W), the net drum and A-frame at the stern (S), open deck between.
    const W = BOAT.wheelhouse;
    const S = -BOAT.len / 2;
    const D = BOAT.deck;
    /** The bridge: its middle along the boat, and the heights of its sill, window tops and roof. */
    const B = { x: W + 0.1, sill: 2.65, head: 3.28, roof: 3.46 };
    const MAST = { x: W - 0.4, top: 5.9, yard: 5.05 };
    const parts: [THREE.BufferGeometry, number][] = [
      [h.up, COL.hull],
      [h.low, COL.bottom],
      [h.boot, COL.bottom],
      [h.stripe, COL.stripe],
      [h.rub, COL.cap],
      [h.cap, COL.cap],
      [h.inner, COL.inner],
      [h.seam, COL.seam],
      // Wheelhouse and its red roof.
      [box(2.0, 1.9, 2.0, [W, 1.4, 0]), COL.cabin],
      [box(2.3, 0.14, 2.3, [W, 2.32, 0]), COL.roof],
      // The bridge on top: a sill, corner posts and mullions around open windows, a header and the roof.
      [box(1.6, B.sill - 2.39, 1.7, [B.x, (B.sill + 2.39) / 2, 0]), COL.cabin],
      [box(1.6, 0.12, 1.7, [B.x, B.head + 0.06, 0]), COL.cabin],
      [box(1.95, 0.12, 2.05, [B.x + 0.05, B.roof, 0]), COL.roof],
      // The wheel's console under the front windows, and the wheel.
      [box(0.3, 0.16, 1.3, [B.x + 0.6, B.sill + 0.08, 0]), COL.wood],
      [at(new THREE.TorusGeometry(0.17, 0.028, 5, 12), [B.x + 0.4, B.sill + 0.27, 0], [0, Math.PI / 2, 0]), COL.wood],
      [box(0.03, 0.34, 0.03, [B.x + 0.4, B.sill + 0.27, 0]), COL.wood],
      [box(0.03, 0.03, 0.34, [B.x + 0.4, B.sill + 0.27, 0]), COL.wood],
      // Wood trim: the back wall's frame, the door and its handle, and frames around the side windows.
      [box(0.05, 1.3, 0.62, [W - 1.02, 1.1, 0.45]), COL.trim],
      [box(0.05, 0.08, 0.72, [W - 1.02, 2.02, -0.5]), COL.trim],
      [box(0.05, 0.08, 0.72, [W - 1.02, 1.48, -0.5]), COL.trim],
      [box(0.55, 1.25, 0.04, [W - 0.65, 1.1, -1.01]), COL.wood],
      [box(0.05, 0.12, 0.05, [W - 0.45, 1.1, -1.05]), COL.metal],
      // The mast with its yard, the aerial, the radar's post and the flood lamp's arm.
      [cyl(0.04, 0.06, MAST.top - B.roof, 6, [MAST.x, (MAST.top + B.roof) / 2, 0]), COL.wood],
      [box(0.05, 0.05, 0.9, [MAST.x, MAST.yard, 0]), COL.wood],
      [bar([B.x - 0.6, B.roof, 0.75], [B.x - 0.75, B.roof + 1.7, 0.8], 0.012, 4), COL.iron],
      [cyl(0.05, 0.07, 0.2, 6, [B.x + 0.55, B.roof + 0.14, 0]), COL.metal],
      [bar([B.x - 0.9, B.roof + 0.02, 0], [B.x - 1.75, B.roof - 0.02, 0], 0.03), COL.iron],
      [box(0.2, 0.1, 0.26, [B.x - 1.75, B.roof - 0.09, 0]), COL.iron],
      // The A-frame over the stern with its block, hook and lamp, and the net drum under it with its floats.
      [box(0.1, 2.4, 0.1, [S + 0.15, 1.6, -1.5]), COL.wood],
      [box(0.1, 2.4, 0.1, [S + 0.15, 1.6, 1.5]), COL.wood],
      [box(0.12, 0.12, 3.2, [S + 0.15, 2.8, 0]), COL.wood],
      [box(0.14, 0.2, 0.1, [S + 0.15, 2.62, 0.7]), COL.iron],
      [bar([S + 0.15, 2.52, 0.7], [S + 0.15, 2.05, 0.7], 0.012, 4), COL.iron],
      [at(new THREE.TorusGeometry(0.07, 0.022, 4, 8, Math.PI * 1.3), [S + 0.15, 1.98, 0.7], [0, Math.PI / 2, 0]), COL.iron],
      [box(0.18, 0.1, 0.22, [S + 0.32, 2.7, 0]), COL.iron],
      [cyl(0.34, 0.34, 1.6, 10, [S + 0.65, 0.95, 0], [Math.PI / 2, 0, 0]), COL.buoy],
      [cyl(0.42, 0.42, 1.35, 10, [S + 0.65, 0.95, 0], [Math.PI / 2, 0, 0]), COL.net],
      [cyl(0.5, 0.5, 0.05, 12, [S + 0.65, 0.95, 0.82], [Math.PI / 2, 0, 0]), COL.iron],
      [cyl(0.5, 0.5, 0.05, 12, [S + 0.65, 0.95, -0.82], [Math.PI / 2, 0, 0]), COL.iron],
      // A life ring on the wheelhouse side.
      [at(new THREE.TorusGeometry(0.3, 0.08, 5, 12), [W + 0.05, 1.55, -1.03]), COL.buoy],
      // Fish boxes along the port rail, and a barrel aft, clear of the starboard working deck.
      [box(0.6, 0.3, 0.42, [-0.1, 0.6, 1.2]), COL.crate],
      [box(0.6, 0.3, 0.42, [0.5, 0.6, 1.2]), COL.crate],
      [box(0.6, 0.3, 0.42, [0.2, 0.9, 1.15], [0, 0.15, 0]), COL.crate],
      [box(0.6, 0.3, 0.42, [0.4, 0.6, 0.75]), COL.crateDark],
      [cyl(0.3, 0.3, 0.7, 12, [S + 1.7, 0.8, 1.45]), COL.crateDark],
      // A cooler beside the fish boxes, and two pots stacked by the barrel.
      [box(0.72, 0.36, 0.42, [-0.92, D + 0.18, 1.66]), COL.cooler],
      [box(0.76, 0.08, 0.46, [-0.92, D + 0.4, 1.66]), COL.hull],
      [box(0.8, 0.34, 0.5, [-3.95, D + 0.17, 1.6]), COL.crate],
      [box(0.82, 0.05, 0.52, [-3.95, D + 0.17, 1.6]), COL.net],
      [box(0.8, 0.34, 0.5, [-4.0, D + 0.51, 1.62], [0, 0.2, 0]), COL.crate],
      [box(0.82, 0.05, 0.52, [-4.0, D + 0.51, 1.62], [0, 0.2, 0]), COL.net],
      // The hold's hatch, low enough to walk over.
      [box(1.3, 0.05, 1.1, [-2.7, D + 0.025, 0.35]), COL.wood],
      [box(1.14, 0.08, 0.94, [-2.7, D + 0.04, 0.35]), COL.cap],
      [box(0.2, 0.03, 0.05, [-2.7, D + 0.09, 0.0]), COL.iron],
      [box(0.2, 0.03, 0.05, [-2.7, D + 0.09, 0.7]), COL.iron],
      // An anchor on the starboard bow.
      ...anchor(),
      // Captain Reed at the wheel, seen from the shoulders up: his coat, his arms to the wheel and his cap.
      [at(new THREE.CapsuleGeometry(0.3, 0.6, 4, 10), [B.x - 0.2, B.sill - 0.5, 0]), COL.coat],
      [bar([B.x - 0.12, B.sill + 0.02, 0.3], [B.x + 0.36, B.sill + 0.27, 0.15], 0.065, 6), COL.coat],
      [bar([B.x - 0.12, B.sill + 0.02, -0.3], [B.x + 0.36, B.sill + 0.27, -0.15], 0.065, 6), COL.coat],
      [cyl(0.25, 0.25, 0.035, 12, [B.x - 0.12, B.sill + 0.42, 0]), COL.hat],
      [at(new THREE.SphereGeometry(0.21, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), [B.x - 0.2, B.sill + 0.42, 0]), COL.hat],
    ];
    // Bridge corner posts and mullions.
    const ph = B.head - B.sill, py = (B.head + B.sill) / 2;
    for (const [dx, dz] of [[-0.75, -0.8], [-0.75, 0.8], [0.75, -0.8], [0.75, 0.8]]) parts.push([box(0.1, ph, 0.1, [B.x + dx, py, dz]), COL.cabin]);
    for (const [dx, dz] of [[0.77, 0], [-0.77, 0], [0, -0.82], [0, 0.82]]) parts.push([box(0.06, ph, 0.06, [B.x + dx, py, dz]), COL.cabin]);
    // Frames around the lower cabin's side windows.
    for (const sg of [-1, 1]) {
      const z = sg * 1.02;
      parts.push([box(0.54, 0.06, 0.05, [W + 0.4, 1.92, z]), COL.trim], [box(0.54, 0.06, 0.05, [W + 0.4, 1.38, z]), COL.trim]);
      // Running-light boards on the bridge's sides.
      parts.push([box(0.3, 0.2, 0.03, [B.x + 0.5, B.sill - 0.08, sg * 0.87]), COL.iron]);
    }
    // Fenders along the starboard side.
    for (const x of [-4.2, -1.4, 1.4, 3.8]) parts.push([at(new THREE.TorusGeometry(0.24, 0.09, 5, 10), [x, 0.55, -hullHalfWidth(x) - 0.05]), COL.tyre]);
    // Inside the bulwarks: a rib at every station, scuppers at the deck, and fittings on the rail cap.
    for (const sg of [-1, 1]) {
      for (let k = 1; k < STATIONS; k++) {
        const s = section(S + (k / STATIONS) * BOAT.len);
        if (s.iw < 0.5) continue;
        parts.push([box(0.05, s.top - D, 0.04, [s.x, (s.top + D) / 2, sg * (s.iw - 0.02)]), COL.cap]);
        const m = section(s.x - BOAT.len / STATIONS / 2);
        parts.push([box(0.36, 0.07, 0.03, [m.x, D + 0.05, sg * (m.iw - 0.012)]), COL.scupper]);
      }
      const capZ = (x: number) => { const s = section(x); return { y: s.top, z: sg * (s.w + s.iw) / 2 }; };
      // Rod holders between the fishing spots, leaning outboard; the port ones carry spare rods.
      for (const x of [-3.95, -2.65, -1.35, -0.05]) {
        const c = capZ(x);
        parts.push([cyl(0.04, 0.04, 0.2, 8, [x, c.y + 0.07, c.z + sg * 0.02], [sg * 0.35, 0, 0]), COL.iron]);
        if (sg > 0 && x < -1) parts.push([bar([x, c.y + 0.05, c.z], [x, c.y + 2.2, c.z + 0.8], 0.016, 4), COL.iron], [bar([x, c.y + 0.05, c.z], [x, c.y + 0.5, c.z + 0.18], 0.028, 5), COL.cap]);
      }
      // Cleats, the starboard ones with a coil of rope hung inside the bulwark.
      for (const x of [-5.25, 0.75]) {
        const c = capZ(x);
        parts.push([box(0.08, 0.06, 0.05, [x, c.y + 0.03, c.z]), COL.metal], [box(0.28, 0.035, 0.045, [x, c.y + 0.075, c.z]), COL.metal]);
        if (sg < 0) {
          const s = section(x);
          parts.push([at(new THREE.TorusGeometry(0.15, 0.035, 5, 12), [x, s.top - 0.26, sg * (s.iw - 0.05)]), COL.rope]);
          parts.push([at(new THREE.TorusGeometry(0.12, 0.03, 5, 12), [x + 0.02, s.top - 0.28, sg * (s.iw - 0.09)]), COL.rope]);
        }
      }
    }
    // The bow rail: posts on the rail cap from the wheelhouse forward, a top rail and a mid rail around the stem.
    const rail = [0.76, 0.84, 0.91, 0.97].map((u) => section(S + u * BOAT.len));
    const post = (s: (typeof rail)[number], sg: number, hgt: number): [number, number, number] => [s.x, s.top + hgt, sg * Math.max(0.05, (s.w + s.iw) / 2)];
    const stem: [number, number, number] = [BOAT.len / 2 - 0.05, hullSheer(1) + 0.5, 0];
    for (const sg of [-1, 1]) {
      rail.forEach((s, k) => {
        parts.push([bar(post(s, sg, 0), post(s, sg, 0.5), 0.018, 4), COL.metal]);
        const next = rail[k + 1];
        for (const hgt of [0.5, 0.26]) parts.push([bar(post(s, sg, hgt), next ? post(next, sg, hgt) : [stem[0], hullSheer(1) + hgt, 0], 0.016, 4), COL.metal]);
      });
    }
    parts.push([bar([stem[0], hullSheer(1), 0], stem, 0.02, 4), COL.metal]);
    const body = new THREE.Mesh(
      mergeGeometries(parts.map(([g, c]) => paint(g, c)))!,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    body.castShadow = body.receiveShadow = true;

    boxUV(h.deck, 0.3, 0, 0, 1);
    const deck = new THREE.Mesh(h.deck, deckMaterial());
    deck.receiveShadow = true;

    // Captain Reed's head, turned to the bow.
    this.reedHead = faceHead(0.21, 'grin');
    this.reedHead.position.set(B.x - 0.2, B.sill + 0.24, 0);
    this.reedHead.rotation.y = Math.PI / 2;

    // Window panes that light up after dark: the lower cabin's sides, front and back, and the door's.
    const panes = new THREE.Mesh(
      mergeGeometries([
        box(0.4, 0.45, 0.02, [W + 0.4, 1.65, -1.01]),
        box(0.4, 0.45, 0.02, [W + 0.4, 1.65, 1.01]),
        box(0.03, 0.5, 0.6, [W - 1.01, 1.75, -0.5]),
        box(0.02, 0.45, 0.6, [W + 1.01, 1.65, -0.45]),
        box(0.02, 0.45, 0.6, [W + 1.01, 1.65, 0.45]),
        box(0.22, 0.22, 0.02, [W - 0.65, 1.45, -1.035]),
      ])!,
      this.paneMat,
    );
    // The bridge's glazing, one sheet a side.
    const glass = new THREE.Mesh(
      mergeGeometries([
        box(0.01, ph, 1.5, [B.x + 0.78, py, 0]),
        box(0.01, ph, 1.5, [B.x - 0.78, py, 0]),
        box(1.4, ph, 0.01, [B.x, py, -0.83]),
        box(1.4, ph, 0.01, [B.x, py, 0.83]),
      ])!,
      this.glassMat,
    );

    // Lamps: the masthead light, the flood lamp over the working deck, the A-frame's lamp, a stern light
    // and the running lights (green to starboard, red to port), each with a halo after dark.
    const lamps: { p: [number, number, number]; c: number; g: THREE.BufferGeometry; halo: number }[] = [
      { p: [MAST.x, MAST.top + 0.08, 0], c: 0xfff0c8, g: new THREE.SphereGeometry(0.09, 8, 6), halo: 1 },
      { p: [B.x - 1.75, B.roof - 0.155, 0], c: 0xffd27a, g: new THREE.BoxGeometry(0.16, 0.03, 0.22), halo: 1 },
      { p: [S + 0.32, 2.635, 0], c: 0xffd27a, g: new THREE.BoxGeometry(0.14, 0.03, 0.18), halo: 1 },
      { p: [B.x + 0.5, B.sill - 0.08, -0.9], c: 0x3fe08a, g: new THREE.BoxGeometry(0.12, 0.12, 0.05), halo: 0.6 },
      { p: [B.x + 0.5, B.sill - 0.08, 0.9], c: 0xff4a3a, g: new THREE.BoxGeometry(0.12, 0.12, 0.05), halo: 0.6 },
    ];
    const lampMesh = new THREE.Mesh(mergeGeometries(lamps.map((l) => paint(at(l.g, l.p), l.c)))!, this.lampMat);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(lamps.flatMap((l) => l.p), 3));
    hg.setAttribute('color', new THREE.Float32BufferAttribute(lamps.flatMap((l) => new THREE.Color(l.c).multiplyScalar(l.halo).toArray()), 3));
    const halos = new THREE.Points(hg, this.haloMat);
    halos.frustumCulled = false;

    // The radar's bar, turning on its post.
    this.radar = new THREE.Mesh(paint(box(0.85, 0.07, 0.14, [0, 0, 0]), COL.stripe), body.material);
    this.radar.position.set(B.x + 0.55, B.roof + 0.28, 0);

    // The pennant at the masthead, streaming downwind.
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PENNANT.cols * 2 * 3), 3));
    const idx: number[] = [];
    for (let k = 0; k < PENNANT.cols - 1; k++) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    pg.setIndex(idx);
    this.pennant = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: COL.buoy, side: THREE.DoubleSide }));
    this.pennant.position.set(MAST.x, MAST.top - 0.25, 0);
    this.pennant.frustumCulled = false;

    // Stays: the masthead to the stem and to the A-frame, and shrouds over the yard's ends to the cabin roof.
    const head = [MAST.x, MAST.top - 0.05, 0];
    const wires: number[][] = [[...head, ...stem], [...head, S + 0.15, 2.86, -1.5], [...head, S + 0.15, 2.86, 1.5]];
    for (const sg of [-1, 1]) wires.push([...head, MAST.x, MAST.yard, sg * 0.45], [MAST.x, MAST.yard, sg * 0.45, MAST.x - 0.1, 2.39, sg * 1.12]);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires.flat(), 3));
    const rigging = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: COL.tyre }));

    // Lights the working deck after dark, from the flood lamp on its arm aft of the bridge.
    this.light.position.set(B.x - 1.8, B.roof - 0.3, 0);
    // And from the A-frame, over the aft deck.
    this.aftLight.position.set(S + 0.4, 2.5, 0);
    this.group.add(body, deck, nameplates(), panes, this.reedHead, glass, lampMesh, halos, this.radar, this.pennant, rigging, this.light, this.aftLight);
    this.setNight(0);
    this.update(0, 0);
  }

  setNight(n: number): void {
    this.lampMat.color.setScalar(0.5 + 0.5 * n);
    this.paneMat.color.set(COL.glass).lerp(new THREE.Color(0xffcf80), n);
    this.glassMat.color.set(0xa9cbdc).lerp(new THREE.Color(0xffc56e), n);
    this.glassMat.opacity = 0.2 + 0.25 * n;
    this.haloMat.opacity = 0.85 * n;
    this.light.intensity = this.aftLight.intensity = DECK_LIGHT.power * n;
  }

  /** Turns the radar, flies the pennant (harder the rougher the sea's `mood`) and has Captain Reed glance about. */
  update(t: number, mood: number): void {
    this.radar.rotation.y = t * 1.7;
    this.reedHead.rotation.y = Math.PI / 2 + 0.45 * Math.sin(t * 0.23) * Math.sin(t * 0.071 + 1);
    const blow = Math.min(1, 0.35 + 0.4 * mood);
    const p = this.pennant.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < PENNANT.cols; k++) {
      const s = k / (PENNANT.cols - 1);
      const out = s * PENNANT.len;
      const wave = s * (0.05 + 0.07 * blow) * Math.sin(s * 7 - t * (5 + 6 * blow));
      const droop = -s * s * PENNANT.len * 0.55 * (1 - blow);
      const x = WIND.x * out - WIND.z * wave, z = WIND.z * out + WIND.x * wave;
      const half = (PENNANT.hoist / 2) * (1 - 0.92 * s);
      p.setXYZ(k * 2, x, droop + half, z);
      p.setXYZ(k * 2 + 1, x, droop - half, z);
    }
    p.needsUpdate = true;
    this.pennant.geometry.computeVertexNormals();
  }
}

/** A stockless anchor hung flat against the starboard bow. */
function anchor(): [THREE.BufferGeometry, number][] {
  const a = section(4.95), b = section(5.35);
  const y = a.top - 0.42;
  const turn = Math.atan2(b.out(y) - a.out(y), b.x - a.x);
  const g = mergeGeometries([
    box(0.07, 0.5, 0.05, [0, 0, 0]),
    box(0.3, 0.06, 0.05, [0, 0.24, 0]),
    box(0.07, 0.3, 0.05, [-0.12, -0.2, 0], [0, 0, -0.9]),
    box(0.07, 0.3, 0.05, [0.12, -0.2, 0], [0, 0, 0.9]),
    at(new THREE.TorusGeometry(0.06, 0.018, 4, 8), [0, 0.33, 0]),
  ])!;
  const m = section(5.15);
  g.rotateY(turn);
  g.translate(m.x, y, -(m.out(y) + 0.06));
  return [[g, COL.iron]];
}
