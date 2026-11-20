import * as THREE from 'three';
import { LAKE } from '../data/lake';
import { terrainGrid } from './env';
import { BED_DEEP, BED_HALF, BED_RANGE, bakeBed, bedTexture, buildStones, netTexture } from './lakebed';
import { LAKE_U_GLSL, LAKE_WAVE_GLSL, UNDERWATER, setDry, setLake, setUnderwater } from './underwater';

/**
 * The lake's water (`LAKE`, src/data/lake.ts): the surface and what the water does to whatever is under it.
 *
 * Near the viewer the surface is only the sky's mirror and the sun's and moon's glints; the water's colour is laid on
 * what lies under it, by how much water is over it (underwater.ts), so the shallows read clear and the bed fades out
 * with depth. Far off it turns back into the lake's old surface, its own colour under the mirror, so the open lake
 * keeps its pale grey-blue. Over the last few centimetres of water at the shore it thins out to nothing (it reads the
 * bed's height from a map baked from the terrain mesh), and it is not drawn inside an open hull. In lite graphics
 * nothing under it is shaded, so the surface itself veils it by the depth there and draws the foam line.
 */

const WAVE_GLSL = `${LAKE_WAVE_GLSL}
vec2 lakeWaveGrad(vec2 p, float t){
  float a = cos(p.x*0.35+t*1.1)*0.35*0.07;
  float b = cos(p.y*0.5-t*1.3+p.x*0.2)*0.05;
  float c = cos((p.x+p.y)*0.9+t*2.0)*0.9*0.02;
  return vec2(a + 0.2*b + c, 0.5*b + c);
}`;

