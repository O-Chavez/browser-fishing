// The Kraken: a great squid in a wet crimson shell. A long mantle mottled dark and spotted pale, barnacled at the
// collar like the Kraken Armor, with broad fins at its tail; a big intelligent gold eye with a bar pupil under heavy
// lids on each side of the head; eight thick arms that taper and curl, suckers down the face each turns to the mouth,
// and two longer feeding tentacles ending in clubs. One arm still grips a ship's wheel.
//
// It has a second build, `limp`, for the landing (`LEGEND_SHOW.kraken`): beaten, lying on the water beside the boat.
// The same parts, laid out as they lie: the mantle slumped and rolled over so one eye looks up, the arms spread
// slack across the water ahead of it with their tips sinking, the feeding tentacles trailing, the wheel afloat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Bucket, type Built, type Frame, TAU, V, type V3, ball, blend, facing, frames, grid, mix, palette, placed, rod, seeded, smooth, sweep } from './kit';

const UP = V(0, 1, 0);

/** A cylinder with its top closed and its base left open (it sits in the skin, where the base never shows). */
function cup(rTop: number, rBase: number, h: number, sides: number): THREE.BufferGeometry {
  const wall = new THREE.CylinderGeometry(rTop, rBase, h, sides, 1, true);
  const top = new THREE.CircleGeometry(rTop, sides).rotateX(-Math.PI / 2).translate(0, h / 2, 0);
  const g = mergeGeometries([wall, top]);
  wall.dispose();
  top.dispose();
  return g;
}

/** A sucker 1 across its base (scaled to size where it goes): a cup whose base sits hidden inside the arm. */
const SUCKER = cup(0.9, 1.25, 0.32, 7).translate(0, 0.12, 0);

/** The mantle's spine, from the head's front to the tip of the mantle, rising a little toward the tip. */
const BODY = new THREE.CatmullRomCurve3([V(0, 0, -0.4), V(0, 0.01, -0.2), V(0, 0.03, 0.05), V(0, 0.06, 0.3), V(0, 0.09, 0.56)]);
/** Where the head ends and the mantle's collar begins (along BODY). */
const COLLAR = 0.27;
/** Half-height of the body `q` along BODY: a head, the collar's lip, the mantle's swell and a long taper to a point. */
function bodyR(q: number): number {
  if (q < COLLAR) return mix(0.09, 0.115, smooth(q / COLLAR)) + 0.014 * Math.sin((q / COLLAR) * Math.PI);
  const m = (q - COLLAR) / (1 - COLLAR);
  return (0.165 + 0.035 * Math.sin(Math.min(1, m / 0.55) * Math.PI * 0.5)) * Math.pow(1 - smooth(Math.max(0, m - 0.25) / 0.75), 0.85) * (1 - 0.15 * Math.exp(-m * 30)) + 0.004;
}

/** A planar curl: from `p` along `t`, bending toward `u` slowly at first and hard at the tip, `len` long. */
function curl(p: V3, t: V3, u: V3, len: number, bend: number, wind: number, twist = 0, n = 44): THREE.CatmullRomCurve3 {
  const w = t.clone().cross(u).normalize();
  const pts: V3[] = [p.clone()];
  const at = p.clone();
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const th = bend * s + wind * Math.pow(s, 3.2);
    const d = t.clone().multiplyScalar(Math.cos(th)).addScaledVector(u, Math.sin(th)).addScaledVector(w, twist * Math.sin(s * Math.PI));
    at.addScaledVector(d.normalize(), len / n);
    pts.push(at.clone());
  }
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  c.arcLengthDivisions = 400;
  return c;
}

/** How the limp build lies: the body rolled this far toward the sea side (radians, so its near eye looks up at the deck), slumped to this share of its height, and this far down in the water (model units). */
const LIMP = { roll: -0.75, slump: 0.86, down: 0.02 };

