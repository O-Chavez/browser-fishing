import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOAT, hullHalfWidth } from '../data/sea';
import { boxUV, plankTexture } from './textures';

/**
 * The dive charter: a small steel trawler in the town's palette. A blue hull like the dock bucket,
 * brick red below the waterline, a wood rail cap with cream inner rails, a cream wheelhouse under the
 * town's red roof, and a plank deck. The bow points to +x and the starboard rail, where players fish,
 * to -z (see `BOAT`). Everything but the deck and the lamp is baked into one vertex-coloured mesh.
 */

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
};

/** Hull shape along the boat: gunwale height (0 stern .. 1 bow), keel and chine depths. */
const sheer = (u: number) => 1.0 + 0.5 * Math.pow(u, 2.5);
const KEEL = -0.9;
const CHINE = -0.1;
const STATIONS = 12;

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

/** Low-poly hull from stations along x, stern (-x) to bow (+x), following `hullHalfWidth`. */
function hull() {
  const up: Tri = [], low: Tri = [], cap: Tri = [], inner: Tri = [], deck: Tri = [], tr: Tri = [];
  const st: { o: THREE.Vector3[]; i: THREE.Vector3[]; d: THREE.Vector3[] }[] = [];
  for (let k = 0; k <= STATIONS; k++) {
    const u = k / STATIONS;
    const x = -BOAT.len / 2 + u * BOAT.len;
    const w = Math.max(0.02, hullHalfWidth(x));
    const top = sheer(u);
    const keel = KEEL * (1 - 0.6 * Math.pow(u, 3));
    const chine = CHINE + (top - CHINE) * 0.15 * Math.pow(u, 2);
    // The planking slopes in from the gunwale to the chine; the inner wall stands a wall's width inside it at deck height.
    const iw = Math.max(0.01, w * (1 - 0.12 * ((top - BOAT.deck) / (top - chine))) - BOAT.wall);
    st.push({
      o: [new THREE.Vector3(x, top, w), new THREE.Vector3(x, chine, w * 0.88), new THREE.Vector3(x, keel, 0), new THREE.Vector3(x, chine, -w * 0.88), new THREE.Vector3(x, top, -w)],
      i: [new THREE.Vector3(x, top, iw), new THREE.Vector3(x, top, -iw)],
      d: [new THREE.Vector3(x, BOAT.deck, iw), new THREE.Vector3(x, BOAT.deck, -iw)],
    });
  }
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
  orient(up, outward);
  orient(low, outward);
  orient(tr, outward);
  orient(cap, upward);
  orient(inner, (v) => (v.x < -BOAT.len / 2 + 0.2 ? new THREE.Vector3(1, 0, 0) : inward(v)));
  orient(deck, upward);
  return { up: geoOf([...up, ...tr]), low: geoOf(low), cap: geoOf(cap), inner: geoOf(inner), deck: geoOf(deck) };
}

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

/** The deck's plank texture with dark seams between the boards. */
function deckMaterial(): THREE.MeshLambertMaterial {
  const src = plankTexture().image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.fillStyle = 'rgba(60,40,25,0.85)';
  g.fillRect(0, 0, c.width, 4);
  g.fillRect(c.width - 3, 0, 3, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ color: 0xc89a68, map: tex });
}

export class Boat {
  readonly group = new THREE.Group();
  private lampMat = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  private light = new THREE.PointLight(0xffc98a, 0, 9, 1.6);
  private aftLight = new THREE.PointLight(0xffc98a, 0, 9, 1.6);

