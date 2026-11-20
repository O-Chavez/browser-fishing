import * as THREE from 'three';
import { addTackle } from '../tackle';
import { MAT, V, lerp, add, bodyGeo, bump, cached, env, eyeGeo, finFan, fuse, glint, glowMat, lidGeo, mix, put, seeded, shade, surf, surfNormal, tint, tube, type Frame, type Legend, type LegendCtx, type PaintCtx } from './kit';

// The Squall Marlin, the Drop-off's legend: the storm itself, on a line. A storm-dark back, a towering sail with a
// torn trailing edge, a long spear, a deep crescent tail with long tips, and its bars drawn as forks of lightning
// that glow pale electric blue, with sparks crackling round the sail.

const BACK = 0x111d3c;
const BELLY = 0xd6e2ee;
const FIN = 0x2c4c88;
const BOLT = 0xcfeeff;
const SPARK = 0x9fdcff;

const F: Frame = {
  top: (t) => 0.118 * env(t, 0.34, 0.62, 0.72, 0.06) + 0.012 * bump(t, 0.2, 0.08),
  bot: (t) => 0.108 * env(t, 0.36, 0.6, 0.72, 0.055),
  half: (t) => 0.072 * env(t, 0.34, 0.6, 0.8, 0.05),
};
const EYE_T = 0.085;
const EYE_A = -0.18;

/** A forked bolt of lightning down the flank from (d0, v0): jagged steps toward the belly, with a fork or two. */
function bolt(g: CanvasRenderingContext2D, P: (d: number, v: number) => [number, number], r: () => number, d0: number, v0: number, len: number, forks: number): void {
  let d = d0;
  let v = v0;
  const pts: [number, number][] = [P(d, v)];
  const n = 7;
  for (let i = 0; i < n; i++) {
    d -= len / n;
    v += (r() - 0.5) * 0.05 + (i % 2 ? 0.012 : -0.012);
    pts.push(P(d, v));
    if (forks > 0 && i > 1 && r() < 0.35) {
      forks--;
      bolt(g, P, r, d, v, len * (0.3 + r() * 0.25), 0);
    }
  }
  g.beginPath();
  g.moveTo(...pts[0]);
  for (const p of pts.slice(1)) g.lineTo(...p);
  g.stroke();
}

