/**
 * The Abyss's emote, "Rough crossing, hunted" (Oscar's pick, 2026-11-16, concept F6; GAME_DESIGN.md §40). A patch of
 * the Abyss's dark, rough sea with whitecaps spreads from the player's feet; a toy Pelican (the charter boat, Captain
 * Reed at the wheel; `pelican.ts`) surfaces under them and carries them over the swell, the player locked to her deck,
 * pitching and rolling with her and glancing at each threat. Three storm cells build up round the far side and strike
 * six times; the Abyss's three legends surface round the boat, stalk it and strike together at the peak (6 s): the
 * Coiled Leviathan glides round in long heavy curves and lunges, the Kraken's arms wriggle and curl, come over the rail
 * and whip the sea, the Drowned Dreamer hangs still, stares and lashes. Then everything sinks away.
 *
 * The camera circles once over the emote, starting behind the player (`ThirdPerson`, 5.5 m back: the catalog's
 * `cameraDistance`); the legends' ring and the storm turn with it, a little slower, so they stay on the far side of the
 * player in the player's own view. Nothing of a legend passes through the boat or the player: bodies are pushed out of
 * her (`clearOfBoat`), and the Kraken's arms are kept out by a reach limit and a smooth field in her moving frame
 * (`smoothClear`), so they never jump from frame to frame.
 */
import * as THREE from 'three';
import { DEEP_LOOKS, BOAT } from '../../../data/sea';
import { WATER_ORDER, mulberry } from '../../env';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, freeLook, glowSprite, hop, lerp, progress, seedOf, smoothstep, wobble } from '../kit';
import { TAU, type V3 } from '../meshes';
import type { EmoteCtx, EmoteLook, EmotePose } from '../types';
import { armCurve, dreamerEyesRig, dreamerFace, dreamerTentacles, glowMat, hideMat, krakenArmTubes, krakenMantle, leviathanRig, mergeParts, part, pulse, type ArmBend } from './legends';
import { PEL_SPOT, clearOfBoat, hullReach, pelican, reachAt, smoothClear, toyHull, type ToyHull } from './pelican';

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const ABYSS_SECONDS = 9.5;
/** How far back the circling camera stands, so the boat, the storm and the legends round her fit. */
export const ABYSS_CAMERA = 5.5;

const H = Math.PI / 2;
const L = ABYSS_SECONDS;
/** The strike, when the legends close in together. */
const PEAK = 6.0;
/** When the legends rise, and when they start to sink. */
const T_IN = 1.5;
const T_OUT = 7.1;
/** The toy boat's size against the real Pelican, the sea patch's reach, and the sea's height at the legends. */
const BOAT_S = 0.24;
const SEA_R = 2.6;
const SEA_AT = 0.32;
/**
 * How much the boat pitches and rolls on the swell (and the player with her, locked to her deck): the design round's
 * F6 rocked at 1.12, and Oscar asked for about a third less after seeing it (2026-11-16), so 0.73. Her heave and the
 * sea itself are as designed. Then how much spray she throws off her bow, and how far down the crests the whitecaps reach.
 */
const TILT = 0.73;
const SPRAY_K = 1.7;
const CAPS = 0.58;
/** How far out from a storm cell its bolts land, as a share of the cell's distance. */
const STRIKE_IN = 0.8;
/** The storm cells round the far side: angle, distance, height, size and when each starts to build. */
const CELLS = [
  { a: Math.PI, r: 2.75, y: 3.55, k: 0.8, t0: 1.4 },
  { a: Math.PI + 1.05, r: 2.85, y: 3.3, k: 0.64, t0: 0.4 },
  { a: Math.PI - 1.1, r: 2.8, y: 3.4, k: 0.68, t0: 0.9 },
];
/** The lightning: when, how hard, and out of which cell. */
const STRIKES = [
  { t: 2.5, k: 0.35, cell: 1 },
  { t: 3.4, k: 0.45, cell: 2 },
  { t: 4.2, k: 0.55, cell: 1 },
  { t: 5.0, k: 0.65, cell: 2 },
  { t: PEAK, k: 1, cell: 0 },
  { t: 7.0, k: 0.45, cell: 1 },
];
/** How rough the sea is at `t` (1 the lab's first swell): building to the peak, easing off after. */
const rough = (t: number): number =>
  1.22 * (0.6 + 0.3 * smoothstep(0.8, 2.6, t) + 0.25 * smoothstep(4.4, PEAK, t) - 0.25 * smoothstep(PEAK + 0.6, 8.0, t) - 0.5 * smoothstep(7.8, 9.2, t));
/** Where the camera is round the player at `t` (0 in front): it starts behind and circles once. */
const camAzAt = (t: number): number => Math.PI + (TAU * t) / L;
/** The storm's and the legends' frame: the camera's turn, a little slower, so they drift round. */
const turnAt = (t: number): number => camAzAt(t) - 0.35 * (TAU / L) * (t - PEAK);

// ---------- the Abyss's colours (src/data/sea.ts's DEEP_LOOKS, and src/game/sea.ts's lightning) ----------

const AB = DEEP_LOOKS.abyss;
const BOLT = 0xf4f0ff;
const FLASH = 0xd8ccff;
const FOAM = AB.foam;
/** The whitecaps' white. */
const CAP_WHITE = 0xe4e2f0;

// ---------- small helpers ----------

/** 0 before a, rising to 1 by b, falling back to 0 between c and d (eased). */
const inOut = (t: number, a: number, b: number, c: number, d: number): number => Math.min(smoothstep(a, b, t), 1 - smoothstep(c, d, t));
/** 0 -> 1 -> 0 over 0..1 (a half sine). */
const arc = (x: number): number => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
/** A strike's light `a` seconds after it lands: a quick rise and a soft fade, no strobing. */
const flashAt = (a: number): number => (a < 0 ? 0 : a < 0.05 ? a / 0.05 : Math.exp(-(a - 0.05) * 5));
/** The bolt itself flickers a little, as the sea's does, but stays small. */
const boltAt = (a: number): number => {
  if (a < 0 || a > 0.9) return 0;
  const on = a < 0.1 || (a > 0.16 && a < 0.26) || (a > 0.36 && a < 0.5);
  return (on ? 1 : 0.4) * (1 - smoothstep(0.45, 0.9, a));
};

const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _wm = new THREE.Matrix4();
const _SC = new THREE.Vector3();
const UP3 = new THREE.Vector3(0, 1, 0);
const ZERO4 = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------- the storm ----------

/** A forked bolt of chunky boxes from `from` down to `to`, as the sea's lightning draws them; from the seed, so every play strikes the same way. */
function boltGeo(rnd: () => number, from: V3, to: V3, steps: number, w: number, jag: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const seg = (p: THREE.Vector3, q: THREE.Vector3, ww: number) => {
    const d = q.clone().sub(p);
    const g = new THREE.BoxGeometry(ww, d.length() + ww * 0.6, ww);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
    g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
    parts.push(part(g, 0xffffff));
  };
  const A = new THREE.Vector3(...from);
  const B = new THREE.Vector3(...to);
  const stepLen = B.distanceTo(A) / steps;
  let p = A.clone();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const q = A.clone().lerp(B, k);
    if (i < steps) q.add(new THREE.Vector3((rnd() - 0.5) * jag, (rnd() - 0.5) * jag * 0.3, (rnd() - 0.5) * jag));
    seg(p, q, w * (1 - k * 0.35));
    if (i < steps - 1 && rnd() < 0.45) {
      // A short fork, out and down.
      let f = q.clone();
      const out = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize();
      const len = 2 + Math.floor(rnd() * 2);
      for (let j = 0; j < len; j++) {
        const g = f.clone().add(new THREE.Vector3(out.x * jag * 0.6 + (rnd() - 0.5) * jag * 0.4, -stepLen * (0.6 + rnd() * 0.4), out.z * jag * 0.6 + (rnd() - 0.5) * jag * 0.4));
        g.y = Math.max(0.05, g.y);
        seg(f, g, w * 0.5);
        f = g;
      }
    }
    p = q;
  }
  return mergeParts(parts);
}

