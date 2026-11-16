/**
 * The Twilight's emote, "Moonlit oarfish" (Oscar's pick, 2026-11-15; GAME_DESIGN.md §40). The zone's set comes alive
 * round the player in its in-game colours: pale little jellies (cyan-white, lilac, peach) like the Anemone Crown's and
 * Drift Tunic's, a pool of lilac light like the tunic's, and the Moonlit Oarfish, the Twilight's legend, with its
 * coral crest and rows of pale dot-lights. Pastel dusk, never dark neon.
 */
import * as THREE from 'three';
import { DEEP_LOOKS } from '../../../data/sea';
import { mulberry } from '../../env';
import { clamp01, easeInCubic, easeInOutSine, easeOutBack, easeOutCubic, freeLook, hump, lerp, progress, seedOf, smoothstep } from '../kit';
import { Batch, Glows, Strips, TAU, Tubes, fishBody, floorGlow, merge, paint, paintedMat, put, type Deform, type V3 } from '../meshes';
import type { EmoteLook } from '../types';

// ---------- the Twilight's colours (from character.ts's zone set, cosmetics.ts and sea.ts's DEEP_LOOKS) ----------

/** The Twilight's set: pale cyan-white, lilac and peach fish-light, lavender cloth. */
const NC = 0xdff2ff;
const NV = 0xc8b4f4;
const NM = 0xffb09a;
/** The Twilight's sky at the horizon (peach-rose) and its cloud (mauve). */
const TSKY = DEEP_LOOKS.twilight.skyH;
const TCLOUD = DEEP_LOOKS.twilight.cloudTop;
/** The Moonlit Oarfish (fishlook.ts). */
const OAR = { back: 0xd8e0ee, belly: 0xf4f7ff, spot: 0x8a9ab8, crest: 0xff7a9a, crest2: 0xffa08e };

const frac = (x: number): number => x - Math.floor(x);

/** Unlit see-through jelly, colour and opacity per vertex (like the set's `JELLY`). */
const JELLY_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });

/**
 * A little jelly like the set's (`miniJelly`), bell radius 1: a breathing bell with a lighter inner bell, a rim, a
 * bright heart, six threads and three frilly arms trailing. Tags: a = 0 bell, a >= 1 a thread (b = 0 root to 1 tip).
 */
function jellyGeo(color: number): THREE.BufferGeometry {
  const parts = [
    paint(put(new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, Math.PI / 2), [0, 0, 0], [0, 0, 0], [1, 0.8, 1]), color, 0.5),
    paint(put(new THREE.SphereGeometry(0.6, 10, 4, 0, TAU, 0, Math.PI / 2), [0, 0, 0], [0, 0, 0], [1, 0.75, 1]), 0xffffff, 0.25),
    paint(put(new THREE.TorusGeometry(0.97, 0.08, 3, 14), [0, 0, 0], [Math.PI / 2, 0, 0]), color, 0.85, 1.1),
    paint(put(new THREE.SphereGeometry(0.3, 7, 5), [0, 0.3, 0]), color, 1, 1.35),
  ];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.3;
    parts.push(paint(put(new THREE.CylinderGeometry(0.05, 0.014, 1.8, 3, 7, true), [Math.sin(a) * 0.72, -0.9, Math.cos(a) * 0.72]), color, 0.6, 1, 1 + k, (_x, y) => clamp01(-y / 1.8)));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU;
    parts.push(paint(put(new THREE.CylinderGeometry(0.11, 0.03, 1.1, 4, 5, true), [Math.sin(a) * 0.14, -0.5, Math.cos(a) * 0.14]), color, 0.45, 1.05, 7 + k, (_x, y) => clamp01(-y / 1.1)));
  }
  return merge(parts);
}

