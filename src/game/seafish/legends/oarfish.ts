import * as THREE from 'three';
import { addTackle } from '../tackle';
import { MAT, V, add, bodyGeo, bump, cached, eyeGeo, finFan, flat, fuse, glowMat, glowSprite, lidGeo, mat, mix, put, seeded, smooth, surf, surfNormal, tint, tube, type Frame, type Legend, type LegendCtx, type PaintCtx } from './kit';

// The Moonlit Oarfish, the Twilight's sea serpent: very long and slim, in slow waves, silver with a soft moonlight
// glow round it, a long red crest plume, a crimson fin the whole length of its back, two long 'oar' streamers from
// the throat with glowing tips, and a big moon of an eye.

const BACK = 0xc4cee2;
const BELLY = 0xf2f6ff;
const FIN = 0xff3a5a;
const MOON = 0xc8dcff;
const TIP = 0xffd6e4;

/** Slow waves down the whole length, still at the head. */
const cy = (t: number) => 0.045 * Math.sin((t - 0.08) * Math.PI * 2 * 3.2) * smooth(t, 0.05, 0.22);
const thick = (t: number) => smooth(t, 0, 0.05) ** 0.5 * (1 - 0.75 * smooth(t, 0.45, 1));
const F: Frame = {
  top: (t) => 0.026 * thick(t) + 0.012 * bump(t, 0.035, 0.03),
  bot: (t) => 0.023 * thick(t) + 0.008 * bump(t, 0.04, 0.03),
  half: (t) => 0.011 * thick(t) + 0.007 * bump(t, 0.03, 0.03),
  cy,
};
/** The glow's shell: the body a little fatter. */
const SHELL: Frame = { top: (t) => F.top(t) + 0.012 * thick(t), bot: (t) => F.bot(t) + 0.012 * thick(t), half: (t) => F.half(t) + 0.012 * thick(t), cy };
const EYE_T = 0.035;
const EYE_A = -0.15;

