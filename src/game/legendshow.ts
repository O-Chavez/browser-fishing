/**
 * Showing off a sea legend: a model's measured bounds, and the surfacing
 * pose that lays an Abyss legend's model along a drawn spine beside the hull. The pose numbers live in
 * `LEGEND_SHOW` (src/data/legendshow.ts); this file only turns them into geometry, so any model fits any pose.
 */
import * as THREE from 'three';
import { SURFACE_LIMP, SURFACE_SPOT, limpAt, limpHeave, type SpinePoint, type SurfaceShow } from '../data/legendshow';
import { BOAT, hullHalfWidth } from '../data/sea';
import type { FishModel } from './fishmodel';
import { WAVE_GLSL, waveSurface, type WaveUniforms } from './seawaves';

/** A model's solid extent in its own frame (nose toward -Z): glows, auras, sparkles and sprites left out. */
export function modelBounds(model: FishModel): THREE.Box3 {
  const cached = model.group.userData.bounds as THREE.Box3 | undefined;
  if (cached) return cached;
  const root = model.group;
  const box = new THREE.Box3();
  const keep = root.matrix.clone();
  const pos = root.position.clone(), quat = root.quaternion.clone(), scl = root.scale.clone();
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const mat = m.material as THREE.Material;
    if (Array.isArray(mat) || mat.blending === THREE.AdditiveBlending || (mat.transparent && mat.opacity < 0.5)) return;
    const p = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 600));
    for (let i = 0; i < p.count; i += step) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
  });
  root.position.copy(pos);
  root.quaternion.copy(quat);
  root.scale.copy(scl);
  root.matrix.copy(keep);
  root.updateMatrixWorld(true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.1, -0.1, -0.5), new THREE.Vector3(0.1, 0.1, 0.5));
  root.userData.bounds = box;
  return box;
}

/** The model's measured length nose to tail (model units). */
export const modelLength = (model: FishModel): number => {
  const b = modelBounds(model);
  return b.max.z - b.min.z;
};

/**
 * A spine in the creature's own frame: x along (toward the player once turned by `heading`), y up, from the show point
 * on the water; z aside. Points in metres, sampled by arc length.
 */
export class Spine {
  private curve: THREE.CatmullRomCurve3;
  /** The back's direction at stations along a spine that leaves its drawing's plane (none for a flat one). */
  private backs: THREE.Vector3[] | null = null;
  constructor(pts: SpinePoint[], len: number) {
    const raw = pts.map(([a, u, c]) => new THREE.Vector3(a, u, c ?? 0));
    // Scaled so the curve is `len` long, whatever the drawing's own length.
    const c0 = new THREE.CatmullRomCurve3(raw, false, 'centripetal');
    const k = len / c0.getLength();
    this.curve = new THREE.CatmullRomCurve3(raw.map((p) => p.multiplyScalar(k)), false, 'centripetal');
    this.curve.arcLengthDivisions = 400;
    if (pts.some((p) => p[2])) {
      // Out of the plane the back can't be read off the drawing: it is carried along the curve without twisting, from
      // straight up where the spine lies most nearly level.
      const K = 200;
      const ts = Array.from({ length: K + 1 }, (_, i) => this.curve.getTangentAt(i / K).normalize());
      let i0 = 0;
      for (let i = 1; i <= K; i++) if (Math.abs(ts[i].y) < Math.abs(ts[i0].y)) i0 = i;
      const backs: THREE.Vector3[] = [];
      backs[i0] = new THREE.Vector3(0, 1, 0).addScaledVector(ts[i0], -ts[i0].y).normalize();
      const q = new THREE.Quaternion();
      for (const step of [1, -1])
        for (let i = i0 + step; i >= 0 && i <= K; i += step) {
          const n = backs[i - step].clone().applyQuaternion(q.setFromUnitVectors(ts[i - step], ts[i]));
          backs[i] = n.addScaledVector(ts[i], -n.dot(ts[i])).normalize();
        }
      this.backs = backs;
    }
  }
  /** Point, tangent (nose to tail) and the back's direction at `s` (0 nose .. 1 tail), turned `roll` about the tangent. */
  frame(s: number, roll: number, P: THREE.Vector3, T: THREE.Vector3, N: THREE.Vector3, B: THREE.Vector3): void {
    const u = THREE.MathUtils.clamp(s, 0, 1);
    this.curve.getPointAt(u, P);
    this.curve.getTangentAt(u, T);
    if (this.backs) {
      const x = u * (this.backs.length - 1), i = Math.min(this.backs.length - 2, Math.floor(x));
      N.copy(this.backs[i]).lerp(this.backs[i + 1], x - i);
      N.addScaledVector(T, -N.dot(T)).normalize();
    }
    // The back: the tangent turned a quarter clockwise in the drawing's plane (a fish lying nose toward +x has its back up).
    else N.set(T.y, -T.x, 0).normalize();
    B.crossVectors(N, T).normalize();
    if (roll) {
      const c = Math.cos(roll), sn = Math.sin(roll);
      const n = N.clone(), b = B.clone();
      N.copy(n).multiplyScalar(c).addScaledVector(b, sn);
      B.copy(b).multiplyScalar(c).addScaledVector(n, -sn);
    }
  }
}

