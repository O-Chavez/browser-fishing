import * as THREE from 'three';
import { V, aim, cached, fuse, glint, lit, mat, put, seeded, tint, tube, type LegendCtx } from './legends/kit';

// The legends' shared mark: lost tackle. Every legend carries the gear of the anglers who hooked it and lost: old
// hooks, a spoon, a feathered fly, a float on a snapped line, tarnished but still catching the light. It is
// human-sized, so it makes the fish look big. Each legend says where its pieces sit (`TacklePiece`); a fish's whole
// kit is two merged meshes (metal and the rest) and a glint or two.

export interface TackleLine {
  /** How long the snapped line is, and which way it drifts (toward the tail and down when left out). */
  len: number;
  drift?: THREE.Vector3;
  /** A red and white float this far along the line (0..1). */
  bobber?: number;
  /** How much the line wanders. */
  wave?: number;
}

export interface TacklePiece {
  /**
   * A bare hook, a spoon lure, a feathered fly, the stub of a broken harpoon, or a net float on its rope. A `line`
   * piece is a snapped line alone, wound around or caught on the fish along `path`.
   */
  kind: 'hook' | 'spoon' | 'fly' | 'harpoon' | 'netfloat' | 'line';
  /** Where it is set in the fish (model space), and which way it hangs or sticks out from there. */
  p: THREE.Vector3;
  dir: THREE.Vector3;
  /** Turns it about `dir`. */
  twist?: number;
  /** Its length in model units (a hook is 0.05 when left out). */
  size?: number;
  line?: TackleLine;
  /** For a `line` piece: the points it runs through. */
  path?: THREE.Vector3[];
  /** A gold glint on it. */
  glint?: boolean;
}

const STEEL = 0x8e969a;
const RUST = 0x9a6a48;
const BRASS = 0xd8ae48;
const LINE = 0xe6efe8;
const RED = 0xd8402c;
const CREAM = 0xf2ecdc;
const ROPE = 0xc9aa6e;
const WOOD = 0x8a6038;
const IRON = 0x4e525c;
const GLASS = 0x5cc4aa;

type Built = { metal: THREE.BufferGeometry[]; soft: THREE.BufferGeometry[]; eye: THREE.Vector3 };

/** A J hook 1 long, its bend at the origin (where it bites), its shank and eye up +Y. */
function hookParts(c: number): THREE.BufferGeometry[] {
  const pts = [V(0, 1, 0), V(0, 0.34, 0), V(0.04, 0.1, 0), V(0.19, 0, 0), V(0.35, 0.1, 0), V(0.4, 0.32, 0), V(0.37, 0.52, 0)];
  const shank = tube(pts, (s) => 0.05 * (1 - Math.max(0, s - 0.75) * 3.2), 5, 16);
  const eye = new THREE.TorusGeometry(0.075, 0.03, 4, 8).translate(0, 1.07, 0).deleteAttribute('uv');
  const barb = tube([V(0.37, 0.5, 0), V(0.3, 0.36, 0)], (s) => 0.03 * (1 - s), 4);
  return [tint(shank, c), tint(eye, c), tint(barb, c)];
}

