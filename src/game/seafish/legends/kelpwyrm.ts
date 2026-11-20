import * as THREE from 'three';
import { addTackle } from '../tackle';
import { MAT, V, add, blade, bodyGeo, bump, cached, env, eyeGeo, finFan, fuse, lidGeo, mat, mix, put, seeded, shade, smooth, spike, surf, surfNormal, sweep, tint, tube, type Frame, type Legend, type LegendCtx, type PaintCtx } from './kit';

// The Thornback Kelpwyrm, Kelp Deep's other legend: what sailors call a kelp forest, the Kelpwyrm calls its mane.
// A thick wyrm's body in S-curves, a big horned dragon's head with a hanging jaw, a mane of kelp blades down the whole
// back (taller than the body is deep), thorns along its ridge and flanks, and kelp-light in its skin and round it.

const BACK = 0x284f30;
const BELLY = 0xc4d98a;
const FIN = 0x7fc24a;
const BONE = 0xe8dcb4;
const MOTE = 0xd4f47a;

/** The body's S-curves: still at the head, swinging up and down along the body. */
const cy = (t: number) => 0.075 * Math.sin((t - 0.2) * Math.PI * 2 * 1.15) * smooth(t, 0.12, 0.34);
const F: Frame = {
  // A big dragon's head (deep at the brow, a long snout), a neck, then the thick body tapering to the tail.
  top: (t) => 0.072 * env(t, 0.3, 0.3, 0.75, 0.035) + 0.09 * bump(t, 0.1, 0.075) * env(t, 0.08, 0.5, 0.2),
  bot: (t) => 0.07 * env(t, 0.3, 0.3, 0.75, 0.035) + 0.05 * bump(t, 0.1, 0.07) * env(t, 0.08, 0.5, 0.2),
  half: (t) => 0.06 * env(t, 0.28, 0.3, 0.75, 0.03) + 0.06 * bump(t, 0.1, 0.08) * env(t, 0.08, 0.5, 0.2),
  cy,
};
const EYE_T = 0.095;
const EYE_A = -0.6;

