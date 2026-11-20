import * as THREE from 'three';
import { addTackle } from '../tackle';
import { MAT, V, add, aim, bodyGeo, bump, cached, env, eyeGeo, finFan, fuse, glint, lerp, lidGeo, lit, mat, mix, put, seeded, shade, surf, surfNormal, tint, tube, type Frame, type Legend, type LegendCtx, type PaintCtx } from './kit';

// Grandmother Grouper, the Shelf's legend: an ancient matriarch. A deep, heavy body with a hump behind the head,
// thick lips and an underbite, a small wise eye under a heavy brow, ragged fins, pale age mottling, and a hat and
// shawl of coral, sea fan and barnacles. The Shelf is the sunny zone: her light is the sun on her back.

const BACK = 0x566442;
const BELLY = 0xd6c696;
const FIN = 0x7a6a3a;
const LIP = 0x9c8c5c;

const F: Frame = {
  // A hump rising behind the head, a heavy jowled head and jaw, and a blunt brow sloping down to the lips.
  top: (t) => 0.215 * env(t, 0.42, 0.34, 0.62, 0.1) + 0.085 * bump(t, 0.33, 0.13) - 0.012 * bump(t, 0.17, 0.05),
  bot: (t) => 0.25 * env(t, 0.38, 0.32, 0.62, 0.09) + 0.05 * bump(t, 0.15, 0.075),
  half: (t) => 0.15 * env(t, 0.32, 0.34, 0.85, 0.1) + 0.022 * bump(t, 0.16, 0.08),
};
const EYE_T = 0.165;
const EYE_A = -0.52;
const MOUTH_A = 0.42;
const MOUTH_T = 0.135;

/** An irregular soft blotch: a lumpy closed outline round (x, y), `rx` by `ry` canvas units. */
function blotch(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, rx: number, ry: number): void {
  const n = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 0.55 + r() * 0.6;
    pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]);
  }
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    if (!i) g.moveTo((x0 + x1) / 2, (y0 + y1) / 2);
    g.quadraticCurveTo(x1, y1, (x1 + pts[(i + 2) % n][0]) / 2, (y1 + pts[(i + 2) % n][1]) / 2);
  }
  g.closePath();
  g.fill();
}

