import * as THREE from 'three';
import { DOCK_RECTS, DOCK_TOP, WATER_ORDER, isWater, terrainHeight } from './env';

/**
 * Cheap night glow so far-off lamps still read as lit once the `LightPool` has switched their real
 * light off: soft halos round lamps, fires and windows, light pools on the ground under culled
 * lights, and shimmering reflections on the water. Each layer is a single draw call with no lights.
 */

interface GlowSpec {
  /** Halo radius in world units. */
  r: number;
  /** Brightness. */
  a: number;
  flicker?: boolean;
  /** The material whose colour the halo takes, for a marker that isn't the lit mesh itself. */
  of?: THREE.MeshLambertMaterial;
}

/**
 * Marks a lamp, lantern, fire light or window for `NightGlow` to find. A bare marker stands in for a mesh that is
 * baked into a merged one (a string light's bulb, `mergeStatic`): it carries the bulb's material as `of`.
 */
export const glowTag = (o: THREE.Object3D, r: number, a = 1, flicker = false, of?: THREE.MeshLambertMaterial): void => {
  o.userData.glow = { r, a, flicker, of } satisfies GlowSpec;
};

interface Source {
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  spec: GlowSpec;
}

/**
 * A pool adds what its lamp's light would add on screen to ground of `POOL_BASE` brightness, through the same tone
 * mapping and encoding as the scene: the moonlit ground at night, in linear light, and the share of a lamp's light the
 * surface gives back (its colour), less for the dark planks than the cobbles and grass, wherever the light comes from.
 * Matched by eye to the real lights, so a far lamp's pool and the light that replaces it as the player nears look alike.
 */
const POOL_BASE = 0.02;
const POOL_GAIN = { ground: 0.15, deck: 0.04 };
/** A pool's mesh reaches this share of its light's range, and the pool fades out before its edge. */
const POOL_REACH = 0.6;
/** How far a pool lies above the ground: clear of the cobbles (`COBBLE_LIFT` in town.ts), which sit on it too. */
const POOL_LIFT = 0.09;

const quad = (n: number, attrs: Record<string, number>): THREE.InstancedBufferGeometry => {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(2, 2);
  g.index = base.index;
  g.setAttribute('position', base.getAttribute('position'));
  for (const [name, size] of Object.entries(attrs)) {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute(name, a);
  }
  g.instanceCount = n;
  return g;
};