const _P = new THREE.Vector3(), _T = new THREE.Vector3(), _N = new THREE.Vector3(), _B = new THREE.Vector3(), _v = new THREE.Vector3();

/** A pose's turn about its spine `s` of the way from the nose: its `roll`, and its `twist` eased between the stops. */
export function rollAt(show: Pick<SurfaceShow, 'roll' | 'twist'>, s: number): number {
  const tw = show.twist;
  if (!tw?.length) return show.roll;
  let i = 0;
  while (i < tw.length - 2 && s > tw[i + 1][0]) i++;
  const a = tw[i], b = tw[Math.min(tw.length - 1, i + 1)];
  const k = b[0] > a[0] ? THREE.MathUtils.clamp((s - a[0]) / (b[0] - a[0]), 0, 1) : 0;
  return show.roll + a[1] + (b[1] - a[1]) * k * k * (3 - 2 * k);
}

/**
 * Lays a fish model along a surfacing pose's spine, once, at the landing: every mesh's geometry is copied into the
 * model's frame and bent along the spine at the pose's drawn length; sprites (glows) ride to their bent spot. The meshes
 * end up straight under the model's root with no transform of their own, so the root alone places the creature.
 * Returns the drawn length and a function giving a point on the spine (the jaw, what the view looks at).
 * `mirror` draws the pose's mirror image instead (aside reversed, the creature itself with it), for a pose laid along
 * the hull whose tail runs off the other way (`surfacingSpot`).
 */
export function bendAlong(model: FishModel, show: SurfaceShow, len: number, mirror = false): { spine: Spine; above: THREE.Box3; at: (s: number, lift: number, out: THREE.Vector3) => THREE.Vector3 } {
  const root = model.group;
  const b = modelBounds(model);
  const z0 = b.min.z, z1 = b.max.z;
  const k = len / (z1 - z0);
  // A serpent's pose needs a slender body to read: a model deeper than `slender` of its length is drawn thinner round
  // its spine (today's Leviathan); a model already that slim (a long serpent) is left as it is.
  const deep = (b.max.y - b.min.y) / (z1 - z0);
  const girth = show.slender && deep > show.slender ? show.slender / deep : 1;
  const spine = new Spine(show.spine, len);
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const objs: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite)) objs.push(o);
  });
  const rel = new THREE.Matrix4();
  // What stands out of the water once bent (above the show point's level), for framing it.
  const above = new THREE.Box3();
  const place = (x: number, y: number, z: number, out: THREE.Vector3) => {
    const s = (z - z0) / (z1 - z0);
    spine.frame(s, rollAt(show, s), _P, _T, _N, _B);
    out.copy(_P).addScaledVector(_B, x * k * girth).addScaledVector(_N, y * k * girth);
    // Past the spine's ends (a limp build's arms reach further than the model that was measured) it carries on straight.
    if (s < 0 || s > 1) out.addScaledVector(_T, (s - THREE.MathUtils.clamp(s, 0, 1)) * len);
    if (mirror) out.z = -out.z;
    return out;
  };
  // A limp giant's glints (`FishModel.twinkle`) pulse about their own middles: moved whole, like the glows, to ride
  // the water with it (`LimpRide`). The Dreamer's stars stay as they were, baked in and drifting as they pulse.
  const glints = new Set(show.limp ? (model.twinkle ?? []) : []);
  for (const o of objs) {
    rel.multiplyMatrices(inv, o.matrixWorld);
    if ((o as THREE.Sprite).isSprite || glints.has(o)) {
      const c = _v.setFromMatrixPosition(rel);
      const at = place(c.x, c.y, c.z, new THREE.Vector3());
      const s = o.getWorldScale(new THREE.Vector3());
      o.removeFromParent();
      root.add(o);
      o.position.copy(at);
      o.quaternion.identity();
      o.scale.copy(s).multiplyScalar(k);
      if (glints.has(o)) o.scale.setScalar((o.userData.size = k));
      continue;
    }
    const m = o as THREE.Mesh;
    const g = m.geometry.clone();
    delete g.userData.shared;
    g.applyMatrix4(rel);
    const p = g.attributes.position;
    const solid = !((m.material as THREE.Material).blending === THREE.AdditiveBlending);
    for (let i = 0; i < p.count; i++) {
      place(p.getX(i), p.getY(i), p.getZ(i), _v);
      p.setXYZ(i, _v.x, _v.y, _v.z);
      if (solid && _v.y > 0) above.expandByPoint(_v);
    }
    if (mirror) {
      // A mirror image turns every triangle inside out: its corners are taken the other way round.
      if (!g.index) g.setIndex(Array.from({ length: p.count }, (_, i) => i));
      const ix = g.index!;
      for (let i = 0; i + 2 < ix.count; i += 3) {
        const b1 = ix.getX(i + 1);
        ix.setX(i + 1, ix.getX(i + 2));
        ix.setX(i + 2, b1);
      }
    }
    g.deleteAttribute('normal');
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    m.geometry = g;
    m.removeFromParent();
    root.add(m);
    m.position.set(0, 0, 0);
    m.quaternion.identity();
    m.scale.set(1, 1, 1);
    m.frustumCulled = false;
  }
  root.userData.bent = true;
  if (above.isEmpty()) above.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, len * 0.3, 1));
  return {
    spine,
    above,
    at: (s, lift, out) => {
      spine.frame(s, 0, out, _T, _N, _B);
      if (mirror) out.z = -out.z;
      return out.addScaledVector(_v.set(0, 1, 0), lift * len);
    },
  };
}

