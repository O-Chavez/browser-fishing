// The Abyss's three legends, each with a body of its own in place of a fish shape's (`AbyssParts.legend`): built once
// per look into a handful of merged meshes, and mounted here onto the model `buildFish` hands over.
import * as THREE from 'three';
import type { FishModel } from '../../fishmodel';
import type { SeaModelCtx } from '../types';
import { type Built, SWAY_T, bloomMat, depthOnly, glowMat, hardMat, plainMat, rimMat, silhouette, softMat, spriteMat } from './kit';
import { buildDreamer } from './dreamer';
import { buildKraken } from './kraken';
import { buildLeviathan } from './leviathan';

export type LegendKind = 'leviathan' | 'dreamer' | 'kraken';

const BUILDERS: Partial<Record<LegendKind, (shiny: boolean, limp?: boolean) => Built>> = { leviathan: buildLeviathan, dreamer: buildDreamer, kraken: buildKraken };
/** The legends with a limp build of their own, laid out as they lie beaten on the water (`limpGiant`). */
const LIMP: Partial<Record<LegendKind, true>> = { kraken: true, leviathan: true };
const builds = new Map<string, Built>();
function built(kind: LegendKind, shiny: boolean, limp = false): Built | null {
  const make = BUILDERS[kind];
  if (!make || (limp && !LIMP[kind])) return null;
  const key = `${kind}|${shiny}${limp ? '|limp' : ''}`;
  let b = builds.get(key);
  if (!b) builds.set(key, (b = make(shiny, limp)));
  return b;
}

/** What `legendModel` mounted, kept on the model's body so its limp build can be laid out in its place (`limpGiant`). */
interface Mounted {
  kind: LegendKind;
  shiny: boolean;
  parts: Partial<Record<'hard' | 'soft' | 'rim' | 'glow' | 'bloom', THREE.Mesh>>;
  sprites: THREE.Sprite[];
  twinkles: THREE.Mesh[];
}

/** Builds a giant's limp build ahead of its landing, so the landing does not wait for it (nothing for one without). */
export function primeLimp(model: FishModel): void {
  const m = model.body?.userData.giant as Mounted | undefined;
  if (m) built(m.kind, m.shiny, true);
}

/**
 * Lays a giant's limp build out on its model, in place of the one that fought: the same parts with the same finishes,
 * each mesh given the limp geometry and each glow and glint moved to where it lies. False (and nothing done) for a
 * model with no limp build.
 */
export function limpGiant(model: FishModel): boolean {
  const m = model.body?.userData.giant as Mounted | undefined;
  const b = m && built(m.kind, m.shiny, true);
  if (!m || !b) return false;
  const geo = { hard: b.hard?.geo, soft: b.soft?.geo, rim: b.rim?.geo, glow: b.glow, bloom: b.bloom?.geo };
  for (const [k, mesh] of Object.entries(m.parts) as [keyof typeof geo, THREE.Mesh][]) if (geo[k]) mesh.geometry = geo[k]!;
  m.sprites.forEach((sp, i) => b.sprites[i] && sp.position.copy(b.sprites[i].at));
  m.twinkles.forEach((t, i) => b.twinkles[i] && t.position.copy(b.twinkles[i].at));
  return true;
}
const shades = new Map<LegendKind, ReturnType<typeof silhouette>>();

/** Takes the fish shape's fins off the model (the legend brings its own body) and hangs the tail's pivot on the body. */
function clear(group: THREE.Group, body: THREE.Mesh, tail: THREE.Group): void {
  const drop = (o: THREE.Object3D) => {
    o.removeFromParent();
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.geometry.userData.shared) m.geometry.dispose();
  };
  for (const c of [...group.children]) if (c !== body && c !== tail) drop(c);
  for (const c of [...tail.children]) drop(c);
  body.add(tail);
}

const twinkleGeo = new Map<number, THREE.BufferGeometry>();
function mote(r: number): THREE.BufferGeometry {
  let g = twinkleGeo.get(r);
  if (!g) {
    twinkleGeo.set(r, (g = new THREE.OctahedronGeometry(r)));
    g.userData.shared = true;
  }
  return g;
}