/**
 * A limp arm's lie on the water, seen from above: which way it leaves the head (`az`, radians from straight ahead, +
 * to the sea side, away from the boat), how far it swings round as it goes (`turn`, done `by` this share of its
 * length), its slack wander (`wob` radians, `f` waves), the loose curl of its tip (`curl` radians), how far the tip
 * sinks (`sink`), a stretch of it lolling over the water (`loll`: how high, where along), and how far its sucker face
 * rolls over along it (`over`, radians).
 */
interface Lie { az: number; turn: number; by: number; wob: number; f: number; curl: number; sink: number; loll?: [number, number]; over: number }
const deg = (d: number) => (d * Math.PI) / 180;
/**
 * The eight arms, in the order they are built round the head. The arms on the boat's side (-x) leave wide and swing
 * round ahead, so none of them reaches the hull; the sea side's spread wide.
 */
const LIES: Lie[] = [
  { az: deg(-16), turn: deg(10), by: 0.6, wob: 0.28, f: 1.1, curl: 2.2, sink: 0.02, over: 0.6 },
  { az: deg(-38), turn: deg(32), by: 0.4, wob: 0.24, f: 1.4, curl: -1.2, sink: 0.05, loll: [0.022, 0.5], over: -0.9 },
  { az: deg(-66), turn: deg(60), by: 0.34, wob: 0.2, f: 1.2, curl: 1.6, sink: 0.07, over: 1.6 },
  { az: deg(6), turn: deg(-10), by: 0.6, wob: 0.34, f: 1.6, curl: -2.0, sink: 0.09, over: 0.3 },
  { az: deg(34), turn: deg(-16), by: 0.5, wob: 0.3, f: 1.2, curl: 1.4, sink: 0.08, over: 2.2 },
  { az: deg(64), turn: deg(22), by: 0.6, wob: 0.32, f: 1.5, curl: -2.6, sink: 0.05, loll: [0.018, 0.42], over: -0.5 },
  { az: deg(98), turn: deg(-30), by: 0.7, wob: 0.28, f: 1.1, curl: 1.8, sink: 0.06, over: 1.2 },
  { az: deg(132), turn: deg(20), by: 0.6, wob: 0.3, f: 1.3, curl: -1.5, sink: 0.04, over: -1.4 },
];
/** The feeding tentacles: the boat side's reaching on ahead along the hull, the sea side's trailing back past the mantle. */
const CLUB_LIES: Lie[] = [
  { az: deg(-6), turn: deg(-4), by: 0.5, wob: 0.22, f: 1.7, curl: -0.9, sink: 0.05, over: 0.4 },
  { az: deg(150), turn: deg(26), by: 0.6, wob: 0.26, f: 1.4, curl: 1.3, sink: 0.07, over: -0.6 },
];

/**
 * A limp arm's middle line: from `p`, `len` long, wandering over the water as its `Lie` says. It comes down (or up)
 * to the water from where it leaves the head, then floats with about a third of its thickness (`rad`) under.
 */
function lie(p: V3, len: number, L: Lie, rad: (q: number) => number, ph: number, n = 44): THREE.CatmullRomCurve3 {
  const pts: V3[] = [p.clone()];
  const at = p.clone();
  for (let i = 1; i <= n; i++) {
    const s = i / n;
    const h = L.az + L.turn * smooth(s / L.by) + L.wob * Math.sin(TAU * L.f * s + ph) * smooth(s / 0.25) + L.curl * Math.pow(s, 5);
    const afloat = -0.35 * rad(s) - L.sink * Math.pow(smooth((s - 0.5) / 0.5), 1.5) + (L.loll ? L.loll[0] * Math.exp(-(((s - L.loll[1]) / 0.13) ** 2)) : 0);
    const y = mix(p.y, afloat, smooth(s / 0.3));
    // Its length is kept: what it climbs or drops it does not also run.
    const run = Math.sqrt(Math.max(0, (len / n) ** 2 - (y - at.y) ** 2));
    at.set(at.x + Math.sin(h) * run, y, at.z - Math.cos(h) * run);
    pts.push(at.clone());
  }
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  c.arcLengthDivisions = 400;
  return c;
}

