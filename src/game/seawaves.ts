import * as THREE from 'three';
import { FAR_CUT, NEAR_CUT, WAVES, waveAmp } from '../data/sea';

/**
 * The sea's waves as the water draws them: a Gerstner sum (`WAVES`) whose crests lean and sharpen with the mood. The
 * GLSL is shared by everything drawn on the water (the sea itself, the jellies' pools and halos), and `waveSurface` is
 * the same sum in JS, so things floating on it ride the drawn surface exactly, not just `seaHeight`'s.
 */

const N = WAVES.length;

/** The waves' uniforms: each wave's direction, wavenumber and height (`uWa`), steepness, speed, phase and cut (`uWb`). */
export interface WaveUniforms {
  uTime: { value: number };
  uWa: { value: THREE.Vector4[] };
  uWb: { value: THREE.Vector4[] };
}

export const waveUniforms = (): WaveUniforms => ({
  uTime: { value: 0 },
  uWa: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, 0)) },
  uWb: { value: WAVES.map((w) => new THREE.Vector4(0, w.w, w.ph, w.cut ? 1 : 0)) },
});

/**
 * Sets each wave's height and sharpness for a mood; `sums`, if given, gets the chop's and the long swell's heights
 * added up, for the crests' foam.
 */
export function setWaves(u: WaveUniforms, mood: number, sums?: { chop: number; swell: number }): void {
  const sharp = 0.5 + 0.5 * Math.min(1, mood);
  let chop = 0;
  let swell = 0;
  for (let i = 0; i < N; i++) {
    const w = WAVES[i];
    const a = waveAmp(w, mood);
    if (w.cut) chop += a;
    else swell += a;
    u.uWa.value[i].w = a;
    // Gerstner steepness per wave, kept below the point where crests fold over.
    u.uWb.value[i].x = a > 1e-4 ? (w.steep * sharp) / (w.k * a * N) : 0;
  }
  if (sums) {
    sums.chop = chop;
    sums.swell = swell;
  }
}

/**
 * GLSL: `seaWaves(p, d, n, hc, hs, att)` takes a rest point `p` on the water (the sea frame's x, z) to where it is drawn
 * now, `p + d`, with its normal `n`, the chop's and the long swell's heights there (`hc`, `hs`), and how much of the
 * waves' height shows (`att`: cut near the boat and far off, `NEAR_CUT` and `FAR_CUT`). Declares the wave uniforms.
 */
export const WAVE_GLSL = `
uniform float uTime; uniform vec4 uWa[${N}]; uniform vec4 uWb[${N}];
void seaWaves(vec2 p, out vec3 d, out vec3 n, out float hc, out float hs, out float att) {
  float r = length(p);
  float near = ${NEAR_CUT.keep.toFixed(3)} + ${(1 - NEAR_CUT.keep).toFixed(3)} * smoothstep(${NEAR_CUT.from.toFixed(1)}, ${NEAR_CUT.to.toFixed(1)}, r);
  float far = 1.0 - smoothstep(${FAR_CUT.from.toFixed(1)}, ${FAR_CUT.to.toFixed(1)}, r);
  att = near * far;
  d = vec3(0.0); n = vec3(0.0, 1.0, 0.0);
  hc = 0.0; hs = 0.0;
  for (int i = 0; i < ${N}; i++) {
    // uWb.w: 1 for the chop, cut down near the boat; 0 for the long swell, which the boat rides whole.
    vec2 dir = uWa[i].xy; float k = uWa[i].z; float a = uWa[i].w * far * mix(1.0, near, uWb[i].w); float q = uWb[i].x;
    float ph = k * dot(dir, p) - uWb[i].y * uTime + uWb[i].z;
    float c = cos(ph), s = sin(ph);
    d.xz += q * a * dir * c; d.y += a * s;
    if (uWb[i].w > 0.5) hc += a * s; else hs += a * s;
    n.xz -= dir * k * a * c; n.y -= q * k * a * s;
  }
}`;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * `WAVE_GLSL` in JS: where the rest point (x, z) on the water is drawn now (in the sea's frame), into `out`, and the
 * water's normal there into `nrm` if given. Allocates nothing.
 */
export function waveSurface(u: WaveUniforms, x: number, z: number, out: THREE.Vector3, nrm?: THREE.Vector3): THREE.Vector3 {
  const r = Math.hypot(x, z);
  const near = NEAR_CUT.keep + (1 - NEAR_CUT.keep) * smooth(NEAR_CUT.from, NEAR_CUT.to, r);
  const far = 1 - smooth(FAR_CUT.from, FAR_CUT.to, r);
  const t = u.uTime.value;
  let dx = 0, dy = 0, dz = 0, nx = 0, ny = 1, nz = 0;
  for (let i = 0; i < N; i++) {
    const A = u.uWa.value[i], B = u.uWb.value[i];
    const a = A.w * far * (B.w > 0.5 ? near : 1), q = B.x, k = A.z;
    const ph = k * (A.x * x + A.y * z) - B.y * t + B.z;
    const c = Math.cos(ph), s = Math.sin(ph);
    dx += q * a * A.x * c;
    dz += q * a * A.y * c;
    dy += a * s;
    nx -= A.x * k * a * c;
    nz -= A.y * k * a * c;
    ny -= q * k * a * s;
  }
  nrm?.set(nx, ny, nz).normalize();
  return out.set(x + dx, dy, z + dz);
}
