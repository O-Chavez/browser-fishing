// The Drowned Dreamer: a vast soft dome asleep in the deep. One huge half-lidded eye on its face and a scatter of
// smaller ones over the dome, some shut, some drifting open; a long drooping crest that falls like a nightcap to a
// sleeping pompom; a curtain of tendrils trailing far behind; and a slow ring of dream-lights turning over it. A
// ship's lantern, still faintly lit, hangs from its crest, and the ribs of a rowing boat are caught in its tendrils.
import * as THREE from 'three';
import { Bucket, type Built, type Sway, TAU, V, type V3, ball, blend, chain, cone, facing, grid, loft, mix, palette, placed, rod, seeded, smooth, spark, tube } from './kit';

/** The dome's middle and half-sizes. */
const MID = V(0, 0.04, -0.13);
const AX = V(0.37, 0.33, 0.39);

/** A point on the dome in the direction `d` from its middle (a unit vector): flatter underneath and across the face. */
function dome(d: V3): V3 {
  const u = d.clone().normalize();
  let { x, y, z } = u;
  // The underside: a shallow bell.
  if (y < 0) y *= 0.52;
  // Soft ribs running down the bell from the crown, as on a jelly's bell.
  const rib = 1 + 0.03 * Math.cos(Math.atan2(u.x, u.z) * 11) * smooth((u.y + 0.1) / 0.5) * (1 - smooth((u.y - 0.8) / 0.2));
  x *= rib;
  z *= rib;
  // A crown that rises toward the back, where the crest grows.
  y += 0.08 * Math.max(0, u.y) * smooth((u.z + 0.6) / 1.2);
  return V(MID.x + x * AX.x, MID.y + y * AX.y, MID.z + z * AX.z);
}
/** The dome's outward normal there (by small steps round the point). */
function domeN(d: V3): V3 {
  const u = d.clone().normalize();
  const t1 = Math.abs(u.y) < 0.95 ? V(0, 1, 0).cross(u).normalize() : V(1, 0, 0).cross(u).normalize();
  const t2 = u.clone().cross(t1).normalize();
  const e = 0.01;
  const a = dome(u.clone().addScaledVector(t1, e)).sub(dome(u.clone().addScaledVector(t1, -e)));
  const b = dome(u.clone().addScaledVector(t2, e)).sub(dome(u.clone().addScaledVector(t2, -e)));
  const n = a.cross(b).normalize();
  return n.dot(u) < 0 ? n.negate() : n;
}
/** The direction from the dome's middle that is `yaw` round from straight ahead (toward -x first) and `pitch` up. */
const dir = (yaw: number, pitch: number) => V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));