export function buildKraken(limp = false): Built {
  const C = palette();
  const rng = seeded('kraken');
  const soft = new Bucket(), hard = new Bucket(), glow = new Bucket(), shade = new Bucket();
  const SH = new THREE.Color(0);
  const sprites: Built['sprites'] = [];
  const twinkles: Built['twinkles'] = [];
  const SHELL = C(0xb0284a), DEEP = C(0x6a1430), DARK = C(0x2a0410), PALE = C(0xf2b8c2), SPOT = C(0xffc8d6), BELLY = C(0xe8a0b2);
  const SUCK = C(0xffd6de), SUCK_IN = C(0xa83a58), BONE = C(0xe8dcc8), INK = new THREE.Color(0x1a0a10);
  const GOLD_I = C(0xffc23a), GOLD_H = C(0xffeaa0), AMBER = C(0xb05a0a);
  // Limp, the body lies rolled over and slumped: every part of it is built as it swims and then laid over.
  const laid = limp ? new THREE.Matrix4().makeTranslation(0, -LIMP.down, 0).multiply(new THREE.Matrix4().makeScale(1, LIMP.slump, 1)).multiply(new THREE.Matrix4().makeRotationZ(LIMP.roll)) : null;
  const lay = (p: V3) => (laid ? p.applyMatrix4(laid) : p);
  for (const b of [soft, hard, glow, shade]) b.xf = laid;

  // ---- the mantle and head: one skin, mottled crimson over a pale belly ----
  const fr = frames(BODY, 140, UP, { fixed: true });
  // Dark blotches and pale spots, scattered over the back (q along, a round from the top).
  const blotch = Array.from({ length: 30 }, () => [COLLAR + rng() * (0.95 - COLLAR), (rng() - 0.5) * 3.8, 0.06 + rng() * 0.06]);
  const spots = Array.from({ length: 30 }, () => [0.08 + rng() * 0.85, (rng() - 0.5) * 3.4, 0.03 + rng() * 0.02]);
  const near = (list: number[][], q: number, a: number, r: number) => {
    let k = 0;
    for (const [bq, ba, br] of list) {
      const dq = q - bq, da = (a - ba) * r;
      if (Math.abs(dq) >= br || Math.abs(da) >= br) continue; // too far to touch it
      k = Math.max(k, 1 - smooth(Math.sqrt(dq * dq + da * da) / br));
    }
    return k;
  };
  soft.put(
    sweep(frames(BODY, 90, UP, { fixed: true }), 64, (q, a) => bodyR(q) * (Math.cos(a) < 0 ? 0.9 : 1), {
      squash: [0.92, 1],
      caps: [true, false],
      col: (q, a) => {
        const r = bodyR(q);
        const up = Math.cos(a);
        let c = blend(BELLY, SHELL, smooth((up + 0.35) / 0.6));
        // A darker band down the back, and the collar's lip shadowed under it.
        c = blend(c, DEEP, 0.35 * smooth((up - 0.55) / 0.45));
        c = blend(c, DARK, 0.95 * smooth(near(blotch, q, a, r) * 1.3) * smooth((up + 0.2) / 0.5));
        c = blend(c, SPOT, 0.9 * smooth(near(spots, q, a, r) * 1.5));
        if (q > COLLAR - 0.015 && q < COLLAR + 0.012) c = blend(c, DARK, 0.5);
        return c;
      },
      sway: (q) => [0.006 * smooth((q - 0.5) / 0.5), q * 3],
    }),
  );
  shade.put(sweep(frames(BODY, 30, UP, { fixed: true }), 12, (q, a) => bodyR(q) * (Math.cos(a) < 0 ? 0.9 : 1), { squash: [0.92, 1], caps: [true, false] }), SH);
  const fAt = (q: number): Frame => fr[Math.round(q * (fr.length - 1))];
  const onBody = (q: number, a: number, lift = 0) => {
    const f = fAt(q);
    const r = bodyR(q) * (Math.cos(a) < 0 ? 0.9 : 1) + lift;
    return f.p.clone().addScaledVector(f.n, Math.cos(a) * r * 0.92).addScaledVector(f.b, Math.sin(a) * r);
  };
  const bodyN = (q: number, a: number) => onBody(q, a).sub(fAt(q).p).normalize();

  // Barnacles crusted over the collar and the front of the back, as on the Kraken Armor's pauldrons.
  for (let i = 0; i < 26; i++) {
    const q = COLLAR + 0.02 + Math.pow(rng(), 1.6) * 0.32;
    const a = (rng() - 0.5) * 2.2;
    const at = onBody(q, a, -0.002);
    const n = bodyN(q, a);
    const s = 0.008 + rng() * 0.01;
    const g = cup(s * 0.55, s, s * 1.1, 7).translate(0, s * 0.45, 0);
    hard.put(placed(g, at, new THREE.Quaternion().setFromUnitVectors(UP, n)), (p) => blend(C(0xa8968a), BONE, smooth(p.distanceTo(at) / (s * 0.9))));
    hard.put(placed(cup(s * 0.3, s * 0.3, s * 0.2, 6), at.clone().addScaledVector(n, s * 1.0), new THREE.Quaternion().setFromUnitVectors(UP, n)), INK);
  }

  // ---- the fins: broad and rounded at the tail of the mantle ----
  for (const sx of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.01);
    sh.quadraticCurveTo(sx * 0.16, 0.0, sx * 0.25, 0.1);
    sh.quadraticCurveTo(sx * 0.28, 0.2, sx * 0.14, 0.28);
    sh.quadraticCurveTo(sx * 0.05, 0.31, 0, 0.32);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10 });
    g.rotateX(Math.PI / 2).translate(0, 0.08, 0.24);
    const root = V(0, 0.07, 0.4);
    shade.put(g.clone(), SH);
    soft.put(g, (p) => blend(DEEP, blend(SHELL, PALE, 0.25), smooth((Math.abs(p.x) - 0.04) / 0.2)).multiplyScalar(1 - 0.25 * smooth((p.distanceTo(root) - 0.2) / 0.1)), (p) => [0.012 * smooth((Math.abs(p.x) - 0.05) / 0.2), sx * 1.5]);
  }

  // ---- the eyes: big and gold, with a bar pupil, under heavy lids ----
  const EQ = 0.135;
  for (const sx of [-1, 1]) {
    const a = sx * 1.3;
    const c = onBody(EQ, a);
    const n = bodyN(EQ, a).add(V(0, 0.12, -0.25)).normalize();
    const q = facing(n, UP);
    const r = 0.085;
    const E = c.clone().addScaledVector(n, -0.35 * r);
    const put = (g: THREE.BufferGeometry) => placed(g, E, q, r);
    const P = (x: number, y: number, z: number) => E.clone().add(V(x * r, y * r, z * r).applyQuaternion(q));
    soft.put(put(new THREE.SphereGeometry(1, 16, 10)), C(0x6a3a2a));
    // The iris: a glowing gold cap streaked toward the pupil, darker at its rim.
    const IR = 0.95;
    const centre = P(0, 0, 1.01);
    const iris = put(new THREE.SphereGeometry(1.01, 40, 8, 0, TAU, 0, IR).rotateX(Math.PI / 2));
    glow.put(iris, (p) => {
      const d = p.clone().sub(centre);
      const lx = d.dot(V(1, 0, 0).applyQuaternion(q)), ly = d.dot(V(0, 1, 0).applyQuaternion(q));
      const f = Math.hypot(lx, ly) / (r * Math.sin(IR));
      const streak = 0.85 + 0.15 * Math.sin(Math.atan2(ly, lx) * 18);
      if (f > 0.9) return AMBER.clone().multiplyScalar(0.7);
      return blend(GOLD_H, GOLD_I, smooth(f / 0.7)).multiplyScalar(streak);
    });
    // The bar pupil: wide, a little bowed, the way a squid's is.
    const bar = put(new THREE.SphereGeometry(1.02, 24, 4, 0, TAU, 0, 0.42).rotateX(Math.PI / 2));
    bar.translate(-centre.x, -centre.y, -centre.z);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    bar.applyMatrix4(m.clone().invert()).scale(1.25, 0.32, 1).applyMatrix4(m).translate(centre.x, centre.y, centre.z);
    glow.put(bar, INK);
    glow.put(ball(P(-0.35 * sx, 0.42, 0.92), r * 0.09, undefined, 6, 4), new THREE.Color(0xffffff));
    sprites.push({ at: lay(P(0, 0, 1.6)), color: GOLD_I, op: 0.45, size: r * 6 });
    // Lids of skin, rolled at the edge: hooded over the top, a soft rise underneath.
    const e1 = 0.42, e2 = -0.55, LR = 1.06;
    const lid = (k: V3) => blend(SHELL, DEEP, smooth(k.clone().sub(E).dot(V(0, 1, 0).applyQuaternion(q)) / r));
    soft.put(put(new THREE.SphereGeometry(LR, 24, 8, 0, TAU, 0, Math.PI / 2).rotateX(-e1)), lid);
    soft.put(put(new THREE.TorusGeometry(LR, 0.12, 6, 24).rotateX(Math.PI / 2).rotateX(-e1)), blend(SHELL, PALE, 0.15));
    const LA = 1.0, lt = Math.asin(-Math.cos(LA)) - e2;
    soft.put(put(new THREE.SphereGeometry(LR, 24, 6, 0, TAU, Math.PI - LA, LA).rotateX(lt)), blend(SHELL, BELLY, 0.4));
    soft.put(put(new THREE.TorusGeometry(LR * Math.sin(LA), 0.09, 6, 24).rotateX(Math.PI / 2).translate(0, -LR * Math.cos(LA), 0).rotateX(lt)), blend(SHELL, PALE, 0.3));
    // A fold round the socket.
    soft.put(put(new THREE.TorusGeometry(Math.sqrt(LR * LR - 0.35 * 0.35), 0.22, 6, 24).scale(1, 1, 0.55).translate(0, 0, 0.35)), (k) => blend(SHELL, DEEP, smooth(k.clone().sub(E).dot(V(0, 1, 0).applyQuaternion(q)) / r + 0.2)));
  }

  // ---- the beak, dark in the middle of the arms ----
  const MOUTH = V(0, -0.005, -0.415);
  hard.put(placed(new THREE.ConeGeometry(0.026, 0.05, 6).rotateX(-Math.PI / 2), MOUTH.clone().add(V(0, 0.01, -0.012)), undefined, V(1, 0.7, 1)), C(0x2a1a24));
  hard.put(placed(new THREE.ConeGeometry(0.022, 0.04, 6).rotateX(-Math.PI / 2), MOUTH.clone().add(V(0, -0.012, -0.008)), undefined, V(1, 0.6, 1)), C(0x3a2430));

  // ---- the arms ----
  /**
   * An arm along a curve: thick, tapering, crimson over a pale underside, with two rows of suckers down the underside.
   * The underside is the arm's oral face, the one turned to the mouth and the body's centre line where the arm leaves
   * the head, as on a real squid; it is carried along the arm without twisting, so an arm that curls outward shows its
   * crimson back inside the curl and its suckers outside it. `clubAt` (a feeding tentacle) turns that face toward the
   * centre line again from there on, over the bare stalk, so the club's suckers sit on its inner face.
   */
  const arm = (cv: THREE.CatmullRomCurve3, u0: V3, r0: number, rad: (q: number) => number, suck: (q: number) => boolean, ph: number, clubAt?: number, over = 0) => {
    const fa = frames(cv, 70, u0, { ease: 1.5 });
    const fq = (q: number) => fa[Math.round((1 - Math.pow(1 - q, 1 / 1.5)) * (fa.length - 1))];
    /** Which way round the arm (from the frame's `n` toward its `b`) the body's centre line lies, at `q` along it. */
    const inward = (q: number) => {
      const f = fq(q);
      const d = V(HUB.x - f.p.x, HUB.y - f.p.y, 0);
      d.addScaledVector(f.t, -d.dot(f.t));
      return Math.atan2(d.dot(f.b), d.dot(f.n));
    };
    const o0 = inward(0.06);
    let o1 = o0;
    if (clubAt !== undefined) {
      o1 = inward((clubAt + 1) / 2);
      // The short way round.
      o1 = o0 + Math.atan2(Math.sin(o1 - o0), Math.cos(o1 - o0));
    }
    // A limp arm rolls over as it lies (`over`), so stretches of it show their suckers to the sky.
    const oral = (q: number) => (clubAt === undefined ? o0 : mix(o0, o1, smooth((q - 0.15) / (clubAt - 0.2)))) + over * smooth((q - 0.1) / 0.6);
    shade.put(sweep(frames(cv, 28, u0, { ease: 1.5 }), 6, (q) => rad(q), { caps: [true, false] }), SH);
    soft.put(
      sweep(fa.filter((_, i) => i % 2 === 0), 10, (q) => rad(q), {
        caps: [true, false],
        col: (q, a) => {
          const c = Math.cos(a - oral(q));
          const under = smooth((c - 0.2) / 0.5);
          const top = blend(SHELL, DEEP, smooth((-c - 0.5) / 0.5) * 0.6);
          return blend(top, BELLY, under).multiplyScalar(0.9 + 0.1 * Math.sin(q * 40));
        },
        sway: (q) => [0.05 * q * q, ph + q * 2.5],
      }),
    );
    // Two staggered rows of suckers, cupped, pale-rimmed.
    const n = Math.round(cv.getLength() / 0.018);
    for (let i = 0; i < n; i++) {
      const q = 0.06 + (i / n) * 0.9;
      if (!suck(q)) continue;
      const f = fq(q);
      const rq = rad(f.q);
      const a = oral(f.q) + (i % 2 ? 0.42 : -0.42);
      const nrm = f.n.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.b, Math.sin(a));
      const s = rq * 0.36;
      if (s < 0.0025) continue;
      const at = f.p.clone().addScaledVector(nrm, rq * 0.92);
      soft.put(placed(SUCKER.clone(), at, new THREE.Quaternion().setFromUnitVectors(UP, nrm), s), (p) => {
        const d = p.distanceTo(at.clone().addScaledVector(nrm, s * 0.28));
        return d < s * 0.55 ? SUCK_IN : d < s * 0.95 ? SUCK : blend(SUCK, BELLY, 0.6);
      }, [0.05 * f.q * f.q, ph + f.q * 2.5]);
    }
    return fa;
  };

  // The arms are their own lie on the water, not the body's: built where they lie, from where the laid body leaves them.
  for (const b of [soft, hard, glow, shade]) b.xf = null;
  const HUB = lay(MOUTH.clone());
  const RING = 0.075;
  const fwd = V(0, 0, -1);
  let wheelArm: THREE.CatmullRomCurve3 | null = null;
  const armCurves: THREE.CatmullRomCurve3[] = [];
  let wheelU = V(), wheelT = V();
  for (let i = 0; i < 8; i++) {
    // Round the head, the first pair on top; each arm spreads out from the mouth and curls outward and up.
    const phi = Math.PI / 2 + ((i + 0.5) / 8) * TAU;
    const radial = V(Math.cos(phi), Math.sin(phi) * 0.9, 0);
    const base = MOUTH.clone().add(V(radial.x * RING, radial.y * RING, 0.035));
    // The two near-side arms level with the eye rise and fall away from it, so it stays clear from the front and side.
    const clear = i === 1 || i === 2;
    const t0 = clear ? fwd.clone().multiplyScalar(i === 1 ? 1.2 : 0.55).add(radial).addScaledVector(UP, i === 1 ? 0.75 : -0.75).normalize() : fwd.clone().addScaledVector(radial, 0.55).addScaledVector(UP, 0.1).normalize();
    const lean = clear ? radial.clone().addScaledVector(UP, i === 1 ? 0.6 : -0.6) : radial.clone().addScaledVector(UP, 0.7);
    const u0 = lean.addScaledVector(t0, -lean.dot(t0)).normalize();
    const len = 0.78 + 0.18 * rng() + (radial.y > 0 ? 0.08 : 0);
    const bend = 0.55 + rng() * 0.4, wind = 3.6 + rng() * 1.6, twist = (rng() - 0.5) * 0.25;
    const ph = i * 1.37;
    const rad = (q: number) => 0.058 * Math.pow(1 - q, 0.9) + 0.003 + 0.026 * Math.exp(-q * 14);
    const cv = limp ? lie(lay(base.clone()), len, LIES[i], rad, ph) : clear ? curl(base, t0, u0, len, 0.25, 2.2, twist) : curl(base, t0, u0, len, bend, wind, twist);
    arm(cv, limp ? UP : u0, 0.06, rad, () => true, ph, undefined, limp ? LIES[i].over : 0);
    armCurves.push(cv);
    // The top arm on the near side holds the wheel up high.
    if (i === 0) {
      wheelArm = cv;
      wheelU = u0;
      wheelT = t0;
    }
  }
  // A web of skin between the arms' roots, scalloped between them, so they grow out of the head round the beak.
  for (let i = 0; i < armCurves.length; i++) {
    const a = armCurves[i], b = armCurves[(i + 1) % armCurves.length];
    const rows: V3[][] = [];
    for (let t = 0; t <= 4; t++)
      rows.push(Array.from({ length: 9 }, (_, k) => {
        const s = k / 8;
        const q = (t / 4) * 0.2 * (1 - 0.62 * Math.sin(Math.PI * s));
        return a.getPointAt(q).lerp(b.getPointAt(q), s).add(V(0, 0, 0.012 * Math.sin(Math.PI * s)));
      }));
    const col = (p: V3) => blend(blend(SHELL, BELLY, 0.45), DEEP, smooth((p.distanceTo(HUB) - 0.06) / 0.12) * 0.4);
    soft.put(grid(rows), col, (p) => [0.01 * smooth((p.distanceTo(HUB) - 0.05) / 0.1), i * 1.37]);
    soft.put(grid(rows.map((r) => [...r].reverse())), col, (p) => [0.01 * smooth((p.distanceTo(HUB) - 0.05) / 0.1), i * 1.37]);
  }

  // The two feeding tentacles: longer and thinner, reaching forward and up, ending in broad clubs.
  for (const sx of [-1, 1]) {
    const radial = V(sx * 0.8, 0.5, 0).normalize();
    const base = MOUTH.clone().add(V(radial.x * RING * 0.6, radial.y * RING * 0.6, 0.02));
    const t0 = fwd.clone().addScaledVector(UP, 0.65).addScaledVector(radial, 0.3).normalize();
    const u0 = V(sx * 0.4, 1, 0.6).addScaledVector(t0, -V(sx * 0.4, 1, 0.6).dot(t0)).normalize();
    const CLUB = 0.74;
    const rad = (q: number) => (q < CLUB ? mix(0.026, 0.014, q / CLUB) : 0.014 + 0.026 * Math.sin(Math.min(1, (q - CLUB) / (1 - CLUB)) * Math.PI * 0.92)) + 0.002;
    // Limp, the boat side's (-x, the first built) reaches on ahead and the sea side's trails back.
    const L = CLUB_LIES[sx < 0 ? 0 : 1];
    const cv = limp ? lie(lay(base.clone()), 1.25, L, rad, sx * 2.1) : curl(base, t0, u0, 1.25, -0.25, 3.0, sx * 0.15);
    arm(cv, limp ? UP : u0, 0.026, rad, (q) => q > CLUB - 0.02 || q < 0.12, sx * 2.1, CLUB, limp ? L.over : 0);
  }

  // ---- what ships left in it: a ship's wheel gripped in the curl of an upper arm ----
  if (wheelArm) {
    const WOOD = C(0x7a5434), WOOD_D = C(0x4a3222), BRASS = C(0xa88838);
    // The wheel faces up toward a deck; its rim runs through the arm near the tip, which winds round it.
    const R = 0.1;
    const tipPts = Array.from({ length: 10 }, (_, k) => wheelArm!.getPointAt(0.82 + (k / 9) * 0.18));
    const cc = tipPts.reduce((s, p) => s.add(p), V()).multiplyScalar(1 / tipPts.length);
    // Limp, it floats flat by the arm's tip, a little down on one side.
    const F = (limp ? V(0.14, 1, -0.1) : V(-0.75, 0.6, -0.25)).normalize();
    const A = wheelArm.getPointAt(0.88);
    const d = A.clone().sub(cc).addScaledVector(F, -A.clone().sub(cc).dot(F)).normalize();
    const wc = A.clone().addScaledVector(d, R * 0.82);
    const wq = facing(F, d);
    void wheelU;
    void wheelT;
    // It sways with the arm that holds it.
    const ws: [number, number] = [0.05 * 0.86 * 0.86, 0.86 * 2.5];
    const W = (x: number, y: number) => wc.clone().add(V(x, y, 0).applyQuaternion(wq));
    hard.put(placed(new THREE.TorusGeometry(R, 0.008, 6, 32), wc, wq), WOOD, ws);
    hard.put(placed(new THREE.TorusGeometry(R * 0.82, 0.0035, 4, 24), wc, wq), WOOD_D, ws);
    hard.put(placed(new THREE.CylinderGeometry(0.014, 0.014, 0.022, 10).rotateX(Math.PI / 2), wc, wq), BRASS, ws);
    for (let k = 0; k < 8; k++) {
      if (k === 3) continue; // a broken spoke
      const a = (k / 8) * TAU + 0.2;
      const d = V(Math.cos(a), Math.sin(a), 0);
      const len = k === 5 ? R * 1.18 : R * 1.42;
      hard.put(rod(W(d.x * 0.012, d.y * 0.012), W(d.x * len, d.y * len), 0.0052, 0.004, 5), WOOD, ws);
      if (k !== 5) hard.put(placed(new THREE.SphereGeometry(0.0065, 6, 4), W(d.x * len, d.y * len), wq, V(1, 1, 1.3)), WOOD_D, ws);
    }
    twinkles.push({ at: W(0.004, 0.012).addScaledVector(V(0, 0, 1).applyQuaternion(wq), 0.013), color: C(0xffe9a0), r: 0.0045, glow: true });
    twinkles.push({ at: W(R * 0.7, -R * 0.7), color: C(0xffe9a0), r: 0.0035, glow: true });
  }

  return {
    hard: { geo: hard.build(), rough: 0.6, metal: 0.15 },
    soft: { geo: soft.build(), rough: 0.5, coat: 0.22 },
    glow: glow.build(),
    shade: shade.build(),
    sprites,
    twinkles,
  };
}
