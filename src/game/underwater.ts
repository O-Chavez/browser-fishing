import * as THREE from 'three';
import { LAKE } from '../data/lake';

/**
 * What lies under the lake's surface fades with the water over it (`LAKE`, src/data/lake.ts): the bed, posts, stones,
 * the bobber's foot, a hooked fish, the line, another player's catch, whatever is put there later. The lake is flat, so
 * each fragment knows from its own world height how deep it is and how far its light came through the water (down to
 * it from the sun and up to the eye at the angle it is seen); red dies first, and what is lost turns into the water's
 * own colour, which looking across the lake is a pale grey-blue and looking down into it a deeper green, so the bed's
 * shapes fade out with distance and the open lake keeps its colour. Nothing is drawn twice and there is no extra pass.
 *
 * It is clipped by world height, not by a list of meshes: every built-in material's shader carries it
 * (`installUnderwater`, once, before anything compiles); away from the lake it is left out of every program
 * (`setLake`), so the sea and the casino are unchanged. A material that sets its own `onBeforeCompile` replaces
 * this one and should call `underwaterShader` from it if it can go under the lake's water. Custom `ShaderMaterial`s
 * (the glows, particles, the water itself) are left as they are. An open hull (the rowboat) dips its inside below the
 * waterline: where the eye looks into it across the waterline inside its footprint (`setDry`), nothing fades.
 *
 * The bed (the terrain, `BED_DEFINES`) gets more: its colour by depth (pale sand, weedy green past the lip, dark silt),
 * wet sand and a thin line of foam at the water's edge, the waves in its depth, smooth normals under water so its big
 * flat-shaded triangles don't show through clear water (above water it is lit as flat as ever), and with the stones
 * (`NET_DEFINES`) the sun's slow net of light (caustics).
 *
 * The fade rides in every material, so it is kept short. Lite graphics (`setUnderwaterLite`) leaves all of it out (a
 * phone pays for every line of it in every fragment): the surface veils what is under it by the depth there instead,
 * and draws the foam line itself (lakewater.ts).
 */

/** The lake's surface, as `waveHeight` in env.ts and the water's own vertex shader lay it. */
export const LAKE_WAVE_GLSL = `
float lakeWave(vec2 p, float t){
  return sin(p.x*0.35+t*1.1)*0.07 + sin(p.y*0.5-t*1.3+p.x*0.2)*0.05 + sin((p.x+p.y)*0.9+t*2.0)*0.02;
}`;

/** How many open hulls can keep their insides dry (the lake has one rowboat). */
export const DRY_MAX = 1;
/** The lake's surface never rises above this (the waves' reach): nothing higher is ever under water. */
const TOP = 0.2;
const OFF = -1e4;

/**
 * Everything the shading reads that changes, packed in one array of vec4s so each draw uploads one uniform, not a
 * dozen (it rides in every material's program): see `LAKE_U_GLSL` for what sits where. The knobs that never change
 * (`LAKE.clear`, `murk`, `down`, `far`, `across`) are written into the shader instead.
 */
const SLOTS = 5 + DRY_MAX * 2;
export const UNDERWATER = {
  uLake: { value: new Float32Array(SLOTS * 4) },
  uLakeNet: { value: null as THREE.Texture | null },
};
const U = UNDERWATER.uLake.value;

/** What sits where in `uLake`, by name. */
export const LAKE_U_GLSL = `
uniform vec4 uLake[${SLOTS}];
#define uLakeTop uLake[0].x
#define uLakeTime uLake[0].y
#define uLakeCaust uLake[0].z
#define uLakeNear uLake[1].xyz
#define uLakeFar uLake[2].xyz
#define uLakeShift vec2(uLake[1].w, uLake[2].w)
#define uLakeWater uLake[3].xyz
#define uLakeDeep uLake[4].xyz
// Whether (x, z) on the waterline is inside an open hull: each footprint maps the lake's x, z to the unit disc.
bool lakeDry(vec2 s){
  for (int i = 0; i < ${DRY_MAX}; i++) {
    vec3 p = vec3(s, 1.0);
    vec2 q = vec2(dot(uLake[5 + i * 2].xyz, p), dot(uLake[6 + i * 2].xyz, p));
    if (dot(q, q) < 1.0) return true;
  }
  return false;
}`;