function paint(p: PaintCtx): void {
  const { g, rng, flanks, ink } = p;
  const R = Array.from({ length: 600 }, () => rng());
  let ri = 0;
  const r = () => R[ri++ % R.length];
  flanks((P) => {
    ri = 0;
    g.save();
    if (p.glow) {
      // Moonlight on silver: a soft pale wash along the upper flank, brightest behind the head.
      g.filter = 'blur(4px)';
      for (let i = 0; i < 30; i++) {
        const v = 0.03 + i * 0.032;
        const [x, y] = P(0.06 + r() * 0.06, v);
        g.fillStyle = ink(MOON, 0.22 * (1 - v * 0.6));
        g.beginPath();
        g.ellipse(x, y, 14, 7, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      return;
    }
    // Oblique blue-grey dashes down the flank, and a darker seam under the crimson fin.
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const v = 0.06 + r() * 0.9;
      const d = -0.12 + r() * 0.26;
      const [x, y] = P(d, v);
      g.strokeStyle = ink(0x7a8aa8, 0.35 + r() * 0.25);
      g.lineWidth = 1.4 + r() * 1.2;
      g.beginPath();
      g.moveTo(x - 3, y - 1.5);
      g.lineTo(x + 3, y + 1.5);
      g.stroke();
    }
    const [x0, y0] = P(0.22, 0.03);
    const [x1, y1] = P(0.25, 1);
    g.fillStyle = ink(0x8a96b8, 0.6);
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    // A pearly sheen band along the side line.
    g.filter = 'blur(3px)';
    const [x2, y2] = P(0.02, 0.03);
    const [x3, y3] = P(-0.02, 0.95);
    g.fillStyle = ink(0xffffff, 0.35);
    g.fillRect(Math.min(x2, x3), Math.min(y2, y3), Math.abs(x3 - x2), Math.abs(y3 - y2));
    g.restore();
  });
}

function parts(): { fins: THREE.BufferGeometry; tips: THREE.BufferGeometry; at: THREE.Vector3[]; flyAt: THREE.Vector3 } {
  const fins: THREE.BufferGeometry[] = [];
  const tips: THREE.BufferGeometry[] = [];
  const at: THREE.Vector3[] = [];
  let flyAt = V(0, 0.1, -0.45);
  const rng = seeded('oarfish:parts');
  // The crimson fin the whole length of the back, rippling with the body.
  const N = 120;
  fins.push(finFan(N, (k) => {
    const t = 0.07 + k * 0.92;
    return [-0.5 + t, F.top(t) * 0.85 + cy(t)];
  }, (k) => {
    const t = 0.07 + k * 0.92;
    const i = Math.round(k * N);
    return [-0.5 + t + 0.006, F.top(t) * 0.85 + cy(t) + (0.034 * (1 - 0.6 * k)) * (i % 2 ? 0.8 : 1)];
  }, 0xd8243e, 0xff8aa2, 0));
  // The crest plume: long red rays rising from the head and sweeping back, each flying small flags.
  for (let i = 0; i < 8; i++) {
    const u = i / 7;
    const base = V(0, F.top(0.025 + u * 0.06) * 0.9 + cy(0.03), -0.5 + 0.025 + u * 0.06);
    const len = 0.32 - u * 0.15 + rng() * 0.04;
    const ang = 1.15 - u * 0.5;
    const pts: THREE.Vector3[] = [];
    for (let j = 0; j <= 6; j++) {
      const s = j / 6;
      const a = ang - s * 0.9;
      pts.push(base.clone().add(V(Math.sin(s * 3 + i) * 0.008, Math.sin(a) * len * s + 0.02 * s, Math.cos(a) * len * s * 0.9 + 0.02 * s * s)));
    }
    fins.push(tint(tube(pts, (s) => 0.0034 * (1 - s * 0.55), 4, 24), 0xc81c36, 0xff5a74));
    if (i === 2) flyAt = new THREE.CatmullRomCurve3(pts).getPoint(0.4);
    // A long streaming flag at the tip, and a smaller one partway on the front rays.
    for (const s of i < 3 ? [0.55, 1] : [1]) {
      const q = new THREE.CatmullRomCurve3(pts).getPoint(s);
      const q0 = new THREE.CatmullRomCurve3(pts).getPoint(Math.max(0, s - 0.1));
      const dir = q.clone().sub(q0).normalize();
      const sz = s < 1 ? 0.03 : 0.05;
      const g = flat([[0, 0], [sz * 0.3, sz * 0.18], [sz, sz * 0.05], [sz * 1.25, -sz * 0.04], [sz * 0.35, -sz * 0.12]]);
      fins.push(tint(put(g, q, [-Math.atan2(dir.y, dir.z), 0, 0]), 0xff3a5a, 0xff9ab0));
    }
  }
  // The oars: two long streamers from the throat, trailing back and down, each ending in a paddle with a glowing tip.
  for (const sx of [-1, 1]) {
    const root = surf(F, 0.07, 1.4, sx, 0.95);
    const pts: THREE.Vector3[] = [];
    const len = 0.48 + (sx > 0 ? 0.05 : 0);
    for (let j = 0; j <= 8; j++) {
      const s = j / 8;
      pts.push(root.clone().add(V(sx * 0.02 * s, (sx > 0 ? -0.05 : -0.1) * s - 0.025 * Math.sin(s * Math.PI * 1.5), len * s)));
    }
    fins.push(tint(tube(pts, (s) => 0.003 * (1 - s * 0.35), 4, 30), 0xd8243e, 0xff6a86));
    const end = pts[8];
    // The oar's blade: a flat paddle, broad and rounded.
    fins.push(tint(put(flat([[0, 0], [0.008, 0.012], [0.03, 0.016], [0.045, 0.008], [0.048, -0.004], [0.03, -0.014], [0.008, -0.01]]), end, [0.12, 0, 0]), 0xff4a66, TIP));
    at.push(end.clone().add(V(0, -0.004, 0.046)));
    tips.push(put(new THREE.SphereGeometry(0.009, 8, 6).deleteAttribute('uv'), at[at.length - 1]));
  }
  return { fins: fuse(fins), tips: fuse(tips), at, flyAt };
}

let memo: ReturnType<typeof parts> | null = null;
const P = () => (memo ??= parts());

function build(c: LegendCtx): void {
  const fins = cached('oarfish:fins', () => P().fins);
  if (c.shadow) {
    add(c, fins, c.finMat);
    return;
  }
  const bm = c.bodyMat as THREE.MeshPhysicalMaterial;
  // Silver: metallic, with a pearly shimmer, glowing faintly with the moon.
  bm.roughness = 0.28;
  bm.metalness = c.shiny ? 0.5 : 0.35;
  bm.clearcoat = 0.8;
  bm.iridescence = 0.5;
  bm.iridescenceIOR = 1.3;
  bm.emissiveIntensity = 1.2;
  add(c, fins, c.shiny ? c.finMat : MAT.fin());
  // The moonlight round it: a soft shell of light hugging the whole ribbon.
  add(c, cached('oarfish:shell', () => bodyGeo(SHELL, 160, 12)), glowMat(c, c.shiny ? 0xffe890 : MOON, 0.26, THREE.BackSide));
  // The oars' glowing tips.
  add(c, cached('oarfish:tips', () => P().tips), mat(`oarfish:tip${c.shiny}`, () => new THREE.MeshBasicMaterial({ color: c.shiny ? 0xfff0a0 : TIP })));
  for (const q of P().at) glowSprite(c, c.shiny ? 0xffe890 : 0xffb0c8, 0.07, 0.8, q);
  // The moon of an eye: big, silver-white, with a soft halo.
  const eyes: THREE.BufferGeometry[] = [];
  const lids: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const p = surf(F, EYE_T, EYE_A, s, 0.85);
    const out = surfNormal(F, EYE_T, EYE_A, s);
    const e = { p, out, r: 0.022, white: 0xf8faff, iris: 0xc4d6f6, irisR: 0.8, pupil: 0x1a1830, pupilR: 0.4, look: V(0, 0.05, -0.2) };
    eyes.push(eyeGeo(e));
    lids.push(lidGeo(e, 0.05, 0.2, mix(BACK, 0x8a96b8, 0.4), 1.12));
    glowSprite(c, c.shiny ? 0xffe890 : MOON, 0.075, 0.55, p.clone().addScaledVector(out, 0.012));
  }
  add(c, cached('oarfish:eyes', () => fuse(eyes)), MAT.flatPaint());
  add(c, cached('oarfish:lids', () => fuse(lids)), MAT.flesh());
  // A small mouth.
  add(c, cached('oarfish:mouth', () => tint(tube([surf(F, 0.022, 0.5, -1, 1.0), V(0, -0.012, -0.505), surf(F, 0.022, 0.5, 1, 1.0)], 0.0025, 4, 10), 0x5a4a6a)), MAT.flesh());
  // Lost tackle: a hook in the jaw with a float on its snapped line, and a fly caught in the crest.
  addTackle(c, [
    { kind: 'hook', p: surf(F, 0.018, 0.6, -1, 1.04), dir: V(-0.3, -0.8, 0.4), twist: 1.2, size: 0.028, glint: true, line: { len: 0.3, drift: V(-0.1, -0.4, 1), wave: 0.015 } },
    { kind: 'fly', p: P().flyAt, dir: V(-0.2, -0.8, 0.4), twist: -0.8, size: 0.03, glint: true },
  ]);
}

export const oarfish: Legend = {
  look: { back: BACK, belly: BELLY, fin: FIN, accent: MOON, marks: [], extras: [] },
  body: () => cached('oarfish:body', () => bodyGeo(F, 200, 14)),
  paint,
  glow: true,
  build,
};