/** A bolt mesh, hidden until it strikes. */
function boltMesh(geo: THREE.BufferGeometry): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: BOLT, transparent: true, opacity: 0, fog: false, toneMapped: false }));
  m.visible = false;
  return m;
}

/** One low-poly cloud lump, darker underneath: the Abyss's cloud colours. */
function lumpGeo(): THREE.BufferGeometry {
  const p = part(new THREE.IcosahedronGeometry(1, 1), 0xffffff);
  const pos = p.attributes.position;
  const col = p.attributes.color;
  const top = new THREE.Color(AB.cloudTop).lerp(new THREE.Color(0x6a5a84), 0.35);
  const bot = new THREE.Color(AB.cloudBot);
  // Colour per face (by its centre's height), so the facets read.
  for (let f = 0; f < pos.count; f += 3) {
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    _c.copy(bot).lerp(top, smoothstep(-0.7, 0.8, y));
    for (let k = 0; k < 3; k++) col.setXYZW(f + k, _c.r, _c.g, _c.b, 1);
  }
  return p;
}

/** The cloud's own plum glow: by day it lifts the underside off black so the facets read; at night it outlines it. */
const cloudLift = (ctx: EmoteCtx): number => 0.22 - 0.08 * ctx.dark;
const cloudMat = (ctx: EmoteCtx): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.95, emissive: 0x6a5a96, emissiveIntensity: cloudLift(ctx) });

// ---------- the sea ----------

/**
 * A faceted mesh of corners (unique points) laid out once, whose heights, places and colours are rewritten each frame:
 * one height and one colour per corner, copied to its triangles.
 */