const additive = (vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial =>
  new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

const HALO_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute float iR;
uniform float uViewH, uMinPx, uMaxPx;
varying vec2 vUv; varying vec3 vCol;
void main() {
  vec4 vc = viewMatrix * vec4(iPos, 1.0);
  float dist = max(-vc.z, 0.1);
  float k = projectionMatrix[1][1] * uViewH * 0.5;
  float r = clamp(iR * k / dist, uMinPx, uMaxPx) * dist / k;
  vc.xy += position.xy * r;
  // Pull the sprite toward the camera so the bulb doesn't hide its own glow.
  vc.z += min(0.4, dist * 0.5);
  vUv = position.xy;
  vCol = iCol.rgb * iCol.a * mix(0.12, 1.0, smoothstep(3.0, 18.0, dist));
  gl_Position = projectionMatrix * vc;
}`;
const HALO_FRAG = /* glsl */ `
varying vec2 vUv; varying vec3 vCol;
void main() {
  float d2 = dot(vUv, vUv);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 5.0) * (1.0 - d2) + 0.5 * exp(-d2 * 60.0);
  gl_FragColor = vec4(vCol * a, 1.0);
  #include <colorspace_fragment>
}`;

// aEdge: 1 on land, 0 over water, and 2 on the dock layer.
const POOL_VERT = /* glsl */ `
attribute vec2 aR; attribute float aIdx; attribute float aEdge;
uniform float uAmp[POOLS];
uniform vec3 uCol[POOLS];
uniform vec4 uShape[POOLS];
varying vec2 vR; varying vec3 vCol; varying float vEdge; varying float vDock; varying vec3 vShape; varying vec2 vXZ; varying float vH;
void main() {
  int i = int(aIdx + 0.5);
  // A pool whose real light is on draws nothing: move the whole disc off screen so it costs no pixels.
  if (uAmp[i] < 0.002) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vR = aR;
  vDock = step(1.5, aEdge);
  vEdge = min(aEdge, 1.0);
  vCol = uCol[i] * uAmp[i];
  vShape = uShape[i].yzw;
  vXZ = position.xz;
  // The lamp's height over the surface here, which a slope or a dock changes across the pool.
  vH = max(0.3, uShape[i].x - (position.y - LIFT));
  gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
}`;
// The light a point light lays on flat ground, by three.js's own falloff, so a pool matches its lamp.
const POOL_FRAG = /* glsl */ `
vec3 screen(vec3 c) {
  #ifdef TONE_MAPPING
  c = toneMapping(c);
  #endif
  return linearToOutputTexel(vec4(c, 1.0)).rgb;
}
uniform vec4 uDock[DOCKS];
uniform vec2 uGain;
uniform float uBase;
varying vec2 vR; varying vec3 vCol; varying float vEdge; varying float vDock; varying vec3 vShape; varying vec2 vXZ; varying float vH;
void main() {
  float h = vH, range = vShape.x, decay = vShape.y;
  // Each pool has a layer on the ground and one on the planks; each keeps to its own surface.
  bool on = false;
  for (int k = 0; k < DOCKS; k++) {
    vec4 r = uDock[k];
    on = on || (vXZ.x > r.x && vXZ.x < r.y && vXZ.y > r.z && vXZ.y < r.w);
  }
  if (on != (vDock > 0.5)) discard;
  float d = length(vec3(vR, h));
  float win = clamp(1.0 - pow(d / range, 4.0), 0.0, 1.0);
  float e = h / pow(d, decay + 1.0) * win * win;
  // Fade out before the mesh's square edge, or the light's tail is cut off along straight lines.
  e *= 1.0 - smoothstep(0.55, 1.0, length(vR) / (REACH * range));
  // What the light adds once tone mapped and encoded, over the ground's own light: on dark ground the tone curve's toe
  // swallows a faint tail, as it does a real light's, where adding the encoded light alone would inflate it.
  vec3 base = vec3(uBase);
  vec3 lit = base + vCol * e * vEdge * (on ? uGain.y : uGain.x);
  gl_FragColor = vec4(screen(lit) - screen(base), 1.0);
}`;

const STREAK_VERT = /* glsl */ `
attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iShape;
varying vec2 vUv; varying vec3 vCol; varying float vLen; varying float vSeed;
void main() {
  vec2 dir = iShape.xy;
  vec2 side = vec2(-dir.y, dir.x);
  vec2 xz = iPos.xz + dir * position.y * iShape.z + side * position.x * iShape.w;
  vUv = position.xy;
  vCol = iCol.rgb * iCol.a;
  vLen = iShape.z;
  vSeed = iPos.x * 1.7 + iPos.z * 3.1;
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, iPos.y, xz.y, 1.0);
}`;
const STREAK_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv; varying vec3 vCol; varying float vLen; varying float vSeed;
void main() {
  float y = vUv.y * vLen;
  float x = vUv.x + 0.35 * sin(y * 5.0 + uTime * 2.3 + vSeed);
  float a = exp(-x * x * 5.0) * (1.0 - vUv.y * vUv.y);
  float ripple = 0.55 + 0.45 * sin(y * 9.0 - uTime * 2.6 + vSeed) * sin(y * 3.3 + uTime * 1.4 + vSeed * 2.0);
  gl_FragColor = vec4(vCol * a * ripple, 1.0);
  #include <colorspace_fragment>
}`;

export class NightGlow {
  readonly group = new THREE.Group();
  private sources: Source[] = [];
  private pools: THREE.PointLight[] = [];
  private halo: THREE.Mesh;
  private streak: THREE.Mesh;
  private haloU = { uViewH: { value: 720 }, uMinPx: { value: 3 }, uMaxPx: { value: 160 } };
  private streakU = { uTime: { value: 0 } };
  private poolAmp: number[] = [];
  private poolCol: THREE.Color[] = [];
  private poolShape: THREE.Vector4[] = [];
  private col = new THREE.Color();
  private v = new THREE.Vector3();