function paint(p: PaintCtx): void {
  const { g, rng, flanks, ink } = p;
  // One list of marks for both flanks, so she is the same fish from either side.
  const R = Array.from({ length: 900 }, () => rng());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  if (p.glow) {
    // The sun on her back: a soft web of warm light rippling over the ridge and the hump, fading down the flank.
    flanks((P) => {
      ri = 0;
      g.save();
      g.filter = 'blur(1.6px)';
      g.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const d = 0.13 + r() * 0.125;
        const v = 0.1 + r() * 0.8;
        const [x, y] = P(d, v);
        const a = (d - 0.12) / 0.13;
        g.strokeStyle = ink(0xffcf7a, 0.12 + a * 0.22);
        g.lineWidth = 1.3 + r() * 1.2;
        g.beginPath();
        const len = 9 + r() * 12;
        const ang = r() * Math.PI;
        g.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len * 0.6);
        g.quadraticCurveTo(x + (r() - 0.5) * 12, y + (r() - 0.5) * 8, x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.6);
        g.stroke();
      }
      g.restore();
    });
    return;
  }
  flanks((P) => {
    ri = 0;
    g.save();
    // A darker, sun-browned back and a warmer, paler throat, so she reads deep and heavy.
    {
      const [, y0] = P(0.25, 0);
      const [x0] = P(0.25, 0);
      const [x1] = P(0.06, 0);
      const grad = g.createLinearGradient(x0, y0, x1, y0);
      grad.addColorStop(0, ink(0x2c3622, 0.38));
      grad.addColorStop(1, ink(0x2c3622, 0));
      g.fillStyle = grad;
      const [xa, ya] = P(0.25, 0.02);
      const [xb, yb] = P(0.06, 0.98);
      g.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
    }
    // Broad dark saddles over the back, fading down the flank.
    g.filter = 'blur(3px)';
    for (let i = 0; i < 5; i++) {
      const v = 0.26 + i * 0.14 + (r() - 0.5) * 0.03;
      const [x0, y0] = P(0.25, v);
      const [x1] = P(-0.04, v);
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, ink(0x2e3a24, 0.55));
      grad.addColorStop(0.6, ink(0x2e3a24, 0.3));
      grad.addColorStop(1, ink(0x2e3a24, 0));
      g.fillStyle = grad;
      g.beginPath();
      const w = 12 + r() * 6;
      g.moveTo(x0, y0 - w);
      g.quadraticCurveTo((x0 + x1) / 2, y0 - w * 1.5 + r() * 10, x1, y0 - w * 0.3);
      g.lineTo(x1, y0 + w * 0.3);
      g.quadraticCurveTo((x0 + x1) / 2, y0 + w * 1.5 - r() * 10, x0, y0 + w);
      g.fill();
    }
    // Age: soft, irregular blotches worked into the skin, pale lichen and dark liver spots, in loose drifts.
    g.filter = 'blur(2.2px)';
    for (let i = 0; i < 60; i++) {
      const d = -0.13 + r() * 0.34;
      const v = 0.16 + r() * 0.72;
      const [x, y] = P(d, v);
      const big = r();
      g.fillStyle = ink(i % 3 ? 0xc9c08a : 0xb4ad78, 0.16 + r() * 0.16);
      blotch(g, r, x, y, 5 + big * 13, 3 + big * 6);
    }
    g.filter = 'blur(1.4px)';
    for (let i = 0; i < 46; i++) {
      const [x, y] = P(-0.1 + r() * 0.32, 0.14 + r() * 0.74);
      g.fillStyle = ink(0x283020, 0.18 + r() * 0.22);
      blotch(g, r, x, y, 2 + r() * 4, 1.5 + r() * 2.5);
    }
    g.filter = 'none';
    // The gill cover: a long dark curve behind the cheek, with a paler edge.
    for (const [c, a, w, off] of [[0x26301e, 0.38, 2.4, 0], [0xcfc79c, 0.14, 1.4, 2.8]] as [number, number, number, number][]) {
      g.strokeStyle = ink(c, a);
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      const [ax, ay] = P(0.16, 0.26);
      const [bx, by] = P(0.02, 0.33);
      const [cx, cy] = P(-0.15, 0.25);
      g.moveTo(ax, ay - off);
      g.quadraticCurveTo(bx, by - off * 1.6, cx, cy - off);
      g.stroke();
    }
    // Wrinkles: bags under the eye, creases at the corner of the mouth, lines on the brow.
    g.strokeStyle = ink(0x2c3522, 0.5);
    const arc = (d0: number, v0: number, d1: number, v1: number, bend: number, w = 1.5) => {
      const [x0, y0] = P(d0, v0);
      const [x1, y1] = P(d1, v1);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + bend * (y1 - y0), (y0 + y1) / 2 - bend * (x1 - x0), x1, y1);
      g.stroke();
    };
    const ed = -EYE_A / (Math.PI * 2);
    arc(ed - 0.014, EYE_T - 0.05, ed - 0.036, EYE_T + 0.035, -0.5, 1.7);
    arc(ed - 0.032, EYE_T - 0.045, ed - 0.054, EYE_T + 0.045, -0.5, 1.2);
    arc(ed + 0.03, EYE_T + 0.06, ed - 0.015, EYE_T + 0.085, 0.3, 1.2);
    const md = -MOUTH_A / (Math.PI * 2);
    arc(md + 0.012, MOUTH_T + 0.005, md - 0.05, MOUTH_T + 0.05, 0.25, 1.8);
    arc(md + 0.03, MOUTH_T + 0.03, md - 0.02, MOUTH_T + 0.075, 0.25, 1.2);
    for (let i = 0; i < 3; i++) arc(ed + 0.05 + i * 0.022, 0.07 + i * 0.012, ed + 0.065 + i * 0.022, 0.15 + i * 0.012, 0.18, 1.1);
    // Old scars: pale scratches where something once raked her flank.
    g.strokeStyle = ink(0xe0d8b8, 0.5);
    for (let i = 0; i < 3; i++) arc(0.045 - i * 0.022, 0.52 + i * 0.01, 0.07 - i * 0.022, 0.68 + i * 0.012, 0.12, 1.4);
    g.restore();
  });
}

