import * as THREE from 'three';
import { PARTICLE_BUDGET, emitShow, rocketShow, type Particle, type RocketUp, type Show } from '../data/rockets';
import { WATER_ORDER } from './env';

/**
 * The fireworks over the lake (GAME_DESIGN.md §41; the show itself is data, `src/data/rockets.ts`). Everything a
 * rocket puts in the sky is one draw: `PARTICLE_BUDGET` quads that face the camera, each a particle whose whole path
 * is worked out on the graphics card from where and when it was born, so a frame costs one number (the show's clock)
 * and nothing is written or allocated while a rocket is up. The buffers are made once with the map and filled once
 * per rocket, as it is lit. Between rockets the mesh is hidden and `update` returns at once.
 *
 * The sparks are glows, not lights: nothing here lights the scene, and no THREE light is added. At night they add
 * to the sky like light; by day they are drawn solid in their own colour with a puff of smoke behind each burst, so
 * they read against a pale sky (`uSolid` moves between the two with the daylight).
 */

const vert = /* glsl */ `
attribute vec3 aP0;
attribute vec3 aV;
// born at, life, drag, gravity
attribute vec4 aT;
// colour, style (0 spark, 1 twinkle, 2 flash, 3 smoke)
attribute vec4 aC;
// half width (m), tail (s), flicker seed
attribute vec3 aS;
uniform float uTime;
uniform float uSolid;
varying vec3 vCol;
varying vec3 vShape;
varying vec2 vLook;

vec3 at(float tau) {
  float k = aT.z;
  float e = (1.0 - exp(-k * tau)) / k;
  float fall = -aT.w / k;
  return aP0 + vec3(aV.x * e, (aV.y - fall) * e + fall * tau, aV.z * e);
}

void main() {
  float tau = uTime - aT.x;
  vCol = aC.rgb;
  vLook = vec2(0.0, aC.w);
  vShape = vec3(0.0);
  // Not born yet, or burnt out: off the screen.
  if (tau < 0.0 || tau >= aT.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  float f = tau / aT.y;
  float style = aC.w;
  float h = aS.x;
  float bright;
  if (style < 0.5) {
    bright = min(1.0, (1.0 - f) * 2.4);
    // Drawn solid by day, a spark needs more body to stand off the sky.
    h *= 1.0 + 0.35 * uSolid;
  } else if (style < 1.5) {
    float tick = floor(uTime * 24.0) + aS.z * 97.0;
    float on = step(0.4, fract(sin(tick * 12.9898) * 43758.5453));
    bright = sqrt(1.0 - f) * (0.3 + 0.7 * on);
  } else if (style < 2.5) {
    // A hard flash as it bursts, then a soft glow that hangs while its stars burn.
    bright = (1.0 - f) * (1.0 - f) * (0.35 + 0.65 * exp(-tau * 9.0));
    h *= 0.5 + 0.5 * min(1.0, tau * 3.0);
  } else {
    bright = smoothstep(0.0, 0.12, f) * (1.0 - f);
    h *= 1.0 + 1.5 * f;
  }
  vec4 head = modelViewMatrix * vec4(at(tau), 1.0);
  vec4 tail = modelViewMatrix * vec4(at(max(0.0, tau - aS.y)), 1.0);
  vec2 d = head.xy - tail.xy;
  float len = length(d);
  vec2 ax = len > 0.0001 ? d / len : vec2(1.0, 0.0);
  float along = position.x * (len * 0.5 + h);
  vec4 mid = (head + tail) * 0.5;
  mid.xy += ax * along + vec2(-ax.y, ax.x) * position.y * h;
  gl_Position = projectionMatrix * mid;
  vShape = vec3(along / h, position.y, len * 0.5 / h);
  vLook = vec2(bright, style);
}
`;

const frag = /* glsl */ `
uniform float uSolid;
varying vec3 vCol;
varying vec3 vShape;
varying vec2 vLook;

void main() {
  // A capsule along the particle's tail: 0 on its spine, 1 at its edge.
  float d = length(vec2(max(abs(vShape.x) - vShape.z, 0.0), vShape.y));
  if (d >= 1.0) discard;
  float halo = (1.0 - d) * (1.0 - d);
  float style = vLook.y;
  if (style > 2.5) {
    // Smoke: grey and solid, faint in the dark.
    float a = halo * vLook.x * mix(0.07, 0.42, uSolid);
    gl_FragColor = vec4(vCol * a, a);
    return;
  }
  if (style > 1.5) {
    // A burst's flash: a wide soft bloom.
    float a = halo * vLook.x * mix(0.7, 0.42, uSolid);
    gl_FragColor = vec4(mix(vCol, vec3(1.0), 0.45) * a, a * uSolid * 0.6);
    return;
  }
  float core = smoothstep(0.5, 0.1, d);
  // Brightest at the head of the tail.
  float fade = vShape.z > 0.01 ? mix(0.2, 1.0, clamp((vShape.x + vShape.z) / (2.0 * vShape.z), 0.0, 1.0)) : 1.0;
  float a = clamp((halo * 0.7 + core) * vLook.x * fade, 0.0, 1.0);
  // White-hot in the dark; by day the colour itself, a little deeper, so it stands off a pale sky.
  vec3 col = mix(vCol, vec3(1.0), core * mix(0.4, 0.1, uSolid)) * mix(1.0, 0.9, uSolid);
  gl_FragColor = vec4(col * a, a * uSolid);
}
`;

