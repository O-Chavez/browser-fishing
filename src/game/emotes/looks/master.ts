/**
 * Master of the Deep's emote, "Lord of the deep, swimming" (Oscar's pick, 2026-11-16, as refined in its C5: smooth
 * jellies, small rim kelp, a smaller Dreamer; GAME_DESIGN.md §40). "Level 4"
 * of the Abyssal Wardrobe page as an emote, with the three deep zones woven in: a whirlpool opens underfoot, six great
 * tentacles rise from its rim and arch over the player, a shaft of light comes down, an orb lights in a gold ring over
 * the head, water ribbons spiral up, four streams of fish circle and sparkles drift; Kelp Deep's kelp sways at the rim,
 * the Twilight's jellies rise, the Coiled Leviathan swims up round the player in a coil and the Drowned Dreamer swims a
 * loop round the far side. The player floats up with the light and lands softly at the end.
 *
 * The camera circles once over the emote, starting behind the player (`ThirdPerson`, 6.5 m back: the catalog's
 * `cameraDistance`), and the Leviathan's coil, the Dreamer and the near kelp are placed against that circle so they stay
 * out from between the camera and the player. Another player sees the same picture from wherever they stand.
 */
import * as THREE from 'three';
import { mulberry } from '../../env';
import { easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, freeLook, glowSprite, glowTexture, keep, progress, seedOf, smoothstep } from '../kit';
import { Strips, TAU, Tubes, bladeWidth, type V3 } from '../meshes';
import type { EmoteCtx, EmoteLook } from '../types';
import { dreamerEyesRig, dreamerFace, dreamerTentacles, glowMat, hideMat, leviathanRig, mergeParts, part, pulse, sweep } from './legends';

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const MASTER_SECONDS = 10.5;
/** How far back the circling camera stands, so the whole scene (about 5 m tall and 3.4 m out) fits. */
export const MASTER_CAMERA = 6.5;

const H = Math.PI / 2;

// ---------- Level 4's colours (the Abyssal Wardrobe page) ----------

const L4_FLESH = 0x5a1a4a;
const L4_SUCK = 0xf4b8c4;
const L4_UNDER = 0xc24ee0;
const GOLD = 0xe0b441;
const TEAL = 0x3fe0d0;
const ABYSS_GLOW = 0x5ff2e0;
const FISH_COLS = [0xd0d6dc, GOLD, 0x5fb8b4, 0xff7a5a, 0x4a90e2, 0xffd24a];
/** The Twilight's jellies. */
const JELLY_COLS = [0xb8a8f0, 0xffb09a, 0xdff2ff, 0xd79a8c, 0x9a8ae0];

// ---------- the timeline and the scene's size ----------

/** When the whirlpool opens, when the exit starts, and the emote's whole length (the camera's one circle). */
const S0 = 0;
const EXIT = 8.8;
const L = EXIT + 1.7;
/** How high the player floats at the peak. */
const LEV = 0.5;
/** How much wider than Level 4 the scene is, how much taller, and how much the tentacles widen. */
const G = 1.45;
const GT = 1.3;
const GW = 1 + (G - 1) * 0.3;
/** The rim kelp's size (small accents, not tall leaves) and the Drowned Dreamer's, against the first version's. */
const KELP_SIZE = 0.35;
const DREAMER_SIZE = 0.8;
/**
 * How far the ground layers lie over the feet. The lab laid them from 3.5 to 5 cm; in the game they're lifted to start
 * at 6 cm, clear of the town's cobbles (4 cm up, `COBBLE_LIFT`), keeping their order (`POOL_LIFT` in meshes.ts).
 */
const FLOOR = 0.025;

/** 0 -> 1 -> 0 over 0..1 (a half sine). */
const arc = (x: number): number => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
/** Where the camera is round the player at `t`, in radians (0 in front): it starts behind and circles once. */
const camAzAt = (t: number): number => Math.PI + (TAU * t) / L;

const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _wm = new THREE.Matrix4();
const _wv = new THREE.Vector3();

// ---------- shared textures (made once, kept) ----------