/** A ragged edge: how much of ray k's length is left after the years' nicks and tears. */
function ragged(seed: string, n: number, depth = 0.3): number[] {
  const rng = seeded(seed);
  return Array.from({ length: n + 1 }, (_, i) => 1 - (i % 2 ? 0.05 : 0) - (rng() < 0.3 ? depth * (0.5 + rng() * 0.5) : rng() * 0.08));
}

function fins(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  // Her own olive at the root, warming to an old bronze at the frayed edge.
  const c0 = mix(BACK, 0x2c3622, 0.35);
  const c1 = mix(BACK, 0xb08a3a, 0.55);
  const parts: THREE.BufferGeometry[] = [];
  // Dorsal: old spines in front with the web torn between them, a soft ragged lobe behind.
  const N = 30;
  const rag = ragged('grouper:dorsal', N, 0.4);
  parts.push(finFan(N, (k) => {
    const t = 0.36 + k * 0.5;
    return [-0.5 + t, F.top(t) * 0.9];
  }, (k) => {
    const t = 0.36 + k * 0.5;
    const i = Math.round(k * N);
    const spiny = k < 0.56;
    const h = spiny ? (i % 3 === 0 ? 0.135 : i % 3 === 1 ? 0.075 : 0.05) * (0.75 + 0.5 * Math.sin(Math.min(1, k / 0.5) * Math.PI * 0.8 + 0.3)) : 0.12 * Math.sin(Math.min(1, (k - 0.5) / 0.5 + 0.12) * Math.PI) ** 0.7 * rag[i];
    return [-0.5 + t + 0.03 + k * 0.05, F.top(t) * 0.9 + h];
  }, c0, c1, 0.012));
  // Anal and pelvic fins.
  const ragA = ragged('grouper:anal', 10, 0.35);
  parts.push(finFan(10, (k) => {
    const t = 0.62 + k * 0.2;
    return [-0.5 + t, -F.bot(t) * 0.9];
  }, (k) => {
    const t = 0.62 + k * 0.2;
    return [-0.5 + t + 0.05 + k * 0.03, -F.bot(t) * 0.9 - 0.11 * Math.sin((0.15 + k * 0.85) * Math.PI) ** 0.6 * ragA[Math.round(k * 10)]];
  }, c0, c1, 0.01));
  // Pectorals: big rounded fans, frayed at the edge.
  const ragP = ragged('grouper:pec', 12, 0.28);
  const pec = finFan(12, () => [0, 0], (k) => {
    const a = -1.25 + k * 1.75;
    const len = 0.2 * (0.72 + 0.28 * Math.sin(k * Math.PI)) * ragP[Math.round(k * 12)];
    return [Math.cos(a) * len, Math.sin(a) * len];
  }, c0, c1, 0.02);
  const ragV = ragged('grouper:pelvic', 6, 0.3);
  const pelvic = finFan(6, (k) => [k * 0.05, 0], (k) => [0.05 + k * 0.08, -0.11 * (0.6 + 0.4 * Math.sin(k * Math.PI)) * ragV[k * 6 | 0]], c0, c1, 0.008);
  for (const sx of [-1, 1]) {
    parts.push(put(pec, surf(F, 0.3, 0.42, sx, 0.98), [0, sx * 0.62, sx * 0.25]));
    parts.push(put(pelvic, surf(F, 0.34, 1.25, sx, 0.97), [0, sx * 0.3, sx * 0.5]));
  }
  // Tail: a broad round fan with pieces missing.
  const NT = 18;
  const ragT = ragged('grouper:tail', NT, 0.32);
  const tail = finFan(NT, (k) => [0.0, (k - 0.5) * 0.085], (k) => {
    const a = (k - 0.5) * 2.1;
    const len = 0.215 * (0.85 + 0.15 * Math.cos(a * 1.4)) * ragT[Math.round(k * NT)];
    return [Math.cos(a) * len, Math.sin(a) * len * 1.05];
  }, c0, c1, 0.014);
  return { body: fuse(parts), tail };
}

/**
 * A lip's path around the snout, corner to corner: an arc wider than the pointed nose, so she has a broad muzzle.
 * `a` is how far below the side line its corners sit, `yFront` its height at the front, `fwd` how far it juts.
 */
