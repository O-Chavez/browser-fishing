import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOAT, FAR_CUT, NEAR_CUT, WAVES, boatMotion, gloomAt, hullHalfWidth, lightningAt, seaHeight, stormAt, waveAmp, type BoatMotion } from '../data/sea';
import { mulberry } from './env';

/**
 * The open sea around the charter boat. The boat stays still at the origin and this whole frame (the
 * swell, the low cloud and the distant headland) moves the opposite way to the boat's ride, so the
 * deck, players and drops need nothing special while the horizon heaves and rolls at eye height.
 *
 * Roughness follows the depth's mood (`seaMood`): 0 is the pond's sky over a choppy sea, 0.6 the
 * Drop-off's low cloud, fog, whitecaps and spray.
 */

/** Shared with the world's sky and pond water: daylight sets these once for everything. */
export interface SkyUniforms {
  uSkyH: { value: THREE.Color };
  uSkyT: { value: THREE.Color };
  uSunCol: { value: THREE.Color };
  uSunDir: { value: THREE.Vector3 };
  uFogColor: { value: THREE.Color };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uSunVis: { value: number };
}

const N = WAVES.length;

const seaVert = `
uniform float uTime; uniform vec4 uWa[${N}]; uniform vec4 uWb[${N}];
varying vec3 vWorld; varying vec3 vN; varying float vHc; varying float vHs; varying float vAtt;
void main(){
  vec3 p = position;
  float r = length(p.xz);
  float near = ${NEAR_CUT.keep.toFixed(3)} + ${(1 - NEAR_CUT.keep).toFixed(3)} * smoothstep(${NEAR_CUT.from.toFixed(1)}, ${NEAR_CUT.to.toFixed(1)}, r);
  float far = 1.0 - smoothstep(${FAR_CUT.from.toFixed(1)}, ${FAR_CUT.to.toFixed(1)}, r);
  float att = near * far;
  vec3 d = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0);
  float hc = 0.0, hs = 0.0;
  for (int i = 0; i < ${N}; i++) {
    // uWb.w: 1 for the chop, cut down near the boat; 0 for the long swell, which the boat rides whole.
    vec2 dir = uWa[i].xy; float k = uWa[i].z; float a = uWa[i].w * far * mix(1.0, near, uWb[i].w); float q = uWb[i].x;
    float ph = k * dot(dir, p.xz) - uWb[i].y * uTime + uWb[i].z;
    float c = cos(ph), s = sin(ph);
    d.xz += q * a * dir * c; d.y += a * s;
    if (uWb[i].w > 0.5) hc += a * s; else hs += a * s;
    n.xz -= dir * k * a * c; n.y -= q * k * a * s;
  }
  p += d;
  vHc = hc; vHs = hs; vAtt = att;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const seaFrag = `