function cornerMesh(ux: number[], uz: number[], tris: number[], mat: THREE.Material) {
  const n = tris.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 4);
  tris.forEach((u, i) => {
    pos[i * 3] = ux[u];
    pos[i * 3 + 2] = uz[u];
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const uy = new Float32Array(ux.length);
  const uc = new Float32Array(ux.length * 4);
  return {
    mesh,
    uy,
    uc,
    flush(uxNow: number[], uzNow: number[]) {
      for (let i = 0; i < n; i++) {
        const u = tris[i];
        pos[i * 3] = uxNow[u];
        pos[i * 3 + 2] = uzNow[u];
        pos[i * 3 + 1] = uy[u];
        col[i * 4] = uc[u * 4];
        col[i * 4 + 1] = uc[u * 4 + 1];
        col[i * 4 + 2] = uc[u * 4 + 2];
        col[i * 4 + 3] = uc[u * 4 + 3];
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}

/**
 * The patch of the Abyss's water, about 5 m across: its long swells running bow to stern with whitecaps on the crests,
 * in the sea's own colours. It has no hard rim: past the boat the waves flatten, it slopes down to the ground and turns
 * see-through.
 */
function abyssSea(dark: number, hull: ToyHull) {
  const R = SEA_R;
  const RINGS = Array.from({ length: Math.round(R / 0.2) + 1 }, (_, i) => i * (R / Math.round(R / 0.2)));
  const SEG = 36;
  const ux: number[] = [0];
  const uz: number[] = [0];
  for (let ri = 1; ri < RINGS.length; ri++) {
    for (let si = 0; si < SEG; si++) {
      const a = (si / SEG) * TAU + (ri % 2) * (Math.PI / SEG);
      ux.push(Math.sin(a) * RINGS[ri]);
      uz.push(Math.cos(a) * RINGS[ri]);
    }
  }
  const uid = (ri: number, si: number) => (ri === 0 ? 0 : 1 + (ri - 1) * SEG + (si % SEG));
  const tris: number[] = [];
  for (let ri = 0; ri < RINGS.length - 1; ri++) {
    for (let si = 0; si < SEG; si++) {
      if (ri === 0) tris.push(uid(0, 0), uid(1, si), uid(1, si + 1));
      else tris.push(uid(ri, si), uid(ri + 1, si), uid(ri + 1, si + 1), uid(ri, si), uid(ri + 1, si + 1), uid(ri, si + 1));
    }
  }
  const m = cornerMesh(
    ux,
    uz,
    tris,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, transparent: true, depthWrite: true, side: THREE.DoubleSide, emissive: 0x30386a, emissiveIntensity: 0 }),
  );
  const cWater = new THREE.Color(AB.water).lerp(new THREE.Color(AB.nightWater), dark);
  const cDeep = new THREE.Color(AB.deep).lerp(new THREE.Color(AB.nightDeep), dark);
  const lo = cWater.clone().lerp(cDeep, 0.35).multiplyScalar(0.95);
  const hi = cWater.clone().multiplyScalar(1.75);
  const foam = new THREE.Color(CAP_WHITE).multiplyScalar(1 - 0.35 * dark);
  const level = 0.36;
  const K = 1.45;
  const V = 2.0;
  /** A swell with pointed crests and long troughs (-1..1). */
  const peaky = (th: number) => 2 * Math.pow(0.5 + 0.5 * Math.sin(th), 1.7) - 0.75;
  const h = (x: number, z: number, t: number, rk: number) =>
    rk * (0.24 * peaky(K * (z + V * t)) + 0.07 * Math.sin(2.4 * (0.6 * x + 0.8 * z) + 3.1 * t + 1) + 0.045 * Math.sin(3.3 * (-0.7 * x + 0.7 * z) + 2.5 * t + 0.4));
  const ur = ux.map((x, i) => Math.hypot(x, uz[i]));
  const sx = ux.slice();
  const sz = uz.slice();
  /** Paints a corner: navy from trough to crest, white at the crests, fading out to `alpha`. */
  const paintCorner = (i: number, crest: number, white: number, alpha: number): void => {
    _c.copy(lo).lerp(hi, clamp01(crest)).lerp(foam, clamp01(white));
    m.uc[i * 4] = _c.r;
    m.uc[i * 4 + 1] = _c.g;
    m.uc[i * 4 + 2] = _c.b;
    m.uc[i * 4 + 3] = alpha;
  };
  return {
    mesh: m.mesh,
    level,
    h,
    /** Moves its surface, keeping it under the hull where she floats (`wl` is her waterline's height at a point). */
    update(t: number, rk: number, wl: (x: number, z: number) => number, keel: number, spread: number) {
      for (let i = 0; i < ux.length; i++) {
        const x = (sx[i] = ux[i] * spread);
        const z = (sz[i] = uz[i] * spread);
        const r = ur[i];
        const env = 1 - smoothstep(0.64 * R, 0.98 * R, r);
        const hh = h(x, z, t, rk) * env;
        let y = level * (1 - smoothstep(0.68 * R, R, r)) + hh;
        let under = 1;
        if (z > hull.stern - 0.1 && z < hull.bow + 0.1 && Math.abs(x) < hull.half(z) + 0.06) {
          y = lerp(y, Math.min(y, wl(x, z) - 0.02), keel);
          under = 1 - keel;
        }
        m.uy[i] = y;
        const crest = 0.5 + hh / (0.6 * Math.max(0.3, rk));
        // White caps only on the very tops of the crests (and not where the hull holds the water down).
        const top = hh / (0.42 * Math.max(0.3, rk));
        paintCorner(i, crest, under * 0.95 * smoothstep(CAPS, CAPS + 0.2, top) * smoothstep(0.7, 1.1, r) + 0.45 * smoothstep(0.73 * R, 0.93 * R, r) * (0.5 + 0.5 * Math.sin(ux[i] * 5 + uz[i] * 3 + t * 3)), 1 - smoothstep(0.5 * R, R, r));
      }
      m.flush(sx, sz);
      m.mesh.visible = spread > 0.005;
    },
    /** Seconds since the last crest broke on the bow, for the spray. */
    bowAge(t: number) {
      const P = TAU / (K * V);
      const t0 = (Math.PI / 2 / K - hull.bow) / V;
      return (((t - t0) % P) + P) % P;
    },
  };
}

// ---------- the crossing: the sea, the toy Pelican, her wake and spray, rain, the storm cells and their lightning ----------

/**
 * The toy Pelican surfaces under the player and rides the rough sea (her heave, pitch and roll are the player's lift,
 * pitch and roll, so they stay locked to her deck), with a wake, spray off the bow every time a crest breaks on it,
 * rain, a plum gloom round her, and three storm cells round the far side building up and striking.
 */
function crossing(ctx: EmoteCtx, hull: ToyHull) {
  const group = new THREE.Group();
  const rnd = mulberry(seedOf('abyss-F2'));
  const dark = ctx.dark;
  const BOW2 = hull.bow;
  const STERN2 = hull.stern;
  const sea = abyssSea(dark, hull);
  group.add(sea.mesh);

  const deck = new THREE.Group();
  const pel = pelican(dark);
  pel.group.scale.setScalar(hull.s);
  pel.group.rotation.y = -H;
  pel.group.position.set(0, -BOAT.deck * hull.s, -PEL_SPOT * hull.s);
  deck.add(pel.group);
  const lampGlow = glowSprite(0xffd9a0, 1.8, 0);
  lampGlow.position.set(0, 0.8, 0.2);
  deck.add(lampGlow);
  group.add(deck);

  // The wake off the stern, in two arms.
  const WAKE = 18;
  const wake = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 6).rotateX(-H), new THREE.MeshBasicMaterial({ color: 0xd8d6e8, transparent: true, opacity: 0.6 - 0.25 * dark, depthWrite: false }), WAKE);
  wake.frustumCulled = false;
  wake.renderOrder = 2;
  group.add(wake);
  // Spray off the bow each time a crest breaks on it.
  const SPRAY = Math.round(22 * SPRAY_K);
  const spray = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: 0xeceaf6, transparent: true, opacity: 0.9 }), SPRAY);
  spray.frustumCulled = false;
  const drops = Array.from({ length: SPRAY }, (_, i) => ({ sd: i % 2 ? 1 : -1, vx: 0.5 + rnd() * 1.0, vy: 1.4 + rnd() * 1.2, vz: -0.2 + rnd() * 0.8, s: 0.6 + rnd() * 0.9, d: rnd() * 0.1 }));
  const sprayK = Math.sqrt(SPRAY_K);
  group.add(spray);
  // Rain, slanting on the wind.
  const RAIN = 46;
  const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.24, 0.025), new THREE.MeshBasicMaterial({ color: 0xc8c4dc, transparent: true, opacity: 0.5 - 0.15 * dark, depthWrite: false }), RAIN);
  rain.frustumCulled = false;
  const RR = SEA_R * 0.82;
  const RTOP = 2.9;
  const rainD = Array.from({ length: RAIN }, () => ({ a: rnd() * TAU, r: Math.sqrt(rnd()) * RR, off: rnd(), sp: 0.9 + rnd() * 0.3 }));
  group.add(rain);

  // A plum gloom gathering round the boat, drawn from the inside only so it darkens what's behind her and never covers
  // her, darkest low over the water and fading out upward.
  const gg = part(new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, H), 0xffffff);
  const pp = gg.attributes.position as THREE.BufferAttribute;
  const cc = gg.attributes.color as THREE.BufferAttribute;
  const plum = new THREE.Color(AB.cloudBot).lerp(new THREE.Color(AB.cloudTop), 0.5);
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i);
    pp.setXYZ(i, pp.getX(i) * (SEA_R + 0.3), y * 3.2, pp.getZ(i) * (SEA_R + 0.3));
    cc.setXYZW(i, plum.r, plum.g, plum.b, (0.34 - 0.08 * dark) * (1 - smoothstep(0.0, 0.5, y)));
  }
  const gloom = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.BackSide, depthWrite: false, opacity: 0 }));
  group.add(gloom);

  // Three storm cells in clear cumulus shapes round the far side (their frame turns with the camera, like the legends'
  // ring), building up tier by tier into towers, each lit from within when it strikes.
  const stormFrame = new THREE.Group();
  group.add(stormFrame);
  const cells = CELLS.map((sp) => {
    const lumps: { x: number; y: number; z: number; s: number; sy: number; tier: number; d: number; ph: number }[] = [];
    const add = (x: number, y: number, z: number, s: number, sy: number, tier: number) => lumps.push({ x: x * sp.k, y: y * sp.k, z: z * sp.k, s: s * sp.k, sy, tier, d: rnd(), ph: rnd() * 10 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      add(Math.sin(a) * 0.72, 0.1, Math.cos(a) * 0.6, 0.38, 0.45, 0);
    }
    add(0, 0.18, 0, 0.46, 0.5, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      add(Math.sin(a) * 0.42, 0.45, Math.cos(a) * 0.36, 0.38, 0.7, 1);
    }
    add(-0.16, 0.78, 0.05, 0.36, 0.75, 2);
    add(0.2, 0.74, -0.08, 0.32, 0.75, 2);
    const mat = cloudMat(ctx);
    const mesh = new THREE.InstancedMesh(lumpGeo(), mat, lumps.length);
    mesh.frustumCulled = false;
    const x = Math.sin(sp.a) * sp.r;
    const z = Math.cos(sp.a) * sp.r;
    const glow = glowSprite(0xc0b0ff, 1.7 * sp.k, 0);
    glow.position.set(x, sp.y + 0.35 * sp.k, z);
    stormFrame.add(mesh, glow);
    return { mesh, mat, glow, x, z, y: sp.y, t0: sp.t0, lumps };
  });

  // Lightning out of the storm cells, landing on the sea round the boat.
  const strikes = STRIKES.map((s) => {
    const c = cells[s.cell];
    const x = c.x * STRIKE_IN + (rnd() - 0.5) * 0.3;
    const z = c.z * STRIKE_IN + (rnd() - 0.5) * 0.3;
    const bolt = boltMesh(boltGeo(rnd, [c.x, c.y + 0.05, c.z], [x, 0.25, z], 7, 0.07 + 0.05 * s.k, 0.4));
    const halo = glowSprite(FLASH, 2.5, 0);
    halo.position.set(x, 1.4, z);
    halo.scale.set(1.8, 3.2, 1);
    stormFrame.add(bolt, halo);
    return { ...s, bolt, halo };
  });

  /** The sea's height above the ground at (x, z) this frame. */
  let seaAt = (_x: number, _z: number): number => 0;
  const v = {
    group,
    sea: sea.mesh,
    gloom,
    /** Rides with the boat: the deck under the player's feet at its origin, the bow toward +z. */
    deck,
    /** The lightning's light this frame (0..1). */
    flash: 0,
    /** Rocks the boat on the swell and the player with it (lift, pitch and roll come from the same numbers). */
    update(t: number, pose: EmotePose) {
      const rk = rough(t);
      const spread = easeOutCubic(progress(0, 0.7, t)) * (1 - easeInCubic(progress(L - 0.7, L, t)));
      const up = easeOutBack(progress(0.15, 1.1, t), 1.1);
      const down = easeInCubic(progress(L - 1.1, L - 0.3, t));
      const rise = -1.6 * (1 - up) - 1.6 * down;
      const onDeck = smoothstep(-0.2, 0, rise);
      const h = (x: number, z: number) => sea.h(x, z, t, rk);
      const hs = h(0, STERN2 * 0.85);
      const hb = h(0, BOW2 * 0.85);
      const heave = (hs + hb + 2 * h(0, 0)) / 4;
      const pitch = TILT * 1.5 * Math.atan((hs - hb) / (BOW2 - STERN2)) * onDeck;
      const roll = TILT * (2.0 * Math.atan((h(0.45, 0.3) - h(-0.45, 0.3)) / 0.9) + 0.09 * rk * Math.sin(t * 2.1 + 0.6 * Math.sin(t * 0.7))) * onDeck;
      const Y = sea.level + heave + BOAT.deck * hull.s + rise;
      deck.position.y = Y;
      deck.rotation.set(pitch, 0, roll, 'YXZ');
      deck.visible = rise > -1.55;
      pose.lift = Math.max(0, Y);
      pose.pitch = pitch;
      pose.roll = roll;
      pel.radar.rotation.y = t * 1.7;
      lampGlow.material.opacity = 0.3 * dark * onDeck;
      lampGlow.visible = lampGlow.material.opacity > 0.005;

      const sp = Math.sin(pitch);
      const sr = Math.sin(roll);
      const wlY = Y - BOAT.deck * hull.s;
      sea.update(t, rk, (x, z) => wlY - z * sp + x * sr, onDeck, spread);
      seaAt = (x, z) => sea.level * spread + h(x, z);

      // The wake: two arms of foam streaming off the stern.
      const fk = onDeck * spread * smoothstep(1.0, 1.5, t);
      wake.visible = fk > 0.01;
      if (wake.visible) {
        for (let i = 0; i < WAKE; i++) {
          const a = (t / 1.3 + i / WAKE) % 1;
          const sd = i % 2 ? 1 : -1;
          const x = sd * (0.18 + a * 0.85);
          const z = STERN2 - 0.05 - a * 1.5;
          const s = (0.06 + a * 0.1) * (1 - smoothstep(0.6, 1, a)) * fk;
          _o.position.set(x, seaAt(x, z) + 0.02, z);
          _o.rotation.set(0, sd * 0.35, 0);
          _o.scale.set(Math.max(0.001, s), 1, Math.max(0.001, s * 2.4));
          _o.updateMatrix();
          wake.setMatrixAt(i, _o.matrix);
        }
        wake.instanceMatrix.needsUpdate = true;
      }
      // Spray.
      const age = sea.bowAge(t);
      spray.visible = onDeck > 0.5 && age < 0.75;
      if (spray.visible) {
        const by = wlY - BOW2 * sp + 0.08;
        for (let i = 0; i < SPRAY; i++) {
          const d = drops[i];
          const a = Math.max(0, age - d.d);
          _o.position.set(d.sd * (0.08 + d.vx * a * sprayK), by + d.vy * a * (0.6 + 0.5 * rk) * sprayK - 4.9 * a * a, BOW2 + d.vz * a);
          _o.scale.setScalar(Math.max(0.001, d.s * (1 - a / 0.75) * Math.min(1, rk * 1.1) * sprayK));
          _o.updateMatrix();
          spray.setMatrixAt(i, _o.matrix);
        }
        spray.instanceMatrix.needsUpdate = true;
      }
      // Rain.
      const rainK = inOut(t, 1.2, 2.2, L - 1.9, L - 0.9);
      rain.visible = rainK > 0.01;
      if (rain.visible) {
        _o.rotation.set(0.12, 0, 0.1);
        for (let i = 0; i < RAIN; i++) {
          const d = rainD[i];
          const f = (d.off + t * d.sp * 1.6) % 1;
          const x = Math.sin(d.a) * d.r - f * 0.2;
          const z = Math.cos(d.a) * d.r - f * 0.25;
          _o.position.set(x, RTOP - f * (RTOP - 0.25), z);
          _o.scale.setScalar(rainK > i / RAIN && f < 0.95 ? 1 : 0.001);
          _o.updateMatrix();
          rain.setMatrixAt(i, _o.matrix);
        }
        rain.instanceMatrix.needsUpdate = true;
      }
      // Lightning.
      let fl = 0;
      for (const s of strikes) {
        const a = t - s.t;
        const f = flashAt(a) * s.k;
        fl = Math.max(fl, f);
        const b = boltAt(a);
        s.bolt.visible = b > 0.01;
        s.bolt.material.opacity = b;
        s.halo.visible = f > 0.005;
        s.halo.material.opacity = f * (0.5 + 0.3 * dark);
      }
      v.flash = fl;
      // The cells: each builds up from its base, tier by tier, churns, flashes from within with its own strikes and
      // flickers between them, and breaks up and drifts off at the end.
      stormFrame.rotation.y = turnAt(t);
      const out = progress(L - 1.9, L - 0.6, t);
      cells.forEach((c, ci) => {
        let cf = 0;
        for (const s of strikes) if (s.cell === ci) cf = Math.max(cf, flashAt(t - s.t) * s.k);
        const rumble = 0.22 * Math.max(0, Math.sin(t * 2.3 + ci * 2) * Math.sin(t * 5.3 + ci)) * inOut(t, c.t0 + 1.5, c.t0 + 2.2, L - 2.2, L - 1.6);
        c.mat.emissiveIntensity = cloudLift(ctx) + 1.1 * cf + 0.3 * fl + rumble;
        c.glow.material.opacity = Math.min(1, cf * 0.9 + rumble * 1.5) * (0.6 + 0.4 * dark);
        c.glow.visible = c.glow.material.opacity > 0.005;
        const grow = 1 + 0.12 * smoothstep(3.5, 6, t);
        c.mesh.visible = t > c.t0 && out < 1;
        for (let i = 0; i < c.lumps.length; i++) {
          const l = c.lumps[i];
          const ta = c.t0 + l.tier * 0.85 + l.d * 0.35;
          const k = easeOutBack(progress(ta, ta + 0.7, t), 1.4);
          const o = easeInCubic(clamp01((out - l.d * 0.3) / 0.7));
          const s = Math.max(0.001, l.s * k * (1 - o) * grow * (1 + 0.06 * wobble(t, l.ph, 1.1)));
          _o.position.set(c.x + l.x * grow * (1 + o), c.y + l.y * grow + o * 0.7 + wobble(t, l.ph + 1, 0.7) * 0.04, c.z + l.z * grow * (1 + o));
          _o.rotation.set(l.ph, l.ph * 2 + t * 0.1, 0);
          _o.scale.set(s * 1.1, s * l.sy, s);
          _o.updateMatrix();
          c.mesh.setMatrixAt(i, _o.matrix);
        }
        c.mesh.instanceMatrix.needsUpdate = true;
      });
      gloom.material.opacity = inOut(t, 0.6, 2.2, L - 1.6, L - 0.5) * (1 - 0.6 * fl);
      gloom.visible = gloom.material.opacity > 0.005;
      (sea.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 * dark + 0.6 * fl;
    },
  };
  return v;
}

// ---------- the legends, hunting the boat together ----------

/** Where the legends sit before they're placed each frame. */
const SEA_Y = 0.2;

/** A legend in its own group at angle `a` round the player and radius `r`, facing the boat, with a ring of foam. */
function legendAt(group: THREE.Group, c: { body: THREE.BufferGeometry; glow: THREE.BufferGeometry }, a: number, r: number, emissive: number, scale: number) {
  const g = new THREE.Group();
  g.position.set(Math.sin(a) * r, SEA_Y - 0.05, Math.cos(a) * r);
  g.rotation.y = a + Math.PI;
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  const hide = hideMat(emissive);
  const glow = glowMat();
  inner.add(new THREE.Mesh(c.body, hide), new THREE.Mesh(c.glow, glow));
  g.add(inner);
  group.add(g);
  const splash = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 18).rotateX(-H), new THREE.MeshBasicMaterial({ color: FOAM, transparent: true, opacity: 0, depthWrite: false }));
  splash.position.set(g.position.x, SEA_Y + 0.16, g.position.z);
  group.add(splash);
  return { g, inner, hide, glow, splash, a };
}
type Legend = ReturnType<typeof legendAt>;