function mouthPath(a: number, yFront: number, fwd: number, wide = 1): THREE.Vector3[] {
  const corner = surf(F, MOUTH_T, a, 1, 1);
  const A = corner.x * wide;
  const B = MOUTH_T + fwd;
  const pts: THREE.Vector3[] = [];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const phi = lerp(-Math.PI / 2, Math.PI / 2, i / N);
    const k = Math.cos(phi);
    pts.push(V(A * Math.sin(phi), lerp(corner.y, yFront, k ** 0.75), -0.5 + MOUTH_T - B * k));
  }
  return pts;
}

/** A sprig of branching coral growing from `p` along `dir`. */
function sprig(rng: () => number, p: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, c0: number, c1: number, out: THREE.BufferGeometry[]): void {
  const d = dir.clone().normalize();
  const end = p.clone().addScaledVector(d, len);
  const g = tube([p, p.clone().lerp(end, 0.5).add(V((rng() - 0.5) * len * 0.15, 0, (rng() - 0.5) * len * 0.15)), end], (s) => r * (1 - s * 0.35), 5);
  out.push(tint(g, depth > 1 ? c0 : mix(c0, c1, 0.5), depth > 0 ? mix(c0, c1, 0.5) : c1, p.y, end.y + 0.001));
  if (depth <= 0) {
    out.push(tint(put(new THREE.IcosahedronGeometry(r * 1.05, 0).deleteAttribute('uv'), end), c1));
    return;
  }
  const n = depth > 1 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 1.5;
    const nd = d.clone().add(V(Math.cos(a) * 0.75, 0.25, Math.sin(a) * 0.75)).normalize();
    sprig(rng, p.clone().lerp(end, 0.55 + rng() * 0.4), nd, len * (0.62 + rng() * 0.2), r * 0.72, depth - 1, c0, c1, out);
  }
}

/**
 * A sea fan rooted at `p`, growing toward `up`, its flat face across `across`: forking branches, raised, over a
 * membrane of the same warm coral. The membrane goes in `out` with the branches (it is painted geometry, seen from
 * both sides because each triangle is doubled).
 */
function seaFan(rng: () => number, p: THREE.Vector3, up: THREE.Vector3, across: THREE.Vector3, size: number, out: THREE.BufferGeometry[]): void {
  const u = up.clone().normalize();
  const x = across.clone().addScaledVector(u, -across.dot(u)).normalize();
  const nrm = V(0, 0, 0).crossVectors(x, u);
  const at = (a: number, r: number, lift = 0) => p.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(x, Math.sin(a) * r).addScaledVector(nrm, lift);
  const M0 = 0xc4562e;
  const M1 = 0xf0a650;
  const B = 0xb04a26;
  // The membrane: a ring of points round the fan's edge, wavy, fanned from the root through a middle ring.
  const N = 18;
  const pos: number[] = [];
  const col: number[] = [];
  const c0 = new THREE.Color(M0);
  const c1 = new THREE.Color(M1);
  const cm = c0.clone().lerp(c1, 0.55);
  const edge = Array.from({ length: N + 1 }, (_, i) => size * (0.82 + 0.18 * Math.sin((i / N) * Math.PI)) * (0.92 + rng() * 0.12));
  const ang = (i: number) => lerp(-1.05, 1.05, i / N);
  const wave = (i: number) => Math.sin(i * 1.7) * size * 0.05;
  const tri = (a: THREE.Vector3, ca: THREE.Color, b: THREE.Vector3, cb: THREE.Color, c: THREE.Vector3, cc: THREE.Color) => {
    for (const [v, k] of [[a, ca], [b, cb], [c, cc], [a, ca], [c, cc], [b, cb]] as [THREE.Vector3, THREE.Color][]) {
      pos.push(v.x, v.y, v.z);
      col.push(k.r, k.g, k.b);
    }
  };
  for (let i = 0; i < N; i++) {
    const m0 = at(ang(i), edge[i] * 0.45, wave(i) * 0.4);
    const m1 = at(ang(i + 1), edge[i + 1] * 0.45, wave(i + 1) * 0.4);
    const e0 = at(ang(i), edge[i], wave(i));
    const e1 = at(ang(i + 1), edge[i + 1], wave(i + 1));
    tri(p, c0, m0, cm, m1, cm);
    tri(m0, cm, e0, c1, e1, c1);
    tri(m0, cm, e1, c1, m1, cm);
  }
  const mem = new THREE.BufferGeometry();
  mem.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mem.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  mem.computeVertexNormals();
  out.push(mem);
  // Branches forking out to the rim, standing proud of the membrane on both faces.
  const branch = (a: number, r0: number, r1: number, w: number, depth: number) => {
    for (const side of [-1, 1]) {
      const pts = [0, 0.33, 0.66, 1].map((k) => at(a + Math.sin(k * 3 + a * 5) * 0.03, lerp(r0, r1, k), side * w * 0.9 + wave(Math.round(((a + 1.05) / 2.1) * N)) * lerp(r0, r1, k) / size));
      out.push(tint(tube(pts, (k) => w * (1 - k * 0.4), 4), B, mix(B, M1, 0.4)));
    }
    if (depth > 0) for (const da of [-0.17, 0.17]) branch(a + da * (1 + rng() * 0.3), r1, Math.min(size * 0.98, r1 + size * 0.42), w * 0.7, depth - 1);
  };
  branch(0, 0, size * 0.22, 0.0055, 0);
  for (const a of [-0.55, 0, 0.55]) branch(a, size * 0.18, size * 0.5, 0.0045, 1);
  // A little knot of coral where it roots.
  out.push(tint(put(new THREE.IcosahedronGeometry(size * 0.08, 1).deleteAttribute('uv'), p, [0, 0, 0], [1, 0.6, 1]), B));
}