/** Whether the map is the lake: elsewhere nothing is patched at all (see `liteKey`). */
let onLake = false;

/**
 * Turns the shading on for the lake (on) or off for every other map, before the map's scene is compiled
 * (`World.prewarm`): off the lake every material compiles to three's own program, so the sea and the casino draw
 * exactly as they did.
 */
export function setLake(on: boolean): void {
  onLake = on;
  U[0] = on ? TOP : OFF;
  if (on) return;
  U[2] = 0;
  setDry([]);
}

/**
 * Each frame on the lake: the clock, the net's strength (0 none), the water's body looking down into it (near and far
 * off), the lake's own colours looking across it, and how far the net slides per metre of depth (x, z).
 */
export function setUnderwater(time: number, caustics: number, near: THREE.Color, far: THREE.Color, water: THREE.Color, deep: THREE.Color, shift: THREE.Vector2): void {
  U[1] = time;
  U[2] = caustics;
  U.set([near.r, near.g, near.b, shift.x, far.r, far.g, far.b, shift.y, water.r, water.g, water.b, 0, deep.r, deep.g, deep.b, 0], 4);
}

/**
 * The open hulls' footprints at the waterline: ellipses `half` (across, along) metres round (x, z), turned `facing`
 * like the hull (rotation about y). The first `DRY_MAX` count.
 */
export function setDry(hulls: { x: number; z: number; facing: number; half: [number, number] }[]): void {
  for (let i = 0; i < DRY_MAX; i++) {
    const h = hulls[i];
    // None: a footprint nothing is ever inside.
    if (!h) {
      U.set([1, 0, 1e4, 0, 0, 1, 0, 0], (5 + i * 2) * 4);
      continue;
    }
    const c = Math.cos(h.facing), s = Math.sin(h.facing);
    // Into the hull's own frame (the inverse of its turn), then scaled to the unit disc.
    const [a, b] = h.half;
    U.set([c / a, -s / a, (-c * h.x + s * h.z) / a, 0, s / b, c / b, (-s * h.x - c * h.z) / b, 0], (5 + i * 2) * 4);
  }
}
setLake(false);

const f = (v: number): string => v.toFixed(4);
/** exp(-k * path) as exp2(path * vec3): k turned to base 2 and negated, once, here. */
const k2 = (k: number[]): string => `vec3(${k.map((v) => f(-v / Math.LN2)).join(', ')})`;
const NET = f(LAKE.netScale);

const VERT_PARS = `
varying vec3 vLakeW;`;

// The world position as drawn, after skinning, morphs, instancing and batching: three's own where the shader has
// already worked it out (with shadows on), or the same sum.
const VERT = (worldpos: boolean): string => `
${worldpos ? '#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0\nvLakeW = worldPosition.xyz;\n#else' : '#if 1'}
{
  vec4 lakeP = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
  lakeP = batchingMatrix * lakeP;
  #endif
  #ifdef USE_INSTANCING
  lakeP = instanceMatrix * lakeP;
  #endif
  vLakeW = (modelMatrix * lakeP).xyz;
}
#endif`;