/** Builds a legend's own body onto the model. Returns false if this legend has none yet. */
export function legendModel(ctx: SeaModelCtx, kind: LegendKind): boolean {
  const b = built(kind, ctx.shiny);
  if (!b) return false;
  const { group, body, tail } = ctx;
  clear(group, body, tail);
  const mounted: Mounted = { kind, shiny: ctx.shiny, parts: {}, sprites: [], twinkles: [] };
  body.userData.giant = mounted;
  const add = (geo: THREE.BufferGeometry | null | undefined, m: THREE.Material, parent: THREE.Object3D = body): THREE.Mesh | undefined => {
    if (!geo) return undefined;
    const mesh = new THREE.Mesh(geo, m);
    parent.add(mesh);
    return mesh;
  };
  const hard = b.hard?.geo ? hardMat(b.hard.rough, b.hard.metal) : null;
  if (b.skin) {
    body.geometry = b.skin.geo;
    b.skin.finish(ctx.bodyMat);
    if (hard) mounted.parts.hard = add(b.hard!.geo, hard);
  } else if (hard) {
    // No painted skin: the armour is the body.
    body.geometry = b.hard!.geo!;
    body.material = hard;
    mounted.parts.hard = body;
  }
  if (b.soft?.geo) mounted.parts.soft = add(b.soft.geo, softMat(b.soft.rough, b.soft.coat, b.soft.side, b.soft.tint));
  if (b.rim?.geo) mounted.parts.rim = add(b.rim.geo, rimMat(b.rim.rough, b.rim.color, b.rim.power));
  mounted.parts.glow = add(b.glow, glowMat(THREE.DoubleSide));
  if (b.bloom?.geo) {
    const m = bloomMat(b.bloom.op);
    mounted.parts.bloom = add(b.bloom.geo, m);
    ctx.pulse.push(m);
  }
  if (b.tail) {
    tail.position.copy(b.tail.at);
    add(b.tail.hard, hardMat(b.tail.rough, b.tail.metal), tail);
    add(b.tail.glow, glowMat(THREE.DoubleSide), tail);
  }
  if (b.ring) {
    const ring = new THREE.Group();
    ring.position.copy(b.ring.at);
    ring.rotation.copy(b.ring.tilt);
    const turn = new THREE.Group();
    ring.add(turn);
    add(b.ring.glow, glowMat(THREE.DoubleSide), turn);
    body.add(ring);
    const speed = b.ring.speed;
    ctx.ticks.push((t) => (turn.rotation.y = t * speed));
  }
  for (const s of b.sprites) {
    const m = spriteMat(ctx.glowTexture(), s.color, s.op);
    const sp = new THREE.Sprite(m);
    sp.scale.setScalar(s.size);
    sp.position.copy(s.at);
    body.add(sp);
    mounted.sprites.push(sp);
    if (!ctx.pulse.includes(m)) ctx.pulse.push(m);
  }
  for (const t of b.twinkles) {
    const m = new THREE.Mesh(mote(t.r), plainMat(t.color, t.glow));
    m.position.copy(t.at);
    body.add(m);
    mounted.twinkles.push(m);
    ctx.twinkle.push(m);
  }
  ctx.ticks.push((t) => (SWAY_T.value = t));
  return true;
}

/** The legend's dark underwater silhouette, in place of the fish shape's. Returns false if this legend has no body of its own yet. */
export function legendShadow(kind: LegendKind, group: THREE.Group, body: THREE.Mesh, tail: THREE.Group): boolean {
  const b = built(kind, false);
  if (!b) return false;
  let s = shades.get(kind);
  if (!s) shades.set(kind, (s = silhouette(b)));
  clear(group, body, tail);
  body.geometry = s.body;
  // Its parts overlap: laid down in depth first, so the see-through silhouette is one even tone.
  const under = new THREE.Mesh(s.body, depthOnly());
  body.add(under);
  if (b.tail) tail.position.copy(b.tail.at);
  if (s.tail) {
    tail.add(new THREE.Mesh(s.tail, body.material), new THREE.Mesh(s.tail, depthOnly()));
  }
  return true;
}