/** The wheelhouse's footprint on the charter boat (x0, x1, z0, z1), padded a little: the one tall thing on the deck. */
const WHEELHOUSE = (BOAT.blocked.find(([x0, x1]) => x0 < BOAT.wheelhouse && BOAT.wheelhouse < x1) ?? [0, 0, 0, 0]).map((v, i) => v + (i % 2 ? 0.15 : -0.15));

/** True when the deck-level line from (x0, z0) to (x1, z1) crosses the wheelhouse. */
function behindWheelhouse(x0: number, z0: number, x1: number, z1: number): boolean {
  const [bx0, bx1, bz0, bz1] = WHEELHOUSE;
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const [p, q] of [[-dx, x0 - bx0], [dx, bx1 - x0], [-dz, z0 - bz0], [dz, bz1 - z0]]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Where a surfacing legend comes up: its show point (boat frame, y 0), the way out from the hull, the way its spine's "along" points, and whether it is drawn mirrored. */
export interface SurfaceSpot {
  a: THREE.Vector3;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  mirror: boolean;
}

/**
 * Where a surfacing legend breaks the water (`base`, boat frame, y 0) and the way out from the hull it lies (`a`): out
 * past the hull's side the way the player faces, `out` metres off it and `across` to the side, as its pose is drawn.
 *
 * Looking along the deck the hull's side is a long way off that way (the boat is 13 m long), which would put it twice
 * as far from the player as it comes up from the rails: so the way out is turned toward the beam the player faces, a
 * step at a time, until the hull's side is within `SURFACE_SPOT.reach` metres, then toward the other beam. When the
 * wheelhouse would stand between the player and any of it (looking forward along the deck, or standing on the bow
 * beside it), it slides along the boat until it is clear, or the next way out is tried. With nowhere near and clear it
 * takes the first clear spot at any distance, and failing that the first spot.
 *
 * A pose laid along the hull (`alongside`) is placed by `alongsideSpot` instead.
 */
export function surfacingSpot(eye: THREE.Vector3, yaw: number, show: SurfaceShow, len: number): SurfaceSpot {
  if (show.alongside) return alongsideSpot(eye, yaw, show, len);
  const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const facing = Math.sign(look.z || -eye.z || -1);
  // The way the player faces, then turned toward the beam on that side, then toward the other beam.
  const ways: THREE.Vector3[] = [];
  for (const side of [facing, -facing]) {
    for (let k = side === facing ? 0 : 1; k <= SURFACE_SPOT.steps; k++) {
      const t = k / SURFACE_SPOT.steps;
      const a = new THREE.Vector3(look.x * (1 - t), 0, look.z * (1 - t) + side * t);
      if (a.lengthSq() > 1e-6) ways.push(a.normalize());
    }
  }
  const lo = Math.min(...show.spine.map(([s]) => s)) * len, hi = Math.max(...show.spine.map(([s]) => s)) * len;
  // Its drawing's "along" points back at the player, turned by the pose's heading.
  const dirOf = (a: THREE.Vector3) => a.clone().negate().applyAxisAngle(new THREE.Vector3(0, 1, 0), -show.heading);
  const spot = (a: THREE.Vector3, base: THREE.Vector3): SurfaceSpot => ({ a, base, dir: dirOf(a), mirror: false });
  let first: SurfaceSpot | null = null;
  let far: SurfaceSpot | null = null;
  for (const a of ways) {
    const right = new THREE.Vector3(-a.z, 0, a.x);
    // Out to the hull's side this way (the boat stays put; the sea moves round it).
    let t = 0;
    while (t < 14 && Math.abs(eye.z + a.z * t) < hullHalfWidth(eye.x + a.x * t)) t += 0.05;
    const near = t <= SURFACE_SPOT.reach;
    if (!near && far) continue;
    // Its body lies along `dir` from the show point, from `lo` to `hi` drawn lengths.
    const dir = dirOf(a);
    for (let k = 0; k <= 8; k++) {
      // Slid along the boat a step at a time, from the drawn spot to its mirror.
      const across = show.across * (1 - k / 4);
      const base = eye.clone().addScaledVector(a, t + show.out).addScaledVector(right, across).setY(0);
      first ??= spot(a, base);
      const clear = [lo, 0, hi].every((s) => !behindWheelhouse(eye.x, eye.z, base.x + dir.x * s, base.z + dir.z * s));
      if (!clear) continue;
      if (near) return spot(a, base);
      far ??= spot(a, base);
      break;
    }
  }
  return far ?? first!;
}

/**
 * Where a legend laid out along the hull comes up (`SurfaceShow.alongside`): parallel to the boat, `out` metres off
 * its beam on the side the player faces, its head by the player (`across` metres to their right, and a little the way
 * they look along the deck) and its body running away to their left, where the Deep Sea Rod and the catch card leave
 * the view clear. It is slid along the boat so that no more than `past` of its length lies beyond the boat's end, and
 * so that its head is not behind the wheelhouse; where the wheelhouse would hide more of it lying that way than the
 * other (from the bow), it lies the other way, mirrored.
 */
function alongsideSpot(eye: THREE.Vector3, yaw: number, show: SurfaceShow, len: number): SurfaceSpot {
  const look = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const side = Math.sign(look.z || -eye.z || -1);
  const a = new THREE.Vector3(0, 0, side);
  // The player's right as they face that beam.
  const rx = -side;
  const z = side * (BOAT.beam + show.out);
  const half = BOAT.len / 2;
  const lo = Math.min(...show.spine.map(([s]) => s)) * len, hi = Math.max(...show.spine.map(([s]) => s)) * len;
  const want = eye.x + rx * show.across + look.x * 2;
  const past = (show.alongside?.past ?? 0) * len;
  let best: (SurfaceSpot & { score: number }) | null = null;
  // Its tail away to the player's left, then to their right.
  for (const tail of [-rx, rx]) {
    // The head's end may stand as far as the boat's own end; the tail's may pass the other by `past`.
    const x0 = tail < 0 ? -half - past - lo : -half + hi;
    const x1 = tail < 0 ? half - hi : half + past + lo;
    const dir = new THREE.Vector3(-tail, 0, 0);
    for (let k = 0; k <= 12; k++) {
      // From where it is wanted, a step at a time toward the middle of the boat, until its head is in clear view.
      const x = THREE.MathUtils.clamp(want - Math.sign(want) * k * 0.75, Math.min(x0, x1), Math.max(x0, x1));
      const seen = (s: number) => !behindWheelhouse(eye.x, eye.z, x + dir.x * s, z);
      if (!seen(0) || !seen(hi)) continue;
      const shown = [0.2, 0.4, 0.6, 0.8, 1].filter((f) => seen(lo * f)).length;
      const score = shown - Math.abs(x - want) * 0.25 + (tail === -rx ? 0.5 : 0);
      if (!best || score > best.score) best = { a, base: new THREE.Vector3(x, 0, z), dir, mirror: tail * side > 0, score };
      break;
    }
  }
  if (best) return { a: best.a, base: best.base, dir: best.dir, mirror: best.mirror };
  // Nowhere clear (it can't happen on this boat): where it was wanted, its tail to the left.
  return { a, base: new THREE.Vector3(THREE.MathUtils.clamp(want, -half, half), 0, z), dir: new THREE.Vector3(rx, 0, 0), mirror: true };
}

/** Frees the bent copies `bendAlong` made (the model's own shared geometry stays). */
export function disposeBent(model: FishModel): void {
  if (!model.group.userData.bent) return;
  model.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose();
  });
}