let spiralTex: THREE.CanvasTexture | null = null;
/** Level 4's whirlpool: a dark centre, six pale arms winding out to a glowing rim (the Wardrobe page's own drawing). */
function spiralTexture(): THREE.CanvasTexture {
  if (spiralTex) return spiralTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(4,20,36,1)');
  gr.addColorStop(0.3, 'rgba(10,70,100,0.95)');
  gr.addColorStop(0.85, 'rgba(60,180,210,0.5)');
  gr.addColorStop(1, 'rgba(120,230,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  x.lineCap = 'round';
  for (let arm = 0; arm < 6; arm++) {
    for (let s = 0.04; s < 1; s += 0.01) {
      const a0 = (arm / 6) * TAU + s * 5;
      const a1 = a0 + 0.05;
      x.strokeStyle = `rgba(210,255,255,${0.85 * (1 - s)})`;
      x.lineWidth = 1.5 + 4.5 * s;
      x.beginPath();
      x.moveTo(128 + Math.cos(a0) * s * 122, 128 + Math.sin(a0) * s * 122);
      x.lineTo(128 + Math.cos(a1) * (s + 0.01) * 122, 128 + Math.sin(a1) * (s + 0.01) * 122);
      x.stroke();
    }
  }
  spiralTex = keep(new THREE.CanvasTexture(c));
  spiralTex.colorSpace = THREE.SRGBColorSpace;
  return spiralTex;
}

let bandTex: THREE.DataTexture | null = null;
/**
 * The tentacles' glow, as an emissive map: its left half lights the inner side of a `sweep` tube (v = 0 and 1)
 * magenta, strongest at the root and fading up the arch, as the whirlpool's light did on the Wardrobe page; its right
 * half is the suckers' pale pink, so they read as pale dots after dark.
 */
function bandTexture(): THREE.DataTexture {
  if (bandTex) return bandTex;
  const W = 32;
  const Hh = 32;
  const d = new Uint8Array(W * Hh * 4);
  const under = new THREE.Color(L4_UNDER).multiplyScalar(0.8);
  const dim = new THREE.Color(L4_FLESH).multiplyScalar(0.35);
  const suck = new THREE.Color(L4_SUCK).multiplyScalar(0.55);
  for (let y = 0; y < Hh; y++) {
    const around = Math.pow(Math.max(0, Math.cos((y / (Hh - 1)) * TAU)), 1.6);
    for (let xx = 0; xx < W; xx++) {
      const u = xx / (W - 1);
      let r: number, g: number, b: number;
      if (u < 0.5) {
        // A dim purple all round, and the magenta underside fading up the arch.
        const k = around * (0.12 + 0.88 * (1 - smoothstep(0.02, 0.3, u)));
        [r, g, b] = [dim.r + under.r * k, dim.g + under.g * k, dim.b + under.b * k];
      } else [r, g, b] = [suck.r, suck.g, suck.b];
      d.set([Math.round(255 * Math.sqrt(r)), Math.round(255 * Math.sqrt(g)), Math.round(255 * Math.sqrt(b)), 255], (y * W + xx) * 4);
    }
  }
  bandTex = keep(new THREE.DataTexture(d, W, Hh));
  bandTex.colorSpace = THREE.SRGBColorSpace;
  bandTex.wrapT = THREE.RepeatWrapping;
  bandTex.magFilter = THREE.LinearFilter;
  bandTex.needsUpdate = true;
  return bandTex;
}

/** A flat soft glow on the ground (the light a lamp would throw), adding light by day and night. */
function lampGlow(color: number, size: number, y: number): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size).rotateX(-H),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  m.position.y = y;
  m.renderOrder = 1;
  return m;
}

// ---------- the zones woven in ----------

/** One of the Twilight's jellies: a glassy bell, a bright heart and four trailing tendrils, in colour `c`. */
function jellyGeo(c: number): THREE.BufferGeometry {
  const parts = [part(new THREE.SphereGeometry(0.19, 8, 5, 0, TAU, 0, H * 1.1), c, undefined, { alpha: 0.7, k: 1.15 }), part(new THREE.SphereGeometry(0.07, 6, 4), c, { p: [0, 0.05, 0] }, { k: 1.5 })];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU;
    parts.push(...sweep([[Math.sin(a) * 0.12, -0.01, Math.cos(a) * 0.12], [Math.sin(a) * 0.15, -0.22, Math.cos(a) * 0.15], [Math.sin(a) * 0.1, -0.45, Math.cos(a) * 0.1]], { r0: 0.018, r1: 0.006, n: 4, radial: 3, color: c, alpha: 0.7 }));
  }
  return mergeParts(parts);
}

/**
 * Kelp Deep's set blades round the whirlpool's rim between the tentacles, gold and olive with a rippled edge, swaying
 * in the current; the ones on the camera's side duck down and lean out of the way, so the near side stays clear. Small
 * accents (`KELP_SIZE`: height times it, width times its square root). One draw.
 */