const ATTRS: [name: string, size: number][] = [['aP0', 3], ['aV', 3], ['aT', 4], ['aC', 4], ['aS', 3]];

export class Fireworks {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  /** The rocket in the sky, or null: its show (bursts, for the sound) and when it was lit on the shared clock (ms). */
  private up: { show: Show; at: number } | null = null;
  private uniforms = { uTime: { value: 0 }, uSolid: { value: 0 } };
  private buf: Record<string, Float32Array> = {};
  private n = 0;
  /** Staging only: the show's clock held at this many seconds in (null lets it run), for a picture of a chosen moment. */
  hold: number | null = null;
  /** Particles of the show now in the buffers (the tests' count). */
  get particles(): number {
    return this.n;
  }
  /** Seconds since the rocket in the sky was lit, or null with a clear sky. */
  get elapsed(): number | null {
    return this.up ? this.uniforms.uTime.value : null;
  }

  constructor() {
    const g = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(2, 2);
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    for (const [name, size] of ATTRS) {
      // Zeroes: a life of 0, so until a rocket is lit every particle is off the screen (the map's warm-up draw uploads them).
      const a = new THREE.InstancedBufferAttribute((this.buf[name] = new Float32Array(PARTICLE_BUDGET * size)), size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
    }
    g.instanceCount = PARTICLE_BUDGET;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      fog: false,
      // One, and one minus alpha: a particle's alpha says how much of the sky behind it it hides (none at night).
      premultipliedAlpha: true,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = WATER_ORDER + 1;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;
  }

  private put = (p: Particle): void => {
    const i = this.n++;
    const { aP0, aV, aT, aC, aS } = this.buf;
    aP0[i * 3] = p.x; aP0[i * 3 + 1] = p.y; aP0[i * 3 + 2] = p.z;
    aV[i * 3] = p.vx; aV[i * 3 + 1] = p.vy; aV[i * 3 + 2] = p.vz;
    aT[i * 4] = p.t0; aT[i * 4 + 1] = p.life; aT[i * 4 + 2] = p.drag; aT[i * 4 + 3] = p.grav;
    aC[i * 4] = p.r; aC[i * 4 + 1] = p.g; aC[i * 4 + 2] = p.b; aC[i * 4 + 3] = p.style;
    aS[i * 3] = p.size; aS[i * 3 + 1] = p.streak; aS[i * 3 + 2] = p.seed;
  };

  /**
   * A rocket was lit: fills the buffers with its show (the one upload a rocket costs) and starts drawing. A show
   * that is already part way through, for a player who arrives while it is up, simply starts from where it is.
   */
  launch(up: Pick<RocketUp, 'kind' | 'seed' | 'at'>): Show {
    const show = rocketShow(up.kind, up.seed);
    this.n = 0;
    emitShow(show, this.put);
    const g = this.mesh.geometry;
    for (const [name, size] of ATTRS) {
      const a = g.getAttribute(name) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * size);
      a.needsUpdate = true;
    }
    g.instanceCount = this.n;
    this.up = { show, at: up.at };
    this.uniforms.uTime.value = 0;
    this.mesh.visible = true;
    return show;
  }

  /** Clears the sky at once. */
  stop(): void {
    this.up = null;
    this.mesh.visible = false;
  }

  /** Each frame: `now` is the shared clock (ms), `night` 0 by day to 1 in the dark. Nothing to do with a clear sky. */
  update(now: number, night: number): void {
    const up = this.up;
    if (!up) return;
    const t = this.hold ?? (now - up.at) / 1000;
    if (t >= up.show.seconds) return this.stop();
    this.uniforms.uTime.value = t;
    const day = 1 - night;
    this.uniforms.uSolid.value = Math.min(1, Math.max(0, (day - 0.2) / 0.5)) * 0.94;
  }
}
