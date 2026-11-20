import * as THREE from 'three';
import { addTackle } from '../tackle';
import { MAT, V, add, blade, bodyGeo, bump, cached, env, eyeGeo, finFan, fuse, lerp, lidGeo, lit, mat, mix, put, seeded, smooth, surf, surfNormal, sweep, tint, tube, type Frame, type Legend, type LegendCtx, type PaintCtx } from './kit';

// Old Kelpbeard, Kelp Deep's legend: the forest grew up around him. A huge, heavy old head; a long beard and a tall
// crown of real kelp blades rooted in holdfasts on his chin and brow, with gas bladders where they float; little fish
// sheltering in the beard; glowing motes of kelp-light drifting round him; lost tackle tangled in the beard.

const BACK = 0x467a36;
const BELLY = 0xdcc98c;
const FIN = 0x74b04c;
const MOTE = 0xd4f47a;

/** Blunt and round at the head, full through the middle, narrowing late to `root` of its depth at the tail. */
const mass = (t: number, root: number) => Math.sin(Math.min(1, t / 0.34) * Math.PI * 0.5) ** 0.35 * (1 - (1 - root) * smooth(t, 0.5, 0.97)) * (1 - 0.5 * smooth(t, 0.95, 1));
const F: Frame = {
  // A great old head, wider and deeper than the body behind it.
  // A deep, heavy old body: a high rounded back, the depth carried well past the middle, then a thick tail root.
  top: (t) => 0.25 * mass(t, 0.26) + 0.03 * bump(t, 0.36, 0.15),
  bot: (t) => 0.23 * mass(t, 0.28) + 0.03 * bump(t, 0.15, 0.1),
  half: (t) => 0.13 * mass(t, 0.36) + 0.03 * bump(t, 0.16, 0.09),
};
const EYE_T = 0.15;
const EYE_A = -0.5;
const MOUTH_T = 0.12;
const MOUTH_A = 0.45;