/** Bends a jelly: the bell breathes by `k`, its threads ripple at time `t` with phase `ph`. */
function jellyDeformer(): { k: number; t: number; ph: number; fn: Deform } {
  const s = {
    k: 0,
    t: 0,
    ph: 0,
    fn: (v: THREE.Vector3, a: number, b: number) => {
      if (a < 1) {
        v.x *= 1 + s.k;
        v.z *= 1 + s.k;
        v.y *= 1 - 0.6 * s.k;
        return;
      }
      const root = 1 + s.k * (1 - b);
      const w = s.t * 2.3 + s.ph + a * 1.3 - b * 4;
      v.x = v.x * root + Math.sin(w) * 0.24 * b;
      v.z = v.z * root + Math.cos(w * 0.9 + a) * 0.24 * b;
      v.y *= 1 - 0.18 * s.k * b;
    },
  };
  return s;
}

/** The emote's length in seconds, which its timings below are written against (`EMOTES`, `src/data/emotes.ts`). */
export const TWILIGHT_SECONDS = 10;

/**
 * The Moonlit Oarfish swims in and coils up round you in a slow spiral, silver with its coral crest rippling and rows
 * of pale dot-lights; jellies drift round you as you float, and when it's done it rises and melts into light from the
 * tail up.
 */