const FRAG_PARS = (rebuilt: boolean): string => `
${rebuilt ? 'vec3 vLakeW;' : 'varying vec3 vLakeW;'}
${LAKE_U_GLSL}
uniform sampler2D uLakeNet;
${LAKE_WAVE_GLSL}
// How far under the lake's surface this fragment lies: 0 above it, off the lake, or where the eye looks into a dry hull.
// The bed follows the waves near the shore, where its foam line rides them; everything else the still surface.
float lakeDepth(){
  float d = -vLakeW.y;
  #ifdef LAKE_BED
  if (d < 0.5) d += lakeWave(vLakeW.xz, uLakeTime) * (1.0 - smoothstep(0.2, 0.5, d));
  #endif
  vec3 e = cameraPosition - vLakeW;
  if (vLakeW.y > uLakeTop || d <= 0.0 || e.y <= 0.0) return 0.0;
  // Where the sight line crosses the waterline.
  return lakeDry(vLakeW.xz + e.xz * (max(-vLakeW.y, 0.0) / e.y)) ? 0.0 : d;
}
// The light that left this fragment, after the water between it and the eye: faded toward the water's own colour.
vec3 lakeAbsorb(vec3 c, float d){
  vec3 e = cameraPosition - vLakeW;
  float dist = length(e);
  float cosV = clamp(e.y / dist, 0.0, 1.0);
  // Up the sight line, bent a little steeper under the surface (its slope under water is about 0.66 + 0.34 of the one
  // above), plus the sunlight's own way down.
  float path = d + d / mix(max(cosV, 0.05), 0.66 + 0.34 * cosV, 0.35);
  vec3 t = exp2(path * ${k2(LAKE.clear)} + max(path - ${f(LAKE.murkFrom)}, 0.0) * ${k2(LAKE.murk)});
  // The water's colour. Looking down into it, its body: between its two colours near the eye, deeper looking steeply
  // down and far off. Looking across it, the lake's pale blue (\`setUnderwater\`), so the open lake reads as it always did.
  float far = smoothstep(4.0, 70.0, dist);
  vec3 into = mix(uLakeNear, uLakeFar, clamp(mix(${f(LAKE.down)}, 1.0, far) + 0.2 * cosV, 0.0, 1.0));
  vec3 body = mix(mix(uLakeWater, uLakeDeep, far), into, smoothstep(${f(LAKE.across[0])}, ${f(LAKE.across[1])}, cosV));
  return c * t + body * (1.0 - t);
}
#if defined(LAKE_BED) || defined(LAKE_NET)
#define LAKE_CAUSTICS
// The sun's net of light (a multiplier on the direct light) at net coordinates p, which change by dx, dy a pixel;
// \`squash\` is how much the bed's slope squeezes the net (1 on level ground, under 1 where it is drawn out).
float lakeNet(vec2 p, vec2 dx, vec2 dy, float squash, float d){
  float c1 = textureGrad(uLakeNet, p + uLakeTime * vec2(0.011, 0.007), dx, dy).r;
  // A second layer, turned a quarter and a little larger, drifting the other way.
  mat2 turn = mat2(0.0, -0.83, 0.83, 0.0);
  float c2 = textureGrad(uLakeNet, turn * p + uLakeTime * vec2(-0.008, 0.012) + 0.37, turn * dx, turn * dy).r;
  float n = min(c1, c2) * 1.6 + c1 * c2 * 0.6;
  // The net is cast along the bent sun's ray, so a slope draws it out or squeezes it: on a steep one its round cells
  // turn to streaks, so it fades out there. Seen too slantwise, or too small to stay steady, it fades too.
  // big: the most of a tile one pixel spans; slant: how much longer a pixel is one way than the other.
  float big = max(dot(dx, dx), dot(dy, dy));
  float slant = big / max(abs(dx.x * dy.y - dx.y * dy.x), 1e-9);
  float keep = smoothstep(0.6, 0.85, squash) * (1.0 - smoothstep(1.3, 1.8, squash))
    * (1.0 - smoothstep(3.0, 6.0, slant)) * (1.0 - smoothstep(0.015, 0.05, big));
  // Only near the viewer: further off the water across it hides the bed anyway.
  float f = smoothstep(0.0, 0.3, d) * exp(-d * 0.42) * uLakeCaust * keep * (1.0 - smoothstep(${f(LAKE.netFar[0])}, ${f(LAKE.netFar[1])}, distance(cameraPosition, vLakeW)));
  return 1.0 + (n * 2.1 - 0.22) * f;
}
#endif`;

