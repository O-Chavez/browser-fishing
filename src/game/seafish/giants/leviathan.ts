// The Leviathan: a long armoured sea serpent. Black plates overlapping like roof tiles over a molten core that shows
// in the seams between them, a bone spine on every plate, a massive horned skull with a long fanged jaw and a row of
// half-lidded burning eyes, a blade for a tail. It carries what ships left in it: harpoons, and an anchor on its chain.
//
// Its `limp` build is for the landing (`LEGEND_SHOW.leviathan`), where it lies beaten on the water: the same serpent
// with its jaw hanging slack, its lids lower and its horns laid back along its neck, so that with its head on its
// side none of them stands up in the air.
import * as THREE from 'three';
import { Bucket, type Built, type Frame, type Sway, TAU, V, type V3, ball, blend, chain, cone, facing, fan, loft, mix, palette, placed, ribbon, rod, seeded, smooth, sweep, tube } from './kit';

/** The spine from the back of the skull to the tail's root: humps up and down, and a slow S from side to side. */
const SPINE = new THREE.CatmullRomCurve3(
  [
    V(0.0, 0.15, -0.281),
    V(0.004, 0.15, -0.236),
    V(0.022, 0.105, -0.168),
    V(0.05, 0.02, -0.11),
    V(0.068, -0.05, -0.05),
    V(0.05, -0.07, 0.015),
    V(0.0, -0.04, 0.075),
    V(-0.05, 0.01, 0.13),
    V(-0.07, 0.04, 0.19),
    V(-0.05, 0.03, 0.25),
    V(-0.005, -0.01, 0.305),
    V(0.03, -0.04, 0.355),
    V(0.02, -0.03, 0.405),
  ],
  false,
  'catmullrom',
  0.5,
);
SPINE.arcLengthDivisions = 400;
const UP = V(0, 1, 0);
/** The body's half-height at its thickest. */
const GIRTH = 0.062;
const PLATES = 20;

/** The body's half-height `u` of the way down it: a neck, the bulk, a long taper to the tail. */
const girth = (u: number) => GIRTH * (0.8 + 0.2 * smooth(u / 0.16)) * (1 - 0.8 * Math.pow(smooth((u - 0.4) / 0.6), 1.15));

function frameU(u: number): Frame {
  const p = SPINE.getPointAt(u);
  const t = SPINE.getTangentAt(u).normalize();
  const n = UP.clone().addScaledVector(t, -t.y).normalize();
  return { p, t, n, b: t.clone().cross(n).normalize(), q: u };
}

/** A point on the armour: `phi` round the body from the top of the back, `k` times the body's own thickness there. */
function skin(f: Frame, phi: number, k: number): V3 {
  const r = girth(f.q) * k;
  const c = Math.cos(phi);
  return f.p
    .clone()
    .addScaledVector(f.n, c * r * (c < 0 ? 0.86 : 1))
    .addScaledVector(f.b, Math.sin(phi) * r * 0.9);
}

/** The serpent's slow wave: nothing at the head and neck, the most at the tail, travelling down the body. */
const WAVE: Sway = (p) => [0.03 * smooth((p.z + 0.18) / 0.6), -p.z * 8];

/** Which of a loft's rows a corner belongs to, for `cols` quads a row. */
const rowOf = (i: number, cols: number) => Math.floor(Math.floor(i / 6) / cols) + ([2, 4, 5].includes(i % 6) ? 1 : 0);

