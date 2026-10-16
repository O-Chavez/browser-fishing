import { audio } from './audio';
import * as THREE from 'three';
import type { Location } from '../data/content';
import type { MapDef } from '../data/maps';
import { groundHeight, innerRadius, mulberry, onDock, padWeight, setPad, waveHeight } from './env';
import { Hub } from './hub';
import type { Circle } from './player';
import { FX } from './fx';
import { LineRenderer, Rig } from './rig';

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

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

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
  private trees: Circle[] = [];
  yaw = 0;
  pitch = -0.12;
  time = 0;
  bobberVisible = false;
  fovKick = 0;
  pitchKick = 0;
  private shake = 0;
  private decor = new THREE.Group();
  private clouds = new THREE.Group();
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
    uSunDir: { value: SUN_DIR },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 30 },
    uFogFar: { value: 280 },
  };
  private skyU = {
    uHorizon: this.waterU.uSkyH,
    uTop: this.waterU.uSkyT,
    uSunDir: { value: SUN_DIR },
    uSunCol: { value: new THREE.Color(0xfff2d8) },
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera.position.copy(this.eye);
    this.camera.rotation.order = 'YXZ';
    this.camera.add(this.rig.root);
    this.scene.add(this.camera, this.decor, this.clouds, this.fx.group, this.line.line, this.bobber, this.hemi);

    this.sun.position.copy(SUN_DIR).multiplyScalar(80).add(new THREE.Vector3(0, 0, 4));
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
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xe8281f));
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      lambert(0xf5f5f5),
    );
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 5), lambert(0xe8281f));
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
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.92 });
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
  }

  setLocation(loc: Location, map: MapDef): void {
    setPad(map.pad);
    this.scene.remove(this.decor);
    disposeGroup(this.decor);
    this.decor = new THREE.Group();
    this.scene.add(this.decor);

    const u = this.waterU;
    u.uShallow.value.set(loc.water);
    u.uDeep.value.set(loc.deep);
    u.uSkyH.value.set(loc.sky);
    u.uSkyT.value.set(loc.skyTop);
    u.uFogColor.value.set(loc.sky);
    this.scene.fog = new THREE.Fog(loc.sky, 30, 280);
    this.scene.background = null;
    this.hemi.color.set(loc.skyTop).lerp(new THREE.Color(0xffffff), 0.5);
    this.hemi.groundColor.set(loc.grass).multiplyScalar(0.5);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420, 170, 170).rotateX(-Math.PI / 2),
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

    const bed = new THREE.Mesh(new THREE.CircleGeometry(300, 48).rotateX(-Math.PI / 2), lambert(loc.deep));
    bed.position.y = -6;
    this.decor.add(bed);

    this.buildTerrain(loc);
    this.buildForest(loc, map);
    this.buildDock();
    this.buildMountains(loc);
    this.hub = new Hub(map);
    this.hub.onWheelTick = () => audio.tick(0.07);
    this.decor.add(this.hub.group);
  }

  private buildTerrain(loc: Location): void {
    const NR = 70;
    const NT = 160;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const grass = new THREE.Color(loc.grass);
    const sand = new THREE.Color(loc.sand);
    const rock = new THREE.Color(0x7d7a74);
    const dirt = new THREE.Color(0xa58b62);
    const c = new THREE.Color();
    for (let j = 0; j <= NT; j++) {
      const th = -Math.PI + (j / NT) * Math.PI * 2;
      const inner = innerRadius(th) - 14;
      for (let i = 0; i <= NR; i++) {
        const r = inner + (175 - inner) * Math.pow(i / NR, 1.6);
        const x = Math.sin(th) * r;
        const z = Math.cos(th) * r;
        const y = groundHeight(x, z);
        pos.push(x, y, z);
        const n = 0.88 + 0.24 * (Math.sin(x * 0.4) * Math.cos(z * 0.37) * 0.5 + 0.5);
        if (y < 0.15) c.copy(sand).multiplyScalar(0.65);
        else if (y < 1.4) c.copy(sand).lerp(grass, (y - 0.15) / 1.25);
        else c.copy(grass).multiplyScalar(n);
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
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 5).translate(0, 1.5, 0);
    const coneGeo = new THREE.ConeGeometry(2.0, 3.4, 7);
    const trunk = new THREE.InstancedMesh(trunkGeo, lambert(0x6b4a2b), N);
    const leafMat = lambert(0xffffff);
    const layers = [0, 1, 2].map(() => new THREE.InstancedMesh(coneGeo, leafMat, N));
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
      col.set(loc.foliage).offsetHSL((rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.1);
      layers.forEach((l, k) => {
        l.setMatrixAt(n, m.compose(p.set(x, y + (2.2 + 1.7 * k) * s, z), q, sc.setScalar(s * (1 - 0.22 * k))));
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
    const reeds = new THREE.InstancedMesh(new THREE.ConeGeometry(0.04, 1.4, 3).translate(0, 0.7, 0), lambert(0x7c8f3a), R);
    let rn = 0;
    for (let tries = 0; rn < R && tries < 4000; tries++) {
      const th = (rnd() * 2 - 1) * Math.PI;
      const r = innerRadius(th) + (rnd() * 5 - 3.5);
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r;
      const y = groundHeight(x, z);
      if (y < -0.5 || y > 0.4 || onDock(x, z, 1.2)) continue;
      const s = 0.6 + rnd() * 0.9;
      q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * 6, (rnd() - 0.5) * 0.3));
      reeds.setMatrixAt(rn++, m.compose(p.set(x, y, z), q, sc.set(s, s, s)));
    }
    reeds.count = rn;
    this.decor.add(reeds);

    const RK = 46;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1), lambert(0x8a8a86), RK);
    let kn = 0;
    for (let tries = 0; kn < RK && tries < 800; tries++) {
      const th = (rnd() * 2 - 1) * Math.PI;
      const r = innerRadius(th) + (rnd() * 12 - 7);
      const x = Math.sin(th) * r;
      const z = Math.cos(th) * r;
      if (onDock(x, z, 2) || Math.hypot(x - map.pad.x, z - map.pad.z) < clear) continue;
      const s = 0.4 + rnd() * 1.4;
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
      rocks.setMatrixAt(kn++, m.compose(p.set(x, groundHeight(x, z) + s * 0.2, z), q, sc.set(s, s * 0.7, s)));
    }
    rocks.count = kn;
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.decor.add(rocks);
  }

  private buildDock(): void {
    const dock = new THREE.Group();
    const rnd = mulberry(5);
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.08, 0.25), lambert(0xffffff), 64);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (let z = -3; z < 12; z += 0.28) {
      planks.setMatrixAt(n, m.makeTranslation(0, 0.66, z + 0.14));
      planks.setColorAt(n, c.set(0x8b6b43).offsetHSL(0, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.1));
      n++;
    }
    planks.count = n;
    planks.castShadow = planks.receiveShadow = true;
    dock.add(planks);

    const beamMat = lambert(0x5b4128);
    for (const x of [-0.9, 0.9]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 15), beamMat);
      beam.position.set(x, 0.55, 4.5);
      beam.castShadow = true;
      dock.add(beam);
    }
    const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 3.1, 7);
    for (let z = -2.8; z < 12; z += 2.5) {
      for (const x of [-1.1, 1.1]) {
        const post = new THREE.Mesh(postGeo, beamMat);
        post.position.set(x, -0.6, z);
        post.castShadow = true;
        dock.add(post);
      }
    }
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    lantern.position.set(1.1, 1.15, -2.8);
    const lanternPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), beamMat);
    lanternPost.position.set(1.1, 0.95, -2.8);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), lambert(0x9c7a4a));
    crate.position.set(0.85, 0.93, 2.5);
    crate.rotation.y = 0.4;
    crate.castShadow = true;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 8), lambert(0x4a6fa5));
    bucket.position.set(-0.8, 0.85, 1.6);
    bucket.castShadow = true;
    dock.add(lantern, lanternPost, crate, bucket);
    this.decor.add(dock);
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
    return new THREE.Vector3(this.eye.x - Math.sin(this.yaw) * distance, 0, this.eye.z - Math.cos(this.yaw) * distance);
  }

  private static dockProps: Circle[] = [
    { x: 0.85, z: 2.5, r: 0.45 },
    { x: -0.8, z: 1.6, r: 0.22 },
    { x: 1.1, z: -2.8, r: 0.1 },
  ];

  get colliders(): Circle[] {
    return [...World.dockProps, ...this.trees, ...(this.hub?.colliders ?? [])];
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
    this.sky.position.copy(this.camera.position);
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.6;
      if (c.position.x > 600) c.position.x = -600;
    }

    const s = this.shake;
    this.camera.position.set(this.eye.x, this.eye.y + Math.sin(t * 1.3) * 0.012 + this.walkBob, this.eye.z);
    this.sun.target.position.set(this.eye.x, 0, this.eye.z);
    this.sun.position.copy(SUN_DIR).multiplyScalar(80).add(this.sun.target.position);
    this.hub?.update(t, this.eye.x, this.eye.z);
    this.camera.rotation.set(
      this.pitch + this.pitchKick + (Math.sin(t * 41) + Math.sin(t * 57)) * 0.5 * s * 0.012,
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
    this.renderer.render(this.scene, this.camera);
  }
}