/** Barnacles, the coral hat and the sea fan: everything that has grown on her. */
function growths(): THREE.BufferGeometry {
  const rng = seeded('grouper:growths');
  const out: THREE.BufferGeometry[] = [];
  // One barnacle, painted once, placed (and stretched) wherever one grows.
  const shell = tint(new THREE.CylinderGeometry(0.34, 1, 1, 7, 1, true).translate(0, 0.5, 0).deleteAttribute('uv'), 0x8c8266, 0xd8ceb0, 0, 0.9);
  const hole = tint(new THREE.CircleGeometry(0.22, 7).rotateX(-Math.PI / 2).translate(0, 0.8, 0).deleteAttribute('uv'), 0x5a4c3a);
  const barnacle = (t: number, a: number, side: number, size: number) => {
    const p = surf(F, t, a, side, 0.985);
    const n = surfNormal(F, t, a, side);
    const h = 0.55 + rng() * 0.35;
    out.push(aim(shell, p, n, [size, size * h, size], rng() * 3));
    out.push(aim(hole, p, n, [size, size * h, size]));
  };
  const cluster = (t: number, a: number, side: number, n: number, size: number, spread = 1) => {
    for (let i = 0; i < n; i++) barnacle(t + (rng() - 0.5) * 0.05 * spread, a + (rng() - 0.5) * 0.4 * spread, side, size * (0.55 + rng() * 0.6));
  };
  for (const s of [-1, 1]) {
    cluster(0.085, -0.9, s, 3, 0.015);
    cluster(0.4, -1.2, s, 4, 0.018, 0.8);
    cluster(0.66, -1.15, s, 4, 0.016, 1.3);
    cluster(0.86, -0.5, s, 3, 0.013);
    cluster(0.22, 1.0, s, 4, 0.016);
  }
  // Her hat: a mound of living coral grown out of her brow, lumpy encrusting coral sunk into the skin with branching
  // coral, tube sponges and a little brain coral rising from it.
  const CORAL = 0xe8583e;
  const CORAL_TIP = 0xffa27a;
  const lump = new THREE.IcosahedronGeometry(1, 1).deleteAttribute('uv');
  for (let i = 0; i < 16; i++) {
    const t = 0.13 + rng() * 0.12;
    const a = -1.57 + (rng() - 0.5) * 0.9;
    const sd = rng() < 0.5 ? -1 : 1;
    const q = surf(F, t, a, sd, 0.97);
    const n = surfNormal(F, t, a, sd);
    const sz = 0.018 + rng() * 0.02;
    out.push(tint(aim(lump, q, n, [sz * 1.2, sz * 0.7, sz], rng() * 3), mix(0xd8664a, 0xf09068, rng()), mix(CORAL_TIP, 0xffd0b0, rng() * 0.5), -sz, sz));
  }
  const brow = (t: number, a: number, s = -1) => ({ q: surf(F, t, a, s, 0.985), n: surfNormal(F, t, a, s) });
  for (const [t, a, s, len, rad, dep, lean] of [
    [0.19, -1.45, -1, 0.085, 0.017, 2, 0.15], [0.165, -1.3, 1, 0.07, 0.015, 2, -0.1], [0.225, -1.25, -1, 0.055, 0.013, 1, 0.4], [0.14, -1.3, -1, 0.05, 0.012, 1, -0.3],
  ] as [number, number, number, number, number, number, number][]) {
    const { q, n } = brow(t, a, s);
    sprig(rng, q, n.clone().add(V(0, 0.9, lean)), len, rad, dep, CORAL, CORAL_TIP, out);
  }
  // Tube sponges, yellow, a little cluster at the back of the mound.
  for (let i = 0; i < 5; i++) {
    const { q, n } = brow(0.225 + rng() * 0.03, -1.65 + i * 0.12, 1);
    out.push(tint(aim(new THREE.CylinderGeometry(0.011, 0.008, 1, 7, 1, true).translate(0, 0.5, 0).deleteAttribute('uv'), q, n.clone().add(V(0, 0.6, 0.3)), [1, 0.04 + rng() * 0.03, 1]), 0xd89a2a, 0xffd86a, q.y, q.y + 0.06));
  }
  // A small brain coral, cream, at the front of the mound.
  {
    const { q, n } = brow(0.13, -1.5, -1);
    out.push(tint(aim(new THREE.IcosahedronGeometry(0.022, 1).deleteAttribute('uv'), q, n, [1, 0.8, 1]), 0xe8d6a8));
  }
  // A sea fan grown from her hump: a fan of branches with a membrane between them, warm coral.
  seaFan(rng, surf(F, 0.28, -1.62, -1, 0.97), V(-0.4, 0.85, 0.5), V(0.3, 0.1, 1), 0.21, out);
  return fuse(out);
}