export function buildLeviathan(limp = false): Built {
  const C = palette();
  const hard = new Bucket(), soft = new Bucket(), glow = new Bucket(), bloom = new Bucket();
  // The underwater silhouette's plainer outline: the plates, spines, skull, horns, eyes and what it carries, in few pieces.
  const shade = new Bucket();
  const SH = new THREE.Color(0);
  const sh = (g: THREE.BufferGeometry) => shade.put(g, SH);
  const rng = seeded('leviathan');
  const RIMC = C(0xa898e8);
  const PLATE = C(0x1e1b40), EDGE = C(0x4c4898), BELLY = C(0x2a2242), DEEP = C(0x0c0a18), WARM = C(0x5a3448);
  const EMBER = C(0xff6a1a), HOT = blend(C(0xff6a1a), new THREE.Color(0xfff0c0), 0.62), COAL = C(0xb83a0a);
  const BONE = C(0xf4e8cc), BONE_D = C(0xa8946c), IRIS = C(0xffb02e), INK = new THREE.Color(0x140a1c);
  const twinkles: Built['twinkles'] = [];
  const sprites: Built['sprites'] = [];
  /** How bright the molten light is `u` of the way down the body: hottest at the head, embers toward the tail. */
  const heat = (u: number) => mix(1, 0.38, smooth(u / 0.85));

  // ---- the dark core under the plates, seen only in the cracks along the flanks ----
  const coreFr = Array.from({ length: 61 }, (_, i) => frameU(i / 60));
  hard.put(
    sweep(coreFr, 10, (q, a) => girth(q) * 0.9 * (Math.cos(a) < 0 ? mix(1, 0.86, -Math.cos(a)) : 1), { squash: [1, 0.9], col: () => DEEP, caps: [true, true] }),
    undefined,
    WAVE,
  );
  // In the silhouette it fills the slots between the plates' edges, which line up seen from straight above.
  sh(sweep(coreFr.filter((_, i) => i % 2 === 0), 6, (q, a) => girth(q) * 0.9 * (Math.cos(a) < 0 ? mix(1, 0.86, -Math.cos(a)) : 1), { squash: [1, 0.9], caps: [true, true] }));

  // ---- the plates: overlapping like roof tiles, each lip over the front of the next ----
  const lip = 0.12 / PLATES;
  for (let i = 0; i < PLATES; i++) {
    const u0 = i / PLATES, u1 = (i + 1) / PLATES;
    const uA = Math.max(0, u0 - 0.1 / PLATES), uC = Math.min(1, u1 + lip);
    const stops: [Frame, number][] = [[frameU(uA), 0.94], [frameU(mix(u0, u1, 0.3)), 1.02], [frameU(mix(u0, u1, 0.8)), 1.07], [frameU(uC), 1.1]];
    // Where the back plate ends and the flank plates end, shifted on every other ring so the seams run like brickwork.
    const D = i % 2 ? 0.7 : 0.86, F = i % 2 ? 2.16 : 2.32, AG = 0.05;
    const tone = 0.9 + rng() * 0.22;
    const piece = (phis: number[], lift: (j: number) => number, base: THREE.Color, edge: THREE.Color, rim = 0.35) => {
      const rows = stops.map(([f, k]) => phis.map((phi, j) => skin(f, phi, k * lift(j))));
      const b = base.clone().multiplyScalar(tone);
      const cols = [b.clone().multiplyScalar(0.75), b, b, blend(b, edge, rim)];
      hard.put(loft(rows, false), (_, n) => cols[rowOf(n, phis.length - 1)], WAVE);
      // Its outline is the lip; the rise to it is one step in the silhouette.
      sh(loft([rows[0], rows[2], rows[3]], false));
    };
    // The back plates' lips catch the lamp in a pale violet rim, so the curves read against the night.
    piece([-D, -D * 0.45, 0, D * 0.45, D], (j) => (j === 2 ? 1.1 : j === 1 || j === 3 ? 1.04 : 1), PLATE, RIMC, 0.9);
    piece([D + AG, (D + AG + F) / 2, F], () => 1, PLATE, RIMC, 0.5);
    piece([-F, -(D + AG + F) / 2, -(D + AG)], () => 1, PLATE, RIMC, 0.5);
    piece([F + AG, Math.PI - 0.32, Math.PI + 0.32, TAU - F - AG], () => 0.98, BELLY, blend(BELLY, WARM, 0.4));

    // Light in the cracks: on some seams only, a broken run of it just behind the lip, uneven in width, and
    // fewer and dimmer down the body; many plates stay dark and whole.
    const h = heat(u0);
    const lit = i < PLATES - 1 && rng() < mix(1, 0.25, smooth(u0 / 0.8));
    if (!lit && i < PLATES - 1) {
      // The seams between: a faint smoulder low in the crack, all the way down.
      const fC = frameU(Math.min(1, uC + lip * 0.7));
      const a0 = -2.3 + rng() * 0.6, len = 3.4 + rng() * 1.2;
      const pts = Array.from({ length: 15 }, (_, j) => {
        const phi = a0 + (j / 14) * len;
        const p = skin(fC, phi, 0.99 * (phi > -D && phi < D ? 1.04 : 1));
        return { p, n: p.clone().sub(fC.p).normalize() };
      });
      glow.put(ribbon(pts, 0.0024 + 0.0014 * h, true, 0.0012), blend(COAL, EMBER, 0.35).multiplyScalar(0.42 + 0.3 * h), WAVE);
    }
    if (lit) {
      const fL = frameU(uC), fC = frameU(Math.min(1, uC + lip * 0.7));
      const a0 = -2.3 + rng() * 2.6, len = 0.8 + rng() * 2 * h;
      const n = 9;
      const along = (f: Frame, k: number, from: number, to: number) =>
        Array.from({ length: n }, (_, j) => {
          const phi = a0 + mix(from, to, j / (n - 1)) * len;
          const p = skin(f, phi, k * (phi > -D && phi < D ? 1.04 : 1));
          return { p, n: p.clone().sub(f.p).normalize() };
        });
      // A dull glow on the next plate behind the lip, and the lip's own edge lit hot from beneath.
      glow.put(ribbon(along(fC, 0.99, 0, 1), 0.0024 + 0.0026 * h, true, 0.0012), blend(COAL, EMBER, 0.3).multiplyScalar(0.5 + 0.5 * h), WAVE);
      glow.put(ribbon(along(fL, 1.1, 0.1 + 0.1 * (i % 3), 0.85 - 0.1 * (i % 2)), 0.0012 + 0.0016 * h, true, 0.0008), blend(EMBER, HOT, h).multiplyScalar(0.55 + 0.45 * h), WAVE);
      // Near the head, a fissure breaks forward across the plate from the crack.
      if (u0 < 0.34 && i % 2 === 0) {
        const at = a0 + len * (0.3 + rng() * 0.4);
        const zig = Array.from({ length: 5 }, (_, j) => {
          const f = frameU(mix(u1 + lip * 1.1, u0 + 0.25 / PLATES, j / 4));
          const p = skin(f, at + 0.1 * Math.sin(j * 2.7 + i), 1.04 + 0.03 * Math.sin((j / 4) * Math.PI));
          return { p, n: p.clone().sub(f.p).normalize() };
        });
        glow.put(ribbon(zig, 0.0026, true, 0.002), blend(EMBER, HOT, 0.5 * h), WAVE);
      }
    }

    // A bone blade on the back of each plate, swept toward the tail; every third one stands taller.
    const fs = frameU(mix(u0, u1, 0.55));
    const env = (0.45 + 0.55 * smooth((fs.q - 0.02) / 0.1)) * (1 - 0.72 * smooth((fs.q - 0.5) / 0.5));
    const hs = 0.082 * env * (i % 2 === 0 ? 1 : 0.6);
    const top = skin(fs, 0, 1.12);
    const dl = 0.016 * (0.6 + 0.4 * env), dw = 0.0075 * (0.6 + 0.4 * env);
    const base = [top.clone().addScaledVector(fs.b, dw), top.clone().addScaledVector(fs.t, dl), top.clone().addScaledVector(fs.b, -dw), top.clone().addScaledVector(fs.t, -dl * 1.3)];
    const tip = top.clone().addScaledVector(fs.n, hs).addScaledVector(fs.t, hs * 0.85);
    sh(fan(base, tip));
    hard.put(fan(base, tip), (p) => blend(BONE_D, BONE, p.distanceTo(top) / (hs * 0.8)), WAVE);
  }

  // ---- the head ----
  const f0 = frameU(0);
  const O = f0.p.clone().addScaledVector(f0.t, 0.014);
  // Turned a little toward the near side (-x), as if it has noticed the boat.
  const Fw = f0.t.clone().negate().addScaledVector(UP, -0.2).normalize().applyAxisAngle(UP, 0.2);
  const Sd = Fw.clone().cross(UP).normalize();
  const Uh = Sd.clone().cross(Fw).normalize();
  const H = (x: number, y: number, s: number) => O.clone().addScaledVector(Fw, x).addScaledVector(Uh, y).addScaledVector(Sd, s);
  /** Sections from the neck to the snout: how far forward, half width, top, depth under the axis. */
  type Sec = [number, number, number, number];
  const SKULL: Sec[] = [[0, 0.06, 0.066, 0.052], [0.026, 0.086, 0.084, 0.048], [0.07, 0.084, 0.078, 0.03], [0.116, 0.07, 0.06, 0.02], [0.16, 0.055, 0.041, 0.013], [0.2, 0.042, 0.031, 0.011], [0.224, 0.027, 0.019, 0.009]];
  const JAW: Sec[] = [[0, 0.066, 0.01, 0.038], [0.056, 0.068, 0.008, 0.036], [0.118, 0.054, 0.006, 0.028], [0.168, 0.04, 0.005, 0.019], [0.204, 0.025, 0.004, 0.011]];
  const secAt = (S: Sec[], x: number): Sec => {
    let i = 0;
    while (i < S.length - 2 && x > S[i + 1][0]) i++;
    const k = Math.min(1, Math.max(0, (x - S[i][0]) / (S[i + 1][0] - S[i][0])));
    return [x, mix(S[i][1], S[i + 1][1], k), mix(S[i][2], S[i + 1][2], k), mix(S[i][3], S[i + 1][3], k)];
  };
  const E = 0.78;
  const onSec = (place: (x: number, y: number, s: number) => V3, [x, w, top, bot]: Sec, a: number, lift = 0) => {
    const c = Math.cos(a), s = Math.sin(a);
    const y = (c >= 0 ? top : bot) * Math.sign(c) * Math.pow(Math.abs(c), E);
    return place(x, y + lift * c, (w + lift) * Math.sign(s) * Math.pow(Math.abs(s), E));
  };
  const skullAt = (x: number, a: number, lift = 0) => onSec(H, secAt(SKULL, x), a, lift);
  const skullN = (x: number, a: number) => {
    const e = 0.004;
    const da = skullAt(x, a + e * 8).sub(skullAt(x, a - e * 8));
    const dx = skullAt(x + e, a).sub(skullAt(x - e, a));
    return da.cross(dx).normalize();
  };
  const K = 12;
  const ringOf = (place: (x: number, y: number, s: number) => V3, sec: Sec) => Array.from({ length: K }, (_, k) => onSec(place, sec, (k / K) * TAU));
  const SLATE = C(0x6a6294);
  const MOUTH = C(0x7a2434), MOUTH_D = C(0x3a0e18);
  const localY = (p: V3) => p.clone().sub(O).dot(Uh);
  const skullRows = SKULL.map((s) => ringOf(H, s));
  hard.put(loft(skullRows), (p) => {
    const x = p.clone().sub(O).dot(Fw);
    const [, , top, bot] = secAt(SKULL, x);
    const y = localY(p);
    if (y < -bot * 0.6) return blend(MOUTH_D, MOUTH, x / 0.2);
    // Lit planes on top of the skull and down the snout, dark under the cheeks.
    return blend(PLATE, SLATE, smooth(y / top) * 0.85 + smooth((x - 0.1) / 0.12) * 0.15);
  });
  sh(loft(skullRows));
  sh(fan(skullRows[skullRows.length - 1], H(0.238, 0.002, 0)));
  hard.put(fan(skullRows[skullRows.length - 1], H(0.238, 0.002, 0)), blend(PLATE, EDGE, 0.5));
  hard.put(fan(skullRows[0], H(-0.01, 0, 0), true), PLATE);

  // The lower jaw, hinged under the skull and hanging a little open (slack, once it is beaten).
  const GAPE = limp ? 0.52 : 0.26;
  const Hj = H(0.03, -0.04, 0);
  const Fj = Fw.clone().multiplyScalar(Math.cos(GAPE)).addScaledVector(Uh, -Math.sin(GAPE));
  const Uj = Uh.clone().multiplyScalar(Math.cos(GAPE)).addScaledVector(Fw, Math.sin(GAPE));
  const J = (x: number, y: number, s: number) => Hj.clone().addScaledVector(Fj, x).addScaledVector(Uj, y).addScaledVector(Sd, s);
  const jawRows = JAW.map((s) => ringOf(J, s));
  hard.put(loft(jawRows), (p) => {
    const d = p.clone().sub(Hj);
    const y = d.dot(Uj), x = d.dot(Fj);
    if (y > 0.002) return blend(MOUTH_D, MOUTH, x / 0.2);
    return blend(BELLY, PLATE, smooth(-y / 0.03) * 0.6);
  });
  sh(loft(jawRows));
  sh(fan(jawRows[jawRows.length - 1], J(0.218, 0.0, 0)));
  hard.put(fan(jawRows[jawRows.length - 1], J(0.218, 0.0, 0)), blend(BELLY, EDGE, 0.4));
  hard.put(fan(jawRows[0], J(-0.02, -0.01, 0), true), BELLY);

  // A furnace at the back of the mouth.
  const throat = H(0.05, -0.03, 0);
  glow.put(ball(throat, V(0.034, 0.02, 0.05), facing(Fw, Uh), 8, 5), (p) => blend(blend(EMBER, HOT, 0.3), COAL.clone().multiplyScalar(0.6), p.distanceTo(throat) / 0.05));
  sprites.push({ at: H(0.09, -0.035, 0), color: EMBER, op: 0.5, size: 0.2 });

  // Fangs: hanging from the upper jaw, standing from the lower, longest at the front.
  const fang = (base: V3, dir: V3, len: number) => hard.put(cone(base, dir, len, len * 0.2, 4), (p) => blend(BONE_D, BONE, p.distanceTo(base) / (len * 0.5)));
  [[0.214, 0.046], [0.186, 0.03], [0.158, 0.038], [0.128, 0.025], [0.098, 0.03], [0.068, 0.02]].forEach(([x, len]) => {
    const [, w, , bot] = secAt(SKULL, x);
    for (const sx of [-1, 1]) fang(H(x, -bot * 0.85, sx * w * 0.74), Uh.clone().negate().addScaledVector(Sd, sx * 0.14).addScaledVector(Fw, -0.12), len);
  });
  [[0.19, 0.03], [0.164, 0.04], [0.136, 0.026], [0.106, 0.032], [0.076, 0.022]].forEach(([x, len]) => {
    const [, w, top] = secAt(JAW, x);
    for (const sx of [-1, 1]) fang(J(x, top * 0.6, sx * w * 0.8), Uj.clone().addScaledVector(Sd, sx * 0.12).addScaledVector(Fj, -0.1), len);
  });

  // The burning eyes: a row down each side of the skull under a heavy brow, each half shut.
  const LID = blend(PLATE, SLATE, 0.8);
  ([[0.13, 0.029, 0.3], [0.088, 0.022, 0.42], [0.054, 0.016, 0.55]] as [number, number, number][]).forEach(([x, r, droop], i) => {
    for (const sx of [-1, 1]) {
      const a = sx * 0.94;
      const c = skullAt(x, a);
      const n = skullN(x, a);
      const q = facing(n, Uh);
      const at = (dx: number, dy: number, dz: number) => c.clone().add(V(dx * r, dy * r, dz * r).applyQuaternion(q));
      hard.put(ball(at(0, 0, -0.3), V(r * 1.24, r * 1.24, r * 0.7), q, 8, 5), DEEP);
      sh(ball(at(0, 0, -0.3), V(r * 1.24, r * 1.24, r * 0.7), q, 6, 4));
      const mid = at(0, 0, 0.1);
      glow.put(ball(mid, V(r, r, r * 0.66), q, 10, 6), (p) => blend(blend(IRIS, HOT, 0.55), EMBER, Math.pow(p.clone().sub(mid).projectOnPlane(n).length() / r, 1.6)));
      glow.put(ball(at(0, 0, 0.66), V(r * 0.15, r * 0.62, r * 0.16), q, 6, 4), INK);
      glow.put(ball(at(-0.3 * sx, 0.34, 0.74), r * 0.12, undefined, 5, 3), new THREE.Color(0xffffff));
      // The lid: a cap over the top of the eye, tipped forward over it.
      const lid = new THREE.SphereGeometry(1, 8, 4, 0, TAU, 0, 1.12).rotateX(droop + (limp ? 0.22 : 0));
      hard.put(placed(lid, at(0, 0, 0), q, V(r * 1.16, r * 1.16, r * 0.92)), (p) => blend(PLATE, LID, smooth(p.clone().sub(c).dot(Uh) / r)));
      if (i < 2) sprites.push({ at: at(0, 0, 1.2), color: IRIS, op: i ? 0.35 : 0.55, size: r * (i ? 5 : 7) });
    }
  });
  // The brow over each row, a ridge down the snout, and smouldering nostrils.
  for (const sx of [-1, 1]) {
    const brow = new THREE.CatmullRomCurve3([0.04, 0.085, 0.13, 0.16].map((x) => skullAt(x, sx * 0.7, 0.012)));
    sh(tube(brow, 0.013, 0.005, 5, 4, { hint: Uh }));
    hard.put(tube(brow, 0.013, 0.005, 8, 5, { hint: Uh }), (p) => blend(PLATE, SLATE, 0.3 + 0.7 * smooth((localY(p) - 0.03) / 0.05)));
    glow.put(ball(skullAt(0.212, sx * 0.6, 0.001), 0.0038, undefined, 6, 4), EMBER);
  }
  hard.put(tube(new THREE.CatmullRomCurve3([0.08, 0.13, 0.18, 0.226].map((x) => skullAt(x, 0, 0.003))), 0.009, 0.003, 6, 5, { hint: Uh }), EDGE);

  // Molten seams between the skull's plates: a ring behind the eyes and a line down each side of the snout.
  const seam = (pts: [number, number][]) => {
    const on = pts.map(([x, a]) => ({ p: skullAt(x, a), n: skullN(x, a) }));
    glow.put(ribbon(on, 0.0036, true, 0.0016), HOT);
    bloom.put(ribbon(on, 0.011, true, 0.004), EMBER.clone().multiplyScalar(0.6));
  };
  for (const sx of [-1, 1]) {
    seam(Array.from({ length: 12 }, (_, j) => [0.04 + 0.006 * Math.sin(j * 2.1), sx * (0.12 + (j / 11) * 2.1)] as [number, number]));
    seam(Array.from({ length: 9 }, (_, j) => [0.046 + (j / 8) * 0.135, sx * (0.4 + 0.05 * Math.sin(j * 2.3))] as [number, number]));
  }

  // The crown of three horns swept back off the brow, and spikes at the hinge of the jaw.
  const horn = (base: V3, L: number, out: number, r0: number) => {
    // Beaten, they lie back along the neck: half as far off the skull, and hardly spread at all.
    const at = (u: number, f: number, s: number) => base.clone().addScaledVector(Uh, u * L * (limp ? 0.5 : 1)).addScaledVector(Fw, -f * L).addScaledVector(Sd, s * L * out * (limp ? 0.2 : 1));
    const curve = new THREE.CatmullRomCurve3([at(-0.06, -0.04, 0), at(0.16, 0.15, 0.2), at(0.3, 0.5, 0.45), at(0.36, 0.9, 0.58), at(0.32, 1.2, 0.56)]);
    sh(tube(curve, r0, r0 * 0.12, 9, 4, { hint: Fw, point: true, pow: 0.85 }));
    hard.put(tube(curve, r0, r0 * 0.12, 9, 6, { hint: Fw, point: true, pow: 0.85 }), (p) => blend(BONE_D, BONE, p.distanceTo(base) / (L * 0.7)));
  };
  horn(skullAt(0.03, 0), 0.13, 0, 0.017);
  for (const sx of [-1, 1]) {
    horn(skullAt(0.036, sx * 0.8), 0.18, sx, 0.02);
    for (const [a, side, up, len, w] of [[1.5, 0.7, 0.15, 0.062, 0.013], [2.0, 0.8, -0.2, 0.044, 0.01]]) {
      const spike = () => cone(skullAt(a === 1.5 ? 0.018 : 0.016, sx * a, -0.004), Fw.clone().negate().addScaledVector(Sd, sx * side).addScaledVector(Uh, up), len, w, 5);
      hard.put(spike(), BONE);
      sh(spike());
    }
  }

  // ---- what ships left in it ----
  const IRON = C(0x45464f), RUST = C(0x8a4a2c), BRASS = C(0xb8923a), WOOD = C(0x8a6a48), ROPE = C(0xb8a67a);
  const rusty = (p: V3) => blend(IRON, RUST, smooth(0.5 + 0.6 * Math.sin(p.x * 310 + p.y * 270) * Math.sin(p.z * 290 + p.y * 130)));
  // A chain round the neck, and an anchor hanging from it on the near side.
  const fn = frameU(0.085);
  const loop: V3[] = Array.from({ length: 17 }, (_, j) => {
    const phi = (j / 16) * TAU;
    return skin(fn, phi, 1.22).addScaledVector(fn.t, -0.02 * Math.cos(phi) + 0.006);
  });
  for (const g of chain(loop, 0.02, 0.0026)) hard.put(g, rusty);
  // In the silhouette the chain is a plain cord as thick as its links.
  sh(tube(new THREE.CatmullRomCurve3(loop, true), 0.008, 0.008, 24, 3));
  // The anchor hangs against the near flank, high enough to show from a deck.
  const hangAt = skin(fn, 1.5, 1.24).addScaledVector(fn.t, 0.012);
  const drop = [hangAt, hangAt.clone().addScaledVector(fn.b, 0.014).add(V(0, -0.024, 0.004)), hangAt.clone().addScaledVector(fn.b, 0.022).add(V(0, -0.05, 0.006))];
  for (const g of chain(drop, 0.02, 0.0026)) hard.put(g, rusty);
  sh(tube(new THREE.CatmullRomCurve3(drop), 0.006, 0.006, 4, 3));
  const A = drop[2].clone().add(V(0, -0.008, 0));
  const aq = facing(fn.b.clone().add(V(0, 0.1, 0.3)));
  const AS = 1.2;
  const anchor = (g: THREE.BufferGeometry, c: (p: V3) => THREE.Color) => {
    sh(placed(g.clone(), A, aq, AS));
    hard.put(placed(g, A, aq, AS), c);
  };
  anchor(new THREE.TorusGeometry(0.0095, 0.0028, 5, 10), () => BRASS);
  anchor(rod(V(0, -0.008, 0), V(0, -0.084, 0), 0.0055, 0.0042, 6), rusty);
  anchor(rod(V(0, -0.02, -0.026), V(0, -0.02, 0.026), 0.0034, 0.0034, 5), rusty);
  const ARC = Math.PI * 0.92, AR = 0.034;
  anchor(new THREE.TorusGeometry(AR, 0.0052, 5, 12, ARC).rotateZ(-(Math.PI / 2 + ARC / 2)).translate(0, -0.084 + AR, 0), rusty);
  for (const s of [-1, 1]) {
    const th = -Math.PI / 2 + (s * ARC) / 2;
    const end = V(Math.cos(th) * AR, -0.084 + AR + Math.sin(th) * AR, 0);
    anchor(cone(end.clone().add(V(-s * 0.004, -0.006, 0)), V(s * 0.25, 1, 0), 0.026, 0.012, 4, 0.4), rusty);
  }
  twinkles.push({ at: A.clone().add(V(-0.012, 0.004, 0)), color: C(0xffe9a0), r: 0.006, glow: true });

  // Broken harpoons standing in the plates of the neck and the first hump, one still trailing its line.
  ([[0.12, -0.5, 0.09, true], [0.21, 0.62, 0.06, false], [0.5, -0.42, 0.075, false], [0.56, 0.5, 0.05, false]] as [number, number, number, boolean][]).forEach(([u, phi, len, line], i) => {
    const f = frameU(u);
    const base = skin(f, phi, 1.0);
    const out = base.clone().sub(f.p).normalize();
    const dir = out.clone().addScaledVector(f.t, 0.55 + 0.2 * Math.sin(i * 2.4)).addScaledVector(f.b, 0.25 * Math.cos(i * 1.9)).normalize();
    const tip = base.clone().addScaledVector(dir, len);
    sh(rod(base.clone().addScaledVector(dir, -0.008), tip, 0.0036, 0.003, 4));
    hard.put(rod(base.clone().addScaledVector(dir, -0.008), tip, 0.0036, 0.003, 5), (p) => blend(WOOD, C(0xb09a78), smooth(p.distanceTo(base) / len)), WAVE);
    hard.put(rod(base.clone().addScaledVector(dir, 0.002), base.clone().addScaledVector(dir, 0.018), 0.0052, 0.0044, 5), rusty, WAVE);
    if (line) {
      const a = base.clone().addScaledVector(dir, len * 0.86);
      hard.put(new THREE.TorusGeometry(0.0062, 0.0018, 4, 8).applyQuaternion(facing(dir)).translate(a.x, a.y, a.z), () => BRASS);
      const side = skin(frameU(u + 0.03), phi * 2.6, 1.12);
      const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(side, 0.5).add(V(0, 0.012, 0)), side, side.clone().add(V(-0.012, -0.05, 0.02)), side.clone().add(V(-0.006, -0.085, 0.045))]);
      sh(tube(curve, 0.0016, 0.0012, 8, 3));
      soft.put(tube(curve, 0.0016, 0.0012, 14, 4, { hint: f.t, col: () => ROPE, sway: (q) => [0.006 * q * q, 1 + q * 2] }));
      twinkles.push({ at: a, color: C(0xffe9a0), r: 0.0045, glow: true });
    }
  });

  // ---- the tail: a blade on the tail's pivot ----
  const TAIL = SPINE.getPointAt(1);
  const th = new Bucket(), tg = new Bucket();
  const shape = new THREE.Shape();
  const OUT: [number, number][] = [[-0.012, 0.011], [0.026, 0.028], [0.06, 0.082], [0.095, 0.128], [0.074, 0.06], [0.06, 0.008], [0.076, -0.036], [0.09, -0.074], [0.052, -0.042], [0.02, -0.02], [-0.012, -0.011]];
  shape.moveTo(OUT[0][0], OUT[0][1]);
  for (const [x, y] of OUT.slice(1)) shape.lineTo(x, y);
  const TH = 0.008;
  const blade = new THREE.ExtrudeGeometry(shape, { depth: TH, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(TH / 2 + TAIL.x, TAIL.y, TAIL.z);
  th.put(blade, (p) => blend(PLATE.clone().multiplyScalar(0.8), EDGE, smooth((p.z - TAIL.z) / 0.09)), WAVE);
  const T = (z: number, y: number, x = 0) => V(TAIL.x + x, TAIL.y + y, TAIL.z + z);
  th.put(tube(new THREE.CatmullRomCurve3([T(-0.012, 0.011), T(0.026, 0.03), T(0.06, 0.084), T(0.096, 0.13)]), 0.0075, 0.002, 8, 5, { hint: V(1, 0, 0) }), BONE, WAVE);
  th.put(tube(new THREE.CatmullRomCurve3([T(-0.012, -0.011), T(0.02, -0.022), T(0.052, -0.044), T(0.091, -0.076)]), 0.006, 0.002, 8, 5, { hint: V(1, 0, 0) }), BONE, WAVE);
  for (const sx of [-1, 1])
    for (const [z, y] of [[0.08, 0.098], [0.066, 0.045], [0.074, -0.05]]) {
      const n = V(sx, 0, 0);
      tg.put(ribbon([{ p: T(0.004, y * 0.08), n }, { p: T(z * 0.5, y * 0.46), n }, { p: T(z, y), n }], 0.0028, true, TH / 2 + 0.0012), blend(EMBER, HOT, 0.4), WAVE);
    }
  const tailHard = th.build(), tailGlow = tg.build();
  tailHard?.translate(-TAIL.x, -TAIL.y, -TAIL.z);
  tailGlow?.translate(-TAIL.x, -TAIL.y, -TAIL.z);

  return {
    hard: { geo: hard.build(), rough: 0.78, metal: 0 },
    shade: shade.build(),
    soft: { geo: soft.build(), rough: 0.6 },
    glow: glow.build(),
    bloom: { geo: bloom.build(), op: 0.22 },
    tail: { at: TAIL, hard: tailHard, glow: tailGlow, rough: 0.4, metal: 0 },
    sprites,
    twinkles,
  };
}