/** Rises a legend out of the sea from `t0` (stretching up out of the water) and sinks it from `t1`, with a ring of foam each time. */
function surface(l: Legend, t: number, t0: number, t1: number, dur = 1.1): number {
  const up = easeOutBack(progress(t0, t0 + dur, t), 1.1);
  const down = easeInCubic(progress(t1, t1 + 0.9, t));
  const k = Math.max(0, up * (1 - down));
  l.g.visible = k > 0.01;
  const w = 0.55 + 0.45 * Math.min(1, k);
  l.g.scale.set(w, Math.max(0.001, k), w);
  const s1 = progress(t0, t0 + dur, t);
  const s2 = progress(t1, t1 + 0.9, t);
  const ring = s1 > 0 && s1 < 1 ? s1 : s2 > 0 && s2 < 1 ? s2 : -1;
  l.splash.visible = ring >= 0;
  if (ring >= 0) {
    l.splash.scale.setScalar(0.6 + ring * 1.6);
    l.splash.material.opacity = (1 - ring) * 0.85;
  }
  l.glow.color.setScalar(clamp01(progress(t0 + 0.3, t0 + 1.2, t) * (1 - down)) * (0.85 + 0.15 * Math.sin(t * 4 + l.a)));
  return k;
}

/** The Kraken's arms: two great arms, two that whip the sea, four writhing at the surface. */
const ARMS: { a: number; e: number; len: number; r0: number; role: 'great' | 'slap' | 'writhe'; ph: number; period?: number; off?: number }[] = [
  { a: -0.42, e: 1.15, len: 1.6, r0: 0.11, role: 'great', ph: 0 },
  { a: 0.42, e: 1.15, len: 1.6, r0: 0.11, role: 'great', ph: 2.1 },
  { a: -1.3, e: 0.5, len: 1.3, r0: 0.09, role: 'slap', ph: 1.0, period: 2.3, off: 0.2 },
  { a: 1.3, e: 0.5, len: 1.3, r0: 0.09, role: 'slap', ph: 3.0, period: 2.9, off: 1.3 },
  { a: -2.0, e: 0.12, len: 1.05, r0: 0.08, role: 'writhe', ph: 0.5 },
  { a: 2.0, e: 0.12, len: 1.05, r0: 0.08, role: 'writhe', ph: 2.6 },
  { a: -2.65, e: 0.08, len: 1.0, r0: 0.075, role: 'writhe', ph: 4.1 },
  { a: 2.65, e: 0.08, len: 1.0, r0: 0.075, role: 'writhe', ph: 5.3 },
];