function face(c: LegendCtx): { eyes: THREE.BufferGeometry; flesh: THREE.BufferGeometry } {
  const back = BACK;
  const belly = BELLY;
  // Her lips are her own skin, a little paler where they roll out, so they belong to her head.
  const lip = mix(back, belly, 0.32);
  const eyes: THREE.BufferGeometry[] = [];
  const flesh: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const p = surf(F, EYE_T, EYE_A, s, 0.9);
    const out = surfNormal(F, EYE_T, EYE_A, s);
    const e = { p, out, r: 0.036, white: 0xf4efe0, iris: 0xc9903a, irisR: 0.8, pupilR: 0.46, look: V(0, -0.12, -0.3) };
    eyes.push(eyeGeo(e));
    // A heavy lid, half lowered, and the bony brow above it.
    flesh.push(lidGeo(e, 0.6, -0.12, mix(back, belly, 0.28), 1.16));
    const brow = new THREE.SphereGeometry(1, 10, 6).deleteAttribute('uv');
    flesh.push(tint(put(brow, p.clone().add(V(s * 0.004, 0.036, 0.006)), [-0.2, 0, s * 0.35], [0.03, 0.016, 0.056]), mix(back, belly, 0.12)));
    // A soft bag under the eye.
    const bag = new THREE.SphereGeometry(1, 8, 5).deleteAttribute('uv');
    flesh.push(tint(put(bag, p.clone().add(V(s * -0.002, -0.034, 0.004)), [-0.2, 0, 0], [0.026, 0.012, 0.04]), mix(back, belly, 0.5)));
  }
  // Thick lips: the lower one juts out past the upper (her underbite), with the dark of the mouth between.
  flesh.push(tint(tube(mouthPath(MOUTH_A - 0.12, -0.014, -0.006), (s) => 0.008 + 0.014 * Math.sin(s * Math.PI) ** 0.5, 9, 44), lip));
  // The heavy underlip: her own olive, a shade paler, tucked into the head.
  flesh.push(tint(tube(mouthPath(MOUTH_A + 0.13, -0.05, -0.002, 0.97), (s) => 0.008 + 0.015 * Math.sin(s * Math.PI) ** 0.5, 9, 44), mix(back, belly, 0.18)));
  flesh.push(tint(tube(mouthPath(MOUTH_A + 0.02, -0.033, -0.004, 0.96), (s) => 0.004 + 0.009 * Math.sin(s * Math.PI), 6, 30), 0x2c2418));
  // The chin under the lower lip.
  const chin = new THREE.SphereGeometry(1, 12, 8).deleteAttribute('uv');
  flesh.push(tint(put(chin, [0, -0.08, -0.43], [0.3, 0, 0], [0.065, 0.034, 0.08]), mix(back, belly, 0.22)));
  return { eyes: fuse(eyes), flesh: fuse(flesh) };
}

