import { audio } from './audio';
import * as THREE from 'three';
import { LightPool } from './lightpool';
import type { Location } from '../data/content';
import type { MapDef } from '../data/maps';
import {
  DOCK_RECTS,
  type DockRect,
  groundHeight,
  innerRadius,
  isWater,
  mulberry,
  onDock,
  padWeight,
  setPad,
  smooth,
  waveHeight,
} from './env';
import { Hub } from './hub';
import { Town } from './town';
import type { Circle } from './player';
import { CasinoHall } from './casinohall';
import { FX } from './fx';
import { LineRenderer, Rig } from './rig';

import { dayFraction, nightness, twilight } from './daynight';

export const SUN_DIR = new THREE.Vector3(-0.35, 0.38, -0.85).normalize();

const WAVE_GLSL = `
float wave(vec2 p, float t){
  return sin(p.x*0.35+t*1.1)*0.07 + sin(p.y*0.5-t*1.3+p.x*0.2)*0.05 + sin((p.x+p.y)*0.9+t*2.0)*0.02;
}
vec2 waveGrad(vec2 p, float t){
  float a = cos(p.x*0.35+t*1.1)*0.35*0.07;
  float b = cos(p.y*0.5-t*1.3+p.x*0.2)*0.05;
  float c = cos((p.x+p.y)*0.9+t*2.0)*0.9*0.02;
  return vec2(a + 0.2*b + c, 0.5*b + c);
}`;

const waterVert = `
uniform float uTime; varying vec3 vWorld;
${WAVE_GLSL}
void main(){
  vec3 p = position; p.y = wave(p.xz, uTime);
  vec4 w = modelMatrix * vec4(p,1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const waterFrag = `