/** The great arms' slam as a beat in time: the player ducks on it. */
const slamAt = (t: number, lag: number): number => {
  const tt = t - lag;
  return easeInCubic(progress(PEAK - 0.25, PEAK - 0.05, tt)) * (1 - easeInOutSine(progress(PEAK + 0.7, PEAK + 1.6, tt)));
};

/**
 * The three legends hunting the boat together. They stalk and close in slowly, hold still on a threat, and move
 * suddenly only at the strikes, with a wind-up before and a follow-through after:
 * - the Leviathan glides slowly round the far side in long, heavy S-curves (its body flowing through the path its head
 *   swam), its head turned to hold its gaze on the player; it rears slowly, draws back, and strikes once at the peak;
 * - the Kraken breathes and watches, its arms wriggling and curling along their whole length: the great arms reach and
 *   slam, two whip the sea, four writhe at the surface; they come over the rail and onto the deck, never through her;
 * - the Dreamer hangs still and stares, its tentacles slowly undulating, and lashes them at the boat at the peak.
 * Their ring turns with the camera, so they stay on the far side of the player. `deck` is the boat's frame, for keeping
 * them out of her as she rocks. The player glances at whichever is the threat, leans away and ducks the slam.
 */
function legendRing(parent: THREE.Group, deck: THREE.Object3D, hull: ToyHull, ctx: EmoteCtx) {
  const ring = new THREE.Group();
  parent.add(ring);
  const dark = ctx.dark;
  const sea = SEA_AT;
  const reach = hullReach(hull);
  const STRIKE_TIMES = STRIKES.map((s) => s.t);
  const flinch = (t: number, lag: number) => STRIKE_TIMES.reduce((m, s) => Math.max(m, pulse(t - s - lag, 0.45)), 0);
  // The ring's frame to the boat's and back, this frame.
  const toDeck = new THREE.Matrix4();
  const toRing = new THREE.Matrix4();
  const D = new THREE.Vector3();
  /** Keeps a ring-frame point clear of the boat. */
  const clear = (p: THREE.Vector3, r: number): void => {
    if (p.x * p.x + p.z * p.z > (2.05 + r) * (2.05 + r)) return;
    D.copy(p).applyMatrix4(toDeck);
    clearOfBoat(D, r, hull);
    p.copy(D).applyMatrix4(toRing);
  };
  let ringRot = 0;
  /** The least distance from the middle a body may keep in a ring-frame direction `a`, to stay clear of the hull. */
  const minR = (a: number, margin: number) => reachAt(reach, a + ringRot) + margin;

  const foamMat = new THREE.MeshBasicMaterial({ color: FOAM, transparent: true, opacity: 0.6, depthWrite: false });
  const foam = new THREE.InstancedMesh(new THREE.RingGeometry(0.55, 1, 14).rotateX(-H), foamMat, 12);
  foam.frustumCulled = false;
  foam.renderOrder = 2;
  ring.add(foam);
  let nFoam = 0;
  const addFoam = (x: number, z: number, s: number): void => {
    if (nFoam >= 12 || s <= 0.005) return;
    _o.position.set(x, sea + 0.11, z);
    _o.rotation.set(0, 0, 0);
    _o.scale.set(s, 1, s);
    _o.updateMatrix();
    foam.setMatrixAt(nFoam++, _o.matrix);
  };

  // The shared beat: stalk, build (the threats held), the strike at the peak, the follow-through.
  const build = (t: number) => smoothstep(4.2, 5.4, t) * (1 - smoothstep(6.6, 7.6, t));
  const hit = (t: number) => pulse(t - (PEAK - 0.25), 0.5);

  // ----- the Leviathan: a long slow glide round the far side, head on the player, one strike.
  let lt = 0;
  let strikeK = 0;
  let rear = 0;
  const LAG = 5.2;
  const head = new THREE.Vector3(0, 1.6, 0);
  const lpath = (tau: number, out: THREE.Vector3): THREE.Vector3 => {
    const a = Math.PI + 0.55 - 0.21 * (tau - T_IN);
    // Long, heavy S-curves, fixed along its way so the whole body swims through them.
    const r = Math.max(2.0 + 0.2 * Math.sin(0.85 * tau), minR(a, 0.6));
    return out.set(Math.sin(a) * r, sea + 0.04 + 0.17 * Math.sin(1.25 * tau + 0.8), Math.cos(a) * r);
  };
  const emerge = (s: number) => easeOutCubic(progress(T_IN + s * 1.0, T_IN + 1.4 + s * 1.0, lt));
  const dive = (s: number) => easeInCubic(progress(T_OUT + s * 0.8, T_OUT + 0.9 + s * 0.8, lt));
  const SP = new THREE.Vector3();
  const lev = leviathanRig(
    0.21,
    44,
    (s, P) => {
      lpath(lt - s * LAG, P);
      // The neck rises slowly out of the sea and holds; behind it the body's humps roll through the surface.
      const neck = Math.pow(Math.max(0, 1 - s / 0.4), 1.6);
      P.y = P.y * (1 - neck) + (sea + rear + 0.05 * Math.sin(lt * 0.9)) * neck;
      // The strike: drawn back, then one lunge in at the player, held, and a slow recoil.
      const k = Math.pow(Math.max(0, 1 - s / 0.5), 2) * strikeK;
      SP.copy(head).sub(P);
      SP.y *= 0.5;
      const d = SP.length() || 1;
      P.addScaledVector(SP, (k * Math.min(1.25, d - 0.5)) / d);
      P.y -= 1.5 * (1 - emerge(s)) + 1.7 * dive(s);
      clear(P, 0.21);
    },
    (s) => smoothstep(0, 0.2, emerge(s)) * (1 - smoothstep(0.85, 1, dive(s))),
  );
  ring.add(...lev.meshes);
  const aim = new THREE.Matrix4();
  const AF = new THREE.Vector3();
  const AX = new THREE.Vector3();
  const AY = new THREE.Vector3();

  // ----- the Kraken: its mantle kept clear of the hull, and its arms.
  const KA = Math.PI + 1.6;
  const krk = legendAt(ring, krakenMantle(), KA, 1.9, 0xd06a8a, 0.43);
  const krBase = 0.43;
  const ASEG = 18;
  const arms = krakenArmTubes(ARMS.length, ASEG);
  ring.add(arms.mesh);
  const armPts = ARMS.map(() => new Float32Array((ASEG + 1) * 3));
  const bend: ArmBend = { k0: 0, amp: 0, freq: 1, speed: 1.3, ph: 0, curl: 0, lat: 0 };
  const root = new THREE.Vector3();
  const d0 = new THREE.Vector3();
  const b0 = new THREE.Vector3();
  const W = new THREE.Vector3();
  let armI = 0;
  let armR0 = 0;
  let armK = 0;
  const armFill = (_i: number, s: number, P: THREE.Vector3, R: { h: number; w: number }): void => {
    const j = Math.round(s * ASEG);
    const p = armPts[armI];
    P.set(p[j * 3], p[j * 3 + 1], p[j * 3 + 2]);
    R.h = R.w = armR0 * (1 - 0.82 * s) * armK;
  };
  let slam = 0;

  // ----- the Dreamer: hanging still and staring, its tentacles slowly undulating; it lashes at the peak.
  const df = dreamerFace();
  const DA = Math.PI - 1.5;
  const dre = legendAt(ring, { body: df.body, glow: df.glow }, DA, 1.8, 0x6ac8a8, 0.6);
  const eyes = dreamerEyesRig(dre.inner, df, dre.hide, dre.glow);
  const NT = 8;
  const TSEG = 14;
  const tents = dreamerTentacles(NT, TSEG, dre.hide);
  ring.add(tents.mesh);
  const look = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const tRoot = Array.from({ length: NT }, (_, i) => {
    const a = (i / NT) * TAU + 0.2;
    return { local: new THREE.Vector3(Math.sin(a) * 0.3, 1.5, Math.cos(a) * 0.3), a, ph: i * 1.3 };
  });
  const tR = new THREE.Vector3();
  const tOutv = new THREE.Vector3();
  const toBoat = new THREE.Vector3();
  let tI = 0;
  let tK = 0;
  let lash = 0;
  const tentFill = (_i: number, s: number, P: THREE.Vector3, R: { h: number; w: number }): void => {
    const tr = tRoot[tI];
    P.copy(tR).addScaledVector(tOutv, 0.12 * s * tK);
    P.y -= 1.25 * tK * s * (1 - 0.25 * lash * s);
    const sp = 1.1 + 2.5 * lash;
    const w1 = 0.13 * Math.pow(s, 0.8) * Math.sin(4.5 * s - sp * lt + tr.ph);
    const w2 = 0.09 * s * Math.cos(4 * s - 0.8 * sp * lt + tr.ph * 1.3);
    P.x += tOutv.x * w1 - tOutv.z * w2;
    P.z += tOutv.z * w1 + tOutv.x * w2;
    // The lash: the tentacles whip out at the boat, the tips furthest.
    P.addScaledVector(toBoat, 0.8 * lash * Math.pow(s, 1.5));
    P.y += 0.45 * lash * Math.pow(s, 1.5);
    R.h = R.w = (0.045 - 0.03 * s) * tK;
    clear(P, R.h);
  };

  const face = new THREE.Vector3();

  return {
    ring,
    update(t: number, fl: number, pose: EmotePose) {
      lt = t;
      nFoam = 0;
      ringRot = turnAt(t);
      ring.rotation.y = ringRot;
      ring.updateMatrix();
      deck.updateMatrix();
      toDeck.copy(deck.matrix).invert().multiply(ring.matrix);
      toRing.copy(toDeck).invert();
      const close = easeInOutSine(progress(T_IN + 0.5, PEAK - 0.3, t));
      const bk = build(t);
      const hk = hit(t);
      head.set(0, pose.lift + 1.45, 0);

      // ----- Leviathan
      const lf = flinch(t, 0.05);
      rear = 0.5 + 0.8 * smoothstep(4.0, 5.3, t) - 0.45 * smoothstep(6.6, 7.6, t);
      strikeK =
        t < PEAK - 0.55
          ? 0
          : t < PEAK - 0.25
            ? -0.3 * easeInOutSine(progress(PEAK - 0.55, PEAK - 0.25, t))
            : t < PEAK
              ? lerp(-0.3, 1, easeOutCubic(progress(PEAK - 0.25, PEAK, t)))
              : t < PEAK + 0.35
                ? 1
                : 1 - easeInOutSine(progress(PEAK + 0.35, PEAK + 1.2, t));
      lev.hide.emissiveIntensity = 0.16 + 0.1 * dark + fl * 0.35 + lf * 0.2;
      const lk = emerge(0) * (1 - dive(1));
      lev.glow.color.setScalar(Math.max(0.05, lk) * (0.85 + 0.1 * Math.sin(t * 1.5)) * (1 + 0.6 * Math.max(0, strikeK)));
      // Its head holds its gaze on the player, turning with it, never spinning: aimed, not taken from the spine.
      const jaw = 0.1 + 0.12 * bk + 0.55 * smoothstep(PEAK - 0.5, PEAK - 0.25, t) * (1 - smoothstep(PEAK + 0.05, PEAK + 0.2, t)) + 0.2 * lf;
      lev.spine();
      const st = lev.body.st;
      AF.subVectors(st[0], st[2]).normalize();
      SP.subVectors(head, st[0]).normalize();
      AF.multiplyScalar(0.3).addScaledVector(SP, 0.7).normalize();
      AX.crossVectors(UP3, AF).normalize();
      AY.crossVectors(AF, AX);
      aim.makeBasis(AX, AY, AF).scale(_SC.setScalar(Math.max(1e-4, emerge(0) * (1 - smoothstep(0.85, 1, dive(0)))))).setPosition(st[0]);
      lev.parts(jaw, aim);
      for (let j = 0; j < lev.segs && nFoam < 8; j++) {
        const s = j / lev.segs;
        const a = st[j].y - sea;
        const b = st[j + 1].y - sea;
        if (a > 0 !== b > 0 && lev.r(s) * emerge(s) * (1 - dive(s)) > 0.02) {
          const k = a / (a - b);
          addFoam(lerp(st[j].x, st[j + 1].x, k), lerp(st[j].z, st[j + 1].z, k), lev.r(s) * 2.2);
        }
      }

      // ----- Kraken: its breathing, watching mantle held outside the hull, and its arms' fluid wriggle and curl, kept
      // out of the boat by a smooth field rather than by snapping points, so nothing can jump from frame to frame.
      const kf = flinch(t, 0.12);
      surface(krk, t, T_IN + 0.35, T_OUT + 0.15, 1.3);
      const ka = KA - 0.12 * close;
      const kr2 = Math.max(lerp(1.95, 1.55, close), minR(ka, 0.62));
      krk.g.position.set(Math.sin(ka) * kr2, sea - 0.05, Math.cos(ka) * kr2);
      krk.g.rotation.y = Math.atan2(-krk.g.position.x, -krk.g.position.z);
      krk.hide.emissiveIntensity = 0.1 * dark + fl * 0.35 + kf * 0.15;
      (arms.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = krk.hide.emissiveIntensity;
      const lunge = arc(progress(PEAK - 0.6, PEAK + 0.9, t));
      const breathe = Math.sin(t * 2.1);
      krk.inner.scale.set(krBase * (1 + 0.05 * breathe), krBase * (1 - 0.035 * breathe), krBase * (1 + 0.05 * breathe));
      krk.inner.rotation.set(0.05 * wobble(t, 3, 0.6) + 0.2 * lunge - 0.14 * kf, 0.25 * Math.sin(t * 0.55 + 1), 0.06 * Math.sin(t * 0.8));
      krk.inner.updateMatrix();
      krk.g.updateMatrix();
      _wm.multiplyMatrices(krk.g.matrix, krk.inner.matrix);
      armK = Math.min(1.1, krk.g.scale.y);
      // The player ducks on the great arms' slam.
      slam = krk.g.visible ? Math.max(slamAt(t, 0), slamAt(t, 0.12)) : 0;
      const reach4 = smoothstep(PEAK - 1.5, PEAK - 0.5, t) * (1 - smoothstep(PEAK + 0.2, PEAK + 1.0, t));
      // The great arms' slam, eased in.
      const slam4 = easeInOutSine(progress(PEAK - 0.5, PEAK - 0.05, t)) * (1 - easeInOutSine(progress(PEAK + 0.15, PEAK + 0.85, t)));
      ARMS.forEach((A, i) => {
        const pts = armPts[i];
        if (!krk.g.visible) {
          arms.hide(i);
          return;
        }
        let a = A.a;
        let e = A.e;
        let hitK = 0;
        bend.ph = A.ph;
        if (A.role === 'great') {
          a += 0.25 * Math.sin(t * 0.9 + A.ph) * (1 - reach4);
          e = A.e - 0.45 * reach4 - 0.35 * slam4 + 0.1 * Math.sin(t * 1.1 + A.ph);
          bend.k0 = 1.3 - 0.95 * reach4 + 1.7 * slam4;
          bend.amp = 1.5;
          bend.freq = 1.1;
          bend.speed = 3.4;
          bend.curl = 3.4 * (1 - reach4) * (0.55 + 0.45 * Math.sin(t * 1.4 + A.ph));
          bend.lat = 1.1;
        } else if (A.role === 'slap') {
          const ph = (((t - T_IN - 0.8 - (A.off ?? 0)) / (A.period ?? 2.5)) % 1 + 1) % 1;
          // Raise back, whip down onto the sea (drawn out a little, so it never crosses the view in one step), lie, lift.
          bend.k0 = ph < 0.5 ? lerp(0.3, -1.7, easeInOutSine(ph / 0.5)) : ph < 0.66 ? lerp(-1.7, 2.6, easeInOutSine((ph - 0.5) / 0.16)) : lerp(2.6, 0.3, easeInOutSine((ph - 0.66) / 0.34));
          e = ph < 0.5 ? lerp(0.5, 1.25, easeInOutSine(ph / 0.5)) : ph < 0.66 ? lerp(1.25, 0.1, easeInOutSine((ph - 0.5) / 0.16)) : lerp(0.1, 0.5, easeInOutSine((ph - 0.66) / 0.34));
          bend.amp = 0.9;
          bend.freq = 1.0;
          bend.speed = 3.0;
          bend.curl = 1.6;
          bend.lat = 0.7;
          if (ph > 0.64 && ph < 0.9) hitK = 1 - (ph - 0.64) / 0.26;
        } else {
          bend.k0 = 0.5 + 0.35 * Math.sin(t * 0.7 + A.ph);
          bend.amp = 2.6;
          bend.freq = 1.4;
          bend.speed = 4.2;
          bend.curl = 2.2 * Math.sin(t * 0.9 + A.ph);
          bend.lat = 2.0;
        }
        root.set(Math.sin(A.a) * 0.34, 0.5, Math.cos(A.a) * 0.34).applyMatrix4(_wm);
        d0.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).transformDirection(_wm);
        b0.set(Math.cos(a), 0, -Math.sin(a)).transformDirection(_wm);
        // Its reach: never more than 0.45 m past her rail on that side, so it can come over the rail and onto her deck
        // but not across to the wheelhouse or the player (a field can't help an arm aimed straight through something).
        const ra = Math.atan2(root.x, root.z);
        const toHull = Math.hypot(root.x, root.z) - reachAt(reach, ra + ringRot);
        // And no further than just short of the wheelhouse.
        D.copy(root).applyMatrix4(toDeck);
        const toHouse = Math.hypot(Math.max(0, Math.abs(D.x) - 0.32), Math.max(0, 0.68 - D.z, D.z - 1.32));
        armCurve(pts, root, d0, b0, Math.min(A.len, toHull + 0.45, toHouse + 0.1) * armK, ASEG, bend, t);
        // Kept out of the boat and the player by a smooth field in her frame: every point moves continuously.
        for (let j = 0; j <= ASEG; j++) {
          W.set(pts[j * 3], pts[j * 3 + 1], pts[j * 3 + 2]);
          if (W.x * W.x + W.z * W.z < 2.4 * 2.4) {
            W.applyMatrix4(toDeck);
            smoothClear(W, A.r0 * (1 - 0.82 * (j / ASEG)) * armK, hull);
            W.applyMatrix4(toRing);
          }
          pts[j * 3] = W.x;
          pts[j * 3 + 1] = W.y;
          pts[j * 3 + 2] = W.z;
        }
        armI = i;
        armR0 = A.r0;
        arms.write(i, armFill, b0);
        if (hitK > 0 && pts[ASEG * 3 + 1] < sea + 0.12) addFoam(pts[ASEG * 3], pts[ASEG * 3 + 2], 0.2 + 0.5 * (1 - hitK));
      });
      arms.commit();

      // ----- Dreamer: risen at T_IN + 0.7, hanging still, staring; it lashes at the peak.
      const dfl = flinch(t, 0.2);
      const dk = easeOutCubic(progress(T_IN + 0.7, T_IN + 2.1, t)) * (1 - easeInCubic(progress(T_OUT + 0.3, T_OUT + 1.2, t)));
      dre.g.visible = dk > 0.005;
      const da = DA + 0.06 * Math.sin(t * 0.3);
      const dr = Math.max(lerp(1.85, 1.6, close), minR(da, 0.55));
      lash = Math.max(0, easeOutCubic(progress(PEAK - 0.2, PEAK + 0.05, t)) - easeInOutSine(progress(PEAK + 0.3, PEAK + 1.3, t)));
      dre.g.position.set(Math.sin(da) * dr, sea - 0.05 - 2.4 * (1 - dk) + 0.1 + 0.04 * Math.sin(t * 0.8) + 0.15 * bk + 0.1 * lash, Math.cos(da) * dr);
      toBoat.set(-dre.g.position.x, 0, -dre.g.position.z).normalize();
      // Its face half turned to the camera (so its stare is seen), its eyes fixed on the player.
      const dc = 0.35 * (TAU / L) * (t - PEAK);
      const px = -dre.g.position.x;
      const pz = -dre.g.position.z;
      const pl = Math.hypot(px, pz) || 1;
      const cx = Math.sin(dc) * ABYSS_CAMERA - dre.g.position.x;
      const cz = Math.cos(dc) * ABYSS_CAMERA - dre.g.position.z;
      const cl = Math.hypot(cx, cz) || 1;
      dre.g.rotation.set(0.03 * Math.sin(t * 0.6) - 0.15 * lash, Math.atan2((px / pl) * 0.45 + (cx / cl) * 0.55, (pz / pl) * 0.45 + (cz / cl) * 0.55), 0.03 * Math.sin(t * 0.7));
      dre.g.scale.setScalar(1);
      const stroke = Math.max(0.5 * pulse((t + 1.0) % 3.4, 0.8), hk);
      const sk = 0.6;
      dre.inner.scale.set(sk * (1 + 0.08 * stroke), sk * (1 - 0.1 * stroke), sk * (1 + 0.08 * stroke));
      dre.hide.emissiveIntensity = 0.1 * dark + fl * 0.35 + dfl * 0.15;
      const narrow = smoothstep(3.4, 4.6, t);
      const tight = Math.max(pulse(t - (PEAK - 0.3), 1.2), 0.3 * dfl);
      dre.glow.color.setScalar((0.3 + 0.7 * clamp01(progress(T_IN + 0.9, T_IN + 1.8, t))) * dk * (0.92 + 0.08 * Math.sin(t * 1.2)) * (1 + 0.8 * tight));
      dre.inner.updateMatrix();
      dre.g.updateMatrix();
      _wm.multiplyMatrices(dre.g.matrix, dre.inner.matrix);
      look.copy(head).applyMatrix4(inv.copy(_wm).invert());
      eyes.stare(t, narrow, tight, look);
      tK = dk;
      for (let i = 0; i < NT; i++) {
        if (!dre.g.visible) {
          tents.hide(i);
          continue;
        }
        tI = i;
        tR.copy(tRoot[i].local).applyMatrix4(_wm);
        tOutv.set(Math.sin(tRoot[i].a), 0, Math.cos(tRoot[i].a)).transformDirection(_wm);
        tOutv.y = 0;
        tOutv.normalize();
        tents.write(i, tentFill, tOutv);
      }
      tents.commit();

      // Foam rings where the Kraken and the Dreamer break the surface.
      for (const [l, t0, t1, ph] of [[krk, T_IN + 0.35, T_OUT + 0.15, 0], [dre, T_IN + 0.7, T_OUT + 0.3, 1.7]] as [Legend, number, number, number][]) {
        const s1 = progress(t0, t0 + 1.1, t);
        const s2 = progress(t1, t1 + 0.9, t);
        const burst = s1 > 0 && s1 < 1 ? s1 : s2 > 0 && s2 < 1 ? s2 : -1;
        l.splash.visible = burst >= 0 || l.g.visible;
        l.splash.position.set(l.g.position.x, sea + 0.12, l.g.position.z);
        if (burst >= 0) {
          l.splash.scale.setScalar(0.5 + burst * 1.2);
          l.splash.material.opacity = (1 - burst) * 0.85;
        } else {
          l.splash.scale.setScalar(0.62 + 0.05 * Math.sin(t * 1.4 + ph));
          l.splash.material.opacity = 0.3 + 0.1 * Math.sin(t * 1.4 + ph);
        }
      }
      for (let i = nFoam; i < 12; i++) foam.setMatrixAt(i, ZERO4);
      foam.instanceMatrix.needsUpdate = true;
      foamMat.opacity = 0.55 - 0.15 * dark;

      // ----- The player: glances at the greatest threat (head and shoulders, not a full turn), leans away from it,
      // flinches at the strikes and ducks the great arms' slam, locked to the rocking deck.
      const on = inOut(t, T_IN + 0.2, T_IN + 1.2, T_OUT + 0.2, L - 0.4);
      const wL = (0.4 + 1.2 * bk + 2.0 * Math.max(0, strikeK)) * lk;
      const wK = (0.45 + 0.8 * smoothstep(2.6, 3.7, t) * (1 - bk) + 1.6 * slam) * (krk.g.visible ? 1 : 0);
      const wD = (0.35 + 0.6 * narrow * (1 - bk) + 1.2 * lash) * dk;
      face.set(0, 0, 0);
      const addW = (x: number, z: number, w: number) => {
        const d = Math.hypot(x, z) || 1;
        face.x += (x / d) * w;
        face.z += (z / d) * w;
      };
      addW(st[0].x, st[0].z, wL);
      addW(krk.g.position.x, krk.g.position.z, wK);
      addW(dre.g.position.x, dre.g.position.z, wD);
      // The threat's direction in the world (the ring turns with the camera; the boat doesn't).
      const fl2 = Math.hypot(face.x, face.z) || 1;
      const fx = face.x / fl2;
      const fz = face.z / fl2;
      const wx = fx * Math.cos(ringRot) + fz * Math.sin(ringRot);
      const wz = -fx * Math.sin(ringRot) + fz * Math.cos(ringRot);
      const yaw = 0.75 * wx * on;
      const cy = Math.cos(yaw);
      const sy = Math.sin(yaw);
      // Leaning away from it, in the turned body's own frame.
      const menace = Math.min(1, fl2 / 2.2) * on;
      const lean = 0.08 + 0.1 * bk;
      const along = wx * sy + wz * cy;
      const across = wx * cy - wz * sy;
      const duck = slam;
      const bp = pose.pitch;
      const br = pose.roll;
      pose.yaw = yaw;
      pose.pitch = bp * cy - br * sy - lean * along * menace + 0.2 * duck;
      pose.roll = bp * sy + br * cy - lean * across * menace;
      pose.squash = 1 - 0.15 * duck - 0.05 * Math.max(lf, kf);
      pose.lift += 0.03 * dfl;
    },
  };
}

// ---------- the look ----------

export const abyss: EmoteLook = (ctx) => {
  const hull = toyHull(BOAT_S);
  const v = crossing(ctx, hull);
  const legends = legendRing(v.group, v.deck, hull, ctx);
  // Drawn after the game's water, in the lab's order: the gloom first, then the sea patch (see-through at its edge but
  // writing depth), then the look's other see-through parts (`drawAfterWater` moves those).
  v.gloom.renderOrder = WATER_ORDER + 0.5;
  v.sea.renderOrder = WATER_ORDER + 1;
  return {
    group: v.group,
    update(t, _dt, pose) {
      v.update(t, pose);
      legends.update(t, v.flash, pose);
      // Braced on the deck, they jump at the big strike.
      pose.lift += hop(t - PEAK, 0.34, 0.1) + hop(t - 4.2, 0.26, 0.04);
      pose.squash -= 0.06 * hop(t - PEAK, 0.28, 1);
    },
    dispose: () => freeLook(v.group),
  };
};