  constructor() {
    const h = hull();
    // The mockup's layout, turned so the starboard rail faces -z and stretched to the longer hull: the
    // wheelhouse forward (centred at W), the net drum and A-frame at the stern (S), open deck between.
    const W = BOAT.wheelhouse;
    const S = -BOAT.len / 2;
    const parts: [THREE.BufferGeometry, number][] = [
      [h.up, COL.hull],
      [h.low, COL.bottom],
      [h.cap, COL.cap],
      [h.inner, COL.inner],
      // Wheelhouse, its upper cabin and the red roofs.
      [box(2.0, 1.9, 2.0, [W, 1.4, 0]), COL.cabin],
      [box(1.6, 0.9, 1.7, [W + 0.1, 2.8, 0]), COL.cabin],
      [box(1.9, 0.12, 2.0, [W + 0.1, 3.3, 0]), COL.roof],
      [box(2.3, 0.14, 2.3, [W, 2.32, 0]), COL.roof],
      // Windows: the bridge front, the starboard side, the back door's porthole panel.
      [box(0.02, 0.5, 1.3, [W + 0.91, 2.85, 0]), COL.glass],
      [box(1.2, 0.5, 0.02, [W + 0.1, 2.85, -0.86]), COL.glass],
      [box(0.4, 0.45, 0.02, [W + 0.7, 1.65, -1.01]), COL.glass],
      [box(0.03, 0.5, 0.6, [W - 1.01, 1.75, -0.5]), COL.glass],
      [box(0.03, 0.4, 1.2, [W - 0.71, 2.95, 0]), COL.glass],
      // Wood trim: the back wall's frame, the door, mast and yard.
      [box(0.05, 1.3, 0.62, [W - 1.02, 1.1, 0.45]), COL.trim],
      [box(0.05, 0.08, 0.72, [W - 1.02, 2.02, -0.5]), COL.trim],
      [box(0.05, 0.08, 0.72, [W - 1.02, 1.48, -0.5]), COL.trim],
      [box(0.55, 1.25, 0.04, [W - 0.65, 1.1, -1.01]), COL.wood],
      [cyl(0.05, 0.06, 2.2, 6, [W + 0.1, 4.4, 0]), COL.wood],
      [box(0.06, 0.06, 1.0, [W + 0.1, 4.9, 0]), COL.wood],
      // The A-frame over the stern and the net drum under it.
      [box(0.1, 2.4, 0.1, [S + 0.15, 1.6, -1.5]), COL.wood],
      [box(0.1, 2.4, 0.1, [S + 0.15, 1.6, 1.5]), COL.wood],
      [box(0.12, 0.12, 3.2, [S + 0.15, 2.8, 0]), COL.wood],
      [cyl(0.34, 0.34, 1.6, 10, [S + 0.65, 0.95, 0], [Math.PI / 2, 0, 0]), COL.buoy],
      [cyl(0.42, 0.42, 1.35, 10, [S + 0.65, 0.95, 0], [Math.PI / 2, 0, 0]), COL.net],
      // A life ring on the wheelhouse side.
      [at(new THREE.TorusGeometry(0.3, 0.08, 5, 12), [W + 0.05, 1.55, -1.03]), COL.buoy],
      // Fish boxes along the port rail, and a barrel aft, clear of the starboard working deck.
      [box(0.6, 0.3, 0.42, [-0.1, 0.6, 1.2]), COL.crate],
      [box(0.6, 0.3, 0.42, [0.5, 0.6, 1.2]), COL.crate],
      [box(0.6, 0.3, 0.42, [0.2, 0.9, 1.15], [0, 0.15, 0]), COL.crate],
      [box(0.6, 0.3, 0.42, [0.4, 0.6, 0.75]), COL.crateDark],
      [cyl(0.3, 0.3, 0.7, 12, [S + 1.7, 0.8, 1.45]), COL.crateDark],
    ];
    for (const x of [-4.2, -1.4, 1.4, 3.8]) parts.push([at(new THREE.TorusGeometry(0.24, 0.09, 5, 10), [x, 0.55, -hullHalfWidth(x) - 0.05]), COL.tyre]);
    const body = new THREE.Mesh(
      mergeGeometries(parts.map(([g, c]) => paint(g, c)))!,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    );
    body.castShadow = body.receiveShadow = true;

    boxUV(h.deck, 0.3, 0, 0, 4);
    const deck = new THREE.Mesh(h.deck, deckMaterial());
    deck.receiveShadow = true;

    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.lampMat);
    lamp.position.set(W + 0.1, 5.6, 0);
    // Lights the working deck after dark, from over the wheelhouse's back door.
    this.light.position.set(W - 1.4, 2.3, -0.4);
    // And from the A-frame, over the aft deck.
    this.aftLight.position.set(S + 0.4, 2.6, 0);
    this.group.add(body, deck, lamp, this.light, this.aftLight);
  }

  setNight(n: number): void {
    this.lampMat.color.set(0x6a5a3a).lerp(new THREE.Color(0xffd27a), 0.35 + 0.65 * n);
    this.light.intensity = this.aftLight.intensity = 6 * n;
  }
}