  constructor(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const spec = o.userData.glow as GlowSpec | undefined;
      if (spec) this.sources.push({ obj: o, pos: o.getWorldPosition(new THREE.Vector3()), spec });
      const l = o as THREE.PointLight;
      // Lamps and fires, not the little bottle glows (those are meant to be found up close).
      if (l.isPointLight && l.distance >= 10) this.pools.push(l);
    });
    this.halo = new THREE.Mesh(quad(this.sources.length, { iPos: 3, iCol: 4, iR: 1 }), additive(HALO_VERT, HALO_FRAG, this.haloU));
    this.streak = new THREE.Mesh(quad(this.sources.length, { iPos: 3, iCol: 4, iShape: 4 }), additive(STREAK_VERT, STREAK_FRAG, this.streakU));
    const pools = this.pools.length ? this.buildPools() : null;
    // After the water, which would otherwise paint over them.
    for (const m of [this.halo, pools, this.streak]) {
      if (!m) continue;
      m.frustumCulled = false;
      m.renderOrder = WATER_ORDER + 1;
      this.group.add(m);
    }
  }

  /**
   * One mesh for every lamp light's pool, faded per lamp through uniforms. Each pool has a layer draped over the
   * terrain as it is drawn, which stops at the water's edge, and a flat one on the docks' planks: draped over both,
   * the layer would cut under a dock's edge between its points.
   */
  private buildPools(): THREE.Mesh {
    const N = 24;
    const pos: number[] = [];
    const rel: number[] = [];
    const idx: number[] = [];
    const edge: number[] = [];
    const index: number[] = [];
    const vertex = (i: number, x: number, y: number, z: number, u: number, w: number, e: number): void => {
      pos.push(x, y, z);
      rel.push(u, w);
      idx.push(i);
      edge.push(e);
    };
    this.pools.forEach((l, i) => {
      const c = l.getWorldPosition(new THREE.Vector3());
      const R = l.distance * POOL_REACH;
      let base = pos.length / 3;
      for (let a = 0; a <= N; a++) {
        for (let b = 0; b <= N; b++) {
          const u = ((a / N) * 2 - 1) * R;
          const w = ((b / N) * 2 - 1) * R;
          const x = c.x + u;
          const z = c.z + w;
          // Off at the waterline, so a pool doesn't light the water over the shallows or round a dock (`isWater`
          // counts both as dry).
          const y = terrainHeight(x, z);
          vertex(i, x, Math.max(y, -0.1) + POOL_LIFT, z, u, w, isWater(x, z) ? 0 : THREE.MathUtils.smoothstep(y, -0.1, 0.05));
        }
      }
      for (let a = 0; a < N; a++) {
        for (let b = 0; b < N; b++) {
          const k = base + a * (N + 1) + b;
          index.push(k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1);
        }
      }
      if (DOCK_RECTS.some((r) => r.x1 > c.x - R && r.x0 < c.x + R && r.z1 > c.z - R && r.z0 < c.z + R)) {
        base = pos.length / 3;
        for (const [u, w] of [[-R, -R], [-R, R], [R, -R], [R, R]]) vertex(i, c.x + u, DOCK_TOP + POOL_LIFT, c.z + w, u, w, 2);
        index.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
      this.poolCol.push(new THREE.Color());
      this.poolShape.push(new THREE.Vector4(c.y, l.distance, l.decay, 0));
      this.poolAmp.push(0);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aR', new THREE.Float32BufferAttribute(rel, 2));
    g.setAttribute('aIdx', new THREE.Float32BufferAttribute(idx, 1));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
    g.setIndex(index);
    const docks = DOCK_RECTS.map((r) => new THREE.Vector4(r.x0, r.x1, r.z0, r.z1));
    const m = additive(
      POOL_VERT.replace(/POOLS/g, String(this.pools.length)).replace(/LIFT/g, POOL_LIFT.toFixed(3)),
      POOL_FRAG.replace(/DOCKS/g, String(docks.length)).replace(/REACH/g, POOL_REACH.toFixed(3)),
      {
        uAmp: { value: this.poolAmp },
        uCol: { value: this.poolCol },
        uShape: { value: this.poolShape },
        uDock: { value: docks },
        uGain: { value: new THREE.Vector2(POOL_GAIN.ground, POOL_GAIN.deck) },
        uBase: { value: POOL_BASE },
      },
    );
    m.polygonOffset = true;
    // A little more depth bias than the cobbles' (town.ts): with the lift, the pool lies on them, and it stays
    // small so the glow never shows through a post or a wall standing on the ground.
    m.polygonOffsetFactor = -3;
    m.polygonOffsetUnits = -3;
    return new THREE.Mesh(g, m);
  }

  private sourceColor(s: Source, out: THREE.Color): THREE.Color {
    const o = s.obj as THREE.Mesh & THREE.PointLight;
    if (o.isPointLight) return out.copy(o.color);
    const m = s.spec.of ?? (o.material as THREE.MeshLambertMaterial);
    return m.emissive && m.emissive.getHex() !== 0 ? out.copy(m.emissive) : out.copy(m.color);
  }

  update(t: number, night: number, eye: THREE.Vector3, viewH: number, pixelRatio: number): void {
    this.group.visible = night > 0.02;
    if (!this.group.visible) return;
    this.haloU.uViewH.value = viewH;
    this.haloU.uMinPx.value = 2.5 * pixelRatio;
    this.haloU.uMaxPx.value = 90 * pixelRatio;
    this.streakU.uTime.value = t;

    const hg = this.halo.geometry;
    const hPos = hg.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    const hCol = hg.getAttribute('iCol') as THREE.InstancedBufferAttribute;
    const hR = hg.getAttribute('iR') as THREE.InstancedBufferAttribute;
    const sg = this.streak.geometry;
    const sPos = sg.getAttribute('iPos') as THREE.InstancedBufferAttribute;
    const sCol = sg.getAttribute('iCol') as THREE.InstancedBufferAttribute;
    const sShape = sg.getAttribute('iShape') as THREE.InstancedBufferAttribute;
    this.sources.forEach((s, i) => {
      const c = this.sourceColor(s, this.col);
      const flick = s.spec.flicker ? 0.85 + 0.1 * Math.sin(t * 9 + i) + 0.05 * Math.sin(t * 23 + i * 2) : 1;
      // The light pool toggles real lights' `visible`, so only a hidden mesh hides its glow.
      const shown = (s.obj as THREE.PointLight).isPointLight || s.obj.visible;
      const amp = s.spec.a * night * flick * (shown ? 1 : 0);
      hPos.setXYZ(i, s.pos.x, s.pos.y, s.pos.z);
      hCol.setXYZW(i, c.r, c.g, c.b, amp * 0.35);
      hR.setX(i, s.spec.r);
      // Where the line from the eye to the light's mirror image meets the water.
      const h = s.pos.y;
      const k = eye.y / (eye.y + h);
      const px = eye.x + (s.pos.x - eye.x) * k;
      const pz = eye.z + (s.pos.z - eye.z) * k;
      this.v.set(eye.x - px, 0, eye.z - pz);
      const d = this.v.length();
      const wet = eye.y > 0.2 && h > 0.3 && d > 1.5 && isWater(px, pz) ? 1 : 0;
      this.v.divideScalar(Math.max(d, 1e-3));
      sPos.setXYZ(i, px, 0.03, pz);
      sCol.setXYZW(i, c.r, c.g, c.b, amp * 0.35 * wet * (1 - THREE.MathUtils.smoothstep(d, 60, 110)));
      sShape.setXYZW(i, this.v.x, this.v.z, Math.min(5, 0.6 + d * 0.07), Math.min(0.5, 0.12 + d * 0.004));
    });
    hPos.needsUpdate = hCol.needsUpdate = hR.needsUpdate = true;
    sPos.needsUpdate = sCol.needsUpdate = sShape.needsUpdate = true;

    // Each pool crossfades with its lamp's real light as the light pool dims or brightens it, and
    // follows the brightness the lamp's owner gives it (night, fire flicker).
    this.pools.forEach((l, i) => {
      const lit = (l.userData.lit as number | undefined) ?? 0;
      const base = (l.userData.base as number | undefined) ?? l.intensity;
      this.poolAmp[i] = (1 - lit) * base;
      this.poolCol[i].copy(l.color);
    });
  }
}