/** How softly a beaten giant's ride bends at the edges of the band it rides whole (`SURFACE_LIMP.keep`), m² (squared). */
const KEEP_SOFT = 0.04;
const K = SURFACE_LIMP.keep;
/**
 * GLSL: `limpKeep(h, off)`, how far a part is drawn from the water it lies on (m, + up) when that water stands `h`
 * metres over the boat's own waterline, `off` metres from the player it was landed by: nothing inside the band, and
 * outside it part of the way back toward the band, less the further off, and never more than so far under the
 * water or proud of it (`SURFACE_LIMP.keep`). `keepOff` in JS.
 */
const KEEP_GLSL = `
float limpKeep(float h, float off) {
  float k = clamp((off - ${K.from.toFixed(2)}) / ${(K.to - K.from).toFixed(2)}, 0.0, 1.0);
  float a = h - ${K.hi.toFixed(2)}, b = ${K.lo.toFixed(2)} - h;
  float over = 0.5 * (a + sqrt(a * a + ${KEEP_SOFT.toFixed(3)})), under = 0.5 * (b + sqrt(b * b + ${KEEP_SOFT.toFixed(3)}));
  return clamp(under * (1.0 - mix(${K.near[1].toFixed(2)}, ${K.far[1].toFixed(2)}, k)) - over * (1.0 - mix(${K.near[0].toFixed(2)}, ${K.far[0].toFixed(2)}, k)), ${(-K.under).toFixed(2)}, ${K.proud.toFixed(2)});
}`;
/** `limpKeep` in JS. */
export function keepOff(h: number, off: number): number {
  const k = THREE.MathUtils.clamp((off - K.from) / (K.to - K.from), 0, 1);
  const a = h - K.hi, b = K.lo - h;
  const over = 0.5 * (a + Math.sqrt(a * a + KEEP_SOFT)), under = 0.5 * (b + Math.sqrt(b * b + KEEP_SOFT));
  return THREE.MathUtils.clamp(under * (1 - THREE.MathUtils.lerp(K.near[1], K.far[1], k)) - over * (1 - THREE.MathUtils.lerp(K.near[0], K.far[0], k)), -K.under, K.proud);
}

