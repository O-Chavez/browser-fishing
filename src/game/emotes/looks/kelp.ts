/**
 * Kelp Deep's emote, "Seadragon dance" (Oscar's pick, 2026-11-15; GAME_DESIGN.md §40). The zone's set comes alive
 * round the player in its in-game colours: the set's gold, olive and brown blades with a float at each tip, pale
 * sea-green bubbles, the zone's kelp-green water as a pool of light, sea glass from the Holdfast Pendant, and the
 * Frondback Seadragon.
 */
import * as THREE from 'three';
import { DEEP_LOOKS } from '../../../data/sea';
import { mulberry } from '../../env';
import { easeInCubic, easeOutCubic, freeLook, lerp, lowPolyMat, progress, seedOf, smoothstep } from '../kit';
import { Batch, Glows, Instances, Strips, TAU, along, bladeWidth, fishBody, floorGlow, heading, leaf, merge, paint, paintedMat, put, swimDeformer, type V3 } from '../meshes';
import type { EmoteLook } from '../types';

// ---------- Kelp Deep's colours (from character.ts's zone set, cosmetics.ts and sea.ts's DEEP_LOOKS) ----------

/** Kelp Deep's set: olive cloth, gold and dark-gold blades, gold floats, sea glass, pale sea-green bubbles. */
const KOLIVE = 0x7d8a34;
const KGOLD = 0xc8962e;
const KGOLD_D = 0x7a5a1e;
const KFLOAT = 0xb08a3a;
const SEAGLASS = 0x8ff0c0;
const BUBBLE = 0xbff8ee;
/** Kelp Deep's water, lifted a little toward sea glass so it reads as light on the ground. */
const KWATER = new THREE.Color(DEEP_LOOKS.kelp.water).lerp(new THREE.Color(SEAGLASS), 0.35).getHex();
/** The Frondback Seadragon (fishlook.ts): olive back, gold belly and bars, leafy green frills. */
const FROND = { back: 0x8a8a2e, belly: 0xf0d77a, bar: 0xe6c85a, leaf: 0x9fcf4a, leaf2: 0xb6d65a };

const frac = (x: number): number => x - Math.floor(x);

/** The set's bubbles (`BUBBLE` in character.ts), with a little glow of their own at night. */
function bubbleMat(dark: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: BUBBLE,
    transparent: true,
    opacity: 0.6,
    roughness: 0.1,
    flatShading: true,
    emissive: 0x3a8a7a,
    emissiveIntensity: 0.2 + 0.5 * dark,
    depthWrite: false,
  });
}

/** The Frondback Seadragon, 1 long: a long olive body with gold bars, a snout, little dark eyes and leafy frills. */
function frondbackGeo(): THREE.BufferGeometry {
  const st: [number, number, number, number][] = [
    [0.5, 0.014, 0.014, 0.0],
    [0.4, 0.024, 0.022, 0.005],
    [0.32, 0.075, 0.06, 0.02],
    [0.22, 0.06, 0.05, 0.01],
    [0.1, 0.11, 0.08, 0],
    [-0.04, 0.1, 0.075, 0],
    [-0.18, 0.068, 0.05, 0.01],
    [-0.32, 0.04, 0.03, 0.02],
    [-0.44, 0.02, 0.016, 0.035],
    [-0.5, 0.006, 0.006, 0.05],
  ];
  const parts = [fishBody(st, 7, FROND.back, FROND.belly, (j) => (j === 4 || j === 6 ? FROND.bar : null))];
  const tag = along(0.5, -0.5);
  // Its leafy frills: big leaves along the back, smaller under the belly and out of the sides.
  const leaves: [number, number, number][] = [
    [0.12, 0.11, 0.24],
    [-0.04, 0.1, 0.26],
    [-0.2, 0.068, 0.2],
    [-0.36, 0.04, 0.15],
  ];
  leaves.forEach(([z, h, l], i) => {
    const c = i % 2 ? FROND.leaf : FROND.leaf2;
    parts.push(paint(put(leaf(l * 0.6, l, 0.35), [0, h * 0.85, z], [-0.75, 0, 0]), c, 1, 1, 0, tag));
    parts.push(paint(put(leaf(l * 0.5, l * 0.7, 0.35), [0, -h * 0.85, z], [0.75, 0, Math.PI]), FROND.leaf2, 1, 1, 0, tag));
    if (i < 3) {
      parts.push(paint(put(leaf(l * 0.45, l * 0.65, 0.35), [h * 0.7, -0.01, z], [0, 0.75, -Math.PI / 2]), FROND.leaf, 1, 1, 0, tag));
      parts.push(paint(put(leaf(l * 0.45, l * 0.65, 0.35), [-h * 0.7, -0.01, z], [0, -0.75, Math.PI / 2]), FROND.leaf, 1, 1, 0, tag));
    }
  });
  // A frill on the head and big friendly eyes.
  parts.push(paint(put(leaf(0.08, 0.13, 0.35), [0, 0.08, 0.3], [-0.9, 0, 0]), FROND.leaf2, 1, 1, 0, tag));
  for (const x of [-1, 1]) {
    parts.push(paint(put(new THREE.SphereGeometry(0.03, 6, 4), [x * 0.05, 0.04, 0.33]), 0xfaf4e0, 1, 1, 0, 0.17));
    parts.push(paint(put(new THREE.SphereGeometry(0.018, 5, 3), [x * 0.072, 0.045, 0.345]), 0x2a2416, 1, 1, 0, 0.16));
  }
  return merge(parts);
}