uniform float uTime; uniform vec3 uShallow, uDeep, uSkyH, uSkyT, uSunCol, uSunDir, uFogColor;
uniform float uFogNear, uFogFar; varying vec3 vWorld;
${WAVE_GLSL}
void main(){
  vec2 g = waveGrad(vWorld.xz, uTime) * 2.5;
  g += 0.018 * vec2(sin(vWorld.x*2.7+uTime*1.9) + sin(vWorld.z*4.1-uTime*1.3), cos(vWorld.z*3.1+uTime*1.6) + cos(vWorld.x*5.3+uTime*1.1));
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(n,V),0.0), 3.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyH, uSkyT, pow(clamp(R.y,0.0,1.0),0.6));
  float dist = length(cameraPosition - vWorld);
  vec3 base = mix(uShallow, uDeep, smoothstep(4.0, 70.0, dist));
  vec3 col = mix(base, sky, clamp(fres*0.8 + 0.03, 0.0, 1.0));
  float spec = pow(max(dot(R, uSunDir), 0.0), 350.0) * 4.0 + pow(max(dot(R, uSunDir), 0.0), 30.0) * 0.25;
  col += uSunCol * spec;
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
  gl_FragColor = vec4(col, clamp(0.55 + 0.45*smoothstep(3.0,45.0,dist) + fres*0.3, 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const skyVert = `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = `
uniform vec3 uHorizon, uTop, uSunDir, uSunCol; varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const lambert = (
  color: number,
  extra: THREE.MeshLambertMaterialParameters = {},
) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  });
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);
  readonly renderer: THREE.WebGLRenderer;
  readonly bobber = new THREE.Group();
  readonly rig = new Rig();
  readonly line = new LineRenderer();
  readonly fx = new FX();
  /** Eye position, driven by the player each frame. */
  readonly eye = new THREE.Vector3(0, 2.4, -1.2);
  walkBob = 0;
  hub: Hub | null = null;
  town: Town | null = null;
  hall: CasinoHall | null = null;
  private indoor = false;
  private nightNow = 0;
  private trees: Circle[] = [];
  yaw = 0;
  pitch = -0.12;
  time = 0;
  bobberVisible = false;
  fovKick = 0;
  pitchKick = 0;
  private shake = 0;
  private decor = new THREE.Group();
  private frame = 0;
  private lightPool = new LightPool(8);
  private clouds = new THREE.Group();
  private cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
  private stars!: THREE.Points;
  private flies: THREE.Points | null = null;
  private flyBase: { x: number; y: number; z: number; ph: number; sp: number }[] = [];
  private dockLights: THREE.PointLight[] = [];
  private dockGlow = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  private base = { water: new THREE.Color(), deep: new THREE.Color(), sky: new THREE.Color(), top: new THREE.Color(), grass: new THREE.Color() };
  /** Set (0..1 of the day) to freeze the time of day; null follows the shared clock. */
  dayOverride: number | null = null;
  night = 0;
  private sky!: THREE.Mesh;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x446644, 1.1);
  private sun = new THREE.DirectionalLight(0xfff0d6, 3);
  private waterU = {
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    uSkyH: { value: new THREE.Color() },
    uSkyT: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color(0xfff2d8) },
    uSunDir: { value: new THREE.Vector3().copy(SUN_DIR) },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 30 },
    uFogFar: { value: 280 },
  };
  private skyU = {
    uHorizon: this.waterU.uSkyH,
    uTop: this.waterU.uSkyT,
    uSunDir: this.waterU.uSunDir,
    uSunCol: this.waterU.uSunCol,
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Shadows refresh every few frames (see update); the sun and props move too slowly to notice.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera.position.copy(this.eye);
    this.camera.rotation.order = 'YXZ';
    this.camera.add(this.rig.root);
    this.scene.add(
      this.camera,
      this.decor,
      this.clouds,
      this.fx.group,
      this.line.line,
      this.bobber,
      this.hemi,
    );

    this.sun.position
      .copy(SUN_DIR)
      .multiplyScalar(80)
      .add(new THREE.Vector3(0, 0, 4));
    this.sun.target.position.set(0, 0, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -30;
    sc.right = sc.top = 30;
    sc.near = 5;
    sc.far = 200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    this.buildSky();
    this.buildBobber();
    this.bobber.visible = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private buildBobber(): void {
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      lambert(0xe8281f),
    );
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(
        0.08,
        12,
        8,
        0,
        Math.PI * 2,
        Math.PI / 2,
        Math.PI / 2,
      ),
      lambert(0xf5f5f5),
    );
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, 0.16, 5),
      lambert(0xe8281f),
    );
    stem.position.y = 0.14;
    this.bobber.add(top, bottom, stem);
    this.bobber.scale.setScalar(1.8);
  }

  private buildSky(): void {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    const rnd = mulberry(11);
    const mat = this.cloudMat;
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group();
      const n = 4 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
        b.scale.set(10 + rnd() * 12, 4 + rnd() * 4, 8 + rnd() * 6);
        b.position.set((k - n / 2) * 11 + rnd() * 4, rnd() * 3, rnd() * 6);
        c.add(b);
      }
      const a = rnd() * Math.PI * 2;
      const d = 200 + rnd() * 400;
      c.position.set(Math.cos(a) * d, 110 + rnd() * 60, Math.sin(a) * d);
      this.clouds.add(c);
    }

    const sp = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const u = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      sp.set([Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  private buildFireflies(): void {
    const N = 90;
    const rnd = mulberry(5);
    this.flyBase = [];
    while (this.flyBase.length < N) {
      const x = (rnd() - 0.5) * 80;
      const z = -4 - rnd() * 55;
      if (!isWater(x, z) && !onDock(x, z, 1.5)) continue;
      this.flyBase.push({ x, y: 0.5 + rnd() * 2.2, z, ph: rnd() * 6.28, sp: 0.4 + rnd() * 0.6 });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const cx = c.getContext('2d')!;
    const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 64, 64);
    this.flies = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(c), size: 0.7, vertexColors: true, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }),
    );
    this.flies.frustumCulled = false;
    this.flies.visible = false;
    this.decor.add(this.flies);
  }

  /** Blends sky, light, water, lamps and fireflies between day and night. */
  private updateDaylight(t: number): void {
    const f = this.dayOverride ?? dayFraction(Date.now() / 1000);
    const n = nightness(f);
    if (this.indoor) {
      this.night = n;
      this.nightNow = 1;
      this.hemi.intensity = 2.6;
      this.hemi.color.set(0xffe6c8);
      this.hemi.groundColor.set(0x5a3038);
      this.sun.intensity = 0;
      this.town?.setNight(1);
      return;
    }
    const tw = twilight(n);
    this.night = n;
    const b = this.base;
    const u = this.waterU;
    const nightH = new THREE.Color(0x0c1730);
    const nightT = new THREE.Color(0x02040c);
    u.uSkyH.value.copy(b.sky).lerp(nightH, n).lerp(new THREE.Color(0xff8a4a), tw * 0.7);
    u.uSkyT.value.copy(b.top).lerp(nightT, n).lerp(new THREE.Color(0x5a4a8a), tw * 0.35);
    u.uFogColor.value.copy(u.uSkyH.value);
    (this.scene.fog as THREE.Fog | null)?.color.copy(u.uSkyH.value);
    u.uShallow.value.copy(b.water).multiplyScalar(1 - 0.78 * n);
    u.uDeep.value.copy(b.deep).multiplyScalar(1 - 0.7 * n);
    u.uSunCol.value.set(0xfff2d8).lerp(new THREE.Color(0xff9a55), tw).multiplyScalar(1 - n);
    const el = 0.38 * (1 - n) + 0.06 * n + 0.1 * tw;
    u.uSunDir.value.set(SUN_DIR.x, el, SUN_DIR.z).normalize();
    this.hemi.intensity = 1.1 * (1 - n) + 0.34 * n;
    this.hemi.color.copy(b.top).lerp(new THREE.Color(0xffffff), 0.5).lerp(new THREE.Color(0x6a80c0), n);
    this.hemi.groundColor.copy(b.grass).multiplyScalar(0.5).lerp(new THREE.Color(0x141c30), n);
    this.sun.intensity = 3 * (1 - n) + 0.45 * n;
    this.sun.color.set(0xfff0d6).lerp(new THREE.Color(0xff9a55), tw * 0.8).lerp(new THREE.Color(0x7f9bff), n);
    this.cloudMat.color.set(0xffffff).lerp(new THREE.Color(0x1c2540), n).lerp(new THREE.Color(0xffb890), tw * 0.5);
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, (n - 0.4) / 0.6);
    this.dockGlow.color.set(0x6a5a3a).lerp(new THREE.Color(0xffd27a), 0.35 + 0.65 * n);
    for (const l of this.dockLights) l.intensity = 8 * n;
    this.hub?.setNight(n);
    this.town?.setNight(n);
    this.nightNow = n;

    const fl = this.flies;
    if (fl) {
      const vis = n > 0.05;
      fl.visible = vis;
      if (vis) {
        const p = fl.geometry.getAttribute('position') as THREE.BufferAttribute;
        const c = fl.geometry.getAttribute('color') as THREE.BufferAttribute;
        this.flyBase.forEach((fb, i) => {
          const a = t * fb.sp + fb.ph;
          p.setXYZ(i, fb.x + Math.sin(a) * 1.6 + Math.sin(a * 2.3) * 0.5, fb.y + Math.sin(a * 1.7) * 0.4, fb.z + Math.cos(a * 0.9) * 1.6);
          const blink = (0.5 + 0.5 * Math.sin(t * (1.2 + fb.sp) + fb.ph * 3)) ** 2 * n;
          c.setXYZ(i, 0.75 * blink, 1.0 * blink, 0.3 * blink);
        });
        p.needsUpdate = c.needsUpdate = true;
      }
    }
  }

  setLocation(loc: Location, map: MapDef): void {
    this.indoor = !!map.casino;
    setPad(map.pad);
    this.scene.remove(this.decor);
    disposeGroup(this.decor);
    this.decor = new THREE.Group();
    this.scene.add(this.decor);
    this.sky.visible = this.stars.visible = this.clouds.visible = !this.indoor;
    this.trees = [];

    if (this.indoor) {
      const dark = new THREE.Color(0x120810);
      this.scene.background = dark;
      this.scene.fog = new THREE.Fog(dark, 45, 130);
      this.town = new Town(map);
      this.decor.add(this.town.group);
      this.hub = null;
      this.hall = new CasinoHall(map.casino!);
      this.decor.add(this.hall.group);
      this.lightPool.collect(this.decor);
      return;
    }

    const u = this.waterU;
    u.uShallow.value.set(loc.water);
    u.uDeep.value.set(loc.deep);
    u.uSkyH.value.set(loc.sky);
    u.uSkyT.value.set(loc.skyTop);
    u.uFogColor.value.set(loc.sky);
    this.scene.fog = new THREE.Fog(loc.sky, 30, 280);
    this.base.water.set(loc.water);
    this.base.deep.set(loc.deep);
    this.base.sky.set(loc.sky);
    this.base.top.set(loc.skyTop);
    this.base.grass.set(loc.grass);
    this.scene.background = null;

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420, 110, 110).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.waterU,
        vertexShader: waterVert,
        fragmentShader: waterFrag,
        transparent: true,
        depthWrite: false,
      }),
    );
    water.renderOrder = 3;
    water.frustumCulled = false;
    this.decor.add(water);

    const bed = new THREE.Mesh(
      new THREE.CircleGeometry(300, 48).rotateX(-Math.PI / 2),
      lambert(loc.deep),
    );
    bed.position.y = -6;
    this.decor.add(bed);

    this.buildTerrain(loc);
    this.buildForest(loc, map);
    this.buildDock();
    this.buildFireflies();
    this.buildMountains(loc);
    this.hub = new Hub(map);
    this.hub.onWheelTick = () => audio.tick(0.07);
    this.decor.add(this.hub.group);
    this.town = new Town(map);
    this.decor.add(this.town.group);
    this.hall = null;
    this.lightPool.collect(this.decor);
  }

  private buildTerrain(loc: Location): void {
    const NR = 150;
    const NT = 120;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const grass = new THREE.Color(loc.grass);
    const sand = new THREE.Color(loc.sand);
    const rock = new THREE.Color(0x7d7a74);
    const dirt = new THREE.Color(0xa58b62);
    const c = new THREE.Color();
    const tmp = new THREE.Color();
    for (let j = 0; j <= NT; j++) {
      const th = -Math.PI + (j / NT) * Math.PI * 2;
      // One shared start radius keeps neighbouring columns aligned. A per-column start made long slivers across the bay behind the dock.
      const inner = 1;
      for (let i = 0; i <= NR; i++) {
        const r = inner + (175 - inner) * Math.pow(i / NR, 1.7);
        const x = Math.sin(th) * r;
        const z = Math.cos(th) * r;
        const y = groundHeight(x, z);
        pos.push(x, y, z);
        const n =
          0.88 + 0.24 * (Math.sin(x * 0.4) * Math.cos(z * 0.37) * 0.5 + 0.5);
        c.copy(sand).multiplyScalar(0.65 + 0.35 * smooth(-1.2, 0.4, y));
        const gm = smooth(0.3, 1.6, y);
        c.lerp(tmp.copy(grass).multiplyScalar(n), gm);
        if (y > 12) c.lerp(rock, Math.min(1, (y - 12) / 14));
        const pw = padWeight(x, z);
        if (pw > 0) c.lerp(dirt, pw * 0.85);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let j = 0; j < NT; j++) {
      for (let i = 0; i < NR; i++) {
        const a = j * (NR + 1) + i;
        const b = a + 1;
        const d = a + NR + 1;
        const e = d + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, lambert(0xffffff, { vertexColors: true }));
    mesh.receiveShadow = true;
    this.decor.add(mesh);
  }

  private buildForest(loc: Location, map: MapDef): void {
    const rnd = mulberry(loc.id === 'lake' ? 7 : 3);
    const clear = map.pad.r + 6;
    this.trees = [];
    const N = 300;
    const up = new THREE.Vector3(0, 1, 0);
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 5).translate(
      0,
      1.5,
      0,
    );
    const coneGeo = new THREE.ConeGeometry(2.0, 3.4, 7);
    const trunk = new THREE.InstancedMesh(trunkGeo, lambert(0x6b4a2b), N);
    const leafMat = lambert(0xffffff);
    const layers = [0, 1, 2].map(
      () => new THREE.InstancedMesh(coneGeo, leafMat, N),
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    let n = 0;
    for (let tries = 0; n < N && tries < 6000; tries++) {
      const th = (rnd() * 2 - 1) * Math.PI;
      const r = innerRadius(th) + 6 + Math.pow(rnd(), 1.5) * 140;
      if (r > 168) continue;
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r;
      const y = groundHeight(x, z);
      if (y < 0.8 || Math.hypot(x - map.pad.x, z - map.pad.z) < clear) continue;
      const s = 0.8 + rnd() * 1.6;
      this.trees.push({ x, z, r: 0.45 * s });
      q.setFromAxisAngle(up, rnd() * 6.28);
      trunk.setMatrixAt(n, m.compose(p.set(x, y - 0.1, z), q, sc.set(s, s, s)));
      col
        .set(loc.foliage)
        .offsetHSL(
          (rnd() - 0.5) * 0.04,
          (rnd() - 0.5) * 0.1,
          (rnd() - 0.5) * 0.1,
        );
      layers.forEach((l, k) => {
        l.setMatrixAt(
          n,
          m.compose(
            p.set(x, y + (2.2 + 1.7 * k) * s, z),
            q,
            sc.setScalar(s * (1 - 0.22 * k)),
          ),
        );
        l.setColorAt(n, col);
      });
      n++;
    }
    for (const mesh of [trunk, ...layers]) {
      mesh.count = n;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.decor.add(mesh);
    }

    const R = 450;
    const reeds = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.04, 1.4, 3).translate(0, 0.7, 0),
      lambert(0x7c8f3a),
      R,
    );
    let rn = 0;
    for (let tries = 0; rn < R && tries < 4000; tries++) {
      const th = (rnd() * 2 - 1) * Math.PI;
      const r = innerRadius(th) + (rnd() * 5 - 3.5);
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r;
      const y = groundHeight(x, z);
      if (y < -0.5 || y > 0.4 || onDock(x, z, 1.2)) continue;
      const s = 0.6 + rnd() * 0.9;
      q.setFromEuler(
        new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3),
      );
      reeds.setMatrixAt(rn++, m.compose(p.set(x, y, z), q, sc.set(s, s, s)));
    }
    reeds.count = rn;
    this.decor.add(reeds);

    const RK = 46;
    const rocks = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1),
      lambert(0x8a8a86),
      RK,
    );
    let kn = 0;
    for (let tries = 0; kn < RK && tries < 800; tries++) {
      const th = (rnd() * 2 - 1) * Math.PI;
      const r = innerRadius(th) + (rnd() * 12 - 7);
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r;
      if (onDock(x, z, 2) || Math.hypot(x - map.pad.x, z - map.pad.z) < clear)
        continue;
      const s = 0.4 + rnd() * 1.4;
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
      rocks.setMatrixAt(
        kn++,
        m.compose(
          p.set(x, groundHeight(x, z) + s * 0.2, z),
          q,
          sc.set(s, s * 0.7, s),
        ),
      );
    }
    rocks.count = kn;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.decor.add(rocks);
  }

  private buildDock(): void {
    const dock = new THREE.Group();
    const rnd = mulberry(5);
    const planks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 0.08, 1),
      lambert(0xffffff),
      260,
    );
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    const q = new THREE.Quaternion();
    let n = 0;
    const beamMat = lambert(0x5b4128);
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 3.1, 7);
    const inside = (x: number, z: number, skip: DockRect) =>
      DOCK_RECTS.some(
        (r) =>
          r !== skip &&
          x > r.x0 - 0.05 &&
          x < r.x1 + 0.05 &&
          z > r.z0 - 0.05 &&
          z < r.z1 + 0.05,
      );

    for (const r of DOCK_RECTS) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const alongZ = d >= w;
      const len = alongZ ? d : w;
      const wide = (alongZ ? w : d) - 0.1;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      for (let s = 0; s < len; s += 0.28) {
        const o = (alongZ ? r.z0 : r.x0) + s + 0.14;
        const pos = alongZ ? [cx, o] : [o, cz];
        planks.setMatrixAt(
          n,
          m.compose(
            new THREE.Vector3(pos[0], 0.66, pos[1]),
            q,
            alongZ
              ? new THREE.Vector3(wide, 1, 0.25)
              : new THREE.Vector3(0.25, 1, wide),
          ),
        );
        planks.setColorAt(
          n,
          c
            .set(0x8b6b43)
            .offsetHSL(0, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.1),
        );
        n++;
      }
      for (const side of [-1, 1]) {
        const off = side * (wide / 2 - 0.45);
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(alongZ ? 0.14 : len, 0.14, alongZ ? len : 0.14),
          beamMat,
        );
        beam.position.set(alongZ ? cx + off : cx, 0.55, alongZ ? cz : cz + off);
        beam.castShadow = true;
        dock.add(beam);
        for (let s = 0.3; s < len; s += 2.5) {
          const o = (alongZ ? r.z0 : r.x0) + s;
          const px = alongZ ? cx + off * 1.1 : o;
          const pz = alongZ ? o : cz + off * 1.1;
          if (inside(px, pz, r)) continue;
          const post = new THREE.Mesh(postGeo, beamMat);
          post.position.set(px, -0.6, pz);
          post.castShadow = true;
          dock.add(post);
        }
      }
    }
    planks.count = n;
    planks.castShadow = planks.receiveShadow = true;
    dock.add(planks);

    const glow = this.dockGlow;
    this.dockLights = [];
    for (const [x, z] of World.lanterns) {
      const light = new THREE.PointLight(0xffc266, 0, 14, 1.6);
      light.position.set(x, 1.6, z);
      dock.add(light);
      this.dockLights.push(light);
      const lanternPost = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6),
        beamMat,
      );
      lanternPost.position.set(x, 0.95, z);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow);
      lantern.position.set(x, 1.3, z);
      dock.add(lantern, lanternPost);
    }
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.45, 0.5),
      lambert(0x9c7a4a),
    );
    crate.position.set(0.85, 0.93, 2.5);
    crate.rotation.y = 0.4;
    crate.castShadow = true;
    const bucket = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.13, 0.3, 8),
      lambert(0x4a6fa5),
    );
    bucket.position.set(-0.8, 0.85, 1.6);
    bucket.castShadow = true;
    // Barrel and net stack out on the east pier, a coiled rope on the west.
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.7, 12),
      lambert(0x8a5a30),
    );
    barrel.position.set(7.8, 1.05, 4.5);
    barrel.castShadow = true;
    const rope = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.07, 6, 14),
      lambert(0xc8b07a),
    );
    rope.rotation.x = Math.PI / 2;
    rope.position.set(-7.6, 0.75, 4.5);
    dock.add(crate, bucket, barrel, rope, this.buildRowboat());
    this.decor.add(dock);
  }

  /** A little boat tied up beside the west pier. */
  private buildRowboat(): THREE.Group {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(
        1,
        16,
        8,
        0,
        Math.PI * 2,
        Math.PI / 2,
        Math.PI / 2,
      ),
      new THREE.MeshLambertMaterial({
        color: 0x8a5a30,
        side: THREE.DoubleSide,
      }),
    );
    hull.scale.set(0.6, 0.45, 1.5);
    hull.castShadow = true;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.04, 6, 24),
      lambert(0x5b4128),
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(0.6, 1.5, 1);
    const seat = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.06, 0.25),
      lambert(0x9b7248),
    );
    seat.position.y = -0.12;
    const oar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6),
      lambert(0xc8b07a),
    );
    oar.rotation.z = Math.PI / 2.3;
    oar.position.set(0.15, 0.1, 0.1);
    g.add(hull, rim, seat, oar);
    g.position.set(-5.5, 0.38, 7);
    g.rotation.y = Math.PI / 2 + 0.1;
    return g;
  }

  private buildMountains(loc: Location): void {
    const rnd = mulberry(21);
    const fogC = new THREE.Color(loc.sky);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd() * 0.2;
      const h = 45 + rnd() * 70;
      const mt = new THREE.Mesh(
        new THREE.ConeGeometry(45 + rnd() * 40, h, 6),
        lambert(new THREE.Color(0x56707e).lerp(fogC, 0.45).getHex()),
      );
      const d = 250 + rnd() * 30;
      mt.position.set(Math.sin(a) * d, h / 2 - 6, Math.cos(a) * d);
      this.decor.add(mt);
    }
  }

  castTarget(distance: number): THREE.Vector3 {
    return new THREE.Vector3(
      this.eye.x - Math.sin(this.yaw) * distance,
      0,
      this.eye.z - Math.cos(this.yaw) * distance,
    );
  }

  private static lanterns = [
    [1.1, -2.8],
    [-4.4, -5.9],
    [4.4, -5.9],
    [-1.35, 4.5],
    [1.35, 10],
  ];

  private static dockProps: Circle[] = [
    { x: 0.85, z: 2.5, r: 0.45 },
    { x: -0.8, z: 1.6, r: 0.22 },
    { x: 7.8, z: 4.5, r: 0.35 },
    { x: -7.6, z: 4.5, r: 0.25 },
    ...[
      [1.1, -2.8],
      [-4.4, -5.9],
      [4.4, -5.9],
    ].map(([x, z]) => ({ x, z, r: 0.1 })),
  ];

  get colliders(): Circle[] {
    return [...(this.indoor ? [] : World.dockProps), ...this.trees, ...(this.hub?.colliders ?? []), ...(this.town?.colliders ?? []), ...(this.hall?.colliders ?? [])];
  }

  surface(x: number, z: number): number {
    return waveHeight(x, z, this.time);
  }

  addShake(v: number): void {
    this.shake = Math.max(this.shake, v);
  }

  update(dt: number): void {
    this.time += dt;
    const t = this.time;
    this.waterU.uTime.value = t;
    this.updateDaylight(t);
    this.stars.position.copy(this.camera.position);
    this.sky.position.copy(this.camera.position);
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.6;
      if (c.position.x > 600) c.position.x = -600;
    }

    const s = this.shake;
    this.camera.position.set(
      this.eye.x,
      this.eye.y + Math.sin(t * 1.3) * 0.012 + this.walkBob,
      this.eye.z,
    );
    this.sun.target.position.set(this.eye.x, 0, this.eye.z);
    this.sun.position
      .copy(SUN_DIR)
      .multiplyScalar(80)
      .add(this.sun.target.position);
    this.hub?.update(t, this.eye.x, this.eye.z);
    this.town?.update(t, this.eye.x, this.eye.z);
    this.hall?.update(t, this.nightNow);
    this.lightPool.update(dt, this.eye);
    this.camera.rotation.set(
      this.pitch +
        this.pitchKick +
        (Math.sin(t * 41) + Math.sin(t * 57)) * 0.5 * s * 0.012,
      this.yaw + (Math.sin(t * 47) + Math.sin(t * 63)) * 0.5 * s * 0.012,
      Math.sin(t * 29) * s * 0.01,
    );
    const fov = 70 + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.fovKick *= Math.exp(-6 * dt);
    this.pitchKick *= Math.exp(-5 * dt);
    this.shake *= Math.exp(-5 * dt);

    this.rig.update(dt);
    this.fx.update(dt, t);
    this.bobber.visible = this.bobberVisible;
    if (this.frame++ % 3 === 0) this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
}