/** GLSL: the last heave `u` of the way through the rise (0 lying, 1 thrown right up); `limpHeave` in JS. */
const HEAVE_GLSL = `
float limpHeave(float u) {
  float f = clamp((u - ${SURFACE_LIMP.fall.toFixed(3)}) / ${(1 - SURFACE_LIMP.fall).toFixed(3)}, 0.0, 1.0);
  return smoothstep(${SURFACE_LIMP.lift[0].toFixed(3)}, ${SURFACE_LIMP.lift[1].toFixed(3)}, u) * (1.0 - f * f);
}`;

/** A copy of one of the giants' materials that draws each corner on the water (`LimpRide`), reading these uniforms. */
function ridingCopy(m: THREE.Material, uniforms: Record<string, THREE.IUniform>): THREE.Material {
  const mine = m.clone();
  const before = m.onBeforeCompile;
  const key = m.customProgramCacheKey;
  mine.onBeforeCompile = (sh, r) => {
    before.call(m, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', `${WAVE_GLSL}\n${HEAVE_GLSL}\n${KEEP_GLSL}\nuniform vec4 uLimpPlace; uniform vec4 uLimpRide; uniform vec4 uLimpHeave; uniform vec4 uLimpAmt; uniform vec4 uLimpDrift;\nvoid main() {`)
      .replace(
        '#include <project_vertex>',
        `{
    // The limp ends drift, slowly.
    transformed.xz += uLimpDrift.x * sway.x * vec2(sin(uLimpDrift.y * 0.5 + sway.y), cos(uLimpDrift.y * 0.37 + sway.y * 1.3));
    vec2 ll = transformed.xz;
    vec2 lp = uLimpPlace.xy + vec2(ll.x * uLimpPlace.z + ll.y * uLimpPlace.w, ll.y * uLimpPlace.z - ll.x * uLimpPlace.w);
    vec3 ld, ln; float lhc, lhs, latt;
    seaWaves(lp, ld, ln, lhc, lhs, latt);
    // The water drawn over this spot, not the water the waves carried away from it.
    seaWaves(lp - ld.xz, ld, ln, lhc, lhs, latt);
    ln = normalize(ln);
    vec2 lv = ll - uLimpHeave.xy;
    float lu = uLimpAmt.w - uLimpAmt.z * (0.5 + 0.5 * sin(atan(lv.y, lv.x) * 3.0));
    float lh = transformed.y + uLimpAmt.x * pow(clamp((length(lv) - uLimpHeave.z) / (uLimpHeave.w - uLimpHeave.z), 0.0, 1.0), uLimpAmt.y) * limpHeave(lu);
    float lr = mix(uLimpRide.z, ld.y, uLimpRide.x);
    // It rides the swell the boat rides: where its water stands far over or under the boat's own waterline it keeps
    // nearer the boat's level (most by the player), so a crest washes over it and a trough leaves it a little proud.
    vec4 lw = modelMatrix * vec4(ll.x, lr, ll.y, 1.0);
    lr += limpKeep(lw.y, length(lw.xz - uLimpDrift.zw)) / modelMatrix[1][1];
    transformed.y = lh + lr - uLimpRide.y;
    // What stands over the water leans with its slope.
    transformed.xz += vec2(ln.x * uLimpPlace.z - ln.z * uLimpPlace.w, ln.x * uLimpPlace.w + ln.z * uLimpPlace.z) * lh * uLimpRide.w * uLimpRide.x;
  }
  #include <project_vertex>`,
      );
  };
  mine.customProgramCacheKey = () => `${key.call(m)}|limp`;
  return mine;
}

/**
 * Stand-ins for a beaten giant's landing, made when it is hooked: one hidden speck for each of the model's finishes,
 * in the material its landing will draw that finish with, added to `into` (those it already holds are left). Compiled
 * ahead (`World.warm`), their shader programs are ready when the giant comes up, so the landing does not stall on
 * them; they must stay in the scene, since a program nobody uses is thrown away. Returns whether any were added.
 */
export function limpStandIns(model: FishModel, waves: WaveUniforms, into: THREE.Group): boolean {
  const held = (into.userData.held ??= new Set<THREE.Material>()) as Set<THREE.Material>;
  const zero = () => ({ value: new THREE.Vector4() });
  let added = false;
  model.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const m = mesh.material as THREE.Material | undefined;
    if (!mesh.isMesh || !m || Array.isArray(m) || !mesh.geometry.attributes.sway || held.has(m)) return;
    held.add(m);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(new Float32Array(6), 2));
    const speck = new THREE.Mesh(g, ridingCopy(m, { ...waves, uLimpPlace: zero(), uLimpRide: zero(), uLimpHeave: zero(), uLimpAmt: zero(), uLimpDrift: zero() }));
    speck.position.y = -50;
    into.add(speck);
    added = true;
  });
  return added;
}