export const lakeVert = `
uniform float uTime; varying vec3 vWorld;
${LAKE_WAVE_GLSL}
void main(){
  vec3 p = position; p.y = lakeWave(p.xz, uTime);
  vec4 w = modelMatrix * vec4(p,1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const f = (v: number): string => v.toFixed(4);
/** exp(-k * path) as exp2(path * vec3), as underwater.ts has it. */
const k2 = (k: number[]): string => `vec3(${k.map((v) => f(-v / Math.LN2)).join(', ')})`;

const lakeFrag = `
uniform float uTime; uniform vec3 uShallow, uDeep, uSkyH, uSkyT, uSunCol, uSunDir, uFogColor, uMoonDir, uMoonCol;
uniform float uFogNear, uFogFar; varying vec3 vWorld;
uniform sampler2D uLakeBed;
${LAKE_U_GLSL}
${WAVE_GLSL}
void main(){
  vec2 g = lakeWaveGrad(vWorld.xz, uTime) * 2.5;
  g += 0.018 * vec2(sin(vWorld.x*2.7+uTime*1.9) + sin(vWorld.z*4.1-uTime*1.3), cos(vWorld.z*3.1+uTime*1.6) + cos(vWorld.x*5.3+uTime*1.1));
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n,V),0.0), 3.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyH, uSkyT, pow(clamp(R.y,0.0,1.0),0.6));
  float dist = length(cameraPosition - vWorld);
  float mirror = clamp(fres*0.8 + 0.03, 0.0, 1.0);
  float sd = max(dot(R, uSunDir), 0.0);
  float mp = max(dot(R, uMoonDir), 0.0);
  vec3 glint = uSunCol * (pow(sd, 350.0) * 4.0 + pow(sd, 30.0) * 0.25) + uMoonCol * (pow(mp, 400.0) * 0.6 + pow(mp, 30.0) * 0.04);
  // Far off, the lake's old surface: its own colour under the mirror, nearly opaque.
  vec3 farCol = mix(mix(uShallow, uDeep, smoothstep(4.0, 70.0, dist)), sky, mirror) + glint;
  float farA = clamp(0.55 + 0.45*smoothstep(3.0,45.0,dist) + fres*0.3, 0.0, 1.0);
  // Near, the mirror alone over the water drawn beneath. It is laid over what is under it after both are tone-mapped,
  // where a bright sky over dark water counts for less, so its share is lifted; glints show over it at full strength.
  float refl = pow(mirror, 0.7);
  float nearA = refl + (1.0 - refl) * 0.4 * clamp(max(glint.r, glint.g), 0.0, 1.0);
  vec3 nearCol = (sky + glint) * nearA;
  // The bed's height under this bit of surface.
  vec2 buv = vWorld.xz / ${f(BED_HALF * 2)} + 0.5;
  float inside = step(max(abs(buv.x - 0.5), abs(buv.y - 0.5)), 0.495);
  vec2 bedMap = texture2D(uLakeBed, buv).rg;
  float bedY = bedMap.r * ${f(BED_RANGE[1] - BED_RANGE[0])} + ${f(BED_RANGE[0])};
  #ifdef LAKE_LITE
  // Lite graphics: nothing under the water fades by itself, so the surface veils it in the water's own colour by the
  // depth of the bed here, as the fade would (clear in the shallows), near the viewer up to LAKE.liteVeil so a fish or a
  // post in deep water still shows through.
  float depth = max(vWorld.y - (bedMap.g * ${f(BED_DEEP[1] - BED_DEEP[0])} + ${f(BED_DEEP[0])}), 0.0);
  float cosV = clamp(V.y, 0.0, 1.0);
  float path = depth + depth / mix(max(cosV, 0.05), 0.66 + 0.34 * cosV, 0.35);
  float through = dot(exp2(path * ${k2(LAKE.clear)} + max(path - ${f(LAKE.murkFrom)}, 0.0) * ${k2(LAKE.murk)}), vec3(1.0 / 3.0));
  float near = smoothstep(4.0, 70.0, dist);
  vec3 into = mix(uLakeNear, uLakeFar, clamp(mix(${f(LAKE.down)}, 1.0, near) + 0.2 * cosV, 0.0, 1.0));
  vec3 body = mix(mix(uLakeWater, uLakeDeep, near), into, smoothstep(${f(LAKE.across[0])}, ${f(LAKE.across[1])}, cosV));
  // Further off it veils all the way, so the bed's shapes (the deep disc's rim) fade out as they do in full graphics.
  float veil = mix(${f(LAKE.liteVeil)}, 1.0, smoothstep(6.0, 20.0, dist)) * (1.0 - through) * (1.0 - nearA);
  nearCol += body * veil;
  nearA += veil;
  // Nor does the old surface let the bed through where the veil has hidden it.
  farA = max(farA, nearA);
  #endif
  float k = smoothstep(${f(LAKE.far[0])}, ${f(LAKE.far[1])}, dist);
  float a = mix(nearA, farA, k);
  vec3 col = mix(nearCol, farCol * farA, k) / max(a, 1e-4);
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  // Thin out to nothing over the last of the water at the shore.
  a *= mix(1.0, smoothstep(0.0, ${f(LAKE.edge)}, vWorld.y - bedY), inside);
  #ifdef LAKE_LITE
  // The thin line of foam where the water meets the sand (on the bed itself in full graphics), broken along its length.
  float foam = (1.0 - smoothstep(0.004, 0.03, abs(vWorld.y - bedY - 0.012))) * inside;
  foam *= ${f(LAKE.foam)} * (0.35 + 0.65 * smoothstep(-0.3, 0.6, sin(vWorld.x * 2.3 + uTime * 0.4) * sin(vWorld.z * 1.9 - uTime * 0.3)));
  // It is lit like the sand it lies on: as bright as the sky is (dim at night).
  vec3 foamCol = vec3(0.94, 0.96, 0.95) * clamp(dot(uSkyH, vec3(0.46)), 0.12, 1.0);
  col = mix(col, foamCol, foam / max(a + foam * (1.0 - a), 1e-4));
  a += foam * (1.0 - a);
  #endif
  // No water inside an open hull.
  if (lakeDry(vWorld.xz)) a = 0.0;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const scratch = new THREE.Color();
const BODY_NEAR = new THREE.Color(LAKE.body.near);
const BODY_FAR = new THREE.Color(LAKE.body.far);
const PALE = new THREE.Color(LAKE.pale.color);

/** The lake's bed map, baked once: the lake doesn't change shape, so a trip back from sea doesn't bake it again. */
let bed: THREE.DataTexture | null = null;