function paint(p: PaintCtx): void {
  const { g, rng, flanks, ink } = p;
  const R = Array.from({ length: 600 }, () => rng());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  flanks((P) => {
    ri = 0;
    g.save();
    if (p.glow) {
      // A line of kelp-light glands down the side line, and a few on the back.
      g.filter = 'blur(1.4px)';
      for (let i = 0; i < 34; i++) {
        const [x, y] = P(-0.01 + (i % 3 === 0 ? 0.12 : 0), 0.14 + i * 0.024);
        g.fillStyle = ink(MOTE, 0.55);
        g.beginPath();
        g.ellipse(x, y, 2, 1.6, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      return;
    }
    // Plates along the back, diamond scutes, darker at the seams.
    g.strokeStyle = ink(0x14301a, 0.35);
    g.lineWidth = 1.2;
    for (let row = 0; row < 6; row++) {
      for (let i = 0; i < 40; i++) {
        const d = 0.06 + row * 0.035;
        const v = 0.12 + i * 0.021 + (row % 2) * 0.0105;
        if (v > 0.96) continue;
        const [x, y] = P(d, v);
        g.beginPath();
        g.moveTo(x, y - 3);
        g.lineTo(x + 4, y);
        g.lineTo(x, y + 3);
        g.lineTo(x - 4, y);
        g.closePath();
        g.stroke();
      }
    }
    // A lime stripe down the side line, and kelp-brown mottling over the back.
    const [x0, y0] = P(0.012, 0.1);
    const [x1, y1] = P(-0.012, 0.97);
    g.fillStyle = ink(0x9fcf4a, 0.75);
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    g.filter = 'blur(3px)';
    for (let i = 0; i < 40; i++) {
      const [x, y] = P(0.05 + r() * 0.2, 0.1 + r() * 0.85);
      g.fillStyle = ink(r() < 0.5 ? 0x14301a : 0x5a5a1e, 0.3);
      g.beginPath();
      g.ellipse(x, y, 4 + r() * 9, 3 + r() * 5, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

const KELP = [[0x2e5a24, 0x8cc848], [0x4a6a1e, 0xb8c048], [0x2a5a2c, 0x7ac04a]] as const;

/** The mane: kelp blades down the whole back with thorns between them, rooted in holdfasts. */
function mane(): { blades: THREE.BufferGeometry; thorns: THREE.BufferGeometry } {
  const rng = seeded('kelpwyrm:mane');
  const blades: THREE.BufferGeometry[] = [];
  const thorns: THREE.BufferGeometry[] = [];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const t = 0.13 + u * 0.8;
    const s = i % 2 ? 1 : -1;
    const a = -1.57 + s * (0.12 + rng() * 0.18);
    const p = surf(F, t, a, s, 0.96);
    const nrm = surfNormal(F, t, a, s);
    // Tallest over the shoulders, still taller than the body is deep at the tail.
    const len = (0.16 + 0.16 * Math.sin(Math.min(1, u * 1.4 + 0.15) * Math.PI) ** 0.8) * (0.85 + rng() * 0.3);
    const [c0, c1] = KELP[Math.floor(rng() * KELP.length)];
    const path = sweep(p, nrm.clone().add(V(0, 1.4, 0.25)), V(s * 0.1, -0.25, 0.9), len, 8, 0.015, rng() * 6, V(1, 0, 0));
    blades.push(blade(path, (q) => 0.022 * (0.35 + 0.65 * Math.sin(Math.min(1, q * 1.15) * Math.PI) ** 0.5) + 0.002, V(s * 0.3, 0, 1), c0, c1, 0.16, 2 + rng() * 1.5, rng() * 6));
    // A thorn on the ridge in front of every blade.
    const tp = surf(F, t - 0.016, -1.57, 1, 0.97);
    thorns.push(tint(spike(tp, surfNormal(F, t - 0.016, -1.57, 1).add(V(0, 0, 0.8)), 0.035 + 0.015 * Math.sin(u * Math.PI), 0.009, 5), mix(BONE, 0x8a7a4a, 0.4), BONE, tp.y, tp.y + 0.04));
    if (i % 4 === 0) {
      // A holdfast where some blades root.
      for (let k = 0; k < 4; k++) {
        const d = V(Math.cos(k * 1.6 + i), -0.4, Math.sin(k * 1.6 + i)).normalize();
        thorns.push(tint(tube([p, p.clone().addScaledVector(d, 0.014), p.clone().addScaledVector(d, 0.024).add(V(0, -0.008, 0))], (q) => 0.0045 * (1 - q * 0.5), 4), 0x5a5426));
      }
    }
  }
  // Rows of thorns down each flank and along the belly's edge.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const t = 0.2 + i * 0.062;
      for (const a of [-0.4]) {
        const q = surf(F, t, a, s, 0.97);
        thorns.push(tint(spike(q, surfNormal(F, t, a, s).add(V(0, 0, 0.9)), 0.022 * (1 - i / 22), 0.006, 4), mix(BONE, 0x3a4a2a, 0.55), mix(BONE, 0x8a8a5a, 0.3), -1, 1));
      }
    }
  }
  return { blades: fuse(blades), thorns: fuse(thorns) };
}

/** Horns, brow spikes, the hanging lower jaw, teeth and the snout's tendrils. */
function head(): { bone: THREE.BufferGeometry; flesh: THREE.BufferGeometry; teeth: THREE.BufferGeometry } {
  const bone: THREE.BufferGeometry[] = [];
  const flesh: THREE.BufferGeometry[] = [];
  const teeth: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    // The great horns: from behind the brow, sweeping back and up, curling at the tip.
    const h0 = surf(F, 0.1, -1.15, s, 0.95);
    const horn = [h0, h0.clone().add(V(s * 0.02, 0.05, 0.04)), h0.clone().add(V(s * 0.04, 0.09, 0.12)), h0.clone().add(V(s * 0.05, 0.1, 0.21)), h0.clone().add(V(s * 0.05, 0.075, 0.27))];
    bone.push(tint(tube(horn, (q) => 0.017 * (1 - q * 0.92), 6, 24), mix(BONE, 0x7a6a40, 0.45), BONE, h0.y, h0.y + 0.1));
    // A smaller horn below it, and a spur on the cheek.
    const h1 = surf(F, 0.12, -0.55, s, 0.95);
    bone.push(tint(tube([h1, h1.clone().add(V(s * 0.03, 0.02, 0.05)), h1.clone().add(V(s * 0.04, 0.035, 0.11))], (q) => 0.01 * (1 - q * 0.9), 5, 12), mix(BONE, 0x7a6a40, 0.4), BONE, h1.y, h1.y + 0.03));
    const h2 = surf(F, 0.1, 0.4, s, 0.95);
    bone.push(tint(spike(h2, V(s * 0.6, -0.2, 0.8), 0.05, 0.008, 5), BONE));
    // Brow spikes over the eye.
    for (let k = 0; k < 3; k++) {
      const q = surf(F, 0.055 + k * 0.018, -0.95 - k * 0.05, s, 0.96);
      bone.push(tint(spike(q, surfNormal(F, 0.055 + k * 0.018, -0.95, s).add(V(0, 0.4, 0.8)), 0.022 + k * 0.006, 0.006, 4), BONE));
    }
    // A long kelp tendril trailing from each side of the snout, like a sea dragon's whiskers.
    const w0 = surf(F, 0.02, 0.1, s, 0.95);
    flesh.push(tint(tube([w0, w0.clone().add(V(s * 0.03, -0.01, 0.02)), w0.clone().add(V(s * 0.05, -0.05, 0.1)), w0.clone().add(V(s * 0.05, -0.1, 0.17)), w0.clone().add(V(s * 0.04, -0.12, 0.24))], (q) => 0.006 * (1 - q * 0.75), 5, 20), 0x4a7a2a, 0x9cd04a));
  }
  // The lower jaw, hanging open: a curved, dark jaw lofted like a little body, hinged under the cheek, its tip dropped.
  const J: Frame = {
    top: (t) => 0.014 * env(t, 0.5, 0.4, 0.5, 0.4),
    bot: (t) => 0.04 * env(t, 0.55, 0.45, 0.5, 0.45),
    half: (t) => 0.062 * env(t, 0.65, 0.45, 0.4, 0.6),
    cy: (t) => -0.014 * Math.sin(t * Math.PI),
  };
  const JL = 0.22;
  const hinge = V(0, -0.045, -0.5 + JL + 0.02);
  const M = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z)
    .multiply(new THREE.Matrix4().makeRotationX(-0.26))
    .multiply(new THREE.Matrix4().makeTranslation(0, 0, -JL / 2))
    .multiply(new THREE.Matrix4().makeScale(1, 1, JL));
  const jaw = bodyGeo(J, 22, 16).deleteAttribute('uv');
  tint(jaw, mix(BACK, 0x0c1a0e, 0.4), mix(BACK, BELLY, 0.18), -0.05, 0.014);
  flesh.push(jaw.applyMatrix4(M));
  const onJaw = (t: number, side: number) => V(side * J.half(t) * 0.78, J.top(t) * 0.6 + J.cy!(t), -0.5 + t).applyMatrix4(M);
  const jawUp = V(0, 1, 0.12).transformDirection(new THREE.Matrix4().makeRotationX(-0.26));
  // The dark of the open mouth between the jaws.
  flesh.push(tint(put(new THREE.SphereGeometry(1, 12, 6).deleteAttribute('uv'), [0, -0.05, -0.39], [0.14, 0, 0], [0.058, 0.026, 0.1]), 0x4a1a1e));
  // Teeth: fangs down from the upper jaw, and fangs standing up out of the lower.
  for (let k = 0; k < 7; k++) {
    for (const s of [-1, 1]) {
      const tU = 0.014 + k * 0.016;
      const up = surf(F, tU, 0.75, s, 0.98);
      teeth.push(tint(spike(up, V(s * 0.1, -1, 0.1), k === 1 || k === 4 ? 0.045 : 0.026, 0.0068, 4), 0xfaf4e0));
      if (k < 6) teeth.push(tint(spike(onJaw(0.1 + k * 0.11, s), jawUp, k === 0 || k === 3 ? 0.036 : 0.022, 0.0058, 4), 0xfaf4e0));
    }
  }
  // Nostrils flaring on the snout.
  for (const s of [-1, 1]) flesh.push(tint(put(new THREE.SphereGeometry(1, 8, 5).deleteAttribute('uv'), surf(F, 0.02, -0.7, s, 1.0), [0, s * 0.4, 0], [0.008, 0.006, 0.012]), 0x0e1a10));
  return { bone: fuse(bone), flesh: fuse(flesh), teeth: fuse(teeth) };
}

function fins(): { body: THREE.BufferGeometry; tail: THREE.BufferGeometry } {
  const c0 = mix(BACK, 0x1c3418, 0.2);
  const c1 = mix(FIN, 0xd0e870, 0.2);
  const parts: THREE.BufferGeometry[] = [];
  // Pectorals: broad kelp-leaf fins behind the head.
  const pec = finFan(10, () => [0, 0], (k) => {
    const a = -1.3 + k * 1.6;
    const len = 0.13 * (0.6 + 0.4 * Math.sin(k * Math.PI)) * (k % 0.2 < 0.1 ? 1 : 0.88);
    return [Math.cos(a) * len, Math.sin(a) * len];
  }, c0, c1, 0.015);
  for (const sx of [-1, 1]) parts.push(put(pec, surf(F, 0.19, 0.5, sx, 0.97), [0, sx * 0.7, sx * 0.35]));
  // A low ribbon of fin along the belly, like a wyrm's keel.
  parts.push(finFan(30, (k) => {
    const t = 0.35 + k * 0.6;
    return [-0.5 + t, -F.bot(t) * 0.9 + cy(t)];
  }, (k) => {
    const t = 0.35 + k * 0.6;
    return [-0.5 + t + 0.01, -F.bot(t) * 0.9 + cy(t) - 0.035 * Math.sin(k * Math.PI) ** 0.5 * (k * 30 % 2 < 1 ? 1 : 0.8)];
  }, c0, c1, 0));
  // The tail: a frond of kelp, a long leaf with a ruffled edge.
  const y0 = cy(0.97);
  const tail = blade([V(0, y0, -0.01), V(0, y0 + 0.01, 0.06), V(0, y0 + 0.02, 0.12), V(0, y0 + 0.015, 0.18), V(0, y0, 0.22)], (q) => 0.06 * Math.sin(Math.min(1, q * 1.1 + 0.08) * Math.PI) ** 0.7 + 0.004, V(0, 1, 0), 0x2e5a24, 0x9cd04a, 0.18, 2.5, 0.5);
  return { body: fuse(parts), tail };
}

let manes: ReturnType<typeof mane> | null = null;
const maneParts = () => (manes ??= mane());
let heads: ReturnType<typeof head> | null = null;
const headParts = () => (heads ??= head());
let finsMemo: ReturnType<typeof fins> | null = null;
const finParts = () => (finsMemo ??= fins());

function build(c: LegendCtx): void {
  const blades = cached('kelpwyrm:blades', () => maneParts().blades);
  const thorns = cached('kelpwyrm:thorns', () => maneParts().thorns);
  const bone = cached('kelpwyrm:bone', () => headParts().bone);
  const f = cached('kelpwyrm:fins', () => finParts().body);
  const tail = cached('kelpwyrm:tail', () => finParts().tail);
  if (c.shadow) {
    for (const g of [blades, thorns, bone, f]) add(c, g, c.finMat);
    add(c, tail, c.finMat, c.tail);
    return;
  }
  const bm = c.bodyMat as THREE.MeshPhysicalMaterial;
  bm.roughness = c.shiny ? 0.3 : 0.42;
  bm.clearcoat = 0.7;
  bm.clearcoatRoughness = 0.2;
  bm.emissiveIntensity = 1.4;
  const leaf = c.shiny ? mat('kelpwyrm:goldleaf', () => new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffe080, roughness: 0.35, metalness: 0.3, side: THREE.DoubleSide, emissive: 0x2a2408 })) : MAT.kelp();
  add(c, blades, leaf);
  add(c, thorns, MAT.hard());
  add(c, bone, mat('kelpwyrm:bone', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 })));
  add(c, f, c.shiny ? c.finMat : MAT.fin());
  add(c, tail, leaf, c.tail);
  add(c, cached('kelpwyrm:flesh', () => headParts().flesh), MAT.flesh());
  add(c, cached('kelpwyrm:teeth', () => headParts().teeth), mat('kelpwyrm:tooth', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: 0x2a281e })));
  const eyes: THREE.BufferGeometry[] = [];
  const lids: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const p = surf(F, EYE_T, EYE_A, s, 0.92);
    const out = surfNormal(F, EYE_T, EYE_A, s);
    const e = { p, out, r: 0.03, white: 0xfaf0a0, iris: c.shiny ? 0xffd040 : 0xe8e030, irisR: 0.9, pupil: 0x101808, pupilR: 0.42, look: V(0, 0, -0.3) };
    eyes.push(eyeGeo(e));
    lids.push(lidGeo(e, 0.22, 0.7, shade(c.shiny ? c.L.back : BACK, 1.15), 1.16));
  }
  add(c, cached(`kelpwyrm:eyes${c.shiny}`, () => fuse(eyes)), MAT.flatPaint());
  add(c, cached(`kelpwyrm:lids${c.shiny}`, () => fuse(lids)), MAT.flesh());
  // Kelp-light drifting round the mane.
  const moteGeo = cached('kelpwyrm:mote', () => new THREE.OctahedronGeometry(0.011, 0));
  const moteMat = mat(`kelpwyrm:mote${c.shiny}`, () => new THREE.MeshBasicMaterial({ color: c.shiny ? 0xfff0a0 : MOTE, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  const halo = mat(`kelpwyrm:halo${c.shiny}`, () => new THREE.SpriteMaterial({ map: c.glowTexture(), color: c.shiny ? 0xfff0a0 : MOTE, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  const rng = seeded('kelpwyrm:motes');
  for (let i = 0; i < 12; i++) {
    const t = 0.15 + rng() * 0.8;
    const hold = new THREE.Group();
    hold.position.set((rng() - 0.5) * 0.25, cy(t) + 0.12 + rng() * 0.22, -0.5 + t);
    hold.add(new THREE.Mesh(moteGeo, moteMat));
    const h = new THREE.Sprite(halo);
    h.scale.setScalar(0.11);
    hold.add(h);
    c.root.add(hold);
    c.twinkle.push(hold);
  }
  // Lost tackle: the stub of a harpoon in its shoulder with a trailing rope, a hook in the jaw with its snapped line,
  // and a spoon caught in the mane.
  const sh = surf(F, 0.29, -0.6, -1, 0.9);
  addTackle(c, [
    { kind: 'harpoon', p: sh, dir: surfNormal(F, 0.29, -0.6, -1).add(V(0, 0.3, -0.5)), twist: 0.4, size: 0.13, glint: true, line: { len: 0.3, drift: V(-0.2, -0.6, 1), wave: 0.02 } },
    { kind: 'hook', p: V(-0.04, -0.045, -0.47), dir: V(-0.4, -0.8, 0.3), twist: 1.2, size: 0.04, glint: true, line: { len: 0.28, drift: V(-0.2, -0.5, 1) } },
    { kind: 'spoon', p: surf(F, 0.55, -1.4, -1, 1.25), dir: V(-0.2, -1, 0.3), twist: 0.6, size: 0.04, glint: true, line: { len: 0.06, drift: V(0, 1, 0.3) } },
  ]);
}

export const kelpwyrm: Legend = {
  look: { back: BACK, belly: BELLY, fin: FIN, marks: [], extras: [] },
  body: () => cached('kelpwyrm:body', () => bodyGeo(F, 90, 24)),
  paint,
  glow: true,
  build,
};