/**
 * The spots along a laid-out model's waterline (its own frame, as `bendAlong` gave it), up to `n` of them spread over
 * it: where white water is thrown up and where a crest breaks over it.
 */
export function washPoints(model: FishModel, n: number): THREE.Vector3[] {
  const all: THREE.Vector3[] = [];
  for (const o of model.group.children) {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).blending === THREE.AdditiveBlending) continue;
    const p = mesh.geometry.attributes.position;
    const step = Math.max(1, Math.floor(p.count / 1500));
    for (let i = 0; i < p.count; i += step) {
      const y = p.getY(i);
      if (y > -0.3 && y < 0.45) all.push(new THREE.Vector3().fromBufferAttribute(p, i));
    }
  }
  if (!all.length) return [new THREE.Vector3()];
  // Spread along it: sorted by where they lie, then every so-many-th.
  all.sort((a, b) => a.x - b.x);
  return Array.from({ length: Math.min(n, all.length) }, (_, i) => all[Math.floor(((i + 0.5) / Math.min(n, all.length)) * all.length)]);
}

/**
 * A beaten giant lying on the sea (`SurfaceShow.limp`): its model, already laid along its pose (`bendAlong`), is put in
 * the sea's own frame and every corner of it is drawn on the water under it, in the vertex shader, with the sea's own
 * waves (`WAVE_GLSL`): a crest lifts the stretch of body it runs under and a trough drops it, what stands over the
 * water leans with its slope, and the limp ends drift. It rides the swell the boat rides: where the sea stands far
 * over or under the boat's own waterline it keeps nearer the boat's level (`SURFACE_LIMP.keep`), so it neither hangs
 * over the deck on a crest nor is lost behind the rail in a trough. The same sum runs here in JS (`point`) for the few things
 * placed by hand: its glows and glints, the jaw the line runs to, where the view looks, the white water.
 *
 * The cost is two passes of the five waves for each corner of the model (the second finds the water drawn over the
 * corner rather than the water carried to it), nothing on the CPU but a dozen points a frame, and no new render pass.
 */
export class LimpRide {
  /** Where its show point lies in the sea's frame (x, z) and its heading (cos, sin). */
  private place = new THREE.Vector4(0, 0, 1, 0);
  /** How far each part rides its own water (0 stiff .. 1), metres under, the water's height at its show point, how far it leans with the slope. */
  private ride = new THREE.Vector4(1, 0, 0, SURFACE_LIMP.lean);
  /** The heave's centre (its own frame, x and z), and where it starts and is whole (m). */
  private heave = new THREE.Vector4();
  /** The heave's height (m), power and stagger, and how far through the rise it is. */
  private amt = new THREE.Vector4();
  /** How far the limp ends drift (the model's `sway`, in metres a model unit), the drift's clock, and where the player stood who landed it (the boat's frame, x and z). */
  private drift = new THREE.Vector4();
  private uniforms: Record<string, THREE.IUniform>;
  private floats: { o: THREE.Object3D; at: THREE.Vector3 }[] = [];
  private d = new THREE.Vector3();
  private n = new THREE.Vector3();
  /** Seconds since it started up, for `under` and the heave. */
  t = 0;
  /** Extra metres under: its send-off. */
  sunk = 0;