function paint(p: PaintCtx): void {
  const { g, rng, flanks, ink } = p;
  const R = Array.from({ length: 800 }, () => rng());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  if (p.glow) {
    // Kelp-light caught in his scales: a soft scatter of lime glints along the back and the side line.
    flanks((P) => {
      ri = 0;
      g.save();
      g.filter = 'blur(1.5px)';
      for (let i = 0; i < 40; i++) {
        const [x, y] = P(-0.02 + r() * 0.24, 0.2 + r() * 0.7);
        g.fillStyle = ink(MOTE, 0.25 + r() * 0.3);
        g.beginPath();
        g.ellipse(x, y, 1.5 + r() * 1.5, 1.2 + r(), 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    });
    return;
  }
  flanks((P) => {
    ri = 0;
    g.save();
    // Big old scales, each a soft pale crescent.
    g.lineWidth = 1.6;
    g.lineCap = 'round';
    for (let row = 0; row < 15; row++) {
      for (let col = 0; col < 26; col++) {
        const d = -0.17 + row * 0.027;
        const v = 0.22 + col * 0.028 + (row % 2) * 0.014;
        if (v > 0.92) continue;
        const [x, y] = P(d, v);
        g.strokeStyle = ink(0xe8e0a0, 0.14 + 0.1 * Math.max(0, 1 - Math.abs(d - 0.02) * 5));
        g.beginPath();
        g.arc(x, y - 2, 5.5, 0.15 * Math.PI, 0.85 * Math.PI);
        g.stroke();
      }
    }
    // Moss and algae over the back: soft dark-green drifts, and some golden-brown.
    g.filter = 'blur(3px)';
    for (let i = 0; i < 44; i++) {
      const [x, y] = P(0.02 + r() * 0.24, 0.1 + r() * 0.8);
      g.fillStyle = ink(r() < 0.7 ? 0x2a5422 : 0x5a7a2a, 0.2 + r() * 0.16);
      g.beginPath();
      g.ellipse(x, y, 5 + r() * 12, 3 + r() * 6, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // Pale lichen on the cheek and gill cover.
    for (let i = 0; i < 16; i++) {
      const [x, y] = P(-0.08 + r() * 0.2, 0.08 + r() * 0.24);
      g.fillStyle = ink(0xe4dca8, 0.16 + r() * 0.14);
      g.beginPath();
      g.ellipse(x, y, 3 + r() * 6, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.filter = 'none';
    // The gill cover and the old creases round his eye and mouth.
    g.strokeStyle = ink(0x22401c, 0.45);
    g.lineWidth = 2.4;
    g.beginPath();
    {
      const [ax, ay] = P(0.17, 0.25);
      const [bx, by] = P(0.0, 0.32);
      const [cx, cy] = P(-0.16, 0.24);
      g.moveTo(ax, ay);
      g.quadraticCurveTo(bx, by, cx, cy);
    }
    g.stroke();
    const arc = (d0: number, v0: number, d1: number, v1: number, bend: number, w = 1.4) => {
      const [x0, y0] = P(d0, v0);
      const [x1, y1] = P(d1, v1);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + bend * (y1 - y0), (y0 + y1) / 2 - bend * (x1 - x0), x1, y1);
      g.stroke();
    };
    const ed = -EYE_A / (Math.PI * 2);
    arc(ed - 0.016, EYE_T - 0.05, ed - 0.036, EYE_T + 0.04, -0.5, 1.6);
    arc(ed + 0.03, EYE_T + 0.06, ed - 0.012, EYE_T + 0.085, 0.3, 1.2);
    const md = -MOUTH_A / (Math.PI * 2);
    arc(md + 0.01, MOUTH_T + 0.004, md - 0.05, MOUTH_T + 0.05, 0.25, 1.6);
    g.restore();
  });
}

function ragged(seed: string, n: number, depth = 0.3): number[] {
  const rng = seeded(seed);
  return Array.from({ length: n + 1 }, (_, i) => 1 - (i % 2 ? 0.05 : 0) - (rng() < 0.3 ? depth * (0.5 + rng() * 0.5) : rng() * 0.08));
}

function fins(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const c0 = mix(BACK, 0x1c3418, 0.3);
  const c1 = mix(FIN, 0xb8d860, 0.25);
  const parts: THREE.BufferGeometry[] = [];
  const N = 26;
  const rag = ragged('kelpbeard:dorsal', N, 0.35);
  parts.push(finFan(N, (k) => {
    const t = 0.34 + k * 0.5;
    return [-0.5 + t, F.top(t) * 0.9];
  }, (k) => {
    const t = 0.34 + k * 0.5;
    const i = Math.round(k * N);
    const h = k < 0.5 ? (i % 2 ? 0.07 : 0.12) * (0.8 + 0.4 * Math.sin(k * Math.PI)) : 0.13 * Math.sin(Math.min(1, (k - 0.48) / 0.52 + 0.12) * Math.PI) ** 0.7 * rag[i];
    return [-0.5 + t + 0.03 + k * 0.05, F.top(t) * 0.9 + h];
  }, c0, c1, 0.012));
  const ragA = ragged('kelpbeard:anal', 10, 0.3);
  parts.push(finFan(10, (k) => {
    const t = 0.62 + k * 0.2;
    return [-0.5 + t, -F.bot(t) * 0.9];
  }, (k) => {
    const t = 0.62 + k * 0.2;
    return [-0.5 + t + 0.05 + k * 0.03, -F.bot(t) * 0.9 - 0.1 * Math.sin((0.15 + k * 0.85) * Math.PI) ** 0.6 * ragA[Math.round(k * 10)]];
  }, c0, c1, 0.01));
  const ragP = ragged('kelpbeard:pec', 12, 0.25);
  const pec = finFan(12, () => [0, 0], (k) => {
    const a = -1.25 + k * 1.75;
    const len = 0.19 * (0.72 + 0.28 * Math.sin(k * Math.PI)) * ragP[Math.round(k * 12)];
    return [Math.cos(a) * len, Math.sin(a) * len];
  }, c0, c1, 0.02);
  for (const sx of [-1, 1]) parts.push(put(pec, surf(F, 0.3, 0.4, sx, 0.98), [0, sx * 0.62, sx * 0.25]));
  const NT = 16;
  const ragT = ragged('kelpbeard:tail', NT, 0.3);
  const tail = finFan(NT, (k) => [0.0, (k - 0.5) * 0.08], (k) => {
    const a = (k - 0.5) * 2.1;
    const len = 0.2 * (0.85 + 0.15 * Math.cos(a * 1.4)) * ragT[Math.round(k * NT)];
    return [Math.cos(a) * len, Math.sin(a) * len * 1.05];
  }, c0, c1, 0.014);
  return { body: fuse(parts), tail };
}

const KELP = [[0x3e6a22, 0x8cc848], [0x5a6a1e, 0xb8b848], [0x2e5a24, 0x74b044]] as const;

/** The kelp: his beard and his crown, each blade rooted in a knotted holdfast, some with a gas bladder at the base. */
function kelp(): { blades: THREE.BufferGeometry; roots: THREE.BufferGeometry } {
  const rng = seeded('kelpbeard:kelp');
  const blades: THREE.BufferGeometry[] = [];
  const roots: THREE.BufferGeometry[] = [];
  const holdfast = (p: THREE.Vector3, n: THREE.Vector3, size: number) => {
    // A knot of root fingers gripping the skin.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng();
      const d = n.clone().multiplyScalar(-0.6).add(V(Math.cos(a), 0.2 * (rng() - 0.5), Math.sin(a))).normalize();
      const q = p.clone().addScaledVector(n, size * 0.5);
      roots.push(tint(tube([q, q.clone().addScaledVector(d, size * 0.8).addScaledVector(n, size * 0.2), q.clone().addScaledVector(d, size * 1.4).addScaledVector(n, -size * 0.4)], (s) => size * 0.28 * (1 - s * 0.6), 4), 0x5a5426, 0x7a6a30));
    }
    roots.push(tint(put(new THREE.IcosahedronGeometry(size * 0.55, 0).deleteAttribute('uv'), p.clone().addScaledVector(n, size * 0.45)), 0x6a6228));
  };
  const one = (root: THREE.Vector3, dir: THREE.Vector3, bend: THREE.Vector3, len: number, wid: number, across: THREE.Vector3, bladder: boolean) => {
    const [c0, c1] = KELP[Math.floor(rng() * KELP.length)];
    const path = sweep(root, dir, bend, len, 9, 0.02, rng() * 6, V(1, 0, 0.3).normalize());
    blades.push(blade(path, (s) => wid * (0.35 + 0.65 * Math.sin(Math.min(1, s * 1.15) * Math.PI) ** 0.5) * (1 - 0.25 * s) + 0.003, across, c0, c1, 0.16, 2 + rng() * 1.5, rng() * 6));
    if (bladder) roots.push(tint(put(new THREE.SphereGeometry(1, 7, 5).deleteAttribute('uv'), path[1], [0, 0, 0], [wid * 0.55, wid * 0.75, wid * 0.55]), 0x9a8a30, 0xc8b048, -wid, wid));
  };
  // The beard: from the chin and the throat, long blades hanging and streaming back.
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    const s = i % 2 ? 1 : -1;
    const t = 0.03 + u * 0.16 + (rng() - 0.5) * 0.02;
    const a = 0.75 + rng() * 0.8;
    const p = surf(F, t, a, s, 0.97);
    const n = surfNormal(F, t, a, s);
    if (i % 3 === 0) holdfast(p, n, 0.014);
    const len = 0.28 + 0.26 * Math.sin(Math.min(1, u * 1.3 + 0.1) * Math.PI) + rng() * 0.08;
    // Each blade is bent back toward his tail, so the beard streams behind him and hangs down when he is landed nose-up.
    one(p, V(s * 0.1 * rng(), -0.85, 0.45 + u * 0.3), V(0, 0.14, 1.05 + rng() * 0.3), len, 0.024 + rng() * 0.01, V(s * 0.35, 0, 1), i % 4 === 1);
  }
  // The crown: from the brow and the top of the head, rising tall and sweeping back over his shoulders.
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    const s = i % 2 ? 1 : -1;
    const t = 0.08 + u * 0.3 + (rng() - 0.5) * 0.02;
    const a = -1.57 + s * (0.1 + rng() * 0.5);
    const p = surf(F, t, a, s, 0.97);
    const n = surfNormal(F, t, a, s);
    if (i % 2 === 0) holdfast(p, n, 0.016);
    const len = 0.26 + 0.2 * Math.sin(Math.min(1, 0.3 + u) * Math.PI) + rng() * 0.08;
    one(p, n.clone().multiplyScalar(0.6).add(V(0, 0.95, 0.4)), V(s * 0.14, -0.32, 1.15 + rng() * 0.4), len * (1.05 - u * 0.25), 0.026 + rng() * 0.008, V(s * 0.3, 0, 1), i % 3 === 0);
  }
  return { blades: fuse(blades), roots: fuse(roots) };
}

/** Three small fish sheltering in his beard, painted bright like reef fish. */
function lodgers(): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [];
  for (const [p, yaw, c, stripe] of [
    [V(-0.075, -0.27, -0.28), 0.25, 0xffc23a, 0x2a4ab0], [V(-0.07, -0.41, -0.1), -0.5, 0xff7a3a, 0xfff2d8], [V(0.075, -0.35, -0.18), -2.7, 0x5ab0ff, 0xffe04a],
  ] as [THREE.Vector3, number, number, number][]) {
    const fish: THREE.BufferGeometry[] = [];
    fish.push(tint(new THREE.SphereGeometry(1, 10, 7).deleteAttribute('uv').scale(0.008, 0.012, 0.022), c));
    fish.push(tint(new THREE.SphereGeometry(1, 8, 5).deleteAttribute('uv').scale(0.0085, 0.0125, 0.004).translate(0, 0, 0.002), stripe));
    fish.push(tint(new THREE.ConeGeometry(0.011, 0.016, 4).deleteAttribute('uv').rotateX(-Math.PI / 2).scale(0.3, 1, 1).translate(0, 0, 0.026), c));
    for (const sx of [-1, 1]) fish.push(tint(new THREE.SphereGeometry(0.0028, 5, 4).deleteAttribute('uv').translate(sx * 0.0065, 0.003, -0.012), 0x111111));
    out.push(...fish.map((g) => put(g, p, [0, yaw, 0], 2.6)));
  }
  return fuse(out);
}

function mouthPath(a: number, yFront: number, fwd: number): THREE.Vector3[] {
  const corner = surf(F, MOUTH_T, a, 1, 1);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 14; i++) {
    const phi = lerp(-Math.PI / 2, Math.PI / 2, i / 14);
    const k = Math.cos(phi);
    pts.push(V(corner.x * Math.sin(phi), lerp(corner.y, yFront, k ** 0.75), -0.5 + MOUTH_T - (MOUTH_T + fwd) * k));
  }
  return pts;
}