function rimKelp(ctx: EmoteCtx, rnd: () => number, ang: number[], rim: number, tall: number) {
  const cols = [0xc8962e, 0x7d8a34, 0xa07a2a, 0x7d8a34, 0xc8962e, 0x7a5a1e];
  const blades = ang.map((a0, i) => ({ a: a0 + Math.PI / 6, h: (1.7 + rnd() * 0.6) * tall * KELP_SIZE, w: (0.24 + rnd() * 0.05) * Math.sqrt(KELP_SIZE), ph: rnd() * TAU, tw: (rnd() - 0.5) * 2, col: cols[i % cols.length] }));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, side: THREE.DoubleSide, emissive: 0x3a3418, emissiveIntensity: 0.3 + 0.3 * ctx.dark });
  const strips = new Strips(blades.length, 26, (i, s, c) => void c.set(blades[i].col).multiplyScalar(0.7 + 0.35 * s), mat);
  let t = 0;
  let grow = 0;
  const near = new Float32Array(blades.length);
  const fill = (i: number, s: number, P: THREE.Vector3, S: THREE.Vector3): void => {
    const b = blades[i];
    const n = near[i];
    const Lh = b.h * grow * (1 - 0.7 * n);
    const sa = Math.sin(b.a);
    const ca = Math.cos(b.a);
    // A wave runs up the blade, the current (round the rim) leans it, and on the camera's side it leans out.
    const wave = Math.sin(t * 1.6 - s * 3.4 + b.ph) * 0.09 * Lh * s;
    const lean = (0.12 + 0.45 * n) * Lh * s * s;
    const along = (0.1 + 0.05 * Math.sin(b.a * 2 - t * 1.6)) * Lh * s * s;
    P.set(sa * (rim + lean) + ca * (wave + along), Lh * s * (1 - 0.06 * s), ca * (rim + lean) - sa * (wave + along));
    const q = b.tw * s + 0.4 * Math.sin(t * 1.2 + b.ph) * s;
    const hw = 0.5 * b.w * bladeWidth(s) * Math.min(1, grow * 3);
    S.set((ca * Math.cos(q) + sa * Math.sin(q)) * hw, 0, (-sa * Math.cos(q) + ca * Math.sin(q)) * hw);
  };
  return {
    mesh: strips.mesh,
    update(time: number, g: number) {
      t = time;
      grow = g;
      strips.mesh.visible = g > 0.005;
      if (!strips.mesh.visible) return;
      const camAz = camAzAt(t);
      blades.forEach((b, i) => {
        near[i] = smoothstep(0.3, 0.85, Math.cos(b.a - camAz));
        strips.write(i, fill);
      });
      strips.commit();
    },
  };
}

/**
 * The Drowned Dreamer a little smaller than the Leviathan (`DREAMER_SIZE`, body and tentacles), swimming round the player on the far side from the camera (its
 * path turns with the camera, so it never comes between the camera and the player): bell first, like a jellyfish,
 * pulsing as it goes, its tentacles trailing through the path it swam and rippling, its face turned on the player with
 * an unblinking stare that narrows to slits.
 */