  constructor(
    private model: FishModel,
    private show: SurfaceShow,
    len: number,
    private waves: WaveUniforms,
    mirror: boolean,
    /** Metres a model unit, for the drift. */
    scale: number,
    /** Where the player stands who landed it (the boat's frame): it keeps nearest the boat's level by them (`SURFACE_LIMP.keep`). */
    eye: THREE.Vector3,
  ) {
    const h = show.limp!.heave;
    this.heave.set(h.from[0] * len, h.from[1] * len * (mirror ? -1 : 1), h.near * len, h.far * len);
    this.amt.set(h.up, h.pow, h.stagger, 0);
    this.drift.set(scale * SURFACE_LIMP.drift, 0, eye.x, eye.z);
    this.uniforms = { ...waves, uLimpPlace: { value: this.place }, uLimpRide: { value: this.ride }, uLimpHeave: { value: this.heave }, uLimpAmt: { value: this.amt }, uLimpDrift: { value: this.drift } };
    for (const o of model.group.children) {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry.attributes.sway) mesh.material = this.riding(mesh.material as THREE.Material);
      else this.floats.push({ o, at: o.position.clone() });
    }
  }

  private made = new Map<THREE.Material, THREE.Material>();
  /** This giant's own copy of one of the kit's materials, drawing each corner on the water. */
  private riding(m: THREE.Material): THREE.Material {
    let mine = this.made.get(m);
    if (mine) return mine;
    mine = ridingCopy(m, this.uniforms);
    this.made.set(m, mine);
    this.model.materials.push(mine);
    // A light that breathes (the seams' bloom) goes on breathing.
    if (this.model.pulse?.includes(m)) this.model.pulse.push(mine);
    return mine;
  }

  /**
   * Its own light going out: what glows of it (eyes, molten seams) is drawn at `k` of its brightness, and its soft
   * glows shrink with it.
   */
  dim(k: number): void {
    for (const m of this.made.values()) {
      const b = m as THREE.MeshBasicMaterial;
      if (b.isMeshBasicMaterial && b.blending !== THREE.AdditiveBlending) b.color.setScalar(k);
    }
    for (const f of this.floats) if ((f.o as THREE.Sprite).isSprite) f.o.scale.setScalar(((f.o.userData.lit as number | undefined) ?? (f.o.userData.lit = f.o.scale.x)) * (0.55 + 0.45 * k));
  }

  /** Its own lit materials (the boat's lamps colour them). */
  get lit(): THREE.MeshStandardMaterial[] {
    return [...this.made.values()].filter((m): m is THREE.MeshStandardMaterial => !!(m as THREE.MeshStandardMaterial).isMeshStandardMaterial);
  }

  /** The height of the water drawn over (x, z) in the sea's frame, its slope into `n`. */
  private water(x: number, z: number): number {
    waveSurface(this.waves, x, z, this.d);
    return waveSurface(this.waves, 2 * x - this.d.x, 2 * z - this.d.z, this.d, this.n).y;
  }

  /**
   * Puts it on the water for this frame: `at` its show point in the sea's frame, `yaw` its heading there, `t` seconds
   * since it started up. Its root goes there (a child of the sea's frame), and its glows and glints to their spots.
   */
  update(at: THREE.Vector3, yaw: number, time: number): void {
    const g = this.model.group;
    const L = limpAt(this.t, this.show.rise);
    this.place.set(at.x, at.z, Math.cos(yaw), Math.sin(yaw));
    this.ride.x = THREE.MathUtils.lerp(this.show.ride, 1, L.limp);
    this.ride.y = this.show.limp!.under * L.under + this.sunk;
    this.ride.z = this.water(at.x, at.z);
    this.amt.w = L.u;
    this.drift.y = time;
    g.position.set(at.x, 0, at.z);
    g.rotation.set(0, yaw, 0);
    g.updateWorldMatrix(true, true);
    for (const f of this.floats) this.point(f.at, f.o.position);
  }

  /**
   * Where a point of the laid-out model (its own frame, as `bendAlong` gave it) is drawn now, in that frame; with
   * `lying`, where it is once the giant lies on the water (its heave over, nothing of it under).
   */
  point(p: THREE.Vector3, out = new THREE.Vector3(), lying = false): THREE.Vector3 {
    const c = this.place.z, s = this.place.w;
    const h = this.water(this.place.x + p.x * c + p.z * s, this.place.y + p.z * c - p.x * s);
    let up = p.y;
    if (!lying) {
      const vx = p.x - this.heave.x, vz = p.z - this.heave.y;
      const u = this.amt.w - this.amt.z * (0.5 + 0.5 * Math.sin(Math.atan2(vz, vx) * 3));
      const far = THREE.MathUtils.clamp((Math.hypot(vx, vz) - this.heave.z) / (this.heave.w - this.heave.z), 0, 1);
      up += this.amt.x * Math.pow(far, this.amt.y) * limpHeave(u);
    }
    const ride = lying ? 1 : this.ride.x;
    const lean = up * this.ride.w * ride;
    const on = THREE.MathUtils.lerp(this.ride.z, h, ride) + this.kept(p, THREE.MathUtils.lerp(this.ride.z, h, ride));
    return out.set(p.x + (this.n.x * c - this.n.z * s) * lean, up + on - (lying ? 0 : this.ride.y), p.z + (this.n.x * s + this.n.z * c) * lean);
  }

  /** How far a part is drawn from the water it lies on (`limpKeep`), that water `h` high in the sea's frame. */
  private kept(p: THREE.Vector3, h: number): number {
    const m = this.model.group.matrixWorld;
    const w = this.d.set(p.x, h, p.z).applyMatrix4(m);
    return keepOff(w.y, Math.hypot(w.x - this.drift.z, w.z - this.drift.w)) / m.elements[5];
  }

  /** How far the water stands over a part's own waterline (m): a crest washing over it. */
  awash(p: THREE.Vector3): number {
    const c = this.place.z, s = this.place.w;
    return -this.kept(p, this.water(this.place.x + p.x * c + p.z * s, this.place.y + p.z * c - p.x * s));
  }

  /** The same point in the world (the boat's frame). */
  world(p: THREE.Vector3, out = new THREE.Vector3(), lying = false): THREE.Vector3 {
    return this.point(p, out, lying).applyMatrix4(this.model.group.matrixWorld);
  }

  /**
   * How far the water under a point of it stands over the water a stride away on every side (m): a crest running
   * under it there, where white water breaks over it.
   */
  crest(p: THREE.Vector3, stride = 1.5): number {
    const c = this.place.z, s = this.place.w;
    const x = this.place.x + p.x * c + p.z * s, z = this.place.y + p.z * c - p.x * s;
    return this.water(x, z) - (this.water(x + stride, z) + this.water(x - stride, z) + this.water(x, z + stride) + this.water(x, z - stride)) / 4;
  }
}