/** Where the set's pendant hangs (character.ts), riding on the pose's lift. */
const PENDANT: V3 = [0, 1.1, 0.4];

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const KELP_SECONDS = 9.5;

/**
 * A stand of kelp grows round you and three little schools of Frondback Seadragons swim in, weaving in and out
 * between the blades; at the height of it they all circle your head like a leafy crown, then swim off up and away as
 * the kelp sinks.
 */
export const kelp: EmoteLook = (ctx) => {
  const rnd = mulberry(seedOf('kelp-C'));
  const group = new THREE.Group();
  const clear = Math.max(0.62, ctx.reach + 0.28);
  const NK = 7;
  const RK = clear + 0.78;
  const cols = [KGOLD, KOLIVE, KGOLD, KGOLD_D];
  const blades = Array.from({ length: NK }, (_, i) => ({ a: ((i + 0.5) / NK) * TAU, r: RK + (rnd() - 0.5) * 0.1, h: 1.8 + rnd() * 0.7, w: 0.22 + rnd() * 0.05, d: rnd() * 0.6, tw: (rnd() - 0.5) * 2, ph: rnd() * TAU, col: cols[i % cols.length] }));
  const grow = new Float32Array(NK);
  let t = 0;
  const bladeFill = (i: number, s: number, P: THREE.Vector3, S: THREE.Vector3): void => {
    const b = blades[i];
    const L = b.h * grow[i];
    const sa = Math.sin(b.a);
    const ca = Math.cos(b.a);
    const wave = Math.sin(t * 1.5 - s * 3 + b.ph) * 0.09 * L * s;
    const lean = 0.08 * L * s * s;
    P.set(sa * (b.r + lean) + ca * wave, L * s * (1 - 0.05 * s), ca * (b.r + lean) - sa * wave);
    const q = b.tw * s + 0.4 * Math.sin(t * 1.2 + b.ph) * s;
    const hw = 0.5 * b.w * bladeWidth(s) * Math.min(1, grow[i] * 3);
    S.set((ca * Math.cos(q) + sa * Math.sin(q)) * hw, 0, (-sa * Math.cos(q) + ca * Math.sin(q)) * hw);
  };
  const strips = new Strips(NK, 32, (i, s, c) => void c.set(blades[i].col).multiplyScalar(0.95 + 0.35 * s), paintedMat(ctx.dark, 0x4a4220, 0.55));
  const floats = new Instances(new THREE.SphereGeometry(1, 8, 6), lowPolyMat(KFLOAT, { rough: 0.6, glow: 0.35 * ctx.dark }), NK);

  // Three schools of four, a third of the way round from each other, each fish a little behind the one before.
  const LANES = 3;
  const PER = 4;
  /** Seconds each fish swims behind the one before it. */
  const LAG = 0.38;
  const NF = LANES * PER;
  const fishInfo = Array.from({ length: NF }, (_, f) => ({ lane: Math.floor(f / PER), k: f % PER, side: (rnd() - 0.5) * 0.26, dy: (rnd() - 0.5) * 0.28, size: 0.58 + rnd() * 0.12, ph: rnd() * TAU }));
  const fish = new Batch(
    Array.from({ length: NF }, () => frondbackGeo()),
    paintedMat(ctx.dark, 0x3a4018, 0.5),
  );
  const th0 = -0.4;
  // Round your head, below the cap's blades: the camera's top edge is not far above.
  const crownY = Math.min(Math.max(ctx.top - 0.45, 1.85), 2.05);
  const lanePath = (lane: number, tau: number, o: THREE.Vector3): THREE.Vector3 => {
    const th = th0 + (lane / LANES) * TAU + 1.0 * tau;
    const rel = th - th0 - (lane / LANES) * TAU;
    const come = easeOutCubic(progress(0, 2.0, tau));
    const crown = smoothstep(4.0, 5.0, tau) * (1 - smoothstep(6.4, 7.0, tau));
    const away = easeInCubic(progress(6.6, 8.2, tau));
    const weave = 0.36 * Math.sin(3.5 * rel + 0.6) * smoothstep(0.8, 2.0, tau);
    const R = lerp(lerp(4.4, RK, come) + weave, clear + 0.18, crown) + 3.8 * away;
    const y = lerp(1.05 + 0.5 * Math.sin(0.9 * rel + lane * 2.1), crownY + 0.12 * Math.sin(2 * th), crown) + 1.4 * away;
    return o.set(Math.sin(th) * R, y, Math.cos(th) * R);
  };
  const swim = swimDeformer();
  const NBF = NF * 3;
  const NBK = 24;
  const bubbles = new Instances(new THREE.IcosahedronGeometry(1, 1), bubbleMat(ctx.dark), NBF + NBK);
  const kb = Array.from({ length: NBK }, (_, j) => {
    const b = blades[j % NK];
    const v = 0.7 + rnd() * 0.4;
    return { x: Math.sin(b.a) * b.r, z: Math.cos(b.a) * b.r, P: 3.4 / v, off: rnd(), size: 0.025 + rnd() * 0.03, ph: rnd() * TAU };
  });
  const pool = floorGlow(1.9, KWATER, ctx.dark);
  const glows = new Glows(1, ctx.dark);
  const glass = new THREE.Color(SEAGLASS);
  group.add(pool, strips.mesh, floats.mesh, fish.mesh, bubbles.mesh, glows.mesh);

  const M = new THREE.Matrix4();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const D = new THREE.Vector3();
  const P = new THREE.Vector3();
  const S = new THREE.Vector3();
  /** Fish f at `time` (its own delay applied): position into A, heading into D; returns its own clock. */
  const fishAt = (f: number, time: number): number => {
    const fi = fishInfo[f];
    const tau = time - fi.k * LAG;
    lanePath(fi.lane, tau, A);
    lanePath(fi.lane, tau - 0.05, B);
    D.subVectors(A, B).normalize();
    // A little off the lane, to the side and up or down, so a school isn't a single file.
    A.x += -D.z * fi.side;
    A.z += D.x * fi.side;
    A.y += fi.dy;
    return tau;
  };

  return {
    group,
    update(time, _dt, pose) {
      t = time;
      for (let i = 0; i < NK; i++) {
        const b = blades[i];
        grow[i] = easeOutCubic(progress(0.2 + b.d, 1.9 + b.d, t)) * (1 - easeInCubic(progress(7.0 + b.d * 0.5, 8.7 + b.d * 0.5, t)));
        if (grow[i] <= 0.001) {
          strips.hide(i);
          floats.set(i, 0, 0, 0, 0);
          continue;
        }
        strips.write(i, bladeFill);
        bladeFill(i, 1, P, S);
        const fs = 0.06 * smoothstep(0.15, 0.5, grow[i]);
        floats.set(i, P.x, P.y + fs, P.z, fs, fs * 1.3, fs);
      }
      strips.commit();
      floats.commit();

      let n = 0;
      for (let f = 0; f < NF; f++) {
        const fi = fishInfo[f];
        const tau = fishAt(f, t);
        const size = fi.size * smoothstep(0.0, 0.6, tau) * (1 - smoothstep(7.8, 8.3, tau));
        if (size <= 0.001) fish.hide(f);
        else {
          swim.w = t * 7 + fi.ph;
          swim.amp = 0.07;
          fish.place(f, heading(M, A, D, size, -0.25), swim.fn);
        }
        // Three bubbles trail off each fish, from where it was a moment ago.
        for (let k = 0; k < 3; k++) {
          const age = frac(t / 1.2 + k / 3 + fi.ph);
          const tb = t - age - fi.k * LAG;
          const e = smoothstep(1.0, 1.6, tb) * (1 - smoothstep(6.4, 6.8, tb));
          if (e <= 0) {
            bubbles.set(n++, 0, 0, 0, 0);
            continue;
          }
          lanePath(fi.lane, tb, B);
          bubbles.set(n++, B.x, B.y + fi.dy + age * 0.7, B.z, 0.026 * e * (1 - smoothstep(0.7, 1, age)) * smoothstep(0, 0.1, age));
        }
      }
      fish.commit();
      const end = 1 - smoothstep(8.4, 9.3, t);
      for (const b of kb) {
        const k = frac(t / b.P + b.off);
        const born = t - k * b.P;
        const e = smoothstep(0.6, 1.6, born) * (1 - smoothstep(6.6, 7.2, born));
        bubbles.set(n++, b.x + 0.05 * Math.sin(t * 3 + b.ph), 0.06 + k * 3.4, b.z, b.size * e * smoothstep(0, 0.05, k) * (1 - smoothstep(0.9, 1, k)) * end);
      }
      bubbles.commit();

      const crown = smoothstep(4.6, 5.4, t) * (1 - smoothstep(6.5, 7.2, t));
      const lift = 0.16 * crown + 0.03 * Math.sin(t * 1.8) * crown;
      glows.set(0, PENDANT[0], PENDANT[1] + lift, PENDANT[2] + 0.03, 0.5, glass, 0.8 * crown);
      glows.commit();
      pool.material.opacity = 0.45 * smoothstep(0.2, 1.6, t) * (1 - smoothstep(7.4, 9.0, t));

      // You turn to watch them go round, and look up when they crown you.
      const watch = smoothstep(1.2, 2.6, t) * (1 - smoothstep(7.0, 8.6, t));
      pose.yaw = 0.45 * Math.sin(t * 0.7 - 0.6) * watch;
      pose.pitch = -0.1 * crown;
      pose.lift = lift;
      pose.roll = 0.04 * Math.sin(t * 1.4) * watch;
    },
    dispose: () => freeLook(group),
  };
};