function dreamerSwimmer(ctx: EmoteCtx, peak: number) {
  const group = new THREE.Group();
  const f = dreamerFace();
  const hide = hideMat(0x6ac8a8);
  const glow = glowMat();
  const bell = new THREE.Group();
  const inner = new THREE.Group();
  // The bulb's centre (y 1.85 in its layout) at the bell's origin.
  inner.position.set(0, -1.85 * 0.95 * DREAMER_SIZE, 0);
  inner.scale.setScalar(0.95 * DREAMER_SIZE);
  inner.add(new THREE.Mesh(f.body, hide), new THREE.Mesh(f.glow, glow));
  const eyes = dreamerEyesRig(inner, f, hide, glow);
  const tilt = new THREE.Group();
  tilt.add(inner);
  bell.add(tilt);
  group.add(bell);
  const NT = 8;
  const TSEG = 14;
  const tents: Tubes = dreamerTentacles(NT, TSEG, hide);
  group.add(tents.mesh);
  const dark = ctx.dark;
  let tt = 0;
  // Where it is at time `tau`, laid out against the camera as it is now (`tt`), so in the player's view it swims a loop
  // across the far side of the player, low one way and high on the way back, turning in wide arcs through its own
  // tentacles. Its tentacles trail along that same loop.
  const C = (tau: number, out: THREE.Vector3): THREE.Vector3 => {
    const w = 0.62 * (tau - (S0 + 1.0));
    const rel = 1.4 * Math.cos(w);
    const a = camAzAt(tt) + Math.PI + rel;
    const r = 2.1 + 0.25 * Math.sin(w);
    const stroke = (tau % 1.5) / 1.5;
    const up = easeOutCubic(progress(S0 + 1.0, S0 + 2.8, tau));
    const down = easeInCubic(progress(EXIT - 0.3, EXIT + 1.0, tau));
    const y = 2.75 + 0.45 * Math.sin(w) - 3.2 * (1 - up) - 3.6 * down + 0.05 * Math.sin(stroke * Math.PI);
    return out.set(Math.sin(a) * r, y, Math.cos(a) * r);
  };
  const P0 = new THREE.Vector3();
  const P1 = new THREE.Vector3();
  const Fw = new THREE.Vector3();
  const In = new THREE.Vector3();
  const Zb = new THREE.Vector3();
  const Xb = new THREE.Vector3();
  /** Its frame at `tau`: position into `P`, forward (bell first) into Fw, toward the player into Zb, across into Xb. */
  const frame = (tau: number, P: THREE.Vector3): void => {
    C(tau, P);
    C(tau + 0.06, P0);
    C(tau - 0.06, P1);
    Fw.subVectors(P0, P1);
    if (Fw.lengthSq() < 1e-8) Fw.set(0, 1, 0);
    Fw.normalize();
    // Its face half toward the player and half toward the camera, so its stare is seen; its pupils follow the player.
    const camAz = camAzAt(tt);
    In.set(-P.x, 0, -P.z).normalize();
    _wv.set(Math.sin(camAz) * MASTER_CAMERA - P.x, 0, Math.cos(camAz) * MASTER_CAMERA - P.z).normalize();
    In.multiplyScalar(0.45).addScaledVector(_wv, 0.55).normalize();
    Zb.copy(In).addScaledVector(Fw, -In.dot(Fw));
    if (Zb.lengthSq() < 1e-8) Zb.set(0, 0, 1);
    Zb.normalize();
    Xb.crossVectors(Fw, Zb);
  };
  const PB = new THREE.Vector3();
  const look = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const tPh = Array.from({ length: NT }, (_, i) => ({ a: (i / NT) * TAU, ph: i * 1.3 }));
  let ti = 0;
  let vis = 0;
  const LAG = 1.1 * DREAMER_SIZE;
  const tentFill = (_i: number, s: number, P: THREE.Vector3, R: { h: number; w: number }): void => {
    const tp = tPh[ti];
    frame(tt - s * LAG, P);
    const ca = Math.cos(tp.a);
    const sa = Math.sin(tp.a);
    const spread = 0.26 * DREAMER_SIZE * (1 + 0.4 * s);
    const w1 = 0.18 * DREAMER_SIZE * s * Math.sin(6 * s - 3.2 * tt + tp.ph);
    const w2 = 0.1 * DREAMER_SIZE * s * Math.cos(5 * s - 2.5 * tt + tp.ph * 2);
    P.addScaledVector(Fw, -0.3 * DREAMER_SIZE)
      .addScaledVector(Zb, ca * (spread + w1) - sa * w2)
      .addScaledVector(Xb, sa * (spread + w1) + ca * w2);
    R.h = R.w = (0.075 - 0.052 * s) * DREAMER_SIZE * vis;
  };
  return {
    group,
    update(t: number, lift: number) {
      tt = t;
      vis = easeOutCubic(progress(S0 + 1.0, S0 + 2.0, t)) * (1 - easeInCubic(progress(EXIT + 0.4, EXIT + 1.0, t)));
      group.visible = vis > 0.005;
      if (!group.visible) return;
      frame(t, PB);
      bell.position.copy(PB);
      bell.quaternion.setFromRotationMatrix(_wm.makeBasis(Xb, Fw, Zb));
      const stroke = pulse(t % 1.5, 0.6);
      bell.scale.set(vis * (1 + 0.08 * stroke), vis * (1 - 0.1 * stroke), vis * (1 + 0.08 * stroke));
      hide.emissiveIntensity = 0.3 + 0.15 * dark;
      const tight = pulse(t - (peak - 0.2), 1.2);
      glow.color.setScalar(vis * (0.9 + 0.1 * Math.sin(t * 2)) * (1 + 0.6 * tight));
      // The player's head in the bulb's own frame (bell, then tilt, then the bulb), for its pupils to follow.
      bell.updateMatrix();
      tilt.updateMatrix();
      inner.updateMatrix();
      inv.multiplyMatrices(bell.matrix, tilt.matrix).multiply(inner.matrix).invert();
      look.set(0, lift + 1.6, 0).applyMatrix4(inv);
      eyes.stare(t, smoothstep(S0 + 2.5, S0 + 4.0, t), tight, look);
      for (let i = 0; i < NT; i++) {
        ti = i;
        tents.write(i, tentFill, Fw);
      }
      tents.commit();
    },
  };
}

// ---------- the look ----------