function paint(p: PaintCtx): void {
  const { g, rng, flanks, ink } = p;
  const R = Array.from({ length: 600 }, () => rng());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  flanks((P) => {
    ri = 0;
    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (!p.glow) {
      // Storm cloud on the back: soft darker billows over the dark blue, and a silver sheen along the side line.
      g.filter = 'blur(4px)';
      for (let i = 0; i < 26; i++) {
        const [x, y] = P(0.12 + r() * 0.14, 0.08 + r() * 0.86);
        g.fillStyle = ink(r() < 0.5 ? 0x0c1630 : 0x2c3e66, 0.35);
        g.beginPath();
        g.ellipse(x, y, 8 + r() * 14, 5 + r() * 8, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Slate storm-dark from the back down past the side line, so the lightning has a sky to strike across.
      g.filter = 'none';
      const [xa, ya] = P(0.25, 0.0);
      const [xb, yb] = P(-0.06, 1.0);
      const grad = g.createLinearGradient(xa, 0, xb, 0);
      // Deep slate over the top third, fading to the silver only on the lower flank.
      grad.addColorStop(0, ink(0x0b1630, 1));
      grad.addColorStop(0.5, ink(0x13213c, 1));
      grad.addColorStop(0.72, ink(0x1c2840, 0.85));
      grad.addColorStop(0.9, ink(0x34425a, 0.35));
      grad.addColorStop(1, ink(0x34425a, 0));
      g.fillStyle = grad;
      g.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
      g.filter = 'blur(5px)';
      for (let i = 0; i < 30; i++) {
        const [x, y] = P(-0.04 + r() * 0.28, 0.06 + r() * 0.88);
        g.fillStyle = ink(r() < 0.5 ? 0x0a1224 : 0x3a4862, 0.3);
        g.beginPath();
        g.ellipse(x, y, 9 + r() * 14, 5 + r() * 8, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.filter = 'none';
    }
    // The bars, redrawn as forks of lightning from the back down the flank: a wide soft glow under a bright core.
    ri = 200;
    const bolts: [number, number, number][] = [];
    for (let i = 0; i < 8; i++) bolts.push([0.235 - r() * 0.03, 0.2 + i * 0.085 + (r() - 0.5) * 0.02, 0.19 + r() * 0.08]);
    for (const [w, c, a, blur] of (p.glow
      ? [[7, SPARK, 0.5, 3], [2.4, BOLT, 1, 0.6]]
      : [[6, 0x6fb4ff, 0.35, 3], [2, BOLT, 0.95, 0]]) as [number, number, number, number][]) {
      g.filter = blur ? `blur(${blur}px)` : 'none';
      g.strokeStyle = ink(c, a);
      g.lineWidth = w;
      let k = 400;
      for (const [d, v, len] of bolts) {
        ri = k;
        bolt(g, P, r, d, v, len, 1);
        k += 17;
      }
    }
    g.restore();
  });
}

/** A ragged edge: how much of ray k's length is left. */
function torn(seed: string, n: number, depth: number, from = 0): number[] {
  const rng = seeded(seed);
  return Array.from({ length: n + 1 }, (_, i) => (i / n < from ? 1 : 1 - (rng() < 0.4 ? depth * (0.4 + rng() * 0.6) : rng() * 0.06)));
}

function fins(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry; bolts: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  const bolts: THREE.BufferGeometry[] = [];
  // The sail: towering, far taller than the body is deep, from the nape to past the middle, its trailing edge torn.
  const N = 34;
  const rag = torn('marlin:sail', N, 0.32, 0.45);
  const t0 = 0.12;
  const t1 = 0.66;
  const H = (k: number) => 0.4 * Math.min(1, (k / 0.12) ** 0.6) * (1 - 0.82 * Math.max(0, (k - 0.35) / 0.65) ** 1.4);
  const srng = seeded('marlin:pleats');
  // Uneven rays, and three torn notches in the trailing half where the storm has ripped it.
  const dip = Array.from({ length: N + 1 }, (_, i) => {
    let d = 0.84 + srng() * 0.16;
    for (const [c, w, depth] of [[0.5, 1.6, 0.4], [0.7, 2.2, 0.5], [0.87, 1.4, 0.38]] as [number, number, number][]) {
      const x = Math.abs(i / N - c) * N;
      if (x < w) d *= 1 - depth * (1 - x / w);
    }
    return d;
  });
  const shadeRay = Array.from({ length: N + 1 }, () => 0.78 + srng() * 0.4);
  const sailTip = (k: number): [number, number] => {
    const t = t0 + k * (t1 - t0);
    const i = Math.round(k * N);
    return [-0.5 + t + 0.05 + 0.12 * k, F.top(t) * 0.9 + H(k) * dip[i] * rag[i]];
  };
  /** The sail's gentle ripple out of its plane, growing toward the edge, so the pleats read as cloth, not card. */
  const ripple = (i: number, s: number) => (0.016 * Math.sin(i * 0.45) + 0.004 * Math.sin(i * 1.7 + 1)) * s * s;
  {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const cs = [new THREE.Color(0x121e38), new THREE.Color(0x26457c), new THREE.Color(0x5a88c8)];
    const RINGS = [0, 0.4, 0.75, 1];
    const k3 = new THREE.Color();
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      const t = t0 + k * (t1 - t0);
      const root: [number, number] = [-0.5 + t, F.top(t) * 0.88];
      const tip = sailTip(k);
      for (const r of RINGS) {
        pos.push(ripple(i, r), lerp(root[1], tip[1], r), lerp(root[0], tip[0], r));
        k3.copy(r < 0.4 ? cs[0].clone().lerp(cs[1], r / 0.4) : cs[1].clone().lerp(cs[2], (r - 0.4) / 0.6)).multiplyScalar(shadeRay[i]);
        col.push(k3.r, k3.g, k3.b);
      }
      if (i) {
        for (let j = 0; j < RINGS.length - 1; j++) {
          const a0 = (i - 1) * RINGS.length + j;
          const b0 = i * RINGS.length + j;
          idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
        }
      }
    }
    const sail = new THREE.BufferGeometry();
    sail.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sail.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sail.setIndex(idx);
    sail.computeVertexNormals();
    parts.push(sail);
  }
  // Its rays, a soft shade lighter, so the sail reads as spines and membrane.
  for (let i = 1; i < N; i += 2) {
    const k = i / N;
    const t = t0 + k * (t1 - t0);
    const [tz, ty] = sailTip(k);
    const y0 = F.top(t) * 0.9;
    for (const sx of [-1, 1]) {
      const pts = [0, 0.35, 0.7, 0.98].map((r) => V(ripple(i, r) + sx * 0.0025, lerp(y0, ty, r), lerp(-0.5 + t, tz, r)));
      parts.push(tint(tube(pts, (q) => 0.0026 * (1 - q * 0.6), 3, 8), 0x3a64a8, 0x7aa4dc, y0, ty));
    }
  }
  // Lightning in the sail: two jagged forks, glowing (drawn on both faces), following its ripple.
  const onSail = (q: THREE.Vector3) => {
    const k = THREE.MathUtils.clamp((q.z + 0.5 - t0 - 0.05) / (t1 - t0 + 0.12), 0, 1);
    const t = t0 + k * (t1 - t0);
    const y0 = F.top(t) * 0.88;
    const r = THREE.MathUtils.clamp((q.y - y0) / Math.max(0.01, sailTip(k)[1] - y0), 0, 1);
    return ripple(k * N, r);
  };
  const rng = seeded('marlin:bolts');
  for (const [k0, len] of [[0.22, 0.27], [0.45, 0.17]] as [number, number][]) {
    const [tz, ty] = sailTip(k0);
    let z = tz - 0.015;
    let y = ty - 0.025;
    const pts = [V(0, y, z)];
    for (let i = 0; i < 9; i++) {
      y -= (len / 9) * (0.6 + rng() * 0.8);
      z += (i % 2 ? 1 : -1) * (0.006 + rng() * 0.014) + 0.004;
      pts.push(V(0, y, z));
      if (i === 3 || i === 6) {
        const f = [pts[pts.length - 1].clone()];
        for (let j = 0; j < 3; j++) f.push(f[j].clone().add(V(0, -0.02 - rng() * 0.01, (j % 2 ? -0.004 : 0.016) + rng() * 0.008)));
        for (const sx of [-1, 1]) bolts.push(tube(f.map((q) => q.clone().setX(onSail(q) + sx * 0.005)), (s) => 0.0022 * (1 - s * 0.6), 3));
      }
    }
    for (const sx of [-1, 1]) bolts.push(tube(pts.map((q) => q.clone().setX(onSail(q) + sx * 0.005)), (s) => 0.0032 * (1 - s * 0.5), 3));
  }
  // Long sickle pectorals, a little second dorsal and anal fin, and the pelvic streamers.
  const pec = finFan(10, (k) => [k * 0.035, -k * 0.012], (k) => {
    const len = 0.24 * (1 - k * 0.55);
    return [0.035 * k + len * 0.92, -0.012 * k - len * 0.28 - 0.02 * Math.sin(k * Math.PI)];
  }, 0x1c3462, 0x5c8cd0, 0.015);
  for (const sx of [-1, 1]) {
    parts.push(put(pec, surf(F, 0.2, 0.55, sx, 0.97), [0, sx * 0.5, sx * 0.35]));
    parts.push(put(finFan(4, (k) => [k * 0.012, 0], (k) => [0.13 + k * 0.01, -0.035 - k * 0.01], 0x1c3462, 0x6c9ce0, 0.004), surf(F, 0.27, 1.35, sx, 0.97), [0, sx * 0.15, sx * 0.25]));
  }
  for (const [tA, sgn] of [[0.74, 1], [0.7, -1]] as [number, number][]) {
    parts.push(finFan(6, (k) => {
      const t = tA + k * 0.08;
      return [-0.5 + t, sgn * (sgn > 0 ? F.top(t) : F.bot(t)) * 0.9];
    }, (k) => {
      const t = tA + k * 0.08;
      return [-0.5 + t + 0.04, sgn * ((sgn > 0 ? F.top(t) : F.bot(t)) * 0.9 + 0.06 * (1 - k) ** 0.7)];
    }, 0x1c3462, 0x4a7cc4, 0));
  }
  // The tail: a deep crescent with long, sharp tips.
  const tail = finFan(24, (k) => {
    const s = (k - 0.5) * 2;
    return [0.21 * Math.abs(s) ** 1.6 - 0.005, s * 0.3];
  }, (k) => {
    const s = (k - 0.5) * 2;
    return [0.075 + 0.16 * Math.abs(s) ** 1.15, s * 0.305];
  }, 0x14244a, 0x5486cc, 0.015);
  // Keels on the tail root.
  for (const sx of [-1, 1]) parts.push(tint(put(new THREE.OctahedronGeometry(1, 0).deleteAttribute('uv'), [sx * 0.012, 0, 0.44], [0, 0, 0], [0.012, 0.012, 0.05]), 0x22345a));
  return { body: fuse(parts), tail, bolts: fuse(bolts) };
}

let finMemo: ReturnType<typeof fins> | null = null;
const finParts = () => (finMemo ??= fins());

function face(c: LegendCtx): { eyes: THREE.BufferGeometry; flesh: THREE.BufferGeometry } {
  const back = BACK;
  const eyes: THREE.BufferGeometry[] = [];
  const flesh: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const p = surf(F, EYE_T, EYE_A, s, 0.88);
    const out = surfNormal(F, EYE_T, EYE_A, s);
    const e = { p, out, r: 0.027, white: 0xe8f2fa, iris: 0x7fc8ff, irisR: 0.86, pupilR: 0.56, look: V(0, 0, -0.35) };
    eyes.push(eyeGeo(e));
    // A hard, low brow: it is looking at you, and it is not afraid.
    flesh.push(lidGeo(e, 0.42, 0.5, shade(back, 1.3), 1.14));
  }
  // The spear: long and dark, the upper jaw drawn out, a pale edge at the tip.
  const spear = new THREE.ConeGeometry(1, 1, 7, 6).deleteAttribute('uv');
  const sp = spear.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    // Bend it a touch upward toward the tip.
    const y = sp.getY(i);
    sp.setZ(i, sp.getZ(i) + (y + 0.5) ** 2 * 0.02);
  }
  spear.computeVertexNormals();
  flesh.push(tint(put(spear, [0, 0.008, -0.5 - 0.2 + 0.05], [-Math.PI / 2, 0, 0], [0.024, 0.48, 0.016]), shade(back, 0.9), mix(back, 0x8aa8d0, 0.6), -0.24, 0.24));
  // The short lower jaw under it, and the dark of the mouth.
  flesh.push(tint(put(new THREE.ConeGeometry(1, 1, 6).deleteAttribute('uv'), [0, -0.022, -0.515], [-Math.PI / 2 - 0.1, 0, 0], [0.02, 0.07, 0.014]), mix(BELLY, back, 0.6)));
  flesh.push(tint(tube([V(-0.024, -0.016, -0.44), V(0, -0.014, -0.545), V(0.024, -0.016, -0.44)], 0.0035, 4, 12), 0x0c1020));
  return { eyes: fuse(eyes), flesh: fuse(flesh) };
}

function build(c: LegendCtx): void {
  const key = 'marlin';
  const all = cached('marlin:fins', () => finParts().body);
  const tail = cached('marlin:tail', () => finParts().tail);
  const bolts = cached('marlin:bolts', () => finParts().bolts);
  if (c.shadow) {
    add(c, all, c.finMat);
    add(c, tail, c.finMat, c.tail);
    add(c, cached('marlin:spearShadow', () => face(c).flesh), c.finMat);
    return;
  }
  const mat = c.bodyMat as THREE.MeshPhysicalMaterial;
  // Storm-wet, but dark: a soft gloss, no silver sheen over the back.
  mat.roughness = 0.55;
  mat.clearcoat = 0.25;
  mat.clearcoatRoughness = 0.35;
  mat.emissiveIntensity = 1.5;
  const finMat = MAT.fin();
  add(c, all, finMat);
  add(c, tail, finMat, c.tail);
  add(c, bolts, glowMat(c, 0x9fd8ff, 0.85, THREE.DoubleSide));
  const fc = face(c);
  add(c, cached(`${key}:eyes`, () => fc.eyes), MAT.flatPaint());
  add(c, cached(`${key}:flesh`, () => fc.flesh), MAT.flesh());
  // Sparks crackling round the sail and off the spear.
  for (const [x, y, z, s] of [[0.02, 0.5, -0.24, 0.07], [-0.03, 0.44, -0.08, 0.05], [0.0, 0.32, 0.12, 0.06], [-0.02, 0.2, 0.22, 0.045], [0.0, 0.42, -0.34, 0.04], [0.02, 0.04, -0.82, 0.05], [-0.02, 0.28, 0.66, 0.05], [0.01, -0.3, 0.66, 0.045]] as [number, number, number, number][]) {
    glint(c, V(x, y, z), s, SPARK, 0.95);
  }
  // Lost tackle: a hook in the jaw with a long snapped line, a spoon under the jaw, and a fly halfway down the spear
  // with its line wound round it.
  const wrap: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const z = -0.62 - i * 0.012;
    const a = i * 1.3;
    const r = 0.024 * (1 - (-0.41 - z) / 0.48) + 0.0025;
    wrap.push(V(Math.cos(a) * r, 0.008 + Math.sin(a) * r * 0.7, z));
  }
  addTackle(c, [
    { kind: 'hook', p: surf(F, 0.05, 0.5, -1, 1.02), dir: V(-0.3, -0.8, 0.4), twist: 1.4, size: 0.045, glint: true, line: { len: 0.55, drift: V(-0.15, -0.25, 1), wave: 0.02 } },
    { kind: 'spoon', p: V(0.012, -0.05, -0.5), dir: V(0.2, -1, 0.2), twist: 0.6, size: 0.042, glint: true, line: { len: 0.1, drift: V(0.2, -0.6, 1) } },
    { kind: 'fly', p: wrap[14].clone(), dir: V(-0.4, -0.8, 0.2), twist: -0.6, size: 0.04 },
    { kind: 'line', p: wrap[0], dir: V(0, 0, 1), path: wrap },
  ]);
}

export const marlin: Legend = {
  look: { back: BACK, belly: BELLY, fin: FIN, accent: SPARK, marks: [], extras: [] },
  body: () => cached('marlin:body', () => bodyGeo(F, 44, 28)),
  paint,
  glow: true,
  build,
};