function face(c: LegendCtx): { eyes: THREE.BufferGeometry; flesh: THREE.BufferGeometry } {
  const back = c.shiny ? c.L.back : BACK;
  const belly = c.shiny ? c.L.belly : BELLY;
  const eyes: THREE.BufferGeometry[] = [];
  const flesh: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const p = surf(F, EYE_T, EYE_A, s, 0.9);
    const out = surfNormal(F, EYE_T, EYE_A, s);
    const e = { p, out, r: 0.04, white: 0xf2efd8, iris: 0xb8c040, irisR: 0.82, pupilR: 0.44, look: V(0, -0.05, -0.3) };
    eyes.push(eyeGeo(e));
    flesh.push(lidGeo(e, 0.5, -0.05, mix(back, belly, 0.2), 1.15));
    flesh.push(tint(put(new THREE.SphereGeometry(1, 10, 6).deleteAttribute('uv'), p.clone().add(V(s * 0.004, 0.04, 0.006)), [-0.2, 0, s * 0.35], [0.034, 0.017, 0.06]), mix(back, belly, 0.08)));
  }
  const lip = mix(back, belly, 0.35);
  flesh.push(tint(tube(mouthPath(MOUTH_A - 0.12, -0.02, -0.004), (s) => 0.008 + 0.014 * Math.sin(s * Math.PI) ** 0.5, 9, 40), lip));
  flesh.push(tint(tube(mouthPath(MOUTH_A + 0.12, -0.058, 0.004), (s) => 0.009 + 0.016 * Math.sin(s * Math.PI) ** 0.5, 9, 40), mix(belly, back, 0.45)));
  flesh.push(tint(tube(mouthPath(MOUTH_A, -0.04, -0.008), (s) => 0.004 + 0.008 * Math.sin(s * Math.PI), 6, 30), 0x1e2414));
  return { eyes: fuse(eyes), flesh: fuse(flesh) };
}