/** A legend's shadow riding the swell: the sea frame's matrix and its inverse, and how far over the water it is drawn. */
export interface WaterRide {
  uSea: { value: THREE.Matrix4 };
  uSeaInv: { value: THREE.Matrix4 };
  uLift: { value: number };
}

/**
 * Draws a model laid on the water (a legend's shadow) on the sea's drawn surface, vertex by vertex, the way the lurkers
 * and jellies ride it (`WAVE_GLSL`), so a long flat shape shows over the whole swell instead of sinking into its crests.
 * Its own materials only (a shadow model's); `update` it each frame with the sea frame's matrix.
 */
export function rideWater(model: FishModel, waves: Record<string, THREE.IUniform>): WaterRide & { update: (frame: THREE.Object3D) => void } {
  const u: WaterRide = { uSea: { value: new THREE.Matrix4() }, uSeaInv: { value: new THREE.Matrix4() }, uLift: { value: 0.12 } };
  for (const m of model.materials) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, waves, u);
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', `${WAVE_GLSL}\nuniform mat4 uSea; uniform mat4 uSeaInv; uniform float uLift;\nvoid main() {`)
        .replace(
          '#include <project_vertex>',
          `vec4 rideS = uSeaInv * (modelMatrix * vec4(transformed, 1.0));
  vec3 rideD, rideN; float rideHc, rideHs, rideAtt;
  seaWaves(rideS.xz, rideD, rideN, rideHc, rideHs, rideAtt);
  rideS.y = rideD.y + uLift;
  vec4 mvPosition = viewMatrix * (uSea * rideS);
  gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    m.customProgramCacheKey = () => 'legend-shadow-ride';
    m.needsUpdate = true;
  }
  return {
    ...u,
    update: (frame) => {
      u.uSea.value.copy(frame.matrixWorld);
      u.uSeaInv.value.copy(frame.matrixWorld).invert();
    },
  };
}
