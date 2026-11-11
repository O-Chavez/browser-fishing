import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUOY, GULLS, RAIN, seaHeight } from '../data/sea';
import { mulberry } from './env';
import type { SkyUniforms } from './sea';

/**
 * The sea's atmosphere (deep sea art pass 3): rain on the wind from Kelp Deep on, the lit buoy at each marker,
 * and the Shelf's gulls. Each is one or two draws, built once with the sea.
 */

/**
 * Rain: streaks falling through a box that follows the camera, slanted on the wind. All the motion is in the
 * vertex shader (each streak wraps round the box), so a frame costs one draw and no buffer uploads.
 */
export class Rain {
  readonly mesh: THREE.Mesh;
  private u: SkyUniforms & { uTime: { value: number }; uAmount: { value: number }; uVel: { value: THREE.Vector3 }; uLamps: { value: number } };

  constructor(sky: SkyUniforms) {
    const n = RAIN.streaks;
    const rnd = mulberry(41);
    const seed = new Float32Array(n * 4 * 4);
    const corner = new Float32Array(n * 4 * 2);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const s = [rnd(), rnd(), rnd(), i / n];
      for (let c = 0; c < 4; c++) {
        seed.set(s, (i * 4 + c) * 4);
        corner.set([c >> 1, (c & 1) * 2 - 1], (i * 4 + c) * 2);
      }
      const v = i * 4;
      idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(idx);
    this.u = { ...sky, uTime: { value: 0 }, uAmount: { value: 0 }, uVel: { value: new THREE.Vector3(0, -1, 0) }, uLamps: { value: 0 } };
    const [bx, by, bz] = RAIN.box;
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u as unknown as Record<string, THREE.IUniform>,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `attribute vec4 seed; attribute vec2 corner;
        uniform float uTime, uAmount; uniform vec3 uVel;
        varying float vA; varying vec3 vWorld;
        void main(){
          vec3 box = vec3(${bx.toFixed(1)}, ${by.toFixed(1)}, ${bz.toFixed(1)});
          // Each streak falls at its own speed and wraps round a box centred on the camera.
          vec3 vel = uVel * (0.8 + 0.4 * seed.y);
          vec3 p = mod(seed.xyz * box + vel * uTime - cameraPosition + box * 0.5, box) - box * 0.5 + cameraPosition;
          vec3 dir = normalize(vel);
          p -= dir * corner.x * length(vel) * ${RAIN.streak.toFixed(3)};
          float dist = length(p - cameraPosition);
          // Never thinner than about a pixel, so far streaks don't shimmer.
          vec3 side = normalize(cross(dir, p - cameraPosition));
          p += side * corner.y * max(${(RAIN.width / 2).toFixed(4)}, dist * 0.0007);
          vec3 e = abs(p - cameraPosition) / (box * 0.5);
          // Thins out toward the box's edge, and the lighter the rain the fewer streaks show.
          vA = (1.0 - smoothstep(0.7, 1.0, max(e.x, max(e.y, e.z)))) * step(seed.w, uAmount) * smoothstep(1.5, 4.0, dist);
          vWorld = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform vec3 uFogColor; uniform float uLamps; varying float vA; varying vec3 vWorld;
        void main(){
          // Rain takes the sky's light, so it dims with the night; near the boat the lamps catch it.
          vec3 col = mix(uFogColor, vec3(1.0), 0.5) + vec3(1.0, 0.8, 0.55) * uLamps * 0.45 * exp(-length(vWorld.xz) * 0.22);
          gl_FragColor = vec4(col, vA * ${RAIN.opacity.toFixed(2)});
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /** Lite graphics draws half the streaks. */
  setLite(on: boolean): void {
    this.mesh.geometry.setDrawRange(0, (on ? RAIN.streaks / 2 : RAIN.streaks) * 6);
  }

  /** `amount`: how hard it rains (0..1); `storm`: how hard the wind blows it (0..1); `wind`: the way it blows. */
  update(t: number, amount: number, storm: number, wind: THREE.Vector2, lamps: number): void {
    this.mesh.visible = amount > 0;
    if (!amount) return;
    const blow = RAIN.blow[0] + (RAIN.blow[1] - RAIN.blow[0]) * storm;
    this.u.uTime.value = t;
    this.u.uAmount.value = amount;
    this.u.uVel.value.set(wind.x * blow, -RAIN.fall, wind.y * blow);
    this.u.uLamps.value = lamps;
  }
}

const tint = (geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

/** A soft round glow for the buoy's lamp. */
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * The marker buoy: a red-and-white buoy with a lamp on top that drifts up off the starboard side as the boat
 * reaches a marker, rides the swell there while the player chooses, and falls astern when the boat sails on.
 * It lives in the sea's frame.
 */
export class MarkerBuoy {
  readonly group = new THREE.Group();
  private lampMat = new THREE.MeshBasicMaterial({ color: BUOY.lamp, fog: false });
  private halo: THREE.Sprite;
  private on = false;
  private x = BUOY.from;

  constructor() {
    const R = 8;
    const at = (g: THREE.BufferGeometry, y: number) => g.translate(0, y, 0);
    const parts = [
      tint(at(new THREE.CylinderGeometry(0.62, 0.5, 0.5, R), 0.05), 0xd9483b),
      tint(at(new THREE.CylinderGeometry(0.66, 0.66, 0.1, R), 0.3), 0x3a3836),
      tint(at(new THREE.CylinderGeometry(0.34, 0.46, 0.55, R), 0.62), 0xf4f1ea),
      tint(at(new THREE.CylinderGeometry(0.24, 0.34, 0.55, R), 1.17), 0xd9483b),
      tint(at(new THREE.CylinderGeometry(0.16, 0.24, 0.45, R), 1.67), 0xf4f1ea),
      tint(at(new THREE.CylinderGeometry(0.2, 0.2, 0.06, R), 1.92), 0x3a3836),
      // The keel weight that keeps it upright, mostly under water.
      tint(at(new THREE.CylinderGeometry(0.3, 0.16, 0.7, R), -0.5), 0x3a3836),
    ];
    const body = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), this.lampMat);
    lamp.position.y = BUOY.lampY;
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: BUOY.lamp, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.halo.position.y = BUOY.lampY;
    this.group.add(body, lamp, this.halo);
    this.group.scale.setScalar(BUOY.size);
    this.group.visible = false;
  }

  /** Whether the boat is stopped at a marker. */
  set(on: boolean): void {
    if (on && !this.on && !this.group.visible) this.x = BUOY.from;
    this.on = on;
  }

  /** `dark`: how dark it is around the boat (0..1), for the lamp's halo. */
  update(t: number, dt: number, mood: number, dark: number): void {
    if (this.on) {
      this.group.visible = true;
      this.x += (BUOY.rest - this.x) * (1 - Math.exp(-dt * BUOY.ease));
    } else if (this.group.visible) {
      // Sailing on: it falls astern, faster as the boat gets going.
      this.x -= dt * (1.5 + 0.5 * (BUOY.rest - this.x));
      if (this.x < BUOY.gone) this.group.visible = false;
    }
    if (!this.group.visible) return;
    const x = this.x, z = BUOY.z;
    const h = seaHeight(x, z, t, mood);
    this.group.position.set(x, h + 0.1, z);
    // It leans with the water's slope, and rocks a little on its own.
    const e = 0.8;
    const sx = (seaHeight(x + e, z, t, mood) - seaHeight(x - e, z, t, mood)) / (2 * e);
    const sz = (seaHeight(x, z + e, t, mood) - seaHeight(x, z - e, t, mood)) / (2 * e);
    this.group.rotation.set(-Math.atan(sz) * 0.7 + Math.sin(t * 1.7) * 0.05, 0, Math.atan(sx) * 0.7 + Math.sin(t * 1.3 + 1) * 0.05);
    // The lamp: a long flash and a short dark, with a halo that is faint by day and wide after dark.
    const lit = (t % BUOY.period) / BUOY.period < BUOY.duty ? 1 : 0.12;
    this.lampMat.color.set(BUOY.lamp).multiplyScalar(0.35 + 0.65 * lit);
    this.halo.material.opacity = lit * (0.35 + 0.6 * dark);
    this.halo.scale.setScalar(1.1 + 1.7 * dark);
  }
}

interface Gull {
  cx: number;
  cz: number;
  r: number;
  h: number;
  /** Radians a second round its circle; the sign is the way it turns. */
  turn: number;
  ph: number;
  /** The mood past which it has flown home. */
  leaves: number;
  away: number;
}

/**
 * Gulls wheeling round the boat on the Shelf: they flap and glide in wide circles, and peel away one by one as
 * the boat heads out toward the Drop-off, and after dark. One instanced draw; the wings beat in the vertex shader.
 */
export class Gulls {
  readonly mesh: THREE.InstancedMesh;
  private gulls: Gull[] = [];
  private flap: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();

  constructor() {
    const rnd = mulberry(53);
    const S = GULLS.span / 2;
    // The body, bill toward +x, and two wings of two panels each; `wing` is how far out along the wing a vertex is.
    const pos: number[] = [];
    const col: number[] = [];
    const wing: number[] = [];
    const tri = (pts: [number, number, number][], hex: number, w: number[] = [0, 0, 0]) => {
      const c = new THREE.Color(hex);
      pts.forEach((p, i) => {
        pos.push(...p);
        col.push(c.r, c.g, c.b);
        wing.push(w[i]);
      });
    };
    const L = 0.34, T = 0.09;
    const ring: [number, number, number][] = [[0, T, 0], [0, 0, T], [0, -T * 0.8, 0], [0, 0, -T]];
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4];
      tri([[L, 0, 0], b, a], 0xfbfaf6);
      tri([[-L, 0.01, 0], a, b], i === 0 || i === 3 ? 0xe6e4de : 0xfbfaf6);
    }
    tri([[L, 0, 0], [L + 0.1, -0.02, 0], [L - 0.04, -0.04, 0]], 0xf0b040);
    for (const s of [-1, 1]) {
      const m = S * 0.5;
      tri([[0.13, 0.02, 0], [-0.13, 0.02, 0], [0.05, 0.02, s * m]], 0xc9ced6, [0, 0, m]);
      tri([[-0.13, 0.02, 0], [-0.16, 0.02, s * m], [0.05, 0.02, s * m]], 0xc9ced6, [0, m, m]);
      tri([[0.05, 0.02, s * m], [-0.16, 0.02, s * m], [-0.14, 0.02, s * S * 0.86]], 0xb4bac4, [m, m, S * 0.86]);
      tri([[0.05, 0.02, s * m], [-0.14, 0.02, s * S * 0.86], [-0.2, 0.02, s * S]], 0x34363c, [m, S * 0.86, S]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('wing', new THREE.Float32BufferAttribute(wing, 1));
    g.computeVertexNormals();
    // Both wings face up, whichever way their triangles wind.
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < nrm.count; i++) if (pos[i * 3 + 1] === 0.02) nrm.setXYZ(i, 0, 1, 0);
    this.flap = new THREE.InstancedBufferAttribute(new Float32Array(GULLS.count), 1);
    this.flap.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFlap', this.flap);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      // Wings hinge at the body: the tips rise and fall, and bend a little more than the roots.
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float wing; attribute float aFlap;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed.y += wing * aFlap * (0.7 + 0.5 * wing / ${S.toFixed(3)});`);
    };
    this.mesh = new THREE.InstancedMesh(g, mat, GULLS.count);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < GULLS.count; i++) {
      const r = GULLS.radius[0] + rnd() * (GULLS.radius[1] - GULLS.radius[0]);
      this.gulls.push({
        cx: (rnd() - 0.5) * 16,
        // Mostly out over the water the players face.
        cz: -6 - rnd() * 14 + (i % 3 === 0 ? 22 : 0),
        r,
        h: GULLS.height[0] + rnd() * (GULLS.height[1] - GULLS.height[0]),
        turn: ((rnd() < 0.5 ? -1 : 1) * GULLS.speed * (0.8 + 0.4 * rnd())) / r,
        ph: rnd() * 40,
        leaves: GULLS.leave[0] + (i / Math.max(1, GULLS.count - 1)) * (GULLS.leave[1] - GULLS.leave[0]),
        away: 1,
      });
    }
  }

  update(t: number, dt: number, mood: number, night: number): void {
    let shown = false;
    const d = this.dummy;
    this.gulls.forEach((b, i) => {
      const gone = mood > b.leaves || night > GULLS.roost ? 1 : 0;
      b.away += (gone - b.away) * Math.min(1, dt * 0.25);
      if (b.away > 0.985) {
        d.position.set(0, -500, 0);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
        return;
      }
      shown = true;
      const a = b.ph + t * b.turn;
      // Flying home: the circle opens out and climbs until the haze takes the bird.
      const r = b.r * (1 + 0.15 * Math.sin(t * 0.21 + b.ph)) + b.away * b.away * 420;
      const y = b.h + 1.2 * Math.sin(t * 0.37 + b.ph * 2) + b.away * 30;
      d.position.set(b.cx + Math.cos(a) * r, y, b.cz + Math.sin(a) * r);
      const way = Math.sign(b.turn);
      // Heading along the circle, banked into the turn.
      d.rotation.set(0, 0, 0);
      d.rotateY(-a - (way * Math.PI) / 2);
      d.rotateX(way * 0.3);
      d.scale.setScalar(GULLS.size);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      // A few beats, then a glide on set wings.
      const beat = THREE.MathUtils.smoothstep(Math.sin(t * 0.45 + b.ph * 3), -0.2, 0.5);
      this.flap.setX(i, 0.16 + 0.75 * beat * Math.sin(t * 8.5 + b.ph * 5));
    });
    this.mesh.visible = shown;
    if (!shown) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flap.needsUpdate = true;
  }
}