export function buildDreamer(): Built {
  const C = palette();
  const rng = seeded('dreamer');
  const soft = new Bucket(), hard = new Bucket(), glow = new Bucket(), shade = new Bucket(), rim = new Bucket();
  const SH = new THREE.Color(0);
  const sprites: Built['sprites'] = [];
  const twinkles: Built['twinkles'] = [];
  const TEAL = C(0x0f3f4c), TEAL_D = C(0x0b2c38), MID_T = C(0x1e5f6a), DEEP = C(0x040d11), BELLY = C(0x98d8cc), MINT = C(0x9affd0), MOON = C(0xfff1c8);
  const FLUFF = C(0xf4f0ff), SCLERA = C(0x6f9e94), PUPIL = new THREE.Color(0x03100c), LASH = C(0x123a30);
  const still: Sway = [0, 0];

  // ---- the dome ----
  const sphere = new THREE.SphereGeometry(1, 40, 26);
  const pos = sphere.attributes.position;
  const p = V();
  for (let i = 0; i < pos.count; i++) {
    const q = dome(p.fromBufferAttribute(pos, i));
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  sphere.computeVertexNormals();
  rim.put(sphere, (q) => {
    const h = (q.y - MID.y) / AX.y;
    // Deep teal over the crown, darkening to near black underneath.
    const c = h > 0.15 ? blend(MID_T, TEAL, smooth((h - 0.15) / 0.75)) : blend(DEEP, MID_T, smooth((h + 0.4) / 0.55));
    return c.multiplyScalar(1 - 0.18 * smooth((q.z - MID.z) / AX.z));
  }, (q) => [0.004 * smooth((q.z + 0.1) / 0.4), q.z * 4]);

  shade.put(sphere.clone(), SH);
  // A scalloped flare round the bell's rim, pale as the belly: out and down, and back in underneath.
  const RIM = 72;
  const rimRow = (out: number, down: number, scal: number) =>
    Array.from({ length: RIM }, (_, j) => {
      const a = (j / RIM) * TAU;
      const sc = 1 - scal * Math.pow(Math.abs(Math.sin(a * 9)), 0.6);
      const base = dome(V(Math.sin(a), -0.02, Math.cos(a)));
      return base.add(V(Math.sin(a) * out * AX.x * 2.6, -down * sc, Math.cos(a) * out * AX.z * 2.6));
    });
  soft.put(loft([rimRow(-0.01, -0.02, 0), rimRow(0.02, 0.03, 0.2), rimRow(0.045, 0.075, 0.55), rimRow(0.035, 0.08, 0.55), rimRow(-0.03, 0.04, 0)], true), (q) => blend(MID_T, DEEP, smooth((MID.y - 0.02 - q.y) / 0.06)), (q) => [0.008 * smooth((MID.y - q.y) / 0.08), Math.atan2(q.x, q.z) * 3]);

  // Mint stars over the crown, as on the nightcap.
  for (let i = 0; i < 26; i++) {
    const yaw = rng() * TAU, pitch = 0.15 + rng() * 1.2;
    const d = dir(yaw, pitch);
    if (d.z < -0.7 && d.y < 0.55) continue; // keep the face clear for the eye
    const at = dome(d).addScaledVector(domeN(d), 0.004);
    const s = 0.008 + rng() * 0.012;
    glow.put(placed(spark(1, 0.18), at, facing(domeN(d)), V(s, s, s * 0.4)), i % 4 ? MINT.clone().multiplyScalar(0.8) : MOON);
  }

  // ---- the eyes ----
  /**
   * An eye on the dome at `d`, `r` across: `open` from 0 (shut) to 1. Shut ones are a closed lid with a glowing lash
   * line, as on the Dream Robe; open ones a pale eyeball with a mint iris under a heavy lid.
   */
  const eye = (d: V3, r: number, open: number, look = V(0, -0.15, 0), lashes = 0, tilt = 0, face?: V3) => {
    // Which way it looks: out of the skin, unless told otherwise.
    const n = face ? face.clone().normalize() : domeN(d);
    const q = facing(n, V(0, 1, 0));
    const c = dome(d);
    const at = (x: number, y: number, z: number) => c.clone().add(V(x * r, y * r, z * r).applyQuaternion(q));
    if (open <= 0.05) {
      // Shut: a soft swell of lid with a glowing lash line along its seam and three short lashes, as on the Dream Robe.
      const big = r > 0.1;
      // The great eye's lid is the dome's own skin, lit at its edges like it.
      (big ? rim : soft).put(ball(at(0, 0, -0.1), V(r * 1.15, r * 0.95, r * 0.55), q, big ? 32 : 10, big ? 20 : 7), (k) => blend(MID_T, TEAL, smooth(k.clone().sub(c).dot(V(0, 1, 0).applyQuaternion(q)) / r + 0.3)), still);
      const ARC = Math.PI * 0.62;
      const arc = new THREE.TorusGeometry(r * 0.9, r * (big ? 0.06 : 0.07), big ? 6 : 4, big ? 32 : 12, ARC).rotateZ(Math.PI * 1.5 - ARC / 2).scale(1, 0.55, 1);
      glow.put(placed(arc, at(0, 0.12, 0.44), q), MINT, still);
      if (!big) for (const a of [-0.55, 0, 0.55]) glow.put(cone(at(Math.sin(a) * 0.9, 0.12 - Math.cos(a) * 0.5, 0.44), V(Math.sin(a) * 0.6, -1, 0.6).applyQuaternion(q), r * 0.26, r * 0.06, 3), MINT, still);
      // The great eye's few lashes curl out to the sides.
      else
        for (const a of [-0.62, -0.2, 0.2, 0.62]) {
          const b = at(Math.sin(a) * 0.9, 0.12 - Math.cos(a) * 0.5, 0.44);
          const out = V(Math.sign(a) * 1.3 + Math.sin(a), -0.7, 0.5).applyQuaternion(q).normalize();
          const up = V(0, 1, 0).applyQuaternion(q);
          const pts = [b, b.clone().addScaledVector(out, r * 0.14), b.clone().addScaledVector(out, r * 0.26).addScaledVector(up, r * 0.03), b.clone().addScaledVector(out, r * 0.32).addScaledVector(up, r * 0.1)];
          glow.put(tube(new THREE.CatmullRomCurve3(pts), r * 0.045, r * 0.006, 8, 4, { point: true }), MINT, still);
        }
      return;
    }
    // Open: an eyeball sunk into the dome, a mint iris glowing on it, and lids of skin with soft rolled edges.
    const big = r > 0.1;
    // The great eye is built just as the small ones are, only bigger, and sits a little deeper.
    const SINK = big ? 0.62 : 0.42;
    // How far the eye stands out along its own axis (kept round: flattening it lets the dome show through the lid).
    const ZS = 1;
    const E = c.clone().addScaledVector(n, -SINK * r);
    const SEG = big ? 36 : 14;
    const P = (x: number, y: number, z: number) => E.clone().add(V(x * r, y * r, z * r * ZS).applyQuaternion(q));
    const put = (g: THREE.BufferGeometry) => placed(g, E, q, V(r, r, r * ZS));
    soft.put(put(new THREE.SphereGeometry(1, big ? 28 : 12, big ? 18 : 8)), SCLERA, still);
    // The iris and pupil: caps on the eyeball, turned to where it looks.
    const lookQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-look.y, look.x, 0));
    const axis = V(0, 0, 1).applyQuaternion(lookQ).applyQuaternion(q);
    const IR = 0.62;
    const cap = (rad: number, th: number, w = big ? 28 : 20, h = 6) => put(new THREE.SphereGeometry(rad, w, h, 0, TAU, 0, th).rotateX(Math.PI / 2).applyQuaternion(lookQ));
    const al = V(0, 0, 1).applyQuaternion(lookQ);
    const centre = P(al.x, al.y, al.z);
    glow.put(cap(1.012, big ? 1.3 : IR), (k) => {
      const f = k.distanceTo(centre) / (r * Math.sin(IR));
      if (big) return blend(blend(MINT, new THREE.Color(0xffffff), 0.2), C(0x2a9a80), smooth((f - 0.6) / 0.9));
      return f > 0.88 ? C(0x174c40) : blend(blend(MINT, new THREE.Color(0xffffff), 0.25), C(0x2fae88), Math.pow(f / 0.88, 1.2));
    }, still);
    const pupil = big ? cap(1.02, 0.24) : cap(1.02, 0.21, 16, 2);
    // A tall soft pupil: squeezed across the eye.
    pupil.translate(-centre.x, -centre.y, -centre.z);
    const side = V(1, 0, 0).applyQuaternion(lookQ).applyQuaternion(q);
    const m = new THREE.Matrix4().makeBasis(side, side.clone().cross(axis).negate(), axis);
    pupil.applyMatrix4(m.clone().invert()).scale(big ? 1 : 0.86, 1, 1).applyMatrix4(m).translate(centre.x, centre.y, centre.z);
    // The great eye shows only a crescent of glow: no pupil, no highlight.
    if (!big) {
      glow.put(pupil, PUPIL, still);
      glow.put(ball(P(-0.34, -0.1, 0.94), r * 0.07, undefined, 6, 4), new THREE.Color(0xffffff), still);
    }
    // The lids meet the eyeball at these heights (radians above its middle): the upper one heavy, the lower low.
    const e1 = mix(-0.5, 0.95, open), e2 = big ? -0.66 : -0.62;
    // The great eye's lids are the dome's own skin, lit at the edges like it.
    const lids = big ? rim : soft;
    const LR = 1.1;
    const lidCol = (k: V3) => blend(MID_T, TEAL, smooth(k.clone().sub(E).dot(V(0, 1, 0).applyQuaternion(q)) / r - 0.1));
    // `tilt` lets the lid sit lower on one side, drowsily.
    lids.put(put(new THREE.SphereGeometry(LR, SEG, big ? 12 : 6, 0, TAU, 0, Math.PI / 2).rotateX(-e1).rotateZ(tilt)), lidCol, still);
    lids.put(put(new THREE.TorusGeometry(LR, big ? 0.075 : 0.13, big ? 6 : 5, SEG).rotateX(Math.PI / 2).rotateX(-e1).rotateZ(tilt)), blend(MID_T, BELLY, big ? 0 : 0.25), still);
    // The lower lid: a cap round the bottom of the eyeball only, its edge at e2 across the front.
    const LA = 1.0, lt = Math.asin(-Math.cos(LA)) - e2;
    lids.put(put(new THREE.SphereGeometry(1.07, SEG, big ? 8 : 5, 0, TAU, Math.PI - LA, LA).rotateX(lt)), blend(MID_T, BELLY, big ? 0 : 0.35), still);
    lids.put(put(new THREE.TorusGeometry(1.07 * Math.sin(LA), big ? 0.035 : 0.06, big ? 6 : 5, SEG).rotateX(Math.PI / 2).translate(0, -1.07 * Math.cos(LA), 0).rotateX(lt)), blend(MID_T, BELLY, 0.1), still);
    // A soft fold of skin round it, where it sinks into the dome.
    // On the great eye its lower half takes a faint mint from the iris's light.
    if (!big) lids.put(put(new THREE.TorusGeometry(Math.sqrt(1.21 - SINK * SINK), 0.2, 6, SEG).scale(1, 1, 0.6).translate(0, 0, SINK / ZS)), (k) => {
      const h = k.clone().sub(E).dot(V(0, 1, 0).applyQuaternion(q)) / r;
      return blend(MID_T, TEAL, smooth(h + 0.2));
    }, still);
    // Long lashes curling out and down off the upper lid's edge.
    const N = V(0, Math.cos(-e1), Math.sin(-e1));
    for (let i = 0; i < lashes; i++) {
      const f = Math.PI / 2 + ((i / (lashes - 1)) * 2 - 1) * 1.05;
      const rim = V(Math.cos(f), 0, Math.sin(f)).applyAxisAngle(V(1, 0, 0), -e1).multiplyScalar(LR / 1.1);
      // Out from the lid's edge and curling up over it, as lashes do.
      const out = rim.clone().setY(0).normalize().multiplyScalar(0.7).add(V(0, 0, 0.5)).normalize();
      const len = 0.62 - 0.25 * Math.abs(Math.cos(f));
      const b0 = rim.clone().multiplyScalar(1.12);
      const pts = [b0, b0.clone().addScaledVector(out, 0.25 * len).addScaledVector(N, 0.02 * len), b0.clone().addScaledVector(out, 0.5 * len).addScaledVector(N, 0.18 * len), b0.clone().addScaledVector(out, 0.62 * len).addScaledVector(N, 0.42 * len)];
      soft.put(tube(new THREE.CatmullRomCurve3(pts.map((v) => P(v.x, v.y, v.z))), r * 0.032, r * 0.004, 8, 4, { point: true, col: () => TEAL_D }), undefined, still);
    }
  };
  // ---- the great eye: high on the crown above the small ones, built as they are when shut, only vast ----
  const GREAT = dir(0.3, 0.82);
  // Turned to look ahead and toward the near side, so its closed line lies along its lower edge from a deck.
  eye(GREAT, 0.15, 0, undefined, 0, 0, V(-0.5, 0.42, -0.76));
  sprites.push({ at: dome(GREAT).addScaledVector(domeN(GREAT), 0.07), color: MINT, op: 0.3, size: 0.4 });
  // The smaller eyes: some open, some half, some shut.
  ([
    [-0.78, 0.1, 0.055, 1],
    [1.3, -0.02, 0.045, 0],
    [1.15, 0.72, 0.04, 0.35],
    [-0.55, 0.74, 0.05, 0.95],
    [-0.8, 1.12, 0.034, 0],
    [0.95, -0.22, 0.04, 0],
    [-0.9, 0.12, 0.05, 0.45],
    [1.3, 0.5, 0.036, 1],
    [-1.25, 0.55, 0.034, 0],
    [0.95, 0.5, 0.03, 0.5],
    [-0.62, 0.95, 0.028, 0],
    [1.75, 0.3, 0.03, 0],
    [-1.6, 0.25, 0.032, 0.6],
  ] as [number, number, number, number][]).forEach(([yaw, pitch, r, open], i) => {
    eye(dir(yaw, pitch), r, open, V(Math.sin(i * 2.1) * 0.15, -0.1 + Math.cos(i * 1.7) * 0.1, 0));
    if (open > 0.5 && i < 4) sprites.push({ at: dome(dir(yaw, pitch)).addScaledVector(domeN(dir(yaw, pitch)), r * 1.4), color: MINT, op: 0.4, size: r * 7 });
  });

  // ---- the nightcap: a long soft crest off the crown, drooping to the near side, with a sleeping pompom ----
  const cb = dome(dir(0, 1.35));
  const CAP = new THREE.CatmullRomCurve3([
    cb.clone().add(V(0, -0.04, 0)),
    cb.clone().add(V(0.01, 0.14, 0.06)),
    cb.clone().add(V(-0.04, 0.26, 0.2)),
    cb.clone().add(V(-0.16, 0.25, 0.36)),
    cb.clone().add(V(-0.29, 0.12, 0.44)),
    cb.clone().add(V(-0.36, -0.04, 0.46)),
  ]);
  const capSway = (q: number): [number, number] => [0.03 * q * q, q * 2];
  shade.put(tube(CAP, 0.15, 0.022, 12, 8, { hint: V(0, 0, 1), pow: 0.75, caps: [false, true] }), SH);
  rim.put(tube(CAP, 0.15, 0.022, 26, 14, { hint: V(0, 0, 1), pow: 0.75, col: (q) => blend(TEAL, TEAL_D, 0.2 + 0.5 * q), sway: capSway, caps: [false, true] }));
  // A soft rolled brim where it rises from the crown, a little lumpy, as on the nightcap.
  {
    const u = 0.08;
    const f = CAP.getPointAt(u), t = CAP.getTangentAt(u);
    const brim = new THREE.TorusGeometry(0.15, 0.04, 10, 40);
    const bp = brim.attributes.position;
    const v = V();
    for (let i = 0; i < bp.count; i++) {
      v.fromBufferAttribute(bp, i);
      const a = Math.atan2(v.y, v.x);
      const k = 1 + 0.025 * Math.sin(a * 7) + 0.015 * Math.sin(a * 13 + 1);
      bp.setXYZ(i, v.x * k, v.y * k, v.z * (1 + 0.2 * Math.sin(a * 5)));
    }
    brim.computeVertexNormals();
    soft.put(placed(brim, f, facing(t)), (k) => blend(MID_T, BELLY, 0.55 + 0.3 * smooth((k.y - f.y) / 0.05)), capSway(u));
  }
  // Stars along the cap.
  for (let i = 0; i < 9; i++) {
    const u = 0.14 + i * 0.09;
    const f = CAP.getPointAt(u);
    const r = mix(0.135, 0.022, Math.pow(u, 0.8)) + 0.004;
    const a = i * 2.2;
    const t = CAP.getTangentAt(u);
    const s1 = V(0, 1, 0).addScaledVector(t, -t.y).normalize();
    const s2 = t.clone().cross(s1).normalize();
    const out = s1.clone().multiplyScalar(Math.cos(a)).addScaledVector(s2, Math.sin(a));
    const s = 0.012 + (i % 2) * 0.006;
    glow.put(placed(spark(1, 0.18), f.clone().addScaledVector(out, r), facing(out), V(s, s, s * 0.4)), i % 3 ? MINT : MOON, capSway(u));
  }
  // The pompom: a fluffy ball with a sleepy eye shut in it.
  const tip = CAP.getPointAt(1);
  const pom = tip.clone().add(V(-0.01, -0.03, 0.01));
  soft.put(placed(new THREE.IcosahedronGeometry(1, 2), pom, undefined, 0.058), blend(BELLY, MINT, 0.3), capSway(1));
  sprites.push({ at: pom, color: MINT, op: 0.35, size: 0.3 });

  // ---- the tendrils: a long curtain from the rim, trailing back and down ----
  const TEN = 16;
  for (let i = 0; i < TEN; i++) {
    // Round the rim from one side of the face, past the back, to the other.
    const a = mix(-2.5, 2.5, i / (TEN - 1)) + (rng() - 0.5) * 0.12;
    const base = dome(V(Math.sin(a) * 0.95, -0.25, Math.cos(a) * 0.95)).add(V(0, -0.02, 0));
    const side = Math.sin(a);
    const front = Math.cos(a); // +1 at the back, -1 under the face
    const L = mix(0.75, 1.25, smooth((front + 1) / 2)) * (0.85 + rng() * 0.3);
    const ph = rng() * TAU;
    const pts: V3[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const wig = Math.sin(u * 7 + ph) * 0.09 * u;
      pts.push(V(base.x + side * (0.06 * u + 0.05 * Math.sin(u * 3)) + wig, base.y - L * (0.34 * u + 0.12 * u * u) - 0.08 * Math.sin(u * 8 + ph * 1.3) * u, base.z + L * (0.62 * u + 0.2 * u * u) * mix(0.55, 1, (front + 1) / 2)));
    }
    const r0 = 0.032 - 0.01 * Math.abs(Math.sin(i * 1.7));
    shade.put(tube(new THREE.CatmullRomCurve3(pts), r0, 0.002, 18, 4, { point: true, pow: 1.5 }), SH);
    soft.put(tube(new THREE.CatmullRomCurve3(pts), r0, 0.002, 24, 5, {
      point: true,
      pow: 1.5,
      col: (q) => blend(blend(TEAL, MID_T, 0.4), MINT, smooth((q - 0.55) / 0.45) * 0.75),
      sway: (q) => [0.05 * q * q, ph + q * 3],
    }));
    // A few glowing beads down the longest ones.
    if (i % 3 === 1)
      for (const u of [0.55, 0.72, 0.88]) {
        const c = new THREE.CatmullRomCurve3(pts).getPointAt(u);
        glow.put(ball(c, 0.007 + (1 - u) * 0.008, undefined, 6, 4), MINT, [0.05 * u * u, ph + u * 3]);
      }
  }
  // ---- what ships left in it ----
  const WOOD = C(0x6a5440), WOOD_D = C(0x3e3026), BRASS = C(0x9a8040), VERD = C(0x4f8a72), IRON = C(0x3a3c44);
  const tarnish = (q: V3) => blend(BRASS, VERD, smooth(0.5 + 0.7 * Math.sin(q.x * 260 + q.y * 190) * Math.sin(q.z * 230 - q.y * 120)));
  // A ship's lantern hanging from the cap on a short chain, its flame still faintly lit.
  const hang = CAP.getPointAt(0.6).add(V(-0.02, -0.07, 0));
  const lsw = capSway(0.6);
  const lantern = hang.clone().add(V(-0.01, -0.09, 0.01));
  for (const g of chain([hang.clone().add(V(0, 0.06, 0)), hang.clone().add(V(-0.004, 0.0, 0.003)), lantern.clone().add(V(0, 0.05, 0))], 0.016, 0.002)) hard.put(g, () => IRON, lsw);
  const LH = 0.06, LR = 0.022;
  hard.put(placed(new THREE.ConeGeometry(LR * 1.25, LH * 0.38, 6), lantern.clone().add(V(0, LH * 0.62, 0))), tarnish, lsw);
  hard.put(placed(new THREE.TorusGeometry(0.008, 0.002, 4, 8), lantern.clone().add(V(0, LH * 0.88, 0))), tarnish, lsw);
  hard.put(placed(new THREE.CylinderGeometry(LR * 1.15, LR * 1.25, LH * 0.12, 6), lantern.clone().add(V(0, -LH * 0.5, 0))), tarnish, lsw);
  hard.put(placed(new THREE.CylinderGeometry(LR * 1.1, LR * 1.1, LH * 0.08, 6), lantern.clone().add(V(0, LH * 0.42, 0))), tarnish, lsw);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + 0.4;
    hard.put(rod(lantern.clone().add(V(Math.cos(a) * LR, -LH * 0.45, Math.sin(a) * LR)), lantern.clone().add(V(Math.cos(a) * LR, LH * 0.42, Math.sin(a) * LR)), 0.0022), tarnish, lsw);
  }
  // The glass, smoky with the flame behind it, and the flame.
  glow.put(placed(new THREE.CylinderGeometry(LR * 0.92, LR * 0.92, LH * 0.84, 6, 1, true), lantern), (q) => blend(C(0xffc070), C(0x6a4a2a), smooth(Math.abs(q.y - lantern.y) / (LH * 0.45))), lsw);
  glow.put(placed(new THREE.SphereGeometry(1, 6, 5), lantern.clone().add(V(0, -0.004, 0)), undefined, V(0.007, 0.013, 0.007)), C(0xfff0c0), lsw);
  sprites.push({ at: lantern, color: C(0xffb050), op: 0.5, size: 0.2 });
  twinkles.push({ at: lantern.clone().add(V(-0.02, LH * 0.62, -0.01)), color: C(0xffe9a0), r: 0.004, glow: true });

  // The broken ribs of a rowing boat caught in the tendrils on the near side, at the waterline.
  const bo = dome(V(-0.98, -0.2, 0.15)).add(V(-0.05, -0.04, 0.02));
  const bq = facing(V(0.15, 0.5, 1), V(-0.85, 0.5, 0));
  const B = (x: number, y: number, z: number) => V(x, y, z).multiplyScalar(1.25).applyQuaternion(bq).add(bo);
  const keel = new THREE.CatmullRomCurve3([B(0, 0.03, -0.17), B(0, -0.02, -0.08), B(0, -0.03, 0.04), B(0, -0.01, 0.14)]);
  hard.put(tube(keel, 0.007, 0.006, 8, 5), WOOD_D);
  ([[-0.11, 0.8, 1], [-0.05, 1, 0.75], [0.02, 1, 1], [0.08, 0.95, 0.55], [0.13, 0.85, 0.9]] as [number, number, number][]).forEach(([z, w, keep], k) => {
    for (const s of [-1, 1]) {
      if (k === 3 && s > 0) continue; // a broken one
      const len = keep * (s > 0 ? 1 : 0.85);
      const rib = new THREE.CatmullRomCurve3([B(0, -0.03, z), B(s * 0.04 * w, -0.025, z), B(s * 0.075 * w, 0.01, z), B(s * 0.085 * w, 0.06 * len, z + 0.004)]);
      hard.put(tube(rib, 0.0045, 0.0035, 8, 4), (q) => blend(WOOD_D, WOOD, smooth((q.distanceTo(bo) - 0.02) / 0.06)));
    }
  });
  // Two planks still nailed on, one snapped short, and the gunwale's stub.
  hard.put(placed(new THREE.BoxGeometry(0.008, 0.02, 0.2), B(-0.07, 0.0, 0.0), bq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.5)), 1.25), WOOD);
  hard.put(placed(new THREE.BoxGeometry(0.008, 0.02, 0.12), B(0.07, 0.0, -0.06), bq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.5)), 1.25), WOOD);
  hard.put(placed(new THREE.BoxGeometry(0.01, 0.012, 0.22), B(-0.083, 0.055, 0.0), bq, 1.25), WOOD_D);
  // A tendril looped through it.
  const loop = new THREE.CatmullRomCurve3([dome(V(-0.9, -0.1, 0.0)), B(-0.03, 0.09, -0.05), B(0.04, 0.05, 0.05), B(0.02, -0.07, 0.12), B(-0.06, -0.12, 0.2), B(-0.1, -0.22, 0.3)]);
  soft.put(tube(loop, 0.016, 0.002, 18, 5, { point: true, col: (q) => blend(blend(TEAL, MID_T, 0.4), MINT, smooth((q - 0.6) / 0.4) * 0.7), sway: (q) => [0.02 * q * q, 1 + q * 2] }));
  twinkles.push({ at: B(-0.083, 0.064, 0.08), color: C(0xffe9a0), r: 0.004, glow: true });

  // ---- the ring of dream-lights turning slowly over it ----
  const ring = new Bucket();
  const RR = 0.52;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + (rng() - 0.5) * 0.12;
    const r = RR * (0.95 + rng() * 0.1);
    const at = V(Math.cos(a) * r, (rng() - 0.5) * 0.03, Math.sin(a) * r);
    const s = 0.012 + (i % 3) * 0.008 + (i % 7 === 0 ? 0.012 : 0);
    ring.put(placed(spark(1, 0.2), at, new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng() * TAU, rng())), s), i % 3 === 2 ? MOON : MINT);
  }

  return {
    hard: { geo: hard.build(), rough: 0.7, metal: 0.3 },
    soft: { geo: soft.build(), rough: 0.68, coat: 0.12, tint: 0x041a18 },
    rim: { geo: rim.build(), rough: 0.75, color: 0x1f7468, power: 2.6 },
    glow: glow.build(),
    shade: shade.build(),
    ring: { at: V(0, 0.42, -0.12), tilt: new THREE.Euler(0.22, 0, -0.12), speed: 0.22, glow: ring.build() },
    sprites,
    twinkles,
  };
}
