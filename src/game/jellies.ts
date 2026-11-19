import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JELLIES, jelliesAt, jellyLight, jellyRises, jellyUp } from '../data/sea';
import { mulberry } from './env';
import { WAVE_GLSL, waveSurface, type WaveUniforms } from './seawaves';

/**
 * The Twilight's lantern jellies (`JELLIES`): little glowing jellies bobbing on the swell at night, domes just breaking
 * the water, each with a bright heart, a soft halo and a pool of light on the water round it. A ring of them near the
 * boat, and the nearest of the field past it, show their bells; further out the field is halos and pools, carrying on
 * toward the horizon. They go by in lanes as the boat makes its way through the field, bow to stern, each coming round
 * again past its ring's rim, where it has faded out.
 *
 * Four draws however many there are: the bells (instanced), and the halos, the pools and the legs trailing on the
 * water behind each bell (instanced discs and strips that ride the waves in their own vertex shaders, `WAVE_GLSL`, so
 * they sit exactly on the drawn water). Each frame only the jellies showing are packed into them.
 */

type JellyUniforms = WaveUniforms & { uFogColor: { value: THREE.Color }; uFogNear: { value: number }; uFogFar: { value: number } };

const TAU = Math.PI * 2;
/** How fast a jelly breathes (radians a second). */
const PULSE = 1.6;
/** The hull's footprint on the water (half length, half beam, m), where jellies fade out: the water has a hole there. */
const HULL = [8, 3.6];
/** How the field goes by the boat (m/s, sea x and z): the boat's way through it, bow to stern, plus the water's drift. */
const passing = (): [number, number] => [JELLIES.current[0] - JELLIES.sail, JELLIES.current[1]];
/** The day jellies' lanes run this many times past their ring, so only one or two go by at a time. */
const DAY_LANE = 4;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** GLSL: a linear colour into the screen's sRGB, as three's output conversion does it. */
const SRGB_GLSL = `vec3 toSRGB(vec3 c){ return mix(c * 12.92, pow(max(c, 0.0), vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c)); }`;

/** A soft round glow, for the halos and the pools. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A small jelly like the Twilight set's: a bell, a lighter inner bell, a rim and a bright heart. Bell radius 1, its
 * base at y 0. `tone` per vertex: brightness, how far toward the heart's lighter colour, and opacity.
 */
function bellGeometry(): THREE.BufferGeometry {
  const part = (g: THREE.BufferGeometry, y: number, rx: number, s: [number, number, number], k: number, heart: number, alpha: number) => {
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(0, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(...s)));
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const tone = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) tone.set([k, heart, alpha], i * 3);
    g.setAttribute('tone', new THREE.BufferAttribute(tone, 3));
    return g;
  };
  const half = Math.PI / 2;
  const parts = [
    part(new THREE.SphereGeometry(1, 14, 5, 0, TAU, 0, half), 0, 0, [1, 0.75, 1], 1, 0, 0.7),
    part(new THREE.SphereGeometry(0.62, 10, 3, 0, TAU, 0, half), 0, 0, [1, 0.7, 1], 1, 1, 0.35),
    part(new THREE.TorusGeometry(0.97, 0.08, 3, 18), 0.02, half, [1, 1, 1], 1.35, 0, 0.95),
    part(new THREE.SphereGeometry(0.26, 6, 4), 0.26, 0, [1, 1, 1], 1.25, 1, 1),
  ];
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

/**
 * A disc 1 across on the water (y up), in `rings` rings of `segs` points, for a pool to bend over the waves (and, one
 * ring, for a halo). Round rather than square: the glow is round, and a square's corners were drawn for nothing.
 */
