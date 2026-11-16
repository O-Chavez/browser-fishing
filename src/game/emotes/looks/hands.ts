/**
 * The base four's hands (Oscar's picks, 2026-11-15, style A; GAME_DESIGN.md §40). Characters have no arms, so a chunky
 * cream hand cuffed in the body's colour pops out beside the head (or two over it) and does the gesture: the open
 * mitten waves and claps (`wave.ts`, `nice.ts`), the glove gives a thumbs-up and wags a finger (`yes.ts`, `no.ts`).
 * Hands sit beside the head or over the outfit's top, never in front of the body, so they read from the camera behind
 * the player as well as from in front.
 */
import * as THREE from 'three';
import { easeOutBack, lowPolyMat, progress, smoothstep } from '../kit';
import { merge, put, type V3 } from '../meshes';
import type { EmoteCtx, EmotePose } from '../types';

/** The hands' cream. */
const CREAM = 0xfff0d8;
/** Hands are drawn this much bigger than they're modelled, so they read at the camera's distance. */
export const HAND_SCALE = 1.3;

/** Shapes a geometry in place: scaled by `s`, turned by `r` (one axis at a time here), then moved to `p`. */
const part = (geo: THREE.BufferGeometry, p: V3 = [0, 0, 0], s: V3 = [1, 1, 1], r: V3 = [0, 0, 0]): THREE.BufferGeometry => put(geo, p, r, s);

/** The cuff at the wrist, in the body's colour: a short band with a rolled edge. */
const cuffGeo = (): THREE.BufferGeometry =>
  merge([
    part(new THREE.CylinderGeometry(0.078, 0.084, 0.07, 8), [0, 0.02, 0]),
    part(new THREE.TorusGeometry(0.082, 0.018, 4, 8), [0, -0.012, 0], [1, 1, 1], [Math.PI / 2, 0, 0]),
  ]);

/** The open mitten's fingertips over its wrist, before `HAND_SCALE` (its palm reaches 0.15 + 0.13). */
export const MITTEN_TOP = 0.28;

/**
 * The open mitten in its own space: wrist at the origin, fingers up (+y), palm toward +z. `inner` is +1 or -1, the x
 * side the thumb sits on.
 */
function mittenGeo(inner: number): THREE.BufferGeometry {
  return merge([
    part(new THREE.SphereGeometry(1, 8, 6), [0, 0.15, 0], [0.1, 0.13, 0.055]),
    part(new THREE.CapsuleGeometry(0.034, 0.06, 2, 6), [inner * 0.095, 0.115, 0.01], [1, 1, 1], [0, 0, -inner * 0.8]),
  ]);
}

/**
 * A cartoon-glove fist in the mitten's family: same space and cuff, a rounded fist the size of the mitten's palm and
 * fat rounded digits. The curled fingers are plump rolls across the front that poke out past the fist's outer edge, so
 * the outline is lumpy like a glove from the front and from behind. `thumbsUp`: a fat thumb leaning up off the inner
 * top corner. `finger`: the index finger standing straight up out of the middle, with the thumb tucked across the front.
 */
function gloveGeo(kind: 'thumbsUp' | 'finger', inner: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [part(new THREE.SphereGeometry(1, 8, 6), [0, 0.15, 0], [0.105, 0.115, 0.088])];
  const rolls = kind === 'thumbsUp' ? [0.095, 0.15, 0.205] : [0.1, 0.155];
  for (const y of rolls) parts.push(part(new THREE.CapsuleGeometry(0.038, 0.1, 2, 6), [-inner * 0.03, y, 0.05], [1, 1, 0.95], [0, 0, Math.PI / 2]));
  if (kind === 'thumbsUp') {
    parts.push(part(new THREE.CapsuleGeometry(0.055, 0.07, 2, 7), [inner * 0.08, 0.29, 0.005], [1, 1, 1], [0, 0, -inner * 0.38]));
  } else {
    parts.push(part(new THREE.CapsuleGeometry(0.05, 0.13, 2, 7), [inner * 0.01, 0.31, 0.012]));
    parts.push(part(new THREE.SphereGeometry(0.044, 7, 5), [inner * 0.045, 0.2, 0.068], [1.35, 0.85, 0.9]));
  }
  return merge(parts);
}

/** One play's hand materials: cream with a little glow at night, and the cuff in the body's colour. */
export interface HandMats {
  cream: THREE.Material;
  cuff: THREE.Material;
}
export const handMats = (ctx: EmoteCtx): HandMats => ({
  cream: lowPolyMat(CREAM, { glow: 0.06 + 0.32 * ctx.dark }),
  cuff: lowPolyMat(ctx.look.color, { glow: 0.12 * ctx.dark }),
});

/** A hand as a group (wrist at its origin) to place and turn each frame, hidden until it pops. */
function hand(geo: THREE.BufferGeometry, mats: HandMats): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mats.cream), new THREE.Mesh(cuffGeo(), mats.cuff));
  g.scale.setScalar(0);
  return g;
}
export const mitten = (inner: number, mats: HandMats): THREE.Group => hand(mittenGeo(inner), mats);
export const glove = (kind: 'thumbsUp' | 'finger', inner: number, mats: HandMats): THREE.Group => hand(gloveGeo(kind, inner), mats);

/** Puts the hands on the body: their rig follows the pose's lift, lean and turn (not its squash). */
export function follow(rig: THREE.Object3D, pose: EmotePose): void {
  rig.position.y = pose.lift;
  rig.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
}

/** The top of the character to clear, never below a bare head's. */
export const crownOf = (ctx: EmoteCtx): number => Math.max(ctx.top, 1.86);
/** How far out beside the head a hand floats, clear of the outfit. */
export const sideOf = (ctx: EmoteCtx): number => Math.max(ctx.reach, 0.3) + 0.21;

/** A hand's scale as it pops in at `a` seconds (overshooting a little) and shrinks away by `b`. */
export const popScale = (t: number, a: number, b: number, inDur = 0.28, outDur = 0.22): number =>
  easeOutBack(progress(a, a + inDur, t)) * (1 - smoothstep(b - outDur, b, t));