uniform float uTime, uSunVis, uFoam, uAmpChop, uAmpSwell, uStorm, uFogNear, uFogFar, uLift;
uniform vec3 uShallow, uDeep, uSkyH, uSkyT, uSunCol, uSunDir, uFogColor, uFoamCol;
uniform vec2 uWind;
varying vec3 vWorld; varying vec3 vN; varying float vHc; varying float vHs; varying float vAtt;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  // A hole in the hull's outline (hullHalfWidth), up to the rails, so a swell can't show through the deck.
  float u = vWorld.x / ${BOAT.len.toFixed(1)} + 0.5;
  float hw = u < 0.5 ? 0.92 + 0.08 * sin(u * ${Math.PI.toFixed(5)}) : cos((u - 0.5) * ${Math.PI.toFixed(5)}) * 0.97 + 0.03;
  if (u > 0.0 && u < 1.0 && abs(vWorld.z) < ${BOAT.beam.toFixed(2)} * hw && vWorld.y < ${(BOAT.deck + 2.5).toFixed(2)}) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec3 n = normalize(vN);
  vec2 g = 0.025 * (1.0 - smoothstep(8.0, 45.0, dist)) * vec2(sin(vWorld.x*2.7+uTime*1.9) + sin(vWorld.z*4.1-uTime*1.3), cos(vWorld.z*3.1+uTime*1.6) + cos(vWorld.x*5.3+uTime*1.1));
  n = normalize(n + vec3(-g.x, 0.0, -g.y));
  // How high up its own wave this point is (0 trough, 1 crest): for the chop and for the long swell.
  float crest = clamp(vHc / max(uAmpChop, 0.01) * 0.5 + 0.5, 0.0, 1.0);
  float swellCrest = clamp(vHs / max(uAmpSwell, 0.01) * 0.5 + 0.5, 0.0, 1.0);
  vec3 base = mix(uShallow, uDeep, smoothstep(4.0, 90.0, dist));
  // Crests catch the light; uLift dims that at night.
  float lit = max(smoothstep(0.55, 1.0, crest), smoothstep(0.6, 1.0, swellCrest) * uStorm);
  base = mix(base, base * 1.3 + vec3(0.02, 0.06, 0.06) * uLift, lit * 0.6);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyH, uSkyT, pow(clamp(R.y, 0.0, 1.0), 0.6));
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 col = mix(base, sky, clamp(fres * 0.6 + 0.03, 0.0, 1.0));
  float sp = max(dot(R, uSunDir), 0.0);
  col += uSunCol * uSunVis * (pow(sp, 350.0) * 4.0 + pow(sp, 30.0) * 0.15);
  col += uSunCol * (1.0 - uSunVis) * pow(sp, 8.0) * 0.08;
  if (uFoam > 0.0) {
    vec2 fp = vWorld.xz;
    vec2 s2 = vec2(fp.x * 0.35, fp.y * 1.3);
    float nz = noise(s2 + vec2(uTime * 0.15, 0.0)) * 0.6 + noise(s2 * 3.1 - vec2(0.0, uTime * 0.3)) * 0.4;
    float th = 1.0 - uFoam * 0.3;
    float f = smoothstep(th, th + 0.07, crest + (nz - 0.5) * 0.5) * smoothstep(0.3, 0.6, noise(vec2(fp.x * 1.2, fp.y * 4.0) + 7.0));
    if (uStorm > 0.0) {
      // The storm: whitecaps breaking along the swell's crests, foam down its steep faces, and long
      // wind-blown streaks across the water.
      float slope = 1.0 - normalize(vN).y;
      float broken = smoothstep(0.42, 0.72, noise(fp * 0.45 + vec2(uTime * 0.2, 0.0)));
      float cap = smoothstep(0.9 - 0.12 * uStorm, 0.99, swellCrest + (nz - 0.5) * 0.3) * broken;
      float face = smoothstep(0.5 - 0.08 * uStorm, 0.7, slope + (nz - 0.5) * 0.2) * broken;
      vec2 along = vec2(dot(fp, uWind), dot(fp, vec2(-uWind.y, uWind.x)));
      float streak = smoothstep(0.62, 0.82, noise(along * vec2(0.05, 0.7) - vec2(uTime * 0.3, 0.0))) * smoothstep(0.35, 0.7, noise(fp * 0.12 + 3.0));
      f = max(f, uStorm * max(max(cap, face * 0.85), streak * 0.55));
    }
    col = mix(col, uFoamCol, f * mix(vAtt, 1.0, uStorm) * 0.92);
  }
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Rings of vertices that grow apart with distance: dense near the boat, sparse at the horizon. */
function radialGrid(segs: number, r0: number, growth: number, rMax: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const rings: number[] = [];
  for (let rad = r0; rad < rMax; rad *= growth) rings.push(rad);
  rings.push(rMax);
  for (let j = 0; j < rings.length; j++)
    for (let i = 0; i < segs; i++) {
      const a = ((i + (j % 2) * 0.5) / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rings[j], 0, Math.sin(a) * rings[j]);
    }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) idx.push(0, 1 + ((i + 1) % segs), 1 + i);
  for (let j = 0; j < rings.length - 1; j++)
    for (let i = 0; i < segs; i++) {
      const a = 1 + j * segs + i, b = 1 + j * segs + ((i + 1) % segs);
      const c = 1 + (j + 1) * segs + i, d = 1 + (j + 1) * segs + ((i + 1) % segs);
      if (j % 2 === 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** Strips a geometry to positions plus one float attribute, ready to merge. */
function bare(geo: THREE.BufferGeometry, name: string, value: (y: number, i: number) => number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  const p = g.getAttribute('position');
  const a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = value(p.getY(i), i);
  g.setAttribute(name, new THREE.BufferAttribute(a, 1));
  return g;
}

const fogGLSL = `col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld)));`;

/** Low cloud: flat-bottomed puffs all around, darker underneath, merged into one draw (~5k triangles). */
function lowCloud(u: SkyUniforms & { uTop: { value: THREE.Color }; uBot: { value: THREE.Color }; uShow: { value: number } }): THREE.Mesh {
  const rnd = mulberry(11);
  const parts: THREE.BufferGeometry[] = [];
  const flat = 0.5;
  for (let i = 0; i < 46; i++) {
    const n = 4 + Math.floor(rnd() * 4);
    const a = rnd() * Math.PI * 2;
    const d = 60 + rnd() * 240;
    const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = 30 + rnd() * 25;
    const size = 1.6;
    for (let k = 0; k < n; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
      const sx = (10 + rnd() * 12) * size, sy = (4 + rnd() * 4) * size, sz = (8 + rnd() * 6) * size;
      const ox = (k - n / 2) * 11 * size + rnd() * 4, oy = rnd() * 3, oz = rnd() * 6;
      const pos = geo.getAttribute('position');
      const turn = a + Math.PI / 2;
      for (let v = 0; v < pos.count; v++) {
        const y = Math.max(pos.getY(v), -flat);
        const lx = pos.getX(v) * sx + ox, lz = pos.getZ(v) * sz + oz;
        pos.setXYZ(v, cx + lx * Math.cos(turn) - lz * Math.sin(turn), cy + y * sy + oy, cz + lx * Math.sin(turn) + lz * Math.cos(turn));
      }
      // 0 at the flat underside, 1 at the top.
      parts.push(bare(geo, 'shade', (y) => THREE.MathUtils.clamp((y - cy + flat * sy) / ((1 + flat) * sy + 3), 0, 1)));
    }
  }
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: `attribute float shade; varying float vShade; varying vec3 vWorld;
      void main(){ vShade = shade; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uTop, uBot, uFogColor; uniform float uShow, uFogNear, uFogFar; varying float vShade; varying vec3 vWorld;
      void main(){ vec3 col = mix(uFogColor, mix(uBot, uTop, pow(max(vShade, 0.0), 0.7)), uShow); ${fogGLSL}
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(mergeGeometries(parts)!, mat);
}

/** The Shelf's distant headland and lighthouse, off the starboard bow; it fades into the haze as the dive goes deeper. */
function headland(u: SkyUniforms & { uFade: { value: number }; uNight: { value: number } }): THREE.Mesh {
  const rnd = mulberry(5);
  const parts: THREE.BufferGeometry[] = [];
  const col = (geo: THREE.BufferGeometry, hex: number, glow = 0) => {
    const c = new THREE.Color(hex);
    const g = bare(geo, 'glow', () => glow);
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(a, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    parts.push(g);
  };
  // Behind the players, past the port rail: they fish facing open sea (-z), away from land.
  const base = -0.45;
  for (let i = 0; i < 9; i++) {
    const a = base + (i / 8) * 0.55;
    const d = 330 + rnd() * 40;
    const hill = new THREE.ConeGeometry(30 + rnd() * 30, 14 + rnd() * 18 + (i > 2 && i < 7 ? 10 : 0), 6, 1);
    hill.translate(Math.sin(a) * d, 4, Math.cos(a) * d);
    col(hill, 0x56795a);
    const beach = new THREE.CylinderGeometry(34, 40, 6, 7);
    beach.translate(Math.sin(a) * (d - 20), 0, Math.cos(a) * (d - 20));
    col(beach, 0xb8a77d);
  }
  const la = base + 0.5, ld = 300;
  const lx = Math.sin(la) * ld, lz = Math.cos(la) * ld;
  const put = (g: THREE.BufferGeometry, y: number) => g.translate(lx, y, lz);
  col(put(new THREE.CylinderGeometry(9, 12, 8, 7), 4), 0x6e6a64);
  col(put(new THREE.CylinderGeometry(1.6, 2.4, 16, 8), 16), 0xf4f1ea);
  col(put(new THREE.CylinderGeometry(2.0, 2.15, 4, 8), 14), 0xd9483b);
  col(put(new THREE.ConeGeometry(2.4, 3, 8), 26), 0xd9483b);
  col(put(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 8), 23.6), 0xfff0b0, 1);
  const mat = new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexColors: true,
    vertexShader: `attribute float glow; varying vec3 vCol; varying float vGlow;
      void main(){ vCol = color; vGlow = glow; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    // Haze is baked in rather than fogged: the land sits past the fog's far edge.
    fragmentShader: `uniform vec3 uFogColor; uniform float uFade, uNight; varying vec3 vCol; varying float vGlow;
      void main(){
        vec3 col = vCol * mix(1.0 - 0.75 * uNight, 1.0 + uNight, vGlow);
        col = mix(col, uFogColor, mix(0.45, 1.0, uFade) * (1.0 - vGlow * uNight * 0.6));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(mergeGeometries(parts)!, mat);
}

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Soft round sprite for the spray. */
function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

const seaUniforms = (sky: SkyUniforms) => ({
  ...sky,
  uTime: { value: 0 },
  uWa: { value: WAVES.map((w) => new THREE.Vector4(w.dx, w.dz, w.k, 0)) },
  uWb: { value: WAVES.map((w) => new THREE.Vector4(0, w.w, w.ph, w.cut ? 1 : 0)) },
  uAmpChop: { value: 1 },
  uAmpSwell: { value: 1 },
  uStorm: { value: 0 },
  uWind: { value: new THREE.Vector2(Math.sin((35 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180)) },
  uShallow: { value: new THREE.Color() },
  uDeep: { value: new THREE.Color() },
  uFoamCol: { value: new THREE.Color() },
  uFoam: { value: 0 },
  uLift: { value: 1 },
});
const cloudUniforms = (sky: SkyUniforms) => ({ ...sky, uTop: { value: new THREE.Color() }, uBot: { value: new THREE.Color() }, uShow: { value: 0 } });
const landUniforms = (sky: SkyUniforms) => ({ ...sky, uFade: { value: 0 }, uNight: { value: 0 } });

const SPRAY = 420;
/** The open sea at night leans toward a deep blue rather than the pond's teal. */
const NIGHT_SEA = new THREE.Color(0x07121f);

/** Bow spray: droplets thrown off both sides of the bow as it digs in, blown aft along the rails. */
class Spray {
  readonly points: THREE.Points;
  private pos = new Float32Array(SPRAY * 3);
  private vel = new Float32Array(SPRAY * 3);
  private life = new Float32Array(SPRAY);
  private next = 0;
  private owed = 0;
  private rnd = mulberry(9);

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: dotTexture(), size: 0.11, color: 0xf4f8fa, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.pos.fill(-100);
  }

  /** `rate`: droplets a second; the bow's sink speed (m/s) adds bursts. */
  update(dt: number, rate: number, sink: number): void {
    const r = this.rnd;
    this.owed += dt * rate * (0.4 + 2.5 * Math.max(0, sink));
    while (this.owed >= 1) {
      this.owed -= 1;
      const i = this.next;
      this.next = (this.next + 1) % SPRAY;
      const side = r() < 0.5 ? -1 : 1;
      const x = BOAT.len / 2 - 0.8 - r() * 1.8;
      this.pos.set([x, BOAT.deck + 0.2 + r() * 0.5, side * (hullHalfWidth(x) + 0.1 + r() * 0.3)], i * 3);
      this.vel.set([-1.5 - r() * 2.5, 2 + r() * 3, side * (1 + r() * 1.5)], i * 3);
      this.life[i] = 0.9 + r() * 0.6;
    }
    for (let i = 0; i < SPRAY; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 9.8 * dt;
      // Wind carries it aft.
      this.vel[k] -= 3 * dt;
      for (let a = 0; a < 3; a++) this.pos[k + a] += this.vel[k + a] * dt;
      if (this.life[i] <= 0 || this.pos[k + 1] < -0.5) {
        this.life[i] = 0;
        this.pos[k + 1] = -100;
      }
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

const DRIFT = 700;
/** The way the storm blows: along the long swell. */
const WIND = new THREE.Vector2(Math.sin((35 * Math.PI) / 180), Math.cos((35 * Math.PI) / 180));

/** Spindrift: spray the wind tears off the swell's crests all around the boat, in the sea's frame. */
class Spindrift {
  readonly points: THREE.Points;
  private pos = new Float32Array(DRIFT * 3);
  private vel = new Float32Array(DRIFT * 3);
  private life = new Float32Array(DRIFT);
  private next = 0;
  private owed = 0;
  private rnd = mulberry(17);

  constructor(tex: THREE.Texture) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({ map: tex, size: 0.5, color: 0xeef2f5, transparent: true, opacity: 0.75, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.pos.fill(-100);
  }

  update(dt: number, t: number, mood: number, storm: number, crestAt: number): void {
    const r = this.rnd;
    this.owed += dt * 900 * storm;
    let tries = 0;
    while (this.owed >= 1 && tries++ < 400) {
      // A spot 8-70 m out; only crests throw spindrift.
      const a = r() * Math.PI * 2;
      const d = 8 + Math.sqrt(r()) * 62;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = seaHeight(x, z, t, mood);
      if (h < crestAt) continue;
      this.owed -= 1;
      const i = this.next;
      this.next = (this.next + 1) % DRIFT;
      const v = 4 + r() * 7;
      this.pos.set([x + (r() - 0.5) * 2, h + 0.1, z + (r() - 0.5) * 2], i * 3);
      this.vel.set([WIND.x * v, 1 + r() * 3, WIND.y * v], i * 3);
      this.life[i] = 0.8 + r() * 1.0;
    }
    this.owed = Math.min(this.owed, 50);
    for (let i = 0; i < DRIFT; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 5 * dt;
      for (let c = 0; c < 3; c++) this.pos[k + c] += this.vel[k + c] * dt;
      if (this.life[i] <= 0) this.pos[k + 1] = -100;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/**
 * Lightning in the Abyss: a forked bolt out on the water every few seconds, more often the deeper,
 * flickering two or three times. `flash` (0..1) lights the sky, and with it the sea's reflections.
 */
class Lightning {
  readonly group = new THREE.Group();
  /** How bright the sky is lit right now. */
  flash = 0;
  private mat = new THREE.MeshBasicMaterial({ color: 0xf4f0ff, fog: false });
  private bolt: THREE.Mesh | null = null;
  private age = Infinity;
  private timer = 2;
  private rnd = mulberry(23);
  /** Called with each strike's distance in metres, for the thunder. */
  onStrike?: (dist: number) => void;

  update(dt: number, level: number): void {
    this.age += dt;
    if (level > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.strike();
        this.timer = (12 - 9 * level) * (0.5 + this.rnd());
      }
    }
    // Three flickers in the first 0.4 s, then a fading afterglow.
    const a = this.age;
    const on = a < 0.08 || (a > 0.14 && a < 0.2) || (a > 0.3 && a < 0.4);
    if (this.bolt) this.bolt.visible = on;
    this.flash = on ? 1 : Math.max(0, this.flash - dt * 4);
  }

  /** Throws a bolt now, at `bearing` (atan2 of z, x) if given; mostly over the open sea players face (-z). */
  strike(bearing?: number): void {
    const r = this.rnd;
    if (this.bolt) {
      this.group.remove(this.bolt);
      this.bolt.geometry.dispose();
    }
    const a = bearing ?? (r() < 0.7 ? -Math.PI * (0.15 + 0.7 * r()) : r() * Math.PI * 2);
    const d = 90 + r() * 110;
    const parts: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const seg = (p: THREE.Vector3, q: THREE.Vector3, w: number) => {
      const dir = q.clone().sub(p);
      const g = new THREE.BoxGeometry(w, dir.length(), w);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
      g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      parts.push(g);
    };
    const fork = (from: THREE.Vector3, steps: number, w: number, drop: number) => {
      let p = from;
      for (let i = 0; i < steps && p.y > 0; i++) {
        const q = p.clone().add(new THREE.Vector3((r() - 0.5) * 14, -drop * (0.7 + r() * 0.6), (r() - 0.5) * 14));
        q.y = Math.max(0, q.y);
        seg(p, q, w);
        if (w > 1.2 && r() < 0.3) fork(q, 4, w * 0.5, drop * 0.8);
        p = q;
      }
    };
    fork(new THREE.Vector3(Math.cos(a) * d, 75, Math.sin(a) * d), 13, 3, 8);
    this.bolt = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()))!, this.mat);
    this.bolt.frustumCulled = false;
    this.group.add(this.bolt);
    this.age = 0;
    this.onStrike?.(d);
  }
}

export class Sea {
  /** The sea's own frame: moves opposite to the boat's ride. */
  readonly frame = new THREE.Group();
  /** Things fixed to the boat: the spray. */
  readonly onBoat = new THREE.Group();
  readonly motion: BoatMotion = { heave: 0, pitch: 0, roll: 0 };
  /** The sea frame's rotation (the boat's, reversed), for the sky to tilt with. */
  readonly tilt = new THREE.Quaternion();
  private u: ReturnType<typeof seaUniforms>;
  private cloudU: ReturnType<typeof cloudUniforms>;
  private landU: ReturnType<typeof landUniforms>;
  private clouds: THREE.Mesh;
  private land: THREE.Mesh;
  private spray = new Spray();
  private drift = new Spindrift(dotTexture());
  readonly lightning = new Lightning();
  private lastBow = 0;
  /** How fast the bow is dropping into the water (m/s), for the spray on the screen. */
  slam = 0;
  /** The long swell's height right now, for the wash of the waves. */
  swell = 0;
  private boatM = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private mood = 0;
  private t = 0;

  constructor(sky: SkyUniforms) {
    this.u = seaUniforms(sky);
    const water = new THREE.Mesh(
      radialGrid(96, 0.4, 1.06, 1100),
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: seaVert, fragmentShader: seaFrag }),
    );
    water.frustumCulled = false;
    this.cloudU = cloudUniforms(sky);
    this.clouds = lowCloud(this.cloudU);
    this.landU = landUniforms(sky);
    this.land = headland(this.landU);
    this.frame.matrixAutoUpdate = false;
    this.frame.add(water, this.clouds, this.land, this.drift.points, this.lightning.group);
    this.onBoat.add(this.spray.points);
  }

  /** Spray is see-through overdraw near the eye; lite graphics drops it. */
  setLite(on: boolean): void {
    this.spray.points.visible = !on;
    this.lite = on;
  }
  private lite = false;

  /**
   * Water, cloud and land colours for the time of day and mood. `n`: nightness, `tw`: twilight,
   * `base`: the location's water and deep colours.
   */
  setColors(n: number, tw: number, base: { water: THREE.Color; deep: THREE.Color }): void {
    const m = Math.min(1, this.mood);
    const gloom = 1 - 0.35 * gloomAt(this.mood);
    const u = this.u;
    const dim = (h: number, k: number) => new THREE.Color(h).multiplyScalar(k);
    // A touch darker than the pond's water at night, for atmosphere out on open sea.
    u.uShallow.value.copy(base.water).multiplyScalar(1 - 0.9 * n).lerp(NIGHT_SEA, 0.45 * n).lerp(dim(0x3f6674, 1 - 0.75 * n), Math.min(1, m * 1.4)).multiplyScalar(gloom);
    u.uDeep.value.copy(base.deep).multiplyScalar(1 - 0.88 * n).lerp(NIGHT_SEA, 0.3 * n).lerp(dim(0x2a3a4e, 1 - 0.67 * n), Math.min(1, m * 1.4)).multiplyScalar(gloom);
    u.uFoamCol.value.set(0xf6f4f2).multiplyScalar(1 - 0.72 * n);
    u.uLift.value = 1 - 0.85 * n;
    const cloud = new THREE.Color(0xffffff).lerp(new THREE.Color(0x26304f), n).lerp(new THREE.Color(0xffb890), tw * 0.5);
    this.cloudU.uTop.value.copy(cloud).lerp(dim(0xc4bac6, 1 - 0.7 * n), m).multiplyScalar(gloom);
    this.cloudU.uBot.value.copy(cloud).multiplyScalar(0.93).lerp(dim(0x8a8094, 1 - 0.7 * n), m).multiplyScalar(gloom * gloom);
    this.landU.uNight.value = n;
  }

  update(t: number, dt: number, mood: number): void {
    this.t = t;
    this.mood = mood;
    const u = this.u;
    u.uTime.value = t;
    const sharp = 0.5 + 0.5 * Math.min(1, mood);
    let chop = 0;
    let swell = 0;
    WAVES.forEach((w, i) => {
      const a = waveAmp(w, mood);
      if (w.cut) chop += a;
      else swell += a;
      u.uWa.value[i].w = a;
      // Gerstner steepness per wave, kept below the point where crests fold over.
      u.uWb.value[i].x = a > 1e-4 ? (w.steep * sharp) / (w.k * a * N) : 0;
    });
    u.uAmpChop.value = chop;
    u.uAmpSwell.value = swell;
    this.swell = swell;
    u.uStorm.value = stormAt(mood);
    u.uFoam.value = 0.15 + 0.65 * Math.min(1, mood) + 0.2 * stormAt(mood);

    // Clear Shelf nights keep their stars; the low cloud rolls in toward the Drop-off.
    const show = smooth(0.35, 0.65, mood);
    this.cloudU.uShow.value = show;
    this.clouds.visible = show > 0;
    this.clouds.rotation.y = t * 0.002;
    const fade = smooth(0, 0.35, mood);
    this.landU.uFade.value = fade;
    this.land.visible = fade < 1;

    const mo = boatMotion(t, mood, this.motion);
    this.boatM.makeRotationFromEuler(new THREE.Euler(mo.roll, 0, mo.pitch, 'YXZ')).setPosition(0, mo.heave, 0);
    this.frame.matrix.copy(this.boatM).invert();
    this.frame.matrixWorldNeedsUpdate = true;
    this.tilt.setFromRotationMatrix(this.frame.matrix);

    // The bow's height relative to the water under it: when it drops into a wave, spray flies.
    const bow = mo.heave + mo.pitch * (BOAT.len * 0.45) - seaHeight(BOAT.len * 0.45, 0, t, mood);
    const sink = dt > 0 ? (this.lastBow - bow) / dt : 0;
    this.lastBow = bow;
    this.slam = sink;
    // Tons of spray in the deep: three times the Drop-off's by the Abyss, in bigger drops.
    const storm = stormAt(mood);
    (this.spray.points.material as THREE.PointsMaterial).size = 0.11 + 0.09 * storm;
    if (this.spray.points.visible) this.spray.update(dt, 90 * smooth(0.3, 1.1, mood) * (1 + 2 * Math.max(0, mood - 1)), sink);
    // Spindrift off the swell's crests (half the rate in lite graphics).
    this.drift.points.visible = storm > 0;
    if (storm > 0) this.drift.update(dt, t, mood, storm * (this.lite ? 0.5 : 1), 0.45 * swell + 0.3);
    this.lightning.update(dt, lightningAt(mood));
  }

  /** World height of the water at (x, z): the swell, carried by the sea's frame. */
  surface(x: number, z: number): number {
    const h = seaHeight(x, z, this.t, this.mood);
    return this.tmp.set(x, h, z).applyMatrix4(this.frame.matrix).y;
  }
}