export const twilight: EmoteLook = (ctx) => {
  const rnd = mulberry(seedOf('twilight-B'));
  const group = new THREE.Group();
  const clear = Math.max(0.72, ctx.reach + 0.4);
  const LEN = 4.2;
  const SEGS = 44;
  const th0 = -1.0;
  // It coils up to just over your crown, so at the top it circles above your face rather than across it.
  const topY = Math.max(ctx.top + 0.32, 2.45);
  const out = (tau: number): number => easeInCubic(progress(7.0, 9.6, tau));
  const headPath = (tau: number, o: THREE.Vector3): THREE.Vector3 => {
    const th = th0 + 1.2 * tau;
    const R = lerp(3.6, clear + 0.3, easeOutCubic(progress(-0.6, 2.6, tau))) - 0.12 * smoothstep(3.5, 5.5, tau) + Math.max(0, -0.6 - tau) * 1.5 + 1.2 * out(tau);
    const y = 0.45 + (topY - 0.45) * easeInOutSine(progress(0.4, 5.6, tau)) + 0.08 * Math.sin(2.1 * tau) + 2.4 * out(tau);
    return o.set(Math.sin(th) * R, y, Math.cos(th) * R);
  };
  const lag = LEN / ((clear + 0.3) * 1.2);
  // The body melts away from the tail; `cut` is the share of it left.
  let cut = 1;
  let t = 0;
  const thick = (s: number): number => (0.4 + 0.6 * smoothstep(0, 0.08, s)) * (1 - 0.82 * s ** 1.4);
  const left = (s: number): number => (1 - smoothstep(cut - 0.07, cut, s)) * smoothstep(0, 0.9, t);
  const bodyFill = (_i: number, s: number, P: THREE.Vector3, R: { h: number; w: number }): void => {
    headPath(t - s * lag, P);
    P.y += 0.05 * Math.sin(s * 14 - t * 4) * s;
    const k = left(s);
    R.h = 0.13 * thick(s) * k;
    R.w = 0.042 * thick(s) * k;
  };
  const body = new Tubes(
    1,
    SEGS,
    6,
    (_i, s, k, c) => {
      const j = Math.round(s * SEGS);
      const side = k === 0 || k === 3;
      c.set(side && j % 3 === 1 ? OAR.spot : k === 1 || k === 2 ? OAR.back : OAR.belly);
      return 1;
    },
    paintedMat(ctx.dark, 0x30384c, 0.7),
  );
  const crest2 = new THREE.Color(OAR.crest2);
  const crest = new Strips(
    1,
    SEGS,
    (_i, s, c) => void c.set(OAR.crest).lerp(crest2, s),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, roughness: 0.6, emissive: OAR.crest, emissiveIntensity: 0.25 + 0.35 * ctx.dark }),
  );
  // The crest stands up off the back, rippling as it goes.
  const crestFill = (_i: number, s: number, P: THREE.Vector3, S: THREE.Vector3): void => {
    const j = Math.round(s * SEGS);
    const k = left(s);
    const rh = 0.13 * thick(s) * k;
    const ch = (0.075 * (0.75 + 0.25 * Math.sin(s * 70 - t * 9)) * (1 - 0.5 * s) + 0.02) * k;
    P.copy(body.st[j]).addScaledVector(body.N[j], rh + ch / 2 - 0.01);
    S.copy(body.N[j]).multiplyScalar(ch / 2);
  };
  // The head: a silver snout and a plume of long coral rays sweeping back off it.
  const headParts = [
    fishBody(
      [
        [0.22, 0.02, 0.012, -0.01],
        [0.12, 0.09, 0.035, 0],
        [0.0, 0.13, 0.042, 0],
      ],
      6,
      OAR.back,
      OAR.belly,
    ),
  ];
  const plumeTips: V3[] = [];
  for (let k = 0; k < 6; k++) {
    const l = 0.4 + (k % 3) * 0.14;
    const rx = -0.5 - k * 0.22;
    const tilt = (k - 2.5) * 0.06;
    const base: V3 = [tilt * 0.3, 0.1, 0.1 - k * 0.025];
    headParts.push(paint(put(new THREE.CylinderGeometry(0.004, 0.013, l, 4, 4).translate(0, l / 2, 0), base, [rx, 0, tilt]), OAR.crest, 1, 1, 1, (_x, y) => clamp01((y - 0.1) / l)));
    const tip = new THREE.Vector3(0, l, 0).applyEuler(new THREE.Euler(rx, 0, tilt)).add(new THREE.Vector3(...base));
    plumeTips.push([tip.x, tip.y, tip.z]);
  }
  const head = new Batch([merge(headParts)], paintedMat(ctx.dark, 0x30384c, 0.7));
  const plumeSway: Deform = (v, a, b) => {
    if (a > 0) v.x += Math.sin(t * 3 - b * 3) * 0.04 * b;
  };

  // Little jellies drifting in a ring round you.
  const NJ = 8;
  const jcols = [NC, NV, NM];
  const jel = Array.from({ length: NJ }, (_, j) => ({ born: 0.8 + j * 0.25, a: (j / NJ) * TAU, r: clear + 0.1 + rnd() * 0.25, y: 0.5 + ((j * 0.37) % 1) * 1.3, size: 0.09 + rnd() * 0.05, ph: rnd() * TAU }));
  const jellies = new Batch(
    jel.map((_, j) => jellyGeo(jcols[j % 3])),
    JELLY_MAT,
  );
  const jd = jellyDeformer();
  const NL = 14;
  const NMOTE = 16;
  const glows = new Glows(NJ + NL * 2 + 1 + plumeTips.length + NMOTE, ctx.dark);
  const pool = floorGlow(1.9, TCLOUD, ctx.dark);
  const core = floorGlow(1.0, TSKY, ctx.dark);
  group.add(pool, core, body.mesh, crest.mesh, head.mesh, jellies.mesh, glows.mesh);

  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const Pv = new THREE.Vector3();
  const Sv = new THREE.Vector3();
  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const L = new THREE.Vector3();
  const JC = jcols.map((c) => new THREE.Color(c));
  const cPale = new THREE.Color(NC);
  const cEye = new THREE.Color(OAR.crest);
  const cTip = new THREE.Color(NM);
  const motes = Array.from({ length: NMOTE }, () => ({ s: rnd(), dx: rnd() - 0.5, dz: rnd() - 0.5, up: 0.3 + rnd() * 0.5, size: 0.08 + rnd() * 0.08 }));

  return {
    group,
    update(time, _dt, pose) {
      t = time;
      cut = 1 - easeInOutSine(progress(7.2, 9.6, t));
      body.write(0, bodyFill);
      body.commit();
      crest.write(0, crestFill);
      crest.commit();

      // The head rides on the front of the body.
      Z.subVectors(body.st[0], body.st[2]).normalize();
      X.crossVectors(body.N[0], Z).normalize();
      Y.crossVectors(Z, X);
      const hs = smoothstep(0, 0.9, t) * smoothstep(0, 0.05, cut);
      M.makeBasis(X, Y, Z)
        .scale(Sv.setScalar(Math.max(hs, 1e-4)))
        .setPosition(body.st[0]);
      head.place(0, M, plumeSway);
      head.commit();

      let g = 0;
      // Rows of pale dot-lights down each flank, the eye and the plume's tips.
      for (let k = 0; k < NL; k++) {
        const s = 0.06 + (k / NL) * 0.85;
        const j = Math.round(s * SEGS);
        const on = (1 - smoothstep(cut - 0.1, cut - 0.02, s)) * smoothstep(0.3, 1.2, t);
        for (const side of [-1, 1]) {
          L.copy(body.st[j])
            .addScaledVector(body.B[j], side * 0.05 * thick(s))
            .addScaledVector(body.N[j], -0.04 * thick(s));
          glows.set(g++, L.x, L.y, L.z, 0.08, cPale, 0.9 * on);
        }
      }
      L.set(0.03, 0.04, 0.14).applyMatrix4(M);
      glows.set(g++, L.x, L.y, L.z, 0.14, cEye, 0.9 * hs);
      for (const tip of plumeTips) {
        L.set(tip[0], tip[1], tip[2]).applyMatrix4(M);
        glows.set(g++, L.x, L.y, L.z, 0.13, cTip, 0.9 * hs);
      }
      // Motes of light left where it melts away.
      for (const m of motes) {
        const age = frac(t * 0.8 + m.s);
        const sAt = 1 - easeInOutSine(progress(7.2, 9.6, t - age * 1.25));
        if (t < 7.2 || sAt > 0.995 || sAt < 0.005) {
          glows.hide(g++);
          continue;
        }
        const p = body.st[Math.round(sAt * SEGS)];
        glows.set(g++, p.x + m.dx * 0.3 * age, p.y + m.up * age, p.z + m.dz * 0.3 * age, m.size, m.s < 0.5 ? cPale : cTip, 0.9 * hump(age) * (1 - smoothstep(9.4, 10, t)));
      }

      const end = 1 - smoothstep(9.2, 10, t);
      for (let j = 0; j < NJ; j++) {
        const J = jel[j];
        const age = t - J.born;
        if (age <= 0) {
          jellies.hide(j);
          glows.hide(g++);
          continue;
        }
        const th = J.a - 0.22 * t;
        const y = J.y + 0.06 * age + 0.06 * Math.sin(age * 2.4 + J.ph) + 1.2 * easeInCubic(progress(7.4, 10, t));
        const s = J.size * easeOutBack(progress(0, 0.8, age));
        const alpha = (1 - smoothstep(7.8, 9.6, t)) * end;
        Pv.set(Math.sin(th) * J.r, y, Math.cos(th) * J.r);
        Q.setFromEuler(E.set(0.15 * Math.sin(age + J.ph), th, 0.12 * Math.cos(age * 0.8 + J.ph)));
        M.compose(Pv, Q, Sv.setScalar(s));
        jd.k = 0.13 * Math.sin(age * 2.4 + J.ph);
        jd.t = t;
        jd.ph = J.ph;
        jellies.place(j, M, jd.fn, alpha);
        glows.set(g++, Pv.x, Pv.y + s * 0.2, Pv.z, s * 6, JC[j % 3], 0.5 * alpha);
      }
      jellies.commit();
      glows.commit();

      const poolOn = smoothstep(0.4, 2.0, t) * (1 - smoothstep(8.0, 9.8, t));
      pool.material.opacity = 0.5 * poolOn;
      core.material.opacity = 0.45 * poolOn * (0.85 + 0.15 * Math.sin(t * 2));

      const up = easeInOutSine(progress(1.6, 3.6, t)) * (1 - easeInOutSine(progress(7.6, 9.6, t)));
      const peak = smoothstep(4.0, 5.5, t) * (1 - smoothstep(7.0, 8.0, t));
      pose.lift = 0.25 * up + 0.04 * Math.sin(t * 1.4) * up;
      pose.pitch = -0.1 * peak;
      pose.yaw = 0.4 * Math.sin(t * 0.6) * up;
      pose.roll = 0.04 * Math.sin(t * 1.1) * up;
    },
    dispose: () => freeLook(group),
  };
};