const FRAG_DEPTH = (rebuilt: boolean): string => `${rebuilt ? `
// The world position, back from the view position the shader already has (no work in the vertex shader for it).
vLakeW = vec3(dot(viewMatrix[0].xyz, -vViewPosition), dot(viewMatrix[1].xyz, -vViewPosition), dot(viewMatrix[2].xyz, -vViewPosition)) + cameraPosition;` : ''}
float lakeD = lakeDepth();`;

/** On the bed and the stones, after the lights are summed: the net of light where the sun reaches under water. */
const FRAG_NET = `
#ifdef LAKE_CAUSTICS
if (uLakeCaust > 0.0) {
  vec2 lakeP = (vLakeW.xz + uLakeShift * lakeD) * ${NET};
  vec2 lakeDx = dFdx(lakeP), lakeDy = dFdy(lakeP);
  vec2 lakeGx = dFdx(vLakeW.xz), lakeGy = dFdy(vLakeW.xz);
  // The area a pixel covers on the net against on the ground under it.
  float lakeSquash = abs(lakeDx.x * lakeDy.y - lakeDx.y * lakeDy.x) / max(abs(lakeGx.x * lakeGy.y - lakeGx.y * lakeGy.x) * ${f(LAKE.netScale ** 2)}, 1e-12);
  if (lakeD > 0.0) reflectedLight.directDiffuse *= lakeNet(lakeP, lakeDx, lakeDy, lakeSquash, lakeD);
}
#endif`;

const FRAG_ABSORB = `
if (lakeD > 0.0) outgoingLight = lakeAbsorb(outgoingLight, lakeD);`;

/** The bed's own colour before lighting: zones by depth, the wet band, the foam line (terrain only). */
const BED_COLOR = `
#ifdef LAKE_BED
{
  vec2 bGx = dFdx(vLakeW.xz), bGy = dFdy(vLakeW.xz);
  if (vLakeW.y < 0.4) {
    float bN = textureGrad(uLakeNet, vLakeW.xz * 0.041, bGx * 0.041, bGy * 0.041).g;
    vec3 bC = diffuseColor.rgb;
    // A finer mottle in the shallows, eased out deeper down rather than read there.
    float bS = smoothstep(-1.4, -1.0, vLakeW.y);
    float bF = 0.5;
    if (bS > 0.0) bF = mix(0.5, textureGrad(uLakeNet, vLakeW.xz * 0.27 + 0.5, bGx * 0.27, bGy * 0.27).g, bS);
    // Pale sand shelf, then weedy green-brown past the lip, then dark silt.
    float bZ = -vLakeW.y + (bN - 0.5) * 0.7 + (bF - 0.5) * 0.14;
    bC *= mix(1.0, 0.9 + 0.2 * bF, smoothstep(0.0, 0.3, bZ));
    bC = mix(bC, bC * vec3(0.52, 0.66, 0.42), smoothstep(0.82, 1.02, bZ));
    bC = mix(bC, bC * vec3(0.3, 0.36, 0.33), smoothstep(2.0, 3.1, bZ));
    if (vLakeW.y > -0.35) {
      // Signed: under the water is positive.
      float bD = lakeWave(vLakeW.xz, uLakeTime) - vLakeW.y;
      // Wet sand from the waterline up to where the lapping reaches.
      float bWet = (1.0 - smoothstep(${f(LAKE.wet * 0.5)}, ${f(LAKE.wet)}, vLakeW.y + (bF - 0.5) * 0.1)) * (1.0 - smoothstep(0.02, 0.2, bD));
      bC *= mix(vec3(1.0), vec3(0.56, 0.5, 0.42), bWet);
      // A thin soft line of foam where the water meets the sand, broken along its length, breathing in and out.
      float bLap = 0.022 * sin(uLakeTime * 0.8 + bN * 14.0);
      float bFoam = (1.0 - smoothstep(0.004, 0.03, abs(bD - 0.008 - bLap))) * (0.35 + 0.65 * smoothstep(0.32, 0.62, bF));
      bC = mix(bC, vec3(0.94, 0.96, 0.95), bFoam * ${f(LAKE.foam)});
    }
    diffuseColor.rgb = bC;
  }
}
#endif`;