function build(piece: TacklePiece, rng: () => number): Built {
  const size = piece.size ?? 0.05;
  const metal: THREE.BufferGeometry[] = [];
  const soft: THREE.BufferGeometry[] = [];
  /** Where the line ties on, in the piece's own space (up +Y). */
  let eye = V(0, 1.1, 0);
  switch (piece.kind) {
    case 'hook':
      metal.push(...hookParts(rng() < 0.5 ? STEEL : RUST));
      break;
    case 'spoon': {
      // A hammered brass spoon, its small hook in the fish, the line tied to its far end.
      metal.push(...hookParts(STEEL).map((g) => put(g, [0, 0, 0], [0, 0, 0], 0.55)));
      const plate = new THREE.SphereGeometry(1, 8, 6).deleteAttribute('uv');
      plate.scale(0.2, 0.52, 0.055).translate(0, 1.15, 0);
      metal.push(tint(plate, BRASS));
      const stripe = new THREE.SphereGeometry(1, 6, 4).deleteAttribute('uv');
      stripe.scale(0.14, 0.16, 0.062).translate(0, 0.86, 0);
      soft.push(tint(stripe, RED));
      metal.push(tint(new THREE.TorusGeometry(0.06, 0.022, 4, 8).translate(0, 1.72, 0).deleteAttribute('uv'), STEEL));
      eye = V(0, 1.78, 0);
      break;
    }
    case 'fly': {
      // A hook dressed with feathers and a wrap of thread.
      metal.push(...hookParts(STEEL));
      const feather = (c: number, a: number, len: number) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.16, len * 0.55, 0, 0, len, 0, 0.16, len * 0.55, 0], 3));
        g.setIndex([0, 1, 2, 0, 2, 3]);
        g.computeVertexNormals();
        return tint(put(g, [0, 0.82, 0], [a * 0.5, a * 2.1, Math.PI - a], 1), c);
      };
      soft.push(feather(RED, 0.5, 0.95), feather(0xf2a03a, -0.55, 0.85), feather(CREAM, 0.15, 0.7));
      soft.push(tint(new THREE.CylinderGeometry(0.085, 0.07, 0.3, 5).translate(0, 0.72, 0).deleteAttribute('uv'), 0x3a7a4a));
      break;
    }
    case 'harpoon': {
      // The stub of a harpoon: an iron socket in the fish, a snapped wooden shaft, a turn of rope.
      const s1 = new THREE.CylinderGeometry(0.09, 0.07, 0.34, 6).translate(0, 0.17, 0).deleteAttribute('uv');
      metal.push(tint(s1, IRON));
      const shaft = new THREE.CylinderGeometry(0.058, 0.066, 0.62, 6, 1).translate(0, 0.62, 0).deleteAttribute('uv');
      // Snap the top: push its rim up and down into splinters.
      const p = shaft.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.9) p.setY(i, p.getY(i) + (rng() - 0.35) * 0.22);
      shaft.computeVertexNormals();
      soft.push(tint(shaft, WOOD));
      soft.push(tint(new THREE.TorusGeometry(0.08, 0.03, 4, 8).rotateX(Math.PI / 2).translate(0, 0.42, 0).deleteAttribute('uv'), ROPE));
      eye = V(0.08, 0.42, 0);
      break;
    }
    case 'netfloat': {
      // A glass net float in its rope net, hanging from a rope.
      const ball = new THREE.IcosahedronGeometry(0.5, 1).deleteAttribute('uv').translate(0, -0.5, 0);
      soft.push(tint(ball, GLASS));
      for (const r of [[0, 0, 0], [0, Math.PI / 2, 0], [Math.PI / 2, 0, 0]] as [number, number, number][]) {
        soft.push(tint(put(new THREE.TorusGeometry(0.52, 0.035, 4, 12).deleteAttribute('uv'), [0, -0.5, 0], r), ROPE));
      }
      soft.push(tint(new THREE.SphereGeometry(0.09, 5, 4).deleteAttribute('uv'), ROPE));
      eye = V(0, 0.04, 0);
      break;
    }
    case 'line':
      break;
  }
  return { metal, soft, eye };
}

const metalMat = (k: number) => mat(`tackle:metal|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.45, flatShading: true, emissive: 0x2a2416 }), k));
const softMat = (k: number) => mat(`tackle:soft|${k}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true, side: THREE.DoubleSide }), k));

type Kit = { metal: THREE.BufferGeometry | null; soft: THREE.BufferGeometry | null; glints: THREE.Vector3[] };
const kits = new Map<string, Kit>();