export interface WaterUniforms {
  uTime: THREE.IUniform<number>;
  uShallow: THREE.IUniform<THREE.Color>;
  uDeep: THREE.IUniform<THREE.Color>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
}

export class LakeWater {
  readonly surface: THREE.Mesh;
  /** Hidden in lite graphics. */
  readonly stones: THREE.InstancedMesh;
  private lite = false;
  private near = new THREE.Color();
  private far = new THREE.Color();
  private water = new THREE.Color();
  private deep = new THREE.Color();
  private shift = new THREE.Vector2();

  /**
   * `waterU` are the world's water uniforms (the surface shares them); `terrain` is the terrain mesh's heights, one for
   * each of `terrainGrid`'s points, and `bedMat` its material (`BED_DEFINES`); `hulls` the open hulls afloat
   * (`Town.hulls`).
   */
  constructor(
    private waterU: WaterUniforms & Record<string, THREE.IUniform>,
    terrain: ArrayLike<number>,
    private bedMat: THREE.Material,
    hulls: Parameters<typeof setDry>[0],
  ) {
    if (!bed) {
      const g = terrainGrid();
      bed = bedTexture(bakeBed(g.points, terrain, g.index));
    }
    setLake(true);
    setDry(hulls);
    UNDERWATER.uLakeNet.value = netTexture();
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420, 110, 110).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { ...waterU, uLakeBed: { value: bed }, uLake: UNDERWATER.uLake },
        vertexShader: lakeVert,
        fragmentShader: lakeFrag,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.surface.frustumCulled = false;
    this.stones = buildStones();
  }

  /**
   * Lite graphics: nothing under the water is patched (no fade, net of light, zones or wet sand, and no stones); the
   * surface veils what is under it by the depth there and draws the foam line itself.
   */
  setLite(on: boolean): void {
    this.lite = on;
    this.stones.visible = !on;
    const surface = this.surface.material as THREE.ShaderMaterial;
    if (on !== 'LAKE_LITE' in surface.defines) {
      if (on) surface.defines.LAKE_LITE = '';
      else delete surface.defines.LAKE_LITE;
      surface.needsUpdate = true;
    }
    // Nothing patches the bed in lite graphics, so it is flat-shaded again, as everywhere above the water.
    const bed = this.bedMat as THREE.MeshLambertMaterial;
    if (bed.flatShading !== on) {
      bed.flatShading = on;
      bed.needsUpdate = true;
    }
  }

  /** Each frame, after the water's own colours are set for the time of day (`night` 0..1). */
  update(night: number): void {
    const w = this.waterU;
    // The water's body: the lake's own colours leaning green, dimmed toward night as they are.
    this.near.copy(w.uShallow.value).lerp(scratch.copy(BODY_NEAR).multiplyScalar(1 - 0.75 * night), LAKE.green);
    this.far.copy(w.uDeep.value).lerp(scratch.copy(BODY_FAR).multiplyScalar(1 - 0.67 * night), LAKE.green);
    // The net of light fades with the sun: none by moonlight or lamplight, nor in lite graphics.
    const net = this.lite ? 0 : LAKE.caustics * Math.pow(Math.max(0, 1 - night * 1.25), 1.5);
    // The sun's ray bent down into the water (Snell's law, water 1.33): how far the net slides per metre of depth.
    const sun = w.uSunDir.value;
    const bx = sun.x * 0.75, bz = sun.z * 0.75;
    const down = Math.sqrt(Math.max(0.05, 1 - bx * bx - bz * bz));
    // Looked across, the lake's own colours leaning to the pale grey-blue the old surface showed over its pale bed.
    scratch.copy(PALE).multiplyScalar(1 - 0.75 * night);
    this.water.copy(w.uShallow.value).lerp(scratch, LAKE.pale.amount);
    this.deep.copy(w.uDeep.value).lerp(scratch, LAKE.pale.amount * 0.5);
    setUnderwater(w.uTime.value, net, this.near, this.far, this.water, this.deep, this.shift.set(bx / down, bz / down));
  }
}
