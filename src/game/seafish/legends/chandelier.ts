import * as THREE from 'three';
import { addTackle } from '../tackle';
import { MAT, V, add, aim, bodyGeo, bump, cached, env, eyeGeo, finFan, fuse, glint, glowSprite, lerp, lidGeo, lit, mat, mix, put, seeded, smooth, surf, surfNormal, tint, tube, type Frame, type Legend, type LegendCtx, type PaintCtx } from './kit';

// The Chandelier Angler, the Twilight's lamp-bearer: five lights in the dark, and one very large smile. A dark violet
// globe of a fish; from its brow a long rod bending forward over its face carries a real chandelier (a crown, two tiers
// of curling arms, five warm lamps in cups, crystal drops), and the lamps light its own face: the brow, the lips and
// a grin that runs from cheek to cheek, full of needle teeth.

const BACK = 0x5c428c;
const BELLY = 0x2c1e44;
const FIN = 0x45365e;
const LAMP = 0xffd27a;
const BRASS = 0xc89a52;

const F: Frame = {
  top: (t) => 0.27 * env(t, 0.42, 0.42, 0.62, 0.08) + 0.02 * bump(t, 0.2, 0.1),
  bot: (t) => 0.27 * env(t, 0.38, 0.4, 0.62, 0.07) + 0.03 * bump(t, 0.12, 0.08),
  half: (t) => 0.22 * env(t, 0.38, 0.42, 0.75, 0.07),
};
const EYE_T = 0.2;
const EYE_A = -0.62;
/** The grin: from a corner far back on the cheek round the front of the face. */
const GRIN_T = 0.3;
const GRIN_A = 0.12;