let finMemo: ReturnType<typeof fins> | null = null;
const finParts = () => (finMemo ??= fins());
let kelpMemo: ReturnType<typeof kelp> | null = null;
const kelpParts = () => (kelpMemo ??= kelp());

function build(c: LegendCtx): void {
  const key = `kelpbeard:${c.shiny ? 'gold' : 'plain'}`;
  const f = cached('kelpbeard:fins', () => finParts().body);
  const tail = cached('kelpbeard:tail', () => finParts().tail);
  const blades = cached('kelpbeard:blades', () => kelpParts().blades);
  const roots = cached('kelpbeard:roots', () => kelpParts().roots);
  if (c.shadow) {
    add(c, f, c.finMat);
    add(c, tail, c.finMat, c.tail);
    add(c, blades, c.finMat);
    return;
  }
  const bm = c.bodyMat as THREE.MeshPhysicalMaterial;
  // Kelp Deep's gloss, softened: he is wet and old.
  bm.roughness = c.shiny ? 0.3 : 0.55;
  bm.clearcoat = 0.3;
  bm.clearcoatRoughness = 0.3;
  bm.emissiveIntensity = 1.3;
  const finMat = MAT.fin(c.light);
  add(c, f, c.shiny ? c.finMat : finMat);
  add(c, tail, c.shiny ? c.finMat : finMat, c.tail);
  add(c, blades, c.shiny ? mat(`kelpbeard:goldleaf|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffe080, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide, emissive: 0x2a2408 }), c.light)) : MAT.kelp(c.light));
  add(c, roots, MAT.hard(c.light));
  add(c, cached('kelpbeard:lodgers', lodgers), MAT.flesh(c.light));
  const fc = face(c);
  add(c, cached(`${key}:eyes`, () => fc.eyes), MAT.flatPaint());
  add(c, cached(`${key}:flesh`, () => fc.flesh), mat(`kelpbeard:skin|${c.light}`, () => lit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), c.light)));
  // Motes of kelp-light drifting round him, thickest in the crown and the beard.
  const moteGeo = cached('kelpbeard:mote', () => new THREE.OctahedronGeometry(0.011, 0));
  const moteMat = mat(`kelpbeard:mote${c.shiny}`, () => new THREE.MeshBasicMaterial({ color: c.shiny ? 0xfff0a0 : MOTE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const halo = mat(`kelpbeard:halo${c.shiny}`, () => new THREE.SpriteMaterial({ map: c.glowTexture(), color: c.shiny ? 0xfff0a0 : MOTE, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  const rng = seeded('kelpbeard:motes');
  for (let i = 0; i < 12; i++) {
    const p = i < 5 ? V((rng() - 0.5) * 0.3, 0.25 + rng() * 0.25, -0.4 + rng() * 0.35) : i < 9 ? V((rng() - 0.5) * 0.25, -0.22 - rng() * 0.3, -0.5 + rng() * 0.25) : V((rng() - 0.5) * 0.4, (rng() - 0.5) * 0.5, rng() * 0.4);
    const hold = new THREE.Group();
    hold.position.copy(p);
    hold.add(new THREE.Mesh(moteGeo, moteMat));
    const h = new THREE.Sprite(halo);
    h.scale.setScalar(0.12);
    hold.add(h);
    c.root.add(hold);
    c.twinkle.push(hold);
  }
  // Lost tackle, tangled in his beard: a hook in the lip with its line wound down through the blades, a glass net
  // float caught in the beard on its rope, a spoon snagged on a blade.
  const lipP = surf(F, MOUTH_T - 0.01, MOUTH_A + 0.12, -1, 1.06);
  const tangle = [lipP, V(-0.08, -0.17, -0.38), V(-0.05, -0.27, -0.3), V(-0.09, -0.34, -0.3), V(-0.06, -0.42, -0.2), V(-0.09, -0.48, -0.12)];
  addTackle(c, [
    { kind: 'hook', p: lipP, dir: V(-0.35, -0.7, 0.5), twist: 1.2, size: 0.05, glint: true },
    { kind: 'line', p: lipP, dir: V(0, -1, 0), path: tangle },
    { kind: 'netfloat', p: V(-0.07, -0.3, -0.22), dir: V(0, 1, 0), size: 0.07, glint: true, line: { len: 0.1, drift: V(0, 1, 0.2) } },
    { kind: 'spoon', p: V(0.075, -0.36, -0.24), dir: V(0.3, -1, 0.2), twist: 0.8, size: 0.045, glint: true },
  ]);
}

export const kelpbeard: Legend = {
  // His mossy olive is painted dark; this keeps him green at sea's light.
  light: 1.8,
  look: { back: BACK, belly: BELLY, fin: FIN, marks: [], extras: [] },
  body: () => cached('kelpbeard:body', () => bodyGeo(F, 48, 32)),
  paint,
  glow: true,
  build,
};