function poolDisc(rings: number, segs: number): THREE.BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const uv: number[] = [0.5, 0.5];
  const idx: number[] = [];
  for (let r = 1; r <= rings; r++)
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU, d = (0.5 * r) / rings;
      pos.push(Math.cos(a) * d, 0, Math.sin(a) * d);
      uv.push(0.5 + Math.cos(a) * d, 0.5 - Math.sin(a) * d);
    }
  const at = (r: number, i: number) => (r ? 1 + (r - 1) * segs + (i % segs) : 0);
  for (let i = 0; i < segs; i++) idx.push(0, at(1, i + 1), at(1, i));
  for (let r = 1; r < rings; r++)
    for (let i = 0; i < segs; i++) idx.push(at(r, i), at(r, i + 1), at(r + 1, i + 1), at(r, i), at(r + 1, i + 1), at(r + 1, i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/**
 * One jelly's legs, as strips lying on the water: `JELLIES.legs.threads` threads fanned round the back of the rim and
 * `arms` frilly arms down the middle, each `seg` segments long. Where everything goes is worked out in the shader, from
 * `aLegA` (how far along, which edge, where round the rim the root is, and how far the strip fans out) and `aLegB`
 * (length in bell widths, width at the root, brightness, and how far out from the middle the root is, in radii).
 */
function legGeometry(seg: number): THREE.BufferGeometry {
  const L = JELLIES.legs;
  const a: number[] = [];
  const b: number[] = [];
  const idx: number[] = [];
  const strip = (root: number, fan: number, len: number, width: number, glow: number, from: number) => {
    const v0 = a.length / 4;
    for (let k = 0; k <= seg; k++)
      for (const side of [-1, 1]) {
        a.push(k / seg, side, root, fan);
        b.push(len, width, glow, from);
      }
    for (let k = 0; k < seg; k++) {
      const v = v0 + k * 2;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  };
  // Threads from round the back of the rim, spreading a little as they stream out behind (bundled, they stacked into one
  // bright line seen from low down); lengths spread, longest down the middle.
  for (let k = 0; k < L.threads; k++) {
    const u = L.threads > 1 ? k / (L.threads - 1) - 0.5 : 0;
    const len = L.length[0] + (L.length[1] - L.length[0]) * (1 - Math.abs(u) * 1.6) * (0.75 + 0.25 * ((k * 5) % 3) / 2);
    strip(u * 1.7, u * 0.14, Math.max(L.length[0], len), L.width, L.glow, 0.7);
  }
  // Frilly arms from near the middle.
  for (let k = 0; k < L.arms; k++) {
    const u = L.arms > 1 ? k / (L.arms - 1) - 0.5 : 0;
    strip(u * 1.2, u * 0.16, L.armLength[0] + (L.armLength[1] - L.armLength[0]) * (1 - Math.abs(u)), L.armWidth, L.armGlow, 0.15);
  }
  const g = new THREE.BufferGeometry();
  // Positions are all worked out in the shader; three still wants the attribute for the vertex count.
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((a.length / 4) * 3), 3));
  g.setAttribute('aLegA', new THREE.Float32BufferAttribute(a, 4));
  g.setAttribute('aLegB', new THREE.Float32BufferAttribute(b, 4));
  g.setIndex(idx);
  return g;
}

/** Uploads only the first `n` items of a buffer this frame: the ones packed to the front to be drawn. */
function sendFirst(at: THREE.BufferAttribute, n: number): void {
  at.clearUpdateRanges();
  at.addUpdateRange(0, n * at.itemSize);
  at.needsUpdate = true;
}

/** One jelly: the lane it drifts along (`o` metres off the boat, across the current), and how it looks. */
interface Jelly {
  o: number;
  /** Where along its lane it starts, half the lane's length (it comes round at either end), and its speed (m/s). */
  s0: number;
  half: number;
  speed: number;
  /** How far it wanders off its line, how fast and in what phase. */
  wander: number;
  wf: [number, number];
  wp: [number, number];
  size: number;
  col: THREE.Color;
  ph: number;
  rise: number;
  ring: [number, number];
}

export class Jellies {
  readonly group = new THREE.Group();
  private jellies: Jelly[] = [];
  private nearN: number;
  /** Bell slots: every near jelly, and the far ones within `JELLIES.far.bells` metres, up to this many. */
  private bellN: number;
  private active: number;
  private bells: THREE.InstancedMesh;
  private bellCol: THREE.InstancedBufferAttribute;
  private halos: THREE.Mesh;
  private pools: THREE.Mesh;
  private haloGeo: THREE.InstancedBufferGeometry;
  private poolGeo: THREE.InstancedBufferGeometry;
  /** Per jelly: its rest point on the water (x, z), size and pulse (0..1); and its colour and glow. */
  private spot: THREE.InstancedBufferAttribute;
  private light: THREE.InstancedBufferAttribute;
  private legs: THREE.Mesh;
  private legGeo: THREE.InstancedBufferGeometry;
  /** Per jelly with legs: its rest point (x, z), size and heading (radians); its colour and glow; its pulse's phase. */
  private legSpot: THREE.InstancedBufferAttribute;
  private legLight: THREE.InstancedBufferAttribute;
  private legPh: THREE.InstancedBufferAttribute;
  private lite = false;
  // Scratch, so a frame allocates nothing.
  private p = new THREE.Vector3();
  private n = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  private static UP = new THREE.Vector3(0, 1, 0);

  constructor(private u: JellyUniforms) {
    this.nearN = this.build();
    this.bellN = this.nearN + JELLIES.far.bellCap;
    const total = this.jellies.length;
    this.active = total;
    const tex = glowTexture();

    this.spot = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.light = new THREE.InstancedBufferAttribute(new Float32Array(total * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const shared = {
      uTime: u.uTime,
      uWa: u.uWa,
      uWb: u.uWb,
      uFogNear: u.uFogNear,
      uFogFar: u.uFogFar,
      uMap: { value: tex },
      uFloor: { value: JELLIES.floor },
    };

    // The halos: a camera-facing glow over each jelly, a little above the water (a round patch, like the pools).
    this.haloGeo = new THREE.InstancedBufferGeometry().copy(poolDisc(1, 12) as THREE.InstancedBufferGeometry);
    this.haloGeo.setAttribute('aSpot', this.spot);
    this.haloGeo.setAttribute('aLight', this.light);
    this.halos = new THREE.Mesh(
      this.haloGeo,
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uHalo: { value: JELLIES.halo }, uFarHalo: { value: JELLIES.farHalo }, uFarGlow: { value: JELLIES.farGlow } },
        vertexShader: `${WAVE_GLSL}
          ${SRGB_GLSL}
          attribute vec4 aSpot; attribute vec4 aLight;
          uniform float uHalo, uFarHalo, uFarGlow, uFloor, uFogNear, uFogFar;
          varying vec2 vUv; varying vec3 vCol; varying float vA;
          void main(){
            vec3 d, n; float hc, hs, att;
            seaWaves(aSpot.xy, d, n, hc, hs, att);
            vec4 w = modelMatrix * vec4(aSpot.x + d.x, d.y + aSpot.z * 0.3, aSpot.y + d.z, 1.0);
            float dist = length(cameraPosition - w.xyz);
            // Far off, where there is no bell to see, a halo grows and brightens to stand in for it, and fades toward the
            // fog but keeps some of its light.
            float size = aSpot.z * 3.2 * mix(1.0, uFarHalo, smoothstep(${JELLIES.far.bells.toFixed(1)}, 220.0, dist));
            vA = uHalo * (0.3 + 0.25 * aSpot.w) * aLight.w * mix(1.0, uFarGlow, smoothstep(${(JELLIES.far.bells * 0.6).toFixed(1)}, ${(JELLIES.far.bells * 1.4).toFixed(1)}, dist)) * mix(uFloor, 1.0, 1.0 - smoothstep(uFogNear, uFogFar * 1.4, dist));
            // Into the screen's sRGB here, once a jelly rather than for every pixel of its halo.
            vCol = toSRGB(aLight.rgb);
            vUv = uv;
            vec4 mv = viewMatrix * w;
            mv.xy += vec2(position.x, -position.z) * size;
            gl_Position = vA < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
          }`,
        fragmentShader: `uniform sampler2D uMap; varying vec2 vUv; varying vec3 vCol; varying float vA;
          void main(){
            gl_FragColor = vec4(vCol, texture2D(uMap, vUv).a * vA);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.halos.renderOrder = 5;

    // The pools: a patch of light on the water round each jelly, moved by the water's own waves so it rides them exactly.
    this.poolGeo = new THREE.InstancedBufferGeometry().copy(poolDisc(JELLIES.poolRings, 12) as THREE.InstancedBufferGeometry);
    this.poolGeo.setAttribute('aSpot', this.spot);
    this.poolGeo.setAttribute('aLight', this.light);
    this.pools = new THREE.Mesh(
      this.poolGeo,
      new THREE.ShaderMaterial({
        uniforms: { ...shared, uPool: { value: JELLIES.pool } },
        vertexShader: `${WAVE_GLSL}
          attribute vec4 aSpot; attribute vec4 aLight;
          uniform float uPool;
          varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying float vA;
          void main(){
            vec2 p = aSpot.xy + position.xz * aSpot.z * 6.0;
            vec3 d, n; float hc, hs, att;
            seaWaves(p, d, n, hc, hs, att);
            vec4 w = modelMatrix * vec4(p.x + d.x, d.y + 0.04, p.y + d.z, 1.0);
            vWorld = w.xyz;
            vN = mat3(modelMatrix) * n;
            vUv = uv;
            vCol = aLight.rgb;
            // Pools stop at far.pools metres out, where the halo carries the jelly on its own.
            vA = uPool * (0.6 + 0.3 * aSpot.w) * aLight.w * (1.0 - smoothstep(${(JELLIES.far.pools * 0.8).toFixed(1)}, ${JELLIES.far.pools.toFixed(1)}, length(aSpot.xy)));
            gl_Position = vA < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
          }`,
        // Light from just under the surface: weaker where the water mirrors the sky.
        fragmentShader: `uniform sampler2D uMap; uniform float uFogNear, uFogFar, uFloor;
          varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying float vA;
          void main(){
            vec3 V = normalize(cameraPosition - vWorld);
            float ndv = max(dot(normalize(vN), V), 0.0);
            float fres = pow(1.0 - ndv, 3.0);
            float dist = length(cameraPosition - vWorld);
            float fade = mix(uFloor, 1.0, 1.0 - smoothstep(uFogNear, uFogFar * 1.4, dist));
            // Seen low across the water a pool would smear into a long streak: it fades there, as the water mirrors the sky.
            float edgeOn = smoothstep(${JELLIES.grazing.pools[0].toFixed(3)}, ${JELLIES.grazing.pools[1].toFixed(3)}, ndv);
            gl_FragColor = vec4(vCol * texture2D(uMap, vUv).a * vA * fade * (1.0 - 0.255 * fres) * edgeOn, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    this.pools.renderOrder = 3;

    // The bells.
    const bellGeo = bellGeometry();
    this.bellCol = new THREE.InstancedBufferAttribute(new Float32Array(this.bellN * 4), 4).setUsage(THREE.DynamicDrawUsage);
    bellGeo.setAttribute('aBell', this.bellCol);
    this.bells = new THREE.InstancedMesh(
      bellGeo,
      new THREE.ShaderMaterial({
        uniforms: { uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar },
        // The fog and the screen's sRGB are worked out per vertex: a bell is small, and its pixels are the cost on phones.
        vertexShader: `${SRGB_GLSL}
          attribute vec3 tone; attribute vec4 aBell;
          uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
          varying vec4 vCol;
          void main(){
            vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
            // The heart is lighter, toward white at night; by day, when the bell is dimmed, toward the dimmed white.
            vec3 col = mix(aBell.rgb, vec3(max(aBell.r, max(aBell.g, aBell.b))), 0.35 * tone.y) * tone.x;
            col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, length(cameraPosition - w.xyz)));
            vCol = vec4(toSRGB(col), tone.z * aBell.a);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: `varying vec4 vCol;
          void main(){ gl_FragColor = vCol; }`,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        // Both faces in one pass rather than the insides first: on phones the second pass cost as much as the rest.
        forceSinglePass: true,
      }),
      this.bellN,
    );
    this.bells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bells.renderOrder = 4;

    // The legs: threads and frilly arms trailing on the water behind each jelly with a bell, riding the waves like
    // the pools, a ripple running down them.
    const L = JELLIES.legs;
    this.legSpot = new THREE.InstancedBufferAttribute(new Float32Array(this.bellN * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.legLight = new THREE.InstancedBufferAttribute(new Float32Array(this.bellN * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.legPh = new THREE.InstancedBufferAttribute(new Float32Array(this.bellN), 1).setUsage(THREE.DynamicDrawUsage);
    this.legGeo = new THREE.InstancedBufferGeometry().copy(legGeometry(JELLIES.legs.segments) as THREE.InstancedBufferGeometry);
    this.legGeo.setAttribute('aJelly', this.legSpot);
    this.legGeo.setAttribute('aLight', this.legLight);
    this.legGeo.setAttribute('aPh', this.legPh);
    this.legs = new THREE.Mesh(
      this.legGeo,
      new THREE.ShaderMaterial({
        uniforms: { uTime: u.uTime, uWa: u.uWa, uWb: u.uWb, uFogNear: u.uFogNear, uFogFar: u.uFogFar, uFloor: { value: JELLIES.floor }, uHalo: { value: JELLIES.halo } },
        vertexShader: `${WAVE_GLSL}
          ${SRGB_GLSL}
          attribute vec4 aLegA; attribute vec4 aLegB; attribute vec4 aJelly; attribute vec4 aLight; attribute float aPh;
          uniform float uHalo, uFloor, uFogNear, uFogFar;
          varying vec3 vCol; varying float vA; varying float vSide;
          vec2 turn(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(v.x * c - v.y * s, v.x * s + v.y * c); }
          void main(){
            float s = aLegA.x, size = aJelly.z;
            // Each strip a little different on each jelly.
            float rnd = fract(sin(dot(vec2(aLegA.z * 7.13 + aLegA.w * 3.7 + aLegB.w, aPh), vec2(12.9898, 78.233))) * 43758.5453);
            float len = aLegB.x * 2.0 * size * (0.85 + 0.3 * rnd);
            // Behind the jelly, the way it came: the roots round the back of the rim, the strips fanning out from there.
            vec2 back = -vec2(cos(aJelly.w), sin(aJelly.w));
            vec2 dir = turn(back, aLegA.w + (rnd - 0.5) * 0.1);
            vec2 across = vec2(-dir.y, dir.x);
            // A ripple running from root to tip, swinging wider toward the tip, kicking a little as the bell beats.
            float beat = uTime * ${PULSE.toFixed(2)} + aPh;
            float kick = 1.0 + ${L.kick.toFixed(2)} * max(0.0, -cos(beat));
            float sway = ${L.sway.toFixed(3)} * len * pow(s, 1.4) * kick * sin(5.5 * s - ${L.speed.toFixed(2)} * uTime + rnd * 6.2832 + aPh);
            vec2 c = aJelly.xy + turn(back, aLegA.z) * aLegB.w * size + dir * len * s + across * sway;
            // Thin, tapering to the tip; the arms frilled. The strip rides the waves along its middle and turns its face
            // to the camera, so it keeps its width seen low across the water; never thinner than about a pixel on
            // screen: past that it is drawn that wide and dimmer, so far ones don't break up.
            bool arm = aLegB.w < 0.4;
            float hw = 0.5 * aLegB.y * (1.0 - 0.75 * s) * (arm ? 0.7 + 0.3 * sin(s * 38.0 - uTime * 1.3 + rnd * 6.0) : 1.0);
            vec3 d, n; float hc, hs, att;
            seaWaves(c, d, n, hc, hs, att);
            vec4 w = modelMatrix * vec4(c.x + d.x, d.y + 0.1, c.y + d.z, 1.0);
            vec3 toEye = cameraPosition - w.xyz;
            float dist = length(toEye);
            float drawn = max(hw, dist * 0.0009);
            vec3 side = normalize(cross(mat3(modelMatrix) * vec3(dir.x, 0.0, dir.y), toEye));
            w.xyz += side * aLegA.y * drawn;
            vec2 p = c;
            // Out of the hull's footprint, and toward the fog as the pools do.
            float hull = 1.0 - (1.0 - smoothstep(${HULL[0].toFixed(1)}, ${(HULL[0] + 1.5).toFixed(1)}, abs(p.x))) * (1.0 - smoothstep(${HULL[1].toFixed(1)}, ${(HULL[1] + 1.4).toFixed(1)}, abs(p.y)));
            float fog = mix(uFloor, 1.0, 1.0 - smoothstep(uFogNear, uFogFar * 1.4, dist));
            float pulse = 0.5 + 0.5 * sin(beat);
            // Like the pools, they fade where the water is seen edge-on, rather than stacking into one bright scratch.
            float edgeOn = smoothstep(${JELLIES.grazing.legs[0].toFixed(3)}, ${JELLIES.grazing.legs[1].toFixed(3)}, dot(normalize(mat3(modelMatrix) * n), toEye / dist));
            vA = uHalo * aLegB.z * (0.3 + 0.25 * pulse) * aLight.w * pow(1.0 - s, 1.2) * hull * fog * edgeOn * (hw / drawn);
            vCol = toSRGB(aLight.rgb);
            vSide = aLegA.y;
            gl_Position = aLight.w < 0.002 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * w;
          }`,
        // A soft cross-section: a bright core fading to the edges.
        fragmentShader: `varying vec3 vCol; varying float vA; varying float vSide;
          void main(){
            float core = 1.0 - vSide * vSide;
            gl_FragColor = vec4(vCol, vA * core * core);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    this.legs.renderOrder = 3;

    for (const o of [this.bells, this.halos, this.pools, this.legs]) o.frustumCulled = false;
    this.group.add(this.pools, this.legs, this.bells, this.halos);
    this.group.visible = false;
    this.setLite(false);
  }

  /** Lays out the field: the near ring first (the few up all day among them), then the far one. Returns how many are near. */
  private build(): number {
    const rnd = mulberry(61);
    const J = JELLIES;
    const [cx, cz] = passing();
    const cs = Math.hypot(cx, cz);
    // Lanes run the way the jellies go by; `o` is measured across that (as in `update`), and `star` is its sign toward
    // starboard (-z).
    const star = -cx / cs < 0 ? 1 : -1;
    // A jelly comes round where its lane leaves the ring, past the rim it fades out over (wandering included).
    const reach = (ring: [number, number]) => ring[1] + J.edge + J.wander + 0.5;
    // Lanes cover the whole disc out to there, so it takes more jellies than `count` to have that many in the ring.
    const allot = (l: { count: number; ring: [number, number] }) => Math.round((l.count * reach(l.ring) ** 2) / (l.ring[1] ** 2 - l.ring[0] ** 2));
    // Lane offsets spread so the jellies cover the ring evenly: more lanes across the middle, where they are longest.
    const offset = (R: number): number => {
      for (;;) {
        const o = R * rnd();
        if (rnd() < Math.sqrt(1 - (o / R) ** 2)) return o;
      }
    };
    const shuffled = (a: number[]): number[] => {
      for (let i = a.length - 1; i > 0; i--) {
        const k = Math.floor(rnd() * (i + 1));
        [a[i], a[k]] = [a[k], a[i]];
      }
      return a;
    };
    const add = (o: number, ring: [number, number], s0: number | null, speed: number, rise: number, k: number, lane?: number) => {
      const R = reach(ring);
      const half = lane ?? Math.sqrt(Math.max(1, R * R - o * o));
      this.jellies.push({
        o,
        s0: s0 ?? (rnd() * 2 - 1) * half,
        half,
        speed,
        wander: J.wander * (0.4 + 0.6 * rnd()),
        wf: [0.06 + 0.1 * rnd(), 0.06 + 0.1 * rnd()],
        wp: [rnd() * TAU, rnd() * TAU],
        size: J.size[0] + (J.size[1] - J.size[0]) * rnd(),
        col: new THREE.Color(J.colors[k % J.colors.length]),
        ph: rnd() * TAU,
        rise,
        ring,
      });
    };
    // Near: the few up all day ride short lanes off the starboard rail (within `dayReach`), evenly spaced round them
    // at the same pace, so two or three are always in sight; the rest surface through dusk.
    const near = J.near;
    const nearN = allot(near);
    const later = shuffled(jellyRises(nearN, J.day).slice(J.day));
    const dayRing: [number, number] = [near.ring[0], J.dayReach];
    for (let i = 0; i < nearN; i++) {
      if (i < J.day) {
        const R = reach(dayRing);
        const o = star * (7 + (8 * (i + rnd() * 0.6)) / Math.max(1, J.day - 1));
        // Their lanes run on well past the ring, so by day one or two go by at a time, not a steady line of them.
        const half = DAY_LANE * Math.sqrt(R * R - o * o);
        // Lilac and peach: they read best by day.
        add(o, dayRing, -half + (2 * half * (i + 0.5)) / J.day, cs, -1, 1 + (i % 2), half);
      } else {
        const side = rnd() < near.starboard ? star : -star;
        add(side * offset(reach(near.ring)), near.ring, null, cs * (0.97 + 0.06 * rnd()), later[i - J.day], i);
      }
    }
    // Far: no favoured side.
    const farN = allot(J.far);
    const farRises = shuffled(jellyRises(farN));
    for (let i = 0; i < farN; i++) {
      add((rnd() < 0.5 ? 1 : -1) * offset(reach(J.far.ring)), J.far.ring, null, cs * (0.97 + 0.06 * rnd()), farRises[i], i + 1);
    }
    return nearN;
  }

  /** Lite graphics: no pools, legs on the near ring only, and only `JELLIES.liteFar` of the far field. */
  setLite(on: boolean): void {
    this.lite = on;
    this.pools.visible = !on;
    const far = this.jellies.length - this.nearN;
    this.active = this.nearN + Math.round(far * (on ? JELLIES.liteFar : 1));
  }

  /** `t`: the sea's clock (s); `mood`: the sea's mood; `night`: how dark it is (0..1). */
  update(t: number, mood: number, night: number): void {
    const here = jelliesAt(mood);
    this.group.visible = here > 0;
    if (!here) return;
    const J = JELLIES;
    const [cx, cz] = passing();
    const cs = Math.hypot(cx, cz);
    const ux = cx / cs, uz = cz / cs;
    // Across the current.
    const vx = uz, vz = -ux;
    // By day a bell is dimmer, a pastel dome that only hints at its light.
    const dim = J.dayBell + (1 - J.dayBell) * smooth(0, 1, night);
    const spot = this.spot.array as Float32Array;
    const light = this.light.array as Float32Array;
    const bell = this.bellCol.array as Float32Array;
    const { p, n, q, s, m, c } = this;
    const bellFar = J.far.bells;
    // Halos, pools and bells are packed to the front of their buffers each frame, so only the jellies showing are drawn.
    // Those with a pool go at the front (the pools draw only those); the rest are written from the back, then moved up.
    let h = 0;
    let back = this.active;
    let b = 0;
    let l = 0;
    const legSpot = this.legSpot.array as Float32Array;
    const legLight = this.legLight.array as Float32Array;
    const legPh = this.legPh.array as Float32Array;
    const poolsTo = J.far.pools;
    for (let i = 0; i < this.active; i++) {
      const j = this.jellies[i];
      const near = i < this.nearN;
      // Along its lane on the current, coming round at the ends, and wandering a little off it.
      const len = 2 * j.half;
      let a = (j.s0 + j.speed * t + j.half) % len;
      if (a < 0) a += len;
      a -= j.half;
      const x = j.o * vx + a * ux + j.wander * Math.sin(t * j.wf[0] + j.wp[0]);
      const z = j.o * vz + a * uz + j.wander * Math.sin(t * j.wf[1] + j.wp[1]);
      const r = Math.hypot(x, z);
      const [r0, r1] = j.ring;
      // Faded past its ring's rims (the near ring's inner one is under the boat), and out of the hull's footprint.
      const ring = (near ? smooth(r0 - 1, r0 + 1, r) : smooth(r0 - J.edge, r0, r)) * (1 - smooth(r1, r1 + J.edge, r));
      const hull = 1 - (1 - smooth(HULL[0], HULL[0] + 1.5, Math.abs(x))) * (1 - smooth(HULL[1], HULL[1] + 1.4, Math.abs(z)));
      const w = here * ring * hull;
      // The light round it (halo, pool, legs) is held back until the water has darkened; the bell shows when it is up.
      const glow = jellyLight(night, j.rise) * w;
      const pulse = 0.5 + 0.5 * Math.sin(t * PULSE + j.ph);
      if (glow > 0.002) {
        const k = (r < poolsTo ? h++ : --back) * 4;
        spot[k] = x;
        spot[k + 1] = z;
        spot[k + 2] = j.size;
        spot[k + 3] = pulse;
        light[k] = j.col.r;
        light[k + 1] = j.col.g;
        light[k + 2] = j.col.b;
        light[k + 3] = glow;
      }
      // A far one's bell fades out past `far.bells` metres, where its halo has grown to stand in for it.
      const up = jellyUp(night, j.rise) * w * (near ? 1 : 1 - smooth(bellFar * 0.8, bellFar, r));
      if (up < 0.002 || b >= this.bellN) continue;
      // The bell rides the drawn water, its dome just breaking the surface; one still coming up sits lower.
      waveSurface(this.u, x, z, p, n);
      p.addScaledVector(n, -j.size * (0.2 + 0.6 * (1 - up)));
      q.setFromUnitVectors(Jellies.UP, n.lerp(Jellies.UP, 0.3).normalize());
      s.set(j.size * (0.95 + 0.1 * pulse), j.size * (1.08 - 0.12 * pulse), j.size * (0.95 + 0.1 * pulse));
      this.bells.setMatrixAt(b, m.compose(p, q, s));
      c.copy(j.col).multiplyScalar(dim);
      bell[b * 4] = c.r;
      bell[b * 4 + 1] = c.g;
      bell[b * 4 + 2] = c.b;
      bell[b * 4 + 3] = up;
      b++;
      // Its legs, glowing with its halo (out to `legs.reach`), trailing behind the way it goes by the boat: along its
      // lane, and its wander.
      const legGlow = glow * (1 - smooth(J.legs.reach * 0.8, J.legs.reach, r));
      if (legGlow < 0.002 || (this.lite && !near)) continue;
      const k = l * 4;
      legSpot[k] = x;
      legSpot[k + 1] = z;
      legSpot[k + 2] = j.size;
      legSpot[k + 3] = Math.atan2(
        j.speed * uz + j.wander * j.wf[1] * Math.cos(t * j.wf[1] + j.wp[1]),
        j.speed * ux + j.wander * j.wf[0] * Math.cos(t * j.wf[0] + j.wp[0]),
      );
      legLight[k] = j.col.r;
      legLight[k + 1] = j.col.g;
      legLight[k + 2] = j.col.b;
      legLight[k + 3] = legGlow;
      legPh[l++] = j.ph;
    }
    const halos = h + this.active - back;
    spot.copyWithin(h * 4, back * 4, this.active * 4);
    light.copyWithin(h * 4, back * 4, this.active * 4);
    this.poolGeo.instanceCount = h;
    this.haloGeo.instanceCount = halos;
    this.halos.visible = halos > 0;
    h = halos;
    this.bells.count = b;
    this.bells.visible = b > 0;
    this.legGeo.instanceCount = l;
    this.legs.visible = l > 0;
    sendFirst(this.spot, h);
    sendFirst(this.light, h);
    sendFirst(this.bellCol, b);
    sendFirst(this.bells.instanceMatrix, b);
    sendFirst(this.legSpot, l);
    sendFirst(this.legLight, l);
    sendFirst(this.legPh, l);
  }
}