function paint(p: PaintCtx): void {
  const { g, rng, flanks, ink } = p;
  const R = Array.from({ length: 400 }, () => rng());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  flanks((P) => {
    ri = 0;
    g.save();
    if (p.glow) {
      // The chandelier's light from above: a soft warm gradient over the top of the head and down the front of the face
      // to the upper lip of the grin, fading down the face and back over the crown.
      // Drawn on a scratch canvas: a gradient down the face (across u), masked by one fading back along the body (v).
      const c2 = document.createElement('canvas');
      c2.width = p.W;
      c2.height = p.H;
      const g2 = c2.getContext('2d')!;
      const [x0, y0] = P(0.25, 0);
      const [x1, y1] = P(-0.13, 0.42);
      const across = g2.createLinearGradient(x0, 0, x1, 0);
      across.addColorStop(0, ink(0xffd080, 0.34));
      across.addColorStop(0.6, ink(0xffd080, 0.2));
      across.addColorStop(1, ink(0xffd080, 0));
      g2.fillStyle = across;
      g2.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g2.globalCompositeOperation = 'destination-in';
      const along = g2.createLinearGradient(0, y0, 0, y1);
      along.addColorStop(0, 'rgba(0,0,0,1)');
      along.addColorStop(0.25, 'rgba(0,0,0,0.85)');
      along.addColorStop(1, 'rgba(0,0,0,0)');
      g2.fillStyle = along;
      g2.fillRect(0, 0, p.W, p.H);
      g.drawImage(c2, 0, 0);
      g.filter = 'none';
      // Small violet lights down the flank.
      for (let i = 0; i < 9; i++) {
        const [x, y] = P(-0.08, 0.36 + i * 0.055);
        g.fillStyle = ink(0xc8a0ff, 0.8);
        g.beginPath();
        g.ellipse(x, y, 2.2, 1.8, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      return;
    }
    // Dark bars across the back and flanks.
    g.filter = 'blur(2.5px)';
    for (let i = 0; i < 7; i++) {
      const v = 0.3 + i * 0.088;
      const [x0, y0] = P(0.25, v);
      const [x1] = P(-0.16, v);
      g.fillStyle = ink(0x140a22, 0.85);
      g.fillRect(Math.min(x0, x1), y0 - 7, Math.abs(x1 - x0), 14);
    }
    // Warty angler skin: little dark-ringed lumps with a pale cap, all over.
    g.filter = 'none';
    for (let i = 0; i < 150; i++) {
      const [x, y] = P(-0.2 + r() * 0.45, 0.08 + r() * 0.88);
      const rr = 1.2 + r() * 2.4;
      g.fillStyle = ink(0x140c20, 0.28);
      g.beginPath();
      g.ellipse(x, y, rr * 1.3, rr, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = ink(0x7a62a0, 0.3);
      g.beginPath();
      g.ellipse(x - rr * 0.2, y - rr * 0.25, rr * 0.7, rr * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

/** The grin's path round the face, corner to corner, `a` below the side line at its corners, `lift` off the skin. */
function grinPath(dy: number, lift = 1.0): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    const side = k < 0.5 ? -1 : 1;
    const u = Math.abs(k - 0.5) * 2;
    // Along the cheek back to the corner, curling up at the end into a smile.
    const t = lerp(0.06, GRIN_T, u ** 1.2);
    // At the front the two halves meet under the snout, so the grin is one closed curve.
    const a = GRIN_A + (1.4 - GRIN_A) * (1 - u) ** 2 - 0.35 * u ** 6;
    pts.push(surf(F, t, a, side, lift).add(V(0, dy, 0)));
  }
  return pts;
}

function face(c: LegendCtx): { flesh: THREE.BufferGeometry; teeth: THREE.BufferGeometry; eyes: THREE.BufferGeometry } {
  const back = c.shiny ? c.L.back : BACK;
  const flesh: THREE.BufferGeometry[] = [];
  const teeth: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];
  const rng = seeded('chandelier:teeth');
  // The mouth: a dark gape between two lips, the lower one jutting.
  const mouth = grinPath(-0.012, 0.975);
  flesh.push(tint(tube(mouth, (s) => 0.008 + 0.014 * Math.sin(s * Math.PI) ** 0.7, 7, 60), 0x14081c));
  flesh.push(tint(tube(grinPath(0.01, 1.01), (s) => 0.006 + 0.008 * Math.sin(s * Math.PI) ** 0.5, 6, 60), mix(back, 0xe0a860, 0.55)));
  flesh.push(tint(tube(grinPath(-0.036, 1.03), (s) => 0.008 + 0.012 * Math.sin(s * Math.PI) ** 0.5, 6, 60), mix(back, 0x9a7088, 0.32)));
  // Needle teeth all along it, up from the lower lip and down from the upper, crooked and of every length.
  const curve = new THREE.CatmullRomCurve3(mouth);
  const N = 30;
  for (let i = 1; i < N; i++) {
    const s = i / N;
    const q = curve.getPoint(s);
    const mid = Math.sin(s * Math.PI);
    const len = (0.018 + 0.03 * mid) * (0.6 + rng() * 0.6);
    const up = i % 2 === 0;
    const base = q.clone().add(V(0, up ? -0.02 * mid - 0.004 : 0.016 * mid + 0.004, 0));
    const dir = V((rng() - 0.5) * 0.3, up ? 1 : -1, (rng() - 0.5) * 0.3 - 0.15);
    const cone = new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0).deleteAttribute('uv');
    const qd = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.normalize());
    teeth.push(tint(cone.scale(0.0045, len, 0.0045).applyQuaternion(qd).translate(base.x, base.y, base.z), 0xfff6e8));
  }
  for (const s of [-1, 1]) {
    const p = surf(F, EYE_T, EYE_A, s, 0.93);
    const out = surfNormal(F, EYE_T, EYE_A, s);
    const e = { p, out, r: 0.04, white: 0xfff0d8, iris: c.shiny ? 0xffe060 : LAMP, irisR: 0.84, pupil: 0x140a10, pupilR: 0.36, look: V(0, 0.2, -0.3) };
    eyes.push(eyeGeo(e));
    flesh.push(lidGeo(e, 0.08, 0.3, mix(back, 0x8a6aa0, 0.3), 1.14));
  }
  return { flesh: fuse(flesh), teeth: fuse(teeth), eyes: fuse(eyes) };
}

/** The rod and its chandelier: crown, stem, two tiers of curling arms, five cups, crystal drops. */
function chandelierParts(): { brass: THREE.BufferGeometry; crystal: THREE.BufferGeometry; lamps: THREE.Vector3[]; rod: THREE.BufferGeometry } {
  const brass: THREE.BufferGeometry[] = [];
  const crystal: THREE.BufferGeometry[] = [];
  const lamps: THREE.Vector3[] = [];
  // The rod: from the brow, up and forward over the face.
  const base = surf(F, 0.16, -1.57, 1, 0.98);
  const rodPts = [base, base.clone().add(V(0, 0.1, 0.0)), base.clone().add(V(0, 0.17, -0.1)), base.clone().add(V(0, 0.18, -0.24)), base.clone().add(V(0, 0.14, -0.31))];
  const rod = tint(tube(rodPts, (s) => 0.012 * (1 - s * 0.5), 6, 30), mix(BACK, BRASS, 0.35), BRASS, base.y, base.y + 0.18);
  const top = rodPts[4];
  // The stem hanging from the rod's end, with a crown at the top and a finial at the bottom.
  const stemTop = top.clone().add(V(0, -0.01, 0));
  const stemBot = stemTop.clone().add(V(0, -0.11, 0));
  brass.push(tint(tube([stemTop, stemBot], 0.006, 6), BRASS));
  brass.push(tint(put(new THREE.TorusGeometry(0.022, 0.004, 4, 12).rotateX(Math.PI / 2).deleteAttribute('uv'), stemTop.clone().add(V(0, -0.012, 0))), BRASS));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    brass.push(tint(put(new THREE.ConeGeometry(0.005, 0.02, 4).translate(0, 0.01, 0).deleteAttribute('uv'), stemTop.clone().add(V(Math.cos(a) * 0.022, -0.012, Math.sin(a) * 0.022))), 0xe0b868));
  }
  brass.push(tint(put(new THREE.SphereGeometry(0.012, 8, 6).deleteAttribute('uv'), stemBot), BRASS));
  crystal.push(put(new THREE.OctahedronGeometry(0.012, 0).deleteAttribute('uv'), stemBot.clone().add(V(0, -0.022, 0)), [0, 0, 0], [0.7, 1.4, 0.7]));
  // Two tiers of arms: two up top, three below, curling out then up into cups.
  const tiers: [number, number, number, number][] = [[-0.035, 2, 0.06, 0], [-0.085, 3, 0.085, 0.4]];
  for (const [dy, n, reach, off] of tiers) {
    const hub = stemTop.clone().add(V(0, dy, 0));
    brass.push(tint(put(new THREE.SphereGeometry(0.009, 8, 6).deleteAttribute('uv'), hub), BRASS));
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2 + (n === 3 ? Math.PI / 2 : 0);
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const arm = [hub, hub.clone().add(V(dx * reach * 0.45, -0.025, dz * reach * 0.45)), hub.clone().add(V(dx * reach * 0.9, -0.012, dz * reach * 0.9)), hub.clone().add(V(dx * reach, 0.02, dz * reach))];
      brass.push(tint(tube(arm, 0.0045, 5, 16), BRASS, 0xe8c070, hub.y - 0.03, hub.y + 0.02));
      const cupAt = arm[3].clone().add(V(0, 0.006, 0));
      brass.push(tint(put(new THREE.CylinderGeometry(0.016, 0.006, 0.014, 8, 1, true).deleteAttribute('uv'), cupAt), 0xe0b868));
      lamps.push(cupAt.clone().add(V(0, 0.016, 0)));
      // A crystal drop under each arm's lowest bend.
      const dropAt = arm[1].clone().add(V(0, -0.018, 0));
      brass.push(tint(tube([arm[1], dropAt], 0.0012, 3), BRASS));
      crystal.push(put(new THREE.OctahedronGeometry(0.009, 0).deleteAttribute('uv'), dropAt.clone().add(V(0, -0.009, 0)), [0, 0, 0], [0.7, 1.5, 0.7]));
    }
  }
  // The chandelier is drawn round its stem's top and scaled up a little, so it reads at a glance.
  const k = 1.35;
  const grow = (g: THREE.BufferGeometry) => g.translate(-stemTop.x, -stemTop.y, -stemTop.z).scale(k, k, k).translate(stemTop.x, stemTop.y, stemTop.z);
  for (const q of lamps) q.sub(stemTop).multiplyScalar(k).add(stemTop);
  return { brass: grow(fuse(brass)), crystal: grow(fuse(crystal)), lamps, rod };
}

function fins(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const c0 = 0x140b20;
  const c1 = mix(FIN, 0x6a4a90, 0.2);
  const rng = seeded('chandelier:fins');
  const parts: THREE.BufferGeometry[] = [];
  // A dark, ragged pectoral.
  const ragP = Array.from({ length: 13 }, (_, i) => (i % 2 ? 0.72 + rng() * 0.15 : 0.9 + rng() * 0.1));
  const pec = finFan(12, () => [0, 0], (k) => {
    const a = -1.1 + k * 1.5;
    const len = 0.14 * (0.7 + 0.3 * Math.sin(k * Math.PI)) * ragP[Math.round(k * 12)];
    return [Math.cos(a) * len, Math.sin(a) * len];
  }, c0, c1, 0.015);
  for (const sx of [-1, 1]) parts.push(put(pec, surf(F, 0.48, 0.35, sx, 0.97), [0, sx * 0.6, sx * 0.3]));
  // A small soft dorsal and anal fin near the tail.
  for (const sgn of [1, -1]) {
    parts.push(finFan(8, (k) => {
      const t = 0.66 + k * 0.16;
      return [-0.5 + t, sgn * (sgn > 0 ? F.top(t) : F.bot(t)) * 0.9];
    }, (k) => {
      const t = 0.66 + k * 0.16;
      return [-0.5 + t + 0.04, sgn * ((sgn > 0 ? F.top(t) : F.bot(t)) * 0.9 + 0.07 * Math.sin((0.15 + k * 0.85) * Math.PI) ** 0.6)];
    }, c0, c1, 0));
  }
  const tail = finFan(14, (k) => [0, (k - 0.5) * 0.06], (k) => {
    const a = (k - 0.5) * 2;
    const len = 0.2 * (0.85 + 0.15 * Math.cos(a * 1.4));
    return [Math.cos(a) * len, Math.sin(a) * len * 1.2];
  }, c0, c1, 0.012);
  return { body: fuse(parts), tail };
}

/** Warts all over its hide, and a few fine skin filaments trailing from the chin, cheeks and back. */
function warts(back: number): THREE.BufferGeometry {
  const rng = seeded('chandelier:warts');
  const out: THREE.BufferGeometry[] = [];
  // A plain icosahedron shaded smooth as a ball: at a wart's size it reads as round as a finer one.
  const lump = new THREE.IcosahedronGeometry(1, 0).deleteAttribute('uv');
  lump.setAttribute('normal', lump.attributes.position.clone());
  for (let i = 0; i < 130; i++) {
    const t = 0.12 + rng() * 0.72;
    const a = -1.5 + rng() * 2.9;
    const s = rng() < 0.5 ? -1 : 1;
    if (Math.abs(t - EYE_T) < 0.07 && Math.abs(a - EYE_A) < 0.35) continue;
    if (t < GRIN_T + 0.04 && a > -0.15 && a < 1.0) continue;
    const sz = 0.006 + rng() * 0.007;
    out.push(tint(aim(lump, surf(F, t, a, s, 0.985), surfNormal(F, t, a, s), [sz, sz * 0.6, sz], rng() * 3), mix(back, 0x140c20, 0.25), mix(back, 0x6a52a0, 0.25), -sz, sz));
  }
  for (const [t, a, s, len] of [[0.06, 1.2, -1, 0.09], [0.08, 1.35, 1, 0.07], [0.12, 1.1, -1, 0.06], [0.22, 0.75, -1, 0.07], [0.24, 0.8, 1, 0.06], [0.3, -1.4, -1, 0.08], [0.42, -1.5, 1, 0.07], [0.55, -1.3, -1, 0.06], [0.5, 1.2, -1, 0.06]] as [number, number, number, number][]) {
    const p = surf(F, t, a, s, 0.99);
    const n = surfNormal(F, t, a, s);
    const pts = [p, p.clone().addScaledVector(n, len * 0.4).add(V(0, -len * 0.1, len * 0.15)), p.clone().addScaledVector(n, len * 0.7).add(V(0, -len * 0.35, len * 0.4)), p.clone().addScaledVector(n, len * 0.8).add(V(0, -len * 0.6, len * 0.6))];
    out.push(tint(tube(pts, (q) => 0.0025 * (1 - q * 0.6), 4, 10), mix(back, 0x4a3a60, 0.4), 0x8a70b0, Math.min(p.y, pts[3].y), Math.max(p.y, pts[3].y)));
    out.push(tint(put(new THREE.SphereGeometry(0.004, 6, 4).deleteAttribute('uv'), pts[3]), 0xd8c4f0));
  }
  return fuse(out);
}

let finMemo: ReturnType<typeof fins> | null = null;
const finParts = () => (finMemo ??= fins());
let chMemo: ReturnType<typeof chandelierParts> | null = null;
const ch = () => (chMemo ??= chandelierParts());

function build(c: LegendCtx): void {
  const key = `chandelier:${c.shiny ? 'gold' : 'plain'}`;
  const f = cached('chandelier:fins', () => finParts().body);
  const tail = cached('chandelier:tail', () => finParts().tail);
  const rod = cached('chandelier:rod', () => ch().rod);
  const brass = cached('chandelier:brass', () => ch().brass);
  if (c.shadow) {
    for (const g of [f, rod, brass]) add(c, g, c.finMat);
    add(c, tail, c.finMat, c.tail);
    return;
  }
  const bm = c.bodyMat as THREE.MeshPhysicalMaterial;
  // Lumpy, leathery angler skin: little gloss.
  bm.roughness = c.shiny ? 0.35 : 0.8;
  bm.clearcoat = 0;
  bm.sheen = 0.3;
  bm.sheenColor = new THREE.Color(0x6a4a90);
  bm.emissiveIntensity = 1.4;
  add(c, f, c.shiny ? c.finMat : MAT.fin(c.light));
  add(c, tail, c.shiny ? c.finMat : MAT.fin(c.light), c.tail);
  const brassMat = mat(`chandelier:brass|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, emissive: 0x3a2408 }), c.light));
  add(c, rod, brassMat);
  add(c, brass, brassMat);
  add(c, cached('chandelier:crystal', () => ch().crystal), mat(`chandelier:crystal|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: 0.1, metalness: 0.2, emissive: 0x806040, flatShading: true, transparent: true, opacity: 0.9 }), c.light)));
  add(c, cached(`${key}:warts`, () => warts(c.shiny ? c.L.back : BACK)), mat(`chandelier:wart|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), c.light)));
  const fc = face(c);
  add(c, cached(`${key}:flesh`, () => fc.flesh), MAT.flesh(c.light));
  // The teeth catch the lamplight.
  add(c, cached('chandelier:teeth', () => fc.teeth), mat(`chandelier:tooth|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0x6a4818 }), c.light)));
  add(c, cached(`${key}:eyes`, () => fc.eyes), MAT.flatPaint());
  // Exactly five lamps: a bright core in each cup, a warm halo round it.
  const lampGeo = cached('chandelier:lamp', () => new THREE.SphereGeometry(0.016, 10, 8));
  const lampMat = mat(`chandelier:lamp${c.shiny}`, () => new THREE.MeshBasicMaterial({ color: c.shiny ? 0xfff2b0 : 0xffe6a8 }));
  for (const q of ch().lamps) {
    const m = new THREE.Mesh(lampGeo, lampMat);
    m.position.copy(q);
    c.root.add(m);
    glowSprite(c, c.shiny ? 0xffe890 : LAMP, 0.16, 0.9, q);
  }
  // One broad soft pool of lamplight hanging over its face.
  glowSprite(c, LAMP, 0.45, 0.14, V(0, 0.24, -0.62));
  glint(c, ch().lamps[0].clone().add(V(0, 0.02, 0)), 0.05, 0xfff0c8, 0.9);
  // Lost tackle: a hook in the lower lip with its line, a spoon in the corner of the grin.
  addTackle(c, [
    { kind: 'hook', p: surf(F, 0.05, 0.62, -1, 1.03), dir: V(-0.3, -0.8, 0.4), twist: 1.2, size: 0.05, glint: true, line: { len: 0.3, drift: V(-0.2, -0.5, 1) } },
    { kind: 'spoon', p: surf(F, 0.24, 0.2, -1, 1.04), dir: V(-0.4, -1, 0.3), twist: 0.6, size: 0.05, glint: true, line: { len: 0.08, drift: V(-0.2, -0.6, 1) } },
    { kind: 'hook', p: surf(F, 0.08, 0.66, 1, 1.03), dir: V(0.3, -0.8, 0.3), twist: 2.2, size: 0.04 },
  ]);
}

export const chandelier: Legend = {
  // A near-black angler: at sea's light the body read as a black silhouette by day without this.
  light: 3.0,
  look: { back: BACK, belly: BELLY, fin: FIN, accent: LAMP, marks: [], extras: [] },
  body: () => cached('chandelier:body', () => bodyGeo(F, 44, 32)),
  paint,
  glow: true,
  build,
};