export const master: EmoteLook = (ctx) => {
  const group = new THREE.Group();
  const rnd = mulberry(seedOf('master-C3'));
  const dark = ctx.dark;

  // The whirlpool, turning in the ground.
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.55, 40).rotateX(-H), new THREE.MeshBasicMaterial({ map: spiralTexture(), transparent: true, depthWrite: false, opacity: 0 }));
  disc.position.y = 0.04 + FLOOR;
  disc.renderOrder = 1;
  group.add(disc);
  const under = lampGlow(L4_UNDER, 4.2 * G, 0.035 + FLOOR);
  group.add(under);
  const cyanPool = lampGlow(ABYSS_GLOW, 2.2 * G, 0.045 + FLOOR);
  group.add(cyanPool);

  // Six tentacles rise from holes round its rim and arch in over the player, lit magenta from beneath.
  const ANG = Array.from({ length: 6 }, (_, i) => (i / 6) * TAU + 0.52);
  const holes = new THREE.Mesh(mergeParts(ANG.map((a) => part(new THREE.CircleGeometry(0.26, 10).rotateX(-H), 0x05060c, { p: [Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2] }))), new THREE.MeshBasicMaterial({ vertexColors: true }));
  holes.position.y = 0.05 + FLOOR;
  group.add(holes);
  const fleshM = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
    roughness: 0.5,
    metalness: 0.05,
    emissive: 0xffffff,
    emissiveMap: bandTexture(),
    emissiveIntensity: 1,
  });
  const ORDER = [0, 3, 1, 4, 2, 5];
  const tentacles = ANG.map((a, i) => {
    const Hh = 2.5 + (i % 3) * 0.4;
    const pts: V3[] = [
      [0, -0.1, 0],
      [0, Hh * 0.3, 0.18],
      [0, Hh * 0.6, 0.06],
      [0, Hh * 0.85, -0.22],
      [0, Hh * 0.93, -0.45],
      [0, Hh * 0.8, -0.55],
      [0, Hh * 0.71, -0.45],
    ];
    const geo = mergeParts(sweep(pts, { r0: 0.18, r1: 0.025, n: 24, radial: 7, color: L4_FLESH, sucker: L4_SUCK, toward: new THREE.Vector3(0, 0.8, -1.2) }));
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * 1.2 * G, 0, Math.cos(a) * 1.2 * G);
    holder.rotation.y = a;
    const lean = new THREE.Group();
    lean.add(new THREE.Mesh(geo, fleshM));
    holder.add(lean);
    group.add(holder);
    return { holder, lean, i, delay: ORDER.indexOf(i) };
  });

  // Water ribbons spiralling up round the body (three, interleaved so they can grow up together).
  const SEGS = 90;
  const rib: number[] = [];
  for (let i = 0; i < SEGS; i++) {
    for (let k = 0; k < 3; k++) {
      const q = (u: number, side: number): V3 => {
        const a = (k * TAU) / 3 + u * Math.PI * 3.2;
        const r = 0.62 + u * 0.5;
        const w = (0.16 * (1 - u * 0.6)) / 2;
        return [Math.sin(a) * r, 0.05 + u * 3.3 + side * w, Math.cos(a) * r];
      };
      const a0 = q(i / SEGS, 1);
      const b0 = q(i / SEGS, -1);
      const a1 = q((i + 1) / SEGS, 1);
      const b1 = q((i + 1) / SEGS, -1);
      rib.push(...a0, ...b0, ...a1, ...b0, ...b1, ...a1);
    }
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(rib, 3));
  ribGeo.computeVertexNormals();
  const ribbons = new THREE.Mesh(
    ribGeo,
    new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x2a9ab8, emissiveIntensity: 0.55 + 0.35 * dark, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, flatShading: true }),
  );
  ribbons.frustumCulled = false;
  const ribSpin = new THREE.Group();
  ribSpin.scale.set(G * 0.9, GT, G * 0.9);
  ribSpin.add(ribbons);
  group.add(ribSpin);
  const RIB_VERTS = SEGS * 3 * 6;

  // The shaft of light from above.
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 7;
  const beamM = new THREE.MeshBasicMaterial({
    color: dark > 0.5 ? 0x7ff0ff : 0xc8f8ff,
    transparent: true,
    opacity: 0,
    blending: dark > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55 * G, 0.8 * G, 7, 24, 1, true), beamM);
  beam.position.y = -3.5;
  beamPivot.add(beam);
  group.add(beamPivot);

  // The orb above the head, in a gyroscope of a gold ring set with glowing beads and a teal ring.
  const gyro = new THREE.Group();
  const ring1 = new THREE.Group();
  const goldM = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.32, metalness: 0.55, flatShading: true, emissive: GOLD, emissiveIntensity: 0.18 + 0.2 * dark });
  ring1.add(new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.022, 5, 40), goldM));
  const beads = mergeParts(Array.from({ length: 12 }, (_, i) => part(new THREE.OctahedronGeometry(0.03), ABYSS_GLOW, { p: [Math.cos((i / 12) * TAU) * 0.56, Math.sin((i / 12) * TAU) * 0.56, 0] }, { k: 1.2 })));
  ring1.add(new THREE.Mesh(beads, new THREE.MeshBasicMaterial({ vertexColors: true })));
  const ring2 = new THREE.Group();
  ring2.add(new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.016, 5, 48).rotateX(H), new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 1, flatShading: true })));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0xf4f8ff, emissiveIntensity: 1, flatShading: true }));
  const orbHalo = glowSprite(0xdff8ff, 1.15, 0);
  const orbBloom = glowSprite(0x9ff4ff, 1.8, 0);
  gyro.add(ring1, ring2, orb, orbHalo, orbBloom);
  group.add(gyro);
  // The light the shaft and the whirlpool throw on the player (the Wardrobe page lit them with lamps; no look adds a light).
  const bodyLight = glowSprite(0xa8e8ff, 2.3, 0);
  group.add(bodyLight);
  const orbBase = Math.max(2.73, ctx.top + 0.35) + 1.0;

  // Four streams of small fish circling round the head.
  const STREAMS = [
    { r: 1.66 * G, y: 1.35, w: -0.55, n: 14 },
    { r: 1.87 * G, y: 1.8, w: -0.62, n: 14 },
    { r: 2.08 * G, y: 2.25, w: -0.5, n: 14 },
    { r: 2.29 * G, y: 3.2, w: 0.42, n: 14 },
  ];
  const fish: { s: number; a0: number; dr: number; dy: number; ph: number; size: number }[] = [];
  STREAMS.forEach((st, si) => {
    for (let j = 0; j < st.n; j++) fish.push({ s: si, a0: si * 2.1 + j * 0.13 + (rnd() - 0.5) * 0.05, dr: (rnd() - 0.5) * 0.16, dy: (rnd() - 0.5) * 0.18, ph: rnd() * 10, size: 0.85 + rnd() * 0.3 });
  });
  const fishGeo = mergeParts([
    part(new THREE.SphereGeometry(1, 6, 4), 0xffffff, { s: [0.03, 0.045, 0.1] }),
    part(new THREE.ConeGeometry(0.04, 0.07, 3), 0xffffff, { p: [0, 0, -0.12], r: [H, 0, 0], s: [0.3, 1, 1] }),
  ]);
  // Unlit after dark so their colours still read.
  const fishM =
    dark > 0.5
      ? new THREE.MeshBasicMaterial({ color: 0xc8c8d0, vertexColors: true })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.3, emissive: 0x303848, emissiveIntensity: 0.6 });
  const school = new THREE.InstancedMesh(fishGeo, fishM, fish.length);
  school.frustumCulled = false;
  fish.forEach((_, i) => school.setColorAt(i, _c.set(FISH_COLS[i % FISH_COLS.length])));
  group.add(school);

  // Sparkles all through the column.
  const SPK = 64;
  const spk = Array.from({ length: SPK }, () => ({ a: rnd() * TAU, r: (0.45 + rnd() * 1.3) * G, y: (0.3 + rnd() * 3.1) * GT, ph: rnd() * 10, s: 0.6 + rnd() * 0.7 }));
  const sparkles = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }), SPK);
  sparkles.frustumCulled = false;
  const SPK_COLS = [0xffffff, 0xff9ad0, ABYSS_GLOW, 0xfff1c8];
  spk.forEach((_, i) => sparkles.setColorAt(i, _c.set(SPK_COLS[i % 4])));
  group.add(sparkles);

  // Kelp Deep's kelp from the rim, in the gaps between the tentacles.
  const kelp = rimKelp(ctx, rnd, ANG, 1.55 * G * 0.96, 1 + (GT - 1) * 0.6);
  group.add(kelp.mesh);

  // The Twilight's jellies, riding up the Leviathan's coils.
  const jellyM = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  const NJ = 8;
  const jel = Array.from({ length: NJ }, (_, i) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(jellyGeo(JELLY_COLS[i % JELLY_COLS.length]), jellyM));
    group.add(g);
    // Two draws the lab's other versions used, kept so the seed gives the approved picture.
    rnd();
    rnd();
    return { g, off: i / NJ, ph: rnd() * 6 };
  });

  // The Leviathan swimming up round the player: it climbs out of the whirlpool head first, waves run down its length,
  // its coil turns with the camera (one turn over the emote, so the stretch of it at chest height stays on the far side
  // of the player in the player's view), a little slower than it, and its head bows in and snaps.
  let ct = 0;
  let cg = 0;
  let cAng = 0;
  let csnap = 0;
  const CR = 1.45;
  const CY = 3.15;
  const CTURNS = 0.85;
  const CSEG = 64;
  const cu = (s: number) => s + (1 - cg) * 1.05;
  const lev = leviathanRig(
    0.17,
    CSEG,
    (s, out) => {
      const u = cu(s);
      const a = -u * CTURNS * TAU + cAng;
      const w = smoothstep(0.04, 0.22, u);
      const rr = CR * (1 - 0.15 * Math.min(1, u)) + 0.13 * Math.sin(TAU * 2.0 * u - 3.1 * ct) * w;
      let y = 0.05 + (1 - u) * (CY - 0.05) + 0.12 * Math.sin(TAU * 1.5 * u - 2.5 * ct) * w;
      if (u > 1) y = 0.05 - (u - 1) * 4;
      const hd = Math.pow(Math.max(0, 1 - s / 0.2), 2);
      const inn = hd * (0.28 + 0.4 * csnap);
      out.set(Math.sin(a) * (rr - inn), y - hd * (0.12 + 0.25 * csnap), Math.cos(a) * (rr - inn));
    },
    (s) => 1 - smoothstep(1.05, 1.25, cu(s)),
  );
  group.add(...lev.meshes);
  const JP = new THREE.Vector3();
  const coilAngle = (t: number) => camAzAt(t) + Math.PI + 2.64 + 0.25 * Math.sin(t * 0.5);

  // The Drowned Dreamer, swimming round the far side.
  const dreamer = dreamerSwimmer(ctx, S0 + 6.0);
  group.add(dreamer.group);

  return {
    group,
    update(t, _dt, pose) {
      const out = (a: number, b: number) => progress(EXIT + a, EXIT + b, t);
      // Whirlpool.
      const open = easeOutCubic(progress(S0, S0 + 0.9, t)) * (1 - easeInCubic(out(0.9, 1.6)));
      disc.visible = open > 0.005;
      disc.scale.set(Math.max(0.001, open * G), 1, Math.max(0.001, open * G));
      disc.rotation.y = -t * 1.1;
      disc.material.opacity = Math.min(1, open * 1.3);
      under.visible = cyanPool.visible = disc.visible;
      under.material.opacity = (0.35 + 0.35 * dark) * open * (0.85 + 0.15 * Math.sin(t * 1.4));
      cyanPool.material.opacity = (0.25 + 0.3 * dark) * open;
      const holeK = smoothstep(S0 + 0.2, S0 + 0.7, t) * (1 - smoothstep(EXIT + 0.9, EXIT + 1.4, t));
      holes.visible = holeK > 0.01;
      holes.scale.set(Math.max(0.001, holeK * G), 1, Math.max(0.001, holeK * G));

      // Tentacles: unfurl up and in, sway, sink back.
      for (const tn of tentacles) {
        const a = S0 + 0.45 + tn.delay * 0.17;
        const up = easeOutBack(progress(a, a + 1.25, t), 1.2);
        const e = EXIT + 0.25 + (5 - tn.delay) * 0.08;
        const down = easeInCubic(progress(e, e + 0.75, t));
        const k = Math.max(0, up - down);
        tn.holder.visible = k > 0.005;
        tn.lean.scale.set(Math.max(0.001, k * GW), Math.max(0.001, k * GT), Math.max(0.001, k * GW));
        const sw = 0.07 * Math.sin(t * 0.7 + tn.i * 1.1);
        tn.lean.rotation.x = (1 - Math.min(1, k)) * 0.9 + sw * (tn.i % 2);
        tn.lean.rotation.z = sw * ((tn.i + 1) % 2);
      }
      fleshM.emissiveIntensity = (0.9 + 0.3 * dark) * (0.88 + 0.12 * Math.sin(t * 1.4));

      // Ribbons grow up from the ground, turn, and unwind from the bottom.
      const rk = easeInOutSine(progress(S0 + 0.9, S0 + 2.3, t));
      const ro = easeInCubic(out(0, 1.0));
      const startV = Math.floor(ro * SEGS) * 18;
      const endV = Math.min(RIB_VERTS, Math.floor(rk * SEGS) * 18);
      ribbons.visible = endV > startV;
      ribGeo.setDrawRange(startV, Math.max(0, endV - startV));
      ribSpin.rotation.y = t * 1.3;

      // The light comes down, then goes back up.
      const bk = easeOutCubic(progress(S0 + 1.4, S0 + 2.2, t));
      const bo = easeInCubic(out(0.2, 0.9));
      beamPivot.visible = bk > 0.005 && bo < 0.995;
      beamPivot.scale.set(1, Math.max(0.001, bk * (1 - bo)), 1);
      beamM.opacity = (dark > 0.5 ? 0.12 : 0.2) * bk * (1 - bo);

      // The orb ignites with a flare, holds, and goes out with a twinkle.
      const lift = LEV * easeInOutSine(progress(S0 + 0.8, S0 + 2.6, t)) * (1 - easeInOutSine(out(0.55, 1.3)));
      const bob = Math.sin(t * 1.3) * 0.06 * smoothstep(S0 + 2, S0 + 3, t) * (1 - smoothstep(EXIT, EXIT + 0.6, t));
      const ok = easeOutBack(progress(S0 + 2.05, S0 + 2.7, t), 2.2) * (1 - easeInCubic(out(0, 0.6)));
      gyro.visible = ok > 0.005;
      gyro.position.y = orbBase + lift + bob;
      gyro.scale.setScalar(Math.max(0.001, ok * (1 + (G - 1) * 0.6)));
      ring1.rotation.x = t * 0.8;
      ring2.rotation.z = -t * 0.6;
      const flare = Math.max(0, 1 - Math.abs(t - (S0 + 2.15)) / 0.45);
      orbHalo.material.opacity = 0.85 * ok + 0.15 * flare;
      orbBloom.material.opacity = (0.25 + 0.25 * dark) * ok + 0.45 * flare;
      orbBloom.scale.setScalar(1.8 + flare * 1.6);
      bodyLight.position.y = 1.15 + lift + bob;
      bodyLight.material.opacity = (0.08 + 0.28 * dark) * bk * (1 - bo);
      bodyLight.visible = bodyLight.material.opacity > 0.005;

      // Fish swim in from outside, stream round, and scatter.
      const fk = easeOutCubic(progress(S0 + 1.5, S0 + 2.8, t));
      const fo = easeInCubic(out(0, 1.0));
      school.visible = fk > 0.005 && fo < 0.995;
      if (school.visible) {
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i];
          const st = STREAMS[f.s];
          const a = f.a0 + t * st.w;
          const r = st.r + f.dr + (1 - fk) * 1.4 + fo * 1.6;
          const y = st.y + f.dy + Math.sin(t * 1.7 + f.ph) * 0.05;
          const sg = Math.sign(st.w);
          _o.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
          // Nose (+z) along the way it swims, tail wagging.
          _o.rotation.set(0, Math.atan2(sg * Math.cos(a), -sg * Math.sin(a)) + 0.2 * Math.sin(t * 9 + f.ph), 0);
          _o.scale.setScalar(Math.max(0.001, f.size * fk * (1 - fo)));
          _o.updateMatrix();
          school.setMatrixAt(i, _o.matrix);
        }
        school.instanceMatrix.needsUpdate = true;
      }

      const sk = smoothstep(S0 + 1.6, S0 + 2.8, t) * (1 - smoothstep(EXIT, EXIT + 1.2, t));
      sparkles.visible = sk > 0.01;
      if (sparkles.visible) {
        for (let i = 0; i < SPK; i++) {
          const s = spk[i];
          const a = s.a + t * 0.3;
          _o.position.set(Math.sin(a) * s.r, s.y + Math.sin(t * 0.8 + s.ph) * 0.08, Math.cos(a) * s.r);
          _o.rotation.set(0, t + s.ph, 0);
          const k = s.s * (0.35 + 0.65 * Math.abs(Math.sin(t * 2.6 + s.ph))) * sk;
          _o.scale.set(0.7 * k, 1.4 * k, 0.7 * k);
          _o.updateMatrix();
          sparkles.setMatrixAt(i, _o.matrix);
        }
        sparkles.instanceMatrix.needsUpdate = true;
      }

      // The player: braces, rises with the light, floats with a slow bob, and lands softly.
      pose.lift = Math.max(0, lift + bob);
      pose.squash = 1 - 0.06 * arc(progress(S0 + 0.5, S0 + 1.0, t)) + 0.04 * arc(progress(S0 + 2.05, S0 + 2.5, t)) - 0.07 * arc(progress(EXIT + 1.2, EXIT + 1.55, t));
      pose.pitch = -0.05 * smoothstep(S0 + 1.8, S0 + 2.6, t) * (1 - smoothstep(EXIT, EXIT + 0.8, t));

      // The zones woven in.
      const gone = easeInCubic(progress(EXIT + 0.3, EXIT + 1.2, t));
      kelp.update(t, easeOutBack(progress(S0 + 0.45, S0 + 1.7, t), 1.2) * (1 - gone));
      ct = t;
      cg = easeOutCubic(progress(S0 + 0.9, S0 + 2.8, t)) * (1 - easeInCubic(progress(EXIT - 0.1, EXIT + 1.1, t)));
      cAng = coilAngle(t) - 0.22 * (t - 5.5);
      csnap = Math.max(pulse(t - (S0 + 5.7), 1.0), 0.6 * pulse(t - (S0 + 3.4), 0.5), 0.6 * pulse(t - (S0 + 7.6), 0.5));
      lev.hide.emissiveIntensity = 0.12 + 0.15 * dark;
      lev.glow.color.setScalar(Math.max(0.05, cg) * (0.85 + 0.15 * Math.sin(t * 3)) * (1 + 0.4 * csnap));
      lev.update(0.12 + 0.06 * Math.max(0, Math.sin(t * 2.3)) + 0.55 * csnap);
      dreamer.update(t, pose.lift);
      // Jellies ride up the Leviathan's coils, a little outside them, gliding between its stations, drifting a little
      // and breathing like the Twilight's jellies.
      const jk = smoothstep(S0 + 2.0, S0 + 3.0, t) * (1 - smoothstep(EXIT, EXIT + 0.9, t));
      for (const j of jel) {
        const ph = (t * 0.07 + j.off) % 1;
        const fade = Math.sin(Math.PI * ph);
        const s = Math.max(0.001, jk * Math.min(1, fade * 1.6) * (1 + 0.1 * Math.sin(t * 3.2 + j.ph)));
        j.g.visible = s > 0.01;
        const fi = (1 - ph * 0.92) * CSEG;
        const i0 = Math.min(CSEG - 1, Math.floor(fi));
        JP.copy(lev.body.st[i0]).lerp(lev.body.st[i0 + 1], fi - i0);
        const outR = Math.hypot(JP.x, JP.z) || 1;
        j.g.position.set(JP.x * (1 + 0.32 / outR), JP.y + 0.28 + 0.05 * Math.sin(t * 1.3 + j.ph), JP.z * (1 + 0.32 / outR));
        j.g.rotation.set(0.15 * Math.sin(t * 0.9 + j.ph), 0, 0.12 * Math.cos(t * 0.7 + j.ph));
        const b = Math.sin(t * 2.6 + j.ph);
        j.g.scale.set(s * (1 + 0.1 * b), s * (1 - 0.08 * b), s * (1 + 0.1 * b));
      }
    },
    dispose: () => freeLook(group),
  };
};