/** The bed's normal: as flat as ever above water, the mesh's smooth one under it. */
const BED_NORMAL = `
#ifdef LAKE_BED
{
  vec3 bFlat = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  normal = lakeD > 0.0 ? normalize(mix(bFlat, normal, smoothstep(0.0, 0.25, lakeD))) : bFlat;
  nonPerturbedNormal = normal;
}
#endif`;

/**
 * The terrain's material defines: the bed's extras. Its material must not be `flatShading` (the smooth normals are
 * needed under water); dry land is shaded flat by the shader itself, as before. In lite graphics it is flat-shaded
 * again (`LakeWater.setLite`).
 */
export const BED_DEFINES = { LAKE_BED: '' };
/** For a material that catches the net of light under water (the stones). */
export const NET_DEFINES = { LAKE_NET: '' };

const after = (src: string, anchor: string, add: string): string => src.replace(anchor, `${anchor}\n${add}`);
/** The shaders (three's `shaderID`) that carry the view position to the fragment shader. */
const REBUILT = ['lambert', 'phong', 'physical', 'toon', 'matcap'];

let lite = false;

/**
 * Lite graphics: nothing is patched (the surface veils what is under it). Programs are told apart by `liteKey`, and the
 * world compiles the scene again on the switch (`World.prewarm`), so every material in it picks the matching program.
 */
export function setUnderwaterLite(on: boolean): void {
  lite = on;
}

/** Adds the under-water shading to a built-in material's shader (as `onBeforeCompile`). */
export function underwaterShader(sh: THREE.WebGLProgramParametersWithUniforms): void {
  if (lite || !onLake) return;
  const p = sh as unknown as { shaderID?: string };
  Object.assign(sh.uniforms, UNDERWATER);
  // Shaders that keep the view position (the lit ones) work the world position out from it per fragment; the rest
  // (plain colour, lines, points) get it from the vertex shader.
  const rebuilt = REBUILT.includes(p.shaderID ?? '');
  const v = sh.vertexShader;
  if (!rebuilt) sh.vertexShader = after(after(v, '#include <fog_pars_vertex>', VERT_PARS), '#include <fog_vertex>', VERT(v.includes('#include <worldpos_vertex>')));
  let s = sh.fragmentShader;
  s = s.replace('void main() {', `${FRAG_PARS(rebuilt)}\nvoid main() {`);
  s = after(s, '#include <logdepthbuf_fragment>', FRAG_DEPTH(rebuilt));
  s = after(s, '#include <color_fragment>', BED_COLOR);
  s = after(s, '#include <normal_fragment_begin>', BED_NORMAL);
  s = after(s, '#include <lights_fragment_end>', FRAG_NET);
  sh.fragmentShader = s.replace('#include <opaque_fragment>', `${FRAG_ABSORB}\n#include <opaque_fragment>`);
}

/** Its program key: the hook's own (as three's default), told apart on the lake and in lite graphics there. */
function liteKey(this: THREE.Material): string {
  return this.onBeforeCompile.toString() + (onLake ? (lite ? '|lake-lite' : '|lake') : '');
}

let installed = false;

/**
 * Gives every built-in material that can be drawn under water the shading, from the first compile on. Sprites are
 * left out (they always face the eye, and their shader has no position to read).
 */
export function installUnderwater(): void {
  if (installed) return;
  installed = true;
  for (const m of [
    THREE.MeshBasicMaterial,
    THREE.MeshLambertMaterial,
    THREE.MeshPhongMaterial,
    THREE.MeshStandardMaterial,
    THREE.MeshToonMaterial,
    THREE.MeshMatcapMaterial,
    THREE.LineBasicMaterial,
    THREE.PointsMaterial,
  ]) {
    m.prototype.onBeforeCompile = underwaterShader;
    // A material with its own hook keeps its own source as the key, so its programs never mix with these.
    m.prototype.customProgramCacheKey = liteKey;
  }
}