/** Builds a legend's lost tackle onto it (once per species; every copy of the fish shares the two meshes). */
export function addTackle(ctx: LegendCtx, pieces: TacklePiece[]): void {
  if (ctx.shadow || !pieces.length) return;
  let kit = kits.get(ctx.id);
  if (!kit) kits.set(ctx.id, (kit = makeKit(ctx.id, pieces)));
  if (kit.metal) ctx.root.add(new THREE.Mesh(kit.metal, metalMat(ctx.light)));
  if (kit.soft) ctx.root.add(new THREE.Mesh(kit.soft, softMat(ctx.light)));
  for (const p of kit.glints) glint(ctx, p, 0.05, 0xffe2a0, 0.9);
}

function makeKit(id: string, pieces: TacklePiece[]): Kit {
  const glints: THREE.Vector3[] = [];
  const key = `${id}:tackle`;
  const metal: THREE.BufferGeometry[] = [];
  const soft: THREE.BufferGeometry[] = [];
  const rng = seeded(key);
  pieces.forEach((piece) => {
    const size = piece.size ?? 0.05;
    const dir = piece.dir.clone().normalize();
    const b = build(piece, rng);
    for (const g of b.metal) metal.push(aim(g, piece.p, dir, size, piece.twist ?? 0));
    for (const g of b.soft) soft.push(aim(g, piece.p, dir, size, piece.twist ?? 0));
    const eye = piece.p.clone().addScaledVector(dir, b.eye.y * size);
    if (piece.glint) glints.push(piece.kind === 'netfloat' ? piece.p.clone().addScaledVector(dir, -0.35 * size).add(V(0, size * 0.2, 0)) : piece.p.clone().addScaledVector(dir, (piece.kind === 'spoon' ? 1.15 : 0.5) * size));
    if (piece.kind === 'line' && piece.path) soft.push(tint(tube(piece.path, 0.0026, 4, piece.path.length * 5), LINE));
    const l = piece.line;
    if (l) {
      // The snapped line: off the eye the way the piece points, then drifting.
      const drift = (l.drift ?? V(0, -0.5, 1)).clone().normalize();
      const pts: THREE.Vector3[] = [eye.clone()];
      const d = dir.clone();
      const cur = eye.clone();
      const N = 9;
      const ph = rng() * 6;
      const wave = l.wave ?? 0.012;
      for (let i = 1; i <= N; i++) {
        const s = i / N;
        d.lerp(drift, 0.38).normalize();
        cur.addScaledVector(d, l.len / N);
        pts.push(cur.clone().add(V(Math.sin(s * 7 + ph) * wave * s, Math.cos(s * 5 + ph) * wave * s, 0)));
      }
      const thick = piece.kind === 'harpoon' || piece.kind === 'netfloat';
      soft.push(tint(tube(pts, thick ? 0.006 : 0.0026, 4, 28), thick ? ROPE : LINE));
      // A frayed end.
      const end = pts[N];
      for (let i = 0; i < 3; i++) soft.push(tint(tube([end, end.clone().add(V((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03, 0.012 + rng() * 0.012))], thick ? 0.003 : 0.0016, 3), thick ? ROPE : LINE));
      if (l.bobber !== undefined) {
        const at = new THREE.CatmullRomCurve3(pts).getPoint(l.bobber);
        const r = 0.02;
        const top = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).deleteAttribute('uv');
        const bot = new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).deleteAttribute('uv');
        const stem = new THREE.CylinderGeometry(0.0035, 0.0035, r * 3.4, 4).deleteAttribute('uv');
        const tilt: [number, number, number] = [0.5, 0, 0.35];
        soft.push(tint(put(top, at, tilt), RED), tint(put(bot, at, tilt), CREAM), tint(put(stem, at, tilt), 0x3a3a3a));
        if (piece.glint) glints.push(at.clone().add(V(0, r * 0.6, 0)));
      }
    }
  });
  return {
    metal: metal.length ? cached(`${key}:metal`, () => fuse(metal)) : null,
    soft: soft.length ? cached(`${key}:soft`, () => fuse(soft)) : null,
    glints,
  };
}