function build(c: LegendCtx): void {
  const key = 'grouper';
  const f = cached('grouper:fins', () => fins().body);
  const tail = cached('grouper:tail', () => fins().tail);
  if (c.shadow) {
    add(c, f, c.finMat);
    add(c, tail, c.finMat, c.tail);
    // Her coral hat and sea fan are part of her shape from above, too.
    add(c, cached('grouper:growths', growths), c.finMat);
    return;
  }
  const bm = c.bodyMat as THREE.MeshPhysicalMaterial;
  // Old, not lacquered: a dry, soft skin with a warm sheen at the rim where the sun catches it.
  bm.roughness = 0.78;
  bm.clearcoat = 0.06;
  bm.sheen = 0.6;
  bm.sheenColor = new THREE.Color(0xffd890);
  bm.sheenRoughness = 0.45;
  bm.emissiveIntensity = 1;
  const finMat = MAT.fin(c.light);
  add(c, f, finMat);
  add(c, tail, finMat, c.tail);
  const fc = face(c);
  add(c, cached(`${key}:eyes`, () => fc.eyes), MAT.flatPaint());
  add(c, cached(`${key}:flesh`, () => fc.flesh), mat(`grouper:skin|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 }), c.light)));
  add(c, cached('grouper:growths', growths), MAT.hard(c.light));
  // The sun on her back: its dapples are in her skin's glow; here, a glint or two where it catches wet shell.
  for (const [t, a, s, lift] of [[0.31, -1.35, -1, 1.03], [0.6, -1.2, 1, 1.04]] as [number, number, number, number][]) {
    glint(c, surf(F, t, a, s, lift), 0.06, 0xffe6a8, 0.85);
  }
  // Lost tackle: a hook and a float on the corner of her mouth, a spoon in the lower lip, a fly on the far side.
  const corner = (s: number) => surf(F, MOUTH_T - 0.012, MOUTH_A + 0.14, s, 1.08);
  addTackle(c, [
    { kind: 'hook', p: corner(-1), dir: V(-0.35, -0.7, 0.6), twist: 1.2, size: 0.055, glint: true, line: { len: 0.34, drift: V(-0.25, -0.35, 1), bobber: 0.72 } },
    { kind: 'spoon', p: surf(F, 0.05, MOUTH_A + 0.3, 1, 1.12).add(V(0, -0.012, -0.02)), dir: V(0.3, -1, 0.15), twist: 0.6, size: 0.05, glint: true, line: { len: 0.12, drift: V(0.3, -0.6, 1) } },
    { kind: 'fly', p: corner(1).add(V(0, 0.006, -0.03)), dir: V(0.5, -0.5, 0.7), twist: -0.8, size: 0.045, line: { len: 0.22, drift: V(0.3, -0.2, 1) } },
    { kind: 'hook', p: surf(F, 0.07, MOUTH_A + 0.26, -1, 1.1).add(V(0, -0.012, -0.02)), dir: V(-0.3, -1, 0.1), twist: 2.4, size: 0.042 },
  ]);
}

export const grouper: Legend = {
  // Her old olive skin is painted dark; at sea's light it read near-black brown without this.
  light: 3.4,
  look: { back: BACK, belly: BELLY, fin: FIN, marks: [], extras: [] },
  body: () => cached('grouper:body', () => bodyGeo(F, 48, 32)),
  paint,
  glow: true,
  build,
};
